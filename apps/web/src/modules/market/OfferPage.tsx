import { useParams } from 'react-router';
import { MODULES, entityPath, type EntityDetail } from '@medtech/core';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, ErrorState, Icon, Loading, Markdown, QualityNotices, RelationGroups, Section } from '@medtech/ui';
import { useDocumentTitle, useEntity, useRecordVisit } from '../../lib/hooks.ts';
import { EntityTitleScope, FavoriteButton, NotesPanel } from '../../shell/EntityPage.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import { ChipList, MARKET_PATH } from './components.tsx';
import { relationItems } from './market-logic.ts';
import { OfferPanel } from './panels.tsx';

/** Angebotsdetailseite im Market-Kontext (/market/angebot/:slug) */
export function OfferPage() {
  const { slug = '' } = useParams();
  const valid = /^[a-z0-9-]+$/.test(slug);
  const { data, error, loading, reload } = useEntity(valid ? `offer:${slug}` : null);
  if (!valid) return <NotFound what="Angebot" />;
  if (loading && !data) {
    return (
      <div className="mw-container mw-page">
        <Loading />
      </div>
    );
  }
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound what="Angebot" />;
    return (
      <div className="mw-container mw-page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mw-container mw-page">
        <EmptyState title="Angebot nicht gefunden" />
      </div>
    );
  }
  return (
    <EntityTitleScope entity={data}>
      <OfferView entity={data} />
    </EntityTitleScope>
  );
}

function OfferView({ entity }: { entity: EntityDetail }) {
  useDocumentTitle(entity.title);
  useRecordVisit(entity.id, 'market');
  const targets = relationItems(entity, 'offers', 'out');
  const otherRelations = entity.relations.filter((g) => !(g.rel === 'offers' && g.direction === 'out'));

  return (
    <div className="mw-container mw-page mw-market">
      <Breadcrumbs items={[{ label: MODULES.market.shortName, to: MARKET_PATH }, { label: 'Angebote', to: `${MARKET_PATH}#angebote` }, { label: entity.title }]} />
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <Badge icon="cart">Angebot</Badge>
          <Badge tone="demo">Demo-Angebot</Badge>
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{entity.title}</h1>
          <div className="mw-row">
            <FavoriteButton entityId={entity.id} />
          </div>
        </div>
        <p className="mw-page-header__lead">{entity.summary}</p>
      </header>
      <QualityNotices flags={entity.flags} />

      <div className="mw-two-col" style={{ marginTop: 24 }}>
        <div style={{ minWidth: 0 }}>
          <Section title="Angebot" icon="cart">
            <OfferPanel entity={entity} />
          </Section>
          {entity.body ? (
            <Section title="Beschreibung" icon="book">
              <Markdown source={entity.body} />
            </Section>
          ) : null}
          {otherRelations.some((g) => g.items.length) ? (
            <Section title="Verknüpfte Inhalte" icon="link">
              <RelationGroups groups={otherRelations} />
            </Section>
          ) : null}
        </div>
        <aside className="mw-stack" aria-label="Zusatzinformationen">
          <Card>
            <h2 className="mw-card__title">Angebot für</h2>
            {targets.length ? <ChipList items={targets} /> : <p className="mw-small mw-muted">Keine Zuordnung hinterlegt.</p>}
          </Card>
          <Card>
            <h2 className="mw-card__title">
              <Icon name="note" /> Meine Notizen
            </h2>
            <NotesPanel entityId={entity.id} />
          </Card>
          <ButtonLink to={entityPath(entity.id)} icon="layers" size="sm">
            Einheitliche Detailseite öffnen
          </ButtonLink>
        </aside>
      </div>
    </div>
  );
}
