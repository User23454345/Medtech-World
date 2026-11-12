import { lazy } from 'react';
import type { WebModule } from '../types.ts';

// Panels liegen in einem eigenen Chunk und werden erst auf der Detailseite geladen.
const load = () => import('./panels/WikiPanels.tsx');
const DevicePanel = lazy(() => load().then((m) => ({ default: m.DevicePanel })));
const ManufacturerPanel = lazy(() => load().then((m) => ({ default: m.ManufacturerPanel })));
const ProductModelPanel = lazy(() => load().then((m) => ({ default: m.ProductModelPanel })));
const ComponentPanel = lazy(() => load().then((m) => ({ default: m.ComponentPanel })));
const TermPanel = lazy(() => load().then((m) => ({ default: m.TermPanel })));
const LegalReferencePanel = lazy(() => load().then((m) => ({ default: m.LegalReferencePanel })));
const DocumentPanel = lazy(() => load().then((m) => ({ default: m.DocumentPanel })));
const MediaPanel = lazy(() => load().then((m) => ({ default: m.MediaPanel })));

export const module: WebModule = {
  id: 'wiki',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    { types: ['device'], title: 'Steckbrief', icon: 'device', placement: 'main', Component: DevicePanel },
    { types: ['manufacturer'], title: 'Herstellerprofil', icon: 'factory', placement: 'main', Component: ManufacturerPanel },
    { types: ['product_model'], title: 'Modelldaten', icon: 'tag', placement: 'main', Component: ProductModelPanel },
    { types: ['component'], title: 'Steckbrief', icon: 'chip', placement: 'main', Component: ComponentPanel },
    { types: ['term'], title: 'Begriff', icon: 'book', placement: 'main', Component: TermPanel },
    { types: ['legal_reference'], title: 'Rechtsstand', icon: 'scale', placement: 'main', Component: LegalReferencePanel },
    { types: ['document'], title: 'Dokumentangaben', icon: 'file', placement: 'aside', Component: DocumentPanel },
    { types: ['media'], title: 'Abbildung', icon: 'image', placement: 'main', Component: MediaPanel },
  ],
};
