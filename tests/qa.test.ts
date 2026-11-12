import { describe, expect, it } from 'vitest';
import {
  buildContentBundle,
  extractWikiLinks,
  normalizeName,
  similarity,
  summarizeIssues,
  type ContentBundle,
  type QaOptions,
  type RawContentFile,
} from '@medtech/core';
import { TODAY, entity, files, source } from './fixtures.ts';

const build = (f: RawContentFile[], opts: QaOptions = {}) => buildContentBundle(f, { today: TODAY, ...opts });

const codes = (b: ContentBundle, severity?: 'error' | 'warning' | 'info') =>
  b.issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

const issuesFor = (b: ContentBundle, code: string) => b.issues.filter((i) => i.code === code);

const flagKinds = (b: ContentBundle, id: string) => (b.flags.get(id) ?? []).map((f) => f.kind);

describe('QA: Hilfsfunktionen', () => {
  it('normalizeName entfernt Rechtsformen, Akzente und Sonderzeichen', () => {
    expect(normalizeName('Foo GmbH')).toBe('foo');
    expect(normalizeName('Foo AG')).toBe('foo');
    expect(normalizeName('Foo Medical Inc.')).toBe('foo');
    expect(normalizeName('Drägerwerk AG & Co. KGaA')).toBe('dragerwerkkgaa');
    expect(normalizeName('Straße')).toBe('strasse');
    expect(normalizeName('SpO₂-Sensor')).toBe('spo2sensor');
  });

  it('similarity liefert 1 für Gleichheit und hohe Werte für Beinahe-Dubletten', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('infusionspumpe', 'infusionspumpen')).toBeGreaterThanOrEqual(0.9);
    expect(similarity('pulsoximeter', 'defibrillator')).toBeLessThan(0.5);
    expect(similarity('a', 'b')).toBe(0);
  });

  it('extractWikiLinks erkennt [[typ:slug]] und [[typ:slug|Text]]', () => {
    expect(extractWikiLinks('Siehe [[term:spo2]] und [[device:pulsoximeter|Pulsoximeter]].')).toEqual(['term:spo2', 'device:pulsoximeter']);
    expect(extractWikiLinks('Kein Link [term:spo2] oder [[Foo]]')).toEqual([]);
  });

  it('summarizeIssues zählt nach Schweregrad', () => {
    expect(
      summarizeIssues([
        { severity: 'error', code: 'a', message: '' },
        { severity: 'warning', code: 'b', message: '' },
        { severity: 'warning', code: 'c', message: '' },
        { severity: 'info', code: 'd', message: '' },
      ]),
    ).toEqual({ errors: 1, warnings: 2, infos: 1 });
  });
});

describe('QA: gültiges Bündel', () => {
  it('ein korrekt verknüpftes Bündel hat keine Fehler und keine Warnungen', () => {
    const b = build(
      files([
        entity('device:pulsoximeter', { links: [{ rel: 'uses_principle', to: 'term:spo2' }] }),
        entity('term:spo2'),
      ]),
    );
    expect(codes(b, 'error')).toEqual([]);
    expect(codes(b, 'warning')).toEqual([]);
    expect(b.entities).toHaveLength(2);
    expect(b.relations).toEqual([{ from: 'device:pulsoximeter', rel: 'uses_principle', to: 'term:spo2', note: undefined }]);
    // src:hersteller wird nicht verwendet → nur Hinweis
    expect(codes(b, 'info')).toEqual(['source.unused']);
  });

  it('Defaults (aliases, body, links, demo) werden gesetzt', () => {
    const b = build(files([entity('term:spo2')]));
    const e = b.entities[0]!;
    expect(e.aliases).toEqual([]);
    expect(e.body).toBe('');
    expect(e.demo).toBe(false);
    expect(e.type).toBe('term');
    expect(e.slug).toBe('spo2');
    expect(e.file).toBe('test.json');
  });
});

