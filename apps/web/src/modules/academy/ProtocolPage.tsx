import { useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { MODULES, entityPath, type EntityDetail, type SpecRow, type TestProcedureData } from '@medtech/core';
import { Alert, Badge, Breadcrumbs, Button, ButtonLink, Card, ErrorState, Field, Icon, Input, Loading, ProgressBar, QualityNotices, Textarea } from '@medtech/ui';
import { useDocumentTitle, useEntity, useRecordVisit } from '../../lib/hooks.ts';
import { NotFound } from '../../pages/NotFound.tsx';
import {
  PROCEDURE_KIND_SHORT,
  RESULT_LABELS,
  VERDICT_LABELS,
  checkAgainstLimit,
  evaluateProtocol,
  initialProtocol,
  normalizeProtocol,
  specsForStep,
  todayIso,
  updateStep,
  type ProtocolHeader,
  type ProtocolState,
  type Verdict,
} from './academy-logic.ts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const storeKey = (id: string) => `mw-academy-protocol:${id}`;

export function ProtocolPage() {
  const { slug } = useParams();
  const valid = SLUG.test(slug ?? '');
  const { data, error, loading, reload } = useEntity<TestProcedureData>(valid ? `test_procedure:${slug}` : null);
  if (!valid) return <NotFound what="Prüfverfahren" />;
  if (loading && !data)
    return (
      <div className="mw-container mw-page">
        <Loading />
      </div>
    );
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound what="Prüfverfahren" />;
    return (
      <div className="mw-container mw-page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;
  return <Protocol key={data.id} entity={data} />;
}

function load(id: string, steps: number): ProtocolState {
  try {
    return normalizeProtocol(JSON.parse(localStorage.getItem(storeKey(id)) ?? 'null'), steps, todayIso());
  } catch {
    return initialProtocol(steps, todayIso());
  }
}

function Protocol({ entity }: { entity: EntityDetail<TestProcedureData> }) {
  const d = entity.data;
  useDocumentTitle(`Prüfprotokoll: ${entity.title}`);
  useRecordVisit(entity.id, 'academy', 'view');
  const [state, setState] = useState<ProtocolState>(() => load(entity.id, d.steps.length));
  const ev = evaluateProtocol(state.steps);
  const stepSpecs = useMemo(() => d.steps.map((s) => specsForStep(s.title, entity.specs)), [d.steps, entity.specs]);
  const usedSpecKeys = new Set(stepSpecs.flat().map((s) => s.key));
  const otherSpecs = entity.specs.filter((s) => !usedSpecKeys.has(s.key));
  const testedItems = entity.relations.filter((g) => g.rel === 'tests' && g.direction === 'out').flatMap((g) => g.items);
  const listId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(entity.id), JSON.stringify(state));
    } catch {
      /* lokaler Speicher nicht verfügbar */
    }
  }, [state, entity.id]);

  const setHeader = (patch: Partial<ProtocolHeader>) => setState((s) => ({ ...s, header: { ...s.header, ...patch } }));

  function reset() {
    if (!window.confirm('Alle Eingaben dieses Prüfprotokolls verwerfen?')) return;
    setState(initialProtocol(d.steps.length, todayIso()));
  }

  const resultTone = ev.result === 'bestanden' ? 'ok' : ev.result === 'nicht-bestanden' ? 'danger' : 'info';

  return (
    <div className="mw-container mw-page mw-academy-protocol">
      <div className="mw-academy-noprint">
        <Breadcrumbs
          items={[
            { label: MODULES.academy.shortName, to: MODULES.academy.path },
            { label: 'Prüfverfahren', to: `${MODULES.academy.path}#pruefverfahren` },
            { label: entity.title, to: entityPath(entity.id) },
            { label: 'Prüfprotokoll' },
          ]}
        />
      </div>
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <Badge icon="clipboard" tone="info">
            {PROCEDURE_KIND_SHORT[d.kind]}
          </Badge>
          <span>Prüfprotokoll</span>
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{entity.title}</h1>
          <div className="mw-row mw-academy-noprint">
            <Button variant="primary" icon="download" onClick={() => window.print()}>
              Drucken / als PDF
            </Button>
            <Button icon="reset" onClick={reset}>
              Zurücksetzen
            </Button>
            <ButtonLink to={entityPath(entity.id)} icon="book">
              Verfahren
            </ButtonLink>
          </div>
        </div>
        <p className="mw-page-header__lead">{entity.summary}</p>
      </header>

      <div className="mw-academy-noprint mw-stack" style={{ gap: 8, marginBottom: 20 }}>
        <Alert tone="info" icon="shield">
          <strong>Datenschutz:</strong> Alle Eingaben bleiben lokal in diesem Browser gespeichert und werden <strong>nicht an den Server übertragen</strong>. Zum Archivieren
          das Protokoll drucken oder als PDF speichern.
        </Alert>
        <Alert tone="warn">
          Lernwerkzeug: Maßgeblich sind die Prüfanweisungen des Herstellers, die geltenden Normen und die Vorgaben deiner Einrichtung. Prüfungen dürfen nur von entsprechend
          qualifizierten Personen durchgeführt werden.
        </Alert>
        <QualityNotices flags={entity.flags} />
      </div>

      <Card as="section" className="mw-academy-protocol__head">
        <h2 className="mw-card__title">Prüfgegenstand und Prüfer</h2>
        <div className="mw-academy-protocol__fields">
          <Field label="Gerät" hint={testedItems.length ? 'Vorschläge aus den geprüften Gerätetypen' : undefined}>
            {(id) => (
              <>
                <Input id={id} value={state.header.device} onChange={(e) => setHeader({ device: e.target.value })} list={`${listId}-devices`} autoComplete="off" />
                <datalist id={`${listId}-devices`}>
                  {testedItems.map((t) => (
                    <option key={t.id} value={t.title} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Inventarnummer">{(id) => <Input id={id} value={state.header.inventoryNo} onChange={(e) => setHeader({ inventoryNo: e.target.value })} />}</Field>
          <Field label="Prüfer/in">{(id) => <Input id={id} value={state.header.inspector} onChange={(e) => setHeader({ inspector: e.target.value })} autoComplete="name" />}</Field>
          <Field label="Prüfdatum">{(id) => <Input id={id} type="date" value={state.header.date} onChange={(e) => setHeader({ date: e.target.value })} />}</Field>
        </div>
        <dl className="mw-academy-facts mw-small" style={{ marginTop: 12 }}>
          {d.interval ? (
            <div>
              <dt>Prüfintervall</dt>
              <dd>{d.interval}</dd>
            </div>
          ) : null}
          <div>
            <dt>Qualifikation</dt>
            <dd>{d.qualification}</dd>
          </div>
          {d.equipment.length ? (
            <div>
              <dt>Prüfmittel</dt>
              <dd>{d.equipment.join(' · ')}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <section className="mw-academy-protocol__steps" aria-labelledby="pruefschritte-titel">
        <div className="mw-spread" style={{ margin: '24px 0 8px' }}>
          <h2 id="pruefschritte-titel" className="mw-section__title" style={{ margin: 0 }}>
            <Icon name="clipboard" /> Prüfschritte
          </h2>
          <span className="mw-small mw-muted" aria-live="polite">
            {ev.done} von {ev.total} durchgeführt · {ev.rated} bewertet
          </span>
        </div>
        <div className="mw-academy-noprint" style={{ marginBottom: 12 }}>
          <ProgressBar value={ev.total ? (ev.rated / ev.total) * 100 : 0} label="Bewertete Prüfschritte" />
        </div>
        <ol className="mw-academy-check-list">
          {d.steps.map((s, i) => (
            <StepRow
              key={i}
              index={i}
              title={s.title}
              description={s.description}
              limit={s.limit}
              specs={stepSpecs[i] ?? []}
              state={state.steps[i]!}
              onChange={(patch) => setState((st) => updateStep(st, i, patch))}
            />
          ))}
        </ol>
      </section>

      {otherSpecs.length ? (
        <Card as="section" className="mw-academy-protocol__specs">
          <h2 className="mw-card__title">Weitere Grenzwerte dieses Verfahrens</h2>
          <ul className="mw-academy-list mw-small">
            {otherSpecs.map((sp) => (
              <li key={sp.key}>
                {sp.label}: <strong>{fmtSpec(sp)}</strong>
                {sp.condition ? <span className="mw-muted"> ({sp.condition})</span> : null}
                <span className="mw-muted"> – {sp.source.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card as="section" className={`mw-academy-overall mw-academy-overall--${resultTone}`}>
        <h2 className="mw-card__title">Gesamtergebnis</h2>
        <p className="mw-academy-overall__result" role="status" aria-live="polite">
          <Icon name={ev.result === 'bestanden' ? 'check' : ev.result === 'nicht-bestanden' ? 'alert' : 'info'} /> {RESULT_LABELS[ev.result]}
        </p>
        {ev.result === 'offen' && ev.missing.length ? (
          <p className="mw-small mw-muted">Noch offen: Schritt {ev.missing.map((m) => m + 1).join(', ')}</p>
        ) : null}
        {ev.result === 'nicht-bestanden' ? (
          <p className="mw-small">
            {ev.failed} Prüfschritt(e) n. i. O. – Gerät kennzeichnen und gemäß Vorgaben der Einrichtung außer Betrieb nehmen bzw. Instandsetzung veranlassen.
          </p>
        ) : null}
        <Field label="Bemerkungen / festgestellte Mängel">
          {(id) => <Textarea id={id} value={state.remarks} onChange={(e) => setState((s) => ({ ...s, remarks: e.target.value }))} rows={3} />}
        </Field>
        {d.documentation.length ? (
          <div className="mw-small" style={{ marginTop: 12 }}>
            <strong>Zu dokumentieren:</strong> {d.documentation.join(' · ')}
          </div>
        ) : null}
        <div className="mw-academy-signature mw-academy-printonly" aria-hidden>
          <span>Datum, Unterschrift Prüfer/in</span>
        </div>
      </Card>
      <p className="mw-small mw-muted mw-academy-printonly">
        Erstellt mit der MedTech Prüfakademie (MedTech World) auf Grundlage von „{entity.title}“ ({entity.id}). Grenzwerte mit Quellenangabe laut Verfahrensbeschreibung.
      </p>
    </div>
  );
}

function fmtSpec(sp: SpecRow) {
  return `${typeof sp.value === 'number' ? sp.value.toLocaleString('de-DE') : sp.value}${sp.unit ? ` ${sp.unit}` : ''}`;
}

function StepRow({
  index,
  title,
  description,
  limit,
  specs,
  state,
  onChange,
}: {
  index: number;
  title: string;
  description: string;
  limit?: string;
  specs: SpecRow[];
  state: ProtocolState['steps'][number];
  onChange: (patch: Partial<ProtocolState['steps'][number]>) => void;
}) {
  const id = useId();
  // Automatischer Hinweis nur bei genau einem eindeutigen Grenzwert
  const single = specs.length === 1 ? specs[0]! : null;
  const check = single && state.measured.trim() ? checkAgainstLimit(state.measured, single.value) : null;
  const verdicts: Verdict[] = ['io', 'nio', 'entfaellt'];
  return (
    <li className={`mw-academy-check${state.verdict ? ` is-${state.verdict}` : ''}`}>
      <div className="mw-academy-check__head">
        <label className="mw-academy-check__done">
          <input type="checkbox" checked={state.done} onChange={(e) => onChange({ done: e.target.checked })} aria-describedby={`${id}-desc`} />
          <span>
            <span className="mw-academy-check__num">{index + 1}.</span> <strong>{title}</strong>
            <span className="mw-visually-hidden"> – durchgeführt</span>
          </span>
        </label>
      </div>
      <p id={`${id}-desc`} className="mw-academy-check__desc">
        {description}
      </p>
      {limit || specs.length ? (
        <div className="mw-academy-limits">
          <Icon name="target" size={14} /> <span>Grenzwert:</span>
          {limit ? <span>{limit}</span> : null}
          {specs.map((sp) => (
            <span key={sp.key} className="mw-academy-limit" title={`Quelle: ${sp.source.title}`}>
              {sp.label}: <strong>{fmtSpec(sp)}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mw-academy-check__inputs">
        <div className="mw-field">
          <label className="mw-label" htmlFor={`${id}-mw`}>
            Messwert{single?.unit ? ` (${single.unit})` : ''} <span className="mw-muted">– optional</span>
          </label>
          <Input id={`${id}-mw`} value={state.measured} inputMode="decimal" onChange={(e) => onChange({ measured: e.target.value })} aria-describedby={check ? `${id}-check` : undefined} />
          {check ? (
            <span id={`${id}-check`} className={`mw-small mw-academy-check__hint is-${check}`}>
              <Icon name={check === 'ok' ? 'check' : 'alert'} size={12} /> {check === 'ok' ? 'innerhalb des Grenzwerts' : 'Grenzwert überschritten'}
            </span>
          ) : null}
        </div>
        <fieldset className="mw-academy-verdict">
          <legend className="mw-label">Bewertung</legend>
          <div className="mw-academy-verdict__options">
            {verdicts.map((v) => (
              <label key={v} className={`mw-academy-verdict__opt mw-academy-verdict__opt--${v}${state.verdict === v ? ' is-active' : ''}`}>
                <input type="radio" name={`${id}-verdict`} value={v} checked={state.verdict === v} onChange={() => onChange({ verdict: v })} />
                {VERDICT_LABELS[v]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </li>
  );
}
