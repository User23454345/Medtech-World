/**
 * Reine Hilfslogik des MedTech Wiki (ohne React) – unit-getestet in logic.test.ts.
 */
import type {
  ComponentData,
  DocumentData,
  EntityType,
  LegalReferenceData,
  MediaData,
  ProductModelData,
  RelationGroup,
  RelationType,
  TermData,
} from '@medtech/core';

// ------------------------------------------------------------------ Beschriftungen

export const TERM_CATEGORY_LABEL: Record<TermData['category'], string> = {
  messprinzip: 'Messprinzip',
  physiologie: 'Physiologie',
  technik: 'Technik',
  recht: 'Recht',
  qualitaet: 'Qualität',
  sicherheit: 'Sicherheit',
  allgemein: 'Allgemein',
};

export const DOC_TYPE_LABEL: Record<DocumentData['docType'], string> = {
  gebrauchsanweisung: 'Gebrauchsanweisung',
  serviceanleitung: 'Serviceanleitung',
  protokollvorlage: 'Protokollvorlage',
  merkblatt: 'Merkblatt',
  checkliste: 'Checkliste',
  leitfaden: 'Leitfaden',
};

export const LEGAL_KIND_LABEL: Record<LegalReferenceData['kind'], string> = {
  verordnung: 'Verordnung',
  richtlinie: 'Richtlinie',
  gesetz: 'Gesetz',
  norm: 'Norm',
  leitlinie: 'Leitlinie',
  empfehlung: 'Empfehlung',
};

export const LEGAL_STATUS_LABEL: Record<LegalReferenceData['status'], string> = {
  'in-kraft': 'In Kraft',
  entwurf: 'Entwurf',
  ersetzt: 'Ersetzt',
  aufgehoben: 'Aufgehoben',
};

export const LEGAL_STATUS_TONE: Record<LegalReferenceData['status'], 'ok' | 'info' | 'danger' | 'warn'> = {
  'in-kraft': 'ok',
  entwurf: 'info',
  ersetzt: 'danger',
  aufgehoben: 'danger',
};

export const JURISDICTION_LABEL: Record<LegalReferenceData['jurisdiction'], string> = {
  EU: 'Europäische Union',
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  international: 'International',
};

export const COMPONENT_KIND_LABEL: Record<ComponentData['kind'], string> = {
  sensor: 'Sensor',
  aktor: 'Aktor',
  elektronik: 'Elektronik',
  mechanik: 'Mechanik',
  pneumatik: 'Pneumatik',
  optik: 'Optik',
  software: 'Software',
  energie: 'Energieversorgung',
  verbrauchsmaterial: 'Verbrauchsmaterial',
  anzeige: 'Anzeige / Bedienung',
};

export const PRODUCT_STATUS_LABEL: Record<ProductModelData['status'], string> = {
  aktiv: 'Aktiv am Markt',
  abgekuendigt: 'Abgekündigt',
  unbekannt: 'Status unbekannt',
};

export const MEDIA_KIND_LABEL: Record<MediaData['kind'], string> = {
  schema: 'Schema',
  foto: 'Foto',
  diagramm: 'Diagramm',
  icon: 'Symbol',
};

const LANGUAGE_LABEL: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  it: 'Italienisch',
  es: 'Spanisch',
  nl: 'Niederländisch',
};

export function languageLabel(code: string | undefined): string {
  if (!code) return 'Deutsch';
  return LANGUAGE_LABEL[code.toLowerCase()] ?? code.toUpperCase();
}

/** Nachschlagen mit Fallback auf den Rohwert (robust gegen neue Enum-Werte). */
export function labelOf<K extends string>(map: Record<K, string>, key: K | undefined | null): string {
  if (!key) return '–';
  return map[key] ?? key;
}

// ------------------------------------------------------------------ Glossar

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const OTHER_LETTER = '#';

/** Anfangsbuchstabe für das A–Z-Register (Umlaute → Grundbuchstabe, Ziffern/Sonderzeichen → #). */
export function glossaryLetter(title: string): string {
  const first = title
    .trim()
    .charAt(0)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  if (first === 'SS' || first === 'ẞ') return 'S';
  return ALPHABET.includes(first) ? first : OTHER_LETTER;
}

/** Deutsche Sortierung (Umlaute korrekt, Groß-/Kleinschreibung ignoriert, Zahlen numerisch). */
export const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function sortByTitle<T extends { title: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => collator.compare(a.title, b.title));
}

export interface LetterGroup<T> {
  letter: string;
  items: T[];
}

/** Gruppiert alphabetisch; "#" steht am Ende. Nur Buchstaben mit Einträgen. */
export function groupByLetter<T extends { title: string }>(items: readonly T[]): LetterGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of sortByTitle(items)) {
    const l = glossaryLetter(it.title);
    const arr = map.get(l);
    if (arr) arr.push(it);
    else map.set(l, [it]);
  }
  const order = [...ALPHABET, OTHER_LETTER];
  return order.filter((l) => map.has(l)).map((letter) => ({ letter, items: map.get(letter)! }));
}

export interface GlossaryEntry {
  id: string;
  title: string;
  summary: string;
  aliases?: string[];
  data?: Partial<TermData>;
}

/** Text- und Kategoriefilter für das Glossar (sucht in Titel, Abkürzung, Englisch, Synonymen, Kurztext). */
export function filterGlossary<T extends GlossaryEntry>(items: readonly T[], query: string, category: TermData['category'] | '' = ''): T[] {
  const q = normalizeForSearch(query);
  return items.filter((it) => {
    if (category && it.data?.category !== category) return false;
    if (!q) return true;
    const hay = normalizeForSearch(
      [it.title, it.data?.abbreviation, it.data?.english, ...(it.aliases ?? []), it.summary].filter(Boolean).join(' '),
    );
    return hay.includes(q);
  });
}

