import { gauss, gaussNoise, valueNoise } from './noise.ts';
import { clamp, defineEngine, fmt, num, sampleTimes, type Params, type Readout } from './types.ts';

/**
 * Pulsoximetrie – Lehrmodell.
 *
 * Rot- (660 nm) und Infrarotsignal (940 nm) werden als transmittierte Lichtintensität
 * mit Gleichanteil (DC: Gewebe, venöses Blut) und pulsatilem Wechselanteil (AC: arterielles
 * Blut) erzeugt. Aus beiden Kanälen wird das Verhältnis der Verhältnisse
 *   R = (AC_rot / DC_rot) / (AC_IR / DC_IR)
 * berechnet und über eine VEREINFACHTE empirische Kalibrierkurve in SpO₂ umgerechnet:
 *   SpO₂ ≈ 110 − 25 · R
 * Reale Geräte verwenden gerätespezifische Kalibriertabellen aus Probandenstudien.
 */

export const FS = 100; // Abtastrate in Hz
export const ANALYSIS_WINDOW = 4; // s
export const DC_IR = 1.0;
export const DC_RED = 0.8;
export const BASE_NOISE = 0.0002;
export const MOTION_GAIN = 0.035;
export const AMBIENT_OFFSET = 0.3;
export const AMBIENT_NOISE = 0.005;
export const SNR_INVALID = 1;
export const SNR_WARN = 3;
export const SPO2_ALARM = 90;

/** Vereinfachte Kalibrierung: R aus SpO₂ */
export function ratioFromSaturation(spo2: number): number {
  return (110 - spo2) / 25;
}

/** Vereinfachte Kalibrierung: SpO₂ aus R (auf 0–100 % begrenzt) */
export function saturationFromRatio(r: number): number {
  return clamp(110 - 25 * r, 0, 100);
}

/** Normierte Pulsform (0 = Diastole, 1 = systolisches Maximum) mit dikroter Welle */
const rawShape = (phi: number) => gauss(phi, 0.2, 0.07) + 0.38 * gauss(phi, 0.5, 0.1) + gauss(phi, 1.2, 0.07);
const SHAPE_MAX = (() => {
  let m = 0;
  for (let i = 0; i < 1000; i++) m = Math.max(m, rawShape(i / 1000));
  return m;
})();
export function pulseShape(phi: number): number {
  return rawShape(phi) / SHAPE_MAX;
}

interface Sample {
  red: number;
  ir: number;
  cleanIr: number;
}

function sampleAt(p: Params, t: number): Sample {
  const hr = num(p, 'heartRate', 72);
  const pi = num(p, 'perfusion', 3) / 100;
  const r = ratioFromSaturation(num(p, 'saturation', 97));
  const motion = num(p, 'motion');
  const ambient = num(p, 'ambientLight');
  const k = Math.round(t * FS);
  const beat = (t * hr) / 60;
  const s = pulseShape(beat - Math.floor(beat));
  // Mehr arterielles Blut in der Systole → mehr Absorption → weniger transmittiertes Licht
  const acIr = pi; // relativ zu DC
  const acRed = r * pi;
  const cleanIr = DC_IR * (1 - acIr * s);
  const cleanRed = DC_RED * (1 - acRed * s);
  // Bewegung: multiplikative Änderung der optischen Weglänge (in beiden Kanälen gleich)
  const art = motion * MOTION_GAIN * (0.7 * valueNoise(t, 2.3, 7) + 0.3 * valueNoise(t, 0.7, 13));
  // Fremdlicht: unvollständig kompensierter Offset + Flackern/Rauschen
  const amb = ambient * AMBIENT_OFFSET;
  const nIr = (BASE_NOISE + ambient * AMBIENT_NOISE) * gaussNoise(k, 1);
  const nRed = (BASE_NOISE + ambient * AMBIENT_NOISE) * gaussNoise(k, 2);
  return {
    ir: cleanIr * (1 + art) + amb + nIr,
    red: cleanRed * (1 + art) + amb + nRed,
    cleanIr,
  };
}

