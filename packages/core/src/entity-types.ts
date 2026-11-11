import type { ModuleId } from './modules.ts';

/**
 * Alle Inhaltstypen der zentralen Datenbasis.
 *
 * Es gibt GENAU EINE Datenbasis für alle Module. Ein Pulsoximeter existiert
 * einmal (device:pulsoximeter) und wird vom Wiki, Repair Lab, 3D Explorer,
 * Simulator, Market, der Prüfakademie und dem Copilot gemeinsam genutzt.
 *
 * Technische Daten, Quellen und Relationen sind KEINE eigenen Entitäten,
 * sondern eigene Tabellen (specs, sources, relations), damit sie zentral
 * geprüft werden können (Widersprüche, Belege, tote Links).
 */
export const ENTITY_TYPES = [
  'device',
  'manufacturer',
  'product_model',
  'component',
  'term',
  'media',
  'learning_module',
  'quiz_question',
  'simulation',
  'fault',
  'test_procedure',
  'spare_part',
  'document',
  'legal_reference',
  'job_profile',
  'offer',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface EntityTypeDefinition {
  type: EntityType;
  label: string;
  plural: string;
  /** Modul, in dem die Detailseite primär angezeigt wird */
  homeModule: ModuleId;
  /** Weitere Module, in denen der Typ eine Rolle spielt (für Suche/Filter) */
  alsoIn: ModuleId[];
  description: string;
  icon: string;
  /**
   * Müssen Inhalte dieses Typs mindestens eine Quelle haben?
   * (Qualitätssicherung: keine unbelegten Angaben)
   */
  requiresSource: boolean;
}

export const ENTITY_TYPE_DEFS: Record<EntityType, EntityTypeDefinition> = {
  device: {
    type: 'device',
    label: 'Medizingerät',
    plural: 'Medizingeräte',
    homeModule: 'wiki',
    alsoIn: ['explorer', 'repair', 'simulator', 'academy', 'market'],
    description: 'Geräteklasse bzw. Gerätetyp, z. B. Pulsoximeter, Patientenmonitor, Beatmungsgerät.',
    icon: 'device',
    requiresSource: true,
  },
  manufacturer: {
    type: 'manufacturer',
    label: 'Hersteller',
    plural: 'Hersteller',
    homeModule: 'wiki',
    alsoIn: ['market'],
    description: 'Hersteller von Medizinprodukten.',
    icon: 'factory',
    requiresSource: true,
  },
  product_model: {
    type: 'product_model',
    label: 'Produktmodell',
    plural: 'Produktmodelle',
    homeModule: 'wiki',
    alsoIn: ['market', 'repair', 'explorer'],
    description: 'Konkretes Produktmodell eines Herstellers.',
    icon: 'tag',
    requiresSource: true,
  },
  component: {
    type: 'component',
    label: 'Komponente',
    plural: 'Komponenten',
    homeModule: 'wiki',
    alsoIn: ['explorer', 'repair', 'market'],
    description: 'Baugruppe, Sensor oder Bauteil eines Geräts.',
    icon: 'chip',
    requiresSource: true,
  },
  term: {
    type: 'term',
    label: 'Fachbegriff',
    plural: 'Fachbegriffe',
    homeModule: 'wiki',
    alsoIn: ['academy', 'copilot'],
    description: 'Begriff, Messprinzip oder Konzept aus dem Wissenslexikon.',
    icon: 'book',
    requiresSource: true,
  },
  media: {
    type: 'media',
    label: 'Bild',
    plural: 'Bilder',
    homeModule: 'wiki',
    alsoIn: ['explorer'],
    description: 'Abbildung, Schema oder Diagramm mit Lizenzangabe.',
    icon: 'image',
    requiresSource: false,
  },
  learning_module: {
    type: 'learning_module',
    label: 'Lernmodul',
    plural: 'Lernmodule',
    homeModule: 'academy',
    alsoIn: ['career', 'wiki'],
    description: 'Strukturierte Lerneinheit mit Lernzielen und Abschnitten.',
    icon: 'graduation',
    requiresSource: true,
  },
  quiz_question: {
    type: 'quiz_question',
    label: 'Quizfrage',
    plural: 'Quizfragen',
    homeModule: 'academy',
    alsoIn: [],
    description: 'Prüfungs- bzw. Übungsfrage mit Erklärung.',
    icon: 'question',
    requiresSource: false,
  },
  simulation: {
    type: 'simulation',
    label: 'Simulation',
    plural: 'Simulationen',
    homeModule: 'simulator',
    alsoIn: ['academy'],
    description: 'Interaktive Simulation eines Messprinzips oder Geräteverhaltens.',
    icon: 'pulse',
    requiresSource: true,
  },
  fault: {
    type: 'fault',
    label: 'Fehlerbild',
    plural: 'Fehlerbilder',
    homeModule: 'repair',
    alsoIn: ['simulator', 'academy'],
    description: 'Typisches Fehlerbild mit Ursachen, Diagnose und Abhilfe.',
    icon: 'alert',
    requiresSource: true,
  },
  test_procedure: {
    type: 'test_procedure',
    label: 'Prüfverfahren',
    plural: 'Prüfverfahren',
    homeModule: 'academy',
    alsoIn: ['repair'],
    description: 'Prüfung nach Norm oder Verordnung, z. B. STK, MTK, elektrische Sicherheit.',
    icon: 'clipboard',
    requiresSource: true,
  },
  spare_part: {
    type: 'spare_part',
    label: 'Ersatzteil',
    plural: 'Ersatzteile',
    homeModule: 'market',
    alsoIn: ['repair'],
    description: 'Ersatz- oder Verschleißteil mit Kompatibilität.',
    icon: 'box',
    requiresSource: true,
  },
  document: {
    type: 'document',
    label: 'Dokumentation',
    plural: 'Dokumentationen',
    homeModule: 'wiki',
    alsoIn: ['repair', 'academy'],
    description: 'Gebrauchsanweisung, Serviceanleitung, Prüfprotokoll-Vorlage oder Merkblatt.',
    icon: 'file',
    requiresSource: true,
  },
  legal_reference: {
    type: 'legal_reference',
    label: 'Rechtsgrundlage',
    plural: 'Rechtsgrundlagen',
    homeModule: 'wiki',
    alsoIn: ['academy'],
    description: 'Gesetz, Verordnung oder Norm mit Stand und Prüfdatum.',
    icon: 'scale',
    requiresSource: true,
  },
  job_profile: {
    type: 'job_profile',
    label: 'Berufsbild',
    plural: 'Berufsbilder',
    homeModule: 'career',
    alsoIn: [],
    description: 'Berufsbild mit Aufgaben, Kompetenzen und Lernpfad.',
    icon: 'briefcase',
    requiresSource: true,
  },
  offer: {
    type: 'offer',
    label: 'Angebot',
    plural: 'Angebote',
    homeModule: 'market',
    alsoIn: [],
    description: 'Marktplatz-Angebot für ein Ersatzteil oder Gerät.',
    icon: 'cart',
    requiresSource: false,
  },
};

export const ENTITY_TYPE_LIST: EntityTypeDefinition[] = ENTITY_TYPES.map((t) => ENTITY_TYPE_DEFS[t]);

/** Entitäts-IDs haben die Form `<typ>:<slug>`, z. B. `device:pulsoximeter`. */
export type EntityId = `${EntityType}:${string}`;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseEntityId(id: string): { type: EntityType; slug: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const type = id.slice(0, idx);
  const slug = id.slice(idx + 1);
  if (!(ENTITY_TYPES as readonly string[]).includes(type)) return null;
  if (!SLUG_PATTERN.test(slug)) return null;
  return { type: type as EntityType, slug };
}

export function isEntityId(id: string): id is EntityId {
  return parseEntityId(id) !== null;
}

/** Kanonische Frontend-Route einer Entität (einheitliche Detailseite). */
export function entityPath(id: string): string {
  const parsed = parseEntityId(id);
  if (!parsed) return '/';
  return `/e/${parsed.type}/${parsed.slug}`;
}
