import type { QualityFlag, QualityIssue } from './api-types.ts';
import { ENTITY_TYPE_DEFS, parseEntityId, type EntityType } from './entity-types.ts';
import { RELATION_DEFS, isRelationAllowed, type RelationType } from './relations.ts';
import {
  ENTITY_DATA_SCHEMAS,
  contentEntitySchema,
  sourceSchema,
  type ContentEntity,
  type EntityDataMap,
  type LegalReferenceData,
  type Source,
} from './schemas.ts';

/**
 * Qualitätssicherung der zentralen Datenbasis.
 *
 * Läuft vor jedem Seeding und in CI (`npm run content:check`).
 * Fehler (severity "error") verhindern das Laden der Inhalte.
 *
 * Geprüft wird u. a.:
 *  - Schema & typspezifische Daten
 *  - doppelte Datensätze (IDs, Titel/Aliase, Hersteller-Namen, Quellen-URLs)
 *  - widersprüchliche technische Angaben (gleicher Schlüssel, andere Werte)
 *  - unbelegte Angaben (fehlende Quellen, Herstellerangaben ohne Herstellerquelle)
 *  - Rechtsinformationen mit abgelaufenem Prüfdatum
 *  - nicht funktionierende interne Verlinkungen
 */

export interface RawContentFile {
  file: string;
  json: unknown;
}

export interface LoadedEntity extends ContentEntity {
  type: EntityType;
  slug: string;
  file: string;
}

export interface LoadedRelation {
  from: string;
  rel: RelationType;
  to: string;
  note?: string;
}

export interface ContentBundle {
  entities: LoadedEntity[];
  sources: (Source & { file: string })[];
  relations: LoadedRelation[];
  flags: Map<string, QualityFlag[]>;
  issues: QualityIssue[];
}

export interface QaOptions {
  /** Stichtag für Fristprüfungen (Default: heute) */
  today?: Date;
  /** Ab wie vielen Tagen ohne Review ein Inhalt als veraltet markiert wird */
  maxReviewAgeDays?: number;
}

const WIKI_LINK = /\[\[([a-z_]+:[a-z0-9-]+)(?:\|[^\]]*)?\]\]/g;

export function extractWikiLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WIKI_LINK)) if (m[1]) out.push(m[1]);
  return out;
}

/** Normalisiert Namen für die Dublettenerkennung */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\b(gmbh|ag|se|inc|ltd|llc|co|kg|corp|corporation|company|medical|medizintechnik)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeValue(v: string | number, unit?: string): string {
  const s = typeof v === 'number' ? String(v) : v;
  return `${s.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[–—]/g, '-')}|${(unit ?? '').toLowerCase().replace(/\s+/g, '')}`;
}

