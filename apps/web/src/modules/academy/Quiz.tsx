import { useEffect, useMemo, useRef, useState } from 'react';
import type { EntityDetail } from '@medtech/core';
import { Alert, Badge, Button, ErrorState, Icon, Markdown, ProgressBar } from '@medtech/ui';
import { api, type QuizEvaluation } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { invalidateCache } from '../../lib/hooks.ts';
import { EntityTitleScope } from '../../shell/EntityPage.tsx';
import {
  answeredCount,
  buildAnswerPayload,
  isMultipleChoice,
  isQuizComplete,
  optionOutcome,
  shuffledOptions,
  toggleOption,
  type OptionOutcome,
  type PublicQuizData,
  type QuizAnswers,
} from './academy-logic.ts';
import './academy.css';

const OUTCOME_LABEL: Record<OptionOutcome, string | null> = {
  'correct-selected': 'richtig gewählt',
  'correct-missed': 'richtige Antwort (nicht gewählt)',
  'wrong-selected': 'falsch gewählt',
  neutral: null,
};

export interface QuizRunnerProps {
  questions: Array<EntityDetail<PublicQuizData>>;
  /** Lernmodul, für das der Fortschritt gespeichert wird (nur angemeldet) */
  contextId?: string;
  /** Überschrift der Ergebnisanzeige */
  title?: string;
  onEvaluated?: (ev: QuizEvaluation) => void;
}

/**
 * Quiz mit Einfach-, Mehrfach- und Wahr/Falsch-Fragen. Die Auswertung erfolgt
 * ausschließlich serverseitig (die API liefert Lösungen erst nach dem Absenden).
 */
