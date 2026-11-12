import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { MODULES, entityPath, type LearningModuleData, type TestProcedureData } from '@medtech/core';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  EntityCard,
  EntityGrid,
  ErrorState,
  Icon,
  Loading,
  ModuleHero,
  ProgressBar,
  QualityBadges,
  Section,
  Stat,
  useUi,
} from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { useDocumentTitle, useEntityList, useRequireLogin } from '../../lib/hooks.ts';
import {
  LEVEL_LABELS,
  LEVEL_ORDER,
  PROCEDURE_KIND_SHORT,
  filterByLevel,
  formatDuration,
  groupByKind,
  progressSummary,
  type LearningLevel,
} from './academy-logic.ts';
import { LevelBadge, ProgressBadge, useDetailsOfType, useProgress } from './shared.tsx';

const base = MODULES.academy.path;
type LevelFilter = LearningLevel | 'alle';

export function Landing() {
  useDocumentTitle(MODULES.academy.name);
  return (
    <div className="mw-container mw-page">
      <ModuleHero module="academy" lead="Lernmodule, Abschlussquiz und interaktive Prüfprotokolle für STK, MTK und elektrische Sicherheit – verknüpft mit Wiki, Simulator und Rechtsgrundlagen.">
        <div className="mw-row" style={{ marginTop: 16 }}>
          <a className="mw-btn mw-btn--secondary" href="#lernmodule">
            <Icon name="graduation" /> Lernmodule
          </a>
          <a className="mw-btn mw-btn--secondary" href="#pruefverfahren">
            <Icon name="clipboard" /> Prüfverfahren
          </a>
          <a className="mw-btn mw-btn--secondary" href="#rechtsgrundlagen">
            <Icon name="scale" /> Rechtsgrundlagen
          </a>
        </div>
      </ModuleHero>
      <LearningModulesSection />
      <ProceduresSection />
      <LegalSection />
      <PathsHint />
    </div>
  );
}

