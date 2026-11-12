import { useState } from 'react';
import { Link } from 'react-router';
import { entityPath, type EntityDetail, type FaultData } from '@medtech/core';
import { Alert, Button, ButtonLink, Icon } from '@medtech/ui';
import { useComponentFaults } from './data.ts';
import { CauseList, DiagnosisWizard, diagnosePath, GuestHint, REPAIR_PATH, SafetyNotes, SeverityBadge, useDiagnosisTracking } from './components.tsx';
import { isTreeUsable } from './diagnosis.ts';
import { relationItems } from './logic.ts';

/** Hauptpanel auf der Detailseite eines Fehlerbilds */
export function FaultPanel({ entity }: { entity: EntityDetail }) {
  const fault = entity as EntityDetail<FaultData>;
  const data = fault.data;
  const [open, setOpen] = useState(false);
  const tracking = useDiagnosisTracking(fault.id);
  if (!data || !Array.isArray(data.symptoms)) return <p className="mw-muted">Keine Fehlerbilddaten vorhanden.</p>;
  const usable = isTreeUsable(data);

  return (
    <div className="mw-stack mw-repair-panel">
      <div className="mw-row" style={{ gap: 8 }}>
        <SeverityBadge severity={data.severity} />
        <span className="mw-small mw-muted">
          {data.symptoms.length} Symptom(e) · {data.causes.length} mögliche Ursache(n) · {data.diagnosis.length} Prüfschritt(e)
        </span>
      </div>

      <SafetyNotes notes={data.safetyNotes} />

      <div className="mw-repair-panel__cols">
        <section aria-labelledby={`${fault.slug}-symptome`}>
          <h3 id={`${fault.slug}-symptome`} className="mw-repair-panel__h">
            Symptome
          </h3>
          <ul className="mw-repair-list">
            {data.symptoms.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${fault.slug}-ursachen`}>
          <h3 id={`${fault.slug}-ursachen`} className="mw-repair-panel__h">
            Mögliche Ursachen
          </h3>
          <CauseList causes={data.causes} />
        </section>
      </div>

      <section aria-labelledby={`${fault.slug}-diagnose`} className="mw-repair-panel__diag">
        <div className="mw-spread">
          <h3 id={`${fault.slug}-diagnose`} className="mw-repair-panel__h" style={{ margin: 0 }}>
            Geführte Diagnose
          </h3>
          {usable ? (
            <ButtonLink to={diagnosePath(fault.id)} size="sm" variant="ghost" icon="route">
              Im Repair Lab öffnen
            </ButtonLink>
          ) : null}
        </div>
        {!data.diagnosis.length ? (
          <p className="mw-small mw-muted">Für dieses Fehlerbild ist kein Diagnosebaum hinterlegt.</p>
        ) : open ? (
          <DiagnosisWizard
            fault={fault}
            compact
            onAnswersChange={(a) => {
              if (a.length) tracking.onStart();
            }}
            onOutcome={tracking.onOutcome}
          />
        ) : (
          <div className="mw-row">
            <Button variant="primary" icon="play" onClick={() => setOpen(true)} aria-expanded={false}>
              Diagnose hier durchführen
            </Button>
            <span className="mw-small mw-muted">{data.diagnosis.length} Ja/Nein-Prüfschritte bis zum Ergebnis</span>
          </div>
        )}
        {open && tracking.saved ? (
          <Alert tone="ok" icon="check">
            Diagnose abgeschlossen und im Lernfortschritt gespeichert.
          </Alert>
        ) : null}
        {open ? <GuestHint>um abgeschlossene Diagnosen zu speichern.</GuestHint> : null}
      </section>

      {data.remedies.length ? (
        <section aria-labelledby={`${fault.slug}-abhilfe`}>
          <h3 id={`${fault.slug}-abhilfe`} className="mw-repair-panel__h">
            Abhilfemaßnahmen
          </h3>
          <ol className="mw-repair-remedies">
            {data.remedies.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** Seitenleiste für Geräte, Produktmodelle und Komponenten */
export function KnownFaultsPanel({ entity }: { entity: EntityDetail }) {
  const direct = relationItems(entity.relations, 'affects', 'in', ['fault']);
  const viaComponents = useComponentFaults(entity);
  const directIds = new Set(direct.map((f) => f.id));
  const compGroups = (viaComponents.data ?? [])
    .map((g) => ({ ...g, faults: g.faults.filter((f) => !directIds.has(f.id)) }))
    .filter((g) => g.faults.length);

  if (!direct.length && !compGroups.length) {
    return <p className="mw-small mw-muted">{viaComponents.loading ? 'Wird geladen …' : 'Keine bekannten Fehlerbilder erfasst.'}</p>;
  }

  const row = (f: { id: string; title: string }) => (
    <li key={f.id} className="mw-repair-known__item">
      <Link to={entityPath(f.id)}>{f.title}</Link>
      <Link to={diagnosePath(f.id)} className="mw-repair-known__diag" aria-label={`Diagnose starten: ${f.title}`}>
        <Icon name="route" size={14} /> Diagnose
      </Link>
    </li>
  );

  return (
    <div className="mw-stack" style={{ gap: 12 }}>
      {direct.length ? <ul className="mw-list-plain mw-repair-known">{direct.map(row)}</ul> : null}
      {compGroups.map((g) => (
        <div key={g.component.id}>
          <p className="mw-small mw-muted" style={{ margin: '0 0 4px' }}>
            über Komponente <Link to={entityPath(g.component.id)}>{g.component.title}</Link>
          </p>
          <ul className="mw-list-plain mw-repair-known">{g.faults.map(row)}</ul>
        </div>
      ))}
      {direct.length ? (
        <ButtonLink to={`${REPAIR_PATH}?geraet=${encodeURIComponent(entity.id)}`} size="sm" icon="wrench">
          Im Repair Lab diagnostizieren
        </ButtonLink>
      ) : null}
    </div>
  );
}
