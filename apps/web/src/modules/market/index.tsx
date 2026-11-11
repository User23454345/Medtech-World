import { lazy } from 'react';
import type { WebModule } from '../types.ts';

export const module: WebModule = {
  id: 'market',
  Root: lazy(() => import('./Root.tsx')),
};
