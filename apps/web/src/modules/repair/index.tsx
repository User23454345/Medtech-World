import { lazy } from 'react';
import type { WebModule } from '../types.ts';

export const module: WebModule = {
  id: 'repair',
  Root: lazy(() => import('./Root.tsx')),
};
