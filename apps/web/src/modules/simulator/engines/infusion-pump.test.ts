import { describe, expect, it } from 'vitest';
import { AIR_DETECT_AFTER, LINE_COMPLIANCE, baselinePressure, bolusVolume, fmtDuration, niceCeil, infusionPump, pumpState, timeToOcclusionAlarm } from './infusion-pump.ts';
import { normalizeParams } from './types.ts';

const P = (o: Record<string, unknown> = {}) => normalizeParams(infusionPump, o);

describe('infusion-pump', () => {
  it('ist deterministisch', () => {
    expect(infusionPump.simulate(P({ occlusionAfterMin: 5 }), 900)).toEqual(infusionPump.simulate(P({ occlusionAfterMin: 5 }), 900));
  });

  it('fördert Volumen = Rate · Zeit und stoppt bei VTBI', () => {
    const p = P({ rate: 100, vtbi: 500 });
    expect(pumpState(p, 3600).pumped).toBeCloseTo(100, 6);
    const end = pumpState(p, 6 * 3600);
    expect(end.pumped).toBeCloseTo(500, 6);
    expect(end.stopReason).toBe('vtbi');
    expect(infusionPump.simulate(p, 6 * 3600).alarms[0]).toMatch(/^VTBI erreicht/);
  });

  it('Okklusion: Druck steigt mit Rate/C bis zur Grenze, dann Alarm', () => {
    const p = P({ rate: 120, occlusionAfterMin: 5, pressureLimit: 300 });
    const tOcc = 300;
    const s = pumpState(p, tOcc + 2);
    expect(s.pressure).toBeCloseTo(baselinePressure(120) + ((120 / 3600) * 2) / LINE_COMPLIANCE, 6);
    expect(s.delivered).toBeCloseTo(10, 6);
    const tta = timeToOcclusionAlarm(120, 300);
    expect(pumpState(p, tOcc + tta - 0.5).stopReason).toBeNull();
    const after = pumpState(p, tOcc + tta + 1);
    expect(after.stopReason).toBe('occlusion');
    expect(after.pressure).toBeCloseTo(300, 6);
    expect(infusionPump.simulate(p, tOcc + tta + 1).alarms[0]).toMatch(/^Okklusion/);
  });

  it('niedrige Rate und hohe Druckgrenze verlängern die Zeit bis zum Alarm', () => {
    expect(timeToOcclusionAlarm(2, 300)).toBeGreaterThan(timeToOcclusionAlarm(120, 300) * 30);
    expect(timeToOcclusionAlarm(2, 900)).toBeGreaterThan(timeToOcclusionAlarm(2, 300) * 2.5);
    // 2 ml/h, 300 mmHg: (300 − 10,1) µl / (2/3600 ml/s) ≈ 522 s
    expect(timeToOcclusionAlarm(2, 300)).toBeCloseTo(521.82, 1);
  });

  it('Bolusvolumen beim Lösen wächst mit dem Druck', () => {
    expect(bolusVolume(2, 900)).toBeGreaterThan(bolusVolume(2, 300));
    expect(bolusVolume(2, 900)).toBeCloseTo((900 - baselinePressure(2)) * LINE_COMPLIANCE, 9);
  });

  it('Luft in der Leitung stoppt die Pumpe mit Alarm', () => {
    const p = P({ airInLine: true });
    expect(pumpState(p, AIR_DETECT_AFTER - 1).running).toBe(true);
    const s = pumpState(p, AIR_DETECT_AFTER + 10);
    expect(s.stopReason).toBe('air');
    expect(s.pumped).toBeCloseTo((100 / 3600) * AIR_DETECT_AFTER, 6);
    expect(infusionPump.simulate(p, AIR_DETECT_AFTER + 10).alarms[0]).toMatch(/^Luft in der Leitung/);
  });

  it('Okklusion nach dem Stopp (VTBI/Luft) belebt den Druck nicht wieder', () => {
    const p = P({ rate: 100, vtbi: 10, occlusionAfterMin: 10 });
    const s = pumpState(p, 700);
    expect(s.stopReason).toBe('vtbi');
    expect(s.occluded).toBe(false);
    expect(s.pressure).toBe(0);
    const labels = infusionPump.simulate(p, 900).readouts.map((r) => r.label);
    expect(labels).not.toContain('Ohne Förderung seit');
    const air = pumpState(P({ airInLine: true, occlusionAfterMin: 5 }), 600);
    expect(air.stopReason).toBe('air');
    expect(air.pressure).toBe(0);
  });

  it('Achsenskalierung', () => {
    expect(niceCeil(7.3)).toBe(10);
    expect(niceCeil(0.46)).toBeCloseTo(0.5, 9);
    expect(niceCeil(120)).toBe(200);
  });

  it('Zeitformat', () => {
    expect(fmtDuration(8.4)).toBe('8 s');
    expect(fmtDuration(522)).toBe('8 min 42 s');
    expect(fmtDuration(18000)).toBe('5 h 0 min');
  });
});
