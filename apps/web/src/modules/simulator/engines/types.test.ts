import { describe, expect, it } from 'vitest';
import { getEngine, ENGINES } from './index.ts';
import { normalizeParams, sampleTimes, unknownParamKeys } from './types.ts';
import { SIMULATION_ENGINES } from '@medtech/core';

describe('Engine-Grundlagen', () => {
  it('Registry deckt alle Engines aus dem Datenmodell ab', () => {
    for (const id of SIMULATION_ENGINES) expect(getEngine(id)?.id).toBe(id);
    expect(getEngine('unbekannt')).toBeNull();
    expect(getEngine(undefined)).toBeNull();
  });

  it('Standardwerte decken alle Parameter ab und liegen im erlaubten Bereich', () => {
    for (const e of Object.values(ENGINES)) {
      for (const d of e.params) {
        const v = e.defaults[d.key];
        expect(v, `${e.id}.${d.key}`).not.toBeUndefined();
        if (d.type === 'number') {
          expect(v as number).toBeGreaterThanOrEqual(d.min ?? -Infinity);
          expect(v as number).toBeLessThanOrEqual(d.max ?? Infinity);
        }
        if (d.type === 'select') expect(d.options!.some((o) => o.value === v)).toBe(true);
      }
    }
  });

  it('normalizeParams begrenzt, korrigiert Typen und ignoriert Unbekanntes', () => {
    const e = ENGINES['infusion-pump'];
    const p = normalizeParams(e, { rate: 99999, vtbi: '250', airInLine: 'true', foo: 1 });
    expect(p.rate).toBe(1200);
    expect(p.vtbi).toBe(250);
    expect(p.airInLine).toBe(true);
    expect(p.foo).toBeUndefined();
    expect(unknownParamKeys(e, { rate: 1, foo: 2 })).toEqual(['foo']);
    expect(normalizeParams(ENGINES.ventilation, { mode: 'XYZ' }).mode).toBe('PCV');
  });

  it('sampleTimes nutzt ein festes Raster', () => {
    const a = sampleTimes(1.003, 0.02, 100);
    expect(a.map((x) => Math.round(x * 100))).toEqual([99, 100]);
    expect(sampleTimes(5, 10, 1, 0)[0]).toBe(0);
  });

  it('jede zeitabhängige Engine liefert Kurven, Anzeigen und Erklärung', () => {
    for (const e of Object.values(ENGINES)) {
      const r = e.simulate(e.defaults, 10);
      expect(r.readouts.length).toBeGreaterThan(0);
      expect(r.explanation.length).toBeGreaterThan(20);
      if (e.timebase) expect(r.traces.length).toBeGreaterThan(0);
      for (const t of r.traces) for (const [, v] of t.points) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
