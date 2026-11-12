import { bool, defineEngine, fmt, num, sampleTimes, type Params, type Readout } from './types.ts';

/**
 * Infusionspumpe – Lehrmodell für Förderung, Okklusion und Luftalarm.
 *
 * Vereinfachte Annahmen (klar als Lehrmodell gekennzeichnet):
 * - Nachgiebigkeit (Compliance) des Systems Pumpe–Leitung–Zugang: C = 1 µl/mmHg, konstant.
 * - Betriebsdruck ohne Okklusion: P0 = 10 mmHg + 0,05 mmHg pro ml/h (Strömungswiderstand).
 * - Nach patientenseitiger Okklusion fördert die Pumpe weiter in das abgeschlossene System:
 *   dP/dt = Förderrate / C. Erreicht der Druck die Druckalarmgrenze → Okklusionsalarm, Stopp.
 * - Das gespeicherte Volumen ΔV = C · (P − P0) wird beim Lösen als Bolus abgegeben.
 * - Luft in der Leitung erreicht den Luftsensor 2 Minuten nach Start → Stopp und Alarm.
 */

export const LINE_COMPLIANCE = 0.001; // ml/mmHg
export const AIR_DETECT_AFTER = 120; // s
export const WINDOW = 1800; // s (30 min)

export const baselinePressure = (rate: number) => 10 + 0.05 * rate;

/** Zeit von Okklusionsbeginn bis zum Alarm in s */
export function timeToOcclusionAlarm(rate: number, pressureLimit: number): number {
  const p0 = baselinePressure(rate);
  if (rate <= 0) return Infinity;
  return (Math.max(0, pressureLimit - p0) * LINE_COMPLIANCE) / (rate / 3600);
}

/** Beim Lösen der Okklusion freigesetztes Bolusvolumen (ml) bei Druck p */
export function bolusVolume(rate: number, pressure: number): number {
  return Math.max(0, pressure - baselinePressure(rate)) * LINE_COMPLIANCE;
}

export type StopReason = 'vtbi' | 'occlusion' | 'air' | null;

export interface PumpState {
  running: boolean;
  stopReason: StopReason;
  tStop: number;
  /** Von der Pumpe geförderte Menge (Zähler) ml */
  pumped: number;
  /** Beim Patienten angekommene Menge ml */
  delivered: number;
  /** Leitungsdruck patientenseitig mmHg */
  pressure: number;
  occluded: boolean;
  tOcc: number;
  tAlarm: number;
}

export function pumpState(p: Params, t: number): PumpState {
  const rate = Math.max(0.1, num(p, 'rate', 100));
  const q = rate / 3600; // ml/s
  const vtbi = Math.max(0.1, num(p, 'vtbi', 500));
  const plim = num(p, 'pressureLimit', 300);
  const occMin = num(p, 'occlusionAfterMin');
  const tOcc = occMin > 0 ? occMin * 60 : Infinity;
  const tAlarm = tOcc + timeToOcclusionAlarm(rate, plim);
  const tVtbi = vtbi / q;
  const tAir = bool(p, 'airInLine') ? AIR_DETECT_AFTER : Infinity;
  const tStop = Math.min(tVtbi, tAlarm, tAir);
  const stopReason: StopReason = tStop === Infinity ? null : tStop === tAir ? 'air' : tStop === tAlarm ? 'occlusion' : 'vtbi';
  const tc = Math.max(0, Math.min(t, tStop));
  const p0 = baselinePressure(rate);
  const occluded = t >= tOcc;
  let pressure: number;
  if (occluded) pressure = Math.min(plim, Math.max(p0, p0 + (q * (tc - tOcc)) / LINE_COMPLIANCE));
  else pressure = t >= tStop ? 0 : p0;
  return {
    running: t < tStop,
    stopReason: t >= tStop ? stopReason : null,
    tStop,
    pumped: q * tc,
    delivered: q * Math.min(tc, tOcc),
    pressure,
    occluded,
    tOcc,
    tAlarm,
  };
}

/** Aufrunden auf 1, 2 oder 5 × 10^n */
export function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}