describe('QA: Schemafehler', () => {
  it('Datei ohne Objekt, JSON-Syntaxfehler und unbekannte Schlüssel', () => {
    const b = build([
      { file: 'a.json', json: [] },
      { file: 'b.json', json: { __parseError: 'Unexpected token' } },
      { file: 'c.json', json: { entities: [], foo: 1 } },
    ]);
    expect(codes(b, 'error').sort()).toEqual(['file.invalid', 'file.parse', 'file.unknown-keys']);
    expect(issuesFor(b, 'file.parse')[0]!.file).toBe('b.json');
  });

  it('ungültige Entität (ID, zu kurze Zusammenfassung, unbekannte Felder)', () => {
    const b = build(
      files([
        entity('gadget:foo'),
        entity('term:Gross-Schreibung'),
        entity('term:kurz', { summary: 'zu kurz' }),
        entity('term:extra', { unbekannt: true }),
      ]),
    );
    const schema = issuesFor(b, 'entity.schema');
    expect(schema).toHaveLength(4);
    expect(schema.map((i) => i.entityId)).toContain('term:kurz');
    expect(b.entities).toHaveLength(0);
  });

  it('ungültige typspezifische Daten', () => {
    const b = build(
      files([
        entity('device:ohne-kategorie', { data: {} }),
        entity('quiz_question:falsch', {
          data: {
            kind: 'single',
            question: 'Frage?',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            correct: ['a', 'b'],
            explanation: 'x',
            difficulty: 1,
          },
        }),
        entity('quiz_question:unbekannte-option', {
          data: {
            kind: 'multiple',
            question: 'Frage?',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            correct: ['c'],
            explanation: 'x',
            difficulty: 2,
          },
        }),
        entity('fault:diagnose-ziel-fehlt', {
          data: {
            severity: 'hoch',
            symptoms: ['S'],
            causes: [{ text: 'U', likelihood: 'selten' }],
            diagnosis: [{ id: 'start', instruction: 'Prüfen', question: 'OK?', yes: 'ende', no: 'gibt-es-nicht' }],
            outcomes: [{ id: 'ende', text: 'Fertig' }],
          },
        }),
        entity('media:beides', {
          data: { kind: 'schema', svg: '<svg></svg>', url: 'https://example.com/a.png', alt: 'Alternativtext', license: 'CC0', attribution: 'x' },
        }),
      ]),
    );
    const ids = issuesFor(b, 'entity.data-schema').map((i) => i.entityId);
    expect(ids.sort()).toEqual(['device:ohne-kategorie', 'fault:diagnose-ziel-fehlt', 'media:beides', 'quiz_question:falsch', 'quiz_question:unbekannte-option']);
  });

  it('ungültige Quelle', () => {
    const b = build(files([], [{ id: 'quelle-ohne-praefix', title: 'Titel', publisher: 'Verlag', kind: 'norm', accessedAt: '2026-01-01' }, { ...source('src:datum'), accessedAt: '01.01.2026' }]));
    expect(issuesFor(b, 'source.schema')).toHaveLength(2);
  });

  it('URLs nur mit http(s) – javascript:/data: werden abgelehnt', () => {
    const b = build(files([], [source('src:js', 'fachliteratur', 'javascript:alert(1)'), source('src:data', 'fachliteratur', 'data:text/html,x'), source('src:ok', 'fachliteratur', 'https://ok.example.com/')]));
    expect(issuesFor(b, 'source.schema').map((i) => i.sourceId).sort()).toEqual(['src:data', 'src:js']);
  });
});

