import { describe, expect, it } from 'vitest';
import { normalizeParams } from './types.ts';
import { breathModel, ventilation, waveformAt } from './ventilation.ts';

const P = (o: Record<string, unknown> = {}) => normalizeParams(ventilation, o);
const val = (r: ReturnType<typeof ventilation.simulate>, label: string) => Number(r.readouts.find((x) => x.label === label)!.value.replace(/\./g, '').replace(',', '.'));

describe('ventilation', () => {
  it('ist deterministisch', () => {
    expect(ventilation.simulate(P(), 7.3)).toEqual(ventilation.simulate(P(), 7.3));
  });

  it('PCV: VT ≈ C · (Pinsp − PEEP) bei ausreichend langer Inspiration', () => {
    const m = breathModel(P({ mode: 'PCV', pInsp: 15, peep: 5, compliance: 50, resistance: 5, respRate: 10, ieRatio: 1 }));
    expect(m.tau).toBeCloseTo(0.25, 6);
    expect(m.vtPatient).toBeCloseTo(500, 0);
    expect(m.ppeak).toBe(15);
  });

  it('PCV: Flow fällt exponentiell mit τ = R·C ab', () => {
    const p = P({ mode: 'PCV', pInsp: 15, compliance: 50, resistance: 10, respRate: 10 });
    const m = breathModel(p);
    const f0 = waveformAt(m, p, 0).flow;
    const f1 = waveformAt(m, p, m.tau).flow;
    expect(f1 / f0).toBeCloseTo(Math.exp(-1), 3);
  });

  it('VCV: Ppeak − Pplat = R · Flow, Pplat = PEEP + V/C', () => {
    const p = P({ mode: 'VCV', tidalVolume: 500, compliance: 50, resistance: 10, peep: 5, respRate: 12, ieRatio: 0.5 });
    const m = breathModel(p);
    expect(m.ppeak - m.pplat).toBeCloseTo(10 * m.vcvFlow, 6);
    expect(m.pplat).toBeCloseTo(5 + m.vEI / 50, 6);
    expect(m.vtPatient).toBeCloseTo(500, 6);
  });

  it('VCV: geringere Compliance erhöht die Drücke', () => {
    const a = breathModel(P({ mode: 'VCV', compliance: 50 }));
    const b = breathModel(P({ mode: 'VCV', compliance: 20 }));
    expect(b.pplat).toBeGreaterThan(a.pplat);
    expect(b.ppeak).toBeGreaterThan(a.ppeak);
  });

  it('Leckage reduziert das gelieferte bzw. gemessene Volumen und alarmiert', () => {
    const v = breathModel(P({ mode: 'VCV', leak: 0.3 }));
    expect(v.vtPatient).toBeCloseTo(350, 6);
    const pc = breathModel(P({ mode: 'PCV', leak: 0.3 }));
    expect(pc.vtExp).toBeCloseTo(pc.vtPatient * 0.7, 6);
    expect(ventilation.simulate(P({ leak: 0.3 }), 10).alarms.some((a) => a.startsWith('Leckage'))).toBe(true);
    expect(ventilation.simulate(P({ leak: 0.1 }), 10).alarms.some((a) => a.startsWith('Leckage'))).toBe(false);
  });

  it('alarmiert bei hohem Atemwegsdruck und niedrigem AMV', () => {
    const high = ventilation.simulate(P({ mode: 'VCV', tidalVolume: 600, compliance: 15 }), 10);
    expect(high.alarms.some((a) => a.startsWith('Hoher Atemwegsdruck'))).toBe(true);
    const low = ventilation.simulate(P({ mode: 'PCV', pInsp: 10, peep: 5, compliance: 20, respRate: 10 }), 10);
    expect(val(low, 'AMV')).toBeLessThan(4);
    expect(low.alarms.some((a) => a.startsWith('Niedriges Atemminutenvolumen'))).toBe(true);
    expect(ventilation.simulate(P(), 10).alarms).toEqual([]);
  });

  it('kurze Exspiration bei hoher Resistance → intrinsischer PEEP', () => {
    const m = breathModel(P({ mode: 'VCV', resistance: 40, compliance: 60, respRate: 30, ieRatio: 1 }));
    expect(m.peepIntrinsic).toBeGreaterThan(1);
  });
});
