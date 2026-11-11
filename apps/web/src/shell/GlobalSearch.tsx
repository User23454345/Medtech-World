import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ENTITY_TYPE_DEFS, MODULES, entityPath, type SearchHit } from '@medtech/core';
import { Badge, Icon, Loading, QualityBadges } from '@medtech/ui';
import { useDebounced, useSearch } from '../lib/hooks.ts';

/** Hebt «Treffer» im Snippet hervor – ohne HTML-Injection. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('«') && p.endsWith('»') ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

/**
 * Globale Suche (Strg/⌘ + K): eine Suche über alle Module.
 * Ergebnisse werden nach Modul gruppiert angezeigt.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 150);
  const { data, loading } = useSearch(dq, { limit: 40 });
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const hits = data?.hits ?? [];
  const groups = new Map<string, SearchHit[]>();
  for (const h of hits) groups.set(h.module, [...(groups.get(h.module) ?? []), h]);
  const ordered = [...groups.values()].flat();

  const go = (to: string) => {
    onClose();
    setQ('');
    navigate(to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, ordered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = ordered[active];
      if (hit) go(entityPath(hit.id));
      else if (q.trim()) go(`/suche?q=${encodeURIComponent(q.trim())}`);
    } else if (e.key === 'Tab') {
      // Fokus im Dialog halten
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('input, button, a[href]');
      if (!focusables?.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;
  let idx = -1;
  return (
    <div className="mw-search-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="mw-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Plattformweite Suche"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="mw-search-input-row">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="mw-search-input"
            placeholder="Geräte, Begriffe, Fehlerbilder, Lernmodule … z. B. „SpO2“"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            aria-label="Suchbegriff"
            aria-controls="mw-search-results"
            aria-activedescendant={ordered[active] ? `sr-${ordered[active]!.id}` : undefined}
          />
          <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="mw-search-results" id="mw-search-results" role="listbox" aria-label="Suchergebnisse">
          {!dq.trim() ? (
            <p className="mw-muted mw-small" style={{ padding: 16 }}>
              Eine Suche für alle Module: Wiki, Repair Lab, 3D Explorer, Market, Simulator, Prüfakademie, Copilot und Career Hub.
            </p>
          ) : loading && !data ? (
            <Loading label="Suche läuft …" />
          ) : hits.length === 0 ? (
            <p className="mw-muted" style={{ padding: 16 }}>
              Keine Treffer für „{dq}“.
            </p>
          ) : (
            [...groups.entries()].map(([mod, list]) => {
              const m = MODULES[mod as keyof typeof MODULES];
              return (
                <div key={mod} className="mw-search-group">
                  <div className="mw-search-group__title" style={{ color: m.accent }}>
                    <Icon name={m.icon} size={14} /> {m.name} <span className="mw-muted">({list.length})</span>
                  </div>
                  {list.map((h) => {
                    idx++;
                    const i = idx;
                    return (
                      <button
                        type="button"
                        key={h.id}
                        id={`sr-${h.id}`}
                        role="option"
                        aria-selected={i === active}
                        className="mw-search-hit"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(entityPath(h.id))}
                      >
                        <Icon name={ENTITY_TYPE_DEFS[h.type].icon} size={16} style={{ color: m.accent, flexShrink: 0, marginTop: 3 }} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="mw-search-hit__title">
                            {h.title} <Badge>{ENTITY_TYPE_DEFS[h.type].label}</Badge> <QualityBadges flags={h.flags.filter((f) => f.kind !== 'draft')} />
                          </span>
                          <span className="mw-search-hit__snippet">
                            <Snippet text={h.snippet} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        {dq.trim() && data ? (
          <div className="mw-search-footer">
            <span className="mw-muted mw-small">{data.total} Treffer</span>
            <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => go(`/suche?q=${encodeURIComponent(dq)}`)}>
              Alle Ergebnisse mit Filtern <Icon name="chevron-right" size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
