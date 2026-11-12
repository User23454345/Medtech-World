import { describe, expect, it } from 'vitest';
import { electricalSafety, evaluateSafety } from './electrical-safety.ts';
import { normalizeParams } from './types.ts';

const P = (o: Record<string, unknown> = {}) => normalizeParams(electricalSafety, o);
const res = (o: Record<string, unknown>, id: string) => evaluateSafety(P(o)).checks.find((c) => c.id === id)!;

describe('electrical-safety (DIN EN 62353)', () => {
  it('ist deterministisch', () => {
    expect(electricalSafety.simulate(P(), 0)).toEqual(electricalSafety.simulate(P(), 0));
  });

  it('Schutzleiterwiderstand ≤ 0,3 Ω nur bei Schutzklasse I', () => {
    expect(res({ peResistance: 0.3 }, 'pe').result).toBe('pass');
    expect(res({ peResistance: 0.31 }, 'pe').result).toBe('fail');
    expect(res({ protectionClass: 'II', peResistance: 1.5 }, 'pe').result).toBe('na');
  });

  it('Geräteableitstrom: Grenzwerte je Verfahren und Schutzklasse', () => {
    const cases: Array<[string, string, number]> = [
      ['ersatz', 'I', 1000],
      ['ersatz', 'II', 500],
      ['direkt', 'I', 500],
      ['direkt', 'II', 100],
    ];
    for (const [method, protectionClass, limit] of cases) {
      expect(res({ method, protectionClass, equipmentLeakage: limit }, 'equipment').result).toBe('pass');
      expect(res({ method, protectionClass, equipmentLeakage: limit + 1 }, 'equipment').result).toBe('fail');
    }
  });

  it('Anwendungsteil: BF ≤ 5000 µA, CF ≤ 50 µA, B nicht gefordert', () => {
    expect(res({ appliedPart: 'BF', appliedPartLeakage: 5000 }, 'applied').result).toBe('pass');
    expect(res({ appliedPart: 'BF', appliedPartLeakage: 5001 }, 'applied').result).toBe('fail');
    expect(res({ appliedPart: 'CF', appliedPartLeakage: 50 }, 'applied').result).toBe('pass');
    expect(res({ appliedPart: 'CF', appliedPartLeakage: 51 }, 'applied').result).toBe('fail');
    const b = res({ appliedPart: 'B', appliedPartLeakage: 9999 }, 'applied');
    expect(b.result).toBe('na');
    expect(b.limit).toBe('nicht gefordert');
  });

  it('Gesamtbewertung: nur bestanden, wenn alle Prüfungen bestanden', () => {
    const ok = electricalSafety.simulate(P(), 0);
    expect(ok.verdict?.pass).toBe(true);
    expect(ok.alarms).toEqual([]);
    const bad = electricalSafety.simulate(P({ appliedPart: 'CF', appliedPartLeakage: 80, peResistance: 0.5 }), 0);
    expect(bad.verdict?.pass).toBe(false);
    expect(bad.alarms).toHaveLength(2);
    expect(bad.traces).toEqual([]);
  });
});
