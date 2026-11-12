/**
 * Reine Logik der MedTech Prüfakademie (ohne React/DOM) – Quiz, Lernfortschritt,
 * Prüfprotokoll-Checkliste. Wird per Vitest getestet.
 */
import type {
  EntitySummary,
  LearningModuleData,
  ProgressEntry,
  QuizQuestionData,
  RelationGroup,
  SpecRow,
  TestProcedureData,
} from '@medtech/core';

// ---------------------------------------------------------------- Bezeichnungen

export type LearningLevel = LearningModuleData['level'];
export type ProcedureKind = TestProcedureData['kind'];

export const LEVEL_LABELS: Record<LearningLevel, string> = {
  einsteiger: 'Einsteiger',
  fortgeschritten: 'Fortgeschritten',
  experte: 'Experte',
};

export const LEVEL_ORDER: LearningLevel[] = ['einsteiger', 'fortgeschritten', 'experte'];

export const PROCEDURE_KIND_LABELS: Record<ProcedureKind, string> = {
  STK: 'Sicherheitstechnische Kontrollen (STK)',
  MTK: 'Messtechnische Kontrollen (MTK)',
  'elektrische-sicherheit': 'Elektrische Sicherheit',
  funktionspruefung: 'Funktionsprüfungen',
  wartung: 'Wartung',
  abnahmepruefung: 'Abnahmeprüfungen',
};

export const PROCEDURE_KIND_SHORT: Record<ProcedureKind, string> = {
  STK: 'STK',
  MTK: 'MTK',
  'elektrische-sicherheit': 'Elektrische Sicherheit',
  funktionspruefung: 'Funktionsprüfung',
  wartung: 'Wartung',
  abnahmepruefung: 'Abnahmeprüfung',
};

export const PROCEDURE_KIND_ORDER: ProcedureKind[] = ['STK', 'MTK', 'elektrische-sicherheit', 'funktionspruefung', 'wartung', 'abnahmepruefung'];

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '–';
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

// ---------------------------------------------------------------- Relationen

/** IDs aller Inhalte, die über eine eingehende Relation `rel` auf die Entität zeigen */
export function incomingIds(relations: RelationGroup[], rel: RelationGroup['rel']): string[] {
  const ids: string[] = [];
  for (const g of relations) {
    if (g.rel !== rel || g.direction !== 'in') continue;
    for (const it of g.items) if (!ids.includes(it.id)) ids.push(it.id);
  }
  return ids;
}

/** Quizfragen, die per quiz_for mit der Entität verknüpft sind */
export function quizQuestionIds(relations: RelationGroup[]): string[] {
  return incomingIds(relations, 'quiz_for').filter((id) => id.startsWith('quiz_question:'));
}

/** Erstes Lernmodul, das die Entität per "teaches" behandelt */
export function firstTeachingModule(relations: RelationGroup[]): EntitySummary | null {
  for (const g of relations) {
    if (g.rel !== 'teaches' || g.direction !== 'in') continue;
    const m = g.items.find((it) => it.type === 'learning_module');
    if (m) return m;
  }
  return null;
}

// ---------------------------------------------------------------- Quiz

/** Quizfrage, wie sie die API ausliefert: ohne Lösung und Erklärung */
export type PublicQuizData = Omit<QuizQuestionData, 'correct' | 'explanation'> & { multipleAnswers?: boolean };

export type QuizAnswers = Record<string, string[]>;

export function isMultipleChoice(q: Pick<PublicQuizData, 'kind' | 'multipleAnswers'>): boolean {
  return q.multipleAnswers === true || q.kind === 'multiple';
}

/** Auswahl einer Option: Einfachauswahl ersetzt, Mehrfachauswahl schaltet um */
export function toggleOption(selected: readonly string[], optionId: string, multiple: boolean): string[] {
  if (!multiple) return [optionId];
  return selected.includes(optionId) ? selected.filter((s) => s !== optionId) : [...selected, optionId];
}

export function answeredCount(questionIds: readonly string[], answers: QuizAnswers): number {
  return questionIds.filter((id) => (answers[id]?.length ?? 0) > 0).length;
}

export function isQuizComplete(questionIds: readonly string[], answers: QuizAnswers): boolean {
  return questionIds.length > 0 && answeredCount(questionIds, answers) === questionIds.length;
}

/** Nutzlast für POST /academy/quiz/evaluate (in Fragenreihenfolge, ohne Duplikate) */
export function buildAnswerPayload(questionIds: readonly string[], answers: QuizAnswers): Array<{ questionId: string; selected: string[] }> {
  return questionIds.map((questionId) => ({ questionId, selected: [...new Set(answers[questionId] ?? [])] }));
}

export type OptionOutcome = 'correct-selected' | 'correct-missed' | 'wrong-selected' | 'neutral';

