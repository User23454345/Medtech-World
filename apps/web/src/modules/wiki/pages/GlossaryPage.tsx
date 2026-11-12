import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { entityPath, type TermData } from '@medtech/core';
import { Badge, EmptyState, ErrorState, Field, Input, Loading, QualityBadges, Select } from '@medtech/ui';
import { useAuth } from '../../../lib/auth.tsx';
import { useEntityList } from '../../../lib/hooks.ts';
import { DetailProgress, WikiSubPage } from '../components.tsx';
import { ALPHABET, filterGlossary, groupByLetter, OTHER_LETTER, TERM_CATEGORY_LABEL, type GlossaryEntry } from '../logic.ts';
import { useEntityDetails } from '../useEntityDetails.ts';

type Category = TermData['category'];
const CATEGORIES = Object.keys(TERM_CATEGORY_LABEL) as Category[];

export default function GlossaryPage() {
  const { effectiveSettings } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const catParam = params.get('kategorie') ?? '';
  const category: Category | '' = (CATEGORIES as string[]).includes(catParam) ? (catParam as Category) : '';

  const list = useEntityList({ type: 'term', limit: 500 });
  const ids = useMemo(() => list.data?.items.map((i) => i.id), [list.data]);
  const details = useEntityDetails<TermData>(ids);

  const entries = useMemo(
    () =>
      (list.data?.items ?? []).map((s) => {
        const d = details.details.get(s.id);
        return { ...s, aliases: d?.aliases, data: d?.data } satisfies GlossaryEntry & typeof s;
      }),
    [list.data, details.details],
  );
  const filtered = useMemo(() => filterGlossary(entries, q, category), [entries, q, category]);
  const groups = useMemo(() => groupByLetter(filtered), [filtered]);
  const present = new Set(groups.map((g) => g.letter));

  const categoryCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of entries) if (e.data?.category) c.set(e.data.category, (c.get(e.data.category) ?? 0) + 1);
    return c;
  }, [entries]);

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const jumpTo = (letter: string) => {
    const el = document.getElementById(`glossar-${letter === OTHER_LETTER ? 'weitere' : letter}`);
    if (!el) return;
    el.scrollIntoView({ behavior: effectiveSettings.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  return (
    <WikiSubPage
      title="Glossar A–Z"
      lead="Fachbegriffe, Messprinzipien und Abkürzungen der Medizintechnik – mit englischer Entsprechung und Verweisen auf Geräte, Lernmodule und Normen."
    >
      <div className="mw-wiki-filterbar">
        <Field label="Begriff suchen">
          {(id) => <Input id={id} type="search" value={q} placeholder="z. B. SpO2, Ableitstrom, PEEP" onChange={(e) => setParam('q', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Kategorie">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setParam('kategorie', e.target.value)}>
              <option value="">Alle Kategorien</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c} disabled={!details.loading && !categoryCounts.get(c)}>
                  {TERM_CATEGORY_LABEL[c]}
                  {categoryCounts.get(c) ? ` (${categoryCounts.get(c)})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <nav className="mw-wiki-letters" aria-label="Alphabetisches Register">
        {[...ALPHABET, OTHER_LETTER].map((l) =>
          present.has(l) ? (
            <button key={l} type="button" className="mw-wiki-letters__btn" onClick={() => jumpTo(l)} aria-label={l === OTHER_LETTER ? 'Zu Begriffen mit Ziffern oder Sonderzeichen' : `Zu Buchstabe ${l}`}>
              {l}
            </button>
          ) : (
            <span key={l} className="mw-wiki-letters__btn is-empty" aria-hidden>
              {l}
            </span>
          ),
        )}
      </nav>

      <DetailProgress loaded={details.loaded} total={details.total} label="Begriffsdaten werden geladen" />
      {details.error ? <ErrorState error={details.error} /> : null}

      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !groups.length ? (
        <EmptyState title={q || category ? 'Keine Begriffe zu diesem Filter.' : 'Noch keine Fachbegriffe vorhanden.'} icon="book" />
      ) : (
        <>
          <p className="mw-small mw-muted" aria-live="polite">
            {filtered.length} von {entries.length} Begriffen
            {category ? ` · Kategorie ${TERM_CATEGORY_LABEL[category]}` : ''}
          </p>
          {groups.map((g) => (
            <section key={g.letter} className="mw-wiki-glossary-group" aria-labelledby={`glossar-h-${g.letter === OTHER_LETTER ? 'weitere' : g.letter}`}>
              <h2
                className="mw-wiki-glossary-group__letter"
                id={`glossar-h-${g.letter === OTHER_LETTER ? 'weitere' : g.letter}`}
              >
                <span id={`glossar-${g.letter === OTHER_LETTER ? 'weitere' : g.letter}`} tabIndex={-1}>
                  {g.letter === OTHER_LETTER ? '0–9 / Sonstige' : g.letter}
                </span>
              </h2>
              <dl className="mw-wiki-glossary">
                {g.items.map((t) => (
                  <div key={t.id} className="mw-wiki-glossary__item">
                    <dt>
                      <Link to={entityPath(t.id)} className="mw-wiki-glossary__title">
                        {t.title}
                      </Link>
                      {t.data?.abbreviation ? (
                        <abbr className="mw-wiki-abbr" title={t.title}>
                          {t.data.abbreviation}
                        </abbr>
                      ) : null}
                      {t.data?.english ? (
                        <span className="mw-wiki-english" lang="en">
                          engl. {t.data.english}
                        </span>
                      ) : null}
                    </dt>
                    <dd>
                      <p>{t.summary}</p>
                      <div className="mw-row" style={{ gap: 6 }}>
                        {t.data?.category ? <Badge>{TERM_CATEGORY_LABEL[t.data.category] ?? t.data.category}</Badge> : null}
                        <QualityBadges flags={t.flags} />
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </>
      )}
    </WikiSubPage>
  );
}
