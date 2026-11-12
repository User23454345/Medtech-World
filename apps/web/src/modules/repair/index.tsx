import { lazy } from 'react';
import type { WebModule } from '../types.ts';

// Panels liegen in einem eigenen Chunk und werden erst auf der Detailseite geladen.
const loadPanels = () => import('./panels.tsx');
const FaultPanel = lazy(() => loadPanels().then((m) => ({ default: m.FaultPanel })));
const KnownFaultsPanel = lazy(() => loadPanels().then((m) => ({ default: m.KnownFaultsPanel })));

const HARDWARE = ['device', 'product_model', 'component'];

export const module: WebModule = {
  id: 'repair',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    { types: ['fault'], title: 'Fehlerbild & Diagnose', icon: 'wrench', placement: 'main', Component: FaultPanel },
    { types: ['device', 'product_model', 'component'], title: 'Bekannte Fehlerbilder', icon: 'alert', placement: 'aside', Component: KnownFaultsPanel },
  ],
  entityActions: (entity) => {
    if (entity.type === 'fault') {
      const steps = (entity.data as { diagnosis?: unknown[] } | null)?.diagnosis;
      if (!Array.isArray(steps) || !steps.length) return [];
      return [{ label: 'Geführte Diagnose starten', to: `/repair/diagnose/${entity.slug}`, icon: 'route' }];
    }
    const hasFaults =
      HARDWARE.includes(entity.type) &&
      entity.relations.some((g) => g.rel === 'affects' && g.direction === 'in' && g.items.some((i) => i.type === 'fault'));
    return hasFaults ? [{ label: 'Fehlerdiagnose', to: `/repair?geraet=${encodeURIComponent(entity.id)}`, icon: 'wrench' }] : [];
  },
};
