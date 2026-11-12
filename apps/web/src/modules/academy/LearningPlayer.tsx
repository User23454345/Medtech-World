import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { MODULES, entityPath, type EntityDetail, type LearningModuleData } from '@medtech/core';
import { Alert, Badge, Breadcrumbs, Button, ButtonLink, Card, ErrorState, Icon, Loading, Markdown, ProgressBar, QualityNotices } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { invalidateCache, useDocumentTitle, useEntity, useRecordVisit, useRequireLogin } from '../../lib/hooks.ts';
import { FavoriteButton, EntityTitleScope } from '../../shell/EntityPage.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import { clampIndex, formatDuration, quizQuestionIds, shouldMarkStarted, stripNumbering, type PublicQuizData } from './academy-logic.ts';
import { QuizRunner } from './Quiz.tsx';
import { LevelBadge, ProgressBadge, useEntitiesById, useProgress } from './shared.tsx';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function LearningPlayer() {
  const { slug } = useParams();
  const valid = SLUG.test(slug ?? '');
  const { data, error, loading, reload } = useEntity<LearningModuleData>(valid ? `learning_module:${slug}` : null);
  if (!valid) return <NotFound what="Lernmodul" />;
  if (loading && !data)
    return (
      <div className="mw-container mw-page">
        <Loading />
      </div>
    );
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound what="Lernmodul" />;
    return (
      <div className="mw-container mw-page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return null;
  return (
    <EntityTitleScope entity={data}>
      <Player key={data.id} entity={data} />
    </EntityTitleScope>
  );
}

const storeKey = (id: string) => `mw-academy-sections:${id}`;

function loadDone(id: string, count: number): boolean[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(id)) ?? '[]') as unknown;
    return Array.from({ length: count }, (_, i) => Array.isArray(raw) && raw[i] === true);
  } catch {
    return Array.from({ length: count }, () => false);
  }
}

