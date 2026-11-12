import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { entityPath, type EntityDetail, type FaultData } from '@medtech/core';
import { Alert, Breadcrumbs, Button, ButtonLink, Card, EntityChip, ErrorState, Loading } from '@medtech/ui';
import { useDocumentTitle, useEntity, useRecordVisit } from '../../lib/hooks.ts';
import { NotFound } from '../../pages/NotFound.tsx';
import { EntityTitleScope, FavoriteButton } from '../../shell/EntityPage.tsx';
import { CauseList, DiagnosisWizard, GuestHint, REPAIR_PATH, RepairResourcesView, SafetyNotes, SeverityBadge, useDiagnosisTracking } from './components.tsx';
import { decodeAnswers, encodeAnswers } from './diagnosis.ts';
import { HARDWARE_TYPES, relationItems } from './logic.ts';

/** Vollbild-Diagnose: /repair/diagnose/:slug – geführte Fehlersuche für fault:<slug> */
export default function DiagnosePage() {
  const { slug = '' } = useParams();
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const id = valid ? `fault:${slug}` : null;
  const fault = useEntity<FaultData>(id);
  useDocumentTitle(fault.data ? `Diagnose: ${fault.data.title}` : 'Geführte Diagnose');

  if (!valid) return <NotFound what="Fehlerbild" />;
  if (fault.loading && !fault.data) {
    return (
      <div className="mw-container mw-page">
        <Loading label="Fehlerbild wird geladen …" />
      </div>
    );
  }
  if (fault.error) {
    if ((fault.error as { status?: number }).status === 404) return <NotFound what="Fehlerbild" />;
    return (
      <div className="mw-container mw-page">
        <ErrorState error={fault.error} onRetry={fault.reload} />
      </div>
    );
  }
  if (!fault.data) return <NotFound what="Fehlerbild" />;
  return (
    <EntityTitleScope entity={fault.data}>
      <DiagnoseView key={fault.data.id} fault={fault.data} />
    </EntityTitleScope>
  );
}

function DiagnoseView({ fault }: { fault: EntityDetail<FaultData> }) {
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => decodeAnswers(params.get('pfad')));
  const tracking = useDiagnosisTracking(fault.id);
  useRecordVisit(fault.id, 'repair', 'diagnosis');
  const affected = relationItems(fault.relations, 'affects', 'out', HARDWARE_TYPES);
  const data = fault.data;

  // Vollbildmodus (Fullscreen-API), sofern vom Browser unterstützt
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div ref={rootRef} className={`mw-repair-diagnose${isFullscreen ? ' mw-repair-diagnose--fullscreen' : ''}`}>
      <div className="mw-container mw-page">
        <Breadcrumbs
          items={[
            { label: 'Repair Lab', to: REPAIR_PATH },
            { label: fault.title, to: entityPath(fault.id) },
            { label: 'Geführte Diagnose' },
          ]}
        />
        <header className="mw-page-header">
          <div className="mw-page-header__eyebrow">
            <SeverityBadge severity={data.severity} />
            {fault.demo ? <span className="mw-badge mw-badge--demo">Demo-Inhalt</span> : null}
          </div>
          <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
            <h1 className="mw-page-header__title">
              <span className="mw-muted mw-repair-diagnose__kicker">Geführte Diagnose</span>
              {fault.title}
            </h1>
            <div className="mw-row">
              {canFullscreen ? (
                <Button icon={isFullscreen ? 'x' : 'layers'} onClick={toggleFullscreen} aria-pressed={isFullscreen}>
                  {isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
                </Button>
              ) : null}
              <FavoriteButton entityId={fault.id} />
            </div>
          </div>
          <p className="mw-page-header__lead">{fault.summary}</p>
        </header>

        <div className="mw-two-col">
          <div className="mw-stack" style={{ minWidth: 0 }}>
            <Card as="section" className="mw-repair-diagnose__card">
              <DiagnosisWizard
                fault={fault}
                initialAnswers={initial}
                onAnswersChange={(a) => {
                  if (a.length) tracking.onStart();
                  const next = new URLSearchParams(params);
                  if (a.length) next.set('pfad', encodeAnswers(a));
                  else next.delete('pfad');
                  setParams(next, { replace: true });
                }}
                onOutcome={tracking.onOutcome}
                renderOutcome={() => (
                  <div className="mw-stack mw-repair-diagnose__result">
                    {tracking.saved ? (
                      <Alert tone="ok" icon="check">
                        Diagnose als abgeschlossen in Ihrem Lernfortschritt gespeichert.
                      </Alert>
                    ) : (
                      <GuestHint>um abgeschlossene Diagnosen in Ihrem Lernfortschritt zu speichern.</GuestHint>
                    )}
                    {data.remedies.length ? (
                      <section aria-labelledby="repair-remedies">
                        <h3 id="repair-remedies" className="mw-repair-resources__title">
                          Empfohlene Abhilfemaßnahmen
                        </h3>
                        <ol className="mw-repair-remedies">
                          {data.remedies.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ol>
                      </section>
                    ) : null}
                    <SafetyNotes notes={data.safetyNotes} />
                    <RepairResourcesView fault={fault} />
                    <p className="mw-small mw-muted" style={{ margin: 0 }}>
                      Instandsetzung nur durch qualifiziertes Personal nach Herstellervorgaben (MPBetreibV). Nach jedem Eingriff Funktions- und
                      Sicherheitsprüfung durchführen und dokumentieren.
                    </p>
                  </div>
                )}
              />
            </Card>
          </div>
          <aside className="mw-stack" aria-label="Hintergrund zum Fehlerbild">
            <SafetyNotes notes={data.safetyNotes} />
            <Card>
              <h2 className="mw-card__title">Symptome</h2>
              <ul className="mw-small mw-repair-list">
                {data.symptoms.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="mw-card__title">Mögliche Ursachen</h2>
              <CauseList causes={data.causes} />
            </Card>
            {affected.length ? (
              <Card>
                <h2 className="mw-card__title">Betrifft</h2>
                <div className="mw-row" style={{ gap: 6 }}>
                  {affected.map((a) => (
                    <EntityChip key={a.id} entity={a} />
                  ))}
                </div>
              </Card>
            ) : null}
            <ButtonLink to={entityPath(fault.id)} icon="book" variant="ghost">
              Zur Detailseite des Fehlerbilds
            </ButtonLink>
          </aside>
        </div>
      </div>
    </div>
  );
}
