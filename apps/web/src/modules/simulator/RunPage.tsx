import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { MODULES, entityPath, type EntityDetail, type SimulationData } from '@medtech/core';
import { Alert, Badge, Breadcrumbs, Button, ButtonLink, Card, EmptyState, EntityChip, ErrorState, Icon, Loading, Markdown, QualityNotices, Section, Select, TypeBadge } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useDocumentTitle, useEntity, useRecordVisit, useRequireLogin } from '../../lib/hooks.ts';
import { EntityTitleScope, FavoriteButton } from '../../shell/EntityPage.tsx';
import { getEngine, normalizeParams, type Engine, type ParamValue, type Params, type Timebase } from './engines/index.ts';
import { fmtDuration } from './engines/infusion-pump.ts';
import { LiveChart } from './components/LiveChart.tsx';
import { ParamControls } from './components/ParamControls.tsx';
import { AlarmBanner, ChecksTable, Readouts } from './components/Readouts.tsx';
import { resolveInitialScenario, type Scenario } from './logic.ts';
import './simulator.css';

export function RunPage() {
  const { slug } = useParams();
  const valid = /^[a-z0-9-]+$/.test(slug ?? '');
  const { data, error, loading, reload } = useEntity<SimulationData>(valid ? `simulation:${slug}` : null);
  if (!valid) return <NotFound />;
  if (loading && !data) return <div className="mw-container mw-page"><Loading /></div>;
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound />;
    return <div className="mw-container mw-page"><ErrorState error={error} onRetry={reload} /></div>;
  }
  if (!data) return <NotFound />;
  return (
    <EntityTitleScope entity={data}>
      <SimulationRun entity={data} />
    </EntityTitleScope>
  );
}

function NotFound() {
  return (
    <div className="mw-container mw-page">
      <EmptyState title="Simulation nicht gefunden" icon="pulse">
        <p>Die angeforderte Simulation existiert nicht (mehr).</p>
        <ButtonLink to={MODULES.simulator.path} icon="chevron-left">Zur Übersicht</ButtonLink>
      </EmptyState>
    </div>
  );
}

function SimulationRun({ entity }: { entity: EntityDetail<SimulationData> }) {
  useDocumentTitle(entity.title);
  useRecordVisit(entity.id, 'simulator', 'simulation');
  const engine = getEngine(entity.data?.engine);
  const sim = MODULES.simulator;

  return (
    <div className="mw-container mw-page mw-simulator">
      <Breadcrumbs items={[{ label: sim.shortName, to: sim.path }, { label: entity.title }]} />
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <TypeBadge type="simulation" />
          {engine ? <Badge tone="info">Modell: {engine.label}</Badge> : null}
          {entity.demo ? <Badge tone="demo">Demo-Inhalt</Badge> : null}
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{entity.title}</h1>
          <div className="mw-row">
            <FavoriteButton entityId={entity.id} />
            <ButtonLink to={entityPath(entity.id)} icon="book" variant="ghost">
              Details &amp; Quellen
            </ButtonLink>
          </div>
        </div>
        <p className="mw-page-header__lead">{entity.summary}</p>
      </header>
      <QualityNotices flags={entity.flags} />
      {engine ? (
        <Simulator key={entity.id} entity={entity} engine={engine} />
      ) : (
        <EmptyState title="Simulationsmodell nicht verfügbar" icon="alert">
          <p>
            Diese Simulation verwendet das Modell „{String(entity.data?.engine ?? 'unbekannt')}“, das der Simulator (noch) nicht kennt. Die Beschreibung findest du auf der{' '}
            <Link to={entityPath(entity.id)}>Detailseite</Link>.
          </p>
        </EmptyState>
      )}
    </div>
  );
}

function initialTime(engine: Engine) {
  return engine.timebase && !engine.timebase.startsAtZero ? engine.timebase.window : 0;
}

