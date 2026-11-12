import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Route, Routes, useSearchParams } from 'react-router';
import { ENTITY_TYPE_DEFS, MODULES, entityPath, type CopilotAnswer } from '@medtech/core';
import { Alert, Badge, Button, Card, Icon, Loading, ModuleHero, Textarea, useUi } from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useAsync, useDocumentTitle, useEntity } from '../../lib/hooks.ts';
import { NotFound } from '../../pages/NotFound.tsx';
import { AnswerText, CitationCard } from './AnswerView.tsx';
import { QUESTION_MAX, citationAnchor, citedIndices, looksLikePatientData, parseContextParam, validateQuestion } from './copilot-logic.ts';
import './copilot.css';

export default function Root() {
  return (
    <Routes>
      <Route index element={<CopilotPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const EXAMPLES = [
  'Wie funktioniert die Pulsoximetrie?',
  'Welche Grenzwerte gelten für den Ableitstrom bei Typ CF?',
  'Was ist bei einer STK zu beachten?',
  'Was bedeutet ein Okklusionsalarm an der Infusionspumpe?',
];

interface Turn {
  id: number;
  question: string;
  contextId: string | null;
  contextTitle: string | null;
  status: 'pending' | 'done' | 'error';
  answer?: CopilotAnswer;
  error?: string;
}

const MODE_UI = {
  llm: { label: 'Sprachmodell', tone: 'accent' as const, hint: 'Antworten werden von einem Sprachmodell ausschließlich aus geprüften Inhalten formuliert und mit Belegen versehen.' },
  retrieval: { label: 'Suchmodus', tone: 'info' as const, hint: 'Suchmodus ohne generierten Text: Es werden die passenden geprüften Inhalte mit Kerndaten und Quellen angezeigt.' },
};

function CopilotPage() {
  const m = MODULES.copilot;
  useDocumentTitle(m.name);
  const { effectiveSettings } = useAuth();
  const reducedMotion = effectiveSettings.reducedMotion;
  const [params, setParams] = useSearchParams();
  const contextId = parseContextParam(params.get('kontext'));
  const invalidContext = params.has('kontext') && !contextId;
  const context = useEntity(contextId);
  const status = useAsync(() => api.copilot.status(), [], 'copilot:status');

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const nextId = useRef(1);
  const lastTurnRef = useRef<HTMLElement | null>(null);
  const busy = turns.some((t) => t.status === 'pending');

  const setContext = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('kontext', id);
          else next.delete('kontext');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      const err = validateQuestion(question);
      if (err) {
        setInputError(err);
        return;
      }
      if (busy) return;
      setInputError(null);
      const id = nextId.current++;
      const ctxTitle = contextId ? (context.data?.id === contextId ? context.data.title : contextId) : null;
      setTurns((t) => [...t, { id, question, contextId, contextTitle: ctxTitle, status: 'pending' }]);
      setInput('');
      setAnnounce('Frage gesendet, Antwort wird erstellt …');
      try {
        const answer = await api.copilot.ask(question, contextId ?? undefined);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', answer } : x)));
        setAnnounce(`Antwort erhalten mit ${answer.citations.length} Beleg(en).`);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unbekannter Fehler';
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error: message } : x)));
        setAnnounce(`Fehler: ${message}`);
      }
    },
    [busy, contextId, context.data],
  );

  // Neuesten Beitrag sichtbar machen
  useEffect(() => {
    lastTurnRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [turns.length, turns[turns.length - 1]?.status, reducedMotion]);

  // Hervorhebung nach kurzer Zeit zurücksetzen
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [highlight]);

  const goToCitation = useCallback(
    (anchor: string) => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
      setHighlight(anchor);
    },
    [reducedMotion],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  };

  const mode = status.data?.mode;
  const patientWarning = looksLikePatientData(input);

  return (
    <div className={`mw-container mw-page mw-copilot${reducedMotion ? ' mw-copilot--still' : ''}`}>
      <ModuleHero module="copilot">
        <div className="mw-row mw-copilot-hero__meta">
          <span className="mw-copilot-mode" aria-live="polite">
            <Icon name={mode === 'llm' ? 'sparkle' : 'search'} size={14} />
            {status.loading ? 'Modus wird ermittelt …' : mode ? `Modus: ${MODE_UI[mode].label}` : 'Modus unbekannt'}
          </span>
          <span className="mw-copilot-mode">
            <Icon name="shield" size={14} /> Gespräche werden nicht gespeichert
          </span>
        </div>
      </ModuleHero>

      <div className="mw-two-col mw-copilot-layout">
        <div className="mw-copilot-main">
          <Alert tone="warn" icon="shield">
            <strong>Keine Patientendaten eingeben.</strong> Namen, Geburtsdaten, Befunde oder andere personenbezogene Angaben gehören nicht in den Copilot. Stelle allgemeine,
            fachliche Fragen zu Geräten, Prüfungen und Vorschriften.
          </Alert>

          <section className="mw-copilot-thread" aria-label="Gesprächsverlauf">
            {turns.length === 0 ? (
              <Card className="mw-copilot-welcome">
                <h2 className="mw-card__title">
                  <Icon name="sparkle" /> Was möchtest du wissen?
                </h2>
                <p className="mw-muted" style={{ marginTop: 0 }}>
                  Der Copilot antwortet ausschließlich auf Basis der geprüften Inhalte von MedTech World und belegt seine Aussagen mit nummerierten Quellen. Beispiele:
                </p>
                <div className="mw-copilot-examples">
                  {EXAMPLES.map((q) => (
                    <button key={q} type="button" className="mw-copilot-example" onClick={() => void send(q)} disabled={busy}>
                      <Icon name="chevron-right" size={14} /> {q}
                    </button>
                  ))}
                </div>
              </Card>
            ) : (
              <ol className="mw-list-plain mw-copilot-turns">
                {turns.map((t, i) => (
                  <li
                    key={t.id}
                    ref={i === turns.length - 1 ? (el) => { lastTurnRef.current = el; } : undefined}
                    className="mw-copilot-turn"
                  >
                    <TurnView turn={t} highlight={highlight} onCite={goToCitation} onPin={setContext} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="mw-visually-hidden" role="status" aria-live="polite">
            {announce}
          </div>

          <form className="mw-card mw-copilot-composer" onSubmit={onSubmit} aria-label="Frage an den Copilot">
            {contextId ? (
              <ContextChip id={contextId} title={context.data?.title} loading={context.loading} error={Boolean(context.error)} onRemove={() => setContext(null)} />
            ) : null}
            {invalidContext ? (
              <Alert tone="warn">Der übergebene Kontext ist ungültig und wird ignoriert.</Alert>
            ) : null}
            <label htmlFor="mw-copilot-input" className="mw-label">
              Deine Frage
            </label>
            <Textarea
              id="mw-copilot-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              onKeyDown={onKeyDown}
              rows={3}
              maxLength={QUESTION_MAX}
              placeholder="z. B. Welche Prüfungen fordert die MPBetreibV für Infusionspumpen?"
              aria-describedby="mw-copilot-input-hint"
              aria-invalid={inputError ? true : undefined}
            />
            {patientWarning ? (
              <Alert tone="danger" icon="shield" role="alert">
                Deine Eingabe enthält möglicherweise Patientendaten (z. B. Namen, Geburtsdatum oder Versichertennummer). Bitte entferne diese Angaben vor dem Senden.
              </Alert>
            ) : null}
            {inputError ? (
              <span className="mw-small" style={{ color: 'var(--mw-danger)' }} role="alert">
                {inputError}
              </span>
            ) : null}
            <div className="mw-spread">
              <span id="mw-copilot-input-hint" className="mw-small mw-muted">
                <kbd className="mw-kbd">Enter</kbd> senden · <kbd className="mw-kbd">Umschalt</kbd> + <kbd className="mw-kbd">Enter</kbd> neue Zeile · {input.length}/{QUESTION_MAX}
              </span>
              <div className="mw-row">
                {turns.length ? (
                  <Button variant="ghost" icon="trash" onClick={() => setTurns([])} disabled={busy}>
                    Verlauf leeren
                  </Button>
                ) : null}
                <Button type="submit" variant="primary" icon="send" disabled={busy || !input.trim()}>
                  {busy ? 'Wird beantwortet …' : 'Senden'}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <aside className="mw-stack" aria-label="Hinweise zum Copilot">
          <Card>
            <h2 className="mw-card__title">
              <Icon name={mode === 'llm' ? 'sparkle' : 'search'} /> Arbeitsmodus
            </h2>
            {status.loading ? (
              <Loading label="Modus wird ermittelt …" />
            ) : mode ? (
              <>
                <Badge tone={MODE_UI[mode].tone}>{MODE_UI[mode].label}</Badge>
                <p className="mw-small mw-muted">{MODE_UI[mode].hint}</p>
              </>
            ) : (
              <p className="mw-small mw-muted">Der Modus konnte nicht ermittelt werden. Fragen sind trotzdem möglich.</p>
            )}
          </Card>
          <Card>
            <h2 className="mw-card__title">
              <Icon name="shield" /> Datenschutz
            </h2>
            <ul className="mw-small mw-copilot-bullets">
              <li>Gespräche werden nicht gespeichert – weder im Konto noch im Browser. Beim Verlassen oder Neuladen der Seite ist der Verlauf weg.</li>
              <li>Keine Patientendaten oder anderen personenbezogenen Daten eingeben.</li>
              <li>Antworten stützen sich nur auf geprüfte Inhalte der Plattform; maßgeblich sind die verlinkten Primärquellen.</li>
            </ul>
          </Card>
          <Card>
            <h2 className="mw-card__title">
              <Icon name="target" /> Kontext
            </h2>
            <p className="mw-small mw-muted" style={{ marginTop: 0 }}>
              Über „Copilot fragen“ auf einer Inhaltsseite wird das Gerät, der Begriff oder die Prüfung als Kontext angeheftet und bei der Suche nach Belegen bevorzugt.
            </p>
            {contextId && context.data ? (
              <p className="mw-small" style={{ margin: 0 }}>
                Aktuell: <strong>{context.data.title}</strong>
              </p>
            ) : (
              <p className="mw-small" style={{ margin: 0 }}>Aktuell kein Kontext angeheftet.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ContextChip({ id, title, loading, error, onRemove }: { id: string; title?: string; loading: boolean; error: boolean; onRemove: () => void }) {
  const { Link } = useUi();
  const type = id.slice(0, id.indexOf(':')) as keyof typeof ENTITY_TYPE_DEFS;
  const def = ENTITY_TYPE_DEFS[type];
  return (
    <div className="mw-copilot-context">
      <span className="mw-small mw-muted">Kontext:</span>
      <span className="mw-copilot-context__chip">
        <Icon name={def?.icon ?? 'link'} size={14} />
        {error ? (
          <span>Inhalt nicht gefunden ({id})</span>
        ) : (
          <Link to={entityPath(id)}>{loading && !title ? 'wird geladen …' : (title ?? id)}</Link>
        )}
        {def ? <span className="mw-small mw-muted">· {def.label}</span> : null}
        <button type="button" className="mw-copilot-context__remove" onClick={onRemove} aria-label="Kontext entfernen">
          <Icon name="x" size={14} />
        </button>
      </span>
    </div>
  );
}

function TurnView({ turn, highlight, onCite, onPin }: { turn: Turn; highlight: string | null; onCite: (anchor: string) => void; onPin: (id: string) => void }) {
  const a = turn.answer;
  const cited = a ? new Set(citedIndices(a.answer, a.citations.map((c) => c.index))) : new Set<number>();
  return (
    <article className="mw-copilot-exchange" aria-label={`Frage: ${turn.question}`}>
      <div className="mw-copilot-question">
        <div className="mw-copilot-question__bubble">
          <span className="mw-visually-hidden">Deine Frage: </span>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{turn.question}</p>
          {turn.contextId ? (
            <div className="mw-small mw-copilot-question__ctx">
              <Icon name="target" size={12} /> Kontext: {turn.contextTitle ?? turn.contextId}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mw-card mw-copilot-answer" aria-busy={turn.status === 'pending'}>
        <div className="mw-copilot-answer__head">
          <span className="mw-copilot-answer__avatar" aria-hidden>
            <Icon name="sparkle" size={16} />
          </span>
          <strong>Copilot</strong>
          {a ? <Badge tone={MODE_UI[a.mode].tone}>{MODE_UI[a.mode].label}</Badge> : null}
        </div>
        {turn.status === 'pending' ? (
          <div className="mw-copilot-typing" role="status">
            <span className="mw-copilot-typing__dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            Durchsuche geprüfte Inhalte …
          </div>
        ) : turn.status === 'error' ? (
          <Alert tone="danger" role="alert">
            {turn.error}
          </Alert>
        ) : a ? (
          <>
            <AnswerText text={a.answer} turnId={turn.id} citations={a.citations} onCite={onCite} />
            {a.citations.length ? (
              <div className="mw-copilot-citations">
                <h3 className="mw-copilot-citations__title">
                  <Icon name="file" size={16} /> Belege ({a.citations.length})
                </h3>
                <ol className="mw-list-plain mw-copilot-citations__list">
                  {a.citations.map((c) => (
                    <CitationCard
                      key={c.index}
                      citation={c}
                      turnId={turn.id}
                      cited={cited.has(c.index)}
                      highlighted={highlight === citationAnchor(turn.id, c.index)}
                      onPin={c.entity.id !== turn.contextId ? onPin : undefined}
                    />
                  ))}
                </ol>
              </div>
            ) : null}
            <p className="mw-copilot-disclaimer">
              <Icon name="info" size={14} /> {a.disclaimer}
            </p>
          </>
        ) : null}
      </div>
    </article>
  );
}
