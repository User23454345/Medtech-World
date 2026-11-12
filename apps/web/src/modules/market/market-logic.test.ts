import { describe, expect, it } from 'vitest';
import type { EntityDetail, EntitySummary, EntityType, OfferData } from '@medtech/core';
import {
  aggregateCompatibility,
  cheapestOffer,
  compatibilitySources,
  describeVia,
  filterOffers,
  formatPrice,
  offersFor,
  parsePriceInput,
  priceBounds,
  sortOffers,
  stockLabel,
  stockLevel,
  toMarketOffer,
  validateInquiry,
  warrantyLabel,
  type MarketOffer,
} from './market-logic.ts';

const nbsp = (s: string) => s.replace(/ | /g, ' ');

const summary = (id: string, title = id): EntitySummary => {
  const [type, slug] = id.split(':') as [EntityType, string];
  return { id, type, slug, title, summary: '', tags: [], demo: true, reviewStatus: 'geprueft', flags: [] };
};

const offer = (slug: string, data: Partial<OfferData>, targets: string[] = [], title = slug): MarketOffer => ({
  id: `offer:${slug}`,
  slug,
  title,
  summary: '',
  demo: true,
  data: { seller: 'Demo-Händler', price: 100, currency: 'EUR', condition: 'neu', stock: 5, location: 'Berlin', ...data },
  targets: targets.map((t) => summary(t)),
});

describe('formatPrice', () => {
  it('formatiert Euro im deutschen Format', () => {
    expect(nbsp(formatPrice(1234.5))).toBe('1.234,50 €');
    expect(nbsp(formatPrice(119))).toBe('119,00 €');
    expect(nbsp(formatPrice(119, { compact: true }))).toBe('119 €');
    expect(nbsp(formatPrice(19.9, { compact: true }))).toBe('19,90 €');
    expect(formatPrice(Number.NaN)).toBe('–');
  });
});

describe('parsePriceInput', () => {
  it('versteht deutsche und technische Schreibweisen', () => {
    expect(parsePriceInput('1.234,50')).toBe(1234.5);
    expect(parsePriceInput('1234.5')).toBe(1234.5);
    expect(parsePriceInput('1.250')).toBe(1250);
    expect(parsePriceInput(' 99 € ')).toBe(99);
    expect(parsePriceInput('')).toBeUndefined();
    expect(parsePriceInput('abc')).toBeUndefined();
    expect(parsePriceInput('-5')).toBeUndefined();
  });
});

describe('Bestand und Gewährleistung', () => {
  it('liefert Klartext', () => {
    expect(stockLevel(0)).toBe('none');
    expect(stockLevel(2)).toBe('low');
    expect(stockLevel(20)).toBe('ok');
    expect(stockLabel(0)).toBe('Derzeit nicht vorrätig');
    expect(stockLabel(1)).toBe('Nur noch 1 verfügbar');
    expect(stockLabel(1200)).toBe('1.200 auf Lager');
    expect(warrantyLabel(undefined)).toBe('Keine Angabe');
    expect(warrantyLabel(0)).toBe('Ohne Gewährleistung');
    expect(warrantyLabel(6)).toBe('6 Monate');
    expect(warrantyLabel(12)).toBe('1 Jahr');
    expect(warrantyLabel(24)).toBe('2 Jahre');
  });
});

