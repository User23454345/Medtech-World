import type { SimulationEngine } from '@medtech/core';

/**
 * Gemeinsame Schnittstelle aller Simulations-Engines.
 *
 * Engines sind REINE, DETERMINISTISCHE Funktionen: gleiche Parameter und gleiche
 * Simulationszeit liefern immer exakt dasselbe Ergebnis (Rauschen stammt aus
 * einer zeitindizierten Hash-Funktion, nicht aus Math.random). Dadurch sind sie
 * unit-testbar und die Darstellung ruckelt beim Scrollen nicht.
 */

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  key: string;
  label: string;
  unit?: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: ParamOption[];
  /** Kurze Erläuterung für die Bedienoberfläche */
  hint?: string;
  /** Nur anzeigen, wenn die Bedingung erfüllt ist (z. B. nur bei PCV) */
  visibleIf?: (p: Params) => boolean;
}

export type Status = 'ok' | 'warn' | 'alarm';

export interface Trace {
  id: string;
  label: string;
  unit: string;
  /** Linienfarbe (auf hellem und dunklem Hintergrund gut sichtbar) */
  color: string;
  /** [Zeit in s, Wert] */
  points: Array<[number, number]>;
  /** Spur, in der die Kurve gezeichnet wird (mehrere Kurven können eine Spur teilen) */
  lane?: string;
  /** Feste Skalierung; sonst automatisch */
  range?: [number, number];
  dashed?: boolean;
}

export interface Readout {
  label: string;
  value: string;
  unit?: string;
  status: Status;
  hint?: string;
}

/** Einzelprüfung (z. B. Messung nach DIN EN 62353) */
export interface Check {
  id: string;
  label: string;
  measured: string;
  limit: string;
  unit: string;
  result: 'pass' | 'fail' | 'na';
  note?: string;
}

export interface SimResult {
  traces: Trace[];
  readouts: Readout[];
  alarms: string[];
  explanation: string;
  /** Optional: tabellarische Prüfergebnisse und Gesamtbewertung */
  checks?: Check[];
  verdict?: { pass: boolean; text: string };
}

export interface Timebase {
  /** Breite des dargestellten Zeitfensters in s */
  window: number;
  /** Standard-Zeitraffer (Simulationssekunden pro Echtzeitsekunde) */
  speed: number;
  speedOptions?: number[];
  /** Achsenbeschriftung */
  axisUnit: 's' | 'min';
  /** Simulation beginnt bei t = 0 (Zeitverlauf) statt periodisch (Kurvenform) */
  startsAtZero?: boolean;
}

export interface Engine {
  id: SimulationEngine;
  label: string;
  description: string;
  params: ParamDef[];
  defaults: Params;
  /** null = statische Auswertung ohne Zeitverlauf */
  timebase: Timebase | null;
  simulate: (params: Params, t: number) => SimResult;
}

export function defineEngine<E extends Engine>(e: E): E {
  return e;
}

/**
 * Übernimmt Szenario- oder Benutzerwerte: unbekannte Schlüssel werden ignoriert,
 * fehlende mit Standardwerten gefüllt, Zahlen auf min/max begrenzt, Typen korrigiert.
 */
export function normalizeParams(engine: Pick<Engine, 'params' | 'defaults'>, raw: Record<string, unknown> | undefined | null): Params {
  const out: Params = { ...engine.defaults };
  for (const def of engine.params) {
    const v = raw?.[def.key];
    if (v === undefined || v === null) continue;
    if (def.type === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) continue;
      out[def.key] = clamp(n, def.min ?? -Infinity, def.max ?? Infinity);
    } else if (def.type === 'boolean') {
      out[def.key] = v === true || v === 'true' || v === 1;
    } else {
      const s = String(v);
      if (!def.options || def.options.some((o) => o.value === s)) out[def.key] = s;
    }
  }
  return out;
}

/** Liefert die Parameter, deren Wert in raw unbekannt ist (Hinweis für Redaktion) */
export function unknownParamKeys(engine: Pick<Engine, 'params'>, raw: Record<string, unknown>): string[] {
  return Object.keys(raw).filter((k) => !engine.params.some((p) => p.key === k));
}

export const num = (p: Params, k: string, fallback = 0): number => (typeof p[k] === 'number' ? (p[k] as number) : fallback);
export const bool = (p: Params, k: string): boolean => p[k] === true;
export const str = (p: Params, k: string, fallback = ''): string => (typeof p[k] === 'string' ? (p[k] as string) : fallback);

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Zahl deutsch formatiert */
export function fmt(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Zeitraster: Abtastzeitpunkte k/fs im Fenster [t - window, t] (gleiches Raster in jedem Frame) */
export function sampleTimes(tEnd: number, window: number, fs: number, tMin = -Infinity): number[] {
  const start = Math.ceil(Math.max(tEnd - window, tMin) * fs);
  const end = Math.floor(tEnd * fs);
  const ts: number[] = [];
  for (let k = start; k <= end; k++) ts.push(k / fs);
  return ts;
}
