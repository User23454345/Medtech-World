import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  entityPath,
  type ComponentData,
  type DeviceData,
  type DocumentData,
  type EntityDetail,
  type LegalReferenceData,
  type ManufacturerData,
  type MediaData,
  type ProductModelData,
  type TermData,
} from '@medtech/core';
import { Alert, Badge, EntityChip, Icon, Loading } from '@medtech/ui';
import { useEntity } from '../../../lib/hooks.ts';
import { ExternalLink, Facts, PanelHeading } from '../components.tsx';
import {
  COMPONENT_KIND_LABEL,
  DOC_TYPE_LABEL,
  formatDate,
  hostOf,
  isInvalidLegal,
  JURISDICTION_LABEL,
  labelOf,
  languageLabel,
  LEGAL_KIND_LABEL,
  LEGAL_STATUS_LABEL,
  LEGAL_STATUS_TONE,
  MEDIA_KIND_LABEL,
  mediaSrc,
  PRODUCT_STATUS_LABEL,
  relatedOfType,
  relationItems,
  reviewState,
  safeExternalUrl,
  sortByTitle,
  TERM_CATEGORY_LABEL,
  uniqueById,
} from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';
import '../wiki.css';

type PanelProps = { entity: EntityDetail };

const RISK_NOTE =
  'Die Klassifizierung nach MDR Anhang VIII richtet sich nach der Zweckbestimmung des konkreten Produkts. Die angegebene Klasse ist typisch, im Einzelfall kann sie abweichen.';

function RiskClass({ value, typical }: { value: string; typical?: boolean }) {
  return (
    <span className="mw-wiki-risk" title={typical ? RISK_NOTE : 'Risikoklasse nach MDR Anhang VIII'}>
      <span className="mw-wiki-risk__value">{value}</span>
      {typical ? <span className="mw-muted mw-small">typisch</span> : null}
    </span>
  );
}

