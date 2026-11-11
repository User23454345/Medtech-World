import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useNavigate } from 'react-router';
import type { EntityDetail, EntitySummary, ListResponse, ModuleId, SearchResponse } from '@medtech/core';
import { api, type ListParams } from './api.ts';
import { useAuth } from './auth.tsx';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

import { cache, CACHE_MS } from './cache.ts';

export { invalidateCache } from './cache.ts';

/**
 * Lädt Daten asynchron. Mit `cacheKey` werden Ergebnisse 60 s zwischengespeichert.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList, cacheKey?: string | null): AsyncState<T> {
  const cached = cacheKey ? (cache.get(cacheKey) as { at: number; value: T } | undefined) : undefined;
  const [state, setState] = useState<{ data: T | undefined; error: unknown; loading: boolean }>({
    data: cached?.value,
    error: undefined,
    loading: !cached,
  });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (cacheKey === null) {
      setState({ data: undefined, error: undefined, loading: false });
      return;
    }
    const hit = cacheKey ? cache.get(cacheKey) : undefined;
    if (hit && Date.now() - hit.at < CACHE_MS && tick === 0) {
      setState({ data: hit.value as T, error: undefined, loading: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fnRef
      .current(ctrl.signal)
      .then((data) => {
        if (cacheKey) cache.set(cacheKey, { at: Date.now(), value: data });
        setState({ data, error: undefined, loading: false });
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name === 'AbortError') return;
        setState({ data: undefined, error, loading: false });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, cacheKey, tick]);

  const reload = useCallback(() => {
    if (cacheKey) cache.delete(cacheKey);
    setTick((t) => t + 1);
  }, [cacheKey]);

  return { ...state, reload };
}

export function useEntity<TData = unknown>(id: string | null | undefined): AsyncState<EntityDetail<TData>> {
  return useAsync((signal) => api.entityById<TData>(id!, signal), [id], id ? `entity:${id}` : null);
}

export function useEntityList(params: ListParams): AsyncState<ListResponse<EntitySummary>> {
  const key = `list:${JSON.stringify(params)}`;
  return useAsync((signal) => api.list(params, signal), [key], key);
}

export function useSearch(q: string, opts: Parameters<typeof api.search>[1] = {}): AsyncState<SearchResponse> {
  const key = q.trim() ? `search:${q}:${JSON.stringify(opts)}` : null;
  return useAsync((signal) => api.search(q, opts, signal), [key], key);
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Protokolliert einen Besuch in der Lernhistorie (nur angemeldet, einmal pro Mount). */
export function useRecordVisit(entityId: string | undefined, module: ModuleId, action: 'view' | 'quiz' | 'simulation' | 'diagnosis' = 'view') {
  const { user, settings } = useAuth();
  useEffect(() => {
    if (!user || !entityId || settings?.trackHistory === false) return;
    api.me.recordHistory(entityId, module, action).catch(() => undefined);
  }, [user, entityId, module, action, settings?.trackHistory]);
}

export function useRequireLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    (next = window.location.pathname) => {
      if (user) return true;
      navigate(`/konto/anmelden?weiter=${encodeURIComponent(next)}`);
      return false;
    },
    [user, navigate],
  );
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · MedTech World` : 'MedTech World';
  }, [title]);
}
