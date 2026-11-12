import type { SimulationEngine } from '@medtech/core';
import { ecgMonitor } from './ecg-monitor.ts';
import { electricalSafety } from './electrical-safety.ts';
import { infusionPump } from './infusion-pump.ts';
import { pulseOximetry } from './pulse-oximetry.ts';
import type { Engine } from './types.ts';
import { ventilation } from './ventilation.ts';

export * from './types.ts';

/** Registry aller Simulations-Engines (Schlüssel = data.engine der Simulation) */
export const ENGINES: Record<SimulationEngine, Engine> = {
  'pulse-oximetry': pulseOximetry,
  ventilation,
  'ecg-monitor': ecgMonitor,
  'infusion-pump': infusionPump,
  'electrical-safety': electricalSafety,
};

export function getEngine(id: unknown): Engine | null {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ENGINES, id) ? ENGINES[id as SimulationEngine] : null;
}