describe('QA: Dubletten', () => {
  it('doppelte Entitäts-IDs (auch dateiübergreifend)', () => {
    const b = build([
      ...files([entity('term:spo2', { title: 'SpO2' })], [], 'a.json'),
      { file: 'b.json', json: { entities: [entity('term:spo2', { title: 'Anderer Titel' })] } },
    ]);
    const dup = issuesFor(b, 'entity.duplicate-id');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.file).toBe('b.json');
    expect(dup[0]!.message).toContain('a.json');
    expect(b.entities).toHaveLength(1);
  });

  it('doppelte Quellen-IDs', () => {
    const b = build(files([], [source('src:lit')]));
    expect(issuesFor(b, 'source.duplicate-id')).toHaveLength(1);
  });

  it('gleicher Titel bzw. Alias innerhalb eines Typs ist eine Dublette', () => {
    const b = build(
      files([
        entity('term:spo2', { title: 'SpO₂', aliases: ['Sauerstoffsättigung'] }),
        entity('term:sauerstoffsaettigung', { title: 'Sauerstoffsättigung' }),
      ]),
    );
    expect(issuesFor(b, 'entity.duplicate-name')).toHaveLength(1);
  });

  it('gleicher Name in unterschiedlichen Typen ist erlaubt', () => {
    const b = build(files([entity('term:pulsoximeter', { title: 'Pulsoximeter' }), entity('device:pulsoximeter', { title: 'Pulsoximeter' })]));
    expect(issuesFor(b, 'entity.duplicate-name')).toHaveLength(0);
  });

  it('Herstellernamen werden ohne Rechtsform verglichen ("Foo GmbH" = "Foo AG")', () => {
    const b = build(
      files([
        entity('manufacturer:foo-gmbh', { title: 'Foo GmbH', sources: ['src:hersteller'] }),
        entity('manufacturer:foo-ag', { title: 'Foo AG', sources: ['src:hersteller'] }),
        entity('manufacturer:bar', { title: 'Bar Medical', aliases: ['Foo Inc.'], sources: ['src:hersteller'] }),
      ]),
    );
    const dup = issuesFor(b, 'entity.duplicate-name');
    expect(dup.map((i) => i.entityId).sort()).toEqual(['manufacturer:bar', 'manufacturer:foo-ag']);
  });

  it('sehr ähnliche Titel erzeugen eine Warnung (keine Fehler)', () => {
    const b = build(files([entity('device:infusionspumpe', { title: 'Infusionspumpe' }), entity('device:infusionspumpen', { title: 'Infusionspumpen' })]));
    expect(issuesFor(b, 'entity.near-duplicate')).toHaveLength(1);
    expect(issuesFor(b, 'entity.near-duplicate')[0]!.severity).toBe('warning');
    expect(codes(b, 'error')).toEqual([]);
  });

  it('kurze oder deutlich verschiedene Titel sind keine Beinahe-Dubletten; Quizfragen werden ausgenommen', () => {
    const b = build(
      files([
        entity('term:ekg', { title: 'EKG' }),
        entity('term:eeg', { title: 'EEG' }),
        entity('device:pulsoximeter', { title: 'Pulsoximeter' }),
        entity('device:defibrillator', { title: 'Defibrillator' }),
        entity('quiz_question:frage-eins', { title: 'Frage zur Pulsoximetrie 1' }),
        entity('quiz_question:frage-zwei', { title: 'Frage zur Pulsoximetrie 2' }),
      ]),
    );
    expect(issuesFor(b, 'entity.near-duplicate')).toHaveLength(0);
  });

  it('doppelte Quellen-URLs (http/https und Schrägstrich am Ende werden normalisiert)', () => {
    const b = build(
      files(
        [],
        [source('src:a', 'norm', 'http://www.example.org/norm'), source('src:b', 'norm', 'https://www.example.org/norm/'), source('src:c', 'norm', 'https://www.example.org/andere')],
      ),
    );
    const dup = issuesFor(b, 'source.duplicate-url');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.sourceId).toBe('src:b');
    expect(dup[0]!.severity).toBe('error');
  });
});

