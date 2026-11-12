import { Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { MODULE_LIST, ROLE_LABELS } from '@medtech/core';
import { Icon, Loading } from '@medtech/ui';
import { useAuth } from '../lib/auth.tsx';
import { GlobalSearch } from './GlobalSearch.tsx';

function useTheme() {
  const { effectiveSettings } = useAuth();
  useEffect(() => {
    const apply = () => {
      const pref = effectiveSettings.theme;
      const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.reducedMotion = String(effectiveSettings.reducedMotion);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [effectiveSettings.theme, effectiveSettings.reducedMotion]);
}

/**
 * Aufklappbereich (Disclosure) schließen bei Escape oder Klick außerhalb.
 * Bei Escape kehrt der Fokus zum auslösenden Knopf zurück.
 */
function useDismiss(open: boolean, close: () => void, refs: Array<RefObject<HTMLElement | null>>, toggle: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      toggle.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && refs.some((r) => r.current?.contains(target))) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
    // refs/close sind stabil genug; Neuregistrierung nur beim Öffnen/Schließen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

function UserMenu() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [location.pathname]);
  useDismiss(open, () => setOpen(false), [rootRef], toggleRef);

  if (!user) {
    return (
      <div className="mw-row" style={{ gap: 6 }}>
        <Link className="mw-header-btn" to={`/konto/anmelden?weiter=${encodeURIComponent(location.pathname)}`}>
          <Icon name="user" /> <span className="mw-hide-sm">Anmelden</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="mw-usermenu" ref={rootRef}>
      <button ref={toggleRef} type="button" className="mw-header-btn" aria-expanded={open} aria-controls="mw-usermenu-panel" onClick={() => setOpen((o) => !o)}>
        <span className="mw-avatar" aria-hidden>
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="mw-hide-sm">{user.displayName}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <div className="mw-usermenu__panel" id="mw-usermenu-panel">
          <div className="mw-usermenu__head">
            <strong>{user.displayName}</strong>
            <span className="mw-muted mw-small">{ROLE_LABELS[user.role]}</span>
          </div>
          <Link to="/konto">
            <Icon name="home" /> Mein Bereich
          </Link>
          <Link to="/konto/favoriten">
            <Icon name="star" /> Favoriten
          </Link>
          <Link to="/konto/fortschritt">
            <Icon name="graduation" /> Lernfortschritt
          </Link>
          <Link to="/konto/notizen">
            <Icon name="note" /> Notizen
          </Link>
          <Link to="/konto/verlauf">
            <Icon name="history" /> Lernhistorie
          </Link>
          <Link to="/konto/einstellungen">
            <Icon name="settings" /> Einstellungen & Datenschutz
          </Link>
          {can('quality:read') ? (
            <Link to="/qualitaet">
              <Icon name="shield" /> Qualitätssicherung
            </Link>
          ) : null}
          {can('users:manage') ? (
            <Link to="/admin/nutzer">
              <Icon name="user" /> Nutzerverwaltung
            </Link>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <Icon name="logout" /> Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  useDismiss(navOpen, () => setNavOpen(false), [navRef, navToggleRef], navToggleRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="mw-app">
      <a href="#main" className="mw-skip-link">
        Zum Inhalt springen
      </a>
      <header className="mw-header">
        <div className="mw-header__inner">
          <Link to="/" className="mw-logo" aria-label="MedTech World – Startseite">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#12406a" />
              <path d="M4 17h6l3-8 5 15 3-9 2 2h5" fill="none" stroke="#2fd3c2" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              MedTech <strong>World</strong>
            </span>
          </Link>
          <button ref={navToggleRef} type="button" className="mw-header-btn mw-show-md" aria-expanded={navOpen} aria-controls="mw-modnav" onClick={() => setNavOpen((o) => !o)}>
            <Icon name="menu" /> <span className="mw-visually-hidden">Module</span>
          </button>
          <nav ref={navRef} id="mw-modnav" className={`mw-modnav${navOpen ? ' mw-modnav--open' : ''}`} aria-label="Module">
            {MODULE_LIST.map((m) => (
              <NavLink key={m.id} to={m.path} className="mw-modnav__link" style={{ '--mw-accent': m.accent } as React.CSSProperties}>
                <Icon name={m.icon} size={16} />
                {m.shortName}
              </NavLink>
            ))}
          </nav>
          <div className="mw-header__actions">
            <button type="button" className="mw-header-btn mw-searchbtn" onClick={() => setSearchOpen(true)} aria-label="Suchen (Strg+K)">
              <Icon name="search" />
              <span className="mw-hide-sm">Suchen</span>
              <kbd className="mw-kbd mw-hide-sm">Strg K</kbd>
            </button>
            <UserMenu />
          </div>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <main id="main" className="mw-main" tabIndex={-1}>
        <Suspense fallback={<div className="mw-container"><Loading /></div>}>{children ?? <Outlet />}</Suspense>
      </main>
      <footer className="mw-footer">
        <div className="mw-container mw-spread">
          <span>
            © MedTech World · Eine Plattform, eine Datenbasis, acht Module.
          </span>
          <span className="mw-row">
            <Link to="/quellen">Quellenverzeichnis</Link>
            <Link to="/ueber">Über & Qualitätsgrundsätze</Link>
            <Link to="/datenschutz">Datenschutz</Link>
          </span>
        </div>
        <div className="mw-container mw-small mw-muted" style={{ marginTop: 8 }}>
          Lern- und Informationsplattform. Ersetzt weder Gebrauchsanweisungen und Serviceunterlagen der Hersteller noch die Einweisung nach MPBetreibV.
        </div>
      </footer>
    </div>
  );
}
