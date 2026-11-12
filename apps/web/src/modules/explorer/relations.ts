import type { EntitySummary, EntityType, RelationGroup } from '@medtech/core';

/** Eindeutige verknüpfte Inhalte eines Typs aus allen Relationsgruppen */
export function relatedOfType(groups: RelationGroup[], type: EntityType): EntitySummary[] {
  const seen = new Map<string, EntitySummary>();
  for (const g of groups) for (const it of g.items) if (it.type === type && !seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}

/** Kennzahlen zu einer Komponente für die Teile-Infobox */
export function componentFacts(groups: RelationGroup[]) {
  return {
    faults: relatedOfType(groups, 'fault'),
    spareParts: relatedOfType(groups, 'spare_part'),
  };
}

/** "1 Fehlerbild" / "3 Fehlerbilder" */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
