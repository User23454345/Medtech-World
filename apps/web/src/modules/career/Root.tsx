import { useMemo, type CSSProperties } from 'react';
import { Route, Routes } from 'react-router';
import { MODULES, entityPath } from '@medtech/core';
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, EntityCard, EntityChip, ErrorState, Icon, Loading, ModuleHero, Section, Stat, useUi } from '@medtech/ui';
import { useDocumentTitle, useRequireLogin } from '../../lib/hooks.ts';
import { NotFound } from '../../pages/NotFound.tsx';
import { computeReadiness, rankByReadiness, requiredItems, requiredLearningModules } from './career-logic.ts';
import { NextStep, ReadinessMeter } from './components.tsx';
import { useCareerProgress, useJobProfiles } from './data.ts';
import './career.css';

export default function Root() {
  return (
    <Routes>
      <Route index element={<CareerLanding />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function CareerLanding() {
  const m = MODULES.career;
  useDocumentTitle(m.name);
  const { Link } = useUi();
  const profiles = useJobProfiles();
  const progress = useCareerProgress();
  const requireLogin = useRequireLogin();

  const rows = useMemo(
    () =>
      (profiles.data ?? []).map((p) => {
        const modules = requiredLearningModules(p.relations);
        return { profile: p, modules, items: requiredItems(p.relations), readiness: computeReadiness(modules, progress.byId) };
      }),
    [profiles.data, progress.byId],
  );
  const ranked = useMemo(() => rankByReadiness(rows), [rows]);
  const distinctModules = new Set(rows.flatMap((r) => r.modules.map((x) => x.id)));
  const completedModules = [...distinctModules].filter((id) => progress.byId.get(id)?.status === 'completed').length;

  return (
    <div className="mw-container mw-page mw-career">
      <ModuleHero module="career">
        <div className="mw-row mw-career-hero__stats">
          <Stat value={profiles.data ? rows.length : '–'} label="Berufsbilder" />
          <Stat value={profiles.data ? distinctModules.size : '–'} label="geforderte Lernmodule" />
          {progress.loggedIn ? <Stat value={progress.data ? completedModules : '–'} label="davon abgeschlossen" /> : null}
        </div>
      </ModuleHero>

      <Section title="Berufsbilder" icon="briefcase" id="berufsbilder">
        <p className="mw-muted" style={{ marginTop: 0 }}>
          Typische Berufe rund um Medizintechnik – mit Aufgaben, Zugangswegen und einem Lernpfad aus Lernmodulen, Prüfabläufen und Geräten dieser Plattform.
        </p>
        {profiles.loading && !profiles.data ? (
          <Loading />
        ) : profiles.error ? (
          <ErrorState error={profiles.error} onRetry={profiles.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="Noch keine Berufsbilder vorhanden." icon="briefcase" />
        ) : (
          <div className="mw-grid" style={{ '--mw-grid-min': '280px' } as CSSProperties}>
            {rows.map((r) => (
              <EntityCard
                key={r.profile.id}
                entity={r.profile}
                footer={
                  <span className="mw-row" style={{ gap: 6 }}>
                    <Badge icon="route">{r.items.length} Kompetenzen</Badge>
                    {progress.loggedIn && progress.data && r.readiness.total ? (
                      <Badge tone={r.readiness.percent === 100 ? 'ok' : 'info'} icon="target">
                        {r.readiness.percent} % bereit
                      </Badge>
                    ) : null}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Kompetenzcheck" icon="target" id="kompetenzcheck">
        <p className="mw-muted" style={{ marginTop: 0 }}>
          Bereitschaft je Berufsbild = Anteil der geforderten Lernmodule, die du in der Academy abgeschlossen hast. Prüfabläufe, Geräte und Begriffe im Lernpfad ergänzen das
          Profil, fließen aber nicht in die Quote ein.
        </p>
        {!progress.loggedIn ? (
          <Alert tone="info" icon="user">
            <div className="mw-spread">
              <span>Melde dich an, um deinen persönlichen Kompetenzcheck zu sehen. Der Fortschritt wird aus deinen abgeschlossenen Lernmodulen berechnet.</span>
              <Button variant="primary" size="sm" onClick={() => requireLogin()}>
                Anmelden
              </Button>
            </div>
          </Alert>
        ) : progress.error ? (
          <ErrorState error={progress.error} onRetry={progress.reload} />
        ) : null}

        {profiles.data && rows.length ? (
          progress.loggedIn && progress.loading && !progress.data ? (
            <Loading label="Lernfortschritt wird geladen …" />
          ) : (
            <ol className="mw-list-plain mw-career-check">
              {(progress.loggedIn ? ranked : rows).map((r) => (
                <li key={r.profile.id}>
                  <Card className="mw-career-check__card">
                    <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
                      <h3 className="mw-career-check__title">
                        <Icon name="briefcase" size={16} />
                        <Link to={entityPath(r.profile.id)}>{r.profile.title}</Link>
                      </h3>
                      <span className="mw-small mw-muted">
                        {r.modules.length} Lernmodul{r.modules.length === 1 ? '' : 'e'} · {r.items.length - r.modules.length} weitere Kompetenz
                        {r.items.length - r.modules.length === 1 ? '' : 'en'}
                      </span>
                    </div>
                    {progress.loggedIn ? (
                      <>
                        <ReadinessMeter readiness={r.readiness} title={r.profile.title} />
                        <NextStep readiness={r.readiness} />
                      </>
                    ) : r.modules.length ? (
                      <div className="mw-row" style={{ gap: 6 }}>
                        {r.modules.map((x) => (
                          <EntityChip key={x.id} entity={x} />
                        ))}
                      </div>
                    ) : (
                      <p className="mw-small mw-muted">Keine Lernmodule hinterlegt.</p>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )
        ) : null}
        <div className="mw-row" style={{ marginTop: 16 }}>
          <ButtonLink to={MODULES.academy.path} icon="graduation">
            Zur Academy
          </ButtonLink>
          {progress.loggedIn ? (
            <ButtonLink to="/konto/fortschritt" icon="history" variant="ghost">
              Mein Lernfortschritt
            </ButtonLink>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