/** Bigramm-Ähnlichkeit (Dice-Koeffizient) für Beinahe-Dubletten */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function formatZodIssues(err: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/** Lädt, validiert und verknüpft alle Inhaltsdateien. */
export function buildContentBundle(files: RawContentFile[], opts: QaOptions = {}): ContentBundle {
  const today = opts.today ?? new Date();
  const maxReviewAgeDays = opts.maxReviewAgeDays ?? 730;
  const issues: QualityIssue[] = [];
  const err = (code: string, message: string, extra: Partial<QualityIssue> = {}) =>
    issues.push({ severity: 'error', code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<QualityIssue> = {}) =>
    issues.push({ severity: 'warning', code, message, ...extra });
  const info = (code: string, message: string, extra: Partial<QualityIssue> = {}) =>
    issues.push({ severity: 'info', code, message, ...extra });

  const entities: LoadedEntity[] = [];
  const sources: (Source & { file: string })[] = [];
  const entityById = new Map<string, LoadedEntity>();
  const sourceById = new Map<string, Source & { file: string }>();

  // -- 1. Parsen & Schema ---------------------------------------------------
  for (const { file, json } of files) {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      err('file.invalid', 'Inhaltsdatei muss ein Objekt mit "sources" und/oder "entities" sein', { file });
      continue;
    }
    const obj = json as Record<string, unknown>;
    if (typeof obj.__parseError === 'string') {
      err('file.parse', `JSON-Syntaxfehler: ${obj.__parseError}`, { file });
      continue;
    }
    const unknownKeys = Object.keys(obj).filter((k) => !['$schema', 'sources', 'entities'].includes(k));
    if (unknownKeys.length) err('file.unknown-keys', `Unbekannte Schlüssel: ${unknownKeys.join(', ')}`, { file });

    for (const rawSource of Array.isArray(obj.sources) ? obj.sources : []) {
      const parsed = sourceSchema.safeParse(rawSource);
      if (!parsed.success) {
        err('source.schema', `Ungültige Quelle: ${formatZodIssues(parsed.error)}`, {
          file,
          sourceId: (rawSource as { id?: string })?.id,
        });
        continue;
      }
      if (sourceById.has(parsed.data.id)) {
        err('source.duplicate-id', `Quelle ${parsed.data.id} ist mehrfach definiert (auch in ${sourceById.get(parsed.data.id)!.file})`, {
          file,
          sourceId: parsed.data.id,
        });
        continue;
      }
      const s = { ...parsed.data, file };
      sourceById.set(s.id, s);
      sources.push(s);
    }

    for (const rawEntity of Array.isArray(obj.entities) ? obj.entities : []) {
      const parsed = contentEntitySchema.safeParse(rawEntity);
      const rawId = (rawEntity as { id?: string })?.id;
      if (!parsed.success) {
        err('entity.schema', `Ungültige Entität: ${formatZodIssues(parsed.error)}`, { file, entityId: rawId });
        continue;
      }
      const e = parsed.data;
      const { type, slug } = parseEntityId(e.id)!;
      const dataResult = ENTITY_DATA_SCHEMAS[type].safeParse(e.data);
      if (!dataResult.success) {
        err('entity.data-schema', `Ungültige Daten für Typ ${type}: ${formatZodIssues(dataResult.error)}`, {
          file,
          entityId: e.id,
        });
        continue;
      }
      if (entityById.has(e.id)) {
        err('entity.duplicate-id', `Entität ${e.id} ist mehrfach definiert (auch in ${entityById.get(e.id)!.file})`, {
          file,
          entityId: e.id,
        });
        continue;
      }
      const loaded: LoadedEntity = { ...e, data: dataResult.data, type, slug, file };
      entityById.set(e.id, loaded);
      entities.push(loaded);
    }
  }

  // -- 2. Doppelte Datensätze ----------------------------------------------
  const nameIndex = new Map<string, LoadedEntity>();
  for (const e of entities) {
    const names = new Set([e.title, ...e.aliases].map(normalizeName).filter((n) => n.length > 0));
    for (const n of names) {
      const key = `${e.type}|${n}`;
      const other = nameIndex.get(key);
      if (other && other.id !== e.id) {
        err('entity.duplicate-name', `Mögliche Dublette: "${e.title}" (${e.id}) und "${other.title}" (${other.id}) haben denselben Namen/Alias`, {
          entityId: e.id,
          file: e.file,
        });
      } else nameIndex.set(key, e);
    }
  }
  const byType = new Map<EntityType, LoadedEntity[]>();
  for (const e of entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  for (const [type, list] of byType) {
    if (type === 'quiz_question' || type === 'offer') continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = normalizeName(list[i]!.title);
        const b = normalizeName(list[j]!.title);
        if (a !== b && a.length > 5 && b.length > 5 && similarity(a, b) >= 0.9) {
          warn('entity.near-duplicate', `Sehr ähnliche Titel: "${list[i]!.title}" (${list[i]!.id}) / "${list[j]!.title}" (${list[j]!.id}) – bitte prüfen`, {
            entityId: list[j]!.id,
          });
        }
      }
    }
  }
  const urlIndex = new Map<string, string>();
  for (const s of sources) {
    if (!s.url) continue;
    const u = s.url.replace(/\/+$/, '').replace(/^http:/, 'https:');
    const other = urlIndex.get(u);
    if (other) err('source.duplicate-url', `Quellen ${other} und ${s.id} verweisen auf dieselbe URL`, { sourceId: s.id, file: s.file });
    else urlIndex.set(u, s.id);
  }

  // -- 3. Relationen & interne Links ---------------------------------------
  const relations: LoadedRelation[] = [];
  const relKeys = new Set<string>();
  for (const e of entities) {
    for (const l of e.links) {
      const target = entityById.get(l.to);
      if (!target) {
        err('link.broken', `Verweis auf nicht existierende Entität ${l.to} (${l.rel})`, { entityId: e.id, file: e.file });
        continue;
      }
      if (l.to === e.id) {
        err('link.self', 'Entität verweist auf sich selbst', { entityId: e.id, file: e.file });
        continue;
      }
      if (!isRelationAllowed(l.rel, e.type, target.type)) {
        err('link.not-allowed', `Relation "${l.rel}" ist von ${e.type} nach ${target.type} nicht erlaubt`, {
          entityId: e.id,
          file: e.file,
        });
        continue;
      }
      const sym = RELATION_DEFS[l.rel].symmetric;
      const key = sym ? `${l.rel}|${[e.id, l.to].sort().join('|')}` : `${l.rel}|${e.id}|${l.to}`;
      if (relKeys.has(key)) {
        if (!sym) warn('link.duplicate', `Doppelte Relation ${l.rel} → ${l.to}`, { entityId: e.id, file: e.file });
        continue;
      }
      relKeys.add(key);
      relations.push({ from: e.id, rel: l.rel, to: l.to, note: l.note });
    }

    const texts = [e.summary, e.body];
    if (e.type === 'learning_module') {
      const d = e.data as EntityDataMap['learning_module'];
      for (const s of d.sections) texts.push(s.body);
      for (const p of d.prerequisites) {
        if (!entityById.has(p)) err('link.broken', `Voraussetzung ${p} existiert nicht`, { entityId: e.id, file: e.file });
      }
    }
    if (e.type === 'fault') {
      const d = e.data as EntityDataMap['fault'];
      texts.push(...d.remedies, ...d.diagnosis.map((s) => s.instruction));
    }
    if (e.type === 'quiz_question') {
      texts.push((e.data as EntityDataMap['quiz_question']).explanation);
    }
    for (const t of texts) {
      for (const id of extractWikiLinks(t)) {
        if (!entityById.has(id)) err('link.broken-inline', `Textverweis [[${id}]] zeigt ins Leere`, { entityId: e.id, file: e.file });
      }
    }

    // typ-spezifische Referenzen
    const scene =
      e.type === 'device'
        ? (e.data as EntityDataMap['device']).scene
        : e.type === 'product_model'
          ? (e.data as EntityDataMap['product_model']).scene
          : undefined;
    if (scene) {
      const partIds = new Set<string>();
      for (const p of scene.parts) {
        if (partIds.has(p.id)) err('scene.duplicate-part', `3D-Teil ${p.id} doppelt`, { entityId: e.id, file: e.file });
        partIds.add(p.id);
        if (p.component) {
          const c = entityById.get(p.component);
          if (!c || c.type !== 'component') {
            err('link.broken', `3D-Teil ${p.id} verweist auf unbekannte Komponente ${p.component}`, { entityId: e.id, file: e.file });
          }
        }
      }
    }
    if (e.type === 'simulation') {
      for (const s of (e.data as EntityDataMap['simulation']).scenarios) {
        if (s.fault && entityById.get(s.fault)?.type !== 'fault') {
          err('link.broken', `Szenario ${s.id} verweist auf unbekanntes Fehlerbild ${s.fault}`, { entityId: e.id, file: e.file });
        }
      }
    }
    if (e.type === 'legal_reference') {
      const d = e.data as LegalReferenceData;
      if (d.supersededBy && entityById.get(d.supersededBy)?.type !== 'legal_reference') {
        err('link.broken', `supersededBy verweist auf unbekannte Rechtsgrundlage ${d.supersededBy}`, { entityId: e.id, file: e.file });
      }
    }
  }

  // Verwaiste Inhalte (keine einzige Verknüpfung)
  const connected = new Set<string>();
  for (const r of relations) {
    connected.add(r.from);
    connected.add(r.to);
  }
  for (const e of entities) {
    if (!connected.has(e.id)) warn('entity.orphan', `"${e.title}" ist mit keinem anderen Inhalt verknüpft`, { entityId: e.id, file: e.file });
  }

  // -- 4. Quellen & Belege --------------------------------------------------
  const usedSources = new Set<string>();
  for (const e of entities) {
    for (const s of e.sources) {
      usedSources.add(s);
      if (!sourceById.has(s)) err('source.missing', `Quelle ${s} ist nicht definiert`, { entityId: e.id, file: e.file });
    }
    for (const spec of e.specs) {
      usedSources.add(spec.source);
      if (!sourceById.has(spec.source)) err('source.missing', `Quelle ${spec.source} (Spezifikation ${spec.key}) ist nicht definiert`, { entityId: e.id, file: e.file });
    }
    const def = ENTITY_TYPE_DEFS[e.type];
    const allSources = new Set([...e.sources, ...e.specs.map((s) => s.source)]);
    if (def.requiresSource && allSources.size === 0 && !e.demo) {
      err('source.required', `${def.label} "${e.title}" hat keine Quelle – unbelegte Inhalte sind nicht zulässig`, { entityId: e.id, file: e.file });
    }
    // Herstellerangaben: reale Hersteller/Modelle/Teile brauchen Hersteller- oder Behördenquelle
    if (!e.demo && (e.type === 'manufacturer' || e.type === 'product_model' || e.type === 'spare_part')) {
      const kinds = [...allSources].map((id) => sourceById.get(id)?.kind);
      if (!kinds.some((k) => k === 'hersteller' || k === 'behoerde')) {
        err('source.manufacturer-claim', `Herstellerangaben zu "${e.title}" sind nicht durch eine Hersteller- oder Behördenquelle belegt`, {
          entityId: e.id,
          file: e.file,
        });
      }
    }
    // Demo-Modelle dürfen keinem realen Hersteller zugeschrieben werden
    if (e.demo && (e.type === 'product_model' || e.type === 'spare_part' || e.type === 'component')) {
      for (const l of e.links) {
        const t = entityById.get(l.to);
        if (l.rel === 'manufactured_by' && t && !t.demo) {
          err('demo.real-manufacturer', `Fiktives Produkt "${e.title}" ist dem realen Hersteller "${t.title}" zugeordnet`, {
            entityId: e.id,
            file: e.file,
          });
        }
      }
    }
    if (e.type === 'offer' && !e.demo) {
      err('demo.offer', 'Marktplatz-Angebote sind in dieser Ausbaustufe Demo-Daten und müssen demo: true tragen', { entityId: e.id, file: e.file });
    }
  }
  for (const s of sources) {
    if (!usedSources.has(s.id)) info('source.unused', `Quelle ${s.id} wird nirgends verwendet`, { sourceId: s.id, file: s.file });
  }

  // -- 5. Widersprüchliche technische Angaben ------------------------------
  const flags = new Map<string, QualityFlag[]>();
  const addFlag = (id: string, f: QualityFlag) => flags.set(id, [...(flags.get(id) ?? []), f]);

  for (const e of entities) {
    const groups = new Map<string, typeof e.specs>();
    for (const s of e.specs) {
      const k = `${s.key}|${(s.condition ?? '').toLowerCase().trim()}`;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    for (const list of groups.values()) {
      const values = new Set(list.map((s) => normalizeValue(s.value, s.unit)));
      if (values.size > 1) {
        const desc = list.map((s) => `${s.value}${s.unit ? ' ' + s.unit : ''} (${s.source})`).join(' vs. ');
        err('spec.contradiction', `Widersprüchliche Angaben für "${list[0]!.label}": ${desc}`, { entityId: e.id, file: e.file });
        addFlag(e.id, { kind: 'contradiction', key: list[0]!.key, message: `Widersprüchliche Angaben zu „${list[0]!.label}“` });
      }
    }
  }

  // -- 6. Aktualität & Rechtsstand -----------------------------------------
  for (const e of entities) {
    if (e.demo) addFlag(e.id, { kind: 'demo', message: 'Demo-Inhalt – fiktive Daten zur Veranschaulichung, keine realen Herstellerangaben.' });
    if (e.review.status === 'entwurf') addFlag(e.id, { kind: 'draft', message: 'Entwurf – noch nicht fachlich geprüft.' });
    const reviewed = new Date(`${e.review.reviewedAt}T00:00:00Z`);
    if (reviewed.getTime() > today.getTime() + 86_400_000) {
      err('review.future', `Prüfdatum ${e.review.reviewedAt} liegt in der Zukunft`, { entityId: e.id, file: e.file });
    }
    if (e.review.status === 'veraltet' || daysBetween(reviewed, today) > maxReviewAgeDays) {
      addFlag(e.id, { kind: 'outdated', message: `Inhalt zuletzt am ${e.review.reviewedAt} geprüft – möglicherweise nicht mehr aktuell.` });
      if (e.review.status !== 'veraltet') {
        warn('review.stale', `Letzte fachliche Prüfung vor mehr als ${maxReviewAgeDays} Tagen (${e.review.reviewedAt})`, { entityId: e.id, file: e.file });
      }
    }
    if (e.type === 'legal_reference') {
      const d = e.data as LegalReferenceData;
      const verified = new Date(`${d.verifiedAt}T00:00:00Z`);
      const due = new Date(verified.getTime() + d.reviewIntervalDays * 86_400_000);
      if (verified.getTime() > today.getTime() + 86_400_000) {
        err('legal.future', `verifiedAt ${d.verifiedAt} liegt in der Zukunft`, { entityId: e.id, file: e.file });
      }
      if (due.getTime() < today.getTime()) {
        const since = due.toISOString().slice(0, 10);
        addFlag(e.id, {
          kind: 'legal-review-due',
          since,
          message: `Rechtsstand zuletzt am ${d.verifiedAt} geprüft – Überprüfung seit ${since} fällig. Bitte Primärquelle beachten.`,
        });
        warn('legal.review-due', `Rechtsstand von "${e.title}" seit ${since} nicht mehr überprüft`, { entityId: e.id, file: e.file });
      }
      if (d.status === 'ersetzt' || d.status === 'aufgehoben') {
        const by = d.supersededBy ? entityById.get(d.supersededBy) : undefined;
        addFlag(e.id, {
          kind: 'superseded',
          by: d.supersededBy,
          message: d.status === 'ersetzt' ? `Ersetzt${by ? ` durch ${by.title}` : ''} – nicht mehr anwenden.` : 'Aufgehoben – nicht mehr anwenden.',
        });
        if (d.status === 'ersetzt' && !d.supersededBy) {
          warn('legal.superseded-missing', `"${e.title}" ist als ersetzt markiert, aber ohne Nachfolger`, { entityId: e.id, file: e.file });
        }
      }
    }
  }
  // Kennzeichnung propagieren: Inhalte, die auf einer fälligen/ersetzten Rechtsgrundlage beruhen
  for (const r of relations) {
    if (r.rel !== 'based_on') continue;
    const legalFlags = (flags.get(r.to) ?? []).filter((f) => f.kind === 'legal-review-due' || f.kind === 'superseded');
    const legal = entityById.get(r.to)!;
    for (const f of legalFlags) {
      const from = entityById.get(r.from)!;
      if (f.kind === 'superseded') {
        warn('legal.based-on-superseded', `"${from.title}" beruht auf nicht mehr gültiger Rechtsgrundlage "${legal.title}"`, { entityId: r.from, file: from.file });
      }
      addFlag(r.from, {
        ...f,
        message: `Rechtsgrundlage „${legal.title}“: ${f.message}`,
      } as QualityFlag);
    }
  }

  return { entities, sources, relations, flags, issues };
}

export function summarizeIssues(issues: QualityIssue[]) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
