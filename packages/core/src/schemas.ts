import { z } from 'zod';
import { ENTITY_TYPES, SLUG_PATTERN, type EntityType } from './entity-types.ts';
import { RELATION_TYPES } from './relations.ts';

/**
 * Schemas für die Inhaltsdateien unter /content.
 *
 * Inhalte werden als versionierte JSON-Dateien gepflegt (Review per Pull
 * Request), beim Seeding validiert und in die zentrale Datenbank geladen.
 * Diese Schemas sind der Vertrag zwischen Redaktion, Datenbank und Modulen.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT erwartet');

export const entityIdSchema = z.string().refine(
  (v) => {
    const i = v.indexOf(':');
    return i > 0 && (ENTITY_TYPES as readonly string[]).includes(v.slice(0, i)) && SLUG_PATTERN.test(v.slice(i + 1));
  },
  { message: 'Ungültige Entitäts-ID (erwartet <typ>:<slug>, z. B. device:pulsoximeter)' },
);

export const sourceIdSchema = z.string().regex(/^src:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Quellen-ID muss die Form src:<slug> haben');

// ---------------------------------------------------------------------------
// Quellen
// ---------------------------------------------------------------------------

export const SOURCE_KINDS = ['norm', 'gesetz', 'behoerde', 'hersteller', 'fachliteratur', 'wissenschaft', 'verband', 'intern'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const sourceSchema = z
  .object({
    id: sourceIdSchema,
    title: z.string().min(3),
    publisher: z.string().min(2),
    kind: z.enum(SOURCE_KINDS),
    url: z.url().optional(),
    /** Ausgabe/Version, z. B. "2019-08" bei Normen oder "BGBl. I S. 2177" */
    edition: z.string().optional(),
    isbn: z.string().optional(),
    accessedAt: isoDate,
    note: z.string().optional(),
  })
  .strict();
export type Source = z.infer<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// Technische Daten
// ---------------------------------------------------------------------------

export const specSchema = z
  .object({
    /** Maschinenlesbarer Schlüssel, z. B. spo2_accuracy */
    key: z.string().regex(/^[a-z0-9_]+$/),
    label: z.string().min(2),
    value: z.union([z.string().min(1), z.number()]),
    unit: z.string().optional(),
    /** Jede technische Angabe braucht eine Quelle. */
    source: sourceIdSchema,
    /** Bedingungen/Varianten, z. B. "bei 70–100 % SpO2". Unterschiedliche Bedingungen sind kein Widerspruch. */
    condition: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type Spec = z.infer<typeof specSchema>;

// ---------------------------------------------------------------------------
// 3D-Szenen (3D Explorer)
// ---------------------------------------------------------------------------

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const scenePartSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string(),
    /** Verknüpfte Komponente aus der zentralen Datenbasis */
    component: entityIdSchema.optional(),
    shape: z.enum(['box', 'cylinder', 'sphere', 'capsule', 'torus', 'cone']),
    /** box: [b, h, t]; cylinder/cone: [radius, höhe, -]; sphere: [radius, -, -]; capsule: [radius, länge, -]; torus: [radius, rohr, -] */
    size: vec3,
    position: vec3,
    rotation: vec3.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0.05).max(1).optional(),
    description: z.string().optional(),
  })
  .strict();

export const sceneSchema = z
  .object({
    camera: vec3.optional(),
    parts: z.array(scenePartSchema).min(1),
  })
  .strict();
export type Scene3D = z.infer<typeof sceneSchema>;

// ---------------------------------------------------------------------------
// Typspezifische Daten
// ---------------------------------------------------------------------------

const markdown = z.string();

export const deviceDataSchema = z
  .object({
    category: z.string(),
    /** Typische Risikoklasse nach MDR Anhang VIII – kann je nach Produkt abweichen */
    typicalRiskClass: z.enum(['I', 'IIa', 'IIb', 'III']).optional(),
    applications: z.array(z.string()).default([]),
    operatingPrinciple: z.string().optional(),
    scene: sceneSchema.optional(),
  })
  .strict();

export const manufacturerDataSchema = z
  .object({
    country: z.string(),
    website: z.url().optional(),
    founded: z.number().int().optional(),
    focus: z.array(z.string()).default([]),
  })
  .strict();

export const productModelDataSchema = z
  .object({
    status: z.enum(['aktiv', 'abgekuendigt', 'unbekannt']),
    releaseYear: z.number().int().optional(),
    riskClass: z.enum(['I', 'IIa', 'IIb', 'III']).optional(),
    scene: sceneSchema.optional(),
  })
  .strict();

export const COMPONENT_KINDS = ['sensor', 'aktor', 'elektronik', 'mechanik', 'pneumatik', 'optik', 'software', 'energie', 'verbrauchsmaterial', 'anzeige'] as const;

export const componentDataSchema = z
  .object({
    kind: z.enum(COMPONENT_KINDS),
    function: z.string(),
    wearPart: z.boolean().default(false),
  })
  .strict();

export const termDataSchema = z
  .object({
    category: z.enum(['messprinzip', 'physiologie', 'technik', 'recht', 'qualitaet', 'sicherheit', 'allgemein']),
    abbreviation: z.string().optional(),
    english: z.string().optional(),
    formula: z.string().optional(),
  })
  .strict();

