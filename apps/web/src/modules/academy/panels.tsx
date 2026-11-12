import { MODULES, type EntityDetail, type LearningModuleData, type TestProcedureData } from '@medtech/core';
import { Badge, ButtonLink, EntityChip, Icon, ProgressBar } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { api } from '../../lib/api.ts';
import { PROCEDURE_KIND_SHORT, formatDuration, specsForStep, stripNumbering, type PublicQuizData } from './academy-logic.ts';
import { QuizRunner } from './Quiz.tsx';
import { LevelBadge, ProgressBadge, useProgress } from './shared.tsx';
import './academy.css';

const base = MODULES.academy.path;

/** Detailseite Lernmodul: Lernziele, Gliederung, Niveau, Fortschritt */
export function LearningModulePanel({ entity }: { entity: EntityDetail }) {
  const d = entity.data as LearningModuleData;
  const progress = useProgress();
  const entry = progress.byId.get(entity.id);
  return (
    <div className="mw-stack" style={{ gap: 16 }}>
      <div className="mw-row" style={{ gap: 8 }}>
        <LevelBadge level={d.level} />
        <Badge icon="history">{formatDuration(d.durationMinutes)}</Badge>
        <Badge icon="layers">{d.sections.length} Abschnitte</Badge>
        {progress.loggedIn ? entry ? <ProgressBadge entry={entry} /> : <Badge>Noch nicht begonnen</Badge> : null}
      </div>
      <div>
        <h3 className="mw-academy-subtitle">Lernziele</h3>
        <ul className="mw-academy-objectives">
          {d.objectives.map((o, i) => (
            <li key={i}>
              <Icon name="target" size={16} /> <span>{o}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mw-academy-subtitle">Gliederung</h3>
        <ol className="mw-academy-outline">
          {d.sections.map((s, i) => (
            <li key={i}>{stripNumbering(s.title)}</li>
          ))}
          <li>Abschlussquiz</li>
        </ol>
      </div>
      {d.prerequisites.length ? (
        <div>
          <h3 className="mw-academy-subtitle">Voraussetzungen</h3>
          <div className="mw-row" style={{ gap: 6 }}>
            {d.prerequisites.map((id) => (
              <EntityChip key={id} entity={{ id, type: id.split(':')[0] as 'learning_module', title: entity.linkedTitles[id] ?? id.split(':')[1]!, demo: false }} />
            ))}
          </div>
        </div>
      ) : null}
      {entry?.status === 'completed' && entry.score !== null ? <ProgressBar value={entry.score} label={`Quizergebnis ${entry.score} Prozent`} /> : null}
      <div className="mw-row">
        <ButtonLink to={`${base}/lernen/${entity.slug}`} variant="primary" icon="play">
          {entry ? 'Lernmodul fortsetzen' : 'Lernmodul starten'}
        </ButtonLink>
        {!progress.loggedIn ? <span className="mw-small mw-muted">Lernfortschritt wird nur für angemeldete Nutzer gespeichert.</span> : null}
      </div>
    </div>
  );
}

/** Detailseite Prüfverfahren: Ablauf, Grenzwerte, Dokumentation */
export function TestProcedurePanel({ entity }: { entity: EntityDetail }) {
  const d = entity.data as TestProcedureData;
  return (
    <div className="mw-stack" style={{ gap: 16 }}>
      <dl className="mw-academy-facts">
        <div>
          <dt>Prüfart</dt>
          <dd>
            <Badge tone="info" icon="clipboard">
              {PROCEDURE_KIND_SHORT[d.kind] ?? d.kind}
            </Badge>
          </dd>
        </div>
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
            <dd>
              <ul className="mw-academy-list">
                {d.equipment.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
      <div>
        <h3 className="mw-academy-subtitle">Prüfschritte</h3>
        <ol className="mw-academy-steps">
          {d.steps.map((s, i) => {
            const specs = specsForStep(s.title, entity.specs);
            return (
              <li key={i}>
                <strong>{s.title}</strong>
                <p>{s.description}</p>
                {s.limit || specs.length ? (
                  <div className="mw-academy-limits">
                    <Icon name="target" size={14} /> <span className="mw-visually-hidden">Grenzwert:</span>
                    {s.limit ? <span>{s.limit}</span> : null}
                    {specs.map((sp) => (
                      <span key={sp.key} className="mw-academy-limit" title={`Quelle: ${sp.source.title}`}>
                        {sp.label}: <strong>{String(sp.value)}{sp.unit ? ` ${sp.unit}` : ''}</strong>
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      {d.documentation.length ? (
        <div>
          <h3 className="mw-academy-subtitle">Dokumentation</h3>
          <ul className="mw-academy-list">
            {d.documentation.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mw-row">
        <ButtonLink to={`${base}/pruefung/${entity.slug}`} variant="primary" icon="clipboard">
          Prüfprotokoll ausfüllen
        </ButtonLink>
        <span className="mw-small mw-muted">Herstellerangaben haben Vorrang; Grenzwerte siehe technische Daten.</span>
      </div>
    </div>
  );
}

/** Detailseite Quizfrage: einzelne Frage üben (Auswertung serverseitig) */
export function QuizQuestionPanel({ entity }: { entity: EntityDetail }) {
  const { user, settings } = useAuth();
  return (
    <QuizRunner
      questions={[entity as EntityDetail<PublicQuizData>]}
      title="Auswertung"
      onEvaluated={() => {
        if (user && settings?.trackHistory !== false) api.me.recordHistory(entity.id, 'academy', 'quiz').catch(() => undefined);
      }}
    />
  );
}