export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ Gruppierung

export interface Group<T> {
  key: string;
  items: T[];
}

/** Gruppiert nach einem Schlüssel (leere Schlüssel → fallback), Gruppen und Einträge alphabetisch. */
export function groupBy<T extends { title: string }>(items: readonly T[], keyOf: (it: T) => string | undefined | null, fallback = 'Ohne Kategorie'): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = (keyOf(it) ?? '').trim() || fallback;
    const arr = map.get(k);
    if (arr) arr.push(it);
    else map.set(k, [it]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === fallback ? 1 : b === fallback ? -1 : collator.compare(a, b)))
    .map(([key, arr]) => ({ key, items: sortByTitle(arr) }));
}

// ------------------------------------------------------------------ Rechtsstand

const DAY_MS = 86_400_000;

function parseIsoDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Datum der nächsten fälligen Prüfung des Rechtsstands (verifiedAt + reviewIntervalDays). */
export function nextReviewDate(verifiedAt: string, reviewIntervalDays = 365): string | null {
  const t = parseIsoDate(verifiedAt);
  if (t === null) return null;
  return toIsoDate(t + Math.max(1, reviewIntervalDays) * DAY_MS);
}

export interface ReviewState {
  due: string | null;
  overdue: boolean;
  /** Tage bis zur Fälligkeit (negativ = überfällig) */
  daysLeft: number | null;
}

export function reviewState(verifiedAt: string, reviewIntervalDays = 365, today: Date = new Date()): ReviewState {
  const due = nextReviewDate(verifiedAt, reviewIntervalDays);
  if (!due) return { due: null, overdue: false, daysLeft: null };
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysLeft = Math.round((parseIsoDate(due)! - todayUtc) / DAY_MS);
  return { due, overdue: daysLeft < 0, daysLeft };
}

/** Nicht mehr gültige Rechtsgrundlagen (ersetzt oder aufgehoben). */
export function isInvalidLegal(status: LegalReferenceData['status'] | undefined): boolean {
  return status === 'ersetzt' || status === 'aufgehoben';
}

const LEGAL_STATUS_ORDER: Record<LegalReferenceData['status'], number> = { 'in-kraft': 0, entwurf: 1, ersetzt: 2, aufgehoben: 3 };
const JURISDICTION_ORDER: Record<LegalReferenceData['jurisdiction'], number> = { EU: 0, DE: 1, AT: 2, CH: 3, international: 4 };

/** Sortierung: gültig vor Entwurf vor ersetzt/aufgehoben, dann Geltungsbereich, dann Titel. */
export function sortLegal<T extends { title: string; data?: Partial<LegalReferenceData> }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = a.data?.status ? LEGAL_STATUS_ORDER[a.data.status] : 9;
    const sb = b.data?.status ? LEGAL_STATUS_ORDER[b.data.status] : 9;
    if (sa !== sb) return sa - sb;
    const ja = a.data?.jurisdiction ? JURISDICTION_ORDER[a.data.jurisdiction] : 9;
    const jb = b.data?.jurisdiction ? JURISDICTION_ORDER[b.data.jurisdiction] : 9;
    if (ja !== jb) return ja - jb;
    return collator.compare(a.title, b.title);
  });
}

/** Deutsches Datumsformat (TT.MM.JJJJ) für ISO-Daten, ohne Zeitzonenverschiebung. */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '–';
  const t = parseIsoDate(iso.slice(0, 10));
  if (t === null) return iso;
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

// ------------------------------------------------------------------ Relationen

/** Einträge einer Relationsgruppe (optional nach Typ gefiltert), ohne Duplikate. */
export function relationItems<T extends { id: string; type: EntityType }>(
  groups: ReadonlyArray<{ rel: RelationType; direction: 'in' | 'out'; items: T[] }>,
  rel: RelationType,
  direction?: 'in' | 'out',
  type?: EntityType,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of groups) {
    if (g.rel !== rel || (direction && g.direction !== direction)) continue;
    for (const it of g.items) {
      if (type && it.type !== type) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

/** Alle verknüpften Entitäten eines Typs, unabhängig von der Relation. */
export function relatedOfType<T extends { id: string; type: EntityType }>(groups: ReadonlyArray<{ items: T[] }>, type: EntityType): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of groups) for (const it of g.items) if (it.type === type && !seen.has(it.id)) {
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export type RelationGroupLike = Pick<RelationGroup, 'rel' | 'direction' | 'items'>;

/** Vereinigt Listen nach id (erste Vorkommen gewinnen). */
export function uniqueById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of lists) for (const it of l) if (!seen.has(it.id)) {
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// ------------------------------------------------------------------ Medien

/** Bildquelle einer Media-Entität: Vorschaubild der API, Inline-SVG (als data:-URL) oder externe URL. */
export function mediaSrc(thumbnail: string | undefined, data: Partial<MediaData> | undefined): string | null {
  if (thumbnail) return thumbnail;
  if (data?.svg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`;
  if (data?.url) return data.url;
  return null;
}

/** Nur http(s)-URLs als externe Links zulassen. */
export function safeExternalUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ------------------------------------------------------------------ Nebenläufigkeit

/** Führt `fn` für alle Einträge mit begrenzter Parallelität aus (Reihenfolge des Ergebnisses = Eingabe). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