const stats = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
  return { mean, sd };
};

export interface OximetryAnalysis {
  ratio: number;
  spo2Raw: number;
  snr: number;
  piMeasured: number;
  valid: boolean;
}

/** Auswertung des Analysefensters [t − 4 s, t] wie im Gerät: R, SNR, PI */
export function analyze(p: Params, t: number): OximetryAnalysis {
  const ts = sampleTimes(t, ANALYSIS_WINDOW, FS);
  const samples = ts.map((x) => sampleAt(p, x));
  const red = stats(samples.map((s) => s.red));
  const ir = stats(samples.map((s) => s.ir));
  const clean = stats(samples.map((s) => s.cleanIr));
  const resid = stats(samples.map((s) => s.ir - s.cleanIr));
  const ratio = red.sd / red.mean / (ir.sd / ir.mean);
  const snr = resid.sd > 0 ? clean.sd / resid.sd : Infinity;
  // PI = AC(Spitze–Spitze)/DC des IR-Kanals; Spitze–Spitze ≈ sd / sd(Form)
  const piMeasured = (ir.sd / SHAPE_SD / ir.mean) * 100;
  return { ratio, spo2Raw: saturationFromRatio(ratio), snr, piMeasured, valid: snr >= SNR_INVALID };
}

const SHAPE_SD = (() => {
  const xs = Array.from({ length: 1000 }, (_, i) => pulseShape(i / 1000));
  return stats(xs).sd;
})();

