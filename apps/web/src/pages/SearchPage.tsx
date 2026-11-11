import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ENTITY_TYPE_DEFS, MODULES, MODULE_IDS, entityPath, type EntityType, type ModuleId } from '@medtech/core';
import { Badge, Card, EmptyState, ErrorState, Icon, Input, Loading, PageHeader, QualityBadges, TypeBadge } from '@medtech/ui';
import { useDebounced, useDocumentTitle, useSearch } from '../lib/hooks.ts';
import { Snippet } from '../shell/GlobalSearch.tsx';

/** Vollständige Ergebnisseite der globalen Suche mit Filtern nach Modul und Inhaltstyp */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const module = (params.get('modul') as ModuleId | null) ?? undefined;
  const type = (params.get('typ') as EntityType | null) ?? undefined;
  const dq = useDebounced(q, 250);
  useDocumentTitle(dq ? `Suche: ${dq}` : 'Suche');

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (dq) next.set('q', dq);
    else next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const all = useSearch(dq, { limit: 200 });
  const filtered = (all.data?.hits ?? []).filter((h) => (!module || h.module === module || ENTITY_TYPE_DEFS[h.type].alsoIn.includes(module)) && (!type || h.type === type));

  const setFilter = (key: 'modul' | 'typ', value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="mw-container mw-page">
      <PageHeader title="Plattformweite Suche" lead="Eine Suche über Wiki, Repair Lab, 3D Explorer, Market, Simulator, Prüfakademie, Copilot und Career Hub." />
      <div style={{ maxWidth: 640 }}>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchbegriff, z. B. SpO2" aria-label="Suchbegriff" autoFocus />
      </div>

      {!dq.trim() ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState title="Suchbegriff eingeben">
            <p>Tipp: Mit Strg + K öffnest du die Schnellsuche von jeder Seite aus.</p>
          </EmptyState>
        </div>
      ) : all.loading && !all.data ? (
        <Loading />
      ) : all.error ? (
        <ErrorState error={all.error} onRetry={all.reload} />
      ) : (
        <div className="mw-search-layout">
          <aside aria-label="Filter">
            <Card>
              <h2 className="mw-card__title">Module</h2>
              <ul className="mw-list-plain mw-filter-list">
                <li>
                  <button type="button" aria-pressed={!module} onClick={() => setFilter('modul')}>
                    Alle Module <span>{all.data?.total ?? 0}</span>
                  </button>
                </li>
                {MODULE_IDS.filter((m) => all.data?.byModule[m]).map((m) => (
                  <li key={m}>
                    <button type="button" aria-pressed={module === m} onClick={() => setFilter('modul', m)}>
                      <Icon name={MODULES[m].icon} size={14} style={{ color: MODULES[m].accent }} /> {MODULES[m].shortName} <span>{all.data?.byModule[m]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <h2 className="mw-card__title" style={{ marginTop: 16 }}>
                Inhaltstyp
              </h2>
              <ul className="mw-list-plain mw-filter-list">
                <li>
                  <button type="button" aria-pressed={!type} onClick={() => setFilter('typ')}>
                    Alle Typen
                  </button>
                </li>
                {Object.entries(all.data?.byType ?? {}).map(([t, n]) => (
                  <li key={t}>
                    <button type="button" aria-pressed={type === t} onClick={() => setFilter('typ', t)}>
                      {ENTITY_TYPE_DEFS[t as EntityType].plural} <span>{n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
          <section aria-label="Suchergebnisse" aria-live="polite">
            <p className="mw-muted mw-small">
              {filtered.length} Treffer für „{dq}“
            </p>
            {filtered.length === 0 ? (
              <EmptyState title="Keine Treffer">
                <p>Versuche einen allgemeineren Begriff oder entferne Filter.</p>
              </EmptyState>
            ) : (
              <ol className="mw-list-plain mw-stack" style={{ gap: 10 }}>
                {filtered.map((h) => (
                  <li key={h.id}>
                    <Card interactive style={{ padding: 16 }}>
                      <div className="mw-row" style={{ gap: 6, marginBottom: 4 }}>
                        <TypeBadge type={h.type} />
                        <Badge style={{ color: MODULES[h.module].accent }}>{MODULES[h.module].shortName}</Badge>
                        <QualityBadges flags={h.flags} />
                      </div>
                      <Link to={entityPath(h.id)} style={{ fontWeight: 650, fontSize: '1.05rem' }}>
                        {h.title}
                      </Link>
                      <p className="mw-small" style={{ margin: '4px 0 0', color: 'var(--mw-text-2)' }}>
                        <Snippet text={h.snippet || h.summary} />
                      </p>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
