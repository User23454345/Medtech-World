import { lazy } from 'react';
import type { WebModule } from '../types.ts';

// Panels liegen in einem eigenen Chunk und werden erst auf der Detailseite geladen.
const loadPanels = () => import('./panels.tsx');
const OfferPanel = lazy(() => loadPanels().then((m) => ({ default: m.OfferPanel })));
const SparePartPanel = lazy(() => loadPanels().then((m) => ({ default: m.SparePartPanel })));
const CompatiblePartsAside = lazy(() => loadPanels().then((m) => ({ default: m.CompatiblePartsAside })));

export const module: WebModule = {
  id: 'market',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    { types: ['offer'], title: 'Angebot (Demo)', icon: 'cart', placement: 'main', Component: OfferPanel },
    { types: ['spare_part'], title: 'Ersatzteil & Kompatibilität', icon: 'box', placement: 'main', Component: SparePartPanel },
    { types: ['device', 'product_model', 'component'], title: 'Ersatzteile & Angebote', icon: 'cart', placement: 'aside', Component: CompatiblePartsAside },
  ],
  entityActions: (entity) => {
    if (entity.type === 'device' || entity.type === 'product_model' || entity.type === 'component') {
      const hasMarketLinks = entity.relations.some((g) => g.direction === 'in' && (g.rel === 'fits' || g.rel === 'offers') && g.items.length > 0);
      return hasMarketLinks ? [{ label: 'Passende Ersatzteile im Market', to: `/market?geraet=${encodeURIComponent(entity.id)}#finder`, icon: 'cart' }] : [];
    }
    if (entity.type === 'offer') return [{ label: 'Im Market ansehen', to: `/market/angebot/${entity.slug}`, icon: 'cart' }];
    return [];
  },
};