/** Darstellung einer Antwortoption nach der Auswertung */
export function optionOutcome(optionId: string, selected: readonly string[], correctOptions: readonly string[]): OptionOutcome {
  const isCorrect = correctOptions.includes(optionId);
  const isSelected = selected.includes(optionId);
  if (isCorrect && isSelected) return 'correct-selected';
  if (isCorrect) return 'correct-missed';
  if (isSelected) return 'wrong-selected';
  return 'neutral';
}

// ---------------------------------------------------------------- Lernfortschritt

export interface ProgressSummary {
  total: number;
  completed: number;
  started: number;
  /** Anteil abgeschlossener Module in Prozent (0–100) */
  percent: number;
}

export function progressSummary(moduleIds: readonly string[], entries: readonly ProgressEntry[]): ProgressSummary {
  const byId = new Map(entries.map((e) => [e.entityId, e]));
  let completed = 0;
  let started = 0;
  for (const id of moduleIds) {
    const p = byId.get(id);
    if (p?.status === 'completed') completed++;
    else if (p?.status === 'started') started++;
  }
  const total = moduleIds.length;
  return { total, completed, started, percent: total ? Math.round((completed / total) * 100) : 0 };
}

/** Ein abgeschlossenes Modul darf durch erneutes Lernen nicht auf "begonnen" zurückfallen */
export function shouldMarkStarted(current: ProgressEntry | undefined): boolean {
  return !current;
}

/** Abschnitts-Index sicher begrenzen */
export function clampIndex(i: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(i)));
}

export function filterByLevel<T extends { data: { level: LearningLevel } }>(items: readonly T[], level: LearningLevel | 'alle'): T[] {
  return level === 'alle' ? [...items] : items.filter((i) => i.data.level === level);
}

