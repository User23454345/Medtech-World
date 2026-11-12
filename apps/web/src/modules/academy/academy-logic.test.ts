import { describe, expect, it } from 'vitest';
import type { EntitySummary, ProgressEntry, RelationGroup, SpecRow } from '@medtech/core';
import {
  answeredCount,
  buildAnswerPayload,
  checkAgainstLimit,
  clampIndex,
  evaluateProtocol,
  filterByLevel,
  firstTeachingModule,
  formatDuration,
  groupByKind,
  initialProtocol,
  isMultipleChoice,
  isQuizComplete,
  normalizeProtocol,
  optionOutcome,
  shuffledOptions,
  parseGermanNumber,
  parseLimit,
  progressSummary,
  quizQuestionIds,
  shouldMarkStarted,
  specsForStep,
  stripNumbering,
  toggleOption,
  updateStep,
  type StepState,
} from './academy-logic.ts';

const summary = (id: string): EntitySummary & { note?: string } => {
  const [type, slug] = id.split(':') as [EntitySummary['type'], string];
  return { id, type, slug, title: slug, summary: '', tags: [], demo: false, reviewStatus: 'geprueft', flags: [] };
};

const src = { id: 'src:x', title: 'X', publisher: 'Y', kind: 'norm' as const, accessedAt: '2026-01-01' };
const spec = (key: string, label: string, value: string | number, unit?: string): SpecRow => ({ key, label, value, unit, source: src });

describe('Relationen', () => {
  const relations: RelationGroup[] = [
    { rel: 'quiz_for', direction: 'in', label: 'Quizfragen', items: [summary('quiz_question:a'), summary('quiz_question:b'), summary('quiz_question:a')] },
    { rel: 'quiz_for', direction: 'out', label: 'gehört zu', items: [summary('quiz_question:c')] },
    { rel: 'teaches', direction: 'in', label: 'Lernmodule', items: [summary('learning_module:m1'), summary('learning_module:m2')] },
  ];
  it('liefert eingehende Quizfragen ohne Duplikate', () => {
    expect(quizQuestionIds(relations)).toEqual(['quiz_question:a', 'quiz_question:b']);
  });
  it('findet das erste behandelnde Lernmodul', () => {
    expect(firstTeachingModule(relations)?.id).toBe('learning_module:m1');
    expect(firstTeachingModule([])).toBeNull();
  });
});

describe('Quiz', () => {
  it('erkennt Mehrfachauswahl', () => {
    expect(isMultipleChoice({ kind: 'single', multipleAnswers: true })).toBe(true);
    expect(isMultipleChoice({ kind: 'multiple' })).toBe(true);
    expect(isMultipleChoice({ kind: 'truefalse', multipleAnswers: false })).toBe(false);
  });
  it('schaltet Optionen korrekt um', () => {
    expect(toggleOption(['a'], 'b', false)).toEqual(['b']);
    expect(toggleOption(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleOption(['a', 'b'], 'a', true)).toEqual(['b']);
  });
  it('prüft Vollständigkeit und baut die Nutzlast', () => {
    const ids = ['q1', 'q2'];
    expect(isQuizComplete(ids, { q1: ['a'] })).toBe(false);
    expect(answeredCount(ids, { q1: ['a'], q2: [] })).toBe(1);
    expect(isQuizComplete(ids, { q1: ['a'], q2: ['b', 'c'] })).toBe(true);
    expect(isQuizComplete([], {})).toBe(false);
    expect(buildAnswerPayload(ids, { q1: ['a', 'a'] })).toEqual([
      { questionId: 'q1', selected: ['a'] },
      { questionId: 'q2', selected: [] },
    ]);
  });
  it('klassifiziert Optionen nach der Auswertung', () => {
    expect(optionOutcome('a', ['a'], ['a'])).toBe('correct-selected');
    expect(optionOutcome('b', ['a'], ['a', 'b'])).toBe('correct-missed');
    expect(optionOutcome('c', ['c'], ['a'])).toBe('wrong-selected');
    expect(optionOutcome('d', ['a'], ['a'])).toBe('neutral');
  });
});

describe('Lernfortschritt', () => {
  const entry = (entityId: string, status: 'started' | 'completed'): ProgressEntry => ({ entityId, status, score: null, updatedAt: '', entity: null });
  it('fasst den Fortschritt zusammen', () => {
    const s = progressSummary(['m1', 'm2', 'm3', 'm4'], [entry('m1', 'completed'), entry('m2', 'started'), entry('x', 'completed')]);
    expect(s).toEqual({ total: 4, completed: 1, started: 1, percent: 25 });
    expect(progressSummary([], []).percent).toBe(0);
  });
  it('stuft abgeschlossene Module nicht zurück', () => {
    expect(shouldMarkStarted(undefined)).toBe(true);
    expect(shouldMarkStarted(entry('m1', 'completed'))).toBe(false);
    expect(shouldMarkStarted(entry('m1', 'started'))).toBe(false);
  });
  it('begrenzt Indizes und formatiert Dauern', () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(2, 0)).toBe(0);
    expect(formatDuration(45)).toBe('45 Min.');
    expect(formatDuration(90)).toBe('1 Std. 30 Min.');
    expect(formatDuration(120)).toBe('2 Std.');
  });
  it('filtert nach Niveau und gruppiert Prüfverfahren', () => {
    const mods = [
      { id: '1', data: { level: 'einsteiger' as const } },
      { id: '2', data: { level: 'experte' as const } },
    ];
    expect(filterByLevel(mods, 'experte').map((m) => m.id)).toEqual(['2']);
    expect(filterByLevel(mods, 'alle')).toHaveLength(2);
    const groups = groupByKind([
      { title: 'B', data: { kind: 'MTK' as const } },
      { title: 'Z', data: { kind: 'STK' as const } },
      { title: 'A', data: { kind: 'STK' as const } },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['STK', 'MTK']);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['A', 'Z']);
  });
});

