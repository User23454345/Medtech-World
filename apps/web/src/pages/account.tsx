import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate, useSearchParams } from 'react-router';
import { MODULE_LIST, ROLES, ROLE_LABELS, entityPath, type Role } from '@medtech/core';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  EntityCard,
  ErrorState,
  Field,
  Icon,
  Input,
  Loading,
  PageHeader,
  ProgressBar,
  Select,
  Stat,
  Textarea,
} from '@medtech/ui';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useAsync, useDocumentTitle } from '../lib/hooks.ts';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/konto/anmelden') ? next : '/konto';
}

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="mw-container mw-page" style={{ maxWidth: 460 }}>
      <Card>
        <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
        <p className="mw-muted mw-small">Ein Konto für alle acht Module – Favoriten, Lernfortschritt und Notizen sind überall verfügbar.</p>
        {children}
      </Card>
      <p className="mw-small" style={{ textAlign: 'center', marginTop: 16 }}>
        {footer}
      </p>
    </div>
  );
}

export function LoginPage() {
  const { login, user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('weiter'));
  if (user) return <Navigate to={next} replace />;
  return (
    <AuthLayout title="Anmelden" footer={<>Noch kein Konto? <Link to={`/konto/registrieren?weiter=${encodeURIComponent(next)}`}>Jetzt registrieren</Link></>}>
      <form
        className="mw-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(email, password);
            navigate(next, { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="E-Mail-Adresse">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Passwort">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </Button>
        {import.meta.env.DEV ? (
          <Alert tone="info">
            Entwicklung: Demo-Konten <code>lernende@medtech.world</code>, <code>redaktion@medtech.world</code>, <code>admin@medtech.world</code> – Passwort <code>Demo-Passwort-1</code>
          </Alert>
        ) : null}
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register, user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('weiter'));
  if (user) return <Navigate to={next} replace />;
  return (
    <AuthLayout title="Konto erstellen" footer={<>Bereits registriert? <Link to={`/konto/anmelden?weiter=${encodeURIComponent(next)}`}>Anmelden</Link></>}>
      <form
        className="mw-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await register(form.email, form.password, form.displayName);
            navigate(next, { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Anzeigename">{(id) => <Input id={id} required minLength={2} maxLength={80} autoComplete="nickname" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <Field label="E-Mail-Adresse">{(id) => <Input id={id} type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Passwort" hint="Mindestens 10 Zeichen, Buchstaben und mindestens eine Ziffer oder ein Sonderzeichen.">
          {(id) => <Input id={id} type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <label className="mw-checkbox">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>
            Ich habe die <Link to="/datenschutz">Datenschutzhinweise</Link> gelesen.
          </span>
        </label>
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" variant="primary" disabled={busy || !consent}>
          {busy ? 'Wird erstellt …' : 'Konto erstellen'}
        </Button>
      </form>
    </AuthLayout>
  );
}

const ACCOUNT_NAV = [
  { to: '/konto', label: 'Übersicht', icon: 'home', end: true },
  { to: '/konto/favoriten', label: 'Favoriten', icon: 'star' },
  { to: '/konto/fortschritt', label: 'Lernfortschritt', icon: 'graduation' },
  { to: '/konto/notizen', label: 'Notizen', icon: 'note' },
  { to: '/konto/verlauf', label: 'Lernhistorie', icon: 'history' },
  { to: '/konto/einstellungen', label: 'Einstellungen & Datenschutz', icon: 'settings' },
] as const;

/** Rahmen für alle Kontoseiten – erzwingt Anmeldung */
export function AccountLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, ready } = useAuth();
  useDocumentTitle(title);
  if (!ready) return <div className="mw-container mw-page"><Loading /></div>;
  if (!user) return <Navigate to={`/konto/anmelden?weiter=${encodeURIComponent(window.location.pathname)}`} replace />;
  return (
    <div className="mw-container mw-page">
      <div className="mw-account-layout">
        <nav aria-label="Konto" className="mw-account-nav">
          {ACCOUNT_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false}>
              <Icon name={n.icon} size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          <PageHeader title={title} />
          {children}
        </div>
      </div>
    </div>
  );
}

export function AccountHome() {
  const { user, favorites } = useAuth();
  const progress = useAsync(() => api.me.progress(), [user?.id], user ? undefined : null);
  const notes = useAsync(() => api.me.notes(), [user?.id], user ? undefined : null);
  const history = useAsync(() => api.me.history(8), [user?.id], user ? undefined : null);
  const completed = progress.data?.items.filter((p) => p.status === 'completed' && p.entity?.type === 'learning_module').length ?? 0;
  return (
    <AccountLayout title={`Hallo, ${user?.displayName ?? ''}`}>
      <div className="mw-grid" style={{ '--mw-grid-min': '180px' } as CSSProperties}>
        <Card><Stat value={favorites.size} label="Favoriten" /></Card>
        <Card><Stat value={completed} label="abgeschlossene Lernmodule" /></Card>
        <Card><Stat value={notes.data?.items.length ?? '–'} label="Notizen" /></Card>
        <Card><Stat value={<span style={{ fontSize: 'var(--mw-fs-xl)' }}>{user ? ROLE_LABELS[user.role] : '–'}</span>} label="Rolle" /></Card>
      </div>
      <h2 style={{ marginTop: 32 }}>Zuletzt angesehen</h2>
      {history.loading ? <Loading /> : <HistoryList items={history.data?.items ?? []} />}
    </AccountLayout>
  );
}

export function FavoritesPage() {
  const { user } = useAuth();
  const favs = useAsync(() => api.me.favorites(), [user?.id], user ? undefined : null);
  return (
    <AccountLayout title="Favoriten">
      {favs.loading ? (
        <Loading />
      ) : favs.error ? (
        <ErrorState error={favs.error} onRetry={favs.reload} />
      ) : !favs.data?.items.length ? (
        <EmptyState title="Noch keine Favoriten" icon="star">
          <p>Markiere Inhalte in jedem Modul mit „Merken“.</p>
        </EmptyState>
      ) : (
        <div className="mw-grid">
          {favs.data.items.map((f) =>
            f.entity ? (
              <EntityCard key={f.entityId} entity={f.entity} />
            ) : (
              <Card key={f.entityId}>
                <p className="mw-muted">Dieser Inhalt ist nicht mehr verfügbar ({f.entityId}).</p>
                <Button size="sm" icon="trash" onClick={async () => { await api.me.removeFavorite(f.entityId); favs.reload(); }}>
                  Entfernen
                </Button>
              </Card>
            ),
          )}
        </div>
      )}
    </AccountLayout>
  );
}

export function ProgressPage() {
  const { user } = useAuth();
  const progress = useAsync(() => api.me.progress(), [user?.id], user ? undefined : null);
  const modules = useAsync((s) => api.list({ type: 'learning_module', limit: 500 }, s), [], 'list:learning_module:all');
  const byId = new Map(progress.data?.items.map((p) => [p.entityId, p]));
  const total = modules.data?.total ?? 0;
  const done = modules.data?.items.filter((m) => byId.get(m.id)?.status === 'completed').length ?? 0;
  return (
    <AccountLayout title="Lernfortschritt">
      {progress.loading || modules.loading ? (
        <Loading />
      ) : (
        <>
          <Card>
            <div className="mw-spread">
              <strong>
                {done} von {total} Lernmodulen abgeschlossen
              </strong>
              <span className="mw-muted">{total ? Math.round((done / total) * 100) : 0} %</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <ProgressBar value={total ? (done / total) * 100 : 0} label="Gesamtfortschritt" />
            </div>
          </Card>
          <div className="mw-table-wrap" style={{ marginTop: 16 }}>
            <table className="mw-table">
              <thead>
                <tr>
                  <th>Lernmodul</th>
                  <th>Status</th>
                  <th>Bestes Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {modules.data?.items.map((m) => {
                  const p = byId.get(m.id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link to={entityPath(m.id)}>{m.title}</Link>
                      </td>
                      <td>{p ? <Badge tone={p.status === 'completed' ? 'ok' : 'info'}>{p.status === 'completed' ? 'Abgeschlossen' : 'Begonnen'}</Badge> : <span className="mw-muted">offen</span>}</td>
                      <td>{p?.score != null ? `${p.score} %` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {progress.data?.items.some((p) => p.entity?.type !== 'learning_module') ? (
            <>
              <h2 style={{ marginTop: 24 }}>Weitere Aktivitäten</h2>
              <ul className="mw-list-plain mw-stack" style={{ gap: 6 }}>
                {progress.data.items
                  .filter((p) => p.entity && p.entity.type !== 'learning_module')
                  .map((p) => (
                    <li key={p.entityId} className="mw-spread">
                      <Link to={entityPath(p.entityId)}>{p.entity!.title}</Link>
                      <Badge tone={p.status === 'completed' ? 'ok' : 'info'}>{p.status === 'completed' ? 'Abgeschlossen' : 'Begonnen'}{p.score != null ? ` · ${p.score} %` : ''}</Badge>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </AccountLayout>
  );
}

export function NotesPage() {
  const { user } = useAuth();
  const notes = useAsync(() => api.me.notes(), [user?.id], user ? undefined : null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  return (
    <AccountLayout title="Notizen">
      <Card>
        <form
          className="mw-stack"
          style={{ gap: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await api.me.createNote(null, text.trim());
            setText('');
            notes.reload();
          }}
        >
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Allgemeine Notiz (Notizen zu Inhalten legst du direkt auf deren Detailseite an) …" aria-label="Neue Notiz" />
          <Button type="submit" variant="primary" size="sm" icon="plus" disabled={!text.trim()}>
            Notiz speichern
          </Button>
        </form>
      </Card>
      <div className="mw-stack" style={{ marginTop: 16, gap: 10 }}>
        {notes.loading ? <Loading /> : null}
        {notes.data?.items.length === 0 ? <EmptyState title="Noch keine Notizen" icon="note" /> : null}
        {notes.data?.items.map((n) => (
          <Card key={n.id}>
            <div className="mw-spread mw-small mw-muted" style={{ marginBottom: 6 }}>
              <span>
                {n.entity ? <Link to={entityPath(n.entity.id)}>{n.entity.title}</Link> : n.entityId ? 'Entfernter Inhalt' : 'Allgemein'} ·{' '}
                {new Date(n.updatedAt).toLocaleString('de-DE')}
              </span>
              <span className="mw-row" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing({ id: n.id, text: n.text })}>
                  Bearbeiten
                </Button>
                <Button size="sm" variant="ghost" icon="trash" onClick={async () => { await api.me.deleteNote(n.id); notes.reload(); }}>
                  Löschen
                </Button>
              </span>
            </div>
            {editing?.id === n.id ? (
              <form
                className="mw-stack"
                style={{ gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  await api.me.updateNote(n.id, editing.text);
                  setEditing(null);
                  notes.reload();
                }}
              >
                <Textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} aria-label="Notiz bearbeiten" />
                <div className="mw-row">
                  <Button type="submit" size="sm" variant="primary">Speichern</Button>
                  <Button size="sm" onClick={() => setEditing(null)}>Abbrechen</Button>
                </div>
              </form>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.text}</p>
            )}
          </Card>
        ))}
      </div>
    </AccountLayout>
  );
}

function HistoryList({ items }: { items: Awaited<ReturnType<typeof api.me.history>>['items'] }) {
  if (!items.length) return <EmptyState title="Noch keine Einträge" icon="history" />;
  const ACTION: Record<string, string> = { view: 'angesehen', quiz: 'Quiz', simulation: 'Simulation', diagnosis: 'Diagnose' };
  return (
    <ol className="mw-list-plain mw-stack" style={{ gap: 6 }}>
      {items.map((h, i) => (
        <li key={i} className="mw-spread mw-history-item">
          <span>
            {h.entity ? <Link to={entityPath(h.entityId)}>{h.entity.title}</Link> : <span className="mw-muted">Entfernter Inhalt</span>}{' '}
            <Badge>{ACTION[h.action] ?? h.action}</Badge>
          </span>
          <span className="mw-small mw-muted">{new Date(h.at).toLocaleString('de-DE')}</span>
        </li>
      ))}
    </ol>
  );
}

export function HistoryPage() {
  const { user, settings } = useAuth();
  const history = useAsync(() => api.me.history(200), [user?.id], user ? undefined : null);
  return (
    <AccountLayout title="Lernhistorie">
      {settings?.trackHistory === false ? (
        <Alert tone="info">Die Lernhistorie ist in deinen Einstellungen deaktiviert. Es werden keine Besuche gespeichert.</Alert>
      ) : null}
      <div className="mw-row" style={{ margin: '12px 0' }}>
        <Button
          size="sm"
          icon="trash"
          onClick={async () => {
            if (!confirm('Gesamte Lernhistorie löschen?')) return;
            await api.me.clearHistory();
            history.reload();
          }}
        >
          Historie löschen
        </Button>
      </div>
      {history.loading ? <Loading /> : <HistoryList items={history.data?.items ?? []} />}
    </AccountLayout>
  );
}

export function SettingsPage() {
  const { user, settings, updateSettings, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.displayName ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [deletePw, setDeletePw] = useState('');

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message });
    }
  };

  return (
    <AccountLayout title="Einstellungen & Datenschutz">
      {msg ? <Alert tone={msg.tone} role="status">{msg.text}</Alert> : null}
      <div className="mw-stack" style={{ marginTop: 16 }}>
        <Card>
          <h2 className="mw-card__title">Profil</h2>
          <form className="mw-row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); void run(async () => setUser((await api.me.update({ displayName: name })).user), 'Profil gespeichert.'); }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="Anzeigename">{(id) => <Input id={id} value={name} minLength={2} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
            </div>
            <Button type="submit" variant="primary">Speichern</Button>
          </form>
          <p className="mw-small mw-muted" style={{ marginTop: 8 }}>
            E-Mail: {user?.email} · Rolle: {user ? ROLE_LABELS[user.role] : ''}
          </p>
        </Card>

        <Card>
          <h2 className="mw-card__title">Darstellung & Verhalten</h2>
          <div className="mw-grid" style={{ '--mw-grid-min': '220px' } as CSSProperties}>
            <Field label="Farbschema">
              {(id) => (
                <Select id={id} value={settings?.theme ?? 'system'} onChange={(e) => void updateSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })}>
                  <option value="system">Wie System</option>
                  <option value="light">Hell</option>
                  <option value="dark">Dunkel</option>
                </Select>
              )}
            </Field>
            <Field label="Startmodul">
              {(id) => (
                <Select id={id} value={settings?.startModule ?? 'wiki'} onChange={(e) => void updateSettings({ startModule: e.target.value as never })}>
                  {MODULE_LIST.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="mw-stack" style={{ marginTop: 12, gap: 8 }}>
            <label className="mw-checkbox">
              <input type="checkbox" checked={settings?.reducedMotion ?? false} onChange={(e) => void updateSettings({ reducedMotion: e.target.checked })} />
              Animationen reduzieren
            </label>
            <label className="mw-checkbox">
              <input type="checkbox" checked={settings?.trackHistory ?? true} onChange={(e) => void updateSettings({ trackHistory: e.target.checked })} />
              Lernhistorie aufzeichnen (beim Deaktivieren wird die vorhandene Historie gelöscht)
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="mw-card__title">Passwort ändern</h2>
          <form
            className="mw-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.me.changePassword(pw.current, pw.next);
                setPw({ current: '', next: '' });
              }, 'Passwort geändert. Andere Sitzungen wurden abgemeldet.');
            }}
          >
            <Field label="Aktuelles Passwort">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />}</Field>
            <Field label="Neues Passwort">{(id) => <Input id={id} type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />}</Field>
            <div><Button type="submit">Passwort ändern</Button></div>
          </form>
        </Card>

        <Card>
          <h2 className="mw-card__title">Meine Daten (DSGVO)</h2>
          <p className="mw-small">Du kannst alle zu deinem Konto gespeicherten Daten jederzeit herunterladen (Art. 15/20 DSGVO) oder dein Konto vollständig löschen (Art. 17 DSGVO).</p>
          <a className="mw-btn mw-btn--secondary" href={api.me.exportUrl} download>
            <Icon name="download" /> Daten exportieren (JSON)
          </a>
          <hr className="mw-divider" />
          <form
            className="mw-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!confirm('Konto und alle Daten unwiderruflich löschen?')) return;
              void run(async () => {
                await api.me.deleteAccount(deletePw);
                await logout();
                navigate('/');
              }, 'Konto gelöscht.');
            }}
          >
            <Field label="Zum Löschen Passwort bestätigen">{(id) => <Input id={id} type="password" autoComplete="current-password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required />}</Field>
            <div><Button type="submit" variant="danger" icon="trash">Konto löschen</Button></div>
          </form>
        </Card>
      </div>
    </AccountLayout>
  );
}

export function AdminUsersPage() {
  const { can, user } = useAuth();
  const users = useAsync(() => api.admin.users(), [user?.id], user ? undefined : null);
  useDocumentTitle('Nutzerverwaltung');
  if (!can('users:manage')) return <div className="mw-container mw-page"><Alert tone="danger">Keine Berechtigung.</Alert></div>;
  return (
    <div className="mw-container mw-page">
      <PageHeader title="Nutzerverwaltung" lead="Rollen steuern die Berechtigungen in allen Modulen." />
      {users.loading ? <Loading /> : users.error ? <ErrorState error={users.error} /> : (
        <div className="mw-table-wrap">
          <table className="mw-table">
            <thead><tr><th>Name</th><th>E-Mail</th><th>Registriert</th><th>Rolle</th></tr></thead>
            <tbody>
              {users.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString('de-DE')}</td>
                  <td>
                    <Select
                      aria-label={`Rolle von ${u.displayName}`}
                      value={u.role}
                      disabled={u.id === user?.id}
                      onChange={async (e) => {
                        await api.admin.setRole(u.id, e.target.value as Role);
                        users.reload();
                      }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mw-small mw-muted" style={{ marginTop: 12 }}>
        Zurück zur <ButtonLink to="/" size="sm">Startseite</ButtonLink>
      </p>
    </div>
  );
}
