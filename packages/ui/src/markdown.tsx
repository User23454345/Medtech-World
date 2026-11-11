import { Fragment, type ReactNode } from 'react';
import { entityPath, parseEntityId } from '@medtech/core';
import { useUi } from './context.tsx';

/**
 * Sicherer Markdown-Renderer für Plattforminhalte.
 *
 * Erzeugt ausschließlich React-Elemente (kein innerHTML → kein XSS).
 * Unterstützt: Überschriften (##, ###), Absätze, Listen (-, *, 1.),
 * **fett**, *kursiv*, `code`, [Text](https://…) und Wiki-Links [[typ:slug|Text]].
 */

type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'wiki'; id: string; label?: string };

const INLINE = /(\[\[([a-z_]+:[a-z0-9-]+)(?:\|([^\]]+))?\]\])|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;

export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: 'text', v: text.slice(last, idx) });
    if (m[1]) out.push({ t: 'wiki', id: m[2]!, label: m[3] });
    else if (m[4]) out.push({ t: 'bold', v: m[5]! });
    else if (m[6]) out.push({ t: 'code', v: m[7]! });
    else if (m[8]) out.push({ t: 'link', v: m[9]!, href: m[10]! });
    else if (m[11]) out.push({ t: 'italic', v: m[12]! });
    else if (m[13]) out.push({ t: 'italic', v: m[14]! });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

function safeHref(href: string): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return null;
}

export function Inline({ text }: { text: string }) {
  const { Link, resolveTitle } = useUi();
  return (
    <>
      {tokenizeInline(text).map((tok, i) => {
        switch (tok.t) {
          case 'text':
            return <Fragment key={i}>{tok.v}</Fragment>;
          case 'bold':
            return <strong key={i}>{tok.v}</strong>;
          case 'italic':
            return <em key={i}>{tok.v}</em>;
          case 'code':
            return <code key={i}>{tok.v}</code>;
          case 'link': {
            const href = safeHref(tok.href);
            if (!href) return <Fragment key={i}>{tok.v}</Fragment>;
            if (href.startsWith('/')) return <Link key={i} to={href}>{tok.v}</Link>;
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer">
                {tok.v}
              </a>
            );
          }
          case 'wiki': {
            const parsed = parseEntityId(tok.id);
            const label = tok.label ?? resolveTitle?.(tok.id) ?? parsed?.slug.replace(/-/g, ' ') ?? tok.id;
            if (!parsed) return <span key={i} className="mw-wikilink mw-wikilink--broken">{label}</span>;
            return (
              <Link key={i} to={entityPath(tok.id)} className="mw-wikilink">
                {label}
              </Link>
            );
          }
        }
      })}
    </>
  );
}

type Block = { kind: 'h2' | 'h3' | 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push({ kind: h[1]!.length <= 2 ? 'h2' : 'h3', text: h[2]! });
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

export function Markdown({ source, className }: { source: string; className?: string }): ReactNode {
  if (!source?.trim()) return null;
  return (
    <div className={['mw-prose', className].filter(Boolean).join(' ')}>
      {parseBlocks(source).map((b, i) => {
        switch (b.kind) {
          case 'h2':
            return <h2 key={i}><Inline text={b.text} /></h2>;
          case 'h3':
            return <h3 key={i}><Inline text={b.text} /></h3>;
          case 'p':
            return <p key={i}><Inline text={b.text} /></p>;
          case 'ul':
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
          case 'ol':
            return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>;
        }
      })}
    </div>
  );
}
