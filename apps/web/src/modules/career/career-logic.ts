/**
 * Reine Logik des Career Hub (ohne React, unit-getestet):
 * Lernpfad eines Berufsbilds, Kompetenzcheck (Bereitschaft) und Empfehlungen.
 */
import { MODULES, entityPath, type EntitySummary, type EntityType, type ProgressEntry, type RelationGroup } from '@medtech/core';

export type PathItem = EntitySummary & { note?: string };
export type ItemStatus = 'completed' | 'started' | 'open';

/** Reihenfolge im Lernpfad: erst lernen, dann prüfen, dann Gerätepraxis, dann Begriffe */
const TYPE_RANK: Partial<Record<EntityType, number>> = { learning_module: 0, test_procedure: 1, device: 2, term: 3 };

/** Alle über requires_skill (ausgehend) geforderten Inhalte, ohne Duplikate, in Inhaltsreihenfolge */
export function requiredItems(relations: RelationGroup[]): PathItem[] {
  const seen = new Set<string>();
  const out: PathItem[] = [];
  for (const g of relations) {
    if (g.rel !== 'requires_skill' || g.direction !== 'out') continue;
    for (const it of g.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

/** Berufsbilder, für die ein Inhalt gefordert ist (eingehende requires_skill-Relationen) */
export function relevantJobProfiles(relations: RelationGroup[]): PathItem[] {
  const seen = new Set<string>();
  const out: PathItem[] = [];
  for (const g of relations) {
    if (g.rel !== 'requires_skill' || g.direction !== 'in') continue;
    for (const it of g.items) {
      if (it.type !== 'job_profile' || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

export function requiredLearningModules(relations: RelationGroup[]): PathItem[] {
  return requiredItems(relations).filter((i) => i.type === 'learning_module');
}

/**
 * Stabile topologische Sortierung nach Voraussetzungen: Ein Lernmodul erscheint nach
 * seinen (im Pfad enthaltenen) Voraussetzungen; ansonsten bleibt die Ausgangsreihenfolge.
 * Zyklen werden toleriert (verbleibende Elemente in Ausgangsreihenfolge angehängt).
 */
export function orderByPrerequisites<T extends { id: string }>(items: T[], prerequisites: (id: string) => string[]): T[] {
  const ids = new Set(items.map((i) => i.id));
  const done = new Set<string>();
  const out: T[] = [];
  const remaining = [...items];
  while (remaining.length) {
    const idx = remaining.findIndex((it) => prerequisites(it.id).every((p) => !ids.has(p) || done.has(p) || p === it.id));
    const pick = idx === -1 ? 0 : idx; // Zyklus: erstes verbleibendes nehmen
    const [it] = remaining.splice(pick, 1);
    out.push(it!);
    done.add(it!.id);
  }
  return out;
}

/** Geordneter Lernpfad: nach Typ gruppiert (stabil), Lernmodule nach Voraussetzungen sortiert */
export function orderLearningPath(items: PathItem[], prerequisites: (id: string) => string[] = () => []): PathItem[] {
  const ranked = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (TYPE_RANK[a.it.type] ?? 9) - (TYPE_RANK[b.it.type] ?? 9) || a.i - b.i)
    .map((x) => x.it);
  const modules = orderByPrerequisites(
    ranked.filter((i) => i.type === 'learning_module'),
    prerequisites,
  );
  return [...modules, ...ranked.filter((i) => i.type !== 'learning_module')];
}

export function progressMap(entries: ProgressEntry[] | undefined): Map<string, ProgressEntry> {
  return new Map((entries ?? []).map((p) => [p.entityId, p]));
}

export function itemStatus(id: string, progress: Map<string, ProgressEntry>): ItemStatus {
  const p = progress.get(id);
  if (!p) return 'open';
  return p.status === 'completed' ? 'completed' : 'started';
}

export interface Readiness {
  total: number;
  completed: number;
  /** 0–100, gerundet; 0 bei Berufsbildern ohne Lernmodule */
  percent: number;
  /** Nächstes empfohlenes Lernmodul: zuerst begonnene, sonst das erste offene */
  next: PathItem | null;
}

/** Bereitschaft = Anteil abgeschlossener geforderter Lernmodule */
export function computeReadiness(modules: PathItem[], progress: Map<string, ProgressEntry>): Readiness {
  const total = modules.length;
  const completed = modules.filter((m) => itemStatus(m.id, progress) === 'completed').length;
  const started = modules.find((m) => itemStatus(m.id, progress) === 'started');
  const open = modules.find((m) => itemStatus(m.id, progress) === 'open');
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    next: started ?? open ?? null,
  };
}

/** Berufsbilder absteigend nach Bereitschaft (bei Gleichstand stabile Reihenfolge) */
export function rankByReadiness<T extends { readiness: Readiness }>(profiles: T[]): T[] {
  return profiles
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.readiness.percent - a.p.readiness.percent || a.i - b.i)
    .map((x) => x.p);
}

/** Ziel-Link eines Lernpfad-Elements: Lernmodule direkt im Academy-Player, sonst Detailseite */
export function pathItemLink(item: Pick<EntitySummary, 'id' | 'type' | 'slug'>): string {
  if (item.type === 'learning_module') return `${MODULES.academy.path}/lernen/${item.slug}`;
  return entityPath(item.id);
}

export function readinessLabel(r: Readiness): string {
  if (!r.total) return 'Keine Lernmodule hinterlegt';
  if (r.completed === r.total) return 'Alle geforderten Lernmodule abgeschlossen';
  return `${r.completed} von ${r.total} Lernmodulen abgeschlossen`;
}