/** Prüfverfahren nach Art gruppieren – in fachlicher Reihenfolge */
export function groupByKind<T extends { title: string; data: { kind: ProcedureKind } }>(items: readonly T[]): Array<{ kind: ProcedureKind; label: string; items: T[] }> {
  return PROCEDURE_KIND_ORDER.map((kind) => ({
    kind,
    label: PROCEDURE_KIND_LABELS[kind],
    items: items.filter((i) => i.data.kind === kind).sort((a, b) => a.title.localeCompare(b.title, 'de')),
  })).filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------- Grenzwerte

const STOPWORDS = new Set(['und', 'oder', 'nach', 'mit', 'ohne', 'vom', 'von', 'der', 'die', 'das', 'des', 'den', 'dem', 'bei', 'für', 'nur', 'inkl', 'sowie', 'gegen']);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^a-zäöüß0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Technische Daten (specs) eines Prüfverfahrens, die zu einem Prüfschritt gehören.
 * Ein Spec passt, wenn alle signifikanten Wörter des Schritt-Titels (ohne Klammerzusätze)
 * in Bezeichnung oder Schlüssel des Specs vorkommen.
 */
export function specsForStep(stepTitle: string, specs: readonly SpecRow[]): SpecRow[] {
  const want = tokens(stepTitle);
  if (!want.length) return [];
  return specs.filter((s) => {
    const have = new Set([...tokens(s.label), ...s.key.split('_')]);
    return want.every((w) => have.has(w));
  });
}

/** Deutsche Zahl ("0,3", "1.000", "1 000,5") in number umwandeln */
export function parseGermanNumber(input: string): number | null {
  const s = input.trim().replace(/\s| | /g, '');
  if (!s) return null;
  let norm: string;
  if (s.includes(',')) norm = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) norm = s.replace(/\./g, '');
  else norm = s;
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export type LimitOp = '<=' | '<' | '>=' | '>' | '=';
export interface ParsedLimit {
  op: LimitOp;
  value: number;
}

/** Grenzwert wie "≤ 0,3", "< 50", "≥ 2", "max. 500" erkennen; sonst null */
export function parseLimit(value: string | number): ParsedLimit | null {
  if (typeof value === 'number') return { op: '<=', value };
  const s = value.trim();
  const m = /^(≤|<=|<|≥|>=|>|=|max\.?|min\.?)\s*(-?[\d.,\s]+)$/i.exec(s);
  if (!m) return null;
  const n = parseGermanNumber(m[2]!);
  if (n === null) return null;
  const opRaw = m[1]!.toLowerCase();
  const op: LimitOp = opRaw === '≤' || opRaw === '<=' || opRaw.startsWith('max') ? '<=' : opRaw === '≥' || opRaw === '>=' || opRaw.startsWith('min') ? '>=' : (opRaw as LimitOp);
  return { op, value: n };
}

/** Messwert gegen Grenzwert prüfen: 'ok', 'exceeded' oder null (nicht auswertbar) */
export function checkAgainstLimit(measured: string, limit: string | number): 'ok' | 'exceeded' | null {
  const v = parseGermanNumber(measured);
  const l = parseLimit(limit);
  if (v === null || !l) return null;
  const ok =
    l.op === '<=' ? v <= l.value : l.op === '<' ? v < l.value : l.op === '>=' ? v >= l.value : l.op === '>' ? v > l.value : v === l.value;
  return ok ? 'ok' : 'exceeded';
}

// ---------------------------------------------------------------- Prüfprotokoll

export type Verdict = 'io' | 'nio' | 'entfaellt';

export const VERDICT_LABELS: Record<Verdict, string> = { io: 'i. O.', nio: 'n. i. O.', entfaellt: 'entfällt' };

export interface StepState {
  done: boolean;
  measured: string;
  verdict: Verdict | null;
  note: string;
}

export interface ProtocolHeader {
  device: string;
  inventoryNo: string;
  inspector: string;
  date: string;
}

export interface ProtocolState {
  header: ProtocolHeader;
  steps: StepState[];
  remarks: string;
}

export const emptyStep = (): StepState => ({ done: false, measured: '', verdict: null, note: '' });

export function initialProtocol(stepCount: number, today: string): ProtocolState {
  return {
    header: { device: '', inventoryNo: '', inspector: '', date: today },
    steps: Array.from({ length: stepCount }, emptyStep),
    remarks: '',
  };
}

/** Gespeicherten Zustand an die aktuelle Schrittzahl anpassen (Inhalte können sich ändern) */
export function normalizeProtocol(raw: unknown, stepCount: number, today: string): ProtocolState {
  const base = initialProtocol(stepCount, today);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProtocolState>;
  const h = (r.header ?? {}) as Partial<ProtocolHeader>;
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const verdicts: Verdict[] = ['io', 'nio', 'entfaellt'];
  return {
    header: { device: str(h.device), inventoryNo: str(h.inventoryNo), inspector: str(h.inspector), date: str(h.date, today) || today },
    remarks: str(r.remarks),
    steps: base.steps.map((s, i) => {
      const o = (Array.isArray(r.steps) ? r.steps[i] : undefined) as Partial<StepState> | undefined;
      if (!o || typeof o !== 'object') return s;
      return {
        done: o.done === true,
        measured: str(o.measured),
        verdict: verdicts.includes(o.verdict as Verdict) ? (o.verdict as Verdict) : null,
        note: str(o.note),
      };
    }),
  };
}

export function updateStep(state: ProtocolState, index: number, patch: Partial<StepState>): ProtocolState {
  if (index < 0 || index >= state.steps.length) return state;
  const steps = state.steps.map((s, i) => {
    if (i !== index) return s;
    const next = { ...s, ...patch };
    // Eine Bewertung impliziert, dass der Schritt durchgeführt wurde
    if (patch.verdict && patch.done === undefined) next.done = true;
    return next;
  });
  return { ...state, steps };
}

export type OverallResult = 'offen' | 'bestanden' | 'nicht-bestanden';

export interface ProtocolEvaluation {
  result: OverallResult;
  done: number;
  rated: number;
  failed: number;
  total: number;
  /** Indizes der Schritte, die noch fehlen (nicht durchgeführt oder ohne Bewertung) */
  missing: number[];
}

/**
 * Gesamtergebnis: jeder n. i. O.-Schritt führt zu "nicht bestanden";
 * "bestanden" erst, wenn jeder Schritt durchgeführt und bewertet ist.
 */
export function evaluateProtocol(steps: readonly StepState[]): ProtocolEvaluation {
  const missing: number[] = [];
  let done = 0;
  let rated = 0;
  let failed = 0;
  steps.forEach((s, i) => {
    if (s.done || s.verdict === 'entfaellt') done++;
    if (s.verdict) rated++;
    if (s.verdict === 'nio') failed++;
    if (!s.verdict || (!s.done && s.verdict !== 'entfaellt')) missing.push(i);
  });
  const result: OverallResult = failed > 0 ? 'nicht-bestanden' : steps.length > 0 && missing.length === 0 ? 'bestanden' : 'offen';
  return { result, done, rated, failed, total: steps.length, missing };
}

export const RESULT_LABELS: Record<OverallResult, string> = {
  offen: 'Prüfung noch nicht abgeschlossen',
  bestanden: 'Bestanden – keine Mängel festgestellt',
  'nicht-bestanden': 'Nicht bestanden – Mängel festgestellt',
};

export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Führende Nummerierung ("1. ", "2) ") aus Abschnittstiteln entfernen – die Darstellung nummeriert selbst */
export function stripNumbering(title: string): string {
  return title.replace(/^\s*\d+\s*[.)]\s+/, '');
}
