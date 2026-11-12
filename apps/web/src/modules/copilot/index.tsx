import { lazy } from 'react';
import { MODULES, type EntityDetail, type EntityType } from '@medtech/core';
import type { EntityAction, WebModule } from '../types.ts';

/** Inhaltstypen, zu denen der Copilot direkt mit Kontext befragt werden kann */
const ASKABLE: EntityType[] = ['device', 'term', 'fault', 'component', 'test_procedure', 'legal_reference'];

function actions(entity: EntityDetail): EntityAction[] {
  if (!ASKABLE.includes(entity.type)) return [];
  return [{ label: 'Copilot fragen', to: `${MODULES.copilot.path}?kontext=${entity.id}`, icon: 'sparkle' }];
}

export const module: WebModule = {
  id: 'copilot',
  Root: lazy(() => import('./Root.tsx')),
  entityActions: actions,
};
