import { lazy } from 'react';
import type { WebModule } from '../types.ts';

export const module: WebModule = {
  id: 'simulator',
  Root: lazy(() => import('./Root.tsx')),
};