describe('QA: Verknüpfungen', () => {
  it('Verweis auf nicht existierende Entität', () => {
    const b = build(files([entity('device:pulsoximeter', { links: [{ rel: 'uses_principle', to: 'term:gibt-es-nicht' }] })]));
    expect(issuesFor(b, 'link.broken')).toHaveLength(1);
    expect(b.relations).toHaveLength(0);
  });

  it('Selbstverweis', () => {
    const b = build(files([entity('term:spo2', { links: [{ rel: 'related', to: 'term:spo2' }] })]));
    expect(issuesFor(b, 'link.self')).toHaveLength(1);
  });

  it('nicht erlaubte Relationsrichtung (z. B. Fachbegriff "hat Komponente")', () => {
    const b = build(
      files([
        entity('term:spo2', { links: [{ rel: 'has_component', to: 'component:sensor' }] }),
        entity('component:sensor', { links: [{ rel: 'model_of', to: 'device:pulsoximeter' }] }),
        entity('device:pulsoximeter', { links: [{ rel: 'has_component', to: 'component:sensor' }] }),
      ]),
    );
    const notAllowed = issuesFor(b, 'link.not-allowed');
    expect(notAllowed.map((i) => i.entityId).sort()).toEqual(['component:sensor', 'term:spo2']);
    expect(b.relations).toEqual([{ from: 'device:pulsoximeter', rel: 'has_component', to: 'component:sensor', note: undefined }]);
  });

  it('umgekehrte Richtung einer gerichteten Relation ist nicht erlaubt (Komponente → Gerät)', () => {
    const b = build(files([entity('component:sensor', { links: [{ rel: 'has_component', to: 'device:pulsoximeter' }] }), entity('device:pulsoximeter')]));
    expect(issuesFor(b, 'link.not-allowed')).toHaveLength(1);
  });

  it('symmetrische Relationen werden nur einmal gespeichert; doppelte gerichtete Relationen warnen', () => {
    const b = build(
      files([
        entity('term:a-begriff', { links: [{ rel: 'related', to: 'term:b-begriff' }] }),
        entity('term:b-begriff', { links: [{ rel: 'related', to: 'term:a-begriff' }] }),
        entity('device:geraet', {
          links: [
            { rel: 'uses_principle', to: 'term:a-begriff' },
            { rel: 'uses_principle', to: 'term:a-begriff' },
          ],
        }),
      ]),
    );
    expect(b.relations.filter((r) => r.rel === 'related')).toHaveLength(1);
    expect(b.relations.filter((r) => r.rel === 'uses_principle')).toHaveLength(1);
    expect(issuesFor(b, 'link.duplicate')).toHaveLength(1);
  });

  it('defekte Inline-Wiki-Links in Text, Lernabschnitten, Diagnose und Quizerklärung', () => {
    const b = build(
      files([
        entity('term:spo2', { body: 'Siehe [[term:gibt-es-nicht]] und [[term:auch-nicht|Text]]. Gültig: [[device:pulsoximeter]]', links: [{ rel: 'related', to: 'device:pulsoximeter' }] }),
        entity('device:pulsoximeter'),
        entity('learning_module:kurs', {
          data: {
            level: 'einsteiger',
            durationMinutes: 5,
            objectives: ['Z'],
            sections: [{ title: 'A', body: 'Siehe [[fault:fehlt]]' }],
            prerequisites: ['learning_module:fehlt'],
          },
        }),
        entity('quiz_question:frage', {
          data: {
            kind: 'truefalse',
            question: 'Stimmt das?',
            options: [
              { id: 'ja', text: 'Ja' },
              { id: 'nein', text: 'Nein' },
            ],
            correct: ['ja'],
            explanation: 'Siehe [[term:nirgends]].',
            difficulty: 1,
          },
        }),
      ]),
    );
    const inline = issuesFor(b, 'link.broken-inline');
    expect(inline.filter((i) => i.entityId === 'term:spo2')).toHaveLength(2);
    expect(inline.filter((i) => i.entityId === 'learning_module:kurs')).toHaveLength(1);
    expect(inline.filter((i) => i.entityId === 'quiz_question:frage')).toHaveLength(1);
    // Voraussetzung, die nicht existiert
    expect(issuesFor(b, 'link.broken').map((i) => i.entityId)).toContain('learning_module:kurs');
  });

  it('typspezifische Referenzen: 3D-Teile, Simulationsszenarien, Nachfolger von Rechtsgrundlagen', () => {
    const b = build(
      files([
        entity('device:geraet', {
          data: {
            category: 'X',
            scene: {
              parts: [
                { id: 'gehaeuse', label: 'Gehäuse', shape: 'box', size: [1, 1, 1], position: [0, 0, 0], color: '#ffffff', component: 'component:fehlt' },
                { id: 'gehaeuse', label: 'Doppelt', shape: 'sphere', size: [1, 0, 0], position: [0, 0, 0], color: '#000000' },
              ],
            },
          },
        }),
        entity('simulation:sim', {
          data: {
            engine: 'pulse-oximetry',
            learningGoals: ['Z'],
            scenarios: [{ id: 's1', title: 'S', description: 'D', params: { saturation: 90 }, fault: 'fault:fehlt' }],
          },
        }),
        entity('legal_reference:alt', { data: { ...legalData(), status: 'ersetzt', supersededBy: 'legal_reference:fehlt' } }),
      ]),
    );
    expect(issuesFor(b, 'scene.duplicate-part')).toHaveLength(1);
    const broken = issuesFor(b, 'link.broken').map((i) => i.entityId).sort();
    expect(broken).toEqual(['device:geraet', 'legal_reference:alt', 'simulation:sim']);
  });

  it('nicht verknüpfte Inhalte erzeugen eine Warnung', () => {
    const b = build(files([entity('term:allein')]));
    expect(issuesFor(b, 'entity.orphan').map((i) => i.entityId)).toEqual(['term:allein']);
  });
});

