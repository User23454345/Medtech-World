import type { EntityDetail, JobProfileData, LearningModuleData } from '@medtech/core';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useAsync } from '../../lib/hooks.ts';
import { progressMap } from './career-logic.ts';

/** Lernfortschritt der angemeldeten Person (Gäste: kein Abruf). Präfix "me:" wird plattformweit invalidiert. */
export function useCareerProgress() {
  const { user } = useAuth();
  const state = useAsync(() => api.me.progress(), [user?.id], user ? `me:progress:career:${user.id}` : null);
  return { ...state, byId: progressMap(state.data?.items), loggedIn: Boolean(user) };
}

/** Alle Berufsbilder inklusive Relationen (für Lernpfad und Kompetenzcheck) */
export function useJobProfiles() {
  return useAsync<Array<EntityDetail<JobProfileData>>>(
    async (signal) => {
      const list = await api.list({ type: 'job_profile', limit: 200 }, signal);
      return Promise.all(list.items.map((it) => api.entityById<JobProfileData>(it.id, signal)));
    },
    [],
    'career:profiles',
  );
}

/** Voraussetzungen (data.prerequisites) mehrerer Lernmodule – für die Reihenfolge im Lernpfad */
export function usePrerequisites(moduleIds: string[]) {
  const key = moduleIds.join(',');
  return useAsync<Record<string, string[]>>(
    async (signal) => {
      const details = await Promise.all(
        moduleIds.map((id) => api.entityById<LearningModuleData>(id, signal).catch((e: unknown) => {
          if ((e as Error)?.name === 'AbortError') throw e;
          return null;
        })),
      );
      const out: Record<string, string[]> = {};
      for (const d of details) if (d) out[d.id] = d.data?.prerequisites ?? [];
      return out;
    },
    [key],
    moduleIds.length ? `career:prereq:${key}` : null,
  );
}
