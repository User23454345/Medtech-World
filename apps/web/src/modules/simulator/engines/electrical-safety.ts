import { defineEngine, fmt, num, str, type Check, type Params, type Readout } from './types.ts';

/**
 * Elektrische Sicherheitsprüfung nach DIN EN 62353 (Wiederholungsprüfung) – Bewertung
 * der Messwerte gegen die Grenzwerte. Verwendete Grenzwerte (Lehrmodell, Auszug):
 *
 * - Schutzleiterwiderstand: ≤ 0,3 Ω (nur Schutzklasse I)
 * - Geräteableitstrom, Ersatzableitstrommessung: SK I ≤ 1000 µA, SK II ≤ 500 µA
 * - Geräteableitstrom, direkte/Differenzstrommessung: SK I ≤ 500 µA, SK II ≤ 100 µA
 * - Patientenableitstrom (Anwendungsteil): Typ BF ≤ 5000 µA, Typ CF ≤ 50 µA,
 *   Typ B: in dieser Tabelle kein Grenzwert ("nicht gefordert")
 */

export type ProtectionClass = 'I' | 'II';
export type AppliedPart = 'B' | 'BF' | 'CF';
export type Method = 'ersatz' | 'direkt';

export const PE_LIMIT = 0.3;
export const EQUIPMENT_LIMITS: Record<Method, Record<ProtectionClass, number>> = {
  ersatz: { I: 1000, II: 500 },
  direkt: { I: 500, II: 100 },
};
export const APPLIED_PART_LIMITS: Record<AppliedPart, number | null> = { B: null, BF: 5000, CF: 50 };

export interface SafetyEvaluation {
  checks: Check[];
  pass: boolean;
}

export function evaluateSafety(p: Params): SafetyEvaluation {
  const pc = (str(p, 'protectionClass', 'I') === 'II' ? 'II' : 'I') as ProtectionClass;
  const ap = (['B', 'BF', 'CF'].includes(str(p, 'appliedPart')) ? str(p, 'appliedPart') : 'BF') as AppliedPart;
  const method = (str(p, 'method') === 'direkt' ? 'direkt' : 'ersatz') as Method;
  const pe = num(p, 'peResistance');
  const eq = num(p, 'equipmentLeakage');
  const apl = num(p, 'appliedPartLeakage');
  const methodLabel = method === 'ersatz' ? 'Ersatzableitstrommessung' : 'direkte Messung / Differenzstrommessung';
  const checks: Check[] = [];

  checks.push(
    pc === 'I'
      ? { id: 'pe', label: 'Schutzleiterwiderstand', measured: fmt(pe, 3), limit: `≤ ${fmt(PE_LIMIT, 1)}`, unit: 'Ω', result: pe <= PE_LIMIT ? 'pass' : 'fail' }
      : { id: 'pe', label: 'Schutzleiterwiderstand', measured: '–', limit: 'nicht gefordert', unit: 'Ω', result: 'na', note: 'Schutzklasse II hat keinen Schutzleiter.' },
  );
  const eqLimit = EQUIPMENT_LIMITS[method][pc];
  checks.push({ id: 'equipment', label: `Geräteableitstrom (${methodLabel})`, measured: fmt(eq), limit: `≤ ${fmt(eqLimit)}`, unit: 'µA', result: eq <= eqLimit ? 'pass' : 'fail' });
  const apLimit = APPLIED_PART_LIMITS[ap];
  checks.push(
    apLimit === null
      ? { id: 'applied', label: `Ableitstrom vom Anwendungsteil (Typ ${ap})`, measured: fmt(apl), limit: 'nicht gefordert', unit: 'µA', result: 'na', note: 'Für Anwendungsteile Typ B ist in dieser Tabelle kein Grenzwert festgelegt.' }
      : { id: 'applied', label: `Ableitstrom vom Anwendungsteil (Typ ${ap})`, measured: fmt(apl), limit: `≤ ${fmt(apLimit)}`, unit: 'µA', result: apl <= apLimit ? 'pass' : 'fail' },
  );
  return { checks, pass: checks.every((c) => c.result !== 'fail') };
}

