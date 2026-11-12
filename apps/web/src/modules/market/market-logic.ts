import type { EntityDetail, EntitySummary, EntityType, OfferData, RelationGroup, RelationType, SparePartData } from '@medtech/core';

/**
 * Reine Logik des MedTech Market (ohne React, ohne Netzwerk):
 * Preisformatierung, Filtern/Sortieren von Angeboten und die
 * Aggregation der Kompatibilität aus dem Wissensgraphen.
 */

// ------------------------------------------------------------------ Formatierung

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const EUR_ROUND = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Preis im deutschen Format, z. B. „1.234,50 €“. Ganze Beträge optional ohne Nachkommastellen. */
export function formatPrice(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '–';
  if (opts.compact && Number.isInteger(value)) return EUR_ROUND.format(value);
  return EUR.format(value);
}

/**
 * Liest eine Preiseingabe im deutschen (1.234,50) oder technischen (1234.50) Format.
 * Leere oder ungültige Eingaben ergeben undefined.
 */
export function parsePriceInput(input: string): number | undefined {
  let s = input.trim().replace(/\s|€|EUR/gi, '');
  if (!s) return undefined;
  if (s.includes(',')) {
    // deutsches Format: Punkte sind Tausendertrennzeichen
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // „1.250“ = eintausendzweihundertfünfzig
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const CONDITION_LABELS: Record<OfferData['condition'], string> = {
  neu: 'Neu',
  gebraucht: 'Gebraucht',
  generalueberholt: 'Generalüberholt',
};

export const CONDITION_ORDER: OfferData['condition'][] = ['neu', 'generalueberholt', 'gebraucht'];

export function conditionTone(c: OfferData['condition']): 'ok' | 'info' | 'warn' {
  return c === 'neu' ? 'ok' : c === 'generalueberholt' ? 'info' : 'warn';
}

export const KIND_LABELS: Record<SparePartData['kind'], string> = {
  sensor: 'Sensor',
  aktor: 'Aktor',
  elektronik: 'Elektronik',
  mechanik: 'Mechanik',
  pneumatik: 'Pneumatik',
  optik: 'Optik',
  software: 'Software',
  energie: 'Energieversorgung',
  verbrauchsmaterial: 'Verbrauchsmaterial',
  anzeige: 'Anzeige',
};

export type StockLevel = 'none' | 'low' | 'ok';

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'none';
  if (stock <= 3) return 'low';
  return 'ok';
}

export function stockLabel(stock: number): string {
  if (stock <= 0) return 'Derzeit nicht vorrätig';
  if (stock <= 3) return `Nur noch ${stock} verfügbar`;
  return `${stock.toLocaleString('de-DE')} auf Lager`;
}

export function warrantyLabel(months: number | undefined): string {
  if (months === undefined) return 'Keine Angabe';
  if (months === 0) return 'Ohne Gewährleistung';
  if (months % 12 === 0) {
    const y = months / 12;
    return `${y} ${y === 1 ? 'Jahr' : 'Jahre'}`;
  }
  return `${months} ${months === 1 ? 'Monat' : 'Monate'}`;
}

// ------------------------------------------------------------------ Relationen

export function relationItems(entity: Pick<EntityDetail, 'relations'>, rel: RelationType, direction: RelationGroup['direction'], types?: EntityType[]): Array<EntitySummary & { note?: string }> {
  const out: Array<EntitySummary & { note?: string }> = [];
  const seen = new Set<string>();
  for (const g of entity.relations) {
    if (g.rel !== rel || g.direction !== direction) continue;
    for (const it of g.items) {
      if (types && !types.includes(it.type)) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

// ------------------------------------------------------------------ Angebote

/** Angebot mit geladenen Fachdaten und den Zielen der Relation „offers“ */
export interface MarketOffer {
  id: string;
  slug: string;
  title: string;
  summary: string;
  demo: boolean;
  data: OfferData;
  /** Wofür das Angebot gilt (Ersatzteil, Produktmodell, Gerät) */
  targets: EntitySummary[];
}

export function toMarketOffer(detail: EntityDetail<OfferData>): MarketOffer {
  return {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    summary: detail.summary,
    demo: detail.demo,
    data: detail.data,
    targets: relationItems(detail, 'offers', 'out'),
  };
}

export type OfferSort = 'price-asc' | 'price-desc' | 'stock-desc' | 'title';

export const SORT_LABELS: Record<OfferSort, string> = {
  'price-asc': 'Preis aufsteigend',
  'price-desc': 'Preis absteigend',
  'stock-desc': 'Verfügbarkeit',
  title: 'Bezeichnung (A–Z)',
};

export interface OfferFilter {
  condition?: OfferData['condition'] | '';
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  /** Freitext über Titel, Anbieter, Ort und Zielobjekte */
  query?: string;
  /** Nur Angebote für diese Zieltypen (z. B. nur Ersatzteile) */
  targetType?: EntityType | '';
}

const norm = (s: string) => s.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function filterOffers(offers: MarketOffer[], f: OfferFilter): MarketOffer[] {
  const q = f.query?.trim() ? norm(f.query.trim()) : '';
  let min = f.minPrice;
  let max = f.maxPrice;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return offers.filter((o) => {
    if (f.condition && o.data.condition !== f.condition) return false;
    if (min !== undefined && o.data.price < min) return false;
    if (max !== undefined && o.data.price > max) return false;
    if (f.inStockOnly && o.data.stock <= 0) return false;
    if (f.targetType && !o.targets.some((t) => t.type === f.targetType)) return false;
    if (q) {
      const hay = norm([o.title, o.summary, o.data.seller, o.data.location, ...o.targets.map((t) => t.title)].join(' '));
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function sortOffers(offers: MarketOffer[], sort: OfferSort): MarketOffer[] {
  const byTitle = (a: MarketOffer, b: MarketOffer) => a.title.localeCompare(b.title, 'de');
  const copy = [...offers];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.data.price - b.data.price || byTitle(a, b));
    case 'price-desc':
      return copy.sort((a, b) => b.data.price - a.data.price || byTitle(a, b));
    case 'stock-desc':
      return copy.sort((a, b) => b.data.stock - a.data.stock || a.data.price - b.data.price || byTitle(a, b));
    case 'title':
    default:
      return copy.sort(byTitle);
  }
}

export function priceBounds(offers: MarketOffer[]): { min: number; max: number } | null {
  if (!offers.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const o of offers) {
    min = Math.min(min, o.data.price);
    max = Math.max(max, o.data.price);
  }
  return { min, max };
}

/** Alle Angebote, die sich (per Relation „offers“) auf eine Entität beziehen, nach Preis sortiert */
export function offersFor(catalog: MarketOffer[], targetId: string): MarketOffer[] {
  return sortOffers(
    catalog.filter((o) => o.targets.some((t) => t.id === targetId)),
    'price-asc',
  );
}

/** Günstigstes Angebot – bevorzugt mit Lagerbestand */
export function cheapestOffer(offers: MarketOffer[]): MarketOffer | undefined {
  const inStock = offers.filter((o) => o.data.stock > 0);
  const pool = inStock.length ? inStock : offers;
  return sortOffers(pool, 'price-asc')[0];
}

// ------------------------------------------------------------------ Kompatibilität

export type CompatVia = 'direct' | 'component' | 'model';

/** Ausgangspunkt einer Kompatibilitätssuche (das Gerät selbst, seine Komponenten, seine Modelle) */
export interface CompatSource {
  id: string;
  title: string;
  type: EntityType;
  via: CompatVia;
}

export const VIA_LABELS: Record<CompatVia, string> = {
  direct: 'direkt passend',
  component: 'über Komponente',
  model: 'über Produktmodell',
};

/**
 * Ermittelt, wo nach passenden Ersatzteilen gesucht wird:
 * - die Entität selbst (fits → Entität)
 * - ihre Komponenten (has_component, ausgehend)
 * - bei Geräteklassen zusätzlich die zugehörigen Produktmodelle (model_of, eingehend)
 */
export function compatibilitySources(entity: Pick<EntityDetail, 'id' | 'title' | 'type' | 'relations'>): CompatSource[] {
  const out: CompatSource[] = [{ id: entity.id, title: entity.title, type: entity.type, via: 'direct' }];
  const seen = new Set([entity.id]);
  const add = (items: EntitySummary[], via: CompatVia) => {
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({ id: it.id, title: it.title, type: it.type, via });
    }
  };
  add(relationItems(entity, 'has_component', 'out', ['component']), 'component');
  if (entity.type === 'device') add(relationItems(entity, 'model_of', 'in', ['product_model']), 'model');
  return out;
}

export interface CompatiblePart {
  part: EntitySummary;
  /** Über welche Ausgangspunkte das Teil gefunden wurde (direkt zuerst) */
  via: CompatSource[];
}

const VIA_RANK: Record<CompatVia, number> = { direct: 0, model: 1, component: 2 };

/** Führt die Treffer je Ausgangspunkt zu einer eindeutigen Ersatzteilliste zusammen. */
export function aggregateCompatibility(results: Array<{ source: CompatSource; parts: EntitySummary[] }>): CompatiblePart[] {
  const map = new Map<string, CompatiblePart>();
  for (const { source, parts } of results) {
    for (const p of parts) {
      if (p.type !== 'spare_part') continue;
      const entry = map.get(p.id) ?? { part: p, via: [] };
      if (!entry.via.some((v) => v.id === source.id)) entry.via.push(source);
      map.set(p.id, entry);
    }
  }
  const list = [...map.values()];
  for (const e of list) e.via.sort((a, b) => VIA_RANK[a.via] - VIA_RANK[b.via] || a.title.localeCompare(b.title, 'de'));
  return list.sort((a, b) => VIA_RANK[a.via[0]!.via] - VIA_RANK[b.via[0]!.via] || a.part.title.localeCompare(b.part.title, 'de'));
}

/** Beschreibt in Klartext, warum ein Teil passt, z. B. „direkt passend · über Komponente SpO2-Sensor“ */
export function describeVia(via: CompatSource[]): string {
  return via.map((v) => (v.via === 'direct' ? VIA_LABELS.direct : `${VIA_LABELS[v.via]} ${v.title}`)).join(' · ');
}

// ------------------------------------------------------------------ Anfragen

export const INQUIRY_MIN = 5;
export const INQUIRY_MAX = 2000;

export function validateInquiry(message: string): string | null {
  const t = message.trim();
  if (t.length < INQUIRY_MIN) return `Bitte mindestens ${INQUIRY_MIN} Zeichen eingeben.`;
  if (t.length > INQUIRY_MAX) return `Bitte höchstens ${INQUIRY_MAX.toLocaleString('de-DE')} Zeichen eingeben.`;
  return null;
}

export function slugFromId(id: string): string {
  const i = id.indexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
