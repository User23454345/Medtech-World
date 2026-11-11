import type { EntityType } from './entity-types.ts';
import type { ModuleId } from './modules.ts';
import type { Role } from './permissions.ts';
import type { RelationType } from './relations.ts';
import type { ReviewStatus, Source, SourceKind } from './schemas.ts';

/**
 * Datentransferobjekte der einheitlichen REST-Schnittstelle (/api/v1).
 * Frontend und Backend nutzen dieselben Typen.
 */

/** Qualitätskennzeichen, die an jeder Entität angezeigt werden */
export type QualityFlag =
  | { kind: 'demo'; message: string }
  | { kind: 'draft'; message: string }
  | { kind: 'outdated'; message: string }
  | { kind: 'legal-review-due'; message: string; since: string }
  | { kind: 'superseded'; message: string; by?: string }
  | { kind: 'contradiction'; message: string; key: string };

export interface EntitySummary {
  id: string;
  type: EntityType;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  demo: boolean;
  reviewStatus: ReviewStatus;
  flags: QualityFlag[];
  /** Erstes Bild (Media-Entität), falls vorhanden – als data:-URL oder https-URL */
  thumbnail?: string;
}

export interface SpecRow {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  condition?: string;
  note?: string;
  source: SourceRef;
}

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  kind: SourceKind;
  url?: string;
  edition?: string;
  accessedAt: string;
}

export interface RelationGroup {
  rel: RelationType;
  direction: 'out' | 'in';
  label: string;
  items: Array<EntitySummary & { note?: string }>;
}

export interface EntityDetail<TData = unknown> extends EntitySummary {
  aliases: string[];
  body: string;
  data: TData;
  specs: SpecRow[];
  sources: SourceRef[];
  relations: RelationGroup[];
  reviewedAt: string;
  reviewer?: string;
  /** Module, in denen diese Entität eine Rolle spielt (für "In anderen Modulen öffnen") */
  modules: ModuleId[];
}

export interface SearchHit extends EntitySummary {
  module: ModuleId;
  /** Hervorgehobener Ausschnitt (Treffer in «…» markiert, kein HTML) */
  snippet: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  hits: SearchHit[];
  /** Treffer gruppiert nach Modul (für die globale Suche) */
  byModule: Partial<Record<ModuleId, number>>;
  byType: Partial<Record<EntityType, number>>;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  /** Bevorzugtes Startmodul nach Login */
  startModule: ModuleId;
  /** Lernhistorie aufzeichnen (Datenschutz: abschaltbar) */
  trackHistory: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  startModule: 'wiki',
  trackHistory: true,
  reducedMotion: false,
};

export interface Favorite {
  entityId: string;
  createdAt: string;
  entity: EntitySummary | null;
}

export type ProgressStatus = 'started' | 'completed';

export interface ProgressEntry {
  entityId: string;
  status: ProgressStatus;
  /** 0–100, z. B. Quizergebnis */
  score: number | null;
  updatedAt: string;
  entity: EntitySummary | null;
}

export interface Note {
  id: string;
  entityId: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
  entity: EntitySummary | null;
}

export interface HistoryEntry {
  entityId: string;
  module: ModuleId;
  action: 'view' | 'quiz' | 'simulation' | 'diagnosis';
  at: string;
  entity: EntitySummary | null;
}

export interface QualityIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  entityId?: string;
  sourceId?: string;
  file?: string;
}

export interface QualityReport {
  generatedAt: string;
  counts: { entities: number; sources: number; relations: number; specs: number };
  issues: QualityIssue[];
}

export interface CopilotCitation {
  index: number;
  entity: EntitySummary;
  /** Externe Quellen der Entität */
  sources: SourceRef[];
}

export interface CopilotAnswer {
  answer: string;
  citations: CopilotCitation[];
  /** 'llm' wenn ein Sprachmodell formuliert hat, sonst 'retrieval' */
  mode: 'llm' | 'retrieval';
  disclaimer: string;
}

export type { Source };