export const mediaDataSchema = z
  .object({
    kind: z.enum(['schema', 'foto', 'diagramm', 'icon']),
    /** Inline-SVG (wird ausschließlich als <img> gerendert, nie als HTML) */
    svg: z.string().startsWith('<svg').optional(),
    url: z.url().optional(),
    alt: z.string().min(5),
    license: z.string(),
    attribution: z.string(),
  })
  .strict()
  .refine((d) => Boolean(d.svg) !== Boolean(d.url), { message: 'Genau eines von svg oder url angeben' });

export const learningModuleDataSchema = z
  .object({
    level: z.enum(['einsteiger', 'fortgeschritten', 'experte']),
    durationMinutes: z.number().int().positive(),
    objectives: z.array(z.string()).min(1),
    sections: z.array(z.object({ title: z.string(), body: markdown }).strict()).min(1),
    prerequisites: z.array(entityIdSchema).default([]),
  })
  .strict();

export const quizQuestionDataSchema = z
  .object({
    kind: z.enum(['single', 'multiple', 'truefalse']),
    question: z.string(),
    options: z.array(z.object({ id: z.string(), text: z.string() }).strict()).min(2),
    correct: z.array(z.string()).min(1),
    explanation: z.string(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict()
  .refine((q) => q.correct.every((c) => q.options.some((o) => o.id === c)), {
    message: 'Alle korrekten Antworten müssen in options vorkommen',
  })
  .refine((q) => q.kind !== 'single' && q.kind !== 'truefalse' ? true : q.correct.length === 1, {
    message: 'single/truefalse erlauben genau eine korrekte Antwort',
  });

export const SIMULATION_ENGINES = ['pulse-oximetry', 'ventilation', 'ecg-monitor', 'infusion-pump', 'electrical-safety'] as const;
export type SimulationEngine = (typeof SIMULATION_ENGINES)[number];

export const simulationDataSchema = z
  .object({
    engine: z.enum(SIMULATION_ENGINES),
    learningGoals: z.array(z.string()).min(1),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            title: z.string(),
            description: z.string(),
            params: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])),
            /** Verknüpftes Fehlerbild, das dieses Szenario demonstriert */
            fault: entityIdSchema.optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const faultDataSchema = z
  .object({
    severity: z.enum(['niedrig', 'mittel', 'hoch', 'kritisch']),
    symptoms: z.array(z.string()).min(1),
    causes: z.array(z.object({ text: z.string(), likelihood: z.enum(['haeufig', 'gelegentlich', 'selten']) }).strict()).min(1),
    /** Diagnosebaum: Schritte verweisen per ID aufeinander */
    diagnosis: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            instruction: z.string(),
            question: z.string(),
            yes: z.string(),
            no: z.string(),
          })
          .strict(),
      )
      .default([]),
    /** Ergebnisse des Diagnosebaums (Ziele von yes/no) */
    outcomes: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), text: z.string() }).strict()).default([]),
    remedies: z.array(z.string()).default([]),
    safetyNotes: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set([...f.diagnosis.map((s) => s.id), ...f.outcomes.map((o) => o.id)]);
    for (const s of f.diagnosis) {
      for (const target of [s.yes, s.no]) {
        if (!ids.has(target)) ctx.addIssue({ code: 'custom', message: `Diagnoseschritt ${s.id} verweist auf unbekanntes Ziel "${target}"` });
      }
    }
  });