export function QuizRunner({ questions, contextId, title = 'Ergebnis', onEvaluated }: QuizRunnerProps) {
  const { user, effectiveSettings } = useAuth();
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** Zähler je Versuch – bei „Erneut versuchen“ werden die Optionen neu gemischt */
  const [attempt, setAttempt] = useState(0);
  const optionOrder = useMemo(
    () => new Map(questions.map((q) => [q.id, shuffledOptions(q.data)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attempt erzwingt neues Mischen
    [questions, attempt],
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const ids = questions.map((q) => q.id);
  const complete = isQuizComplete(ids, answers);
  const resultsById = new Map(evaluation?.results.map((r) => [r.questionId, r]));

  useEffect(() => {
    if (evaluation) {
      resultRef.current?.focus();
      resultRef.current?.scrollIntoView({ behavior: effectiveSettings.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  }, [evaluation, effectiveSettings.reducedMotion]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const ev = await api.academy.evaluateQuiz(buildAnswerPayload(ids, answers), contextId);
      setEvaluation(ev);
      if (user) invalidateCache('me:');
      onEvaluated?.(ev);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setAnswers({});
    setEvaluation(null);
    setError(null);
    setAttempt((n) => n + 1);
    topRef.current?.focus();
  }

  if (!questions.length) return <p className="mw-muted">Zu diesem Inhalt sind noch keine Quizfragen hinterlegt.</p>;

  return (
    <div className="mw-academy-quiz" ref={topRef} tabIndex={-1}>
      {!evaluation ? (
        <div className="mw-academy-quiz__status mw-small mw-muted" aria-live="polite">
          {answeredCount(ids, answers)} von {ids.length} Fragen beantwortet
        </div>
      ) : null}

      {evaluation ? (
        <div ref={resultRef} tabIndex={-1} className={`mw-academy-result ${evaluation.passed ? 'mw-academy-result--pass' : 'mw-academy-result--fail'}`} role="status" aria-live="polite">
          <div className="mw-spread">
            <h3 className="mw-academy-result__title">
              <Icon name={evaluation.passed ? 'check' : 'alert'} /> {title}: {evaluation.score} %
            </h3>
            <Badge tone={evaluation.passed ? 'ok' : 'danger'}>{evaluation.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge>
          </div>
          <ProgressBar value={evaluation.score} label={`Ergebnis ${evaluation.score} Prozent`} />
          <p className="mw-small" style={{ margin: '8px 0 0' }}>
            {evaluation.results.filter((r) => r.correct).length} von {evaluation.results.length} Fragen richtig · Bestehensgrenze {evaluation.passScore} %.
            {contextId ? (user ? ' Dein Lernfortschritt wurde gespeichert.' : ' Als Gast wird das Ergebnis nicht gespeichert.') : null}
          </p>
        </div>
      ) : null}

      <ol className="mw-academy-quiz__list">
        {questions.map((q, qi) => {
          const multiple = isMultipleChoice(q.data);
          const selected = answers[q.id] ?? [];
          const result = resultsById.get(q.id);
          const name = `quiz-${q.slug}`;
          return (
            <li key={q.id} className={`mw-academy-question${result ? (result.correct ? ' is-correct' : ' is-wrong') : ''}`}>
              <fieldset disabled={Boolean(evaluation) || busy}>
                <legend className="mw-academy-question__legend">
                  <span className="mw-academy-question__num" aria-hidden>
                    {qi + 1}
                  </span>
                  <span>
                    {q.data.question}
                    <span className="mw-visually-hidden">{multiple ? ' (Mehrfachauswahl möglich)' : ' (eine Antwort)'}</span>
                  </span>
                </legend>
                <div className="mw-small mw-muted" style={{ marginBottom: 8 }}>
                  {q.data.kind === 'truefalse' ? 'Wahr oder falsch?' : multiple ? 'Mehrere Antworten können richtig sein.' : 'Genau eine Antwort ist richtig.'}
                  {' · '}Schwierigkeit {'●'.repeat(q.data.difficulty)}
                  {'○'.repeat(Math.max(0, 3 - q.data.difficulty))}
                </div>
                <div className="mw-academy-options">
                  {(optionOrder.get(q.id) ?? q.data.options).map((o) => {
                    const outcome = result ? optionOutcome(o.id, selected, result.correctOptions) : 'neutral';
                    const label = OUTCOME_LABEL[outcome];
                    return (
                      <label key={o.id} className={`mw-academy-option mw-academy-option--${outcome}${selected.includes(o.id) ? ' is-selected' : ''}`}>
                        <input
                          type={multiple ? 'checkbox' : 'radio'}
                          name={name}
                          value={o.id}
                          checked={selected.includes(o.id)}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: toggleOption(a[q.id] ?? [], o.id, multiple) }))}
                        />
                        <span className="mw-academy-option__text">{o.text}</span>
                        {label ? (
                          <span className="mw-academy-option__mark">
                            <Icon name={outcome === 'wrong-selected' ? 'x' : 'check'} size={14} /> {label}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {result ? (
                <div className="mw-academy-explanation">
                  <strong>{result.correct ? 'Richtig.' : 'Leider nicht richtig.'}</strong>
                  <EntityTitleScope entity={q}>
                    <Markdown source={result.explanation} />
                  </EntityTitleScope>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {error ? <ErrorState error={error} /> : null}
      <div className="mw-row">
        {evaluation ? (
          <Button variant="primary" icon="reset" onClick={retry}>
            Quiz wiederholen
          </Button>
        ) : (
          <Button variant="primary" icon="check" disabled={!complete || busy} onClick={submit}>
            {busy ? 'Wird ausgewertet …' : 'Antworten auswerten'}
          </Button>
        )}
        {!evaluation && !complete ? <span className="mw-small mw-muted">Bitte alle Fragen beantworten.</span> : null}
      </div>
      {contextId && !user && !evaluation ? (
        <Alert tone="info">Du kannst das Quiz als Gast bearbeiten. Dein Ergebnis und Lernfortschritt werden nur gespeichert, wenn du angemeldet bist.</Alert>
      ) : null}
    </div>
  );
}
