import { lazy, Suspense } from 'react';
import type { EntityDetail } from '@medtech/core';
import { Loading } from '@medtech/ui';
import { sceneOf } from './scene-math.ts';
import './explorer.css';

const SceneViewer = lazy(() => import('./SceneViewer.tsx'));

/** Kompakte 3D-Ansicht auf der einheitlichen Detailseite (nur wenn data.scene existiert) */
export default function ScenePanel({ entity }: { entity: EntityDetail }) {
  const scene = sceneOf(entity.data);
  // Ohne Szene nichts anzeigen. Der Marker blendet per CSS (:has) die umgebende,
  // von der Detailseite erzeugte Section-Überschrift aus.
  if (!scene) return <span hidden className="mw-explorer-noscene" />;
  return (
    <Suspense fallback={<Loading label="3D-Ansicht wird geladen …" />}>
      <SceneViewer scene={scene} title={entity.title} compact />
    </Suspense>
  );
}