function Simulator({ entity, engine }: { entity: EntityDetail<SimulationData>; engine: Engine }) {
  const { user, effectiveSettings } = useAuth();
  const reducedMotion = effectiveSettings.reducedMotion;
  const scenarios = useMemo(() => entity.data?.scenarios ?? [], [entity]);
  const [search, setSearch] = useSearchParams();
  const initial = useMemo(() => resolveInitialScenario(scenarios, search.get('szenario'), search.get('fehler')), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [scenarioId, setScenarioId] = useState<string>(initial?.id ?? '');
  const scenario = scenarios.find((s) => s.id === scenarioId);
  const [params, setParams] = useState<Params>(() => normalizeParams(engine, initial?.params));
  const [modified, setModified] = useState(false);
  const [running, setRunning] = useState(!reducedMotion);
  const timeRef = useRef(initialTime(engine));
  const [t, setT] = useState(timeRef.current);
  const [version, setVersion] = useState(0);
  const tb = engine.timebase;
  const [speed, setSpeed] = useState(tb?.speed ?? 1);

  // ?fehler= in ?szenario= überführen (teilbare, eindeutige URL)
  useEffect(() => {
    if (search.get('fehler') && initial) {
      const next = new URLSearchParams(search);
      next.delete('fehler');
      next.set('szenario', initial.id);
      setSearch(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reducedMotion) setRunning(false);
  }, [reducedMotion]);

  const setTime = useCallback((v: number) => {
    timeRef.current = v;
    setT(v);
    setVersion((x) => x + 1);
  }, []);

  const applyScenario = (s: Scenario | undefined) => {
    setScenarioId(s?.id ?? '');
    setParams(normalizeParams(engine, s?.params));
    setModified(false);
    setTime(initialTime(engine));
    const next = new URLSearchParams(search);
    next.delete('fehler');
    if (s) next.set('szenario', s.id);
    else next.delete('szenario');
    setSearch(next, { replace: true });
  };

  const onParam = (key: string, value: ParamValue) => {
    setParams((p) => normalizeParams(engine, { ...p, [key]: value }));
    setModified(true);
  };

  const reset = () => applyScenario(scenario);

  const result = useMemo(() => engine.simulate(params, t), [engine, params, t]);
  const faultItem = scenario?.fault ? findRelated(entity, scenario.fault) : undefined;

  return (
    <div className="mw-simulator-layout">
      <div className="mw-simulator-main">
        <Card className="mw-simulator-scenario">
          <div className="mw-simulator-scenario__row">
            <div className="mw-field" style={{ flex: '1 1 260px' }}>
              <label className="mw-label" htmlFor="mw-sim-scenario">
                Szenario
              </label>
              <Select id="mw-sim-scenario" value={scenarioId} onChange={(e) => applyScenario(scenarios.find((s) => s.id === e.target.value))}>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
                {scenarios.length === 0 ? <option value="">Standardwerte</option> : null}
              </Select>
            </div>
            <div className="mw-row mw-simulator-transport" role="group" aria-label="Simulationssteuerung">
              {tb ? (
                <Button
                  variant="primary"
                  icon={running ? 'pause' : 'play'}
                  onClick={() => setRunning((r) => !r)}
                  disabled={reducedMotion}
                  aria-pressed={running}
                  title={reducedMotion ? 'Animation wegen „Reduzierte Bewegung“ deaktiviert' : undefined}
                >
                  {running ? 'Pause' : 'Start'}
                </Button>
              ) : null}
              {tb && !running ? <StepButtons tb={tb} onStep={(dt) => setTime(timeRef.current + dt)} /> : null}
              <Button icon="reset" onClick={reset}>
                Zurücksetzen
              </Button>
            </div>
          </div>
          {scenario ? (
            <div className="mw-simulator-scenario__desc">
              <p>
                {scenario.description}
                {modified ? (
                  <Badge tone="info" style={{ marginLeft: 8 }}>
                    Parameter verändert
                  </Badge>
                ) : null}
              </p>
              {scenario.fault ? (
                <p className="mw-row mw-small" style={{ gap: 6 }}>
                  <span className="mw-muted">Zugehöriges Fehlerbild:</span>
                  <EntityChip entity={faultItem ?? { id: scenario.fault, type: 'fault', title: entity.linkedTitles?.[scenario.fault] ?? scenario.fault, demo: false }} />
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <AlarmBanner alarms={result.alarms} />

        {tb ? (
          <Card flush className="mw-simulator-screen">
            <div className="mw-simulator-screen__bar">
              <span>
                <Icon name="pulse" size={14} /> {engine.label}
              </span>
              <span aria-live="off">
                t = {tb.axisUnit === 'min' ? fmtDuration(t) : `${t.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`}
                {running ? '' : ' · angehalten'}
              </span>
            </div>
            <LiveChart engine={engine as Engine & { timebase: Timebase }} params={params} running={running && !reducedMotion} speed={speed} timeRef={timeRef} onTick={setT} version={version} />
            {reducedMotion ? <p className="mw-small mw-muted mw-simulator-screen__note">Reduzierte Bewegung ist aktiv: Die Kurve wird statisch dargestellt. Mit den Schritt-Schaltflächen lässt sich die Zeit weiterschalten.</p> : null}
            {tb.speedOptions && !reducedMotion ? (
              <div className="mw-row mw-small mw-simulator-screen__note">
                <label htmlFor="mw-sim-speed">Zeitraffer</label>
                <Select id="mw-sim-speed" value={String(speed)} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: 'auto' }}>
                  {tb.speedOptions.map((s) => (
                    <option key={s} value={s}>
                      {s === 1 ? 'Echtzeit' : `${s}×`}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </Card>
        ) : null}

        {result.checks ? (
          <Section title="Prüfergebnis" icon="shield">
            <ChecksTable result={result} />
          </Section>
        ) : null}

        {result.checks ? null : (
          <Section title="Anzeige" icon="target">
            <Readouts readouts={result.readouts} />
          </Section>
        )}

        <Section title="Was passiert hier?" icon="info">
          <div className="mw-simulator-explanation">
            <Markdown source={result.explanation} />
          </div>
          <p className="mw-small mw-muted">Vereinfachtes Lehrmodell – nicht für klinische oder technische Entscheidungen verwenden. Maßgeblich sind Gebrauchsanweisung, Normen und Herstellerunterlagen.</p>
        </Section>
      </div>

      <aside className="mw-stack mw-simulator-aside" aria-label="Parameter und Lernziele">
        <Card>
          <h2 className="mw-card__title">
            <Icon name="settings" /> Parameter
          </h2>
          <ParamControls defs={engine.params} params={params} onChange={onParam} />
        </Card>
        <LearningCard entity={entity} />
        <ProgressCard entityId={entity.id} loggedIn={!!user} />
      </aside>
    </div>
  );
}

function StepButtons({ tb, onStep }: { tb: Timebase; onStep: (dt: number) => void }) {
  const small = tb.window / 6;
  const fmtStep = (s: number) => (tb.axisUnit === 'min' ? `${Math.round(s / 60)} min` : `${s.toLocaleString('de-DE')} s`);
  return (
    <>
      <Button size="sm" onClick={() => onStep(small)} aria-label={`Zeit um ${fmtStep(small)} weiterschalten`}>
        +{fmtStep(small)}
      </Button>
      <Button size="sm" onClick={() => onStep(tb.window)} aria-label={`Zeit um ${fmtStep(tb.window)} weiterschalten`}>
        +{fmtStep(tb.window)}
      </Button>
    </>
  );
}

function findRelated(entity: EntityDetail, id: string) {
  for (const g of entity.relations) {
    const it = g.items.find((i) => i.id === id);
    if (it) return it;
  }
  return undefined;
}

function LearningCard({ entity }: { entity: EntityDetail<SimulationData> }) {
  const goals = entity.data?.learningGoals ?? [];
  if (!goals.length) return null;
  return (
    <Card>
      <h2 className="mw-card__title">
        <Icon name="graduation" /> Lernziele
      </h2>
      <ul className="mw-simulator-goals">
        {goals.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </Card>
  );
}

function ProgressCard({ entityId, loggedIn }: { entityId: string; loggedIn: boolean }) {
  const requireLogin = useRequireLogin();
  const [status, setStatus] = useState<'started' | 'completed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    api.me
      .progress()
      .then(async ({ items }) => {
        const entry = items.find((i) => i.entityId === entityId);
        if (entry) {
          if (!cancelled) setStatus(entry.status);
          return;
        }
        await api.me.setProgress(entityId, 'started');
        if (!cancelled) setStatus('started');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entityId, loggedIn]);

  const complete = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.me.setProgress(entityId, 'completed');
      setStatus('completed');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mw-card__title">
        <Icon name="history" /> Lernfortschritt
      </h2>
      {!loggedIn ? (
        <div className="mw-stack" style={{ gap: 8 }}>
          <p className="mw-small mw-muted" style={{ margin: 0 }}>
            Melde dich an, um deinen Fortschritt und die Lernhistorie modulübergreifend zu speichern.
          </p>
          <Button size="sm" icon="user" onClick={() => requireLogin()}>
            Anmelden
          </Button>
        </div>
      ) : (
        <div className="mw-stack" style={{ gap: 8 }}>
          <p className="mw-small" style={{ margin: 0 }}>
            Status: {status === 'completed' ? <Badge tone="ok" icon="check">abgeschlossen</Badge> : status === 'started' ? <Badge tone="info">begonnen</Badge> : '…'}
          </p>
          {status !== 'completed' ? (
            <Button size="sm" icon="check" onClick={complete} disabled={busy}>
              Als abgeschlossen markieren
            </Button>
          ) : null}
          {err ? <Alert tone="danger">{err}</Alert> : null}
        </div>
      )}
    </Card>
  );
}
