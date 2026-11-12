import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildContentBundle, summarizeIssues, type ContentBundle, type QaOptions, type RawContentFile, type QualityReport } from '@medtech/core';
import { transaction, type Database } from './database.ts';

/** Liest alle *.json-Dateien unterhalb des Content-Verzeichnisses. */
export function readContentDir(dir: string): RawContentFile[] {
  const out: RawContentFile[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json') && !name.endsWith('.schema.json')) {
        const file = relative(dir, p).split(sep).join('/');
        try {
          out.push({ file, json: JSON.parse(readFileSync(p, 'utf8')) });
        } catch (e) {
          out.push({ file, json: { __parseError: (e as Error).message } });
        }
      }
    }
  };
  walk(dir);
  return out;
}

/** Text, der zusätzlich in den Suchindex fließt (alle Zeichenketten aus data, ohne SVG). */
export function collectSearchText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === 'string') return value.startsWith('<svg') ? [] : [value];
  if (typeof value === 'number') return [];
  if (Array.isArray(value)) return value.flatMap((v) => collectSearchText(v, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      ['color', 'id', 'shape', 'svg', 'url', 'website', 'engine', 'correct', 'explanation'].includes(k) ? [] : collectSearchText(v, depth + 1),
    );
  }
  return [];
}

export class ContentValidationError extends Error {
  constructor(public readonly bundle: ContentBundle) {
    const s = summarizeIssues(bundle.issues);
    super(`Inhalte enthalten ${s.errors} Fehler – Seeding abgebrochen. Details: npm run content:check`);
  }
}

export interface SeedResult {
  bundle: ContentBundle;
  report: QualityReport;
}

/**
 * Baut den Inhaltsbereich der Datenbank vollständig aus den Inhaltsdateien neu auf.
 * Nutzerdaten bleiben unberührt.
 */
export function seedContent(db: Database, files: RawContentFile[], opts: QaOptions & { allowErrors?: boolean } = {}): SeedResult {
  const bundle = buildContentBundle(files, opts);
  const { errors } = summarizeIssues(bundle.issues);
  if (errors > 0 && !opts.allowErrors) throw new ContentValidationError(bundle);

  const report: QualityReport = {
    generatedAt: (opts.today ?? new Date()).toISOString(),
    counts: {
      entities: bundle.entities.length,
      sources: bundle.sources.length,
      relations: bundle.relations.length,
      specs: bundle.entities.reduce((n, e) => n + e.specs.length, 0),
    },
    issues: bundle.issues,
  };

  transaction(db, () => {
    db.exec('DELETE FROM search_index; DELETE FROM specs; DELETE FROM entity_sources; DELETE FROM relations; DELETE FROM entities; DELETE FROM sources;');

    const insSource = db.prepare(
      'INSERT INTO sources (id, title, publisher, kind, url, edition, isbn, accessed_at, note) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    for (const s of bundle.sources) {
      insSource.run(s.id, s.title, s.publisher, s.kind, s.url ?? null, s.edition ?? null, s.isbn ?? null, s.accessedAt, s.note ?? null);
    }
    const knownSources = new Set(bundle.sources.map((s) => s.id));

    const insEntity = db.prepare(`INSERT INTO entities
      (id, type, slug, title, aliases, summary, body, tags, data, demo, review_status, reviewed_at, reviewer, flags, file)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insEntitySource = db.prepare('INSERT OR IGNORE INTO entity_sources (entity_id, source_id) VALUES (?, ?)');
    const insSpec = db.prepare(
      'INSERT INTO specs (entity_id, ord, key, label, value, value_num, unit, condition, note, source_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    const insSearch = db.prepare('INSERT INTO search_index (entity_id, title, aliases, tags, summary, body) VALUES (?,?,?,?,?,?)');

    const titles = new Map(bundle.entities.map((e) => [e.id, e.title]));
    /** Markdown & Wiki-Links für den Suchindex in Klartext umwandeln */
    const plain = (t: string) =>
      t
        .replace(/\[\[([a-z_]+:[a-z0-9-]+)\|([^\]]*)\]\]/g, '$2')
        .replace(/\[\[([a-z_]+:[a-z0-9-]+)\]\]/g, (_m, id: string) => titles.get(id) ?? '')
        .replace(/[*`]+/g, '')
        .replace(/[#_>]+/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ([.,;:!?)])/g, '$1');

    for (const e of bundle.entities) {
      insEntity.run(
        e.id,
        e.type,
        e.slug,
        e.title,
        JSON.stringify(e.aliases),
        e.summary,
        e.body,
        JSON.stringify(e.tags),
        JSON.stringify(e.data ?? {}),
        e.demo ? 1 : 0,
        e.review.status,
        e.review.reviewedAt,
        e.review.reviewer ?? null,
        JSON.stringify(bundle.flags.get(e.id) ?? []),
        e.file,
      );
      for (const s of e.sources) if (knownSources.has(s)) insEntitySource.run(e.id, s);
      e.specs.forEach((s, i) => {
        if (!knownSources.has(s.source)) return;
        insEntitySource.run(e.id, s.source);
        const num = typeof s.value === 'number' ? s.value : null;
        insSpec.run(e.id, i, s.key, s.label, String(s.value), num, s.unit ?? null, s.condition ?? null, s.note ?? null, s.source);
      });
      const extra = [
        plain(e.body),
        ...collectSearchText(e.data),
        ...e.specs.map((s) => `${s.label} ${s.value} ${s.unit ?? ''} ${s.condition ?? ''}`),
      ].join('\n');
      const n = (t: string) => plain(t).normalize('NFKC');
      insSearch.run(e.id, n(e.title), n(e.aliases.join(' ')), n(e.tags.join(' ')), n(e.summary), n(extra));
    }

    const insRel = db.prepare('INSERT OR IGNORE INTO relations (from_id, rel, to_id, note) VALUES (?,?,?,?)');
    for (const r of bundle.relations) insRel.run(r.from, r.rel, r.to, r.note ?? null);

    const setMeta = db.prepare('INSERT OR REPLACE INTO content_meta (key, value) VALUES (?, ?)');
    setMeta.run('quality_report', JSON.stringify(report));
    setMeta.run('seeded_at', report.generatedAt);
  });

  return { bundle, report };
}

export function seedFromDirectory(db: Database, dir: string, opts: QaOptions & { allowErrors?: boolean } = {}): SeedResult {
  return seedContent(db, readContentDir(dir), opts);
}

/** Menschenlesbare Ausgabe der Qualitätsprobleme (CLI) */
export function summarizeIssuesText(issues: ContentBundle['issues'], max = Infinity): string {
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const icon = { error: '✖', warning: '⚠', info: 'ℹ' } as const;
  const lines = sorted.slice(0, max).map((i) => {
    const where = [i.file, i.entityId ?? i.sourceId].filter(Boolean).join(' › ');
    return `${icon[i.severity]} [${i.code}] ${where ? where + ': ' : ''}${i.message}`;
  });
  if (sorted.length > max) lines.push(`… und ${sorted.length - max} weitere`);
  return lines.join('\n');
}
