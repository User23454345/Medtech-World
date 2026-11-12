import type { EntityDetail, EntitySummary, EntityType, FaultData, RelationGroup } from '@medtech/core';

/** Reine Hilfslogik des Repair Labs (Filter, Gruppierung, Kennzeichnung). */

export type Severity = FaultData['severity'];
export type Likelihood = FaultData['causes'][number]['likelihood'];

export const SEVERITIES: Severity[] = ['kritisch', 'hoch', 'mittel', 'niedrig'];

export const SEVERITY_META: Record<Severity, { label: string; tone: 'danger' | 'warn' | 'info' | 'ok'; rank: number }> = {
  kritisch: { label: 'Kritisch', tone: 'danger', rank: 4 },
  hoch: { label: 'Hoch', tone: 'danger', rank: 3 },
  mittel: { label: 'Mittel', tone: 'warn', rank: 2 },
  niedrig: { label: 'Niedrig', tone: 'info', rank: 1 },
};

export const LIKELIHOOD_META: Record<Likelihood, { label: string; percent: number; rank: number }> = {
  haeufig: { label: 'häufig', percent: 90, rank: 3 },
  gelegentlich: { label: 'gelegentlich', percent: 55, rank: 2 },
  selten: { label: 'selten', percent: 20, rank: 1 },
};

export const HARDWARE_TYPES: EntityType[] = ['device', 'product_model', 'component'];

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as string[]).includes(v);
}

/** Ursachen absteigend nach Wahrscheinlichkeit (stabil) */
export function sortCauses<T extends { likelihood: Likelihood }>(causes: readonly T[]): T[] {
  return causes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => LIKELIHOOD_META[b.c.likelihood].rank - LIKELIHOOD_META[a.c.likelihood].rank || a.i - b.i)
    .map((x) => x.c);
}

/** Relationseinträge eines Typs/einer Richtung */
export function relationItems(groups: readonly RelationGroup[], rel: RelationGroup['rel'], direction: RelationGroup['direction'], types?: readonly EntityType[]): EntitySummary[] {
  return groups
    .filter((g) => g.rel === rel && g.direction === direction)
    .flatMap((g) => g.items)
    .filter((e) => !types || types.includes(e.type));
}

/** Kompakte Sicht auf ein Fehlerbild für Listen und Filter */
export interface FaultInfo {
  summary: EntitySummary;
  data: FaultData;
  affected: EntitySummary[];
}

export function toFaultInfo(detail: EntityDetail<FaultData>): FaultInfo {
  const { aliases: _a, body: _b, data, specs: _s, sources: _src, relations, reviewedAt: _r, reviewer: _rv, modules: _m, linkedTitles: _l, ...summary } = detail;
  return { summary, data, affected: relationItems(relations, 'affects', 'out', HARDWARE_TYPES) };
}

export interface FaultFilter {
  q?: string;
  severity?: Severity | '';
  /** Entitäts-ID eines betroffenen Geräts/Modells/Bauteils */
  device?: string;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080));

/** Volltextfilter über Titel, Zusammenfassung, Tags, Symptome, Ursachen und betroffene Geräte */
export function matchesQuery(f: FaultInfo, q: string): boolean {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = norm(
    [f.summary.title, f.summary.summary, ...f.summary.tags, ...f.data.symptoms, ...f.data.causes.map((c) => c.text), ...f.affected.map((a) => a.title)].join(' \n '),
  );
  return terms.every((t) => hay.includes(t));
}

export function filterFaults(faults: readonly FaultInfo[], filter: FaultFilter): FaultInfo[] {
  return faults
    .filter((f) => !filter.severity || f.data.severity === filter.severity)
    .filter((f) => !filter.device || f.affected.some((a) => a.id === filter.device))
    .filter((f) => !filter.q || matchesQuery(f, filter.q))
    .sort((a, b) => SEVERITY_META[b.data.severity].rank - SEVERITY_META[a.data.severity].rank || a.summary.title.localeCompare(b.summary.title, 'de'));
}

export interface AffectedEntry {
  entity: EntitySummary;
  faultCount: number;
}

/** Alle betroffenen Geräte/Modelle/Bauteile mit Anzahl Fehlerbilder, gruppiert nach Typ */
export function collectAffected(faults: readonly FaultInfo[]): Record<'device' | 'product_model' | 'component', AffectedEntry[]> {
  const map = new Map<string, AffectedEntry>();
  for (const f of faults) {
    for (const a of f.affected) {
      const e = map.get(a.id);
      if (e) e.faultCount++;
      else map.set(a.id, { entity: a, faultCount: 1 });
    }
  }
  const out: Record<'device' | 'product_model' | 'component', AffectedEntry[]> = { device: [], product_model: [], component: [] };
  for (const e of map.values()) {
    if (e.entity.type === 'device' || e.entity.type === 'product_model' || e.entity.type === 'component') out[e.entity.type].push(e);
  }
  for (const k of Object.keys(out) as Array<keyof typeof out>) out[k].sort((a, b) => a.entity.title.localeCompare(b.entity.title, 'de'));
  return out;
}

/** Entitätslisten zusammenführen, Duplikate (gleiche ID) entfernen, Reihenfolge beibehalten */
export function mergeUnique<T extends { id: string }>(...lists: ReadonlyArray<readonly T[]>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of lists)
    for (const e of l) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  return out;
}

/** Hat eine Hardware-Entität bekannte Fehlerbilder? (Relation affects, eingehend) */
export function hasKnownFaults(entity: Pick<EntityDetail, 'type' | 'relations'>): boolean {
  if (!HARDWARE_TYPES.includes(entity.type)) return false;
  return entity.relations.some((g) => g.rel === 'affects' && g.direction === 'in' && g.items.some((i) => i.type === 'fault'));
}

/** Slug aus einer Entitäts-ID (fault:xyz → xyz) */
export function slugOf(id: string): string {
  const i = id.indexOf(':');
  return i < 0 ? id : id.slice(i + 1);
}

/** Führt asynchrone Aufgaben mit begrenzter Parallelität aus (Reihenfolge bleibt erhalten). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