describe('filterOffers / sortOffers', () => {
  const offers = [
    offer('a', { price: 890, condition: 'generalueberholt', stock: 3, location: 'Köln' }, ['product_model:syrino'], 'Syrino Spritzenpumpe'),
    offer('b', { price: 119, condition: 'neu', stock: 20, location: 'München' }, ['spare_part:akku'], 'Akkupack'),
    offer('c', { price: 45, condition: 'gebraucht', stock: 0 }, ['spare_part:sensor'], 'Sensor'),
  ];

  it('filtert nach Zustand, Preisspanne, Bestand, Zieltyp und Freitext', () => {
    expect(filterOffers(offers, { condition: 'neu' }).map((o) => o.slug)).toEqual(['b']);
    expect(filterOffers(offers, { minPrice: 100, maxPrice: 500 }).map((o) => o.slug)).toEqual(['b']);
    // vertauschte Grenzen werden korrigiert
    expect(filterOffers(offers, { minPrice: 500, maxPrice: 100 }).map((o) => o.slug)).toEqual(['b']);
    expect(filterOffers(offers, { inStockOnly: true }).map((o) => o.slug)).toEqual(['a', 'b']);
    expect(filterOffers(offers, { targetType: 'spare_part' }).map((o) => o.slug)).toEqual(['b', 'c']);
    expect(filterOffers(offers, { query: 'koln' }).map((o) => o.slug)).toEqual(['a']);
    expect(filterOffers(offers, { query: 'akku münchen' }).map((o) => o.slug)).toEqual(['b']);
    expect(filterOffers(offers, {})).toHaveLength(3);
  });

  it('sortiert stabil nach Preis, Bestand und Titel', () => {
    expect(sortOffers(offers, 'price-asc').map((o) => o.slug)).toEqual(['c', 'b', 'a']);
    expect(sortOffers(offers, 'price-desc').map((o) => o.slug)).toEqual(['a', 'b', 'c']);
    expect(sortOffers(offers, 'stock-desc').map((o) => o.slug)).toEqual(['b', 'a', 'c']);
    expect(sortOffers(offers, 'title').map((o) => o.slug)).toEqual(['b', 'c', 'a']);
    // Original bleibt unverändert
    expect(offers.map((o) => o.slug)).toEqual(['a', 'b', 'c']);
  });

  it('ermittelt Preisspanne, Angebote je Ziel und das günstigste lieferbare Angebot', () => {
    expect(priceBounds(offers)).toEqual({ min: 45, max: 890 });
    expect(priceBounds([])).toBeNull();
    const forSensor = [offer('x', { price: 30, stock: 0 }, ['spare_part:s']), offer('y', { price: 50, stock: 2 }, ['spare_part:s']), offer('z', { price: 10 }, ['spare_part:t'])];
    expect(offersFor(forSensor, 'spare_part:s').map((o) => o.slug)).toEqual(['x', 'y']);
    expect(cheapestOffer(offersFor(forSensor, 'spare_part:s'))?.slug).toBe('y');
    expect(cheapestOffer([offer('only', { price: 5, stock: 0 })])?.slug).toBe('only');
    expect(cheapestOffer([])).toBeUndefined();
  });
});

describe('Kompatibilität', () => {
  const device = {
    id: 'device:infusionspumpe',
    title: 'Infusionspumpe',
    type: 'device' as const,
    relations: [
      { rel: 'has_component' as const, direction: 'out' as const, label: 'Komponenten', items: [summary('component:akku', 'Akku'), summary('component:luft', 'Luftsensor')] },
      { rel: 'model_of' as const, direction: 'in' as const, label: 'Produktmodelle', items: [summary('product_model:vp3', 'Infusa VP 3')] },
      { rel: 'related' as const, direction: 'out' as const, label: 'Siehe auch', items: [summary('device:spritzenpumpe')] },
    ],
  };

  it('bestimmt Ausgangspunkte: selbst, Komponenten, Produktmodelle', () => {
    const src = compatibilitySources(device);
    expect(src.map((s) => `${s.via}:${s.id}`)).toEqual(['direct:device:infusionspumpe', 'component:component:akku', 'component:component:luft', 'model:product_model:vp3']);
    // Produktmodelle zählen nur bei Geräteklassen
    expect(compatibilitySources({ ...device, type: 'product_model' }).some((s) => s.via === 'model')).toBe(false);
  });

  it('führt Treffer zusammen und dedupliziert', () => {
    const [self, akku, luft, vp3] = compatibilitySources(device);
    const agg = aggregateCompatibility([
      { source: self!, parts: [] },
      { source: akku!, parts: [summary('spare_part:b300', 'Akkupack B300')] },
      { source: luft!, parts: [summary('spare_part:as3', 'Luftsensor AS3'), summary('offer:x')] },
      { source: vp3!, parts: [summary('spare_part:b300', 'Akkupack B300'), summary('spare_part:as3', 'Luftsensor AS3')] },
    ]);
    // beide über Produktmodell gefunden → alphabetisch
    expect(agg.map((p) => p.part.id)).toEqual(['spare_part:b300', 'spare_part:as3']);
    expect(agg[0]!.via.map((v) => v.via)).toEqual(['model', 'component']);
    expect(describeVia(agg[0]!.via)).toBe('über Produktmodell Infusa VP 3 · über Komponente Akku');
    expect(describeVia([self!])).toBe('direkt passend');
  });

  it('wandelt Angebotsdetails in MarketOffer um', () => {
    const detail = {
      ...summary('offer:demo', 'Demo'),
      slug: 'demo',
      data: { seller: 'S', price: 1, currency: 'EUR', condition: 'neu', stock: 1, location: 'L' },
      relations: [{ rel: 'offers', direction: 'out', label: 'Angebot für', items: [summary('spare_part:a')] }],
    } as unknown as EntityDetail<OfferData>;
    expect(toMarketOffer(detail).targets.map((t) => t.id)).toEqual(['spare_part:a']);
  });
});

describe('validateInquiry', () => {
  it('prüft die Länge der Nachricht', () => {
    expect(validateInquiry('  hi  ')).toMatch(/mindestens/);
    expect(validateInquiry('Ist das Teil noch verfügbar?')).toBeNull();
    expect(validateInquiry('x'.repeat(2001))).toMatch(/höchstens/);
  });
});
