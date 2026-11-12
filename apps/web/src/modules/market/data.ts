import type { EntityDetail, EntitySummary, OfferData } from '@medtech/core';
import { api } from '../../lib/api.ts';
import { useAsync, type AsyncState } from '../../lib/hooks.ts';
import { aggregateCompatibility, compatibilitySources, toMarketOffer, type CompatiblePart, type CompatSource, type MarketOffer } from './market-logic.ts';

/**
 * Datenzugriff des Market – ausschließlich über die zentrale API.
 * Angebote liefern ihre Fachdaten (Preis, Zustand …) nur in der Detailansicht,
 * daher wird der Katalog einmal vollständig geladen und 60 s zwischengespeichert.
 */

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function loadOfferCatalog(signal?: AbortSignal): Promise<MarketOffer[]> {
  const list = await api.list({ type: 'offer', limit: 500 }, signal);
  const details = await mapLimit(list.items, 6, (s) => api.entity<OfferData>('offer', s.slug, signal).catch(() => null));
  return details.filter((d): d is EntityDetail<OfferData> => !!d && !!d.data && typeof d.data.price === 'number').map(toMarketOffer);
}

export function useOfferCatalog(): AsyncState<MarketOffer[]> {
  return useAsync((signal) => loadOfferCatalog(signal), [], 'market:catalog');
}

export interface CompatibilityResult {
  sources: CompatSource[];
  parts: CompatiblePart[];
}

/** Passende Ersatzteile für ein Gerät / Produktmodell / eine Komponente inkl. Komponenten-Ersatzteilen */
export async function loadCompatibility(entity: EntityDetail, signal?: AbortSignal): Promise<CompatibilityResult> {
  const sources = compatibilitySources(entity);
  const results = await mapLimit(sources, 6, async (source) => {
    const res = await api.list({ relatedTo: source.id, rel: 'fits', type: 'spare_part', limit: 200 }, signal);
    return { source, parts: res.items as EntitySummary[] };
  });
  return { sources, parts: aggregateCompatibility(results) };
}

export function useCompatibility(entity: EntityDetail | undefined): AsyncState<CompatibilityResult> {
  return useAsync((signal) => loadCompatibility(entity!, signal), [entity?.id], entity ? `market:compat:${entity.id}` : null);
}
