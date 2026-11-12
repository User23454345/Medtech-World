import { useMemo, useState, type CSSProperties } from 'react';
import type { DeviceData } from '@medtech/core';
import { Badge, EmptyState, EntityCard, ErrorState, Field, Input, Loading } from '@medtech/ui';
import { useDebounced, useEntityList } from '../../../lib/hooks.ts';
import { DetailProgress, WikiSubPage } from '../components.tsx';
import { groupBy, normalizeForSearch } from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';

const slugify = (s: string) => normalizeForSearch(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function DevicesPage() {
  const list = useEntityList({ type: 'device', limit: 500 });
  const ids = useMemo(() => list.data?.items.map((i) => i.id), [list.data]);
  const details = useEntityDetails<DeviceData>(ids);
  const [q, setQ] = useState('');
  const dq = normalizeForSearch(useDebounced(q, 150));

  const groups = useMemo(() => {
    const items = (list.data?.items ?? []).filter((s) => {
      if (!dq) return true;
      const d = details.details.get(s.id);
      return normalizeForSearch([s.title, s.summary, d?.data.category, ...(d?.data.applications ?? []), ...(d?.aliases ?? [])].join(' ')).includes(dq);
    });
    return groupBy(items, (s) => details.details.get(s.id)?.data.category, details.loading ? 'Wird zugeordnet …' : 'Ohne Kategorie');
  }, [list.data, details.details, details.loading, dq]);

  return (
    <WikiSubPage
      title="Geräteübersicht"
      lead="Medizingeräte nach Gerätekategorie – jeweils mit Funktionsprinzip, typischer Risikoklasse, Komponenten, Fehlerbildern und Prüfverfahren."
    >
      <div className="mw-wiki-filterbar">
        <Field label="Geräte filtern">
          {(id) => <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Kategorie oder Anwendung" autoComplete="off" />}
        </Field>
      </div>
      {groups.length > 1 ? (
        <nav className="mw-wiki-chipnav" aria-label="Gerätekategorien">
          {groups.map((g) => (
            <a key={g.key} href={`#kategorie-${slugify(g.key)}`} className="mw-chip-link">
              {g.key} <span className="mw-muted">{g.items.length}</span>
            </a>
          ))}
        </nav>
      ) : null}
      <DetailProgress loaded={details.loaded} total={details.total} label="Gerätedaten werden geladen" />
      {details.error ? <ErrorState error={details.error} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !groups.length ? (
        <EmptyState title={dq ? 'Keine Geräte zu diesem Filter.' : 'Noch keine Geräte vorhanden.'} icon="device" />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="mw-section" id={`kategorie-${slugify(g.key)}`} aria-labelledby={`kategorie-${slugify(g.key)}-h`}>
            <h2 className="mw-section__title" id={`kategorie-${slugify(g.key)}-h`}>
              {g.key} <span className="mw-wiki-count">{g.items.length}</span>
            </h2>
            <div className="mw-grid" style={{ '--mw-grid-min': '280px' } as CSSProperties}>
              {g.items.map((s) => {
                const rc = details.details.get(s.id)?.data.typicalRiskClass;
                return (
                  <EntityCard
                    key={s.id}
                    entity={s}
                    footer={
                      rc ? (
                        <Badge icon="shield" title="Typische Risikoklasse nach MDR Anhang VIII – maßgeblich ist die Zweckbestimmung des konkreten Produkts">
                          typ. Klasse {rc}
                        </Badge>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </WikiSubPage>
  );
}
