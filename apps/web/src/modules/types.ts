import type { ComponentType, LazyExoticComponent } from 'react';
import type { EntityDetail, EntityType, ModuleId } from '@medtech/core';
import type { IconName } from '@medtech/ui';

/**
 * Vertrag zwischen Plattform-Shell und Modulen.
 *
 * - Jedes Modul ist unter MODULES[id].path/* eigenständig nutzbar (Root).
 * - Inhalte kommen IMMER aus der zentralen API – Module haben keine eigenen Datenbestände.
 * - Über entityPanels/entityActions erweitert ein Modul die einheitliche
 *   Detailseite (/e/:type/:slug), z. B. 3D-Vorschau, Diagnosebaum, Quiz.
 */
export interface EntityPanel {
  /** Für welche Inhaltstypen das Panel angezeigt wird */
  types: EntityType[];
  title: string;
  icon?: IconName;
  /** main = Hauptspalte, aside = Seitenleiste */
  placement?: 'main' | 'aside';
  Component: ComponentType<{ entity: EntityDetail }> | LazyExoticComponent<ComponentType<{ entity: EntityDetail }>>;
}

export interface EntityAction {
  label: string;
  to: string;
  icon?: IconName;
}

export interface WebModule {
  id: ModuleId;
  /** Modul-Startseite und Unterseiten; wird lazy geladen */
  Root: LazyExoticComponent<ComponentType>;
  entityPanels?: EntityPanel[];
  /** Aktionen ("Im Simulator öffnen") auf der Detailseite */
  entityActions?: (entity: EntityDetail) => EntityAction[];
}
