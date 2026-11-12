import { gauss, gaussNoise, hashSigned, valueNoise } from './noise.ts';
import { bool, defineEngine, fmt, num, sampleTimes, str, type Params, type Readout } from './types.ts';

/**
 * EKG-Monitor – synthetisches EKG (Ableitung II) als Summe von Gauß-Wellen (P, Q, R, S, T).
 * Rhythmen: Sinus (regelmäßig, P-Wellen), Vorhofflimmern (unregelmäßige RR-Abstände,
 * keine P-Wellen, Flimmerwellen), ventrikuläre Tachykardie (breite QRS), Kammerflimmern
 * (chaotisch), Asystolie (Nulllinie). Störungen: Muskelrauschen/Netzbrumm, Grundlinienschwankung,
 * Elektrode ab.
 */

export const FS = 250;
export const WINDOW = 6;
export const HR_HIGH = 120;
export const HR_LOW = 50;
export type Rhythm = 'sinus' | 'af' | 'vf' | 'vt' | 'asystole';

interface Wave {
  a: number; // mV
  mu: number; // s relativ zur R-Zacke
  s: number; // Breite (s)
}

function beatWaves(rhythm: Rhythm, rr: number): Wave[] {
  // QT verkürzt sich mit sinkendem RR (grob nach Bazett ∝ √RR)
  const tPos = 0.16 + 0.12 * Math.sqrt(Math.min(rr, 1.5));
  if (rhythm === 'vt') {
    return [
      { a: 1.3, mu: 0, s: 0.045 },
      { a: -0.6, mu: 0.08, s: 0.05 },
      { a: -0.35, mu: 0.1 + 0.1 * Math.sqrt(rr), s: 0.06 },
    ];
  }
  const waves: Wave[] = [
    { a: -0.1, mu: -0.03, s: 0.01 },
    { a: 1.2, mu: 0, s: 0.011 },
    { a: -0.25, mu: 0.028, s: 0.012 },
    { a: 0.3, mu: tPos, s: 0.045 },
  ];
  if (rhythm === 'sinus') waves.unshift({ a: 0.15, mu: -0.17, s: 0.025 });
  return waves;
}

/** Zeitpunkt der k-ten R-Zacke. Bei AF: Jitter je Zeitschlitz → unregelmäßige RR-Abstände (deterministisch). */
export function beatTime(rhythm: Rhythm, hr: number, k: number): number {
  const rr = 60 / hr;
  if (rhythm === 'af') return k * rr + hashSigned(k, 31) * 0.35 * rr;
  return k * rr;
}

/** R-Zacken-Zeitpunkte im Intervall [a, b] */
export function beatsBetween(rhythm: Rhythm, hr: number, a: number, b: number): number[] {
  if (rhythm === 'vf' || rhythm === 'asystole') return [];
  const rr = 60 / hr;
  const out: number[] = [];
  for (let k = Math.floor(a / rr) - 1; k <= Math.ceil(b / rr) + 1; k++) {
    const tk = beatTime(rhythm, hr, k);
    if (tk >= a && tk <= b) out.push(tk);
  }
  return out;
}

/** Ungestörtes Signal (mV) */
export function cleanEcg(p: Params, t: number): number {
  const rhythm = str(p, 'rhythm', 'sinus') as Rhythm;
  const hr = Math.max(10, num(p, 'heartRate', 72));
  if (rhythm === 'asystole') return 0;
  if (rhythm === 'vf') {
    const env = 0.55 + 0.35 * valueNoise(t, 0.4, 5);
    return env * (0.6 * Math.sin(2 * Math.PI * 5.2 * t + 2 * valueNoise(t, 0.8, 9)) + 0.4 * Math.sin(2 * Math.PI * 3.7 * t + 3 * valueNoise(t, 0.5, 11)));
  }
  const rr = 60 / hr;
  let v = 0;
  const k0 = Math.floor(t / rr);
  for (let k = k0 - 2; k <= k0 + 2; k++) {
    const tk = beatTime(rhythm, hr, k);
    const localRr = rhythm === 'af' ? beatTime(rhythm, hr, k) - beatTime(rhythm, hr, k - 1) : rr;
    for (const w of beatWaves(rhythm, localRr)) v += w.a * gauss(t - tk, w.mu, w.s);
  }
  if (rhythm === 'af') v += 0.05 * Math.sin(2 * Math.PI * 6.3 * t + 4 * valueNoise(t, 1.1, 3)) * (0.6 + 0.4 * valueNoise(t, 0.3, 4));
  return v;
}

