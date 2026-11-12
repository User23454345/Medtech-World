import type { Trace } from './engines/types.ts';

/** Reine Hilfsfunktionen für die Kurvendarstellung (testbar ohne Canvas). */

export interface Lane {
  id: string;
  traces: Trace[];
  range: [number, number];
}

/** Gruppiert Kurven in Spuren und bestimmt den Wertebereich (fest oder automatisch mit Rand) */
export function buildLanes(traces: Trace[]): Lane[] {
  const order: string[] = [];
  const map = new Map<string, Trace[]>();
  for (const t of traces) {
    const key = t.lane ?? t.id;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(t);
  }
  return order.map((id) => {
    const ts = map.get(id)!;
    const fixed = ts.find((t) => t.range)?.range;
    return { id, traces: ts, range: fixed ?? autoRange(ts) };
  });
}

export function autoRange(traces: Trace[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const t of traces)
    for (const [, v] of t.points) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  if (!Number.isFinite(min)) return [0, 1];
  if (max - min < 1e-9) {
    const pad = Math.abs(max) * 0.1 || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

/** Sichtbares Zeitfenster. Zeitverläufe ab t = 0 füllen sich von links, danach scrollt das Fenster. */
export function viewWindow(t: number, window: number, startsAtZero = false): [number, number] {
  if (startsAtZero && t < window) return [0, window];
  return [t - window, t];
}

/** Gitterlinien-Abstand (s) für ein Zeitfenster */
export function gridStep(window: number): number {
  const candidates = [0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];
  return candidates.find((c) => window / c <= 8) ?? 3600;
}
