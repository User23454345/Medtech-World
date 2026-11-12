/** Kleine Formatierungshelfer für UI-Texte */

/** Deutscher Plural ohne „(n)“-Konstruktionen: plural(4, 'Schritt', 'Schritten') → „4 Schritten“ */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? singular : pluralForm}`;
}

/** Je Entität nur den ersten (neuesten) Eintrag behalten – Reihenfolge bleibt erhalten */
export function distinctByEntity<T extends { entityId: string }>(items: readonly T[], limit = Infinity): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.entityId)) continue;
    seen.add(item.entityId);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
