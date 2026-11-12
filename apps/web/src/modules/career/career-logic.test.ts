import { describe, expect, it } from 'vitest';
import type { EntitySummary, EntityType, ProgressEntry, RelationGroup } from '@medtech/core';
import {
  computeReadiness,
  itemStatus,
  orderByPrerequisites,
  orderLearningPath,
  pathItemLink,
  progressMap,
  rankByReadiness,
  readinessLabel,
  relevantJobProfiles,
  requiredItems,
  requiredLearningModules,
} from './career-logic.ts';

const e = (id: string): EntitySummary => {
  const [type, slug] = id.split(':') as [EntityType, string];
  return { id, type, slug, title: slug, summary: '', tags: [], demo: false, reviewStatus: 'geprueft', flags: [] };
};
const group = (rel: RelationGroup['rel'], direction: 'in' | 'out', ids: string[]): RelationGroup => ({ rel, direction, label: rel, items: ids.map(e) });
const prog = (entityId: string, status: ProgressEntry['status']): ProgressEntry => ({ entityId, status, score: null, updatedAt: '2026-11-01', entity: null });

const relations: RelationGroup[] = [
  group('requires_skill', 'out', ['learning_module:a', 'test_procedure:stk', 'learning_module:b', 'term:spo2', 'device:pumpe', 'learning_module:c']),
  group('related', 'out', ['learning_module:x']),
  group('requires_skill', 'in', ['job_profile:fremd']),
];

describe('requiredItems', () => {
  it('liefert nur ausgehende requires_skill-Ziele ohne Duplikate', () => {
    const dup = [...relations, group('requires_skill', 'out', ['learning_module:a'])];
    expect(requiredItems(dup).map((i) => i.id)).toEqual(['learning_module:a', 'test_procedure:stk', 'learning_module:b', 'term:spo2', 'device:pumpe', 'learning_module:c']);
  });
  it('filtert Lernmodule', () => {
    expect(requiredLearningModules(relations).map((i) => i.id)).toEqual(['learning_module:a', 'learning_module:b', 'learning_module:c']);
  });
  it('liefert leere Liste ohne Relationen', () => {
    expect(requiredItems([])).toEqual([]);
  });
});

describe('relevantJobProfiles', () => {
  it('liefert eingehende Berufsbilder', () => {
    expect(relevantJobProfiles(relations).map((i) => i.id)).toEqual(['job_profile:fremd']);
  });
});

describe('orderByPrerequisites', () => {
  const items = ['a', 'b', 'c'].map((id) => ({ id }));
  it('stellt Voraussetzungen voran und bleibt sonst stabil', () => {
    const pre: Record<string, string[]> = { a: ['c'], b: [], c: [] };
    expect(orderByPrerequisites(items, (id) => pre[id] ?? []).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
  it('ignoriert Voraussetzungen außerhalb des Pfads', () => {
    expect(orderByPrerequisites(items, (id) => (id === 'a' ? ['z'] : [])).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('toleriert Zyklen', () => {
    const pre: Record<string, string[]> = { a: ['b'], b: ['a'], c: [] };
    const out = orderByPrerequisites(items, (id) => pre[id] ?? []).map((i) => i.id);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('orderLearningPath', () => {
  it('ordnet nach Typ: Lernmodule, Prüfungen, Geräte, Begriffe', () => {
    expect(orderLearningPath(requiredItems(relations)).map((i) => i.id)).toEqual([
      'learning_module:a',
      'learning_module:b',
      'learning_module:c',
      'test_procedure:stk',
      'device:pumpe',
      'term:spo2',
    ]);
  });
  it('berücksichtigt Voraussetzungen der Lernmodule', () => {
    const pre = (id: string) => (id === 'learning_module:a' ? ['learning_module:c'] : []);
    expect(orderLearningPath(requiredItems(relations), pre).slice(0, 3).map((i) => i.id)).toEqual(['learning_module:b', 'learning_module:c', 'learning_module:a']);
  });
});

describe('computeReadiness', () => {
  const modules = requiredLearningModules(relations);
  it('berechnet den Anteil abgeschlossener Lernmodule', () => {
    const r = computeReadiness(modules, progressMap([prog('learning_module:a', 'completed'), prog('test_procedure:stk', 'completed')]));
    expect(r).toMatchObject({ total: 3, completed: 1, percent: 33 });
    expect(r.next?.id).toBe('learning_module:b');
  });
  it('empfiehlt zuerst begonnene Module', () => {
    const r = computeReadiness(modules, progressMap([prog('learning_module:c', 'started')]));
    expect(r.next?.id).toBe('learning_module:c');
    expect(r.percent).toBe(0);
  });
  it('100 % ohne Empfehlung, wenn alles abgeschlossen ist', () => {
    const r = computeReadiness(modules, progressMap(modules.map((m) => prog(m.id, 'completed'))));
    expect(r).toMatchObject({ total: 3, completed: 3, percent: 100, next: null });
    expect(readinessLabel(r)).toMatch(/Alle/);
  });
  it('0 % bei Berufsbildern ohne Lernmodule', () => {
    const r = computeReadiness([], new Map());
    expect(r).toMatchObject({ total: 0, percent: 0, next: null });
    expect(readinessLabel(r)).toBe('Keine Lernmodule hinterlegt');
  });
  it('Beschriftung mit Zählern', () => {
    expect(readinessLabel({ total: 4, completed: 1, percent: 25, next: null })).toBe('1 von 4 Lernmodulen abgeschlossen');
  });
});

describe('itemStatus', () => {
  it('unterscheidet offen, begonnen, abgeschlossen', () => {
    const p = progressMap([prog('x:a', 'started'), prog('x:b', 'completed')]);
    expect(itemStatus('x:a', p)).toBe('started');
    expect(itemStatus('x:b', p)).toBe('completed');
    expect(itemStatus('x:c', p)).toBe('open');
    expect(progressMap(undefined).size).toBe(0);
  });
});

describe('rankByReadiness', () => {
  it('sortiert absteigend und stabil', () => {
    const mk = (id: string, percent: number) => ({ id, readiness: { total: 1, completed: 0, percent, next: null } });
    expect(rankByReadiness([mk('a', 20), mk('b', 80), mk('c', 20)]).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('pathItemLink', () => {
  it('Lernmodule öffnen den Academy-Player', () => {
    expect(pathItemLink(e('learning_module:infusionstechnik'))).toBe('/academy/lernen/infusionstechnik');
  });
  it('andere Typen öffnen die Detailseite', () => {
    expect(pathItemLink(e('test_procedure:stk-infusionspumpe'))).toBe('/e/test_procedure/stk-infusionspumpe');
  });
});