describe('Grenzwerte', () => {
  const specs = [
    spec('schutzleiterwiderstand_max', 'Schutzleiterwiderstand (inkl. Netzleitung)', '≤ 0,3', 'Ω'),
    spec('geraeteableitstrom_ersatz_sk1', 'Ersatz-Geräteableitstrom, Schutzklasse I', '≤ 1000', 'µA'),
    spec('geraeteableitstrom_direkt_sk2', 'Geräteableitstrom, Schutzklasse II', '≤ 100', 'µA'),
    spec('ableitstrom_anwendungsteil_cf', 'Ableitstrom vom Anwendungsteil, Typ CF', '≤ 50', 'µA'),
  ];
  it('ordnet Specs den Prüfschritten zu', () => {
    expect(specsForStep('Schutzleiterwiderstand (nur Schutzklasse I)', specs).map((s) => s.key)).toEqual(['schutzleiterwiderstand_max']);
    expect(specsForStep('Geräteableitstrom', specs)).toHaveLength(2);
    expect(specsForStep('Ableitstrom vom Anwendungsteil', specs).map((s) => s.key)).toEqual(['ableitstrom_anwendungsteil_cf']);
    expect(specsForStep('Sichtprüfung', specs)).toEqual([]);
  });
  it('liest deutsche Zahlen', () => {
    expect(parseGermanNumber('0,3')).toBe(0.3);
    expect(parseGermanNumber('1.000')).toBe(1000);
    expect(parseGermanNumber('1.000,5')).toBe(1000.5);
    expect(parseGermanNumber('12.5')).toBe(12.5);
    expect(parseGermanNumber('abc')).toBeNull();
    expect(parseGermanNumber('')).toBeNull();
  });
  it('erkennt Grenzwerte und bewertet Messwerte', () => {
    expect(parseLimit('≤ 0,3')).toEqual({ op: '<=', value: 0.3 });
    expect(parseLimit('max. 500')).toEqual({ op: '<=', value: 500 });
    expect(parseLimit('≥ 2')).toEqual({ op: '>=', value: 2 });
    expect(parseLimit('siehe Hersteller')).toBeNull();
    expect(checkAgainstLimit('0,25', '≤ 0,3')).toBe('ok');
    expect(checkAgainstLimit('0,31', '≤ 0,3')).toBe('exceeded');
    expect(checkAgainstLimit('', '≤ 0,3')).toBeNull();
    expect(checkAgainstLimit('5', 'bestanden')).toBeNull();
  });
});

describe('Prüfprotokoll', () => {
  const st = (p: Partial<StepState>): StepState => ({ done: false, measured: '', verdict: null, note: '', ...p });
  it('ist offen, solange Schritte fehlen', () => {
    const e = evaluateProtocol([st({ done: true, verdict: 'io' }), st({})]);
    expect(e.result).toBe('offen');
    expect(e.missing).toEqual([1]);
  });
  it('ist bestanden, wenn alle Schritte i. O. oder entfallen sind', () => {
    const e = evaluateProtocol([st({ done: true, verdict: 'io' }), st({ verdict: 'entfaellt' })]);
    expect(e.result).toBe('bestanden');
    expect(e.done).toBe(2);
  });
  it('ist nicht bestanden bei einem n. i. O.-Schritt', () => {
    expect(evaluateProtocol([st({ done: true, verdict: 'nio' }), st({})]).result).toBe('nicht-bestanden');
  });
  it('setzt beim Bewerten "durchgeführt"', () => {
    const p = updateStep(initialProtocol(2, '2026-01-01'), 1, { verdict: 'io' });
    expect(p.steps[1]).toMatchObject({ done: true, verdict: 'io' });
    expect(updateStep(p, 5, { done: true })).toBe(p);
  });
  it('normalisiert gespeicherte Protokolle', () => {
    const n = normalizeProtocol({ header: { device: 'Monitor', date: 5 }, steps: [{ done: true, verdict: 'kaputt', measured: '1' }] }, 2, '2026-02-02');
    expect(n.header).toEqual({ device: 'Monitor', inventoryNo: '', inspector: '', date: '2026-02-02' });
    expect(n.steps).toHaveLength(2);
    expect(n.steps[0]).toEqual({ done: true, measured: '1', verdict: null, note: '' });
    expect(normalizeProtocol(null, 1, 'd').steps).toHaveLength(1);
  });
});

describe('Abschnittstitel', () => {
  it('entfernt führende Nummern', () => {
    expect(stripNumbering('1. Was misst ein Pulsoximeter?')).toBe('Was misst ein Pulsoximeter?');
    expect(stripNumbering('2) Aufbau')).toBe('Aufbau');
    expect(stripNumbering('IEC 60601')).toBe('IEC 60601');
  });
});

describe('shuffledOptions', () => {
  const opts = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }));
  it('mischt Einfach-/Mehrfachauswahl, behält alle Options-IDs', () => {
    const out = shuffledOptions({ kind: 'single', options: opts }, () => 0);
    expect(out.map((o) => o.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(out.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(opts.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('lässt Wahr/Falsch-Fragen unverändert', () => {
    expect(shuffledOptions({ kind: 'truefalse', options: opts }, () => 0).map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
