import { describe, expect, it } from 'vitest';
import {
  buildTree,
  decodeAnswers,
  detectCycles,
  encodeAnswers,
  getNode,
  isTreeUsable,
  maxRemaining,
  nextNode,
  progressPercent,
  reachableIds,
  unreachable,
  validateTree,
  walk,
  type DiagnosisTreeInput,
} from './diagnosis.ts';

const step = (id: string, yes: string, no: string) => ({ id, instruction: `Anweisung ${id}`, question: `Frage ${id}?`, yes, no });

/** Struktur wie fault:spo2-kein-signal */
const linear: DiagnosisTreeInput = {
  diagnosis: [step('s1', 'o1', 's2'), step('s2', 'o2', 's3'), step('s3', 'o3', 's4'), step('s4', 'o4', 'o5')],
  outcomes: ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => ({ id, text: `Ergebnis ${id}` })),
};

describe('buildTree / getNode / nextNode', () => {
  it('nimmt den ersten Schritt als Start', () => {
    const t = buildTree(linear);
    expect(t.start).toBe('s1');
    expect(getNode(t, 's2')?.kind).toBe('step');
    expect(getNode(t, 'o3')?.kind).toBe('outcome');
    expect(getNode(t, 'x')).toBeNull();
    expect(getNode(t, null)).toBeNull();
  });
  it('liefert den Folgeknoten je Antwort', () => {
    const t = buildTree(linear);
    expect(nextNode(t, 's1', 'yes')).toEqual({ kind: 'outcome', outcome: { id: 'o1', text: 'Ergebnis o1' } });
    const n = nextNode(t, 's1', 'no');
    expect(n?.kind === 'step' && n.step.id).toBe('s2');
    expect(nextNode(t, 'unbekannt', 'yes')).toBeNull();
  });
  it('leerer Baum hat keinen Start', () => {
    expect(buildTree({ diagnosis: [], outcomes: [] }).start).toBeNull();
  });
});

describe('walk', () => {
  const t = buildTree(linear);
  it('steht ohne Antworten am Startschritt', () => {
    const r = walk(t, []);
    expect(r.path).toEqual([]);
    expect(r.state).toMatchObject({ status: 'step', step: { id: 's1' } });
  });
  it('folgt den Antworten und baut den Pfad auf', () => {
    const r = walk(t, ['no', 'no']);
    expect(r.path.map((p) => `${p.step.id}:${p.answer}`)).toEqual(['s1:no', 's2:no']);
    expect(r.state).toMatchObject({ status: 'step', step: { id: 's3' } });
  });
  it('endet am Ergebnis und ignoriert überzählige Antworten', () => {
    const r = walk(t, ['yes', 'no', 'no']);
    expect(r.state).toMatchObject({ status: 'outcome', outcome: { id: 'o1' } });
    expect(r.consumed).toBe(1);
  });
  it('erreicht das tiefste Ergebnis', () => {
    expect(walk(t, ['no', 'no', 'no', 'no']).state).toMatchObject({ status: 'outcome', outcome: { id: 'o5' } });
  });
  it('meldet defekte Verweise', () => {
    const b = buildTree({ diagnosis: [step('s1', 'fehlt', 'o1')], outcomes: [{ id: 'o1', text: '' }] });
    expect(walk(b, ['yes']).state).toEqual({ status: 'broken', missingId: 'fehlt', from: 's1' });
  });
  it('bricht bei Zyklen ab statt endlos zu laufen', () => {
    const c = buildTree({ diagnosis: [step('a', 'b', 'o'), step('b', 'a', 'o')], outcomes: [{ id: 'o', text: '' }] });
    expect(walk(c, ['yes', 'yes', 'yes']).state).toEqual({ status: 'cycle', stepId: 'a' });
  });
  it('leerer Baum', () => {
    expect(walk(buildTree({ diagnosis: [], outcomes: [] }), []).state).toEqual({ status: 'empty' });
  });
});

