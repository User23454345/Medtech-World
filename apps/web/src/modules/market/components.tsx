import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { entityPath, type EntitySummary } from '@medtech/core';
import { Alert, Badge, Button, EntityChip, Field, Icon, Textarea } from '@medtech/ui';
import { ApiError, api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { invalidateCache, useRequireLogin } from '../../lib/hooks.ts';
import {
  CONDITION_LABELS,
  INQUIRY_MAX,
  INQUIRY_MIN,
  conditionTone,
  formatPrice,
  stockLabel,
  stockLevel,
  validateInquiry,
  warrantyLabel,
  type MarketOffer,
} from './market-logic.ts';
import './market.css';

export const MARKET_PATH = '/market';
export const offerPagePath = (slug: string) => `${MARKET_PATH}/angebot/${slug}`;

/** Unübersehbarer Hinweis: Der Market ist ein Demonstrator. */
export function DemoNotice({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="mw-market-demo-inline" role="note">
        <Icon name="info" size={14} /> <strong>Demo-Marktplatz:</strong> kein Verkauf, Anfragen werden nur gespeichert und nicht weitergeleitet.
      </p>
    );
  }
  return (
    <div className="mw-market-demo" role="note" aria-label="Hinweis: Demo-Marktplatz">
      <Alert tone="demo" icon="info">
        <strong>Demo-Marktplatz – keine realen Verkäufe.</strong> Alle Angebote, Preise, Anbieter und Bestände sind fiktiv und dienen ausschließlich der
        Veranschaulichung. Anfragen werden in deinem Konto gespeichert, aber <strong>nicht</strong> an Anbieter weitergeleitet. Es kommen keine Verträge zustande.
        Ersatzteile für Medizinprodukte nur nach Herstellervorgaben und durch befugtes Fachpersonal einsetzen.
      </Alert>
    </div>
  );
}

export function ConditionBadge({ condition }: { condition: MarketOffer['data']['condition'] }) {
  return <Badge tone={conditionTone(condition)}>{CONDITION_LABELS[condition]}</Badge>;
}

export function StockInfo({ stock }: { stock: number }) {
  const level = stockLevel(stock);
  return (
    <span className={`mw-market-stock mw-market-stock--${level}`}>
      <span className="mw-market-stock__dot" aria-hidden />
      {stockLabel(stock)}
    </span>
  );
}