/** Dauer in deutscher Kurzform: "8 s", "8 min 40 s", "5 h 0 min" */
export function fmtDuration(s: number): string {
  if (!Number.isFinite(s)) return '–';
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

export const infusionPump = defineEngine({
  id: 'infusion-pump',
  label: 'Infusionspumpe',
  description: 'Förderung, Vorwahlvolumen, Okklusionsdruck mit Zeit bis zum Alarm, Bolusgefahr und Luftalarm.',
  params: [
    { key: 'rate', label: 'Förderrate', unit: 'ml/h', type: 'number', min: 0.1, max: 1200, step: 0.1 },
    { key: 'vtbi', label: 'Vorwahlvolumen (VTBI)', unit: 'ml', type: 'number', min: 1, max: 1000, step: 1 },
    { key: 'occlusionAfterMin', label: 'Okklusion nach', unit: 'min', type: 'number', min: 0, max: 120, step: 1, hint: '0 = keine Okklusion' },
    { key: 'pressureLimit', label: 'Druckalarmgrenze', unit: 'mmHg', type: 'number', min: 50, max: 1000, step: 10 },
    { key: 'airInLine', label: 'Luft in der Leitung', type: 'boolean' },
  ],
  defaults: { rate: 100, vtbi: 500, occlusionAfterMin: 0, airInLine: false, pressureLimit: 300 },
  timebase: { window: WINDOW, speed: 60, speedOptions: [1, 10, 60, 300], axisUnit: 'min', startsAtZero: true },
  simulate(p, t) {
    const rate = Math.max(0.1, num(p, 'rate', 100));
    const vtbi = num(p, 'vtbi', 500);
    const plim = num(p, 'pressureLimit', 300);
    const s = pumpState(p, t);
    const ts = sampleTimes(t, WINDOW, 1 / 5, 0);
    if (ts[ts.length - 1] !== t && t >= 0) ts.push(t);
    const states = ts.map((x) => pumpState(p, x));
    const tta = timeToOcclusionAlarm(rate, plim);
    const bolusAtAlarm = bolusVolume(rate, plim);
    const remaining = Math.max(0, vtbi - s.pumped);

    const alarms: string[] = [];
    if (s.stopReason === 'occlusion') alarms.push('Okklusion patientenseitig – Druckalarmgrenze erreicht, Pumpe gestoppt');
    if (s.stopReason === 'air') alarms.push('Luft in der Leitung – Pumpe gestoppt');
    if (s.stopReason === 'vtbi') alarms.push('VTBI erreicht – Infusion beendet');

    const statusText = s.running ? (s.occluded ? 'fördert (Okklusion!)' : 'fördert') : s.stopReason === 'vtbi' ? 'beendet' : 'gestoppt (Alarm)';
    const readouts: Readout[] = [
      { label: 'Pumpenstatus', value: statusText, status: s.stopReason === 'occlusion' || s.stopReason === 'air' ? 'alarm' : s.occluded ? 'warn' : s.stopReason === 'vtbi' ? 'warn' : 'ok' },
      { label: 'Zeit seit Start', value: fmtDuration(t), status: 'ok' },
      { label: 'Gefördert (Pumpenzähler)', value: fmt(s.pumped, s.pumped < 10 ? 2 : 1), unit: 'ml', status: 'ok' },
      { label: 'Beim Patienten angekommen', value: fmt(s.delivered, s.delivered < 10 ? 2 : 1), unit: 'ml', status: s.occluded ? 'warn' : 'ok' },
      { label: 'Restvolumen', value: fmt(remaining, remaining < 10 ? 2 : 1), unit: 'ml', status: 'ok' },
      { label: 'Restlaufzeit', value: s.running ? fmtDuration((remaining / rate) * 3600) : '–', status: 'ok' },
      { label: 'Leitungsdruck', value: fmt(s.pressure), unit: 'mmHg', status: s.stopReason === 'occlusion' || s.pressure >= plim ? 'alarm' : s.pressure > 0.5 * plim ? 'warn' : 'ok' },
      { label: 'Zeit bis Okklusionsalarm', value: fmtDuration(tta), status: tta > 300 ? 'warn' : 'ok', hint: num(p, 'occlusionAfterMin') > 0 ? 'ab Beginn der Okklusion' : 'falls eine Okklusion aufträte' },
      { label: 'Bolus beim Lösen (bei Alarm)', value: fmt(bolusAtAlarm, 2), unit: 'ml', status: bolusAtAlarm >= 0.5 ? 'warn' : 'ok', hint: 'ΔV = C · (P − P0)' },
    ];
    if (s.occluded) readouts.splice(4, 0, { label: 'Ohne Förderung seit', value: fmtDuration(t - s.tOcc), status: 'warn' });

    const parts: string[] = [
      `Laufzeit = VTBI ÷ Förderrate: ${fmt(vtbi)} ml ÷ ${fmt(rate, rate < 10 ? 1 : 0)} ml/h = ${fmtDuration((vtbi / rate) * 3600)}.`,
      `Bei einer Okklusion fördert die Pumpe weiter in das abgeschlossene System. Der Druck steigt mit dP/dt = Förderrate ÷ Compliance. Mit der angenommenen Compliance von 1 µl/mmHg dauert es bei ${fmt(rate, rate < 10 ? 1 : 0)} ml/h und einer Alarmgrenze von ${fmt(plim)} mmHg etwa ${fmtDuration(tta)}, bis der Alarm auslöst – in dieser Zeit erhält der Patient kein Medikament.`,
      `Das im System gespeicherte Volumen (hier bis zu ${fmt(bolusAtAlarm, 2)} ml) wird beim Lösen der Okklusion schlagartig als Bolus abgegeben. Daher vor dem Öffnen den Druck entlasten bzw. die Bolusreduktion der Pumpe nutzen. Niedrige Förderrate und hohe Druckalarmgrenze verlängern die Zeit bis zum Alarm; eine hohe Grenze vergrößert zusätzlich den Bolus.`,
    ];
    if (bool(p, 'airInLine')) parts.push('Der Ultraschall-Luftsensor erkennt Luftblasen oberhalb einer gerätespezifischen Größe und stoppt die Pumpe. Luft entfernen (nicht einfach weiterlaufen lassen), Set entlüften, Ursache klären.');
    if (s.stopReason === 'vtbi') parts.push('Nach Erreichen des VTBI wechseln viele Pumpen in eine KVO-Rate (Offenhalterate) und melden einen Hinweisalarm.');
    parts.push('Lehrmodell mit vereinfachten Annahmen; reale Druckverläufe hängen von Set, Spritzengröße, Filtern und Gefäßzugang ab.');

    const pr = states.map((x, i) => [ts[i]!, x.pressure] as [number, number]);
    const pRange: [number, number] = [0, Math.max(100, Math.ceil((plim * 1.15) / 50) * 50)];
    const vMax = Math.max(...states.map((x) => x.pumped), 0);
    const vRange: [number, number] = [0, vMax <= 0 ? 1 : niceCeil(vMax * 1.15)];
    return {
      traces: [
        { id: 'pressure', label: 'Leitungsdruck', unit: 'mmHg', color: '#f97316', points: pr, lane: 'p', range: pRange },
        { id: 'plim', label: 'Druckalarmgrenze', unit: 'mmHg', color: '#ef4444', points: ts.length ? [[ts[0]!, plim], [ts[ts.length - 1]!, plim]] : [], lane: 'p', range: pRange, dashed: true },
        { id: 'pumped', label: 'Gefördert (Pumpe)', unit: 'ml', color: '#8b5cf6', points: states.map((x, i) => [ts[i]!, x.pumped] as [number, number]), lane: 'v', range: vRange, dashed: true },
        { id: 'delivered', label: 'Beim Patienten', unit: 'ml', color: '#0ea5e9', points: states.map((x, i) => [ts[i]!, x.delivered] as [number, number]), lane: 'v' },
      ],
      readouts,
      alarms,
      explanation: parts.join('\n\n'),
    };
  },
});
