import { lazy } from 'react';
import type { SimulationData } from '@medtech/core';
import { cache } from '../../lib/cache.ts';
import type { WebModule } from '../types.ts';
import { simulatorActions } from './logic.ts';

/** Szenarien einer Simulation, sofern sie bereits im Client-Cache liegt (kein Netzwerkzugriff) */
function cachedScenarios(simId: string) {
  const hit = cache.get(`entity:${simId}`)?.value as { data?: Partial<SimulationData> } | undefined;
  return hit?.data?.scenarios;
}

export const module: WebModule = {
  id: 'simulator',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    {
      types: ['simulation'],
      title: 'Simulation',
      icon: 'pulse',
      placement: 'main',
      Component: lazy(() => import('./components/SimulationPanel.tsx')),
    },
  ],
  entityActions: (entity) => simulatorActions(entity, cachedScenarios),
};