function legalData(overrides: Record<string, unknown> = {}) {
  return {
    jurisdiction: 'DE',
    kind: 'verordnung',
    citation: '§ 1 TestV',
    status: 'in-kraft',
    verifiedAt: '2026-05-01',
    reviewIntervalDays: 365,
    ...overrides,
  };
}

describe('QA: Quellen & Belege', () => {
  it('nicht definierte Quellen (Entität und technische Angabe)', () => {
    const b = build(
      files([
        entity('device:geraet', {
          sources: ['src:unbekannt'],
          specs: [{ key: 'gewicht', label: 'Gewicht', value: 1, unit: 'kg', source: 'src:auch-unbekannt' }],
        }),
      ]),
    );
    expect(issuesFor(b, 'source.missing')).toHaveLength(2);
  });

  it('requiresSource: Inhalte ohne Quelle sind Fehler – außer Demo-Inhalte und quellenfreie Typen', () => {
    const b = build(
      files([
        entity('device:ohne-quelle', { sources: [] }),
        entity('device:demo-ohne-quelle', { sources: [], demo: true, title: 'Demo-Gerät' }),
        entity('media:bild', { sources: [] }),
        entity('quiz_question:frage', { sources: [] }),
        entity('device:nur-spec', { sources: [], specs: [{ key: 'gewicht', label: 'Gewicht', value: 1, unit: 'kg', source: 'src:lit' }] }),
      ]),
    );
    expect(issuesFor(b, 'source.required').map((i) => i.entityId)).toEqual(['device:ohne-quelle']);
  });

  it('Herstellerangaben brauchen eine Hersteller- oder Behördenquelle', () => {
    const b = build(
      files(
        [
          entity('manufacturer:nur-literatur', { title: 'Literatur GmbH', sources: ['src:lit'] }),
          entity('manufacturer:mit-hersteller', { title: 'Hersteller AG', sources: ['src:hersteller'] }),
          entity('manufacturer:mit-behoerde', { title: 'Behördlich belegt', sources: ['src:bfarm'] }),
          entity('product_model:modell', { title: 'Modell X', sources: ['src:lit'] }),
          entity('spare_part:teil', { title: 'Teil Y', sources: [], specs: [{ key: 'laenge', label: 'Länge', value: 1, unit: 'm', source: 'src:hersteller' }] }),
          entity('manufacturer:demo', { title: 'Demo Medizintechnik', sources: [], demo: true }),
        ],
        [source('src:bfarm', 'behoerde', 'https://www.bfarm.de/')],
      ),
    );
    expect(issuesFor(b, 'source.manufacturer-claim').map((i) => i.entityId).sort()).toEqual(['manufacturer:nur-literatur', 'product_model:modell']);
  });

  it('Demo-Produkte dürfen keinem realen Hersteller zugeordnet sein', () => {
    const b = build(
      files([
        entity('manufacturer:real', { title: 'Real GmbH', sources: ['src:hersteller'] }),
        entity('manufacturer:fiktiv', { title: 'Fiktiv Demo', sources: [], demo: true }),
        entity('product_model:demo-falsch', { title: 'Demo A', demo: true, sources: [], links: [{ rel: 'manufactured_by', to: 'manufacturer:real' }] }),
        entity('product_model:demo-richtig', { title: 'Demo B', demo: true, sources: [], links: [{ rel: 'manufactured_by', to: 'manufacturer:fiktiv' }] }),
        entity('component:demo-bauteil', { title: 'Demo C', demo: true, sources: [], links: [{ rel: 'manufactured_by', to: 'manufacturer:real' }] }),
      ]),
    );
    expect(issuesFor(b, 'demo.real-manufacturer').map((i) => i.entityId).sort()).toEqual(['component:demo-bauteil', 'product_model:demo-falsch']);
  });

  it('Angebote ohne demo: true sind Fehler', () => {
    const b = build(files([entity('offer:echt', { sources: [] }), entity('offer:demo', { sources: [], demo: true, title: 'Demo-Angebot' })]));
    expect(issuesFor(b, 'demo.offer').map((i) => i.entityId)).toEqual(['offer:echt']);
    expect(flagKinds(b, 'offer:demo')).toContain('demo');
  });

  it('ungenutzte Quellen sind nur ein Hinweis', () => {
    const b = build(files([entity('term:spo2', { sources: ['src:hersteller'] })]));
    expect(issuesFor(b, 'source.unused').map((i) => [i.sourceId, i.severity])).toEqual([['src:lit', 'info']]);
  });
});

