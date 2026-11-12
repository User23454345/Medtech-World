import { defineEngine, fmt, num, sampleTimes, str, type Params, type Readout } from './types.ts';

/**
 * Beatmung – Ein-Kompartiment-Lungenmodell (Lehrmodell).
 *
 * Bewegungsgleichung:  Paw = V/C + R·Flow + PEEP
 *   C  Compliance in ml/mbar, R Resistance in mbar/(l/s), τ = R·C (Zeitkonstante)
 * PCV: konstanter Inspirationsdruck pInsp (absolut, über Umgebungsdruck) → Druckdifferenz
 *      ΔP = pInsp − PEEP treibt einen exponentiell abfallenden Flow (τ).
 * VCV: konstanter Flow über 80 % der Inspirationszeit + 20 % endinspiratorische Pause
 *      → Spitzendruck (Ppeak) und Plateaudruck (Pplat).
 * Exspiration passiv (exponentiell mit τ). Unvollständige Exspiration → intrinsischer PEEP.
 * Leckage: Anteil des Volumens, der nicht über das Exspirationsventil zurückkommt
 * (VCV: erreicht den Patienten nicht; PCV: Gerät hält den Druck, VTe sinkt).
 */

export const FS = 50;
export const VCV_FLOW_FRACTION = 0.8;
export const ALARM_PPEAK = 35; // mbar
export const ALARM_MV_LOW = 4; // l/min
export const ALARM_LEAK = 0.2; // Anteil
export const PPLAT_WARN = 30; // mbar

export interface BreathModel {
  mode: 'PCV' | 'VCV';
  period: number;
  ti: number;
  te: number;
  tau: number;
  /** Volumen über FRC (bei PEEP) am Ende der Exspiration (ml) → intrinsischer PEEP */
  vEE: number;
  /** Volumen am Ende der Inspiration (ml) */
  vEI: number;
  /** Tidalvolumen beim Patienten (ml) */
  vtPatient: number;
  /** Am Exspirationsventil gemessenes Volumen (ml) */
  vtExp: number;
  /** Vom Gerät inspiratorisch abgegebenes Volumen (ml) */
  vtInsp: number;
  ppeak: number;
  pplat: number;
  peep: number;
  peepIntrinsic: number;
  /** Inspiratorischer Flow beim Patienten in VCV (l/s) */
  vcvFlow: number;
}

/** Stationärer Atemzyklus (periodischer Gleichgewichtszustand) */
export function breathModel(p: Params): BreathModel {
  const mode = str(p, 'mode', 'PCV') === 'VCV' ? 'VCV' : 'PCV';
  const peep = num(p, 'peep', 5);
  const rr = Math.max(1, num(p, 'respRate', 15));
  const ie = Math.max(0.05, num(p, 'ieRatio', 0.5));
  const C = Math.max(1, num(p, 'compliance', 50));
  const R = Math.max(0.5, num(p, 'resistance', 10));
  const leak = Math.min(0.95, Math.max(0, num(p, 'leak', 0)));
  const period = 60 / rr;
  const ti = (period * ie) / (1 + ie);
  const te = period - ti;
  const tau = (R * C) / 1000;
  const b = Math.exp(-te / tau);

  if (mode === 'PCV') {
    const pInsp = Math.max(peep, num(p, 'pInsp', 20));
    const dp = pInsp - peep;
    const a = 1 - Math.exp(-ti / tau);
    const vEI = (C * dp * a) / (1 - (1 - a) * b);
    const vEE = vEI * b;
    const vtPatient = vEI - vEE;
    return {
      mode,
      period,
      ti,
      te,
      tau,
      vEE,
      vEI,
      vtPatient,
      vtExp: vtPatient * (1 - leak),
      vtInsp: vtPatient,
      ppeak: pInsp,
      pplat: peep + vEI / C,
      peep,
      peepIntrinsic: vEE / C,
      vcvFlow: 0,
    };
  }
  const vtSet = num(p, 'tidalVolume', 500);
  const vtPatient = vtSet * (1 - leak);
  const vEE = (vtPatient * b) / (1 - b);
  const vEI = vEE + vtPatient;
  const flow = vtPatient / (VCV_FLOW_FRACTION * ti) / 1000; // l/s
  return {
    mode,
    period,
    ti,
    te,
    tau,
    vEE,
    vEI,
    vtPatient,
    vtExp: vtPatient,
    vtInsp: vtSet,
    ppeak: peep + vEI / C + R * flow,
    pplat: peep + vEI / C,
    peep,
    peepIntrinsic: vEE / C,
    vcvFlow: flow,
  };
}

