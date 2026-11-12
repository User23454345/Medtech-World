import { describe, expect, it } from 'vitest';
import { distinctByEntity, plural } from './format.ts';

describe('plural', () => {
  it('wählt Singular nur für 1', () => {
    expect(plural(1, 'Schritt', 'Schritten')).toBe('1 Schritt');
    expect(plural(4, 'Schritt', 'Schritten')).toBe('4 Schritten');
    expect(plural(0, 'Quelle', 'Quellen')).toBe('0 Quellen');
  });
});

describe('distinctByEntity', () => {
  it('entfernt Dubletten, behält den neuesten Eintrag und begrenzt', () => {
    const items = [
      { entityId: 'a', at: '3' },
      { entityId: 'a', at: '2' },
      { entityId: 'b', at: '2' },
      { entityId: 'c', at: '1' },
    ];
    expect(distinctByEntity(items)).toEqual([items[0], items[2], items[3]]);
    expect(distinctByEntity(items, 2).map((i) => i.entityId)).toEqual(['a', 'b']);
  });
});
