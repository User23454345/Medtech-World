import { MODULES, SIMULATION_ENGINES } from '@medtech/core';
import { ButtonLink, Card, EmptyState, EntityCard, ErrorState, Icon, Loading, ModuleHero, Section } from '@medtech/ui';
import { useDocumentTitle, useEntityList } from '../../lib/hooks.ts';
import { ENGINE_INFO } from './engine-info.ts';
import { simulationRunPath } from './logic.ts';
import './simulator.css';

export function Landing() {
  useDocumentTitle(MODULES.simulator.name);
  const list = useEntityList({ type: 'simulation', limit: 200 });
  const items = list.data?.items ?? [];

  return (
    <div className="mw-container mw-page mw-simulator">
      <ModuleHero module="simulator" />
      <Section title="Simulationen" icon="play">
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState title="Noch keine Simulationen" icon="pulse">
            Sobald Simulationen in der zentralen Datenbank angelegt sind, erscheinen sie hier.
          </EmptyState>
        ) : (
          <div className="mw-grid" style={{ ['--mw-grid-min' as string]: '300px' }}>
            {items.map((e) => (
              <div key={e.id} className="mw-simulator-card">
                <EntityCard entity={e} />
                <ButtonLink to={simulationRunPath(e.id)} variant="primary" size="sm" icon="play" className="mw-simulator-card__start">
                  <span className="mw-visually-hidden">{e.title}: </span>Simulation starten
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Simulationsmodelle" icon="layers">
        <p className="mw-muted" style={{ marginTop: 0 }}>
          Alle Simulationen beruhen auf deterministischen, vereinfachten Lehrmodellen. Parameter lassen sich frei verändern; Szenarien stellen typische Situationen und Fehlerbilder aus dem Repair Lab nach.
        </p>
        <div className="mw-grid" style={{ ['--mw-grid-min' as string]: '220px' }}>
          {SIMULATION_ENGINES.map((id) => (
            <Card key={id} className="mw-simulator-engine-card">
              <h3 className="mw-card__title">
                <Icon name={ENGINE_INFO[id].icon} /> {ENGINE_INFO[id].label}
              </h3>
              <p className="mw-small mw-muted" style={{ margin: 0 }}>
                {ENGINE_INFO[id].description}
              </p>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