/** Druck (mbar), Flow (l/min) und Volumen (ml über FRC) zum Zeitpunkt t */
export function waveformAt(m: BreathModel, p: Params, t: number): { paw: number; flow: number; volume: number } {
  const C = Math.max(1, num(p, 'compliance', 50));
  const R = Math.max(0.5, num(p, 'resistance', 10));
  const ph = ((t % m.period) + m.period) % m.period;
  if (ph < m.ti) {
    if (m.mode === 'PCV') {
      const target = C * (m.ppeak - m.peep);
      const v = target + (m.vEE - target) * Math.exp(-ph / m.tau);
      const flowLs = (target - v) / C / R; // (Pinsp − Palv)/R
      return { paw: m.ppeak, flow: flowLs * 60, volume: v };
    }
    const tFlow = VCV_FLOW_FRACTION * m.ti;
    if (ph < tFlow) {
      const v = m.vEE + m.vcvFlow * 1000 * ph;
      return { paw: m.peep + v / C + R * m.vcvFlow, flow: m.vcvFlow * 60, volume: v };
    }
    return { paw: m.peep + m.vEI / C, flow: 0, volume: m.vEI };
  }
  const te = ph - m.ti;
  const v = m.vEI * Math.exp(-te / m.tau);
  const flowLs = -(v / C) / R;
  return { paw: m.peep, flow: flowLs * 60, volume: v };
}

