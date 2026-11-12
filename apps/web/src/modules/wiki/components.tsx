import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Breadcrumbs, Icon, PageHeader, ProgressBar, type IconName } from '@medtech/ui';
import { useDocumentTitle } from '../../lib/hooks.ts';
import './wiki.css';

/** Unterseiten des Wikis (Navigation innerhalb des Moduls) */
export const WIKI_SECTIONS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: '/wiki', label: 'Übersicht', icon: 'home', end: true },
  { to: '/wiki/geraete', label: 'Geräte', icon: 'device' },
  { to: '/wiki/glossar', label: 'Glossar A–Z', icon: 'book' },
  { to: '/wiki/hersteller', label: 'Hersteller', icon: 'factory' },
  { to: '/wiki/recht', label: 'Rechtsgrundlagen', icon: 'scale' },
  { to: '/wiki/dokumente', label: 'Dokumente', icon: 'file' },
];

export function WikiSubnav() {
  return (
    <nav className="mw-wiki-subnav" aria-label="Bereiche des Wikis">
      <ul className="mw-list-plain">
        {WIKI_SECTIONS.map((s) => (
          <li key={s.to}>
            <NavLink to={s.to} end={s.end} className={({ isActive }) => `mw-wiki-subnav__link${isActive ? ' is-active' : ''}`}>
              <Icon name={s.icon} size={16} />
              {s.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Kompakte Schlüssel-Wert-Liste für Steckbriefe */
export function Facts({ items }: { items: Array<{ label: string; value: ReactNode; hidden?: boolean }> }) {
  const visible = items.filter((i) => !i.hidden && i.value !== undefined && i.value !== null && i.value !== '');
  if (!visible.length) return null;
  return (
    <dl className="mw-wiki-facts">
      {visible.map((i) => (
        <div key={i.label} className="mw-wiki-facts__row">
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Zwischenüberschrift innerhalb eines Panels */
export function PanelHeading({ children }: { children: ReactNode }) {
  return <h3 className="mw-wiki-panel-heading">{children}</h3>;
}

/** Fortschritt beim Nachladen von Detaildaten */
export function DetailProgress({ loaded, total, label }: { loaded: number; total: number; label: string }) {
  if (!total || loaded >= total) return null;
  return (
    <div className="mw-wiki-progress" role="status" aria-live="polite">
      <span className="mw-small mw-muted">
        {label} … {loaded} von {total}
      </span>
      <ProgressBar value={(loaded / total) * 100} label={label} />
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <Icon name="external" size={12} aria-hidden />
      <span className="mw-visually-hidden"> (öffnet in neuem Fenster)</span>
    </a>
  );
}

/** Einheitlicher Rahmen der Wiki-Unterseiten */
export function WikiSubPage({ title, lead, actions, children }: { title: string; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  useDocumentTitle(`${title} · Wiki`);
  return (
    <div className="mw-container mw-page">
      <Breadcrumbs items={[{ label: 'Wiki', to: '/wiki' }, { label: title }]} />
      <WikiSubnav />
      <PageHeader title={title} lead={lead} actions={actions} />
      {children}
    </div>
  );
}