/** Signal am Monitor inkl. Störungen (mV) */
export function ecgAt(p: Params, t: number): number {
  if (bool(p, 'electrodeOff')) return 0;
  const noise = num(p, 'noise');
  const wander = num(p, 'baselineWander');
  const k = Math.round(t * FS);
  const emg = noise * 0.08 * gaussNoise(k, 17);
  const mains = noise * 0.06 * Math.sin(2 * Math.PI * 50 * t);
  const bw = wander * (0.5 * Math.sin(2 * Math.PI * 0.25 * t) + 0.3 * valueNoise(t, 0.15, 23));
  const floor = 0.008 * gaussNoise(k, 19);
  return cleanEcg(p, t) + emg + mains + bw + floor;
}

/** Vom Monitor bestimmte Herzfrequenz (Mittel der RR-Abstände der letzten 6 s); null = nicht bestimmbar */
export function measuredHeartRate(p: Params, t: number): number | null {
  if (bool(p, 'electrodeOff')) return null;
  const rhythm = str(p, 'rhythm', 'sinus') as Rhythm;
  const hr = Math.max(10, num(p, 'heartRate', 72));
  const beats = beatsBetween(rhythm, hr, t - 6, t);
  if (beats.length < 2) return rhythm === 'asystole' ? 0 : null;
  const span = beats[beats.length - 1]! - beats[0]!;
  return (60 * (beats.length - 1)) / span;
}

const RHYTHM_LABEL: Record<Rhythm, string> = {
  sinus: 'Sinusrhythmus',
  af: 'Vorhofflimmern',
  vf: 'Kammerflimmern',
  vt: 'Ventrikuläre Tachykardie',
  asystole: 'Asystolie',
};

