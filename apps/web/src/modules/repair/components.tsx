import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { entityPath, MODULES, type EntityDetail, type EntitySummary, type FaultData } from '@medtech/core';
import { Alert, Badge, Button, ButtonLink, EmptyState, EntityCard, ErrorState, Icon, Loading, ProgressBar } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useRequireLogin } from '../../lib/hooks.ts';
import { useRepairResources } from './data.ts';
import { buildTree, encodeAnswers, isTreeUsable, progressPercent, validateTree, walk, type Answer, type DiagnosisOutcome } from './diagnosis.ts';
import { LIKELIHOOD_META, SEVERITY_META, slugOf, sortCauses, type FaultInfo, type Severity } from './logic.ts';
import './repair.css';

export const REPAIR_PATH = MODULES.repair.path;
export const diagnosePath = (faultId: string, answers?: readonly Answer[]) =>
  `${REPAIR_PATH}/diagnose/${slugOf(faultId)}${answers?.length ? `?pfad=${encodeAnswers(answers)}` : ''}`;

// ------------------------------------------------------------------ Kleine Bausteine
export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return (
    <Badge tone={m.tone} icon={severity === 'kritisch' || severity === 'hoch' ? 'alert' : 'info'} title="Schweregrad des Fehlerbilds">
      Schweregrad: {m.label}
    </Badge>
  );
}

