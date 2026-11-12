import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { entityPath, type ManufacturerData } from '@medtech/core';
import { Alert, Badge, Card, EmptyState, ErrorState, Icon, Loading, QualityBadges, Tabs } from '@medtech/ui';
import { useEntityList } from '../../../lib/hooks.ts';
import { DetailProgress, ExternalLink, WikiSubPage } from '../components.tsx';
import { hostOf, relationItems, safeExternalUrl, sortByTitle } from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';

type Filter = 'alle' | 'real' | 'demo';

export default function ManufacturersPage() {
  const list = useEntityList({ type: 'manufacturer', limit: 500 });
  const ids = useMemo(() => list.data?.items.map((i) => i.id), [list.data]);
  const details = useEntityDetails<ManufacturerData>(ids);
  const [filter, setFilter] = useState<Filter>('alle');

  const all = useMemo(() => sortByTitle(list.data?.items ?? []), [list.data]);
  const realCount = all.filter((m) => !m.demo).length;
  const items = all.filter((m) => (filter === 'alle' ? true : filter === 'demo' ? m.demo : !m.demo));

  return (
    <WikiSubPage
      title="Hersteller"
      lead="Hersteller von Medizinprodukten mit Sitz, Schwerpunkten und den im Wiki erfassten Produktmodellen."
    >
      <Alert tone="demo" icon="info">
        <strong>Reale und fiktive Hersteller:</strong> Mit „Demo“ gekennzeichnete Hersteller und deren Produkte sind frei erfunden und dienen
        ausschließlich Lern- und Demonstrationszwecken. Angaben zu realen Herstellern sind allgemein gehalten – maßgeblich sind stets die
        aktuellen Herstellerunterlagen.
      </Alert>
      <div style={{ marginTop: 16 }}>
        <Tabs<Filter>
          label="Herstellerfilter"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'alle', label: `Alle (${all.length})` },
            { id: 'real', label: `Reale Hersteller (${realCount})` },
            { id: 'demo', label: `Demo-Hersteller (${all.length - realCount})` },
          ]}
        />
      </div>
      <DetailProgress loaded={details.loaded} total={details.total} label="Herstellerdaten werden geladen" />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !items.length ? (
        <EmptyState title="Keine Hersteller in dieser Auswahl." icon="factory" />
      ) : (
        <ul className="mw-list-plain mw-grid" style={{ '--mw-grid-min': '300px' } as React.CSSProperties}>
          {items.map((m) => {
            const d = details.details.get(m.id);
            const products = d ? relationItems(d.relations, 'manufactured_by', 'in') : [];
            const site = safeExternalUrl(d?.data.website);
            return (
              <li key={m.id}>
                <Card as="article" className={`mw-wiki-maker${m.demo ? ' is-demo' : ''}`}>
                  <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
                    <h2 className="mw-wiki-maker__title">
                      <Link to={entityPath(m.id)}>{m.title}</Link>
                    </h2>
                    {m.demo ? (
                      <Badge tone="demo" icon="info" title="Fiktiver Hersteller für Lern- und Demonstrationszwecke">
                        Demo (fiktiv)
                      </Badge>
                    ) : (
                      <Badge tone="ok" icon="check" title="Real existierender Hersteller">
                        Realer Hersteller
                      </Badge>
                    )}
                  </div>
                  <p className="mw-small mw-muted mw-wiki-maker__meta">
                    {d ? (
                      <>
                        <Icon name="home" size={13} aria-hidden /> {d.data.country}
                        {d.data.founded ? ` · gegründet ${d.data.founded}` : ''}
                      </>
                    ) : (
                      'Angaben werden geladen …'
                    )}
                  </p>
                  <p className="mw-wiki-maker__summary">{m.summary}</p>
                  {d?.data.focus.length ? (
                    <div className="mw-row" style={{ gap: 6 }} aria-label="Schwerpunkte">
                      {d.data.focus.map((f) => (
                        <Badge key={f}>{f}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mw-spread mw-small mw-wiki-maker__foot">
                    <span>
                      {products.length ? `${products.length} Produkt${products.length === 1 ? '' : 'e'} im Wiki` : d ? 'Keine Produkte erfasst' : ''}
                    </span>
                    {site ? <ExternalLink href={site}>{hostOf(site)}</ExternalLink> : null}
                  </div>
                  <div className="mw-row" style={{ gap: 6 }}>
                    <QualityBadges flags={m.flags.filter((f) => f.kind !== 'demo')} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </WikiSubPage>
  );
}