export const ecgMonitor = defineEngine({
  id: 'ecg-monitor',
  label: 'EKG-Monitor',
  description: 'Synthetisches EKG mit Rhythmusstörungen, Artefakten und Elektrodenalarm.',
  params: [
    { key: 'heartRate', label: 'Herzfrequenz (Grundfrequenz)', unit: '/min', type: 'number', min: 20, max: 250, step: 1 },
    {
      key: 'rhythm',
      label: 'Rhythmus',
      type: 'select',
      options: (Object.keys(RHYTHM_LABEL) as Rhythm[]).map((r) => ({ value: r, label: RHYTHM_LABEL[r] })),
    },
    { key: 'noise', label: 'Muskelzittern / Netzbrumm', type: 'number', min: 0, max: 1, step: 0.05 },
    { key: 'baselineWander', label: 'Grundlinienschwankung', type: 'number', min: 0, max: 1, step: 0.05, hint: 'z. B. durch Atmung oder Bewegung' },
    { key: 'electrodeOff', label: 'Elektrode ab', type: 'boolean' },
  ],
  defaults: { heartRate: 72, rhythm: 'sinus', noise: 0, electrodeOff: false, baselineWander: 0 },
  timebase: { window: WINDOW, speed: 1, axisUnit: 's' },
  simulate(p, t) {
    const ts = sampleTimes(t, WINDOW, FS);
    const rhythm = str(p, 'rhythm', 'sinus') as Rhythm;
    const off = bool(p, 'electrodeOff');
    const hrMeas = off || rhythm === 'vf' ? null : measuredHeartRate(p, t);
    const noise = num(p, 'noise');
    const wander = num(p, 'baselineWander');

    const alarms: string[] = [];
    if (off) alarms.push('Elektrode ab – Ableitung prüfen (keine Rhythmusüberwachung)');
    else {
      if (rhythm === 'asystole') alarms.push('Asystolie');
      if (rhythm === 'vf') alarms.push('Kammerflimmern');
      if (rhythm === 'vt') alarms.push('Ventrikuläre Tachykardie');
      if (rhythm === 'af') alarms.push('Vorhofflimmern (unregelmäßiger Rhythmus)');
      if (hrMeas !== null && rhythm !== 'asystole' && hrMeas > HR_HIGH) alarms.push(`Herzfrequenz hoch (> ${HR_HIGH} /min)`);
      if (hrMeas !== null && rhythm !== 'asystole' && hrMeas < HR_LOW) alarms.push(`Herzfrequenz niedrig (< ${HR_LOW} /min)`);
      if (noise >= 0.5 || wander >= 0.6) alarms.push('Artefakte – Signalqualität prüfen');
    }
    const lethal = !off && (rhythm === 'asystole' || rhythm === 'vf' || rhythm === 'vt');
    const readouts: Readout[] = [
      {
        label: 'Herzfrequenz',
        value: hrMeas === null ? '–' : fmt(hrMeas),
        unit: '/min',
        status: off ? 'warn' : lethal || (hrMeas !== null && (hrMeas > HR_HIGH || hrMeas < HR_LOW)) ? 'alarm' : 'ok',
      },
      { label: 'Rhythmus', value: off ? 'nicht auswertbar' : RHYTHM_LABEL[rhythm], status: off ? 'warn' : lethal ? 'alarm' : rhythm === 'af' ? 'warn' : 'ok' },
      { label: 'Signalqualität', value: off ? 'kein Signal' : noise >= 0.5 || wander >= 0.6 ? 'gestört' : noise > 0.2 || wander > 0.3 ? 'mäßig' : 'gut', status: off ? 'alarm' : noise >= 0.5 || wander >= 0.6 ? 'warn' : 'ok' },
    ];

    const parts: string[] = ['Das Lehrmodell setzt jeden Herzschlag aus Gauß-Wellen für P, Q, R, S und T zusammen (Ableitung II, dargestellt ist ein Zeitfenster von 6 s).'];
    if (off) parts.push('Bei abgefallener Elektrode misst der Verstärker kein Signal mehr: Die Kurve wird zur Nulllinie. Der Monitor meldet einen TECHNISCHEN Alarm und kann keine Rhythmusanalyse durchführen – nicht mit einer Asystolie verwechseln, aber immer zuerst den Patienten ansehen.');
    else {
      if (rhythm === 'sinus') parts.push('Sinusrhythmus: Vor jedem schmalen QRS-Komplex eine P-Welle, regelmäßige RR-Abstände.');
      if (rhythm === 'af') parts.push('Vorhofflimmern: Keine P-Wellen, stattdessen feine Flimmerwellen; die RR-Abstände sind absolut unregelmäßig. Die angezeigte Frequenz ist ein Mittelwert.');
      if (rhythm === 'vt') parts.push('Ventrikuläre Tachykardie: Breite, schnelle QRS-Komplexe ohne zugeordnete P-Wellen – lebensbedrohlich.');
      if (rhythm === 'vf') parts.push('Kammerflimmern: Chaotische Aktivität ohne erkennbare QRS-Komplexe, keine Auswurfleistung. Sofortige Defibrillation erforderlich.');
      if (rhythm === 'asystole') parts.push('Asystolie: Keine elektrische Aktivität. Vor der Diagnose Elektroden, Ableitung und Verstärkung prüfen (Nulllinie kann auch technisch bedingt sein).');
      if (noise > 0.1) parts.push('Muskelzittern erzeugt hochfrequentes Rauschen, Netzeinstreuung ein 50-Hz-Brummen. Abhilfe: entspannte Lagerung, gute Hautvorbereitung, Kabel nicht parallel zu Netzleitungen führen, Filter.');
      if (wander > 0.1) parts.push('Grundlinienschwankungen entstehen v. a. durch Atmung, Bewegung oder schlechten Elektrodenkontakt; sie erschweren die ST-Beurteilung.');
    }

    return {
      traces: [{ id: 'ecg', label: 'EKG Ableitung II', unit: 'mV', color: '#22c55e', points: ts.map((x) => [x, ecgAt(p, x)] as [number, number]), range: [-1.5, 2] }],
      readouts,
      alarms,
      explanation: parts.join('\n\n'),
    };
  },
});