export const testProcedureDataSchema = z
  .object({
    kind: z.enum(['STK', 'MTK', 'elektrische-sicherheit', 'funktionspruefung', 'wartung', 'abnahmepruefung']),
    interval: z.string().optional(),
    qualification: z.string(),
    equipment: z.array(z.string()).default([]),
    steps: z
      .array(
        z
          .object({
            title: z.string(),
            description: z.string(),
            /** Grenzwert inkl. Quelle in der Spezifikation (specs) des Verfahrens */
            limit: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    documentation: z.array(z.string()).default([]),
  })
  .strict();

export const sparePartDataSchema = z
  .object({
    partNumber: z.string(),
    kind: z.enum(COMPONENT_KINDS),
    wearPart: z.boolean().default(false),
    original: z.boolean(),
    typicalLifetime: z.string().optional(),
  })
  .strict();

export const documentDataSchema = z
  .object({
    docType: z.enum(['gebrauchsanweisung', 'serviceanleitung', 'protokollvorlage', 'merkblatt', 'checkliste', 'leitfaden']),
    language: z.string().default('de'),
    version: z.string().optional(),
    url: z.url().optional(),
  })
  .strict();

export const legalReferenceDataSchema = z
  .object({
    jurisdiction: z.enum(['EU', 'DE', 'AT', 'CH', 'international']),
    kind: z.enum(['verordnung', 'gesetz', 'norm', 'leitlinie', 'empfehlung']),
    citation: z.string(),
    status: z.enum(['in-kraft', 'entwurf', 'ersetzt', 'aufgehoben']),
    validFrom: isoDate.optional(),
    /** Datum, an dem der Rechtsstand zuletzt gegen die Primärquelle geprüft wurde */
    verifiedAt: isoDate,
    /** Nach Ablauf gilt der Eintrag als "Prüfung fällig" und wird gekennzeichnet */
    reviewIntervalDays: z.number().int().positive().default(365),
    supersededBy: entityIdSchema.optional(),
  })
  .strict();

export const jobProfileDataSchema = z
  .object({
    tasks: z.array(z.string()).min(1),
    qualifications: z.array(z.string()).min(1),
    workplaces: z.array(z.string()).default([]),
    careerPaths: z.array(z.string()).default([]),
  })
  .strict();

export const offerDataSchema = z
  .object({
    seller: z.string(),
    price: z.number().nonnegative(),
    currency: z.literal('EUR'),
    condition: z.enum(['neu', 'gebraucht', 'generalueberholt']),
    stock: z.number().int().nonnegative(),
    location: z.string(),
    warrantyMonths: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ENTITY_DATA_SCHEMAS: Record<EntityType, z.ZodType> = {
  device: deviceDataSchema,
  manufacturer: manufacturerDataSchema,
  product_model: productModelDataSchema,
  component: componentDataSchema,
  term: termDataSchema,
  media: mediaDataSchema,
  learning_module: learningModuleDataSchema,
  quiz_question: quizQuestionDataSchema,
  simulation: simulationDataSchema,
  fault: faultDataSchema,
  test_procedure: testProcedureDataSchema,
  spare_part: sparePartDataSchema,
  document: documentDataSchema,
  legal_reference: legalReferenceDataSchema,
  job_profile: jobProfileDataSchema,
  offer: offerDataSchema,
};

export type DeviceData = z.infer<typeof deviceDataSchema>;
export type ManufacturerData = z.infer<typeof manufacturerDataSchema>;
export type ProductModelData = z.infer<typeof productModelDataSchema>;
export type ComponentData = z.infer<typeof componentDataSchema>;
export type TermData = z.infer<typeof termDataSchema>;
export type MediaData = z.infer<typeof mediaDataSchema>;
export type LearningModuleData = z.infer<typeof learningModuleDataSchema>;
export type QuizQuestionData = z.infer<typeof quizQuestionDataSchema>;
export type SimulationData = z.infer<typeof simulationDataSchema>;
export type FaultData = z.infer<typeof faultDataSchema>;
export type TestProcedureData = z.infer<typeof testProcedureDataSchema>;
export type SparePartData = z.infer<typeof sparePartDataSchema>;
export type DocumentData = z.infer<typeof documentDataSchema>;
export type LegalReferenceData = z.infer<typeof legalReferenceDataSchema>;
export type JobProfileData = z.infer<typeof jobProfileDataSchema>;
export type OfferData = z.infer<typeof offerDataSchema>;

export interface EntityDataMap {
  device: DeviceData;
  manufacturer: ManufacturerData;
  product_model: ProductModelData;
  component: ComponentData;
  term: TermData;
  media: MediaData;
  learning_module: LearningModuleData;
  quiz_question: QuizQuestionData;
  simulation: SimulationData;
  fault: FaultData;
  test_procedure: TestProcedureData;
  spare_part: SparePartData;
  document: DocumentData;
  legal_reference: LegalReferenceData;
  job_profile: JobProfileData;
  offer: OfferData;
}

// ---------------------------------------------------------------------------
// Entität (Inhaltsdatei)
// ---------------------------------------------------------------------------

export const REVIEW_STATUSES = ['entwurf', 'geprueft', 'veraltet'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const linkSchema = z
  .object({
    rel: z.enum(RELATION_TYPES),
    to: entityIdSchema,
    note: z.string().optional(),
  })
  .strict();

export const contentEntitySchema = z
  .object({
    id: entityIdSchema,
    title: z.string().min(2).max(120),
    aliases: z.array(z.string()).default([]),
    summary: z.string().min(20).max(400),
    /** Markdown-Text. Interne Verweise als [[typ:slug]] oder [[typ:slug|Text]] */
    body: markdown.default(''),
    tags: z.array(z.string()).default([]),
    data: z.unknown(),
    links: z.array(linkSchema).default([]),
    sources: z.array(sourceIdSchema).default([]),
    specs: z.array(specSchema).default([]),
    review: z
      .object({
        status: z.enum(REVIEW_STATUSES),
        reviewedAt: isoDate,
        reviewer: z.string().optional(),
      })
      .strict(),
    /**
     * Demo-Inhalte (fiktive Hersteller, Modelle, Angebote) sind deutlich
     * gekennzeichnet und werden nie als reale Herstellerangabe dargestellt.
     */
    demo: z.boolean().default(false),
  })
  .strict();

export type ContentEntityInput = z.input<typeof contentEntitySchema>;
export type ContentEntity = z.infer<typeof contentEntitySchema>;

export const contentFileSchema = z
  .object({
    $schema: z.string().optional(),
    sources: z.array(sourceSchema).default([]),
    entities: z.array(contentEntitySchema).default([]),
  })
  .strict();
export type ContentFile = z.infer<typeof contentFileSchema>;