export const electricalSafety = defineEngine({
  id: 'electrical-safety',
  label: 'Elektrische Sicherheit',
  description: 'Bewertung von Schutzleiterwiderstand und Ableitströmen nach DIN EN 62353.',
  params: [
    { key: 'protectionClass', label: 'Schutzklasse', type: 'select', options: [{ value: 'I', label: 'Schutzklasse I (mit Schutzleiter)' }, { value: 'II', label: 'Schutzklasse II (schutzisoliert)' }] },
    { key: 'appliedPart', label: 'Anwendungsteil', type: 'select', options: [{ value: 'B', label: 'Typ B' }, { value: 'BF', label: 'Typ BF' }, { value: 'CF', label: 'Typ CF (herznah)' }] },
    { key: 'method', label: 'Messverfahren', type: 'select', options: [{ value: 'ersatz', label: 'Ersatzableitstrommessung' }, { value: 'direkt', label: 'Direkte Messung / Differenzstrom' }] },
    { key: 'peResistance', label: 'Schutzleiterwiderstand (gemessen)', unit: 'Ω', type: 'number', min: 0, max: 2, step: 0.01, visibleIf: (p) => p.protectionClass !== 'II' },
    { key: 'equipmentLeakage', label: 'Geräteableitstrom (gemessen)', unit: 'µA', type: 'number', min: 0, max: 3000, step: 1 },
    { key: 'appliedPartLeakage', label: 'Ableitstrom Anwendungsteil (gemessen)', unit: 'µA', type: 'number', min: 0, max: 10000, step: 1 },
  ],
  defaults: { protectionClass: 'I', appliedPart: 'BF', method: 'ersatz', peResistance: 0.1, equipmentLeakage: 150, appliedPartLeakage: 20 },
  timebase: null,
  simulate(p, _t: number) {
    const { checks, pass } = evaluateSafety(p);
    const failed = checks.filter((c) => c.result === 'fail');
    const readouts: Readout[] = checks.map((c) => ({
      label: c.label,
      value: c.measured,
      unit: c.result === 'na' && c.measured === '–' ? undefined : c.unit,
      status: c.result === 'fail' ? 'alarm' : 'ok',
      hint: c.result === 'na' ? 'Grenzwert: nicht gefordert' : `Grenzwert ${c.limit} ${c.unit}`,
    }));
    const alarms = failed.map((c) => `${c.label}: ${c.measured} ${c.unit} überschreitet den Grenzwert (${c.limit} ${c.unit})`);
    const parts = [
      'Die Bewertung vergleicht jeden Messwert mit dem Grenzwert nach DIN EN 62353 (Auszug, Lehrmodell). Das Ergebnis ist nur „bestanden“, wenn ALLE geforderten Einzelprüfungen eingehalten sind; vorausgesetzt wird eine bestandene Sichtprüfung und Funktionsprüfung.',
      'Der Schutzleiterwiderstand wird nur bei Schutzklasse I gemessen. Die Grenzwerte für den Geräteableitstrom hängen vom Messverfahren ab: Beim Ersatzableitstromverfahren sind sie höher als bei der direkten bzw. Differenzstrommessung.',
      'Anwendungsteile Typ CF (direkt herznah) haben mit 50 µA den strengsten Grenzwert, weil schon sehr kleine Ströme am Herzen Kammerflimmern auslösen können.',
    ];
    if (!pass) parts.push('Ein Gerät, das einen Grenzwert überschreitet, darf nicht weiter betrieben werden: kennzeichnen, außer Betrieb nehmen, Betreiber informieren, Ursache beheben und erneut prüfen.');
    return {
      traces: [],
      readouts,
      alarms,
      checks,
      verdict: pass
        ? { pass: true, text: 'Bestanden – alle geforderten Grenzwerte sind eingehalten.' }
        : { pass: false, text: `Nicht bestanden – ${failed.length} Grenzwert${failed.length === 1 ? '' : 'e'} überschritten. Gerät nicht weiter betreiben.` },
      explanation: parts.join('\n\n'),
    };
  },
});
