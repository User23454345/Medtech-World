import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { entityPath, type DocumentData } from '@medtech/core';
import { Badge, EmptyState, ErrorState, Field, Loading, QualityBadges, Select } from '@medtech/ui';
import { useEntityList } from '../../../lib/hooks.ts';
import { DetailProgress, ExternalLink, WikiSubPage } from '../components.tsx';
import { DOC_TYPE_LABEL, groupBy, labelOf, languageLabel, relationItems, safeExternalUrl } from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';

type DocType = DocumentData['docType'];
const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as DocType[];

export default function DocumentsPage() {
  const list = useEntityList({ type: 'document', limit: 500 });
  const ids = useMemo(() => list.data?.items.map((i) => i.id), [list.data]);
  const details = useEntityDetails<DocumentData>(ids);
  const [docType, setDocType] = useState<DocType | ''>('');

  const groups = useMemo(() => {
    const items = (list.data?.items ?? []).filter((s) => !docType || details.details.get(s.id)?.data.docType === docType);
    return groupBy(items, (s) => {
      const t = details.details.get(s.id)?.data.docType;
      return t ? labelOf(DOC_TYPE_LABEL, t) : undefined;
    }, details.loading ? 'Wird zugeordnet …' : 'Sonstige');
  }, [list.data, details.details, details.loading, docType]);

  return (
    <WikiSubPage
      title="Dokumente"
      lead="Merkblätter, Checklisten, Protokollvorlagen und Leitfäden – jeweils mit Version, Sprache und den Geräten oder Themen, die sie dokumentieren."
    >
      <div className="mw-wiki-filterbar">
        <Field label="Dokumentart">
          {(id) => (
            <Select id={id} value={docType} onChange={(e) => setDocType(e.target.value as DocType | '')}>
              <option value="">Alle Dokumentarten</option>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <DetailProgress loaded={details.loaded} total={details.total} label="Dokumentdaten werden geladen" />
      {details.error ? <ErrorState error={details.error} /> : null}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !groups.length ? (
        <EmptyState title="Keine Dokumente in dieser Auswahl." icon="file" />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="mw-section" aria-label={g.key}>
            <h2 className="mw-section__title">
              {g.key} <span className="mw-wiki-count">{g.items.length}</span>
            </h2>
            <div className="mw-table-wrap">
              <table className="mw-table mw-wiki-doc-table">
                <thead>
                  <tr>
                    <th scope="col">Dokument</th>
                    <th scope="col">Version</th>
                    <th scope="col">Sprache</th>
                    <th scope="col">Bezieht sich auf</th>
                    <th scope="col">Datei</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((s) => {
                    const d = details.details.get(s.id);
                    const url = safeExternalUrl(d?.data.url);
                    const subjects = d ? relationItems(d.relations, 'documents', 'out') : [];
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={entityPath(s.id)} className="mw-wiki-doc-table__title">
                            {s.title}
                          </Link>
                          <div className="mw-row" style={{ gap: 6, marginTop: 4 }}>
                            <QualityBadges flags={s.flags} reviewStatus={s.reviewStatus} />
                          </div>
                        </td>
                        <td>{d?.data.version ? <Badge>v{d.data.version}</Badge> : <span className="mw-muted">–</span>}</td>
                        <td>{d ? languageLabel(d.data.language) : '…'}</td>
                        <td>
                          {subjects.length ? (
                            <ul className="mw-list-plain mw-wiki-inline-list">
                              {subjects.map((x) => (
                                <li key={x.id}>
                                  <Link to={entityPath(x.id)}>{x.title}</Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="mw-muted">–</span>
                          )}
                        </td>
                        <td>{url ? <ExternalLink href={url}>Öffnen</ExternalLink> : <span className="mw-muted">im Wiki</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </WikiSubPage>
  );
}
