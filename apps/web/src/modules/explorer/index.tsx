import { lazy } from 'react';
import type { EntityDetail } from '@medtech/core';
import type { WebModule } from '../types.ts';

/** Leichtgewichtige Prüfung ohne Import der Geometrie-Hilfen */
function hasScene(entity: EntityDetail): boolean {
  const scene = (entity.data as { scene?: { parts?: unknown[] } } | null)?.scene;
  return Array.isArray(scene?.parts) && scene.parts.length > 0;
}

export const module: WebModule = {
  id: 'explorer',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    {
      types: ['device', 'product_model'],
      title: '3D-Ansicht',
      icon: 'cube',
      placement: 'main',
      Component: lazy(() => import('./ScenePanel.tsx')),
    },
  ],
  entityActions: (entity) =>
    (entity.type === 'device' || entity.type === 'product_model') && hasScene(entity)
      ? [{ label: 'In 3D erkunden', to: `/explorer/${entity.type}/${entity.slug}`, icon: 'cube' }]
      : [],
};
