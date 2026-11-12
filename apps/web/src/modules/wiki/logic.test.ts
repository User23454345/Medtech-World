import { describe, expect, it } from 'vitest';
import {
  filterGlossary,
  formatDate,
  glossaryLetter,
  groupBy,
  groupByLetter,
  isInvalidLegal,
  labelOf,
  LEGAL_STATUS_LABEL,
  mapLimit,
  mediaSrc,
  nextReviewDate,
  relationItems,
  reviewState,
  safeExternalUrl,
  sortLegal,
  uniqueById,
} from './logic.ts';

describe('Glossar', () => {
  it('ordnet Anfangsbuchstaben korrekt zu (Umlaute, Ziffern)', () => {
    expect(glossaryLetter('Ableitstrom')).toBe('A');
    expect(glossaryLetter('Überdruck')).toBe('U');
    expect(glossaryLetter('Ösophagus')).toBe('O');
    expect(glossaryLetter('  elektrokardiogramm')).toBe('E');
    expect(glossaryLetter('12-Kanal-EKG')).toBe('#');
    expect(glossaryLetter('ß-Test')).toBe('S');
  });

  it('gruppiert alphabetisch mit deutscher Sortierung, # am Ende', () => {
    const groups = groupByLetter([{ title: 'Zwerchfell' }, { title: 'Überdruck' }, { title: 'Ableitstrom' }, { title: '3-Kanal' }, { title: 'Anwendungsteil' }, { title: 'Umkehr' }]);
    expect(groups.map((g) => g.letter)).toEqual(['A', 'U', 'Z', '#']);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['Ableitstrom', 'Anwendungsteil']);
    expect(groups[1]!.items.map((i) => i.title)).toEqual(['Überdruck', 'Umkehr']);
  });

  it('filtert nach Text (Abkürzung, Englisch, Umlaute) und Kategorie', () => {
    const items = [
      { id: 'term:pi', title: 'Perfusionsindex', summary: 'Durchblutung', data: { category: 'messprinzip' as const, abbreviation: 'PI', english: 'perfusion index' } },
      { id: 'term:ab', title: 'Ableitstrom', summary: 'Strom über Isolierung', data: { category: 'sicherheit' as const, english: 'leakage current' } },
      { id: 'term:x', title: 'Überwachung', summary: 'Monitoring', aliases: ['Monitoring'] },
    ];
    expect(filterGlossary(items, 'leakage').map((i) => i.id)).toEqual(['term:ab']);
    expect(filterGlossary(items, 'pi').map((i) => i.id)).toContain('term:pi');
    expect(filterGlossary(items, 'ueberwachung').map((i) => i.id)).toEqual(['term:x']);
    expect(filterGlossary(items, '', 'sicherheit').map((i) => i.id)).toEqual(['term:ab']);
    expect(filterGlossary(items, 'perfusion', 'sicherheit')).toEqual([]);
  });
});

describe('Gruppierung', () => {
  it('gruppiert nach Kategorie, leere Kategorie am Ende', () => {
    const g = groupBy([{ title: 'B', c: 'Monitoring' }, { title: 'A', c: 'Monitoring' }, { title: 'C', c: '' }, { title: 'D', c: 'Beatmung' }], (i) => i.c);
    expect(g.map((x) => x.key)).toEqual(['Beatmung', 'Monitoring', 'Ohne Kategorie']);
    expect(g[1]!.items.map((i) => i.title)).toEqual(['A', 'B']);
  });
});

describe('Rechtsstand', () => {
  it('berechnet das nächste Prüfdatum', () => {
    expect(nextReviewDate('2026-11-01', 365)).toBe('2027-11-01');
    expect(nextReviewDate('2024-01-31', 30)).toBe('2024-03-01');
    expect(nextReviewDate('kaputt', 30)).toBeNull();
  });

  it('erkennt überfällige Prüfungen', () => {
    const today = new Date(2026, 10, 11);
    expect(reviewState('2026-11-01', 365, today)).toEqual({ due: '2027-11-01', overdue: false, daysLeft: 355 });
    const s = reviewState('2025-01-01', 365, today);
    expect(s.overdue).toBe(true);
    expect(s.daysLeft).toBeLessThan(0);
  });

  it('kennzeichnet ungültige Stände und sortiert gültige zuerst', () => {
    expect(isInvalidLegal('ersetzt')).toBe(true);
    expect(isInvalidLegal('aufgehoben')).toBe(true);
    expect(isInvalidLegal('in-kraft')).toBe(false);
    const sorted = sortLegal([
      { title: 'MPG', data: { status: 'ersetzt' as const, jurisdiction: 'DE' as const } },
      { title: 'MPDG', data: { status: 'in-kraft' as const, jurisdiction: 'DE' as const } },
      { title: 'MDR', data: { status: 'in-kraft' as const, jurisdiction: 'EU' as const } },
      { title: 'Unbekannt' },
    ]);
    expect(sorted.map((s) => s.title)).toEqual(['MDR', 'MPDG', 'MPG', 'Unbekannt']);
  });

  it('formatiert Daten deutsch und ohne Zeitzonenfehler', () => {
    expect(formatDate('2026-01-01')).toBe('01.01.2026');
    expect(formatDate(undefined)).toBe('–');
    expect(labelOf(LEGAL_STATUS_LABEL, 'in-kraft')).toBe('In Kraft');
  });
});

describe('Relationen', () => {
  const pm = { id: 'product_model:a', type: 'product_model' as const };
  const mf = { id: 'manufacturer:m', type: 'manufacturer' as const };
  const groups = [
    { rel: 'model_of' as const, direction: 'in' as const, items: [pm] },
    { rel: 'related' as const, direction: 'out' as const, items: [mf, pm] },
  ];
  it('liefert Einträge einer Relation und Richtung', () => {
    expect(relationItems(groups, 'model_of', 'in')).toEqual([pm]);
    expect(relationItems(groups, 'model_of', 'out')).toEqual([]);
    expect(relationItems(groups, 'related', undefined, 'manufacturer')).toEqual([mf]);
  });
  it('entfernt Duplikate', () => {
    expect(uniqueById([pm, mf], [pm])).toEqual([pm, mf]);
  });
});

describe('Medien und Links', () => {
  it('wählt die Bildquelle', () => {
    expect(mediaSrc('data:x', { svg: '<svg/>' })).toBe('data:x');
    expect(mediaSrc(undefined, { svg: '<svg/>' })).toMatch(/^data:image\/svg\+xml/);
    expect(mediaSrc(undefined, { url: 'https://a.de/b.png' })).toBe('https://a.de/b.png');
    expect(mediaSrc(undefined, {})).toBeNull();
  });
  it('lässt nur http(s)-Links zu', () => {
    expect(safeExternalUrl('https://www.draeger.com/')).toBe('https://www.draeger.com/');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe('mapLimit', () => {
  it('begrenzt die Parallelität und erhält die Reihenfolge', async () => {
    let active = 0;
    let max = 0;
    const res = await mapLimit([5, 1, 3, 2, 4], 2, async (n) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 2;
    });
    expect(res).toEqual([10, 2, 6, 4, 8]);
    expect(max).toBeLessThanOrEqual(2);
  });
});
