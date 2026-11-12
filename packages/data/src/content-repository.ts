import {
  ENTITY_TYPE_DEFS,
  ENTITY_TYPES,
  extractWikiLinks,
  RELATION_DEFS,
  type EntityDetail,
  type EntitySummary,
  type EntityType,
  type ListResponse,
  type ModuleId,
  type QualityFlag,
  type QualityReport,
  type RelationGroup,
  type RelationType,
  type ReviewStatus,
  type SearchHit,
  type SearchResponse,
  type SourceKind,
  type SourceRef,
  type SpecRow,
} from '@medtech/core';
import type { Database } from './database.ts';

interface EntityRow {
  id: string;
  type: EntityType;
  slug: string;
  title: string;
  aliases: string;
  summary: string;
  body: string;
  tags: string;
  data: string;
  demo: number;
  review_status: ReviewStatus;
  reviewed_at: string;
  reviewer: string | null;
  flags: string;
}

interface SourceRow {
  id: string;
  title: string;
  publisher: string;
  kind: SourceKind;
  url: string | null;
  edition: string | null;
  accessed_at: string;
}

export interface ReadOptions {
  /** Entwürfe einbeziehen (nur Redaktion) */
  includeDrafts?: boolean;
}

export interface ListOptions extends ReadOptions {
  type?: EntityType;
  types?: EntityType[];
  tag?: string;
  /** Nur Entitäten, die mit dieser Entität (in beliebiger Richtung) verknüpft sind */
  relatedTo?: string;
  rel?: RelationType;
  limit?: number;
  offset?: number;
}

const SUMMARY_COLS = 'e.id, e.type, e.slug, e.title, e.summary, e.tags, e.demo, e.review_status, e.flags';

/** Gewichtung der Inhaltstypen in der globalen Suche (Grundlagen vor Detailinhalten) */
const TYPE_WEIGHT: Partial<Record<EntityType, number>> = {
  term: 1.25,
  device: 1.25,
  learning_module: 1.1,
  fault: 1.1,
  test_procedure: 1.1,
  legal_reference: 1.05,
  quiz_question: 0.6,
  offer: 0.7,
  media: 0.7,
};

