import { describe, expect, it } from 'vitest';
import { beatsBetween, cleanEcg, ecgAt, ecgMonitor, measuredHeartRate } from './ecg-monitor.ts';
import { normalizeParams } from './types.ts';

const P = (o: Record<string, unknown> = {}) => normalizeParams(ecgMonitor, o);

describe('ecg-monitor', () => {
  it('ist deterministisch', () => {
    expect(ecgMonitor.simulate(P({ rhythm: 'af', noise: 0.5 }), 33.3)).toEqual(ecgMonitor.simulate(P({ rhythm: 'af', noise: 0.5 }), 33.3));
  });

  it('Sinus: R-Zacke ≈ 1,2 mV, regelmäßige Frequenz', () => {
    const p = P({ heartRate: 60 });
    expect(cleanEcg(p, 5)).toBeGreaterThan(1.1);
    expect(measuredHeartRate(p, 20)).toBeCloseTo(60, 6);
  });

  it('Sinus hat P-Welle, Vorhofflimmern nicht', () => {
    // P-Welle 170 ms vor der R-Zacke
    expect(cleanEcg(P({ heartRate: 60 }), 5 - 0.17)).toBeGreaterThan(0.1);
    expect(Math.abs(cleanEcg(P({ heartRate: 60, rhythm: 'af' }), 0 - 0.17 + 100))).toBeLessThan(0.12);
  });

  it('Vorhofflimmern: unregelmäßige RR-Abstände', () => {
    const beats = beatsBetween('af', 80, 0, 30);
    const rr = beats.slice(1).map((b, i) => b - beats[i]!);
    const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
    const sd = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
    expect(sd / mean).toBeGreaterThan(0.15);
    const sinus = beatsBetween('sinus', 80, 0, 30);
    const rr2 = sinus.slice(1).map((b, i) => b - sinus[i]!);
    expect(Math.max(...rr2) - Math.min(...rr2)).toBeLessThan(1e-9);
  });

  it('VT: breite QRS-Komplexe (breiter als Sinus)', () => {
    const width = (rhythm: string) => {
      const p = P({ heartRate: 60, rhythm });
      let n = 0;
      for (let t = 4.8; t < 5.2; t += 0.001) if (cleanEcg(p, t) > 0.5) n++;
      return n;
    };
    expect(width('vt')).toBeGreaterThan(2 * width('sinus'));
  });

  it('Asystolie ist flach, Elektrode ab ergibt Nulllinie und Alarm', () => {
    const a = ecgMonitor.simulate(P({ rhythm: 'asystole' }), 10);
    expect(Math.max(...a.traces[0]!.points.map(([, v]) => Math.abs(v)))).toBeLessThan(0.1);
    expect(a.alarms).toContain('Asystolie');
    const off = ecgMonitor.simulate(P({ electrodeOff: true, rhythm: 'vf' }), 10);
    expect(off.traces[0]!.points.every(([, v]) => v === 0)).toBe(true);
    expect(off.alarms[0]).toMatch(/^Elektrode ab/);
    expect(off.alarms).not.toContain('Kammerflimmern');
    expect(off.readouts[0]!.value).toBe('–');
  });

  it('Kammerflimmern: chaotisch, keine Frequenz, Alarm', () => {
    const r = ecgMonitor.simulate(P({ rhythm: 'vf' }), 10);
    expect(r.alarms).toContain('Kammerflimmern');
    expect(r.readouts[0]!.value).toBe('–');
    const vs = r.traces[0]!.points.map(([, v]) => v);
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(0.4);
  });

  it('Frequenzalarme und Rauschen', () => {
    expect(ecgMonitor.simulate(P({ heartRate: 150 }), 10).alarms.some((a) => a.startsWith('Herzfrequenz hoch'))).toBe(true);
    expect(ecgMonitor.simulate(P({ heartRate: 40 }), 10).alarms.some((a) => a.startsWith('Herzfrequenz niedrig'))).toBe(true);
    expect(ecgMonitor.simulate(P(), 10).alarms).toEqual([]);
    const p = P({ noise: 1 });
    const diff = Math.abs(ecgAt(p, 3.333) - cleanEcg(p, 3.333)) + Math.abs(ecgAt(p, 3.337) - cleanEcg(p, 3.337));
    expect(diff).toBeGreaterThan(0.01);
  });
});
