import { Link } from 'react-router';
import { ENTITY_TYPE_DEFS, entityPath, type EntityDetail, type EntityType, type OfferData, type SparePartData } from '@medtech/core';
import { Badge, ErrorState, Icon, Loading } from '@medtech/ui';
import { useCompatibility, useOfferCatalog } from './data.ts';
import { ChipList, ConditionBadge, DemoNotice, InquiryForm, MARKET_PATH, OfferTable, StockInfo, offerPagePath } from './components.tsx';
import { KIND_LABELS, cheapestOffer, describeVia, formatPrice, offersFor, relationItems, warrantyLabel } from './market-logic.ts';

/* ---------------------------------------------------------------- Angebot */

export function OfferPanel({ entity }: { entity: EntityDetail }) {
  const d = entity.data as OfferData;
  if (!d || typeof d.price !== 'number') return <p className="mw-muted">Keine Angebotsdaten hinterlegt.</p>;
  return (
    <div className="mw-market-panel mw-stack">
      <DemoNotice compact />
      <div className="mw-market-pricebox">
        <div>
          <div className="mw-market-pricebox__label">Preis (Demo)</div>
          <div className="mw-market-pricebox__price">{formatPrice(d.price)}</div>
          <div className="mw-small mw-muted">inkl. MwSt., zzgl. Versand – fiktiver Betrag</div>
        </div>
        <div className="mw-stack" style={{ gap: 6, alignItems: 'flex-start' }}>
          <ConditionBadge condition={d.condition} />
          <StockInfo stock={d.stock} />
        </div>
      </div>
      <dl className="mw-market-facts">
        <div>
          <dt>Anbieter</dt>
          <dd>{d.seller}</dd>
        </div>
        <div>
          <dt>Standort</dt>
          <dd>{d.location}</dd>
        </div>
        <div>
          <dt>Gewährleistung</dt>
          <dd>{warrantyLabel(d.warrantyMonths)}</dd>
        </div>
        <div>
          <dt>Bestand</dt>
          <dd>{d.stock.toLocaleString('de-DE')} Stück</dd>
        </div>
      </dl>
      <div>
        <h3 className="mw-market-subtitle">Anfrage stellen</h3>
        <InquiryForm offerSlug={entity.slug} offerTitle={entity.title} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Ersatzteil */

const TARGET_GROUPS: Array<{ type: EntityType; label: string }> = [
  { type: 'device', label: 'Geräteklassen' },
  { type: 'product_model', label: 'Produktmodelle' },
  { type: 'component', label: 'Komponenten' },
];

export function SparePartPanel({ entity }: { entity: EntityDetail }) {
  const d = entity.data as SparePartData;
  const fits = relationItems(entity, 'fits', 'out');
  const catalog = useOfferCatalog();
  const offers = catalog.data ? offersFor(catalog.data, entity.id) : [];
  const best = cheapestOffer(offers);

  return (
    <div className="mw-market-panel mw-stack">
      {d ? (
        <dl className="mw-market-facts">
          <div>
            <dt>Teilenummer</dt>
            <dd>
              <code>{d.partNumber}</code>
            </dd>
          </div>
          <div>
            <dt>Art</dt>
            <dd>{KIND_LABELS[d.kind] ?? d.kind}</dd>
          </div>
          <div>
            <dt>Herkunft</dt>
            <dd>
              {d.original ? (
                <Badge tone="ok" icon="check">
                  Originalteil (OEM)
                </Badge>
              ) : (
                <Badge tone="warn" title="Kompatibles Nachbauteil – Freigabe des Geräteherstellers prüfen">
                  Kompatibles Teil
                </Badge>
              )}
            </dd>
          </div>
          <div>
            <dt>Verschleißteil</dt>
            <dd>{d.wearPart ? <Badge tone="info">Ja – regelmäßiger Tausch</Badge> : 'Nein'}</dd>
          </div>
          {d.typicalLifetime ? (
            <div className="mw-market-facts__wide">
              <dt>Typische Lebensdauer</dt>
              <dd>{d.typicalLifetime}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {d && !d.original ? (
        <p className="mw-small mw-muted" style={{ margin: 0 }}>
          Nicht-Originalteile können die Konformität des Medizinprodukts beeinflussen. Einsatz nur mit Freigabe bzw. nach Bewertung durch den Hersteller oder die verantwortliche Stelle.
        </p>
      ) : null}

      <div>
        <h3 className="mw-market-subtitle">Kompatibel mit</h3>
        {fits.length ? (
          <div className="mw-stack" style={{ gap: 8 }}>
            {TARGET_GROUPS.map((g) => {
              const items = fits.filter((f) => f.type === g.type);
              if (!items.length) return null;
              return (
                <div key={g.type} className="mw-market-compat-group">
                  <span className="mw-relation-group__label">{g.label}</span>
                  <ChipList items={items} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mw-muted mw-small">Für dieses Teil ist noch keine Kompatibilität hinterlegt.</p>
        )}
        <p className="mw-small mw-muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Kompatibilität stets anhand der Herstellerunterlagen (Seriennummernbereich, Softwarestand) bestätigen.
        </p>
      </div>

      <div>
        <div className="mw-spread">
          <h3 className="mw-market-subtitle">Angebote im Market</h3>
          {best ? <span className="mw-small">ab <strong>{formatPrice(best.data.price)}</strong></span> : null}
        </div>
        {catalog.loading && !catalog.data ? (
          <Loading label="Angebote werden geladen …" />
        ) : catalog.error ? (
          <ErrorState error={catalog.error} onRetry={catalog.reload} />
        ) : offers.length ? (
          <>
            <OfferTable offers={offers} caption={`Angebote für ${entity.title}`} />
            <DemoNotice compact />
          </>
        ) : (
          <p className="mw-muted mw-small">Derzeit keine (Demo-)Angebote für dieses Ersatzteil.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Seitenleiste Gerät/Modell/Komponente */

export function CompatiblePartsAside({ entity }: { entity: EntityDetail }) {
  const compat = useCompatibility(entity);
  const catalog = useOfferCatalog();
  const directOffers = catalog.data ? offersFor(catalog.data, entity.id) : [];

  if ((compat.loading && !compat.data) || (catalog.loading && !catalog.data)) return <Loading label="Ersatzteile werden gesucht …" />;
  if (compat.error) return <ErrorState error={compat.error} onRetry={compat.reload} />;
  const parts = compat.data?.parts ?? [];
  if (!parts.length && !directOffers.length) {
    return <p className="mw-small mw-muted" style={{ margin: 0 }}>Für {ENTITY_TYPE_DEFS[entity.type].label === 'Komponente' ? 'diese Komponente' : 'diesen Eintrag'} sind noch keine Ersatzteile oder Angebote hinterlegt.</p>;
  }

  return (
    <div className="mw-market-aside mw-stack" style={{ gap: 12 }}>
      {parts.length ? (
        <ul className="mw-list-plain mw-market-aside__list">
          {parts.slice(0, 8).map(({ part, via }) => {
            const best = catalog.data ? cheapestOffer(offersFor(catalog.data, part.id)) : undefined;
            return (
              <li key={part.id}>
                <Link to={entityPath(part.id)} className="mw-market-aside__part">
                  <Icon name="box" size={14} />
                  <span>{part.title}</span>
                </Link>
                <div className="mw-small mw-muted">{describeVia(via)}</div>
                <div className="mw-small">
                  {best ? (
                    <Link to={offerPagePath(best.slug)}>
                      ab <strong>{formatPrice(best.data.price)}</strong>
                    </Link>
                  ) : (
                    <span className="mw-muted">kein Angebot</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {parts.length > 8 ? <p className="mw-small mw-muted" style={{ margin: 0 }}>… und {parts.length - 8} weitere</p> : null}
      {directOffers.length ? (
        <div>
          <div className="mw-relation-group__label">Angebote für {entity.title}</div>
          <ul className="mw-list-plain mw-stack" style={{ gap: 4 }}>
            {directOffers.map((o) => (
              <li key={o.id} className="mw-small">
                <Link to={offerPagePath(o.slug)}>{o.title}</Link> – <strong>{formatPrice(o.data.price)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link to={`${MARKET_PATH}?geraet=${encodeURIComponent(entity.id)}#finder`} className="mw-btn mw-btn--secondary mw-btn--sm">
        <Icon name="cart" size={14} /> Im Kompatibilitätsfinder öffnen
      </Link>
      <p className="mw-small mw-muted" style={{ margin: 0 }}>Demo-Marktplatz – keine realen Verkäufe.</p>
    </div>
  );
}
