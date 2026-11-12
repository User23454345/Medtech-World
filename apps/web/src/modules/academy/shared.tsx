import type { EntityDetail, EntityType, ProgressEntry } from '@medtech/core';
import { Badge } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useAsync } from '../../lib/hooks.ts';
import { LEVEL_LABELS, type LearningLevel } from './academy-logic.ts';
import './academy.css';

/** Lernfortschritt der angemeldeten Person (Gäste: leer). Cache-Präfix "me:progress" wird nach Änderungen invalidiert. */
export function useProgress() {
  const { user } = useAuth();
  const state = useAsync(() => api.me.progress(), [user?.id], user ? `me:progress:academy:${user.id}` : null);
  const byId = new Map<string, ProgressEntry>((state.data?.items ?? []).map((p) => [p.entityId, p]));
  return { ...state, byId, loggedIn: Boolean(user) };
}

/** Lädt alle Inhalte eines Typs inkl. Detaildaten (für typspezifische Felder wie Niveau oder Prüfart). */
export function useDetailsOfType<TData>(type: EntityType) {
  return useAsync(
    async (signal) => {
      const list = await api.list({ type, limit: 200 }, signal);
      return Promise.all(list.items.map((it) => api.entityById<TData>(it.id, signal)));
    },
    [type],
    `academy:details:${type}`,
  );
}

/** Lädt mehrere Entitäten per ID (z. B. Quizfragen eines Lernmoduls) */
export function useEntitiesById<TData>(ids: string[]) {
  const key = ids.join(',');
  return useAsync<Array<EntityDetail<TData>>>(
    (signal) => Promise.all(ids.map((id) => api.entityById<TData>(id, signal))),
    [key],
    ids.length ? `academy:many:${key}` : null,
  );
}

export function LevelBadge({ level }: { level: LearningLevel }) {
  return (
    <Badge icon="target" tone="info">
      {LEVEL_LABELS[level] ?? level}
    </Badge>
  );
}

export function ProgressBadge({ entry }: { entry: ProgressEntry | undefined }) {
  if (!entry) return null;
  if (entry.status === 'completed')
    return (
      <Badge tone="ok" icon="check">
        Abgeschlossen{entry.score !== null ? ` · ${entry.score} %` : ''}
      </Badge>
    );
  return (
    <Badge tone="warn" icon="history">
      Begonnen{entry.score !== null ? ` · ${entry.score} %` : ''}
    </Badge>
  );
}
