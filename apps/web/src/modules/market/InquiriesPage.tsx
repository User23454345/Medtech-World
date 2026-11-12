import { Link } from 'react-router';
import { MODULES } from '@medtech/core';
import { Breadcrumbs, Button, ButtonLink, EmptyState, ErrorState, Icon, Loading, PageHeader } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useAsync, useDocumentTitle, useRequireLogin } from '../../lib/hooks.ts';
import { DemoNotice, MARKET_PATH, offerPagePath } from './components.tsx';
import { useOfferCatalog } from './data.ts';
import { formatDateTime, formatPrice, slugFromId } from './market-logic.ts';

/** Kontobereich des Market: eigene (Demo-)Anfragen */
export function InquiriesPage() {
  useDocumentTitle('Meine Anfragen · Market');
  const { user, ready } = useAuth();
  const requireLogin = useRequireLogin();
  const inquiries = useAsync(() => api.market.inquiries(), [user?.id], user ? `market:inquiries:${user.id}` : null);
  const catalog = useOfferCatalog();
  const byId = new Map((catalog.data ?? []).map((o) => [o.id, o]));

  return (
    <div className="mw-container mw-page mw-market">
      <Breadcrumbs items={[{ label: MODULES.market.shortName, to: MARKET_PATH }, { label: 'Meine Anfragen' }]} />
      <PageHeader title="Meine Anfragen" lead="Alle Anfragen, die du im MedTech Market gespeichert hast." actions={user ? <Button size="sm" icon="reset" onClick={inquiries.reload}>Aktualisieren</Button> : undefined} />
      <DemoNotice compact />

      {!ready ? (
        <Loading />
      ) : !user ? (
        <EmptyState title="Bitte melde dich an" icon="user">
          <p>Anfragen werden in deinem Konto gespeichert und sind nur angemeldet sichtbar.</p>
          <Button variant="primary" icon="user" onClick={() => requireLogin()}>
            Anmelden
          </Button>
        </EmptyState>
      ) : inquiries.loading && !inquiries.data ? (
        <Loading />
      ) : inquiries.error ? (
        <ErrorState error={inquiries.error} onRetry={inquiries.reload} />
      ) : !inquiries.data?.items.length ? (
        <EmptyState title="Noch keine Anfragen gestellt" icon="cart">
          <p>Öffne ein Angebot und stelle dort eine (Demo-)Anfrage.</p>
          <ButtonLink to={`${MARKET_PATH}#angebote`} variant="primary" icon="cart">
            Zu den Angeboten
          </ButtonLink>
        </EmptyState>
      ) : (
        <ol className="mw-list-plain mw-stack mw-market-inquiries" style={{ marginTop: 16 }}>
          {[...inquiries.data.items]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((inq) => {
              const offer = byId.get(inq.offerId);
              const slug = slugFromId(inq.offerId);
              return (
                <li key={inq.id} className="mw-card mw-market-inquiry-item">
                  <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <Link to={offerPagePath(slug)} className="mw-market-inquiry-item__title">
                        <Icon name="cart" size={16} /> {offer?.title ?? `Angebot ${slug}`}
                      </Link>
                      {offer ? (
                        <div className="mw-small mw-muted">
                          {offer.data.seller} · {offer.data.location} · {formatPrice(offer.data.price)}
                        </div>
                      ) : catalog.loading ? null : (
                        <div className="mw-small mw-muted">Angebot ist nicht mehr verfügbar.</div>
                      )}
                    </div>
                    <time className="mw-small mw-muted" dateTime={inq.createdAt}>
                      {formatDateTime(inq.createdAt)}
                    </time>
                  </div>
                  <blockquote className="mw-market-inquiry-item__msg">{inq.message}</blockquote>
                  <div className="mw-small mw-muted">
                    <Icon name="info" size={12} /> Status: gespeichert – nicht weitergeleitet (Demo)
                  </div>
                </li>
              );
            })}
        </ol>
      )}
    </div>
  );
}
