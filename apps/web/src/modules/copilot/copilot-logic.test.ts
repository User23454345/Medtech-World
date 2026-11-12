import { describe, expect, it } from 'vitest';
import { citationAnchor, citedIndices, looksLikePatientData, parseContextParam, splitCitations, validateQuestion } from './copilot-logic.ts';

describe('splitCitations', () => {
  it('trennt Text und Belegmarker', () => {
    expect(splitCitations('SpO2 misst die Sättigung [1]. Grenzwert [2][3].')).toEqual([
      { t: 'text', v: 'SpO2 misst die Sättigung ' },
      { t: 'cite', index: 1 },
      { t: 'text', v: '. Grenzwert ' },
      { t: 'cite', index: 2 },
      { t: 'cite', index: 3 },
      { t: 'text', v: '.' },
    ]);
  });

  it('liefert reinen Text ohne Marker unverändert', () => {
    expect(splitCitations('Keine Belege.')).toEqual([{ t: 'text', v: 'Keine Belege.' }]);
    expect(splitCitations('')).toEqual([]);
  });

  it('lässt ungültige Nummern als Text stehen und führt Text zusammen', () => {
    expect(splitCitations('A [1] B [7] C', [1, 2])).toEqual([
      { t: 'text', v: 'A ' },
      { t: 'cite', index: 1 },
      { t: 'text', v: ' B [7] C' },
    ]);
  });

  it('zerlegt keine Markdown-Links, Wiki-Links, Fettdruck oder Code', () => {
    expect(splitCitations('[1](https://example.org) [[term:spo2]]')).toEqual([{ t: 'text', v: '[1](https://example.org) [[term:spo2]]' }]);
    expect(splitCitations('**Wert [1]** und `arr[2]` [3]')).toEqual([
      { t: 'text', v: '**Wert [1]** und `arr[2]` ' },
      { t: 'cite', index: 3 },
    ]);
  });

  it('erkennt Marker direkt nach Fettdruck', () => {
    expect(splitCitations('**Pulsoximetrie** (Begriff) [1]: Text')).toEqual([
      { t: 'text', v: '**Pulsoximetrie** (Begriff) ' },
      { t: 'cite', index: 1 },
      { t: 'text', v: ': Text' },
    ]);
  });
});

describe('citedIndices', () => {
  it('liefert eindeutige Nummern in Reihenfolge', () => {
    expect(citedIndices('a [2] b [1] c [2]')).toEqual([2, 1]);
    expect(citedIndices('a [2] b [9]', [1, 2])).toEqual([2]);
  });
});

describe('parseContextParam', () => {
  it('akzeptiert nur gültige Entitäts-IDs', () => {
    expect(parseContextParam('device:pulsoximeter')).toBe('device:pulsoximeter');
    expect(parseContextParam(' term:spo2 ')).toBe('term:spo2');
    expect(parseContextParam('foo:bar')).toBeNull();
    expect(parseContextParam('device:<script>')).toBeNull();
    expect(parseContextParam(null)).toBeNull();
    expect(parseContextParam('')).toBeNull();
  });
});

describe('validateQuestion', () => {
  it('prüft Mindest- und Höchstlänge', () => {
    expect(validateQuestion(' a ')).toMatch(/mindestens/);
    expect(validateQuestion('x'.repeat(1001))).toMatch(/zu lang/);
    expect(validateQuestion('Was ist SpO2?')).toBeNull();
  });
});

describe('looksLikePatientData', () => {
  it('erkennt typische Patientendaten', () => {
    expect(looksLikePatientData('Patient Herr Meier hat SpO2 85 %')).toBe(true);
    expect(looksLikePatientData('geb. 12.03.1956, Alarm am Monitor')).toBe(true);
    expect(looksLikePatientData('Versichertennummer A123456789')).toBe(true);
  });
  it('schlägt bei Fachfragen nicht an', () => {
    expect(looksLikePatientData('Welche Grenzwerte gelten für den Ableitstrom bei Typ CF?')).toBe(false);
    expect(looksLikePatientData('Was ist bei einer STK nach § 11 MPBetreibV zu beachten?')).toBe(false);
  });
});

describe('citationAnchor', () => {
  it('erzeugt eindeutige IDs', () => {
    expect(citationAnchor(3, 2)).toBe('mw-copilot-beleg-3-2');
  });
});
