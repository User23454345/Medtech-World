import { describe, expect, it } from 'vitest';
import type { EntityDetail } from '@medtech/core';
import { findScenarioForFault, incomingSimulations, resolveInitialScenario, simulationRunPath, simulatorActions, type Scenario } from './logic.ts';
import { autoRange, buildLanes, gridStep, viewWindow } from './chart-math.ts';

const scenarios: Scenario[] = [
  { id: 'normal', title: 'Normal', description: '', params: {} },
  { id: 'bewegung', title: 'Bewegung', description: '', params: {}, fault: 'fault:spo2-bewegungsartefakte' },
  { id: 'fremdlicht', title: 'Fremdlicht', description: '', params: {}, fault: 'fault:spo2-bewegungsartefakte' },
];

function entity(partial: Partial<EntityDetail>): EntityDetail {
  return { id: 'device:x', type: 'device', slug: 'x', title: 'X', summary: '', tags: [], demo: false, reviewStatus: 'geprueft', flags: [], aliases: [], body: '', data: {}, specs: [], sources: [], relations: [], reviewedAt: '', modules: [], linkedTitles: {}, ...partial } as EntityDetail;
}

const simRel = {
  rel: 'simulates' as const,
  direction: 'in' as const,
  label: 'Simulationen',
  items: [{ id: 'simulation:pulsoximetrie', type: 'simulation' as const, slug: 'pulsoximetrie', title: 'Sim', summary: '', tags: [], demo: false, reviewStatus: 'geprueft' as const, flags: [] }],
};

describe('Simulator-Logik', () => {
  it('findet Szenarien zu Fehlerbildern', () => {
    expect(findScenarioForFault(scenarios, 'fault:spo2-bewegungsartefakte')?.id).toBe('bewegung');
    expect(findScenarioForFault(scenarios, 'fault:anderes')).toBeUndefined();
    expect(findScenarioForFault(undefined, 'fault:x')).toBeUndefined();
  });

  it('Startszenario: ?szenario vor ?fehler vor erstem Szenario', () => {
    expect(resolveInitialScenario(scenarios, 'fremdlicht', 'fault:spo2-bewegungsartefakte')?.id).toBe('fremdlicht');
    expect(resolveInitialScenario(scenarios, 'gibtsnicht', 'fault:spo2-bewegungsartefakte')?.id).toBe('bewegung');
    expect(resolveInitialScenario(scenarios, null, null)?.id).toBe('normal');
    expect(resolveInitialScenario([], null, null)).toBeUndefined();
  });

  it('Pfade', () => {
    expect(simulationRunPath('simulation:pulsoximetrie')).toBe('/simulator/pulsoximetrie');
    expect(simulationRunPath('simulation:pulsoximetrie', 'bewegung')).toBe('/simulator/pulsoximetrie?szenario=bewegung');
  });

  it('Aktionen: Simulation starten', () => {
    expect(simulatorActions(entity({ id: 'simulation:pulsoximetrie', type: 'simulation' }))).toEqual([{ label: 'Simulation starten', to: '/simulator/pulsoximetrie', icon: 'play' }]);
  });

  it('Aktionen: Gerät/Begriff mit eingehender simulates-Relation', () => {
    const e = entity({ relations: [simRel] });
    expect(incomingSimulations(e)).toEqual(['simulation:pulsoximetrie']);
    expect(simulatorActions(e)[0]).toEqual({ label: 'Im Simulator öffnen', to: '/simulator/pulsoximetrie', icon: 'play' });
    expect(simulatorActions(entity({ relations: [{ ...simRel, direction: 'out' }] }))).toEqual([]);
    expect(simulatorActions(entity({ type: 'manufacturer', relations: [simRel] }))).toEqual([]);
  });

  it('Aktionen: Fehlerbild öffnet passendes Szenario (oder ?fehler= als Rückfall)', () => {
    const f = entity({ id: 'fault:spo2-bewegungsartefakte', type: 'fault', relations: [simRel] });
    expect(simulatorActions(f, () => scenarios)[0]!.to).toBe('/simulator/pulsoximetrie?szenario=bewegung');
    expect(simulatorActions(f)[0]!.to).toBe('/simulator/pulsoximetrie?fehler=fault%3Aspo2-bewegungsartefakte');
  });
});

describe('Kurvendarstellung', () => {
  const tr = (id: string, pts: Array<[number, number]>, lane?: string, range?: [number, number]) => ({ id, label: id, unit: '', color: '#000', points: pts, lane, range });
  it('gruppiert Spuren und nutzt feste Bereiche', () => {
    const lanes = buildLanes([tr('a', [[0, 1]], 'p', [0, 10]), tr('b', [[0, 2]], 'p'), tr('c', [[0, 5], [1, 7]])]);
    expect(lanes.map((l) => l.id)).toEqual(['p', 'c']);
    expect(lanes[0]!.range).toEqual([0, 10]);
    expect(lanes[1]!.range[0]).toBeLessThan(5);
    expect(lanes[1]!.range[1]).toBeGreaterThan(7);
  });
  it('autoRange bei konstanten Werten und leeren Kurven', () => {
    expect(autoRange([tr('a', [[0, 0], [1, 0]])])).toEqual([-1, 1]);
    expect(autoRange([tr('a', [])])).toEqual([0, 1]);
  });
  it('Zeitfenster und Raster', () => {
    expect(viewWindow(10, 6)).toEqual([4, 10]);
    expect(viewWindow(100, 1800, true)).toEqual([0, 1800]);
    expect(viewWindow(2000, 1800, true)).toEqual([200, 2000]);
    expect(gridStep(6)).toBe(1);
    expect(gridStep(1800)).toBe(300);
  });
});
