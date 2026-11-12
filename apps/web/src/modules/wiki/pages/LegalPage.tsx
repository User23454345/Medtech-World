import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { entityPath, type LegalReferenceData } from '@medtech/core';
import { Alert, Badge, EmptyState, ErrorState, Field, Icon, Loading, QualityBadges, Select } from '@medtech/ui';
import { useEntityList } from '../../../lib/hooks.ts';
import { DetailProgress, WikiSubPage } from '../components.tsx';
import {
  formatDate,
  isInvalidLegal,
  JURISDICTION_LABEL,
  labelOf,
  LEGAL_KIND_LABEL,
  LEGAL_STATUS_LABEL,
  LEGAL_STATUS_TONE,
  reviewState,
  sortLegal,
} from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';

type StatusFilter = '' | 'gueltig' | 'ungueltig' | 'entwurf';
type Jurisdiction = LegalReferenceData['jurisdiction'];
const JURISDICTIONS = Object.keys(JURISDICTION_LABEL) as Jurisdiction[];

export default function LegalPage() {
  const [params, setParams] = useSearchParams();
  const statusParam = (params.get('status') ?? '') as StatusFilter;
  const status: StatusFilter = ['gueltig', 'ungueltig', 'entwurf'].includes(statusParam) ? statusParam : '';
  const jParam = params.get('raum') ?? '';
  const jurisdiction = (JURISDICTIONS as string[]).includes(jParam) ? (jParam as Jurisdiction) : '';

  const list = useEntityList({ type: 'legal_reference', limit: 500 });
  const ids = useMemo(() => list.data?.items.map((i) => i.id), [list.data]);
  const details = useEntityDetails<LegalReferenceData>(ids);
  const titles = useMemo(() => new Map((list.data?.items ?? []).map((i) => [i.id, i.title])), [list.data]);

  const rows = useMemo(() => {
    const merged = (list.data?.items ?? []).map((s) => ({ ...s, data: details.details.get(s.id)?.data }));
    return sortLegal(merged).filter((r) => {
      const st = r.data?.status;
      if (status === 'gueltig' && st !== 'in-kraft') return false;
      if (status === 'ungueltig' && !isInvalidLegal(st)) return false;
      if (status === 'entwurf' && st !== 'entwurf') return false;
      if (jurisdiction && r.data?.jurisdiction !== jurisdiction) return false;
      return true;
    });
  }, [list.data, details.details, status, jurisdiction]);

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <WikiSubPage
      title="Rechtsgrundlagen"
      lead="Verordnungen, Gesetze und Normen mit Fundstelle, Geltungsstatus und dem Datum der letzten Prüfung gegen die Primärquelle."
    >
      <Alert tone="info" icon="scale">
        Die Einträge fassen Rechtsgrundlagen zu Lernzwecken zusammen und ersetzen keine Rechtsberatung. Verbindlich ist ausschließlich der
        Wortlaut der amtlich veröffentlichten Fassung. Einträge, deren Prüfintervall abgelaufen ist, sind mit „Rechtsstand prüfen“ markiert.
      </Alert>
      <div className="mw-wiki-filterbar" style={{ marginTop: 16 }}>
        <Field label="Geltungsstatus">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">Alle Einträge</option>
              <option value="gueltig">In Kraft</option>
              <option value="ungueltig">Ersetzt / aufgehoben</option>
              <option value="entwurf">Entwurf</option>
            </Select>
          )}
        </Field>
        <Field label="Geltungsbereich">
          {(id) => (
            <Select id={id} value={jurisdiction} onChange={(e) => setParam('raum', e.target.value)}>
              <option value="">Alle Geltungsbereiche</option>
              {JURISDICTIONS.map((j) => (
                <option key={j} value={j}>
                  {JURISDICTION_LABEL[j]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <DetailProgress loaded={details.loaded} total={details.total} label="Rechtsstand wird geladen" />
      {details.error ? <ErrorState error={details.error} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !rows.length ? (
        <EmptyState title="Keine Rechtsgrundlagen zu diesem Filter." icon="scale" />
      ) : (
        <ul className="mw-list-plain mw-wiki-legal-list">
          {rows.map((r) => {
            const d = r.data;
            const invalid = isInvalidLegal(d?.status);
            const review = d ? reviewState(d.verifiedAt, d.reviewIntervalDays) : null;
            return (
              <li key={r.id} className={`mw-wiki-legal${invalid ? ' is-invalid' : ''}`}>
                <div className="mw-wiki-legal__main">
                  <div className="mw-row" style={{ gap: 6 }}>
                    {d ? (
                      <Badge tone={LEGAL_STATUS_TONE[d.status]} icon={invalid ? 'alert' : d.status === 'in-kraft' ? 'check' : 'edit'}>
                        {labelOf(LEGAL_STATUS_LABEL, d.status)}
                      </Badge>
                    ) : null}
                    {d ? <Badge>{labelOf(JURISDICTION_LABEL, d.jurisdiction)}</Badge> : null}
                    {d ? <Badge>{labelOf(LEGAL_KIND_LABEL, d.kind)}</Badge> : null}
                    <QualityBadges flags={r.flags} reviewStatus={r.reviewStatus} />
                  </div>
                  <h2 className="mw-wiki-legal__title">
                    <Link to={entityPath(r.id)}>{r.title}</Link>
                  </h2>
                  {d ? <p className="mw-wiki-legal__citation">{d.citation}</p> : null}
                  <p className="mw-small mw-wiki-legal__summary">{r.summary}</p>
                  {invalid && d?.supersededBy ? (
                    <p className="mw-small mw-wiki-legal__successor">
                      <Icon name="chevron-right" size={14} aria-hidden /> {d.status === 'aufgehoben' ? 'Nachfolgeregelung' : 'Ersetzt durch'}:{' '}
                      <Link to={entityPath(d.supersededBy)}>{titles.get(d.supersededBy) ?? d.supersededBy}</Link>
                    </p>
                  ) : null}
                </div>
                <dl className="mw-wiki-legal__dates mw-small">
                  {d?.validFrom ? (
                    <div>
                      <dt>Gilt seit</dt>
                      <dd>{formatDate(d.validFrom)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Rechtsstand geprüft</dt>
                    <dd>{d ? formatDate(d.verifiedAt) : '…'}</dd>
                  </div>
                  {review?.due ? (
                    <div>
                      <dt>Nächste Prüfung</dt>
                      <dd className={review.overdue ? 'is-overdue' : undefined}>
                        {formatDate(review.due)}
                        {review.overdue ? ' (überfällig)' : ''}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </WikiSubPage>
  );
}
