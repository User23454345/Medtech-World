import { useMemo } from 'react';
import type { EntityDetail, JobProfileData } from '@medtech/core';
import { Alert, Button, EntityChip, Icon, Loading } from '@medtech/ui';
import { useRequireLogin } from '../../lib/hooks.ts';
import { computeReadiness, orderLearningPath, relevantJobProfiles, requiredItems, requiredLearningModules } from './career-logic.ts';
import { LearningPath, NextStep, ReadinessMeter } from './components.tsx';
import { useCareerProgress, usePrerequisites } from './data.ts';
import './career.css';

function FactList({ title, icon, items }: { title: string; icon: string; items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="mw-career-facts__group">
      <h3 className="mw-career-facts__title">
        <Icon name={icon} size={16} /> {title}
      </h3>
      <ul className="mw-career-facts__list">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Hauptpanel auf der Detailseite eines Berufsbilds */
export function JobProfilePanel({ entity }: { entity: EntityDetail }) {
  const data = (entity.data ?? {}) as Partial<JobProfileData>;
  const progress = useCareerProgress();
  const requireLogin = useRequireLogin();
  const items = useMemo(() => requiredItems(entity.relations), [entity.relations]);
  const modules = useMemo(() => requiredLearningModules(entity.relations), [entity.relations]);
  const prereq = usePrerequisites(modules.map((m) => m.id));
  const ordered = useMemo(() => orderLearningPath(items, (id) => prereq.data?.[id] ?? []), [items, prereq.data]);
  const orderedModules = ordered.filter((i) => i.type === 'learning_module');
  const readiness = computeReadiness(orderedModules, progress.byId);

  return (
    <div className="mw-career-panel mw-stack">
      <div className="mw-career-facts">
        <FactList title="Typische Aufgaben" icon="wrench" items={data.tasks} />
        <FactList title="Qualifikationen und Zugang" icon="graduation" items={data.qualifications} />
        <FactList title="Arbeitsorte" icon="factory" items={data.workplaces} />
        <FactList title="Entwicklungsmöglichkeiten" icon="route" items={data.careerPaths} />
      </div>

      <div className="mw-career-panel__path">
        <h3 className="mw-career-facts__title">
          <Icon name="route" size={16} /> Lernpfad
        </h3>
        <p className="mw-small mw-muted" style={{ marginTop: 0 }}>
          Geforderte Kompetenzen in empfohlener Reihenfolge: zuerst die Lernmodule (unter Berücksichtigung ihrer Voraussetzungen), dann Prüfabläufe, Geräte und Fachbegriffe.
        </p>
        {progress.loggedIn ? (
          progress.loading && !progress.data ? (
            <Loading label="Lernfortschritt wird geladen …" />
          ) : (
            <div className="mw-career-panel__readiness">
              <h4 className="mw-career-panel__subtitle">Kompetenzcheck</h4>
              <ReadinessMeter readiness={readiness} title={entity.title} />
              <NextStep readiness={readiness} />
            </div>
          )
        ) : (
          <Alert tone="info" icon="user">
            <div className="mw-spread">
              <span>Melde dich an, um deinen Fortschritt im Lernpfad und deine Bereitschaft für dieses Berufsbild zu sehen.</span>
              <Button size="sm" variant="primary" onClick={() => requireLogin()}>
                Anmelden
              </Button>
            </div>
          </Alert>
        )}
        {progress.error ? <Alert tone="warn">Der Lernfortschritt konnte nicht geladen werden.</Alert> : null}
        <LearningPath items={ordered} progress={progress.byId} loggedIn={progress.loggedIn} />
      </div>
    </div>
  );
}

/** Seitenleiste auf Lernmodulen: Für welche Berufsbilder ist das Modul gefordert? */
export function RelevantJobsPanel({ entity }: { entity: EntityDetail }) {
  const jobs = relevantJobProfiles(entity.relations);
  if (!jobs.length) return <p className="mw-small mw-muted" style={{ margin: 0 }}>Dieses Lernmodul ist derzeit keinem Berufsbild als Pflichtkompetenz zugeordnet.</p>;
  return (
    <div className="mw-stack" style={{ gap: 8 }}>
      <p className="mw-small mw-muted" style={{ margin: 0 }}>
        Dieses Lernmodul gehört zum Lernpfad von {jobs.length === 1 ? 'einem Berufsbild' : `${jobs.length} Berufsbildern`}:
      </p>
      <div className="mw-row" style={{ gap: 6 }}>
        {jobs.map((j) => (
          <EntityChip key={j.id} entity={j} />
        ))}
      </div>
    </div>
  );
}
