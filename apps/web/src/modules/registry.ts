import { MODULE_IDS, type EntityDetail, type ModuleId } from '@medtech/core';
import type { EntityAction, EntityPanel, WebModule } from './types.ts';
import { module as wiki } from './wiki/index.tsx';
import { module as repair } from './repair/index.tsx';
import { module as explorer } from './explorer/index.tsx';
import { module as market } from './market/index.tsx';
import { module as simulator } from './simulator/index.tsx';
import { module as academy } from './academy/index.tsx';
import { module as copilot } from './copilot/index.tsx';
import { module as career } from './career/index.tsx';

/** Alle Module der Plattform – Reihenfolge = Navigationsreihenfolge. */
export const WEB_MODULES: Record<ModuleId, WebModule> = { wiki, repair, explorer, market, simulator, academy, copilot, career };

export const WEB_MODULE_LIST: WebModule[] = MODULE_IDS.map((id) => WEB_MODULES[id]);

export function panelsFor(entity: EntityDetail): Array<EntityPanel & { module: ModuleId }> {
  return WEB_MODULE_LIST.flatMap((m) => (m.entityPanels ?? []).filter((p) => p.types.includes(entity.type)).map((p) => ({ ...p, module: m.id })));
}

export function actionsFor(entity: EntityDetail): Array<EntityAction & { module: ModuleId }> {
  return WEB_MODULE_LIST.flatMap((m) => (m.entityActions?.(entity) ?? []).map((a) => ({ ...a, module: m.id })));
}
