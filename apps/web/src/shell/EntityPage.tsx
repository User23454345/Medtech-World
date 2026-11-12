import { Suspense, useState } from 'react';
import { useParams } from 'react-router';
import { ENTITY_TYPES, ENTITY_TYPE_DEFS, MODULES, type EntityDetail, type EntityType } from '@medtech/core';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Loading,
  Markdown,
  ModuleBadge,
  QualityNotices,
  RelationGroups,
  Section,
  SourceList,
  SpecTable,
  Textarea,
  TypeBadge,
  UiProvider,
  useUi,
} from '@medtech/ui';
import { plural } from '../lib/format.ts';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useAsync, useDocumentTitle, useEntity, useRecordVisit, useRequireLogin } from '../lib/hooks.ts';
import { actionsFor, panelsFor } from '../modules/registry.ts';
import { NotFound } from '../pages/NotFound.tsx';

export function FavoriteButton({ entityId, compact }: { entityId: string; compact?: boolean }) {
  const { favorites, toggleFavorite } = useAuth();
  const requireLogin = useRequireLogin();
  const [busy, setBusy] = useState(false);
  const active = favorites.has(entityId);
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      size={compact ? 'sm' : 'md'}
      aria-pressed={active}
      disabled={busy}
      onClick={async () => {
        if (!requireLogin()) return;
        setBusy(true);
        try {
          await toggleFavorite(entityId);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="star" filled={active} size={compact ? 14 : 18} />
      {active ? 'Favorit' : 'Merken'}
    </Button>
  );
}

/** Persönliche Notizen zu einer Entität (in allen Modulen identisch) */
export function NotesPanel({ entityId }: { entityId: string }) {
  const { user } = useAuth();
  const notes = useAsync(() => api.me.notes(entityId), [entityId, user?.id], user ? `me:notes:${entityId}` : null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requireLogin = useRequireLogin();

  if (!user) {
    return (
      <p className="mw-small mw-muted">
        <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => requireLogin()}>
          Anmelden
        </button>{' '}
        um persönliche Notizen zu speichern.
      </p>
    );
  }
  return (
    <div className="mw-stack" style={{ gap: 10 }}>
      {notes.data?.items.map((n) => (
        <div key={n.id} className="mw-note">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.text}</p>
          <div className="mw-spread mw-small mw-muted">
            <span>{new Date(n.updatedAt).toLocaleString('de-DE')}</span>
            <button
              type="button"
              className="mw-btn mw-btn--ghost mw-btn--sm"
              onClick={async () => {
                if (!window.confirm('Notiz wirklich löschen?')) return;
                setError(null);
                try {
                  await api.me.deleteNote(n.id);
                  notes.reload();
                } catch (err) {
                  setError(err);
                }
              }}
            >
              <Icon name="trash" size={14} /> Löschen
            </button>
          </div>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await api.me.createNote(entityId, text.trim());
            setText('');
            notes.reload();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
        className="mw-stack"
        style={{ gap: 8 }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Eigene Notiz …" aria-label="Neue Notiz" maxLength={10000} />
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" variant="primary" size="sm" disabled={busy || !text.trim()} icon="plus">
          Notiz speichern
        </Button>
      </form>
    </div>
  );
}

export function EntityView({ entity }: { entity: EntityDetail }) {
  const def = ENTITY_TYPE_DEFS[entity.type];
  const home = MODULES[def.homeModule];
  useDocumentTitle(entity.title);
  useRecordVisit(entity.id, def.homeModule);

  const panels = panelsFor(entity);
  const mainPanels = panels.filter((p) => p.placement !== 'aside');
  const asidePanels = panels.filter((p) => p.placement === 'aside');
  const actions = actionsFor(entity);

  return (
    <div className="mw-container mw-page">
      <Breadcrumbs
        items={[
          { label: home.shortName, to: home.path },
          { label: def.plural, to: `${home.path}?typ=${entity.type}` },
          { label: entity.title },
        ]}
      />
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <TypeBadge type={entity.type} />
          {entity.demo ? <Badge tone="demo">Demo-Inhalt</Badge> : null}
          {entity.reviewStatus === 'geprueft' ? (
            <Badge tone="ok" icon="check" title={entity.reviewer ? `Geprüft von ${entity.reviewer}` : undefined}>
              Geprüft am {new Date(entity.reviewedAt).toLocaleDateString('de-DE')}
            </Badge>
          ) : (
            <Badge tone="info">Status: {entity.reviewStatus}</Badge>
          )}
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{entity.title}</h1>
          <div className="mw-row">
            <FavoriteButton entityId={entity.id} />
          </div>
        </div>
        {entity.aliases.length ? <p className="mw-muted mw-small" style={{ marginTop: -4 }}>Auch: {entity.aliases.join(' · ')}</p> : null}
        <p className="mw-page-header__lead">{entity.summary}</p>
      </header>

      <QualityNotices flags={entity.flags} />

      {actions.length ? (
        <div className="mw-row" style={{ marginTop: 16 }}>
          {actions.map((a, i) => (
            <ButtonLink key={i} to={a.to} icon={a.icon ?? MODULES[a.module].icon} variant={i === 0 ? 'primary' : 'secondary'}>
              {a.label}
            </ButtonLink>
          ))}
        </div>
      ) : null}

      <div className="mw-two-col" style={{ marginTop: 24 }}>
        <div style={{ minWidth: 0 }}>
          {mainPanels.map((p, i) => (
            <Section key={`${p.module}-${i}`} title={p.title} icon={p.icon ?? MODULES[p.module].icon}>
              <Suspense fallback={<Loading />}>
                <p.Component entity={entity} />
              </Suspense>
            </Section>
          ))}
          {entity.body ? (
            <Section title="Beschreibung" icon="book">
              <Markdown source={entity.body} />
            </Section>
          ) : null}
          {entity.specs.length ? (
            <Section title="Technische Daten" icon="clipboard">
              <SpecTable specs={entity.specs} />
              <p className="mw-small mw-muted" style={{ marginTop: 8 }}>
                Jede Angabe ist mit ihrer Quelle belegt. Gerätespezifische Werte immer mit den aktuellen Herstellerunterlagen abgleichen.
              </p>
            </Section>
          ) : null}
          <Section title="Verknüpfte Inhalte" icon="link">
            <RelationGroups groups={entity.relations} />
          </Section>
          <Section title="Quellen" icon="file" id="quellen">
            <SourceList sources={entity.sources} />
          </Section>
        </div>
        <aside className="mw-stack" aria-label="Zusatzinformationen">
          <Card>
            <h2 className="mw-card__title">In den Modulen</h2>
            <div className="mw-row" style={{ gap: 6 }}>
              {entity.modules.map((m) => (
                <ModuleBadge key={m} module={m} link />
              ))}
            </div>
          </Card>
          {asidePanels.map((p, i) => (
            <Card key={`${p.module}-${i}`}>
              <h2 className="mw-card__title">{p.title}</h2>
              <Suspense fallback={<Loading />}>
                <p.Component entity={entity} />
              </Suspense>
            </Card>
          ))}
          <Card>
            <h2 className="mw-card__title">
              <Icon name="note" /> Meine Notizen
            </h2>
            <NotesPanel entityId={entity.id} />
          </Card>
          <Card>
            <h2 className="mw-card__title">Qualität & Herkunft</h2>
            <ul className="mw-list-plain mw-small mw-stack" style={{ gap: 6 }}>
              <li>
                <Icon name="file" size={14} /> {plural(entity.sources.length, 'Quelle', 'Quellen')}, {plural(entity.specs.length, 'belegte technische Angabe', 'belegte technische Angaben')}
              </li>
              <li>
                <Icon name="check" size={14} /> Letzte fachliche Prüfung: {new Date(entity.reviewedAt).toLocaleDateString('de-DE')}
                {entity.reviewer ? ` (${entity.reviewer})` : ''}
              </li>
              <li>
                <Icon name="link" size={14} /> ID: <code>{entity.id}</code>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** Stellt Wiki-Links im Kontext einer Entität mit echten Titeln dar */
export function EntityTitleScope({ entity, children }: { entity: EntityDetail; children: React.ReactNode }) {
  const ui = useUi();
  const titles = entity.linkedTitles ?? {};
  return <UiProvider value={{ ...ui, resolveTitle: (id) => titles[id] ?? ui.resolveTitle?.(id) }}>{children}</UiProvider>;
}

/** Einheitliche Detailseite für ALLE Inhaltstypen: /e/:type/:slug */
export function EntityPage() {
  const { type, slug } = useParams();
  const valid = (ENTITY_TYPES as readonly string[]).includes(type ?? '') && /^[a-z0-9-]+$/.test(slug ?? '');
  const id = valid ? `${type}:${slug}` : null;
  const { data, error, loading, reload } = useEntity(id);
  if (!valid) return <NotFound />;
  if (loading && !data) return <div className="mw-container mw-page"><Loading /></div>;
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound what={ENTITY_TYPE_DEFS[type as EntityType].label} />;
    return <div className="mw-container mw-page"><ErrorState error={error} onRetry={reload} /></div>;
  }
  if (!data) return <div className="mw-container mw-page"><EmptyState title="Nicht gefunden" /></div>;
  return (
    <EntityTitleScope entity={data}>
      <EntityView entity={data} />
    </EntityTitleScope>
  );
}

