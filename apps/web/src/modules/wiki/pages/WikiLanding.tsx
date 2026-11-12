import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ENTITY_TYPE_DEFS, MODULES, type EntityType } from '@medtech/core';
import { EntityGrid, ErrorState, Icon, Input, Loading, ModuleHero, Section, Tabs } from '@medtech/ui';
import { api } from '../../../lib/api.ts';
import { useAsync, useDebounced, useDocumentTitle, useEntityList, useSearch } from '../../../lib/hooks.ts';
import { useAuth } from '../../../lib/auth.tsx';
import { WikiSubnav } from '../components.tsx';

/** Inhaltstypen, die das Wiki als Nachschlagewerk erschließt (Reihenfolge = Kachelreihenfolge). */
export const WIKI_TYPES: EntityType[] = ['device', 'component', 'product_model', 'manufacturer', 'term', 'legal_reference', 'document', 'media', 'learning_module'];

/** Spezialisierte Übersichtsseiten je Typ; alle übrigen über ?typ= */
const TYPE_PAGE: Partial<Record<EntityType, string>> = {
  device: '/wiki/geraete',
  term: '/wiki/glossar',
  manufacturer: '/wiki/hersteller',
  legal_reference: '/wiki/recht',
  document: '/wiki/dokumente',
};

export function typeLink(type: EntityType): string {
  return TYPE_PAGE[type] ?? `/wiki?typ=${type}`;
}

export default function WikiLanding() {
  const m = MODULES.wiki;
  useDocumentTitle(m.name);
  const { effectiveSettings } = useAuth();
  const meta = useAsync((signal) => api.meta(signal), [], 'meta');
  const [params, setParams] = useSearchParams();
  const requested = params.get('typ') as EntityType | null;
  const tab: EntityType = requested && WIKI_TYPES.includes(requested) ? requested : WIKI_TYPES[0]!;
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const search = useSearch(dq, { types: WIKI_TYPES, limit: 60 });
  const list = useEntityList({ type: tab, limit: 200 });
  const listRef = useRef<HTMLDivElement>(null);

  // Bei Aufruf mit ?typ= (z. B. aus der Brotkrumennavigation) direkt zur Liste springen.
  useEffect(() => {
    if (requested && listRef.current) listRef.current.scrollIntoView({ behavior: effectiveSettings.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const counts = meta.data?.counts;

  return (
    <div className="mw-container mw-page">
      <ModuleHero module="wiki">
        <form className="mw-wiki-hero-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="mw-wiki-search" className="mw-visually-hidden">
            Im Wiki suchen
          </label>
          <Icon name="search" size={18} aria-hidden />
          <Input id="mw-wiki-search" type="search" placeholder="Gerät, Begriff, Norm, Hersteller …" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </form>
      </ModuleHero>
      <WikiSubnav />

      {dq.trim() ? (
        <Section title={`Suchergebnisse für „${dq.trim()}“`} icon="search">
          {search.loading ? (
            <Loading />
          ) : search.error ? (
            <ErrorState error={search.error} onRetry={search.reload} />
          ) : (
            <>
              <p className="mw-small mw-muted" aria-live="polite">
                {search.data?.total ?? 0} Treffer
              </p>
              <EntityGrid items={search.data?.hits ?? []} empty="Keine Treffer im Wiki." />
            </>
          )}
        </Section>
      ) : null}

      <Section title="Schnellzugriff" icon="layers">
        {meta.error ? <ErrorState error={meta.error} onRetry={meta.reload} /> : null}
        <ul className="mw-list-plain mw-wiki-tiles">
          {WIKI_TYPES.map((t) => {
            const def = ENTITY_TYPE_DEFS[t];
            const accent = MODULES[def.homeModule].accent;
            const count = counts?.[t];
            return (
              <li key={t}>
                <Link to={typeLink(t)} className="mw-wiki-tile" style={{ '--mw-wiki-tile-accent': accent } as React.CSSProperties}>
                  <span className="mw-wiki-tile__icon" aria-hidden>
                    <Icon name={def.icon} size={22} />
                  </span>
                  <span className="mw-wiki-tile__body">
                    <span className="mw-wiki-tile__label">{def.plural}</span>
                    <span className="mw-wiki-tile__desc">{def.description}</span>
                  </span>
                  <span className="mw-wiki-tile__count" aria-label={count === undefined ? 'Anzahl wird geladen' : `${count} Einträge`}>
                    {count === undefined ? '…' : count.toLocaleString('de-DE')}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <div ref={listRef} className="mw-wiki-anchor">
        <Section title="Inhalte nach Typ" icon="book" id="inhalte">
          <Tabs
            label="Inhaltstyp"
            value={tab}
            onChange={(t) => setParams((p) => {
              const next = new URLSearchParams(p);
              next.set('typ', t);
              return next;
            }, { replace: true })}
            tabs={WIKI_TYPES.map((t) => ({
              id: t,
              label: (
                <>
                  {ENTITY_TYPE_DEFS[t].plural}
                  {counts?.[t] !== undefined ? <span className="mw-wiki-tab-count"> {counts[t]}</span> : null}
                </>
              ),
            }))}
          />
          {TYPE_PAGE[tab] ? (
            <p className="mw-small">
              <Link to={TYPE_PAGE[tab]!}>
                Zur strukturierten Übersicht: {ENTITY_TYPE_DEFS[tab].plural} <Icon name="chevron-right" size={12} aria-hidden />
              </Link>
            </p>
          ) : null}
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : <EntityGrid items={list.data?.items ?? []} />}
        </Section>
      </div>
    </div>
  );
}
