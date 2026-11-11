import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ENTITY_TYPE_LIST, MODULES, type EntityType, type ModuleId } from '@medtech/core';
import { EntityGrid, ErrorState, Input, Loading, ModuleHero, Section, Tabs } from '@medtech/ui';
import { useDebounced, useDocumentTitle, useEntityList, useSearch } from '../lib/hooks.ts';

/** Inhaltstypen, die primär zu einem Modul gehören */
export function typesForModule(module: ModuleId): EntityType[] {
  return ENTITY_TYPE_LIST.filter((t) => t.homeModule === module).map((t) => t.type);
}

/**
 * Generische, einheitliche Modul-Startseite: Hero, modulbezogene Suche und
 * Inhaltslisten je Typ. Module können sie als Basis nutzen und ergänzen.
 */
export function ModuleLanding({ module, types, children }: { module: ModuleId; types?: EntityType[]; children?: React.ReactNode }) {
  const m = MODULES[module];
  useDocumentTitle(m.name);
  const moduleTypes = types ?? typesForModule(module);
  const [params] = useSearchParams();
  const requested = params.get('typ') as EntityType | null;
  const [tab, setTab] = useState<EntityType | undefined>(requested && moduleTypes.includes(requested) ? requested : moduleTypes[0]);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const search = useSearch(dq, { types: moduleTypes, limit: 60 });
  const list = useEntityList({ type: tab, limit: 200 });

  return (
    <div className="mw-container mw-page">
      <ModuleHero module={module} />
      {children}
      {moduleTypes.length > 0 ? (
        <Section title="Inhalte" icon="layers">
          <div style={{ maxWidth: 520, marginBottom: 16 }}>
            <Input type="search" placeholder={`In ${m.shortName} suchen …`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`In ${m.name} suchen`} />
          </div>
          {dq.trim() ? (
            search.loading ? <Loading /> : search.error ? <ErrorState error={search.error} /> : <EntityGrid items={search.data?.hits ?? []} empty="Keine Treffer." />
          ) : (
            <>
              {moduleTypes.length > 1 ? (
                <Tabs
                  label="Inhaltstyp"
                  value={tab ?? moduleTypes[0]!}
                  onChange={setTab}
                  tabs={moduleTypes.map((t) => ({ id: t, label: ENTITY_TYPE_LIST.find((d) => d.type === t)!.plural }))}
                />
              ) : null}
              {list.loading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : <EntityGrid items={list.data?.items ?? []} />}
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
}
