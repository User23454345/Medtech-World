import { lazy, Suspense } from 'react';
import { Link, Route, Routes, useParams } from 'react-router';
import { ENTITY_TYPE_DEFS, MODULES, entityPath, type EntityDetail, type EntityType } from '@medtech/core';
import {
  Badge,
  Breadcrumbs,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  ModuleHero,
  QualityBadges,
  QualityNotices,
  Section,
  Stat,
  TypeBadge,
} from '@medtech/ui';
import { api } from '../../lib/api.ts';
import { useAsync, useDocumentTitle, useEntity, useRecordVisit } from '../../lib/hooks.ts';
import { FavoriteButton } from '../../shell/EntityPage.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import { linkedComponents, sceneOf } from './scene-math.ts';
import './explorer.css';

const SceneViewer = lazy(() => import('./SceneViewer.tsx'));

const SCENE_TYPES = ['device', 'product_model'] as const satisfies readonly EntityType[];
type SceneType = (typeof SCENE_TYPES)[number];

export default function Root() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path=":type/:slug" element={<ViewerPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/** Lädt Details mit begrenzter Parallelität */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Alle Geräte und Produktmodelle mit 3D-Szene (aus der zentralen API) */
function useSceneEntities() {
  return useAsync(
    async (signal) => {
      const lists = await Promise.all(SCENE_TYPES.map((type) => api.list({ type, limit: 200 }, signal)));
      const summaries = lists.flatMap((l) => l.items);
      const details = await mapLimit(summaries, 6, (s) => api.entity(s.type, s.slug, signal).catch(() => null));
      return details.filter((d): d is EntityDetail => !!d && !!sceneOf(d.data));
    },
    [],
    'explorer:scene-entities',
  );
}

function Landing() {
  const m = MODULES.explorer;
  useDocumentTitle(m.name);
  const { data, error, loading, reload } = useSceneEntities();
  const devices = data?.filter((d) => d.type === 'device') ?? [];
  const models = data?.filter((d) => d.type === 'product_model') ?? [];
  const totalParts = data?.reduce((n, d) => n + (sceneOf(d.data)?.parts.length ?? 0), 0) ?? 0;
  const totalComponents = new Set(data?.flatMap((d) => linkedComponents(sceneOf(d.data)!)) ?? []).size;

  return (
    <div className="mw-container mw-page">
      <ModuleHero module="explorer" />
      {loading && !data ? (
        <Loading label="3D-Modelle werden geladen …" />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState title="Noch keine 3D-Modelle vorhanden" icon="cube">
          Sobald Geräte oder Produktmodelle eine 3D-Szene erhalten, erscheinen sie hier.
        </EmptyState>
      ) : (
        <>
          <div className="mw-grid" style={{ ['--mw-grid-min' as string]: '180px', marginTop: 8 }}>
            <Stat value={data.length} label="3D-Modelle" />
            <Stat value={totalParts} label="Bauteile" />
            <Stat value={totalComponents} label="verknüpfte Komponenten" />
          </div>
          {devices.length ? (
            <Section title="Gerätetypen in 3D" icon="device">
              <SceneCards items={devices} />
            </Section>
          ) : null}
          {models.length ? (
            <Section title="Produktmodelle in 3D" icon="tag">
              <SceneCards items={models} />
            </Section>
          ) : null}
          <p className="mw-small mw-muted">
            Die 3D-Modelle sind vereinfachte, schematische Darstellungen zur Veranschaulichung von Aufbau und Funktionsprinzip – keine maßstabsgetreuen
            Konstruktionsdaten einzelner Hersteller.
          </p>
        </>
      )}
    </div>
  );
}

function SceneCards({ items }: { items: EntityDetail[] }) {
  return (
    <ul className="mw-explorer-cards mw-list-plain">
      {items.map((e) => {
        const scene = sceneOf(e.data)!;
        const comps = linkedComponents(scene).length;
        return (
          <li key={e.id}>
            <Card className="mw-explorer-card" as="article">
              <div className="mw-row" style={{ gap: 6 }}>
                <TypeBadge type={e.type} />
                <QualityBadges flags={e.flags} reviewStatus={e.reviewStatus} />
              </div>
              <h3 className="mw-explorer-card__title">
                <Link to={`${e.type}/${e.slug}`}>{e.title}</Link>
              </h3>
              <p className="mw-explorer-card__summary">{e.summary}</p>
              <div className="mw-explorer-swatches" aria-hidden>
                {scene.parts.map((p) => (
                  <span key={p.id} className="mw-explorer-swatch" style={{ background: p.color }} title={p.label} />
                ))}
              </div>
              <p className="mw-small mw-muted" style={{ margin: 0 }}>
                {scene.parts.length} Bauteile · {comps} verknüpfte Komponente{comps === 1 ? '' : 'n'}
              </p>
              <div className="mw-row" style={{ gap: 8 }}>
                <ButtonLink to={`/explorer/${e.type}/${e.slug}`} variant="primary" size="sm" icon="cube">
                  In 3D erkunden
                </ButtonLink>
                <ButtonLink to={entityPath(e.id)} size="sm" icon="book">
                  Detailseite
                </ButtonLink>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ViewerPage() {
  const { type, slug } = useParams();
  const valid = (SCENE_TYPES as readonly string[]).includes(type ?? '') && /^[a-z0-9-]+$/.test(slug ?? '');
  const id = valid ? `${type}:${slug}` : null;
  const { data, error, loading, reload } = useEntity(id);
  useDocumentTitle(data ? `${data.title} in 3D` : MODULES.explorer.name);
  useRecordVisit(data?.id, 'explorer', 'view');

  if (!valid) return <NotFound />;
  if (loading && !data)
    return (
      <div className="mw-container mw-page">
        <Loading />
      </div>
    );
  if (error) {
    if ((error as { status?: number }).status === 404) return <NotFound what={ENTITY_TYPE_DEFS[type as SceneType].label} />;
    return (
      <div className="mw-container mw-page">
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) return <NotFound />;
  const scene = sceneOf(data.data);
  const def = ENTITY_TYPE_DEFS[data.type];

  return (
    <div className="mw-container mw-page">
      <Breadcrumbs items={[{ label: MODULES.explorer.shortName, to: MODULES.explorer.path }, { label: data.title }]} />
      <header className="mw-page-header">
        <div className="mw-page-header__eyebrow">
          <TypeBadge type={data.type} />
          {data.demo ? <Badge tone="demo">Demo-Inhalt</Badge> : null}
          <Badge tone="info" icon="cube">
            3D-Modell
          </Badge>
        </div>
        <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
          <h1 className="mw-page-header__title">{data.title}</h1>
          <div className="mw-row">
            <FavoriteButton entityId={data.id} />
            <ButtonLink to={entityPath(data.id)} icon="book">
              {def.label}-Detailseite
            </ButtonLink>
          </div>
        </div>
        <p className="mw-page-header__lead">{data.summary}</p>
      </header>
      <QualityNotices flags={data.flags} />
      {scene ? (
        <Section title="Interaktives 3D-Modell" icon="cube">
          <Suspense fallback={<Loading label="3D-Ansicht wird geladen …" />}>
            <SceneViewer scene={scene} title={data.title} />
          </Suspense>
          <p className="mw-small mw-muted" style={{ marginTop: 12 }}>
            Schematische Darstellung zur Veranschaulichung. Verbindliche Angaben zu Aufbau und Komponenten liefern die Herstellerunterlagen.
          </p>
        </Section>
      ) : (
        <EmptyState title="Für diesen Inhalt gibt es noch kein 3D-Modell" icon="cube">
          <ButtonLink to={entityPath(data.id)} icon="book">
            Zur Detailseite
          </ButtonLink>
        </EmptyState>
      )}
    </div>
  );
}
