/**
 * Reine Logik für Diagnosebäume von Fehlerbildern (fault.data.diagnosis/outcomes).
 *
 * Ein Diagnosebaum besteht aus Schritten (instruction, question, yes, no) und
 * Ergebnissen (outcomes). `yes`/`no` verweisen per ID auf einen weiteren
 * Schritt oder ein Ergebnis. Der erste Schritt ist der Einstieg.
 *
 * Keine React-/DOM-Abhängigkeiten – vollständig mit vitest getestet.
 */

export interface DiagnosisStep {
  id: string;
  instruction: string;
  question: string;
  yes: string;
  no: string;
}

export interface DiagnosisOutcome {
  id: string;
  text: string;
}

export interface DiagnosisTreeInput {
  diagnosis: DiagnosisStep[];
  outcomes: DiagnosisOutcome[];
}

export type Answer = 'yes' | 'no';

export type TreeNode = { kind: 'step'; step: DiagnosisStep } | { kind: 'outcome'; outcome: DiagnosisOutcome };

export interface DiagnosisTree {
  start: string | null;
  steps: Map<string, DiagnosisStep>;
  outcomes: Map<string, DiagnosisOutcome>;
}

export function buildTree(input: DiagnosisTreeInput): DiagnosisTree {
  const steps = new Map<string, DiagnosisStep>();
  const outcomes = new Map<string, DiagnosisOutcome>();
  // Bei doppelten IDs gewinnt jeweils der erste Eintrag (Validierung meldet den Konflikt).
  for (const s of input.diagnosis) if (!steps.has(s.id)) steps.set(s.id, s);
  for (const o of input.outcomes) if (!outcomes.has(o.id) && !steps.has(o.id)) outcomes.set(o.id, o);
  return { start: input.diagnosis[0]?.id ?? null, steps, outcomes };
}

export function getNode(tree: DiagnosisTree, id: string | null | undefined): TreeNode | null {
  if (!id) return null;
  const step = tree.steps.get(id);
  if (step) return { kind: 'step', step };
  const outcome = tree.outcomes.get(id);
  if (outcome) return { kind: 'outcome', outcome };
  return null;
}

/** Ziel-ID eines Schritts für eine Antwort */
export function nextId(step: DiagnosisStep, answer: Answer): string {
  return answer === 'yes' ? step.yes : step.no;
}

/** Nächster Knoten nach einer Antwort (null bei unbekanntem Ziel) */
export function nextNode(tree: DiagnosisTree, stepId: string, answer: Answer): TreeNode | null {
  const step = tree.steps.get(stepId);
  if (!step) return null;
  return getNode(tree, nextId(step, answer));
}

export interface PathEntry {
  step: DiagnosisStep;
  answer: Answer;
}

export type WalkState =
  | { status: 'empty' }
  | { status: 'step'; step: DiagnosisStep }
  | { status: 'outcome'; outcome: DiagnosisOutcome }
  /** Verweis auf ein unbekanntes Ziel */
  | { status: 'broken'; missingId: string; from: string }
  /** Zyklus erkannt: Schritt wurde erneut erreicht */
  | { status: 'cycle'; stepId: string };

export interface WalkResult {
  /** Beantwortete Schritte in Reihenfolge (Brotkrumen) */
  path: PathEntry[];
  state: WalkState;
  /** Anzahl der Antworten, die tatsächlich angewendet wurden */
  consumed: number;
}

/**
 * Wendet eine Antwortfolge ab dem Startschritt an.
 * Überzählige Antworten (nach Erreichen eines Ergebnisses) werden ignoriert.
 */
export function walk(tree: DiagnosisTree, answers: readonly Answer[]): WalkResult {
  const path: PathEntry[] = [];
  if (!tree.start) return { path, state: { status: 'empty' }, consumed: 0 };
  const visited = new Set<string>();
  let currentId = tree.start;
  let consumed = 0;
  for (;;) {
    const node = getNode(tree, currentId);
    if (!node) {
      const from = path[path.length - 1]?.step.id ?? '';
      return { path, state: { status: 'broken', missingId: currentId, from }, consumed };
    }
    if (node.kind === 'outcome') return { path, state: { status: 'outcome', outcome: node.outcome }, consumed };
    if (visited.has(node.step.id)) return { path, state: { status: 'cycle', stepId: node.step.id }, consumed };
    visited.add(node.step.id);
    const answer = answers[consumed];
    if (answer === undefined) return { path, state: { status: 'step', step: node.step }, consumed };
    path.push({ step: node.step, answer });
    consumed++;
    currentId = nextId(node.step, answer);
  }
}

/** Alle von einem Knoten direkt erreichbaren Ziele */
function targets(tree: DiagnosisTree, id: string): string[] {
  const s = tree.steps.get(id);
  return s ? [s.yes, s.no] : [];
}

/** Findet Zyklen (je Zyklus die Schritt-IDs in Reihenfolge, beginnend beim Wiedereintrittspunkt). */
export function detectCycles(tree: DiagnosisTree): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const color = new Map<string, 'grey' | 'black'>();
  const stack: string[] = [];

  const visit = (id: string) => {
    color.set(id, 'grey');
    stack.push(id);
    for (const t of targets(tree, id)) {
      if (!tree.steps.has(t)) continue;
      const c = color.get(t);
      if (c === 'grey') {
        const cycle = stack.slice(stack.indexOf(t));
        const key = [...cycle].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (!c) visit(t);
    }
    stack.pop();
    color.set(id, 'black');
  };

  if (tree.start) visit(tree.start);
  for (const id of tree.steps.keys()) if (!color.has(id)) visit(id);
  return cycles;
}

