import type { EntityDetail, SimulationData } from '@medtech/core';
import type { EntityAction } from '../types.ts';

/**
 * Reine Hilfslogik des Simulators (ohne React, ohne Engines) –
 * wird auch von index.tsx genutzt und muss daher leichtgewichtig bleiben.
 */

export type Scenario = SimulationData['scenarios'][number];

export const SIM_BASE = '/simulator';

export function slugOf(id: string): string {
  const i = id.indexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

/** Erstes Szenario, das das angegebene Fehlerbild demonstriert */
export function findScenarioForFault(scenarios: readonly Scenario[] | undefined, faultId: string | null | undefined): Scenario | undefined {
  if (!faultId || !scenarios) return undefined;
  return scenarios.find((s) => s.fault === faultId);
}

/**
 * Startszenario aus URL-Parametern: ?szenario=<id> hat Vorrang, sonst ?fehler=<faultId>,
 * sonst das erste Szenario.
 */
export function resolveInitialScenario(scenarios: readonly Scenario[], szenario: string | null, fehler: string | null): Scenario | undefined {
  if (szenario) {
    const s = scenarios.find((x) => x.id === szenario);
    if (s) return s;
  }
  return findScenarioForFault(scenarios, fehler) ?? scenarios[0];
}

export function simulationRunPath(simId: string, scenarioId?: string): string {
  return `${SIM_BASE}/${slugOf(simId)}${scenarioId ? `?szenario=${encodeURIComponent(scenarioId)}` : ''}`;
}

/** Simulationen, die per 'simulates' auf diese Entität verweisen (eingehende Relation) */
export function incomingSimulations(entity: Pick<EntityDetail, 'relations'>): string[] {
  return entity.relations.filter((g) => g.rel === 'simulates' && g.direction === 'in').flatMap((g) => g.items.filter((i) => i.type === 'simulation').map((i) => i.id));
}

/**
 * Aktionen für die einheitliche Detailseite.
 * @param lookupScenarios liefert – falls bereits geladen – die Szenarien einer Simulation (synchron, z. B. aus dem Cache)
 */
export function simulatorActions(entity: EntityDetail, lookupScenarios?: (simId: string) => readonly Scenario[] | undefined): EntityAction[] {
  if (entity.type === 'simulation') return [{ label: 'Simulation starten', to: simulationRunPath(entity.id), icon: 'play' }];
  if (entity.type !== 'device' && entity.type !== 'term' && entity.type !== 'fault') return [];
  const sims = incomingSimulations(entity);
  const first = sims[0];
  if (!first) return [];
  if (entity.type === 'fault') {
    // Bevorzugt die Simulation, deren Szenario dieses Fehlerbild zeigt
    for (const sim of sims) {
      const sc = findScenarioForFault(lookupScenarios?.(sim), entity.id);
      if (sc) return [{ label: 'Im Simulator öffnen', to: simulationRunPath(sim, sc.id), icon: 'play' }];
    }
    // Szenarien noch nicht geladen: Simulator ermittelt das Szenario über ?fehler=
    return [{ label: 'Im Simulator öffnen', to: `${simulationRunPath(first)}?fehler=${encodeURIComponent(entity.id)}`, icon: 'play' }];
  }
  return [{ label: 'Im Simulator öffnen', to: simulationRunPath(first), icon: 'play' }];
}
