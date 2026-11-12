/**
 * Deterministische Pseudozufallsfunktionen (zeit-/indexbasiert).
 * Keine globale Zufallsquelle → reproduzierbare Simulation.
 */

/** Ganzzahl-Hash → [0, 1) */
export function hash01(n: number, seed = 0): number {
  let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 0x27d4eb2f, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Hash → [-1, 1) */
export function hashSigned(n: number, seed = 0): number {
  return hash01(n, seed) * 2 - 1;
}

/** Näherungsweise normalverteiltes Rauschen (Summe von 3 Gleichverteilungen), σ ≈ 1 */
export function gaussNoise(n: number, seed = 0): number {
  return (hashSigned(n, seed) + hashSigned(n, seed + 101) + hashSigned(n, seed + 211)) ;
}

/** Glattes Wertrauschen (kosinus-interpoliert) mit Grundfrequenz freq in Hz, Bereich [-1, 1] */
export function valueNoise(t: number, freq: number, seed = 0): number {
  const x = t * freq;
  const i = Math.floor(x);
  const f = x - i;
  const a = hashSigned(i, seed);
  const b = hashSigned(i + 1, seed);
  const w = (1 - Math.cos(Math.PI * f)) / 2;
  return a * (1 - w) + b * w;
}

/** Gauß-Glocke */
export function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}