export const ventilation = defineEngine({
  id: 'ventilation',
  label: 'Beatmung',
  description: 'Ein-Kompartiment-Lungenmodell mit druck- und volumenkontrollierter Beatmung.',
  params: [
    {
      key: 'mode',
      label: 'Beatmungsmodus',
      type: 'select',
      options: [
        { value: 'PCV', label: 'PCV – druckkontrolliert' },
        { value: 'VCV', label: 'VCV – volumenkontrolliert' },
      ],
    },
    { key: 'peep', label: 'PEEP', unit: 'mbar', type: 'number', min: 0, max: 20, step: 1 },
    { key: 'pInsp', label: 'Inspirationsdruck (Pinsp)', unit: 'mbar', type: 'number', min: 5, max: 50, step: 1, hint: 'Absolut (über Umgebungsdruck); Druckdifferenz = Pinsp − PEEP', visibleIf: (p) => p.mode !== 'VCV' },
    { key: 'tidalVolume', label: 'Tidalvolumen (eingestellt)', unit: 'ml', type: 'number', min: 50, max: 1000, step: 10, visibleIf: (p) => p.mode === 'VCV' },
    { key: 'respRate', label: 'Atemfrequenz', unit: '/min', type: 'number', min: 4, max: 40, step: 1 },
    { key: 'ieRatio', label: 'I:E-Verhältnis', type: 'number', min: 0.2, max: 2, step: 0.05, hint: '0,5 entspricht 1:2' },
    { key: 'compliance', label: 'Compliance', unit: 'ml/mbar', type: 'number', min: 5, max: 120, step: 1 },
    { key: 'resistance', label: 'Resistance', unit: 'mbar/(l/s)', type: 'number', min: 2, max: 50, step: 1 },
    { key: 'leak', label: 'Leckage (Anteil)', type: 'number', min: 0, max: 0.8, step: 0.05 },
  ],
  defaults: { mode: 'PCV', peep: 5, pInsp: 20, tidalVolume: 500, respRate: 15, ieRatio: 0.5, compliance: 50, resistance: 10, leak: 0 },
  timebase: { window: 12, speed: 1, axisUnit: 's' },
  simulate(p, t) {
    const m = breathModel(p);
    const ts = sampleTimes(t, 12, FS);
    const w = ts.map((x) => waveformAt(m, p, x));
    const rr = num(p, 'respRate', 15);
    const leak = num(p, 'leak');
    const mv = (m.vtExp * rr) / 1000;
    const leakMeasured = m.vtInsp > 0 ? (m.vtInsp - m.vtExp) / m.vtInsp : 0;
    const drivingPressure = m.pplat - m.peep;

    const alarms: string[] = [];
    if (m.ppeak >= ALARM_PPEAK) alarms.push(`Hoher Atemwegsdruck (Ppeak ≥ ${ALARM_PPEAK} mbar)`);
    if (mv < ALARM_MV_LOW) alarms.push(`Niedriges Atemminutenvolumen (< ${ALARM_MV_LOW} l/min)`);
    if (leakMeasured >= ALARM_LEAK) alarms.push(`Leckage (${fmt(leakMeasured * 100)} %)`);
    if (m.peepIntrinsic >= 1) alarms.push('Intrinsischer PEEP – Exspiration unvollständig');

    const readouts: Readout[] = [
      { label: 'Ppeak', value: fmt(m.ppeak, 1), unit: 'mbar', status: m.ppeak >= ALARM_PPEAK ? 'alarm' : m.ppeak >= ALARM_PPEAK - 5 ? 'warn' : 'ok' },
      { label: 'Pplat', value: fmt(m.pplat, 1), unit: 'mbar', status: m.pplat > PPLAT_WARN ? 'warn' : 'ok', hint: 'Alveolardruck am Inspirationsende' },
      { label: 'PEEP', value: fmt(m.peep, 0), unit: 'mbar', status: 'ok' },
      { label: 'PEEP intrinsisch', value: fmt(m.peepIntrinsic, 1), unit: 'mbar', status: m.peepIntrinsic >= 1 ? 'warn' : 'ok' },
      { label: 'Driving Pressure', value: fmt(drivingPressure, 1), unit: 'mbar', status: drivingPressure > 15 ? 'warn' : 'ok', hint: 'Pplat − PEEP' },
      { label: 'VT (exspiratorisch)', value: fmt(m.vtExp), unit: 'ml', status: 'ok' },
      { label: 'AMV', value: fmt(mv, 1), unit: 'l/min', status: mv < ALARM_MV_LOW ? 'alarm' : 'ok' },
      { label: 'Leckage', value: fmt(leakMeasured * 100), unit: '%', status: leakMeasured >= ALARM_LEAK ? 'alarm' : leakMeasured > 0.05 ? 'warn' : 'ok' },
      { label: 'Zeitkonstante τ', value: fmt(m.tau, 2), unit: 's', status: 'ok', hint: 'τ = R · C' },
    ];

    const parts: string[] = [
      `Ein-Kompartiment-Modell: Paw = V/C + R · Flow + PEEP. Mit C = ${fmt(num(p, 'compliance'))} ml/mbar und R = ${fmt(num(p, 'resistance'))} mbar/(l/s) beträgt die Zeitkonstante τ = R · C = ${fmt(m.tau, 2)} s; nach etwa 3 τ ist die Lunge weitgehend gefüllt bzw. entleert.`,
    ];
    if (m.mode === 'PCV') {
      parts.push(`PCV: Das Gerät hält den Inspirationsdruck konstant; treibende Druckdifferenz ist Pinsp − PEEP. Der Flow ist zu Beginn maximal und fällt exponentiell ab, sobald sich der Alveolardruck dem eingestellten Druck nähert. Das Tidalvolumen ergibt sich aus Druck und Compliance – sinkt die Compliance, sinkt das Volumen.`);
    } else {
      parts.push(`VCV: Das Gerät gibt einen konstanten Flow ab. Der Spitzendruck Ppeak enthält den resistiven Anteil R · Flow, der Plateaudruck Pplat in der endinspiratorischen Pause nur den elastischen Anteil V/C. Steigt Ppeak bei gleichem Pplat, deutet das auf eine erhöhte Resistance (z. B. Sekret, abgeknickter Tubus) hin; steigen beide, auf eine verminderte Compliance.`);
    }
    if (m.te < 3 * m.tau) parts.push(`Die Exspirationszeit (${fmt(m.te, 2)} s) ist kürzer als 3 τ: Die Lunge entleert sich nicht vollständig, es entsteht ein intrinsischer PEEP von ${fmt(m.peepIntrinsic, 1)} mbar.`);
    if (leak > 0) {
      parts.push(
        m.mode === 'VCV'
          ? 'Bei VCV erreicht der durch das Leck entweichende Anteil den Patienten nicht: Die Drücke und das exspiratorisch gemessene Volumen sinken.'
          : 'Bei PCV kompensiert das Gerät die Leckage durch höheren Flow, der Druck bleibt erhalten – das am Exspirationsventil gemessene Volumen ist aber kleiner als das abgegebene.',
      );
    }
    parts.push('Alarmgrenzen in diesem Lehrmodell: Ppeak ≥ 35 mbar, AMV < 4 l/min, Leckage ≥ 20 %. Am realen Gerät werden Alarmgrenzen patientenbezogen eingestellt.');

    return {
      traces: [
        { id: 'paw', label: 'Atemwegsdruck Paw', unit: 'mbar', color: '#f59e0b', points: w.map((x, i) => [ts[i]!, x.paw] as [number, number]), range: [0, Math.max(30, Math.ceil(m.ppeak / 5) * 5 + 5)] },
        { id: 'flow', label: 'Flow', unit: 'l/min', color: '#10b981', points: w.map((x, i) => [ts[i]!, x.flow] as [number, number]) },
        { id: 'volume', label: 'Volumen', unit: 'ml', color: '#3b82f6', points: w.map((x, i) => [ts[i]!, x.volume] as [number, number]), range: [0, Math.max(200, Math.ceil(m.vEI / 100) * 100 + 100)] },
      ],
      readouts,
      alarms,
      explanation: parts.join('\n\n'),
    };
  },
});
