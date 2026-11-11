import { lazy } from 'react';
import type { WebModule } from '../types.ts';

export const module: WebModule = {
  id: 'copilot',
  Root: lazy(() => import('./Root.tsx')),
};
