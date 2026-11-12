import { describe, expect, it } from 'vitest';
import { analyze, pulseOximetry, ratioFromSaturation, saturationFromRatio } from './pulse-oximetry.ts';
import { normalizeParams } from './types.ts';

const P = (o: Record<string, unknown> = {}) => normalizeParams(pulseOximetry, o);

describe('pulse-oximetry', () => {
  it('ist deterministisch', () => {
    const a = pulseOximetry.simulate(P({ motion: 0.5, ambientLight: 0.4 }), 12.34);
    const b = pulseOximetry.simulate(P({ motion: 0.5, ambientLight: 0.4 }), 12.34);
    expect(a).toEqual(b);
  });

  it('Kalibrierung SpO₂ ≈ 110 − 25·R ist umkehrbar', () => {
    expect(ratioFromSaturation(97)).toBeCloseTo(0.52, 5);
    expect(saturationFromRatio(1)).toBe(85);
    for (const s of [60, 80, 90, 100]) expect(saturationFromRatio(ratioFromSaturation(s))).toBeCloseTo(s, 6);
  });

  it('ohne Störungen entspricht die angezeigte SpO₂ der wahren Sättigung', () => {
    for (const s of [97, 84, 70]) {
      const a = analyze(P({ saturation: s }), 10);
      expect(a.valid).toBe(true);
      expect(Math.abs(a.spo2Raw - s)).toBeLessThan(1);
    }
  });

  it('niedrigere Sättigung → höheres R', () => {
    expect(analyze(P({ saturation: 84 }), 10).ratio).toBeGreaterThan(analyze(P({ saturation: 97 }), 10).ratio);
  });

  it('Perfusionsindex skaliert den AC-Anteil', () => {
    expect(analyze(P({ perfusion: 6 }), 10).piMeasured).toBeCloseTo(6, 0);
    expect(analyze(P({ perfusion: 1 }), 10).piMeasured).toBeCloseTo(1, 0);
  });

  it('starke Bewegung → kein gültiger Wert, R strebt gegen 1 (≈ 85 %)', () => {
    const a = analyze(P({ saturation: 97, motion: 1 }), 10);
    expect(a.valid).toBe(false);
    expect(a.ratio).toBeGreaterThan(0.7);
    const r = pulseOximetry.simulate(P({ saturation: 97, motion: 1 }), 10);
    expect(r.readouts[0]!.value).toBe('–');
    expect(r.alarms.some((x) => x.startsWith('Signal ungenügend'))).toBe(true);
  });

  it('geringe Perfusion und Fremdlicht senken das Signal-Rausch-Verhältnis', () => {
    const base = analyze(P(), 10).snr;
    expect(analyze(P({ perfusion: 0.2 }), 10).snr).toBeLessThan(base);
    expect(analyze(P({ ambientLight: 0.7 }), 10).snr).toBeLessThan(base);
    expect(pulseOximetry.simulate(P({ perfusion: 0.2 }), 10).alarms).toContain('Geringe Perfusion');
  });

  it('alarmiert bei SpO₂ < 90 %', () => {
    expect(pulseOximetry.simulate(P({ saturation: 84 }), 10).alarms.some((a) => a.startsWith('SpO₂ niedrig'))).toBe(true);
    expect(pulseOximetry.simulate(P({ saturation: 97 }), 10).alarms).toEqual([]);
  });

  it('liefert Rot-, IR- und Pleth-Kurven im 6-s-Fenster', () => {
    const r = pulseOximetry.simulate(P(), 20);
    expect(r.traces.map((t) => t.id)).toEqual(['pleth', 'ir', 'red']);
    const pts = r.traces[0]!.points;
    expect(pts[pts.length - 1]![0]).toBeCloseTo(20, 6);
    expect(pts[0]![0]).toBeCloseTo(14, 6);
  });
});