describe('QA: widersprüchliche technische Angaben', () => {
  const spec = (value: string | number, extra: Record<string, unknown> = {}) => ({
    key: 'spo2_genauigkeit',
    label: 'SpO₂-Genauigkeit',
    value,
    unit: '%',
    source: 'src:lit',
    ...extra,
  });

  it('gleicher Schlüssel, andere Werte → Fehler und Kennzeichnung', () => {
    const b = build(files([entity('device:geraet', { specs: [spec('±2'), spec('±3', { source: 'src:hersteller' })] })]));
    expect(issuesFor(b, 'spec.contradiction')).toHaveLength(1);
    const flag = b.flags.get('device:geraet')!.find((f) => f.kind === 'contradiction');
    expect(flag).toMatchObject({ kind: 'contradiction', key: 'spo2_genauigkeit' });
  });

  it('unterschiedliche Einheiten gelten als Widerspruch', () => {
    const b = build(files([entity('device:geraet', { specs: [spec(2), spec(2, { unit: 'Prozentpunkte' })] })]));
    expect(issuesFor(b, 'spec.contradiction')).toHaveLength(1);
  });

  it('unterschiedliche Bedingungen sind KEIN Widerspruch', () => {
    const b = build(
      files([
        entity('device:geraet', {
          specs: [spec('±2', { condition: 'bei 70–100 % SpO₂' }), spec('±3', { condition: 'bei Bewegung' }), spec('±4')],
        }),
      ]),
    );
    expect(issuesFor(b, 'spec.contradiction')).toHaveLength(0);
    expect(flagKinds(b, 'device:geraet')).not.toContain('contradiction');
  });

  it('gleiche Werte in anderer Schreibweise (Komma, Leerzeichen, Großschreibung) sind kein Widerspruch', () => {
    const b = build(files([entity('device:geraet', { specs: [spec('1,5'), spec('1.5'), spec(1.5), spec(' 1.5 ', { unit: ' % ' })] })]));
    expect(issuesFor(b, 'spec.contradiction')).toHaveLength(0);
  });

  it('Bedingungen werden ohne Groß-/Kleinschreibung verglichen', () => {
    const b = build(files([entity('device:geraet', { specs: [spec('±2', { condition: 'Ruhe' }), spec('±3', { condition: 'ruhe ' })] })]));
    expect(issuesFor(b, 'spec.contradiction')).toHaveLength(1);
  });
});

