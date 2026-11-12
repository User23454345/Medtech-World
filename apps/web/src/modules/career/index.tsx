import { lazy } from 'react';
import type { WebModule } from '../types.ts';

const JobProfilePanel = lazy(() => import('./panels.tsx').then((m) => ({ default: m.JobProfilePanel })));
const RelevantJobsPanel = lazy(() => import('./panels.tsx').then((m) => ({ default: m.RelevantJobsPanel })));

export const module: WebModule = {
  id: 'career',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    { types: ['job_profile'], title: 'Berufsbild und Lernpfad', icon: 'briefcase', placement: 'main', Component: JobProfilePanel },
    { types: ['learning_module'], title: 'Relevant für Berufsbilder', icon: 'briefcase', placement: 'aside', Component: RelevantJobsPanel },
  ],
};
