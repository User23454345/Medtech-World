import { Fragment } from 'react';
import { ENTITY_TYPE_DEFS, entityPath, type CopilotCitation } from '@medtech/core';
import { Badge, Button, Icon, Inline, QualityBadges, SourceLabel, TypeBadge, parseBlocks, useUi } from '@medtech/ui';
import { citationAnchor, splitCitations } from './copilot-logic.ts';

/** Text mit klickbaren Belegmarkern; Markdown-Inline-Formatierung bleibt erhalten (sicherer Renderer). */
function CitedInline({ text, turnId, citations, onCite }: { text: string; turnId: number; citations: CopilotCitation[]; onCite: (anchor: string) => void }) {
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  return (
    <>
      {splitCitations(text, byIndex.keys()).map((tok, i) => {
        if (tok.t === 'text') return <Inline key={i} text={tok.v} />;
        const c = byIndex.get(tok.index)!;
        const anchor = citationAnchor(turnId, tok.index);
        return (
          <sup key={i} className="mw-copilot-cite">
            <a
              href={`#${anchor}`}
              aria-label={`Beleg ${tok.index}: ${c.entity.title}`}
              title={c.entity.title}
              onClick={(e) => {
                e.preventDefault();
                onCite(anchor);
              }}
            >
              [{tok.index}]
            </a>
          </sup>
        );
      })}
    </>
  );
}

/** Antwort des Copilot – gleiche Blockstruktur wie der Plattform-Markdown-Renderer, ergänzt um Belegmarker */
export function AnswerText({ text, turnId, citations, onCite }: { text: string; turnId: number; citations: CopilotCitation[]; onCite: (anchor: string) => void }) {
  const props = { turnId, citations, onCite };
  return (
    <div className="mw-prose mw-copilot-answer__text">
      {parseBlocks(text).map((b, i) => {
        switch (b.kind) {
          case 'h2':
            return <h3 key={i}><CitedInline text={b.text} {...props} /></h3>;
          case 'h3':
            return <h4 key={i}><CitedInline text={b.text} {...props} /></h4>;
          case 'p':
            return <p key={i}><CitedInline text={b.text} {...props} /></p>;
          case 'ul':
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><CitedInline text={it} {...props} /></li>)}</ul>;
          case 'ol':
            return <ol key={i}>{b.items.map((it, j) => <li key={j}><CitedInline text={it} {...props} /></li>)}</ol>;
          default:
            return <Fragment key={i} />;
        }
      })}
    </div>
  );
}

/** Belegkarte: zitierte Plattform-Entität mit ihren externen Primärquellen */
export function CitationCard({
  citation,
  turnId,
  highlighted,
  cited,
  onPin,
}: {
  citation: CopilotCitation;
  turnId: number;
  highlighted: boolean;
  cited: boolean;
  onPin?: (id: string) => void;
}) {
  const { Link } = useUi();
  const { entity, sources, index } = citation;
  const def = ENTITY_TYPE_DEFS[entity.type];
  return (
    <li
      id={citationAnchor(turnId, index)}
      tabIndex={-1}
      className={`mw-card mw-copilot-citation${highlighted ? ' is-highlighted' : ''}`}
      aria-label={`Beleg ${index}: ${entity.title}`}
    >
      <div className="mw-copilot-citation__head">
        <span className="mw-copilot-citation__num" aria-hidden>
          {index}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mw-row" style={{ gap: 6, marginBottom: 4 }}>
            <TypeBadge type={entity.type} />
            <QualityBadges flags={entity.flags} reviewStatus={entity.reviewStatus} />
            {!cited ? (
              <Badge title="Wurde gefunden, im Antworttext aber nicht ausdrücklich zitiert">weiterführend</Badge>
            ) : null}
          </div>
          <Link to={entityPath(entity.id)} className="mw-copilot-citation__title">
            {entity.title}
          </Link>
        </div>
      </div>
      <p className="mw-copilot-citation__summary">{entity.summary}</p>
      <div className="mw-copilot-citation__sources">
        <div className="mw-small mw-muted" style={{ marginBottom: 4 }}>
          <Icon name="file" size={12} /> Primärquellen ({sources.length})
        </div>
        {sources.length ? (
          <ul className="mw-list-plain mw-copilot-citation__source-list">
            {sources.map((s) => (
              <li key={s.id}>
                <SourceLabel source={s} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mw-small mw-muted" style={{ margin: 0 }}>Keine externen Quellen hinterlegt.</p>
        )}
      </div>
      <div className="mw-row" style={{ gap: 6, marginTop: 8 }}>
        <Link to={entityPath(entity.id)} className="mw-btn mw-btn--ghost mw-btn--sm">
          <Icon name="chevron-right" size={14} /> {def.label} öffnen
        </Link>
        {onPin ? (
          <Button size="sm" variant="ghost" icon="target" onClick={() => onPin(entity.id)}>
            Als Kontext anheften
          </Button>
        ) : null}
      </div>
    </li>
  );
}