describe('QA: Aktualität & Rechtsstand', () => {
  it('Prüfdatum älter als maxReviewAgeDays → Warnung und Kennzeichnung "outdated"', () => {
    const b = build(files([entity('term:alt', { review: { status: 'geprueft', reviewedAt: '2023-01-01' } }), entity('term:neu')]), { maxReviewAgeDays: 730 });
    expect(issuesFor(b, 'review.stale').map((i) => i.entityId)).toEqual(['term:alt']);
    expect(flagKinds(b, 'term:alt')).toContain('outdated');
    expect(flagKinds(b, 'term:neu')).not.toContain('outdated');
  });

  it('maxReviewAgeDays ist konfigurierbar', () => {
    const b = build(files([entity('term:spo2', { review: { status: 'geprueft', reviewedAt: '2026-04-01' } })]), { maxReviewAgeDays: 30 });
    expect(issuesFor(b, 'review.stale')).toHaveLength(1);
  });

  it('Status "veraltet" wird gekennzeichnet, aber ohne zusätzliche Warnung', () => {
    const b = build(files([entity('term:spo2', { review: { status: 'veraltet', reviewedAt: '2026-05-01' } })]));
    expect(flagKinds(b, 'term:spo2')).toContain('outdated');
    expect(issuesFor(b, 'review.stale')).toHaveLength(0);
  });

  it('Entwürfe und Demo-Inhalte werden gekennzeichnet', () => {
    const b = build(files([entity('term:entwurf', { review: { status: 'entwurf', reviewedAt: '2026-05-01' } }), entity('device:demo', { demo: true })]));
    expect(flagKinds(b, 'term:entwurf')).toEqual(['draft']);
    expect(flagKinds(b, 'device:demo')).toEqual(['demo']);
  });

  it('Prüfdaten in der Zukunft sind Fehler', () => {
    const b = build(
      files([
        entity('term:zukunft', { review: { status: 'geprueft', reviewedAt: '2026-12-24' } }),
        entity('legal_reference:zukunft', { data: legalData({ verifiedAt: '2027-01-01' }) }),
      ]),
    );
    expect(issuesFor(b, 'review.future').map((i) => i.entityId)).toEqual(['term:zukunft']);
    expect(issuesFor(b, 'legal.future').map((i) => i.entityId)).toEqual(['legal_reference:zukunft']);
  });

  it('das heutige Datum (bzw. Zeitzonen-Toleranz von einem Tag) ist kein Zukunftsdatum', () => {
    const b = build(files([entity('term:heute', { review: { status: 'geprueft', reviewedAt: '2026-06-02' } })]));
    expect(issuesFor(b, 'review.future')).toHaveLength(0);
  });

  it('fällige Rechtsprüfung wird gekennzeichnet und über based_on weitergegeben', () => {
    const b = build(
      files([
        entity('legal_reference:mpbetreibv', { title: 'MPBetreibV', data: legalData({ verifiedAt: '2025-01-01', reviewIntervalDays: 365 }) }),
        entity('test_procedure:stk', { links: [{ rel: 'based_on', to: 'legal_reference:mpbetreibv' }] }),
        entity('legal_reference:aktuell', { title: 'Aktuelle Norm', data: legalData({ verifiedAt: '2026-05-01' }) }),
        entity('test_procedure:mtk', { links: [{ rel: 'based_on', to: 'legal_reference:aktuell' }] }),
      ]),
    );
    const due = b.flags.get('legal_reference:mpbetreibv')!.find((f) => f.kind === 'legal-review-due');
    expect(due).toMatchObject({ kind: 'legal-review-due', since: '2026-01-01' });
    expect(issuesFor(b, 'legal.review-due').map((i) => [i.entityId, i.severity])).toEqual([['legal_reference:mpbetreibv', 'warning']]);

    const propagated = b.flags.get('test_procedure:stk')!.find((f) => f.kind === 'legal-review-due');
    expect(propagated).toBeDefined();
    expect(propagated!.message).toContain('MPBetreibV');
    expect(flagKinds(b, 'test_procedure:mtk')).toEqual([]);
    expect(flagKinds(b, 'legal_reference:aktuell')).toEqual([]);
  });

  it('Standard-Prüfintervall ist 365 Tage', () => {
    const { reviewIntervalDays: _r, ...rest } = legalData({ verifiedAt: '2025-05-01' });
    const b = build(files([entity('legal_reference:x', { data: rest })]));
    expect(flagKinds(b, 'legal_reference:x')).toContain('legal-review-due');
  });

  it('ersetzte Rechtsgrundlage: Kennzeichnung mit Nachfolger, Warnung für abhängige Inhalte', () => {
    const b = build(
      files([
        entity('legal_reference:mpg', { title: 'Medizinproduktegesetz', data: legalData({ status: 'ersetzt', supersededBy: 'legal_reference:mpdg' }) }),
        entity('legal_reference:mpdg', { title: 'Medizinprodukterecht-Durchführungsgesetz', data: legalData() }),
        entity('legal_reference:aufgehoben', { title: 'Alte Verordnung', data: legalData({ status: 'aufgehoben' }) }),
        entity('legal_reference:ohne-nachfolger', { title: 'Ersetzt ohne Nachfolger', data: legalData({ status: 'ersetzt' }) }),
        entity('document:merkblatt', { links: [{ rel: 'based_on', to: 'legal_reference:mpg' }] }),
      ]),
    );
    const sup = b.flags.get('legal_reference:mpg')!.find((f) => f.kind === 'superseded');
    expect(sup).toMatchObject({ kind: 'superseded', by: 'legal_reference:mpdg' });
    expect(sup!.message).toContain('Medizinprodukterecht-Durchführungsgesetz');
    expect(flagKinds(b, 'legal_reference:aufgehoben')).toContain('superseded');
    expect(issuesFor(b, 'legal.superseded-missing').map((i) => i.entityId)).toEqual(['legal_reference:ohne-nachfolger']);
    expect(issuesFor(b, 'legal.based-on-superseded').map((i) => i.entityId)).toEqual(['document:merkblatt']);
    expect(flagKinds(b, 'document:merkblatt')).toContain('superseded');
    expect(codes(b, 'error')).toEqual([]);
  });
});
