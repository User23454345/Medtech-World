import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { MODULES, entityPath, type EntityDetail, type EntityType, type OfferData } from '@medtech/core';
import { Button, EmptyState, EntityGrid, ErrorState, Icon, Input, Loading, ModuleHero, Section, Select, Stat } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { useDocumentTitle, useEntity, useEntityList, useRecordVisit } from '../../lib/hooks.ts';
import { useCompatibility, useOfferCatalog } from './data.ts';
import { DemoNotice, MARKET_PATH, OfferGrid, OfferTable } from './components.tsx';
import {
  CONDITION_LABELS,
  CONDITION_ORDER,
  SORT_LABELS,
  VIA_LABELS,
  cheapestOffer,
  filterOffers,
  formatPrice,
  offersFor,
  parsePriceInput,
  priceBounds,
  sortOffers,
  type MarketOffer,
  type OfferSort,
} from './market-logic.ts';

export function Landing() {
  const m = MODULES.market;
  useDocumentTitle(m.name);
  const { user } = useAuth();
  const catalog = useOfferCatalog();
  const parts = useEntityList({ type: 'spare_part', limit: 200 });
  const location = useLocation();

  // Sprungmarken (#finder, #angebote) nach dem Laden ansteuern
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ block: 'start' });
  }, [location.hash]);

  return (
    <div className="mw-container mw-page mw-market">
      <ModuleHero module="market" lead="Ersatzteile und Geräte finden – Kompatibilität direkt aus der zentralen Datenbasis von MedTech World. Demonstrator ohne realen Handel.">
        <div className="mw-row mw-market-hero__actions">
          <a href="#finder" className="mw-btn mw-btn--lg mw-market-hero__cta">
            <Icon name="target" /> Kompatibilitätsfinder
          </a>
          <a href="#angebote" className="mw-btn mw-btn--lg mw-market-hero__ghost">
            <Icon name="cart" /> Angebote ansehen
          </a>
          {user ? (
            <Link to={`${MARKET_PATH}/anfragen`} className="mw-btn mw-btn--lg mw-market-hero__ghost">
              <Icon name="history" /> Meine Anfragen
            </Link>
          ) : null}
        </div>
        <div className="mw-row mw-market-hero__stats">
          <Stat value={catalog.data ? catalog.data.length.toLocaleString('de-DE') : '…'} label="Demo-Angebote" />
          <Stat value={parts.data ? parts.data.total.toLocaleString('de-DE') : '…'} label="Ersatzteile mit Kompatibilität" />
        </div>
      </ModuleHero>

      <DemoNotice />

      <div id="finder" className="mw-market-anchor">
        <Section title="Kompatibilitätsfinder" icon="target">
          <CompatibilityFinder catalog={catalog.data} />
        </Section>
      </div>

      <div id="angebote" className="mw-market-anchor">
        <Section title="Angebote" icon="cart">
          {catalog.loading && !catalog.data ? (
            <Loading label="Angebote werden geladen …" />
          ) : catalog.error ? (
            <ErrorState error={catalog.error} onRetry={catalog.reload} />
          ) : (
            <OfferBrowser offers={catalog.data ?? []} />
          )}
        </Section>
      </div>

      <Section title="Ersatzteile im Katalog" icon="box">
        {parts.loading && !parts.data ? <Loading /> : parts.error ? <ErrorState error={parts.error} onRetry={parts.reload} /> : <EntityGrid items={parts.data?.items ?? []} empty="Noch keine Ersatzteile erfasst." />}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- Angebotsraster mit Filtern */

const TARGET_FILTERS: Array<{ value: EntityType | ''; label: string }> = [
  { value: '', label: 'Alle Angebote' },
  { value: 'spare_part', label: 'Ersatzteile' },
  { value: 'product_model', label: 'Geräte (Produktmodelle)' },
  { value: 'device', label: 'Geräteklassen' },
];

function OfferBrowser({ offers }: { offers: MarketOffer[] }) {
  const [query, setQuery] = useState('');
  const [condition, setCondition] = useState<OfferData['condition'] | ''>('');
  const [targetType, setTargetType] = useState<EntityType | ''>('');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<OfferSort>('price-asc');
  const ids = { q: useId(), c: useId(), t: useId(), min: useId(), max: useId(), s: useId(), stock: useId() };

  const minPrice = parsePriceInput(minText);
  const maxPrice = parsePriceInput(maxText);
  const minInvalid = minText.trim() !== '' && minPrice === undefined;
  const maxInvalid = maxText.trim() !== '' && maxPrice === undefined;
  const bounds = priceBounds(offers);

  const result = useMemo(
    () => sortOffers(filterOffers(offers, { query, condition, targetType, minPrice, maxPrice, inStockOnly }), sort),
    [offers, query, condition, targetType, minPrice, maxPrice, inStockOnly, sort],
  );
  const active = !!(query || condition || targetType || minText || maxText || inStockOnly);

  const reset = () => {
    setQuery('');
    setCondition('');
    setTargetType('');
    setMinText('');
    setMaxText('');
    setInStockOnly(false);
  };

  if (!offers.length) return <EmptyState title="Noch keine Angebote im Market." icon="cart" />;

  return (
    <div className="mw-stack">
      <form className="mw-card mw-market-filters" role="search" aria-label="Angebote filtern" onSubmit={(e) => e.preventDefault()}>
        <div className="mw-field mw-market-filters__wide">
          <label className="mw-label" htmlFor={ids.q}>
            Suche
          </label>
          <Input id={ids.q} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Teil, Gerät, Anbieter, Ort …" />
        </div>
        <div className="mw-field">
          <label className="mw-label" htmlFor={ids.t}>
            Angebotsart
          </label>
          <Select id={ids.t} value={targetType} onChange={(e) => setTargetType(e.target.value as EntityType | '')}>
            {TARGET_FILTERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mw-field">
          <label className="mw-label" htmlFor={ids.c}>
            Zustand
          </label>
          <Select id={ids.c} value={condition} onChange={(e) => setCondition(e.target.value as OfferData['condition'] | '')}>
            <option value="">Alle Zustände</option>
            {CONDITION_ORDER.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <fieldset className="mw-market-filters__price">
          <legend className="mw-label">Preis in €</legend>
          <div className="mw-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <label className="mw-visually-hidden" htmlFor={ids.min}>
              Mindestpreis in Euro
            </label>
            <Input
              id={ids.min}
              inputMode="decimal"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              placeholder={bounds ? `ab ${Math.floor(bounds.min).toLocaleString('de-DE')}` : 'von'}
              aria-invalid={minInvalid || undefined}
            />
            <span aria-hidden>–</span>
            <label className="mw-visually-hidden" htmlFor={ids.max}>
              Höchstpreis in Euro
            </label>
            <Input
              id={ids.max}
              inputMode="decimal"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              placeholder={bounds ? `bis ${Math.ceil(bounds.max).toLocaleString('de-DE')}` : 'bis'}
              aria-invalid={maxInvalid || undefined}
            />
          </div>
          {minInvalid || maxInvalid ? (
            <span className="mw-small" style={{ color: 'var(--mw-danger)' }} role="alert">
              Bitte einen gültigen Betrag eingeben, z. B. 1.250,00.
            </span>
          ) : null}
        </fieldset>
        <div className="mw-field">
          <label className="mw-label" htmlFor={ids.s}>
            Sortierung
          </label>
          <Select id={ids.s} value={sort} onChange={(e) => setSort(e.target.value as OfferSort)}>
            {(Object.keys(SORT_LABELS) as OfferSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <label className="mw-checkbox mw-market-filters__check" htmlFor={ids.stock}>
          <input id={ids.stock} type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          Nur sofort verfügbare
        </label>
      </form>

      <div className="mw-spread">
        <p className="mw-small mw-muted" style={{ margin: 0 }} aria-live="polite">
          {result.length === offers.length
            ? `${offers.length.toLocaleString('de-DE')} ${offers.length === 1 ? 'Angebot' : 'Angebote'}`
            : `${result.length.toLocaleString('de-DE')} von ${offers.length.toLocaleString('de-DE')} Angeboten`}
          {bounds ? ` · Preisspanne ${formatPrice(bounds.min)} bis ${formatPrice(bounds.max)}` : ''}
        </p>
        {active ? (
          <Button size="sm" variant="ghost" icon="reset" onClick={reset}>
            Filter zurücksetzen
          </Button>
        ) : null}
      </div>

      {result.length ? (
        <OfferGrid offers={result} />
      ) : (
        <EmptyState title="Keine Angebote für diese Filter." icon="search">
          <Button size="sm" onClick={reset} icon="reset">
            Filter zurücksetzen
          </Button>
        </EmptyState>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Kompatibilitätsfinder */

function CompatibilityFinder({ catalog }: { catalog: MarketOffer[] | undefined }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get('geraet') ?? '';
  const selectId = useId();
  const devices = useEntityList({ type: 'device', limit: 500 });
  const models = useEntityList({ type: 'product_model', limit: 500 });
  const components = useEntityList({ type: 'component', limit: 500 });
  const validSelection = /^(device|product_model|component):[a-z0-9-]+$/.test(selected) ? selected : '';
  const entity = useEntity(validSelection || null);
  useRecordVisit(validSelection || undefined, 'market');

  const listsLoading = (devices.loading && !devices.data) || (models.loading && !models.data);
  const listError = devices.error ?? models.error;

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('geraet', id);
    else next.delete('geraet');
    setParams(next, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="mw-stack">
      <p className="mw-muted" style={{ margin: 0, maxWidth: '75ch' }}>
        Wähle eine Geräteklasse, ein Produktmodell oder eine Komponente. Der Finder sucht im Wissensgraphen nach Ersatzteilen, die direkt passen, die zu verbauten
        Komponenten passen oder – bei Geräteklassen – zu den zugehörigen Produktmodellen, und zeigt die Angebote dazu.
      </p>
      {listError ? (
        <ErrorState error={listError} onRetry={() => (devices.reload(), models.reload(), components.reload())} />
      ) : (
        <div className="mw-field" style={{ maxWidth: 520 }}>
          <label className="mw-label" htmlFor={selectId}>
            Gerät, Produktmodell oder Komponente
          </label>
          <Select id={selectId} value={validSelection} onChange={(e) => choose(e.target.value)} disabled={listsLoading}>
            <option value="">{listsLoading ? 'Wird geladen …' : 'Bitte auswählen …'}</option>
            {devices.data?.items.length ? (
              <optgroup label="Geräteklassen">
                {devices.data.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {models.data?.items.length ? (
              <optgroup label="Produktmodelle">
                {models.data.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {components.data?.items.length ? (
              <optgroup label="Komponenten">
                {components.data.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </div>
      )}

      {!validSelection ? null : entity.loading && !entity.data ? (
        <Loading />
      ) : entity.error ? (
        <ErrorState error={entity.error} onRetry={entity.reload} />
      ) : entity.data ? (
        <FinderResult entity={entity.data} catalog={catalog} onReset={() => choose('')} />
      ) : null}
    </div>
  );
}

function FinderResult({ entity, catalog, onReset }: { entity: EntityDetail; catalog: MarketOffer[] | undefined; onReset: () => void }) {
  const compat = useCompatibility(entity);
  const directOffers = catalog ? offersFor(catalog, entity.id) : [];
  const parts = compat.data?.parts ?? [];
  const sources = compat.data?.sources ?? [];
  const componentCount = sources.filter((s) => s.via === 'component').length;
  const modelCount = sources.filter((s) => s.via === 'model').length;

  return (
    <div className="mw-card mw-market-finder" aria-live="polite" aria-busy={compat.loading}>
      <div className="mw-spread">
        <div>
          <div className="mw-small mw-muted">Ergebnis für</div>
          <h3 className="mw-market-finder__title">
            <Link to={entityPath(entity.id)}>{entity.title}</Link>
          </h3>
          <div className="mw-small mw-muted">
            Durchsucht: {entity.title}
            {componentCount ? ` · ${componentCount} Komponente${componentCount === 1 ? '' : 'n'}` : ''}
            {modelCount ? ` · ${modelCount} Produktmodell${modelCount === 1 ? '' : 'e'}` : ''}
          </div>
        </div>
        <Button size="sm" variant="ghost" icon="x" onClick={onReset}>
          Auswahl aufheben
        </Button>
      </div>

      {compat.loading && !compat.data ? (
        <Loading label="Passende Ersatzteile werden gesucht …" />
      ) : compat.error ? (
        <ErrorState error={compat.error} onRetry={compat.reload} />
      ) : (
        <>
          {parts.length ? (
            <ol className="mw-list-plain mw-market-finder__parts">
              {parts.map(({ part, via }) => {
                const offers = catalog ? offersFor(catalog, part.id) : [];
                const best = cheapestOffer(offers);
                return (
                  <li key={part.id} className="mw-market-finder__part">
                    <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <Link to={entityPath(part.id)} className="mw-market-finder__part-title">
                          <Icon name="box" size={16} /> {part.title}
                        </Link>
                        <div className="mw-row" style={{ gap: 6, marginTop: 4 }}>
                          {via.map((v) => (
                            <span key={v.id} className={`mw-market-via mw-market-via--${v.via}`}>
                              {v.via === 'direct' ? VIA_LABELS.direct : `${VIA_LABELS[v.via]}: ${v.title}`}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mw-market-finder__best">
                        {best ? (
                          <>
                            <span className="mw-small mw-muted">ab</span> <strong>{formatPrice(best.data.price)}</strong>
                            <div className="mw-small mw-muted">
                              {offers.length} Angebot{offers.length === 1 ? '' : 'e'}
                            </div>
                          </>
                        ) : (
                          <span className="mw-small mw-muted">kein Angebot</span>
                        )}
                      </div>
                    </div>
                    {offers.length ? <OfferTable offers={offers} caption={`Angebote für ${part.title}`} /> : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState title="Keine passenden Ersatzteile hinterlegt." icon="box">
              <p className="mw-small">Die Kompatibilität wird redaktionell gepflegt. Ergänzungen erfolgen über die zentrale Datenbasis.</p>
            </EmptyState>
          )}
          {directOffers.length ? (
            <div>
              <h4 className="mw-market-subtitle">Angebote für {entity.title} selbst</h4>
              <OfferTable offers={directOffers} caption={`Angebote für ${entity.title}`} />
            </div>
          ) : null}
          <p className="mw-small mw-muted" style={{ margin: 0 }}>
            Hinweis: Die Zuordnung ersetzt nicht die Prüfung anhand der Herstellerunterlagen (Seriennummernbereich, Softwarestand, Freigaben).
          </p>
        </>
      )}
    </div>
  );
}