function LearningModulesSection() {
  const modules = useDetailsOfType<LearningModuleData>('learning_module');
  const progress = useProgress();
  const requireLogin = useRequireLogin();
  const [params, setParams] = useSearchParams();
  const raw = params.get('niveau');
  const level: LevelFilter = raw && (LEVEL_ORDER as string[]).includes(raw) ? (raw as LearningLevel) : 'alle';
  const items = useMemo(() => filterByLevel(modules.data ?? [], level), [modules.data, level]);
  const summary = progressSummary(
    (modules.data ?? []).map((m) => m.id),
    progress.data?.items ?? [],
  );

  const setLevel = (l: LevelFilter) => {
    const next = new URLSearchParams(params);
    if (l === 'alle') next.delete('niveau');
    else next.set('niveau', l);
    setParams(next, { replace: true });
  };

  return (
    <Section title="Lernmodule" icon="graduation" id="lernmodule">
      <Card className="mw-academy-progress-card">
        {progress.loggedIn ? (
          progress.loading && !progress.data ? (
            <Loading label="Lernfortschritt wird geladen …" />
          ) : (
            <div className="mw-academy-progress-card__inner">
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="mw-spread" style={{ marginBottom: 6 }}>
                  <strong>Dein Gesamtfortschritt</strong>
                  <span className="mw-small mw-muted">{summary.percent} %</span>
                </div>
                <ProgressBar value={summary.percent} label="Gesamtfortschritt Lernmodule" />
              </div>
              <div className="mw-row" style={{ gap: 24 }}>
                <Stat value={summary.completed} label="abgeschlossen" />
                <Stat value={summary.started} label="begonnen" />
                <Stat value={summary.total} label="Lernmodule" />
              </div>
            </div>
          )
        ) : (
          <div className="mw-spread">
            <span>
              <Icon name="info" size={16} /> Lernen und Quiz funktionieren auch ohne Konto. Um deinen Lernfortschritt zu speichern, melde dich an.
            </span>
            <button type="button" className="mw-btn mw-btn--secondary mw-btn--sm" onClick={() => requireLogin()}>
              <Icon name="user" size={14} /> Anmelden
            </button>
          </div>
        )}
      </Card>

      <div className="mw-academy-filter" role="group" aria-label="Nach Niveau filtern">
        {(['alle', ...LEVEL_ORDER] as LevelFilter[]).map((l) => (
          <button key={l} type="button" className={`mw-academy-chip${level === l ? ' is-active' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)}>
            {l === 'alle' ? 'Alle Niveaus' : LEVEL_LABELS[l]}
            {modules.data ? <span className="mw-academy-chip__count">{filterByLevel(modules.data, l).length}</span> : null}
          </button>
        ))}
      </div>

      {modules.loading && !modules.data ? (
        <Loading />
      ) : modules.error ? (
        <ErrorState error={modules.error} onRetry={modules.reload} />
      ) : !items.length ? (
        <EmptyState title="Keine Lernmodule für dieses Niveau." icon="graduation" />
      ) : (
        <div className="mw-grid" style={{ '--mw-grid-min': '280px' } as CSSProperties}>
          {items.map((m) => (
            <EntityCard
              key={m.id}
              entity={m}
              footer={
                <>
                  <LevelBadge level={m.data.level} />
                  <Badge icon="history">{formatDuration(m.data.durationMinutes)}</Badge>
                  <ProgressBadge entry={progress.byId.get(m.id)} />
                </>
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function ProceduresSection() {
  const procs = useDetailsOfType<TestProcedureData>('test_procedure');
  const groups = useMemo(() => groupByKind(procs.data ?? []), [procs.data]);
  const { Link } = useUi();
  return (
    <Section title="Prüfverfahren" icon="clipboard" id="pruefverfahren">
      <p className="mw-muted" style={{ marginTop: 0 }}>
        Prüfabläufe mit Grenzwerten und Quellen. Das interaktive Prüfprotokoll hilft beim strukturierten Durchführen und Dokumentieren – es ersetzt keine Herstellerprüfanweisung.
      </p>
      {procs.loading && !procs.data ? (
        <Loading />
      ) : procs.error ? (
        <ErrorState error={procs.error} onRetry={procs.reload} />
      ) : !groups.length ? (
        <EmptyState title="Noch keine Prüfverfahren vorhanden." icon="clipboard" />
      ) : (
        <div className="mw-stack" style={{ gap: 20 }}>
          {groups.map((g) => (
            <div key={g.kind}>
              <h3 className="mw-academy-group-title">
                {g.label} <span className="mw-muted mw-small">({g.items.length})</span>
              </h3>
              <ul className="mw-academy-proc-list">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <Card className="mw-academy-proc">
                      <div className="mw-academy-proc__main">
                        <Link to={entityPath(p.id)} className="mw-academy-proc__title">
                          {p.title}
                        </Link>
                        <p className="mw-small mw-muted">{p.summary}</p>
                        <div className="mw-row" style={{ gap: 6 }}>
                          <Badge tone="info">{PROCEDURE_KIND_SHORT[p.data.kind]}</Badge>
                          <Badge icon="layers">{p.data.steps.length} Prüfschritte</Badge>
                          {p.data.interval ? <Badge icon="history" title={p.data.interval}>{shorten(p.data.interval, 40)}</Badge> : null}
                          <QualityBadges flags={p.flags} reviewStatus={p.reviewStatus} />
                        </div>
                      </div>
                      <div className="mw-academy-proc__actions">
                        <ButtonLink to={`${base}/pruefung/${p.slug}`} variant="primary" size="sm" icon="clipboard">
                          Prüfprotokoll ausfüllen
                        </ButtonLink>
                        <ButtonLink to={entityPath(p.id)} size="sm" icon="book">
                          Details
                        </ButtonLink>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function shorten(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()} …` : s;
}

function LegalSection() {
  const legal = useEntityList({ type: 'legal_reference', limit: 100 });
  return (
    <Section
      title="Rechtsgrundlagen"
      icon="scale"
      id="rechtsgrundlagen"
      actions={
        <ButtonLink to={`${MODULES.wiki.path}?typ=legal_reference`} size="sm" variant="ghost">
          Im Wiki öffnen
        </ButtonLink>
      }
    >
      <p className="mw-muted" style={{ marginTop: 0 }}>
        Verordnungen, Gesetze und Normen, auf denen Prüfungen und Betreiberpflichten beruhen. Kennzeichen zeigen, wann der Rechtsstand zuletzt geprüft wurde oder eine Überprüfung fällig ist.
      </p>
      {legal.loading && !legal.data ? (
        <Loading />
      ) : legal.error ? (
        <ErrorState error={legal.error} onRetry={legal.reload} />
      ) : (
        <EntityGrid items={legal.data?.items ?? []} min={240} compact empty="Noch keine Rechtsgrundlagen erfasst." />
      )}
    </Section>
  );
}

function PathsHint() {
  const { user } = useAuth();
  return (
    <Section title="Lernpfade" icon="route">
      <Card className="mw-academy-paths">
        <div>
          <p style={{ marginTop: 0 }}>
            Welche Lernmodule und Prüfkompetenzen brauchst du für dein Berufsziel? Im <strong>{MODULES.career.name}</strong> findest du Berufsbilder der Medizintechnik mit den
            zugehörigen Qualifikationen – und die passenden Lernmodule der Prüfakademie.
          </p>
          {user ? null : <p className="mw-small mw-muted">Tipp: Mit Konto siehst du deinen Fortschritt auch auf deiner persönlichen Startseite.</p>}
        </div>
        <ButtonLink to={MODULES.career.path} variant="primary" icon="briefcase">
          Zum {MODULES.career.shortName}
        </ButtonLink>
      </Card>
    </Section>
  );
}