function ChipList({ items, empty }: { items: Array<Pick<EntityDetail, 'id' | 'type' | 'title' | 'demo'>>; empty: string }) {
  if (!items.length) return <p className="mw-small mw-muted">{empty}</p>;
  return (
    <div className="mw-row" style={{ gap: 6 }}>
      {items.map((it) => (
        <EntityChip key={it.id} entity={it} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Medizingerät

export function DevicePanel({ entity }: PanelProps) {
  const data = entity.data as Partial<DeviceData>;
  const models = useMemo(() => sortByTitle(relationItems(entity.relations, 'model_of', 'in', 'product_model')), [entity.relations]);
  const modelIds = useMemo(() => models.map((m) => m.id), [models]);
  const modelDetails = useEntityDetails<ProductModelData>(modelIds);
  const manufacturers = useMemo(() => {
    const fromModels = models.flatMap((m) => {
      const d = modelDetails.details.get(m.id);
      return d ? relationItems(d.relations, 'manufactured_by', 'out', 'manufacturer') : [];
    });
    return sortByTitle(uniqueById(relatedOfType(entity.relations, 'manufacturer'), fromModels));
  }, [models, modelDetails.details, entity.relations]);

  return (
    <div className="mw-wiki-panel">
      <Facts
        items={[
          { label: 'Gerätekategorie', value: data.category ? <Link to="/wiki/geraete">{data.category}</Link> : undefined },
          {
            label: 'Typische Risikoklasse',
            value: data.typicalRiskClass ? (
              <>
                <RiskClass value={data.typicalRiskClass} typical />
                <span className="mw-wiki-facts__note">{RISK_NOTE}</span>
              </>
            ) : undefined,
          },
          { label: 'Funktionsprinzip', value: data.operatingPrinciple },
          {
            label: 'Anwendungen',
            value: data.applications?.length ? (
              <ul className="mw-wiki-bullets">
                {data.applications.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : undefined,
          },
        ]}
      />

      <PanelHeading>Produktmodelle im Wiki</PanelHeading>
      {models.length ? (
        <div className="mw-table-wrap">
          <table className="mw-table">
            <thead>
              <tr>
                <th scope="col">Modell</th>
                <th scope="col">Hersteller</th>
                <th scope="col">Klasse</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const d = modelDetails.details.get(m.id);
                const maker = d ? relationItems(d.relations, 'manufactured_by', 'out', 'manufacturer') : [];
                return (
                  <tr key={m.id}>
                    <td>
                      <Link to={entityPath(m.id)}>{m.title}</Link> {m.demo ? <Badge tone="demo">Demo</Badge> : null}
                    </td>
                    <td>
                      {d ? (
                        maker.length ? (
                          maker.map((x, i) => (
                            <span key={x.id}>
                              {i > 0 ? ', ' : ''}
                              <Link to={entityPath(x.id)}>{x.title}</Link>
                            </span>
                          ))
                        ) : (
                          <span className="mw-muted">–</span>
                        )
                      ) : (
                        <span className="mw-muted">…</span>
                      )}
                    </td>
                    <td>{d?.data.riskClass ?? <span className="mw-muted">–</span>}</td>
                    <td>{d ? labelOf(PRODUCT_STATUS_LABEL, d.data.status) : <span className="mw-muted">…</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mw-small mw-muted">Zu dieser Geräteklasse sind noch keine Produktmodelle erfasst.</p>
      )}

      <PanelHeading>Hersteller</PanelHeading>
      {modelDetails.loading && !manufacturers.length && models.length ? (
        <Loading label="Hersteller werden ermittelt …" />
      ) : (
        <ChipList items={manufacturers} empty="Keine Hersteller verknüpft." />
      )}
      {manufacturers.some((m) => m.demo) ? (
        <p className="mw-small mw-muted" style={{ marginTop: 8 }}>
          Mit „Demo“ gekennzeichnete Hersteller und Modelle sind fiktiv und dienen ausschließlich Lernzwecken.
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Hersteller

export function ManufacturerPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<ManufacturerData>;
  const site = safeExternalUrl(data.website);
  const products = sortByTitle(relationItems(entity.relations, 'manufactured_by', 'in'));
  return (
    <div className="mw-wiki-panel">
      {entity.demo ? (
        <Alert tone="demo" icon="info">
          <strong>Fiktiver Hersteller:</strong> {entity.title} existiert nicht. Firmenangaben und Produkte sind für Lern- und
          Demonstrationszwecke erfunden und dürfen nicht als reale Herstellerangaben verwendet werden.
        </Alert>
      ) : null}
      <Facts
        items={[
          { label: 'Sitz', value: data.country },
          { label: 'Gegründet', value: data.founded ? String(data.founded) : undefined },
          { label: 'Website', value: site ? <ExternalLink href={site}>{hostOf(site)}</ExternalLink> : undefined },
          {
            label: 'Schwerpunkte',
            value: data.focus?.length ? (
              <span className="mw-row" style={{ gap: 6 }}>
                {data.focus.map((f) => (
                  <Badge key={f}>{f}</Badge>
                ))}
              </span>
            ) : undefined,
          },
        ]}
      />
      <PanelHeading>Produkte im Wiki</PanelHeading>
      <ChipList items={products} empty="Keine Produkte dieses Herstellers erfasst." />
    </div>
  );
}

// ------------------------------------------------------------------ Produktmodell

export function ProductModelPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<ProductModelData>;
  const deviceClass = relationItems(entity.relations, 'model_of', 'out');
  const makers = relationItems(entity.relations, 'manufactured_by', 'out');
  return (
    <div className="mw-wiki-panel">
      <Facts
        items={[
          {
            label: 'Marktstatus',
            value: data.status ? (
              <Badge tone={data.status === 'aktiv' ? 'ok' : data.status === 'abgekuendigt' ? 'warn' : undefined}>{labelOf(PRODUCT_STATUS_LABEL, data.status)}</Badge>
            ) : undefined,
          },
          { label: 'Markteinführung', value: data.releaseYear ? String(data.releaseYear) : undefined },
          { label: 'Risikoklasse (MDR)', value: data.riskClass ? <RiskClass value={data.riskClass} /> : undefined },
          {
            label: 'Geräteklasse',
            value: deviceClass.length ? (
              <span className="mw-row" style={{ gap: 6 }}>
                {deviceClass.map((d) => (
                  <EntityChip key={d.id} entity={d} />
                ))}
              </span>
            ) : undefined,
          },
          {
            label: 'Hersteller',
            value: makers.length ? (
              <span className="mw-row" style={{ gap: 6 }}>
                {makers.map((d) => (
                  <EntityChip key={d.id} entity={d} />
                ))}
              </span>
            ) : undefined,
          },
        ]}
      />
      {deviceClass[0] ? (
        <p className="mw-small" style={{ marginTop: 8 }}>
          <Link to={entityPath(deviceClass[0].id)}>
            Grundlagen zur Geräteklasse {deviceClass[0].title} <Icon name="chevron-right" size={12} aria-hidden />
          </Link>
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Komponente

export function ComponentPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<ComponentData>;
  const usedIn = sortByTitle(relationItems(entity.relations, 'has_component', 'in'));
  return (
    <div className="mw-wiki-panel">
      <Facts
        items={[
          { label: 'Art', value: data.kind ? <Badge icon="chip">{labelOf(COMPONENT_KIND_LABEL, data.kind)}</Badge> : undefined },
          { label: 'Funktion', value: data.function },
          {
            label: 'Verschleißteil',
            value:
              data.wearPart === undefined ? undefined : data.wearPart ? (
                <Badge tone="warn" icon="history" title="Unterliegt bestimmungsgemäßem Verschleiß; regelmäßige Kontrolle und Austausch nach Herstellerangabe">
                  Ja – Verschleißteil
                </Badge>
              ) : (
                'Nein'
              ),
          },
        ]}
      />
      <PanelHeading>Verbaut in</PanelHeading>
      <ChipList items={usedIn} empty="Noch keinem Gerät oder Modell zugeordnet." />
    </div>
  );
}

// ------------------------------------------------------------------ Fachbegriff

export function TermPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<TermData>;
  return (
    <div className="mw-wiki-panel">
      <Facts
        items={[
          { label: 'Abkürzung', value: data.abbreviation ? <abbr className="mw-wiki-abbr" title={entity.title}>{data.abbreviation}</abbr> : undefined },
          { label: 'Englisch', value: data.english ? <span lang="en">{data.english}</span> : undefined },
          {
            label: 'Kategorie',
            value: data.category ? (
              <Link to={`/wiki/glossar?kategorie=${data.category}`}>{labelOf(TERM_CATEGORY_LABEL, data.category)}</Link>
            ) : undefined,
          },
          { label: 'Formel', value: data.formula ? <code className="mw-wiki-formula">{data.formula}</code> : undefined },
        ]}
      />
      <p className="mw-small" style={{ marginTop: 8 }}>
        <Link to="/wiki/glossar">
          Zum Glossar A–Z <Icon name="chevron-right" size={12} aria-hidden />
        </Link>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Rechtsgrundlage

export function LegalReferencePanel({ entity }: PanelProps) {
  const data = entity.data as Partial<LegalReferenceData>;
  const invalid = isInvalidLegal(data.status);
  const successor = useEntity(data.supersededBy ?? null);
  const review = data.verifiedAt ? reviewState(data.verifiedAt, data.reviewIntervalDays) : null;
  const successorTitle = successor.data?.title ?? data.supersededBy;
  return (
    <div className="mw-wiki-panel">
      {invalid ? (
        <div className="mw-wiki-legal-warning" role="note" aria-label="Rechtsgrundlage nicht mehr gültig">
          <Icon name="alert" size={22} aria-hidden />
          <div>
            <strong>
              {data.status === 'aufgehoben' ? 'Aufgehoben – nicht mehr anwendbar.' : 'Ersetzt – nicht mehr die geltende Fassung.'}
            </strong>
            <p>
              Diese Rechtsgrundlage ist nur noch historisch relevant (z. B. für Bestandsprodukte, alte Zertifikate oder Übergangsfristen). Für
              aktuelle Entscheidungen nicht verwenden.
            </p>
            {data.supersededBy ? (
              <p>
                {data.status === 'aufgehoben' ? 'Nachfolgeregelung' : 'Ersetzt durch'}:{' '}
                <Link to={entityPath(data.supersededBy)} className="mw-wiki-legal-warning__link">
                  {successorTitle}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <Facts
        items={[
          { label: 'Fundstelle', value: data.citation ? <span className="mw-wiki-citation">{data.citation}</span> : undefined },
          {
            label: 'Status',
            value: data.status ? (
              <Badge tone={LEGAL_STATUS_TONE[data.status]} icon={invalid ? 'alert' : data.status === 'in-kraft' ? 'check' : 'edit'}>
                {labelOf(LEGAL_STATUS_LABEL, data.status)}
              </Badge>
            ) : undefined,
          },
          { label: 'Geltungsbereich', value: data.jurisdiction ? labelOf(JURISDICTION_LABEL, data.jurisdiction) : undefined },
          { label: 'Art', value: data.kind ? labelOf(LEGAL_KIND_LABEL, data.kind) : undefined },
          { label: 'Gilt seit', value: data.validFrom ? formatDate(data.validFrom) : undefined },
          { label: 'Rechtsstand geprüft', value: data.verifiedAt ? formatDate(data.verifiedAt) : undefined },
          {
            label: 'Nächste Prüfung fällig',
            value: review?.due ? (
              review.overdue ? (
                <Badge tone="warn" icon="history">
                  seit {formatDate(review.due)} überfällig
                </Badge>
              ) : (
                <>
                  {formatDate(review.due)} <span className="mw-muted mw-small">(Intervall {data.reviewIntervalDays ?? 365} Tage)</span>
                </>
              )
            ) : undefined,
          },
        ]}
      />
      {!invalid && review?.overdue ? (
        <Alert tone="warn" icon="scale">
          Der Rechtsstand wurde seit über {data.reviewIntervalDays ?? 365} Tagen nicht gegen die Primärquelle geprüft. Bitte die aktuelle amtliche
          Fassung heranziehen.
        </Alert>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Dokument

export function DocumentPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<DocumentData>;
  const url = safeExternalUrl(data.url);
  return (
    <div className="mw-wiki-panel">
      <Facts
        items={[
          { label: 'Dokumentart', value: data.docType ? labelOf(DOC_TYPE_LABEL, data.docType) : undefined },
          { label: 'Version', value: data.version },
          { label: 'Sprache', value: languageLabel(data.language) },
          { label: 'Datei', value: url ? <ExternalLink href={url}>{hostOf(url)}</ExternalLink> : 'Inhalt direkt im Wiki' },
        ]}
      />
      {url ? (
        <p className="mw-small mw-muted" style={{ marginTop: 8 }}>
          Externes Dokument – maßgeblich ist stets die aktuelle Fassung beim Herausgeber.
        </p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Bild

export function MediaPanel({ entity }: PanelProps) {
  const data = entity.data as Partial<MediaData>;
  const src = mediaSrc(entity.thumbnail, data);
  return (
    <div className="mw-wiki-panel">
      <figure className="mw-wiki-figure">
        {src ? (
          <div className="mw-wiki-figure__frame">
            <img src={src} alt={data.alt ?? entity.title} loading="lazy" decoding="async" />
          </div>
        ) : (
          <p className="mw-muted mw-small">Keine Bilddatei hinterlegt.</p>
        )}
        <figcaption className="mw-small">
          <span className="mw-wiki-figure__title">{entity.title}</span>
          {data.kind ? <Badge>{labelOf(MEDIA_KIND_LABEL, data.kind)}</Badge> : null}
          <span className="mw-muted">
            {data.attribution ? `Urheber: ${data.attribution}` : ''}
            {data.attribution && data.license ? ' · ' : ''}
            {data.license ? `Lizenz: ${data.license}` : ''}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
