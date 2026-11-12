import type { EntityDetail, EntitySummary, FaultData } from '@medtech/core';
import { api } from '../../lib/api.ts';
import { useAsync } from '../../lib/hooks.ts';
import { HARDWARE_TYPES, mapLimit, mergeUnique, relationItems, toFaultInfo, type FaultInfo } from './logic.ts';

/**
 * Datenzugriff des Repair Labs – ausschließlich über die zentrale API.
 */

/** Alle Fehlerbilder inkl. Daten (Schweregrad, Symptome) und betroffener Hardware */
export function useFaultInfos() {
  return useAsync<FaultInfo[]>(
    async (signal) => {
      const list = await api.list({ type: 'fault', limit: 500 }, signal);
      const details = await mapLimit(list.items, 6, (s) => api.entityById<FaultData>(s.id, signal));
      return details.map(toFaultInfo);
    },
    [],
    'repair:faults',
  );
}

export interface RepairResources {
  /** Direkt als Abhilfe hinterlegte Ersatzteile (remedied_by) */
  directParts: EntitySummary[];
  /** Ersatzteile, die zu betroffenen Geräten/Komponenten passen (fits), mit Zuordnung */
  fittingParts: Array<{ part: EntitySummary; fitsFor: EntitySummary[] }>;
  /** Prüfverfahren nach der Instandsetzung (remedied_by + tests der betroffenen Hardware) */
  tests: EntitySummary[];
  documents: EntitySummary[];
  learning: EntitySummary[];
}

/** Ersatzteile, Prüfverfahren, Dokumente und Lernmodule zu einem Fehlerbild */
export function useRepairResources(fault: EntityDetail<FaultData> | undefined) {
  return useAsync<RepairResources>(
    async (signal) => {
      const f = fault!;
      const remedied = relationItems(f.relations, 'remedied_by', 'out');
      const affected = relationItems(f.relations, 'affects', 'out', HARDWARE_TYPES);
      const perAffected = await mapLimit(affected, 4, async (a) => {
        const [parts, tests, docs] = await Promise.all([
          api.list({ relatedTo: a.id, rel: 'fits', type: 'spare_part', limit: 100 }, signal),
          api.list({ relatedTo: a.id, rel: 'tests', type: 'test_procedure', limit: 50 }, signal),
          api.list({ relatedTo: a.id, rel: 'documents', type: 'document', limit: 50 }, signal),
        ]);
        return { a, parts: parts.items, tests: tests.items, docs: docs.items };
      });

      const directParts = remedied.filter((e) => e.type === 'spare_part');
      const directIds = new Set(directParts.map((p) => p.id));
      const fitting = new Map<string, { part: EntitySummary; fitsFor: EntitySummary[] }>();
      for (const { a, parts } of perAffected) {
        for (const p of parts) {
          if (directIds.has(p.id)) continue;
          const entry = fitting.get(p.id) ?? { part: p, fitsFor: [] };
          entry.fitsFor.push(a);
          fitting.set(p.id, entry);
        }
      }
      return {
        directParts,
        fittingParts: [...fitting.values()],
        tests: mergeUnique(
          remedied.filter((e) => e.type === 'test_procedure'),
          ...perAffected.map((x) => x.tests),
        ),
        documents: mergeUnique(
          remedied.filter((e) => e.type === 'document'),
          relationItems(f.relations, 'documents', 'in', ['document']),
          ...perAffected.map((x) => x.docs),
        ),
        learning: mergeUnique(remedied.filter((e) => e.type === 'learning_module'), relationItems(f.relations, 'teaches', 'in', ['learning_module'])),
      };
    },
    [fault?.id],
    fault ? `repair:resources:${fault.id}` : null,
  );
}

/** Fehlerbilder der Komponenten eines Geräts/Modells (für die Seitenleiste) */
export function useComponentFaults(entity: EntityDetail) {
  const components = relationItems(entity.relations, 'has_component', 'out', ['component']);
  const key = components.length ? `repair:component-faults:${entity.id}` : null;
  return useAsync<Array<{ component: EntitySummary; faults: EntitySummary[] }>>(
    async (signal) => {
      const res = await mapLimit(components, 4, async (c) => ({
        component: c,
        faults: (await api.list({ relatedTo: c.id, rel: 'affects', type: 'fault', limit: 50 }, signal)).items,
      }));
      return res.filter((r) => r.faults.length > 0);
    },
    [entity.id],
    key,
  );
}
