import { describe, expect, it } from 'vitest';
import type { EntityDetail, EntitySummary, FaultData } from '@medtech/core';
import { collectAffected, filterFaults, hasKnownFaults, mapLimit, matchesQuery, mergeUnique, slugOf, sortCauses, toFaultInfo, type FaultInfo } from './logic.ts';

const summary = (id: string, title: string, extra: Partial<EntitySummary> = {}): EntitySummary => {
  const [type, slug] = id.split(':') as [EntitySummary['type'], string];
  return { id, type, slug, title, summary: '', tags: [], demo: false, reviewStatus: 'geprueft', flags: [], ...extra };
};

const data = (severity: FaultData['severity'], symptoms: string[] = ['Symptom']): FaultData => ({
  severity,
  symptoms,
  causes: [{ text: 'Ursache', likelihood: 'selten' }],
  diagnosis: [],
  outcomes: [],
  remedies: [],
  safetyNotes: [],
});

const pulsox = summary('device:pulsoximeter', 'Pulsoximeter');
const monitor = summary('device:patientenmonitor', 'Patientenmonitor');
const sensor = summary('component:spo2-sensor', 'SpO₂-Sensor');

const faults: FaultInfo[] = [
  { summary: summary('fault:a', 'Artefakte', { tags: ['Alarm'] }), data: data('mittel', ['Schwankende Werte']), affected: [pulsox, sensor] },
  { summary: summary('fault:b', 'Kein Signal'), data: data('hoch', ['Kein SpO₂-Wert']), affected: [pulsox, monitor] },
  { summary: summary('fault:c', 'Überdruck'), data: data('kritisch'), affected: [] },
];

describe('filterFaults', () => {
  it('sortiert nach Schweregrad', () => {
    expect(filterFaults(faults, {}).map((f) => f.summary.id)).toEqual(['fault:c', 'fault:b', 'fault:a']);
  });
  it('filtert nach Schweregrad und Gerät', () => {
    expect(filterFaults(faults, { severity: 'hoch' }).map((f) => f.summary.id)).toEqual(['fault:b']);
    expect(filterFaults(faults, { device: 'device:pulsoximeter' }).map((f) => f.summary.id)).toEqual(['fault:b', 'fault:a']);
    expect(filterFaults(faults, { device: 'component:spo2-sensor', severity: 'hoch' })).toEqual([]);
  });
  it('sucht in Symptomen, Tags und Gerätenamen, unabhängig von Umlauten/Indizes', () => {
    expect(filterFaults(faults, { q: 'kein spo2' }).map((f) => f.summary.id)).toEqual(['fault:b']);
    expect(filterFaults(faults, { q: 'ueberdruck' })).toEqual([]);
    expect(filterFaults(faults, { q: 'uberdruck' }).map((f) => f.summary.id)).toEqual(['fault:c']);
    expect(matchesQuery(faults[0]!, 'alarm')).toBe(true);
    expect(matchesQuery(faults[0]!, 'monitor')).toBe(false);
    expect(matchesQuery(faults[1]!, 'patientenmonitor')).toBe(true);
  });
});

describe('collectAffected', () => {
  it('gruppiert nach Typ und zählt Fehlerbilder', () => {
    const r = collectAffected(faults);
    expect(r.device.map((d) => [d.entity.id, d.faultCount])).toEqual([
      ['device:patientenmonitor', 1],
      ['device:pulsoximeter', 2],
    ]);
    expect(r.component.map((d) => d.entity.id)).toEqual(['component:spo2-sensor']);
    expect(r.product_model).toEqual([]);
  });
});

describe('Hilfsfunktionen', () => {
  it('sortCauses ordnet nach Wahrscheinlichkeit, stabil', () => {
    const c = sortCauses([
      { text: 'a', likelihood: 'selten' as const },
      { text: 'b', likelihood: 'haeufig' as const },
      { text: 'c', likelihood: 'gelegentlich' as const },
      { text: 'd', likelihood: 'haeufig' as const },
    ]);
    expect(c.map((x) => x.text)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('mergeUnique entfernt Duplikate', () => {
    expect(mergeUnique([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'c' }]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('slugOf', () => {
    expect(slugOf('fault:spo2-kein-signal')).toBe('spo2-kein-signal');
    expect(slugOf('ohne')).toBe('ohne');
  });
  it('hasKnownFaults prüft eingehende affects-Relationen bei Hardware', () => {
    const rel = [{ rel: 'affects' as const, direction: 'in' as const, label: 'Fehlerbilder', items: [summary('fault:a', 'A')] }];
    expect(hasKnownFaults({ type: 'device', relations: rel })).toBe(true);
    expect(hasKnownFaults({ type: 'term', relations: rel })).toBe(false);
    expect(hasKnownFaults({ type: 'device', relations: [] })).toBe(false);
    expect(hasKnownFaults({ type: 'component', relations: [{ ...rel[0]!, direction: 'out' }] })).toBe(false);
  });
  it('toFaultInfo extrahiert betroffene Hardware', () => {
    const detail = {
      ...summary('fault:x', 'X'),
      aliases: [],
      body: '',
      data: data('niedrig'),
      specs: [],
      sources: [],
      relations: [
        { rel: 'affects', direction: 'out', label: 'betrifft', items: [pulsox, sensor] },
        { rel: 'remedied_by', direction: 'out', label: 'Abhilfe', items: [summary('spare_part:y', 'Y')] },
      ],
      reviewedAt: '2026-01-01',
      modules: ['repair'],
      linkedTitles: {},
    } as EntityDetail<FaultData>;
    const info = toFaultInfo(detail);
    expect(info.affected.map((a) => a.id)).toEqual(['device:pulsoximeter', 'component:spo2-sensor']);
    expect(info.summary).not.toHaveProperty('relations');
    expect(info.summary.title).toBe('X');
  });
  it('mapLimit hält Reihenfolge und Parallelitätsgrenze ein', async () => {
    let active = 0;
    let peak = 0;
    const r = await mapLimit([5, 1, 3, 2, 4], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((res) => setTimeout(res, n));
      active--;
      return n * 10;
    });
    expect(r).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
  });
});