/** Angebotskarte für Raster und Kompatibilitätsfinder */
export function OfferCard({ offer }: { offer: MarketOffer }) {
  const d = offer.data;
  const headingId = `mw-market-offer-${offer.slug}`;
  return (
    <article className="mw-card mw-card--interactive mw-market-offer" aria-labelledby={headingId}>
      <span className="mw-market-offer__accent" aria-hidden />
      <div className="mw-row" style={{ gap: 6 }}>
        <ConditionBadge condition={d.condition} />
        {offer.demo ? <Badge tone="demo">Demo</Badge> : null}
      </div>
      <h3 className="mw-market-offer__title" id={headingId}>
        <Link to={offerPagePath(offer.slug)} className="mw-market-offer__link">
          {offer.title}
        </Link>
      </h3>
      <div className="mw-market-offer__price" aria-label={`Preis ${formatPrice(d.price)}`}>
        {formatPrice(d.price)}
        <span className="mw-market-offer__vat">inkl. MwSt. (Demo)</span>
      </div>
      <ul className="mw-list-plain mw-market-offer__facts">
        <li>
          <StockInfo stock={d.stock} />
        </li>
        <li>
          <Icon name="home" size={14} /> {d.location}
        </li>
        <li>
          <Icon name="user" size={14} /> {d.seller}
        </li>
        {d.warrantyMonths !== undefined ? (
          <li>
            <Icon name="shield" size={14} /> Gewährleistung: {warrantyLabel(d.warrantyMonths)}
          </li>
        ) : null}
      </ul>
      {offer.targets.length ? (
        <div className="mw-market-offer__targets">
          <span className="mw-small mw-muted">Angebot für</span>
          {offer.targets.map((t) => (
            <Link key={t.id} to={entityPath(t.id)} className="mw-market-offer__target">
              {t.title}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function OfferGrid({ offers, min = 270 }: { offers: MarketOffer[]; min?: number }) {
  return (
    <div className="mw-grid" style={{ '--mw-grid-min': `${min}px` } as CSSProperties}>
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}
    </div>
  );
}

/** Kompakte Angebotstabelle (Ersatzteil-Panel, Kompatibilitätsfinder) */
export function OfferTable({ offers, caption }: { offers: MarketOffer[]; caption: string }) {
  return (
    <div className="mw-table-wrap">
      <table className="mw-table">
        <caption className="mw-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Angebot</th>
            <th scope="col">Zustand</th>
            <th scope="col">Verfügbarkeit</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Preis
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((o) => (
            <tr key={o.id}>
              <td>
                <Link to={offerPagePath(o.slug)}>{o.title}</Link>
                <div className="mw-small mw-muted">
                  {o.data.seller} · {o.data.location}
                </div>
              </td>
              <td>
                <ConditionBadge condition={o.data.condition} />
              </td>
              <td className="mw-small">
                <StockInfo stock={o.data.stock} />
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatPrice(o.data.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChipList({ items }: { items: EntitySummary[] }) {
  return (
    <div className="mw-row" style={{ gap: 6 }}>
      {items.map((it) => (
        <EntityChip key={it.id} entity={it} />
      ))}
    </div>
  );
}

/** Anfrageformular – nur für angemeldete Nutzer:innen, Gäste werden zur Anmeldung geführt. */
export function InquiryForm({ offerSlug, offerTitle }: { offerSlug: string; offerTitle: string }) {
  const { user, can } = useAuth();
  const requireLogin = useRequireLogin();
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ notice: string; createdAt: string } | null>(null);

  if (!user) {
    return (
      <div className="mw-market-inquiry mw-stack" style={{ gap: 10 }}>
        <p className="mw-small" style={{ margin: 0 }}>
          Für eine (Demo-)Anfrage zu diesem Angebot ist eine Anmeldung erforderlich. Deine Anfragen findest du anschließend unter „Meine Anfragen“.
        </p>
        <div>
          <Button variant="primary" icon="user" onClick={() => requireLogin()}>
            Anmelden, um anzufragen
          </Button>
        </div>
      </div>
    );
  }
  if (!can('market:inquire')) {
    return <Alert tone="warn">Dein Konto ist nicht für Anfragen im Market freigeschaltet.</Alert>;
  }

  const validation = validateInquiry(message);
  const fieldError = touched && validation ? validation : undefined;

  if (success) {
    return (
      <div className="mw-stack" style={{ gap: 10 }} aria-live="polite">
        <Alert tone="ok" role="status">
          <strong>Anfrage gespeichert.</strong> {success.notice}
        </Alert>
        <div className="mw-row">
          <Link to={`${MARKET_PATH}/anfragen`} className="mw-btn mw-btn--secondary mw-btn--sm">
            <Icon name="history" size={14} /> Meine Anfragen ansehen
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSuccess(null);
              setMessage('');
              setTouched(false);
            }}
          >
            Weitere Anfrage schreiben
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mw-market-inquiry mw-stack"
      style={{ gap: 10 }}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        if (validation) return;
        setBusy(true);
        setError(null);
        try {
          const res = await api.market.inquire(offerSlug, message.trim());
          invalidateCache('market:inquiries');
          setSuccess({ notice: res.notice, createdAt: res.createdAt });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Die Anfrage konnte nicht gespeichert werden.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="Deine Nachricht an den Anbieter (Demo)"
        hint={`${message.trim().length.toLocaleString('de-DE')} / ${INQUIRY_MAX.toLocaleString('de-DE')} Zeichen, mindestens ${INQUIRY_MIN}`}
        error={fieldError}
      >
        {(id) => (
          <Textarea
            id={id}
            value={message}
            rows={4}
            maxLength={INQUIRY_MAX}
            aria-invalid={fieldError ? true : undefined}
            placeholder={`z. B. Frage zu Lieferzeit, Seriennummernbereich oder Prüfprotokoll für „${offerTitle}“`}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        )}
      </Field>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <div className="mw-row">
        <Button type="submit" variant="primary" icon="send" disabled={busy}>
          {busy ? 'Wird gespeichert …' : 'Anfrage speichern'}
        </Button>
        <span className="mw-small mw-muted">Wird nicht an Anbieter übermittelt.</span>
      </div>
    </form>
  );
}
