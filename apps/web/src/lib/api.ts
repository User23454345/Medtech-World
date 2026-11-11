import type {
  CopilotAnswer,
  EntityDetail,
  EntitySummary,
  EntityType,
  EntityTypeDefinition,
  Favorite,
  HistoryEntry,
  ListResponse,
  ModuleDefinition,
  ModuleId,
  Note,
  ProgressEntry,
  ProgressStatus,
  PublicUser,
  QualityReport,
  RelationDefinition,
  RelationType,
  SearchResponse,
  SourceRef,
  UserSettings,
} from '@medtech/core';

/**
 * Einheitlicher API-Client für alle Module (/api/v1).
 * Schreibende Anfragen senden den CSRF-Header, Sitzungen laufen über ein httpOnly-Cookie.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['x-medtech-client'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Server nicht erreichbar. Bitte Verbindung prüfen.', 'network');
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(res.status, err?.message ?? `Fehler ${res.status}`, err?.code ?? 'error');
  }
  return json as T;
}

const qs = (params: Record<string, string | number | undefined | null | string[]>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Meta {
  modules: ModuleDefinition[];
  entityTypes: EntityTypeDefinition[];
  relationTypes: RelationDefinition[];
  counts: Record<EntityType, number>;
  seededAt: string | null;
}

export interface ListParams {
  type?: EntityType;
  types?: EntityType[];
  tag?: string;
  relatedTo?: string;
  rel?: RelationType;
  limit?: number;
  offset?: number;
}

export interface QuizEvaluation {
  score: number;
  passed: boolean;
  passScore: number;
  results: Array<{ questionId: string; correct: boolean; correctOptions: string[]; explanation: string }>;
}

export const api = {
  meta: (signal?: AbortSignal) => request<Meta>('GET', '/meta', undefined, signal),
  list: (params: ListParams = {}, signal?: AbortSignal) => request<ListResponse<EntitySummary>>('GET', `/entities${qs({ ...params })}`, undefined, signal),
  entity: <TData = unknown>(type: EntityType, slug: string, signal?: AbortSignal) =>
    request<EntityDetail<TData>>('GET', `/entities/${type}/${encodeURIComponent(slug)}`, undefined, signal),
  entityById: <TData = unknown>(id: string, signal?: AbortSignal) => {
    const i = id.indexOf(':');
    return api.entity<TData>(id.slice(0, i) as EntityType, id.slice(i + 1), signal);
  },
  search: (q: string, opts: { types?: EntityType[]; module?: ModuleId; limit?: number } = {}, signal?: AbortSignal) =>
    request<SearchResponse>('GET', `/search${qs({ q, types: opts.types, module: opts.module, limit: opts.limit })}`, undefined, signal),
  sources: () => request<{ items: SourceRef[] }>('GET', '/sources'),
  source: (id: string) => request<{ source: SourceRef; usedBy: EntitySummary[] }>('GET', `/sources/${encodeURIComponent(id)}`),
  quality: () => request<QualityReport>('GET', '/quality'),

  auth: {
    me: () => request<{ user: PublicUser | null; settings: UserSettings | null }>('GET', '/auth/me'),
    login: (email: string, password: string) => request<{ user: PublicUser; settings: UserSettings }>('POST', '/auth/login', { email, password }),
    register: (email: string, password: string, displayName: string) =>
      request<{ user: PublicUser; settings: UserSettings }>('POST', '/auth/register', { email, password, displayName }),
    logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  },

  me: {
    update: (patch: { displayName?: string }) => request<{ user: PublicUser }>('PATCH', '/me', patch),
    changePassword: (currentPassword: string, newPassword: string) => request<{ ok: true }>('PUT', '/me/password', { currentPassword, newPassword }),
    settings: () => request<UserSettings>('GET', '/me/settings'),
    updateSettings: (patch: Partial<UserSettings>) => request<UserSettings>('PATCH', '/me/settings', patch),
    favorites: () => request<{ items: Favorite[] }>('GET', '/me/favorites'),
    addFavorite: (id: string) => request<{ ok: true }>('PUT', `/me/favorites/${encodeURIComponent(id)}`, {}),
    removeFavorite: (id: string) => request<{ ok: true }>('DELETE', `/me/favorites/${encodeURIComponent(id)}`, {}),
    progress: () => request<{ items: ProgressEntry[] }>('GET', '/me/progress'),
    setProgress: (id: string, status: ProgressStatus, score: number | null = null) =>
      request<ProgressEntry>('PUT', `/me/progress/${encodeURIComponent(id)}`, { status, score }),
    notes: (entityId?: string) => request<{ items: Note[] }>('GET', `/me/notes${qs({ entityId })}`),
    createNote: (entityId: string | null, text: string) => request<Note>('POST', '/me/notes', { entityId, text }),
    updateNote: (id: string, text: string) => request<Note>('PATCH', `/me/notes/${id}`, { text }),
    deleteNote: (id: string) => request<{ ok: true }>('DELETE', `/me/notes/${id}`, {}),
    history: (limit = 50) => request<{ items: HistoryEntry[] }>('GET', `/me/history${qs({ limit })}`),
    recordHistory: (entityId: string, module: ModuleId, action: HistoryEntry['action']) =>
      request<{ ok: true }>('POST', '/me/history', { entityId, module, action }),
    clearHistory: () => request<{ ok: true }>('DELETE', '/me/history', {}),
    deleteAccount: (password: string) => request<{ ok: true }>('DELETE', '/me', { password }),
    exportUrl: '/api/v1/me/export',
  },

  academy: {
    evaluateQuiz: (answers: Array<{ questionId: string; selected: string[] }>, contextId?: string) =>
      request<QuizEvaluation>('POST', '/academy/quiz/evaluate', { answers, contextId }),
  },

  market: {
    inquire: (offerSlug: string, message: string) =>
      request<{ id: string; createdAt: string; notice: string }>('POST', `/market/offers/${encodeURIComponent(offerSlug)}/inquiries`, { message }),
    inquiries: () => request<{ items: Array<{ id: string; offerId: string; message: string; createdAt: string }> }>('GET', '/market/inquiries'),
  },

  copilot: {
    status: () => request<{ mode: 'llm' | 'retrieval' }>('GET', '/copilot/status'),
    ask: (question: string, contextId?: string) => request<CopilotAnswer>('POST', '/copilot/ask', { question, contextId }),
  },

  admin: {
    users: () => request<{ items: PublicUser[] }>('GET', '/admin/users'),
    setRole: (id: string, role: PublicUser['role']) => request<{ user: PublicUser }>('PATCH', `/admin/users/${id}`, { role }),
  },
};
