/**
 * Testhelfer: kleine, gültige In-Memory-Inhaltsbündel für QA- und Datenbanktests.
 */
import type { RawContentFile, SourceKind } from '@medtech/core';

export const TODAY = new Date('2026-06-01T00:00:00Z');

type Json = Record<string, unknown>;

/** Minimal gültige typspezifische Daten je Inhaltstyp */
export const MINIMAL_DATA: Record<string, Json> = {
  device: { category: 'Monitoring' },
  manufacturer: { country: 'DE' },
  product_model: { status: 'aktiv' },
  component: { kind: 'sensor', function: 'Erfasst ein Messsignal.' },
  term: { category: 'allgemein' },
  media: { kind: 'schema', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', alt: 'Schematische Darstellung', license: 'CC0', attribution: 'Test' },
  learning_module: { level: 'einsteiger', durationMinutes: 10, objectives: ['Ziel'], sections: [{ title: 'Abschnitt', body: 'Text' }] },
  quiz_question: {
    kind: 'single',
    question: 'Welche Antwort ist richtig?',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correct: ['a'],
    explanation: 'A ist richtig.',
    difficulty: 1,
  },
  simulation: {
    engine: 'pulse-oximetry',
    learningGoals: ['Ziel'],
    scenarios: [{ id: 'normal', title: 'Normal', description: 'Normalbefund', params: { saturation: 97 } }],
  },
  fault: { severity: 'mittel', symptoms: ['Symptom'], causes: [{ text: 'Ursache', likelihood: 'haeufig' }] },
  test_procedure: { kind: 'STK', qualification: 'Fachkundige Person', steps: [{ title: 'Schritt', description: 'Beschreibung' }] },
  spare_part: { partNumber: 'X-1', kind: 'sensor', original: true },
  document: { docType: 'merkblatt' },
  legal_reference: {
    jurisdiction: 'DE',
    kind: 'verordnung',
    citation: '§ 1 TestV',
    status: 'in-kraft',
    verifiedAt: '2026-05-01',
    reviewIntervalDays: 365,
  },
  job_profile: { tasks: ['Aufgabe'], qualifications: ['Qualifikation'] },
  offer: { seller: 'Demo-Händler', price: 10, currency: 'EUR', condition: 'neu', stock: 1, location: 'Berlin' },
};

export function source(id: string, kind: SourceKind = 'fachliteratur', url?: string): Json {
  return {
    id,
    title: `Quelle ${id}`,
    publisher: 'Testverlag',
    kind,
    ...(url ? { url } : {}),
    accessedAt: '2026-05-01',
  };
}

/** Gültige Entität mit sinnvollen Defaults – überschreibbar */
export function entity(id: string, overrides: Json = {}): Json {
  const type = id.slice(0, id.indexOf(':'));
  return {
    id,
    title: `Titel ${id.slice(id.indexOf(':') + 1)}`,
    summary: 'Eine ausreichend lange Zusammenfassung für Testzwecke.',
    data: MINIMAL_DATA[type],
    sources: ['src:lit'],
    review: { status: 'geprueft', reviewedAt: '2026-05-01' },
    ...overrides,
  };
}

/** Eine einzige Inhaltsdatei mit Standardquellen (Fachliteratur + Hersteller) */
export function files(entities: Json[], extraSources: Json[] = [], file = 'test.json'): RawContentFile[] {
  return [
    {
      file,
      json: {
        sources: [source('src:lit'), source('src:hersteller', 'hersteller', 'https://hersteller.example.com/'), ...extraSources],
        entities,
      },
    },
  ];
}