/** IDs aller vom Start aus erreichbaren Knoten (Schritte und Ergebnisse) */
export function reachableIds(tree: DiagnosisTree): Set<string> {
  const out = new Set<string>();
  if (!tree.start) return out;
  const queue = [tree.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id) || !getNode(tree, id)) continue;
    out.add(id);
    queue.push(...targets(tree, id));
  }
  return out;
}

export function unreachable(tree: DiagnosisTree): { steps: string[]; outcomes: string[] } {
  const r = reachableIds(tree);
  return {
    steps: [...tree.steps.keys()].filter((id) => !r.has(id)),
    outcomes: [...tree.outcomes.keys()].filter((id) => !r.has(id)),
  };
}

/**
 * Längste Anzahl verbleibender Fragen ab einem Knoten bis zu einem Ergebnis
 * (Ergebnis = 0). Zyklen/ungültige Ziele werden nicht weiterverfolgt.
 */
export function maxRemaining(tree: DiagnosisTree, id: string, memo = new Map<string, number>(), active = new Set<string>()): number {
  if (memo.has(id)) return memo.get(id)!;
  const step = tree.steps.get(id);
  if (!step || active.has(id)) return 0;
  active.add(id);
  const v = 1 + Math.max(maxRemaining(tree, step.yes, memo, active), maxRemaining(tree, step.no, memo, active));
  active.delete(id);
  memo.set(id, v);
  return v;
}

/** Fortschritt 0–100 einer laufenden Diagnose (Schätzung über den längsten Restpfad) */
export function progressPercent(tree: DiagnosisTree, result: WalkResult): number {
  if (result.state.status === 'outcome') return 100;
  if (result.state.status !== 'step') return 0;
  const answered = result.path.length;
  const remaining = maxRemaining(tree, result.state.step.id);
  const total = answered + remaining;
  return total === 0 ? 0 : Math.round((answered / total) * 100);
}

export interface TreeIssue {
  severity: 'error' | 'warning';
  code: 'empty' | 'duplicate-id' | 'id-collision' | 'unknown-target' | 'cycle' | 'unreachable-step' | 'unreachable-outcome' | 'self-loop' | 'no-outcomes';
  message: string;
  ids: string[];
}

/** Prüft einen Diagnosebaum auf strukturelle Fehler. */
export function validateTree(input: DiagnosisTreeInput): TreeIssue[] {
  const issues: TreeIssue[] = [];
  if (!input.diagnosis.length) {
    issues.push({ severity: 'error', code: 'empty', message: 'Der Diagnosebaum enthält keine Schritte.', ids: [] });
    return issues;
  }
  if (!input.outcomes.length) issues.push({ severity: 'error', code: 'no-outcomes', message: 'Der Diagnosebaum enthält keine Ergebnisse.', ids: [] });

  const stepIds = new Set<string>();
  for (const s of input.diagnosis) {
    if (stepIds.has(s.id)) issues.push({ severity: 'error', code: 'duplicate-id', message: `Schritt-ID „${s.id}“ ist mehrfach vergeben.`, ids: [s.id] });
    stepIds.add(s.id);
  }
  const outcomeIds = new Set<string>();
  for (const o of input.outcomes) {
    if (outcomeIds.has(o.id)) issues.push({ severity: 'error', code: 'duplicate-id', message: `Ergebnis-ID „${o.id}“ ist mehrfach vergeben.`, ids: [o.id] });
    if (stepIds.has(o.id)) issues.push({ severity: 'error', code: 'id-collision', message: `ID „${o.id}“ ist zugleich Schritt und Ergebnis.`, ids: [o.id] });
    outcomeIds.add(o.id);
  }

  const tree = buildTree(input);
  for (const s of tree.steps.values()) {
    for (const t of [s.yes, s.no]) {
      if (!getNode(tree, t)) issues.push({ severity: 'error', code: 'unknown-target', message: `Schritt „${s.id}“ verweist auf unbekanntes Ziel „${t}“.`, ids: [s.id, t] });
    }
    if (s.yes === s.id || s.no === s.id) issues.push({ severity: 'error', code: 'self-loop', message: `Schritt „${s.id}“ verweist auf sich selbst.`, ids: [s.id] });
  }
  for (const c of detectCycles(tree)) {
    if (c.length === 1) continue; // bereits als self-loop gemeldet
    issues.push({ severity: 'error', code: 'cycle', message: `Zyklus im Diagnosebaum: ${[...c, c[0]].join(' → ')}.`, ids: c });
  }
  const u = unreachable(tree);
  for (const id of u.steps) issues.push({ severity: 'warning', code: 'unreachable-step', message: `Schritt „${id}“ ist vom Start aus nicht erreichbar.`, ids: [id] });
  for (const id of u.outcomes) issues.push({ severity: 'warning', code: 'unreachable-outcome', message: `Ergebnis „${id}“ ist vom Start aus nicht erreichbar.`, ids: [id] });
  return issues;
}

export function isTreeUsable(input: DiagnosisTreeInput): boolean {
  return input.diagnosis.length > 0 && !validateTree(input).some((i) => i.severity === 'error');
}

/** Antworten als kompakter String für die URL (z. B. "jnj") und zurück */
export function encodeAnswers(answers: readonly Answer[]): string {
  return answers.map((a) => (a === 'yes' ? 'j' : 'n')).join('');
}

export function decodeAnswers(s: string | null | undefined): Answer[] {
  if (!s || !/^[jn]{1,200}$/.test(s)) return [];
  return [...s].map((c) => (c === 'j' ? 'yes' : 'no'));
}