export function CauseList({ causes }: { causes: FaultData['causes'] }) {
  return (
    <ul className="mw-list-plain mw-repair-causes">
      {sortCauses(causes).map((c, i) => {
        const m = LIKELIHOOD_META[c.likelihood];
        return (
          <li key={i} className="mw-repair-cause">
            <div className="mw-spread" style={{ gap: 8 }}>
              <span>{c.text}</span>
              <span className={`mw-repair-likelihood mw-repair-likelihood--${c.likelihood}`}>{m.label}</span>
            </div>
            <div className="mw-repair-bar" aria-hidden>
              <div className={`mw-repair-bar__fill mw-repair-bar__fill--${c.likelihood}`} style={{ width: `${m.percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SafetyNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <Alert tone="warn" icon="shield">
      <strong>Sicherheitshinweise</strong>
      <ul className="mw-repair-safety">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function GuestHint({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const requireLogin = useRequireLogin();
  if (user) return null;
  return (
    <p className="mw-small mw-muted">
      <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => requireLogin()}>
        Anmelden
      </button>{' '}
      {children}
    </p>
  );
}

/** Karte eines Fehlerbilds in Listen */
export function FaultCard({ fault, headingLevel = 3 }: { fault: FaultInfo; headingLevel?: 2 | 3 | 4 }) {
  const H = `h${headingLevel}` as 'h3';
  const usable = isTreeUsable(fault.data);
  return (
    <article className={`mw-card mw-repair-fault mw-repair-fault--${fault.data.severity}`}>
      <div className="mw-row" style={{ gap: 6 }}>
        <SeverityBadge severity={fault.data.severity} />
        {fault.summary.demo ? <Badge tone="demo">Demo</Badge> : null}
      </div>
      <H className="mw-repair-fault__title">
        <Link to={entityPath(fault.summary.id)}>{fault.summary.title}</Link>
      </H>
      <p className="mw-small mw-muted mw-repair-fault__summary">{fault.summary.summary}</p>
      {fault.data.symptoms.length ? (
        <p className="mw-small" style={{ margin: 0 }}>
          <strong>Symptome:</strong> {fault.data.symptoms.slice(0, 3).join(' · ')}
          {fault.data.symptoms.length > 3 ? ' …' : ''}
        </p>
      ) : null}
      {fault.affected.length ? (
        <p className="mw-small mw-muted" style={{ margin: 0 }}>
          <Icon name="device" size={14} /> {fault.affected.map((a) => a.title).join(', ')}
        </p>
      ) : null}
      <div className="mw-row mw-repair-fault__actions">
        {usable ? (
          <ButtonLink to={diagnosePath(fault.summary.id)} variant="primary" size="sm" icon="route">
            Diagnose starten
          </ButtonLink>
        ) : (
          <span className="mw-small mw-muted">Kein Diagnosebaum hinterlegt</span>
        )}
        <ButtonLink to={entityPath(fault.summary.id)} size="sm" variant="ghost" icon="book">
          Details
        </ButtonLink>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ Diagnose-Assistent
export interface DiagnosisWizardProps {
  fault: EntityDetail<FaultData>;
  /** Kompaktdarstellung für die Detailseite */
  compact?: boolean;
  initialAnswers?: Answer[];
  onAnswersChange?: (answers: Answer[]) => void;
  /** Wird einmal je erreichtem Ergebnis aufgerufen */
  onOutcome?: (outcome: DiagnosisOutcome, answers: Answer[]) => void;
  /** Darstellung unterhalb der Ergebniskarte (z. B. Ersatzteile) */
  renderOutcome?: (outcome: DiagnosisOutcome) => ReactNode;
}

const ANSWER_LABEL: Record<Answer, string> = { yes: 'Ja', no: 'Nein' };

export function DiagnosisWizard({ fault, compact, initialAnswers = [], onAnswersChange, onOutcome, renderOutcome }: DiagnosisWizardProps) {
  const data = fault.data;
  const tree = useMemo(() => buildTree(data), [data]);
  const issues = useMemo(() => validateTree(data), [data]);
  const [answers, setAnswers] = useState<Answer[]>(() => {
    const r = walk(tree, initialAnswers);
    return initialAnswers.slice(0, r.consumed);
  });
  const result = useMemo(() => walk(tree, answers), [tree, answers]);
  const percent = progressPercent(tree, result);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const interacted = useRef(false);
  const reportedOutcome = useRef<string | null>(null);
  const { effectiveSettings } = useAuth();

  const update = (next: Answer[]) => {
    interacted.current = true;
    setAnswers(next);
    onAnswersChange?.(next);
  };

  useEffect(() => {
    if (interacted.current) headingRef.current?.focus({ preventScroll: compact });
  }, [answers, compact]);

  useEffect(() => {
    if (result.state.status === 'outcome') {
      const key = `${result.state.outcome.id}:${answers.join(',')}`;
      if (reportedOutcome.current !== key) {
        reportedOutcome.current = key;
        onOutcome?.(result.state.outcome, answers);
      }
    } else reportedOutcome.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (!data.diagnosis.length) {
    return <EmptyState title="Für dieses Fehlerbild ist kein Diagnosebaum hinterlegt." icon="route" />;
  }
  const errors = issues.filter((i) => i.severity === 'error');

  const answer = (a: Answer) => {
    if (result.state.status !== 'step') return;
    update([...answers, a]);
  };
  const undo = () => update(answers.slice(0, -1));
  const restart = () => update([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, a')) return;
    const k = e.key.toLowerCase();
    if (result.state.status === 'step' && (k === 'j' || k === 'y')) {
      e.preventDefault();
      answer('yes');
    } else if (result.state.status === 'step' && k === 'n') {
      e.preventDefault();
      answer('no');
    } else if (k === 'backspace' && answers.length) {
      e.preventDefault();
      undo();
    }
  };

  const stepNo = result.path.length + 1;
  const cls = ['mw-repair-wizard', compact && 'mw-repair-wizard--compact', effectiveSettings.reducedMotion && 'mw-repair--reduced'].filter(Boolean).join(' ');

  return (
    <div className={cls} onKeyDown={onKeyDown}>
      {errors.length ? (
        <Alert tone="danger" role="alert">
          <strong>Der Diagnosebaum ist fehlerhaft.</strong> Bitte die Redaktion informieren.
          <ul className="mw-small">
            {errors.map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="mw-repair-wizard__progress">
        <div className="mw-spread mw-small mw-muted">
          <span>{result.state.status === 'outcome' ? `Diagnose abgeschlossen nach ${result.path.length} Schritt(en)` : `Schritt ${stepNo}`}</span>
          <span>{percent} %</span>
        </div>
        <ProgressBar value={percent} label="Diagnosefortschritt" />
      </div>

      {result.path.length ? (
        <nav aria-label="Bisherige Antworten">
          <ol className="mw-repair-trail">
            {result.path.map((p, i) => (
              <li key={p.step.id}>
                <button
                  type="button"
                  className="mw-repair-trail__item"
                  onClick={() => update(answers.slice(0, i))}
                  title="Zu diesem Schritt zurückkehren"
                  aria-label={`Schritt ${i + 1}: ${p.step.question} – Antwort ${ANSWER_LABEL[p.answer]}. Zu diesem Schritt zurückkehren`}
                >
                  <span className="mw-repair-trail__no">{i + 1}</span>
                  <span className="mw-repair-trail__q">{p.step.question}</span>
                  <span className={`mw-repair-trail__a mw-repair-trail__a--${p.answer}`}>{ANSWER_LABEL[p.answer]}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div aria-live="polite" className="mw-visually-hidden">
        {result.state.status === 'step'
          ? `Schritt ${stepNo}: ${result.state.step.question}`
          : result.state.status === 'outcome'
            ? `Ergebnis: ${result.state.outcome.text}`
            : ''}
      </div>

      {result.state.status === 'step' ? (
        <div className="mw-repair-step" key={result.state.step.id}>
          <div className="mw-repair-step__eyebrow">
            <Icon name="wrench" size={14} /> Prüfschritt {stepNo}
          </div>
          <p className="mw-repair-step__instruction">{result.state.step.instruction}</p>
          <h3 className="mw-repair-step__question" ref={headingRef} tabIndex={-1}>
            {result.state.step.question}
          </h3>
          <div className="mw-row mw-repair-step__answers" role="group" aria-label="Antwort">
            <Button variant="primary" size={compact ? 'md' : 'lg'} icon="check" onClick={() => answer('yes')} aria-keyshortcuts="J">
              Ja
            </Button>
            <Button variant="secondary" size={compact ? 'md' : 'lg'} icon="x" onClick={() => answer('no')} aria-keyshortcuts="N">
              Nein
            </Button>
          </div>
          {!compact ? (
            <p className="mw-small mw-muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Tastatur: <kbd className="mw-kbd">J</kbd> Ja · <kbd className="mw-kbd">N</kbd> Nein · <kbd className="mw-kbd">⌫</kbd> zurück
            </p>
          ) : null}
        </div>
      ) : null}

      {result.state.status === 'outcome' ? (
        <div className="mw-repair-outcome" key={result.state.outcome.id}>
          <div className="mw-repair-step__eyebrow">
            <Icon name="target" size={14} /> Ergebnis der Diagnose
          </div>
          <h3 className="mw-repair-outcome__text" ref={headingRef} tabIndex={-1}>
            {result.state.outcome.text}
          </h3>
          {compact ? (
            <ButtonLink to={diagnosePath(fault.id, answers)} variant="primary" size="sm" icon="box">
              Ergebnis mit Ersatzteilen & Prüfungen öffnen
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      {result.state.status === 'broken' ? (
        <Alert tone="danger" role="alert">
          Der Diagnoseschritt „{result.state.from}“ verweist auf ein unbekanntes Ziel („{result.state.missingId}“). Bitte neu starten oder einen Schritt zurückgehen.
        </Alert>
      ) : null}
      {result.state.status === 'cycle' ? (
        <Alert tone="danger" role="alert">
          Der Diagnosebaum führt im Kreis (Schritt „{result.state.stepId}“). Bitte neu starten.
        </Alert>
      ) : null}

      <div className="mw-row mw-repair-wizard__controls">
        <Button size="sm" variant="ghost" icon="chevron-left" onClick={undo} disabled={!answers.length}>
          Zurück
        </Button>
        <Button size="sm" variant="ghost" icon="reset" onClick={restart} disabled={!answers.length}>
          Neu starten
        </Button>
      </div>

      {result.state.status === 'outcome' && renderOutcome ? renderOutcome(result.state.outcome) : null}
    </div>
  );
}

/** Speichert Abschluss (Fortschritt) und protokolliert die Diagnose – nur angemeldet */
export function useDiagnosisTracking(faultId: string) {
  const { user, settings } = useAuth();
  const [saved, setSaved] = useState(false);
  const started = useRef(false);
  return {
    saved,
    onStart: () => {
      if (started.current || !user || settings?.trackHistory === false) return;
      started.current = true;
      api.me.recordHistory(faultId, 'repair', 'diagnosis').catch(() => undefined);
    },
    onOutcome: () => {
      if (!user) return;
      api.me
        .setProgress(faultId, 'completed')
        .then(() => setSaved(true))
        .catch(() => undefined);
    },
  };
}

// ------------------------------------------------------------------ Ressourcen nach der Diagnose
function ResourceGroup({ title, icon, items, empty, renderFooter }: { title: string; icon: string; items: EntitySummary[]; empty: string; renderFooter?: (e: EntitySummary) => ReactNode }) {
  return (
    <section className="mw-repair-resources__group" aria-label={title}>
      <h3 className="mw-repair-resources__title">
        <Icon name={icon} size={16} /> {title}
      </h3>
      {items.length ? (
        <div className="mw-grid" style={{ '--mw-grid-min': '220px' } as CSSProperties}>
          {items.map((e) => (
            <EntityCard key={e.id} entity={e} compact footer={renderFooter?.(e)} />
          ))}
        </div>
      ) : (
        <p className="mw-small mw-muted">{empty}</p>
      )}
    </section>
  );
}

export function RepairResourcesView({ fault }: { fault: EntityDetail<FaultData> }) {
  const res = useRepairResources(fault);
  if (res.loading && !res.data) return <Loading label="Ersatzteile, Prüfverfahren und Unterlagen werden geladen …" />;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  const r = res.data!;
  const fitsFor = new Map(r.fittingParts.map((p) => [p.part.id, p.fitsFor]));
  return (
    <div className="mw-repair-resources">
      <ResourceGroup
        title="Ersatzteile"
        icon="box"
        items={[...r.directParts, ...r.fittingParts.map((p) => p.part)]}
        empty="Keine Ersatzteile verknüpft."
        renderFooter={(e) => {
          const ff = fitsFor.get(e.id);
          return ff ? (
            <span className="mw-small mw-muted">passend für {ff.map((a) => a.title).join(', ')}</span>
          ) : (
            <Badge tone="accent" icon="check">
              empfohlen
            </Badge>
          );
        }}
      />
      <ResourceGroup title="Prüfungen nach der Instandsetzung" icon="clipboard" items={r.tests} empty="Keine Prüfverfahren verknüpft. Herstellervorgaben beachten." />
      <ResourceGroup title="Dokumentation & Serviceunterlagen" icon="file" items={r.documents} empty="Keine Dokumente verknüpft." />
      {r.learning.length ? <ResourceGroup title="Weiterlernen" icon="graduation" items={r.learning} empty="" /> : null}
    </div>
  );
}