export const pulseOximetry = defineEngine({
  id: 'pulse-oximetry',
  label: 'Pulsoximetrie',
  description: 'Rot-/Infrarot-Photoplethysmogramm, Ratio-of-Ratios und angezeigte SpO₂ mit Störgrößen.',
  params: [
    { key: 'saturation', label: 'Arterielle Sättigung (wahr)', unit: '%', type: 'number', min: 50, max: 100, step: 1 },
    { key: 'heartRate', label: 'Herzfrequenz', unit: '/min', type: 'number', min: 30, max: 200, step: 1 },
    { key: 'perfusion', label: 'Perfusionsindex (PI)', unit: '%', type: 'number', min: 0.05, max: 20, step: 0.05, hint: 'Pulsatiler Anteil des IR-Signals' },
    { key: 'motion', label: 'Bewegung', type: 'number', min: 0, max: 1, step: 0.05 },
    { key: 'ambientLight', label: 'Fremdlicht', type: 'number', min: 0, max: 1, step: 0.05 },
  ],
  defaults: { saturation: 97, heartRate: 72, perfusion: 3, motion: 0, ambientLight: 0 },
  timebase: { window: 6, speed: 1, axisUnit: 's' },
  simulate(p, t) {
    const ts = sampleTimes(t, 6, FS);
    const samples = ts.map((x) => sampleAt(p, x));
    const a = analyze(p, t);
    const hr = num(p, 'heartRate', 72);
    const meanIr = samples.reduce((acc, s) => acc + s.ir, 0) / Math.max(1, samples.length);

    const alarms: string[] = [];
    const displayed = a.valid ? Math.round(a.spo2Raw) : null;
    if (!a.valid) alarms.push('Signal ungenügend – kein gültiger SpO₂-Wert (Sensor und Messstelle prüfen)');
    else if (a.snr < SNR_WARN) alarms.push('Geringe Signalqualität – Messwert unsicher');
    if (displayed !== null && displayed < SPO2_ALARM) alarms.push(`SpO₂ niedrig (< ${SPO2_ALARM} %)`);
    if (a.valid && hr > 120) alarms.push('Pulsfrequenz hoch');
    if (a.valid && hr < 50) alarms.push('Pulsfrequenz niedrig');
    if (num(p, 'perfusion') < 0.3) alarms.push('Geringe Perfusion');

    const readouts: Readout[] = [
      {
        label: 'SpO₂ (angezeigt)',
        value: displayed === null ? '–' : fmt(displayed),
        unit: '%',
        status: displayed === null ? 'alarm' : displayed < SPO2_ALARM ? 'alarm' : a.snr < SNR_WARN ? 'warn' : 'ok',
      },
      { label: 'Pulsfrequenz', value: a.valid ? fmt(hr) : '–', unit: '/min', status: !a.valid ? 'warn' : hr > 120 || hr < 50 ? 'alarm' : 'ok' },
      { label: 'Verhältnis R', value: fmt(a.ratio, 2), status: 'ok', hint: 'R = (AC/DC)rot ÷ (AC/DC)IR' },
      { label: 'SpO₂ aus R (ungefiltert)', value: fmt(a.spo2Raw), unit: '%', status: a.valid ? 'ok' : 'warn', hint: 'Rohwert ohne Plausibilitätsprüfung' },
      { label: 'PI (gemessen)', value: fmt(a.piMeasured, a.piMeasured < 1 ? 2 : 1), unit: '%', status: num(p, 'perfusion') < 0.3 ? 'warn' : 'ok' },
      { label: 'Signal-Rausch-Verhältnis', value: Number.isFinite(a.snr) ? fmt(a.snr, 1) : '> 100', status: !a.valid ? 'alarm' : a.snr < SNR_WARN ? 'warn' : 'ok' },
    ];

    const parts: string[] = [
      `Das Gerät bildet R = (AC/DC)rot ÷ (AC/DC)IR = ${fmt(a.ratio, 2)}. Über die hier verwendete, stark vereinfachte empirische Kalibrierkurve SpO₂ ≈ 110 − 25 · R ergibt sich ${fmt(a.spo2Raw)} %. Reale Pulsoximeter nutzen gerätespezifische, in Probandenstudien ermittelte Kalibriertabellen.`,
    ];
    if (num(p, 'saturation') < 90) parts.push('Bei sinkender Sättigung absorbiert das desoxygenierte Hämoglobin mehr rotes Licht: Der rote Wechselanteil wird relativ größer, R steigt und die angezeigte SpO₂ fällt.');
    if (num(p, 'perfusion') < 0.5) parts.push('Bei geringer Perfusion ist der pulsatile Anteil sehr klein. Schon geringes Rauschen verfälscht das Verhältnis R – das Signal-Rausch-Verhältnis sinkt, die Anzeige wird unsicher oder ausgeblendet.');
    if (num(p, 'motion') > 0.1) parts.push('Bewegung verändert die optische Weglänge in BEIDEN Kanälen gleich stark. Überwiegt dieses Artefakt, nähert sich R dem Wert 1 – die errechnete SpO₂ wandert in Richtung etwa 85 %, unabhängig von der tatsächlichen Sättigung.');
    if (num(p, 'ambientLight') > 0.1) parts.push('Fremdlicht wird durch Dunkelphasen-Messung nur teilweise kompensiert: Der verbleibende Gleichanteil verfälscht AC/DC, Flackern erhöht das Rauschen. Abhilfe: Sensor abdecken.');
    if (!a.valid) parts.push('Moderne Geräte zeigen bei ungenügender Signalqualität keinen Wert an, statt einen falschen Wert vorzutäuschen.');

    return {
      traces: [
        {
          id: 'pleth',
          label: 'Pleth (IR, pulsatiler Anteil)',
          unit: '%',
          color: '#0ea5e9',
          points: samples.map((s, i) => [ts[i]!, ((meanIr - s.ir) / DC_IR) * 100] as [number, number]),
        },
        { id: 'ir', label: 'IR-Rohsignal (940 nm)', unit: 'a. u.', color: '#a855f7', points: samples.map((s, i) => [ts[i]!, s.ir] as [number, number]) },
        { id: 'red', label: 'Rot-Rohsignal (660 nm)', unit: 'a. u.', color: '#ef4444', points: samples.map((s, i) => [ts[i]!, s.red] as [number, number]) },
      ],
      readouts,
      alarms,
      explanation: parts.join('\n\n'),
    };
  },
});
