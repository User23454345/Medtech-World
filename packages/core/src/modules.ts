/**
 * Plattformmodule von MedTech World.
 *
 * Jedes Modul ist eigenständig nutzbar (eigene Route, eigene Startseite),
 * greift aber auf dieselbe Datenbasis, dieselbe Nutzerverwaltung und
 * dasselbe Designsystem zu. Neue Module werden hier registriert.
 */
export const MODULE_IDS = [
  'wiki',
  'repair',
  'explorer',
  'market',
  'simulator',
  'academy',
  'copilot',
  'career',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleDefinition {
  id: ModuleId;
  /** Anzeigename */
  name: string;
  /** Kurzname für die Navigation */
  shortName: string;
  /** Basis-Route im Frontend */
  path: string;
  /** Ein Satz, was das Modul leistet */
  tagline: string;
  /** Akzentfarbe (Token aus dem Designsystem) */
  accent: string;
  /** Icon-Name aus dem Icon-Set der UI-Bibliothek */
  icon: string;
  /** Integrationsstufe gemäß Entwicklungsstrategie (1 = Fundament) */
  stage: 1 | 2 | 3;
}

export const MODULES: Record<ModuleId, ModuleDefinition> = {
  wiki: {
    id: 'wiki',
    name: 'MedTech Wiki',
    shortName: 'Wiki',
    path: '/wiki',
    tagline: 'Das zentrale Nachschlagewerk: Geräte, Komponenten, Hersteller, Fachbegriffe und Rechtsgrundlagen.',
    accent: 'var(--mw-mod-wiki)',
    icon: 'book',
    stage: 1,
  },
  repair: {
    id: 'repair',
    name: 'MedTech Repair Lab',
    shortName: 'Repair Lab',
    path: '/repair',
    tagline: 'Fehlerbilder systematisch diagnostizieren – mit Prüfschritten, Ersatzteilen und Serviceunterlagen.',
    accent: 'var(--mw-mod-repair)',
    icon: 'wrench',
    stage: 1,
  },
  explorer: {
    id: 'explorer',
    name: 'MedTech 3D Explorer',
    shortName: '3D Explorer',
    path: '/explorer',
    tagline: 'Geräte interaktiv in 3D erkunden und Komponenten direkt im Kontext verstehen.',
    accent: 'var(--mw-mod-explorer)',
    icon: 'cube',
    stage: 2,
  },
  market: {
    id: 'market',
    name: 'MedTech Market',
    shortName: 'Market',
    path: '/market',
    tagline: 'Ersatzteile und Geräte finden – mit geprüfter Kompatibilität aus der zentralen Datenbasis.',
    accent: 'var(--mw-mod-market)',
    icon: 'cart',
    stage: 2,
  },
  simulator: {
    id: 'simulator',
    name: 'MedTech Simulator',
    shortName: 'Simulator',
    path: '/simulator',
    tagline: 'Messprinzipien und Störungen gefahrlos simulieren – vom Pulsoximeter bis zur Beatmung.',
    accent: 'var(--mw-mod-simulator)',
    icon: 'pulse',
    stage: 2,
  },
  academy: {
    id: 'academy',
    name: 'MedTech Prüfakademie',
    shortName: 'Prüfakademie',
    path: '/academy',
    tagline: 'Prüfverfahren, Lernmodule und Quizze – mit Lernfortschritt und belegten Rechtsgrundlagen.',
    accent: 'var(--mw-mod-academy)',
    icon: 'graduation',
    stage: 1,
  },
  copilot: {
    id: 'copilot',
    name: 'MedTech Copilot',
    shortName: 'Copilot',
    path: '/copilot',
    tagline: 'Fragen stellen und Antworten mit Quellenangaben aus der geprüften Wissensbasis erhalten.',
    accent: 'var(--mw-mod-copilot)',
    icon: 'sparkle',
    stage: 3,
  },
  career: {
    id: 'career',
    name: 'MedTech Career Hub',
    shortName: 'Career Hub',
    path: '/career',
    tagline: 'Berufsbilder, Kompetenzpfade und passende Lernmodule für die Karriere in der Medizintechnik.',
    accent: 'var(--mw-mod-career)',
    icon: 'briefcase',
    stage: 3,
  },
};

export const MODULE_LIST: ModuleDefinition[] = MODULE_IDS.map((id) => MODULES[id]);
