import { useEffect, useMemo, useState } from 'react';
import type { EntityDetail } from '@medtech/core';
import { api } from '../../lib/api.ts';
import { cache, CACHE_MS } from '../../lib/cache.ts';
import { mapLimit } from './logic.ts';

export interface DetailsState<TData> {
  details: Map<string, EntityDetail<TData>>;
  /** Anzahl geladener Einträge (für Fortschrittsanzeige) */
  loaded: number;
  total: number;
  loading: boolean;
  error: unknown;
}

function fromCache<TData>(id: string): EntityDetail<TData> | undefined {
  const hit = cache.get(`entity:${id}`);
  return hit && Date.now() - hit.at < CACHE_MS ? (hit.value as EntityDetail<TData>) : undefined;
}

/**
 * Lädt Detaildaten (inkl. typspezifischer `data`) für mehrere Entitäten.
 *
 * Die Listen-API liefert nur Zusammenfassungen ohne `data`; für Glossar,
 * Geräteübersicht oder Rechtsstand werden die Details daher mit begrenzter
 * Parallelität nachgeladen. Der Cache wird mit useEntity() geteilt.
 */
export function useEntityDetails<TData = unknown>(ids: readonly string[] | undefined): DetailsState<TData> {
  const key = ids ? ids.join('|') : '';
  const initial = useMemo(() => {
    const m = new Map<string, EntityDetail<TData>>();
    for (const id of ids ?? []) {
      const c = fromCache<TData>(id);
      if (c) m.set(id, c);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [state, setState] = useState<{ key: string; details: Map<string, EntityDetail<TData>>; error: unknown; done: boolean }>({
    key,
    details: initial,
    error: undefined,
    done: false,
  });

  useEffect(() => {
    const list = ids ?? [];
    const missing = list.filter((id) => !initial.has(id));
    setState({ key, details: initial, error: undefined, done: missing.length === 0 });
    if (!missing.length) return;
    const ctrl = new AbortController();
    let pending = new Map<string, EntityDetail<TData>>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (!pending.size || ctrl.signal.aborted) return;
      const batch = pending;
      pending = new Map();
      setState((s) => (s.key !== key ? s : { ...s, details: new Map([...s.details, ...batch]) }));
    };
    mapLimit(missing, 6, async (id) => {
      if (ctrl.signal.aborted) return;
      try {
        const d = await api.entityById<TData>(id, ctrl.signal);
        cache.set(`entity:${id}`, { at: Date.now(), value: d });
        pending.set(id, d);
        if (!flushTimer) flushTimer = setTimeout(flush, 60);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        // Einzelne Fehler (z. B. 404 bei Entwürfen) brechen die Liste nicht ab.
        if ((e as { status?: number }).status !== 404) throw e;
      }
    })
      .then(() => {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
        if (!ctrl.signal.aborted) setState((s) => (s.key !== key ? s : { ...s, done: true }));
      })
      .catch((error: unknown) => {
        if (!ctrl.signal.aborted) setState((s) => (s.key !== key ? s : { ...s, error, done: true }));
      });
    return () => {
      ctrl.abort();
      if (flushTimer) clearTimeout(flushTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state.key === key ? state : { details: initial, error: undefined, done: false };
  return {
    details: current.details,
    loaded: current.details.size,
    total: ids?.length ?? 0,
    loading: ids === undefined || !current.done,
    error: current.error,
  };
}