function toSourceRef(r: SourceRow): SourceRef {
  return {
    id: r.id,
    title: r.title,
    publisher: r.publisher,
    kind: r.kind,
    url: r.url ?? undefined,
    edition: r.edition ?? undefined,
    accessedAt: r.accessed_at,
  };
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Lesender Zugriff auf die zentrale Wissensbasis – von allen Modulen genutzt.
 */
export class ContentRepository {
  constructor(private readonly db: Database) {}

  private draftFilter(opts: ReadOptions, alias = 'e'): string {
    return opts.includeDrafts ? '1=1' : `${alias}.review_status != 'entwurf'`;
  }

  private thumbnails(ids: string[], opts: ReadOptions = {}): Map<string, string> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const rows = this.db
      .prepare(
        `SELECT r.to_id AS target, m.data AS data FROM relations r
         JOIN entities m ON m.id = r.from_id AND m.type = 'media'
         WHERE r.rel = 'illustrates' AND r.to_id IN (SELECT value FROM json_each(?)) AND ${this.draftFilter(opts, 'm')}
         ORDER BY m.slug`,
      )
      .all(JSON.stringify(ids)) as Array<{ target: string; data: string }>;
    for (const r of rows) {
      if (out.has(r.target)) continue;
      const d = JSON.parse(r.data) as { svg?: string; url?: string };
      const url = d.svg ? svgDataUrl(d.svg) : d.url;
      if (url) out.set(r.target, url);
    }
    // Medien selbst zeigen sich selbst als Vorschaubild
    const media = this.db
      .prepare(`SELECT e.id, e.data FROM entities e WHERE e.type = 'media' AND e.id IN (SELECT value FROM json_each(?)) AND ${this.draftFilter(opts)}`)
      .all(JSON.stringify(ids)) as Array<{ id: string; data: string }>;
    for (const m of media) {
      const d = JSON.parse(m.data) as { svg?: string; url?: string };
      const url = d.svg ? svgDataUrl(d.svg) : d.url;
      if (url) out.set(m.id, url);
    }
    return out;
  }

  toSummaries(rows: Array<Pick<EntityRow, 'id' | 'type' | 'slug' | 'title' | 'summary' | 'tags' | 'demo' | 'review_status' | 'flags'>>, opts: ReadOptions = {}): EntitySummary[] {
    const thumbs = this.thumbnails(rows.map((r) => r.id), opts);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      tags: JSON.parse(r.tags) as string[],
      demo: r.demo === 1,
      reviewStatus: r.review_status,
      flags: JSON.parse(r.flags) as QualityFlag[],
      thumbnail: thumbs.get(r.id),
    }));
  }

  /** Kurzinfos zu beliebigen IDs (unbekannte IDs werden ausgelassen). */
  summariesByIds(ids: string[], opts: ReadOptions = {}): Map<string, EntitySummary> {
    if (ids.length === 0) return new Map();
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLS} FROM entities e WHERE e.id IN (SELECT value FROM json_each(?)) AND ${this.draftFilter(opts)}`)
      .all(JSON.stringify([...new Set(ids)])) as unknown as EntityRow[];
    return new Map(this.toSummaries(rows, opts).map((s) => [s.id, s]));
  }

  exists(id: string, opts: ReadOptions = {}): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM entities e WHERE e.id = ? AND ${this.draftFilter(opts)}`).get(id));
  }

  list(opts: ListOptions = {}): ListResponse<EntitySummary> {
    const where: string[] = [this.draftFilter(opts)];
    const params: Array<string | number> = [];
    const types = opts.types ?? (opts.type ? [opts.type] : undefined);
    if (types?.length) {
      where.push(`e.type IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(types));
    }
    if (opts.tag) {
      where.push(`EXISTS (SELECT 1 FROM json_each(e.tags) t WHERE lower(t.value) = lower(?))`);
      params.push(opts.tag);
    }
    if (opts.relatedTo) {
      // Nicht sichtbare (z. B. Entwurfs-)Bezugsentitäten verraten weder Existenz noch Verknüpfungen
      if (!this.exists(opts.relatedTo, opts)) return { items: [], total: 0 };
      const relCond = opts.rel ? 'AND r.rel = ?' : '';
      where.push(`(EXISTS (SELECT 1 FROM relations r WHERE r.from_id = ? AND r.to_id = e.id ${relCond})
                OR EXISTS (SELECT 1 FROM relations r WHERE r.to_id = ? AND r.from_id = e.id ${relCond}))`);
      if (opts.rel) params.push(opts.relatedTo, opts.rel, opts.relatedTo, opts.rel);
      else params.push(opts.relatedTo, opts.relatedTo);
    }
    const whereSql = where.join(' AND ');
    const total = (this.db.prepare(`SELECT count(*) AS n FROM entities e WHERE ${whereSql}`).get(...params) as { n: number }).n;
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows = this.db
      .prepare(`SELECT ${SUMMARY_COLS} FROM entities e WHERE ${whereSql} ORDER BY e.title COLLATE NOCASE LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as EntityRow[];
    return { items: this.toSummaries(rows, opts), total };
  }

  get<TData = unknown>(id: string, opts: ReadOptions = {}): EntityDetail<TData> | null {
    const row = this.db.prepare(`SELECT * FROM entities e WHERE e.id = ? AND ${this.draftFilter(opts)}`).get(id) as EntityRow | undefined;
    if (!row) return null;
    const [summary] = this.toSummaries([row], opts);

    const specs = (
      this.db
        .prepare(
          `SELECT s.*, src.id AS src_id, src.title AS src_title, src.publisher, src.kind, src.url, src.edition, src.accessed_at
           FROM specs s JOIN sources src ON src.id = s.source_id WHERE s.entity_id = ? ORDER BY s.ord`,
        )
        .all(id) as Array<Record<string, string | number | null>>
    ).map(
      (r): SpecRow => ({
        key: String(r.key),
        label: String(r.label),
        value: r.value_num ?? String(r.value),
        unit: (r.unit as string) ?? undefined,
        condition: (r.condition as string) ?? undefined,
        note: (r.note as string) ?? undefined,
        source: toSourceRef({
          id: String(r.src_id),
          title: String(r.src_title),
          publisher: String(r.publisher),
          kind: r.kind as SourceKind,
          url: (r.url as string) ?? null,
          edition: (r.edition as string) ?? null,
          accessed_at: String(r.accessed_at),
        }),
      }),
    );

    const sources = (
      this.db
        .prepare(
          `SELECT src.* FROM entity_sources es JOIN sources src ON src.id = es.source_id WHERE es.entity_id = ? ORDER BY src.kind, src.title`,
        )
        .all(id) as unknown as SourceRow[]
    ).map(toSourceRef);

    return {
      ...summary!,
      aliases: JSON.parse(row.aliases) as string[],
      body: row.body,
      data: JSON.parse(row.data) as TData,
      specs,
      sources,
      relations: this.relationGroups(id, opts),
      reviewedAt: row.reviewed_at,
      reviewer: row.reviewer ?? undefined,
      modules: this.modulesFor(row.type, id, opts),
      linkedTitles: Object.fromEntries(
        [...this.summariesByIds(extractWikiLinks(`${row.body}\n${row.data}`), opts).values()].map((s) => [s.id, s.title]),
      ),
    };
  }

  /** Alle Verknüpfungen einer Entität, gruppiert nach Relation & Richtung. */
  relationGroups(id: string, opts: ReadOptions = {}): RelationGroup[] {
    const rows = this.db
      .prepare(
        `SELECT 'out' AS direction, r.rel, r.note, ${SUMMARY_COLS}
           FROM relations r JOIN entities e ON e.id = r.to_id
          WHERE r.from_id = ? AND ${this.draftFilter(opts)}
         UNION ALL
         SELECT 'in' AS direction, r.rel, r.note, ${SUMMARY_COLS}
           FROM relations r JOIN entities e ON e.id = r.from_id
          WHERE r.to_id = ? AND ${this.draftFilter(opts)}`,
      )
      .all(id, id) as unknown as Array<EntityRow & { direction: 'out' | 'in'; rel: RelationType; note: string | null }>;

    const summaries = new Map(this.toSummaries(rows, opts).map((s) => [s.id, s]));
    const groups = new Map<string, RelationGroup>();
    for (const r of rows) {
      const def = RELATION_DEFS[r.rel];
      if (!def) continue;
      const direction = def.symmetric ? 'out' : r.direction;
      const key = `${r.rel}|${direction}`;
      let g = groups.get(key);
      if (!g) {
        g = { rel: r.rel, direction, label: direction === 'out' ? def.label : def.inverseLabel, items: [] };
        groups.set(key, g);
      }
      if (g.items.some((i) => i.id === r.id)) continue;
      g.items.push({ ...summaries.get(r.id)!, note: r.note ?? undefined });
    }
    for (const g of groups.values()) g.items.sort((a, b) => a.title.localeCompare(b.title, 'de'));
    return [...groups.values()];
  }

  /** In welchen Modulen spielt diese Entität eine Rolle? */
  modulesFor(type: EntityType, id: string, opts: ReadOptions = {}): ModuleId[] {
    const def = ENTITY_TYPE_DEFS[type];
    const mods = new Set<ModuleId>([def.homeModule, ...def.alsoIn]);
    const rels = this.db
      .prepare(`SELECT DISTINCT e.type FROM relations r JOIN entities e ON e.id = CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END
                WHERE (r.from_id = ? OR r.to_id = ?) AND ${this.draftFilter(opts)}`)
      .all(id, id, id) as Array<{ type: EntityType }>;
    const types = new Set(rels.map((r) => r.type));
    if (types.has('simulation')) mods.add('simulator');
    if (types.has('fault')) mods.add('repair');
    if (types.has('offer') || types.has('spare_part')) mods.add('market');
    if (types.has('learning_module') || types.has('quiz_question') || types.has('test_procedure')) mods.add('academy');
    if (types.has('job_profile')) mods.add('career');
    if (type === 'device' || type === 'product_model') {
      const row = this.db.prepare(`SELECT json_extract(data, '$.scene') IS NOT NULL AS has FROM entities WHERE id = ?`).get(id) as { has: number } | undefined;
      if (!row?.has) mods.delete('explorer');
    }
    mods.add('copilot');
    return [...mods];
  }

  /** Volltextsuche über alle Module hinweg (eine Suche für die gesamte Plattform). */
  search(query: string, opts: ReadOptions & { types?: EntityType[]; module?: ModuleId; limit?: number } = {}): SearchResponse {
    const tokens = tokenize(query);
    const empty: SearchResponse = { query, total: 0, hits: [], byModule: {}, byType: {} };
    if (tokens.length === 0) return empty;

    const run = (match: string) =>
      this.db
        .prepare(
          `SELECT ${SUMMARY_COLS}, e.aliases,
                  bm25(search_index, 0, 10.0, 8.0, 5.0, 3.0, 1.0) AS rank,
                  snippet(search_index, -1, '«', '»', '…', 14) AS snip
             FROM search_index JOIN entities e ON e.id = search_index.entity_id
            WHERE search_index MATCH ? AND ${this.draftFilter(opts)}
            ORDER BY rank LIMIT 400`,
        )
        .all(match) as unknown as Array<EntityRow & { rank: number; snip: string }>;

    const strict = tokens.map((t) => `"${t}"*`).join(' AND ');
    let rows = run(strict);
    if (rows.length === 0 && tokens.length > 1) rows = run(tokens.map((t) => `"${t}"*`).join(' OR '));

    // exakte Titel-/Alias-Treffer nach oben
    const q = query.normalize('NFKC').trim().toLowerCase();
    const summaries = new Map(this.toSummaries(rows, opts).map((s) => [s.id, s]));
    let hits: SearchHit[] = rows.map((r, i) => {
      const def = ENTITY_TYPE_DEFS[r.type];
      const title = r.title.normalize('NFKC').toLowerCase();
      const aliases = (JSON.parse(r.aliases ?? '[]') as string[]).map((a) => a.normalize('NFKC').toLowerCase());
      // Relevanz: Position im BM25-Ranking + Bonus für exakte Titel/Alias-Treffer + Gewicht des Inhaltstyps
      let score = 100 - (i / Math.max(rows.length, 1)) * 50;
      if (title === q || aliases.includes(q)) score += 60;
      else if (title.startsWith(q) || aliases.some((a) => a.startsWith(q))) score += 30;
      else if (title.includes(q)) score += 15;
      score *= TYPE_WEIGHT[r.type] ?? 1;
      return {
        ...summaries.get(r.id)!,
        module: def.homeModule,
        snippet: r.snip,
        score: Math.round(score * 10) / 10,
      };
    });
    if (opts.types?.length) hits = hits.filter((h) => opts.types!.includes(h.type));
    if (opts.module) {
      hits = hits.filter((h) => {
        const def = ENTITY_TYPE_DEFS[h.type];
        return def.homeModule === opts.module || def.alsoIn.includes(opts.module!);
      });
    }
    hits.sort((a, b) => b.score - a.score);

    const byModule: SearchResponse['byModule'] = {};
    const byType: SearchResponse['byType'] = {};
    for (const h of hits) {
      byModule[h.module] = (byModule[h.module] ?? 0) + 1;
      byType[h.type] = (byType[h.type] ?? 0) + 1;
    }
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);
    return { query, total: hits.length, hits: hits.slice(0, limit), byModule, byType };
  }

  typeCounts(opts: ReadOptions = {}): Record<EntityType, number> {
    const rows = this.db
      .prepare(`SELECT type, count(*) AS n FROM entities e WHERE ${this.draftFilter(opts)} GROUP BY type`)
      .all() as Array<{ type: EntityType; n: number }>;
    const out = Object.fromEntries(ENTITY_TYPES.map((t) => [t, 0])) as Record<EntityType, number>;
    for (const r of rows) out[r.type] = r.n;
    return out;
  }

  qualityReport(): QualityReport | null {
    const row = this.db.prepare(`SELECT value FROM content_meta WHERE key = 'quality_report'`).get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as QualityReport) : null;
  }

  sources(): SourceRef[] {
    return (this.db.prepare('SELECT * FROM sources ORDER BY kind, title').all() as unknown as SourceRow[]).map(toSourceRef);
  }

  /** Alle Entitäten, die eine bestimmte Quelle verwenden */
  entitiesUsingSource(sourceId: string, opts: ReadOptions = {}): EntitySummary[] {
    const rows = this.db
      .prepare(
        `SELECT ${SUMMARY_COLS} FROM entity_sources es JOIN entities e ON e.id = es.entity_id
         WHERE es.source_id = ? AND ${this.draftFilter(opts)} ORDER BY e.title`,
      )
      .all(sourceId) as unknown as EntityRow[];
    return this.toSummaries(rows, opts);
  }
}

/** Zerlegt eine Suchanfrage in FTS5-sichere Tokens. */
export function tokenize(query: string): string[] {
  return (
    query
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((t) => t.length >= 1)
      .slice(0, 8) ?? []
  );
}