describe('detectCycles / reachability', () => {
  it('erkennt keinen Zyklus im gültigen Baum', () => {
    expect(detectCycles(buildTree(linear))).toEqual([]);
  });
  it('findet einen Zyklus über mehrere Schritte und Selbstverweise', () => {
    const t = buildTree({ diagnosis: [step('a', 'b', 'o'), step('b', 'c', 'o'), step('c', 'a', 'c')], outcomes: [{ id: 'o', text: '' }] });
    const cycles = detectCycles(t);
    expect(cycles).toContainEqual(['a', 'b', 'c']);
    expect(cycles).toContainEqual(['c']);
  });
  it('findet unerreichbare Schritte und Ergebnisse', () => {
    const input: DiagnosisTreeInput = {
      diagnosis: [step('s1', 'o1', 'o1'), step('waise', 'o2', 'o1')],
      outcomes: [{ id: 'o1', text: '' }, { id: 'o2', text: '' }, { id: 'o3', text: '' }],
    };
    const t = buildTree(input);
    expect([...reachableIds(t)].sort()).toEqual(['o1', 's1']);
    expect(unreachable(t)).toEqual({ steps: ['waise'], outcomes: ['o2', 'o3'] });
  });
});

describe('validateTree', () => {
  it('akzeptiert einen gültigen Baum', () => {
    expect(validateTree(linear)).toEqual([]);
    expect(isTreeUsable(linear)).toBe(true);
  });
  it('meldet leere Bäume', () => {
    expect(validateTree({ diagnosis: [], outcomes: [] }).map((i) => i.code)).toEqual(['empty']);
    expect(isTreeUsable({ diagnosis: [], outcomes: [] })).toBe(false);
  });
  it('meldet unbekannte Ziele, Duplikate, Kollisionen, Zyklen und Unerreichbares', () => {
    const codes = validateTree({
      diagnosis: [step('s1', 's2', 'nirgends'), step('s2', 's1', 'o1'), step('s2', 'o1', 'o1'), step('s3', 's3', 'o1')],
      outcomes: [{ id: 'o1', text: '' }, { id: 's3', text: '' }, { id: 'o9', text: '' }],
    }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['duplicate-id', 'id-collision', 'unknown-target', 'cycle', 'self-loop', 'unreachable-step', 'unreachable-outcome']));
    expect(codes).not.toContain('empty');
  });
  it('meldet fehlende Ergebnisse', () => {
    expect(validateTree({ diagnosis: [step('s1', 's1', 's1')], outcomes: [] }).map((i) => i.code)).toContain('no-outcomes');
  });
});

describe('Fortschritt', () => {
  const t = buildTree(linear);
  it('berechnet den längsten Restpfad', () => {
    expect(maxRemaining(t, 's1')).toBe(4);
    expect(maxRemaining(t, 's4')).toBe(1);
    expect(maxRemaining(t, 'o1')).toBe(0);
  });
  it('liefert Prozentwerte', () => {
    expect(progressPercent(t, walk(t, []))).toBe(0);
    expect(progressPercent(t, walk(t, ['no', 'no']))).toBe(50);
    expect(progressPercent(t, walk(t, ['yes']))).toBe(100);
  });
  it('terminiert bei Zyklen', () => {
    const c = buildTree({ diagnosis: [step('a', 'b', 'o'), step('b', 'a', 'o')], outcomes: [{ id: 'o', text: '' }] });
    expect(maxRemaining(c, 'a')).toBeGreaterThan(0);
  });
});

describe('encode/decodeAnswers', () => {
  it('ist umkehrbar', () => {
    expect(encodeAnswers(['yes', 'no', 'no'])).toBe('jnn');
    expect(decodeAnswers('jnn')).toEqual(['yes', 'no', 'no']);
  });
  it('verwirft ungültige Eingaben', () => {
    expect(decodeAnswers('jx')).toEqual([]);
    expect(decodeAnswers(null)).toEqual([]);
    expect(decodeAnswers('')).toEqual([]);
  });
});
