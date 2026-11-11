import { lazy } from 'react';
import type { WebModule } from '../types.ts';

export const module: WebModule = {
  id: 'explorer',
  Root: lazy(() => import('./Root.tsx')),
};