function Player({ entity }: { entity: EntityDetail<LearningModuleData> }) {
  const d = entity.data;
  useDocumentTitle(`${entity.title} – Lernen`);
  useRecordVisit(entity.id, 'academy', 'view');
  const { user, effectiveSettings } = useAuth();
  const requireLogin = useRequireLogin();
  const progress = useProgress();
  const entry = progress.byId.get(entity.id);

  const sectionCount = d.sections.length;
  const quizStep = sectionCount; // letzter Schritt = Abschlussquiz
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<boolean[]>(() => loadDone(entity.id, sectionCount));
  const [saveError, setSaveError] = useState<unknown>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const quizIds = quizQuestionIds(entity.relations);
  const quiz = useEntitiesById<PublicQuizData>(quizIds);

  const doneCount = done.filter(Boolean).length;
  const percent = sectionCount ? Math.round((doneCount / sectionCount) * 100) : 0;

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(entity.id), JSON.stringify(done));
    } catch {
      /* Speicher nicht verfügbar – Fortschritt nur für diese Sitzung */
    }
  }, [done, entity.id]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ behavior: effectiveSettings.reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [step, effectiveSettings.reducedMotion]);

  const go = (i: number) => setStep(clampIndex(i, sectionCount + 1));

  async function completeSection() {
    setDone((prev) => prev.map((v, i) => (i === step ? true : v)));
    if (user && progress.data && shouldMarkStarted(entry)) {
      try {
        await api.me.setProgress(entity.id, 'started');
        invalidateCache('me:');
        progress.reload();
      } catch (e) {
        setSaveError(e);
      }
    }
    go(step + 1);
  }

  const section = step < sectionCount ? d.sections[step] : null;

  return (
    <div className="mw-container mw-page mw-academy-player">
      <Breadcrumbs
        items={[
          { label: MODULES.academy.shortName, to: MODULES.academy.path },
          { label: 'Lernmodule', to: `${MODULES.academy.path}#lernmodule` },
          { label: entity.title },
        ]}
      />
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <Badge icon="graduation">Lernmodul</Badge>
          <LevelBadge level={d.level} />
          <Badge icon="history">{formatDuration(d.durationMinutes)}</Badge>
          <ProgressBadge entry={entry} />
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{entity.title}</h1>
          <div className="mw-row">
            <FavoriteButton entityId={entity.id} />
            <ButtonLink to={entityPath(entity.id)} icon="book">
              Details
            </ButtonLink>
          </div>
        </div>
        <p className="mw-page-header__lead">{entity.summary}</p>
      </header>

      <QualityNotices flags={entity.flags} />

      {!user ? (
        <Alert tone="info">
          <div className="mw-spread">
            <span>Du lernst als Gast. Abschnitte und Quiz stehen dir vollständig zur Verfügung – dein Lernfortschritt wird jedoch nur gespeichert, wenn du angemeldet bist.</span>
            <Button size="sm" icon="user" onClick={() => requireLogin()}>
              Anmelden
            </Button>
          </div>
        </Alert>
      ) : null}

      <details className="mw-academy-objectives-box" open={step === 0}>
        <summary>
          <Icon name="target" size={16} /> Lernziele ({d.objectives.length})
        </summary>
        <ul className="mw-academy-objectives">
          {d.objectives.map((o, i) => (
            <li key={i}>
              <Icon name="check" size={14} /> <span>{o}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="mw-academy-player__layout">
        <nav className="mw-academy-stepper" aria-label="Abschnitte des Lernmoduls">
          <div className="mw-academy-stepper__progress">
            <div className="mw-spread mw-small">
              <span>Fortschritt</span>
              <span>
                {doneCount}/{sectionCount} Abschnitte
              </span>
            </div>
            <ProgressBar value={percent} label={`${doneCount} von ${sectionCount} Abschnitten abgeschlossen`} />
          </div>
          <ol>
            {d.sections.map((s, i) => (
              <li key={i}>
                <button type="button" className={`mw-academy-step${i === step ? ' is-current' : ''}${done[i] ? ' is-done' : ''}`} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                  <span className="mw-academy-step__num" aria-hidden>
                    {done[i] ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  <span className="mw-academy-step__label">
                    {stripNumbering(s.title)}
                    {done[i] ? <span className="mw-visually-hidden"> (abgeschlossen)</span> : null}
                  </span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={`mw-academy-step${step === quizStep ? ' is-current' : ''}${entry?.status === 'completed' ? ' is-done' : ''}`} aria-current={step === quizStep ? 'step' : undefined} onClick={() => go(quizStep)}>
                <span className="mw-academy-step__num" aria-hidden>
                  <Icon name="question" size={12} />
                </span>
                <span className="mw-academy-step__label">Abschlussquiz</span>
              </button>
            </li>
          </ol>
        </nav>

        <div className="mw-academy-player__content">
          {section ? (
            <Card as="article" className="mw-academy-section">
              <div className="mw-small mw-muted">
                Abschnitt {step + 1} von {sectionCount}
              </div>
              <h2 ref={headingRef} tabIndex={-1} className="mw-academy-section__title">
                {stripNumbering(section.title)}
              </h2>
              <Markdown source={section.body} />
              {saveError ? <ErrorState error={saveError} /> : null}
              <div className="mw-academy-section__nav">
                <Button icon="chevron-left" onClick={() => go(step - 1)} disabled={step === 0}>
                  Zurück
                </Button>
                <div className="mw-row">
                  {done[step] ? (
                    <Button variant="primary" onClick={() => go(step + 1)}>
                      {step + 1 === sectionCount ? 'Zum Abschlussquiz' : 'Weiter'} <Icon name="chevron-right" size={16} />
                    </Button>
                  ) : (
                    <Button variant="primary" icon="check" onClick={completeSection}>
                      Abschnitt abgeschlossen
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card as="section" className="mw-academy-section">
              <h2 ref={headingRef} tabIndex={-1} className="mw-academy-section__title">
                Abschlussquiz
              </h2>
              {doneCount < sectionCount ? (
                <Alert tone="warn">
                  Du hast {doneCount} von {sectionCount} Abschnitten abgeschlossen. Du kannst das Quiz trotzdem bearbeiten.
                </Alert>
              ) : null}
              {quizIds.length === 0 ? (
                <p className="mw-muted">Zu diesem Lernmodul sind noch keine Quizfragen hinterlegt.</p>
              ) : quiz.loading && !quiz.data ? (
                <Loading label="Quizfragen werden geladen …" />
              ) : quiz.error ? (
                <ErrorState error={quiz.error} onRetry={quiz.reload} />
              ) : (
                <QuizRunner questions={quiz.data ?? []} contextId={entity.id} title="Dein Ergebnis" onEvaluated={() => progress.reload()} />
              )}
              <div className="mw-academy-section__nav">
                <Button icon="chevron-left" onClick={() => go(step - 1)} disabled={sectionCount === 0}>
                  Zurück zum Inhalt
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
