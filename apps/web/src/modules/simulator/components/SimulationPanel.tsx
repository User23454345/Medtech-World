import type { EntityDetail, SimulationData } from '@medtech/core';
import { Badge, ButtonLink, EntityChip, Icon } from '@medtech/ui';
import { ENGINE_INFO } from '../engine-info.ts';
import { simulationRunPath } from '../logic.ts';
import '../simulator.css';

/** Panel auf der einheitlichen Detailseite einer Simulation: Lernziele, Szenarien, Start */
export default function SimulationPanel({ entity }: { entity: EntityDetail }) {
  const data = entity.data as Partial<SimulationData> | undefined;
  const info = data?.engine ? ENGINE_INFO[data.engine] : undefined;
  const scenarios = data?.scenarios ?? [];
  const titleOf = (id: string) => {
    for (const g of entity.relations) {
      const it = g.items.find((i) => i.id === id);
      if (it) return it;
    }
    return { id, type: 'fault' as const, title: entity.linkedTitles?.[id] ?? id, demo: false };
  };

  return (
    <div className="mw-stack mw-simulator-panel">
      <div className="mw-spread">
        <div className="mw-row" style={{ gap: 8 }}>
          {info ? <Badge tone="info">Modell: {info.label}</Badge> : <Badge tone="warn">Modell nicht verfügbar</Badge>}
          <span className="mw-small mw-muted">{scenarios.length} {scenarios.length === 1 ? 'Szenario' : 'Szenarien'}</span>
        </div>
        <ButtonLink to={simulationRunPath(entity.id)} variant="primary" icon="play">
          Simulation starten
        </ButtonLink>
      </div>
      {data?.learningGoals?.length ? (
        <div>
          <h3 className="mw-simulator-panel__h">Lernziele</h3>
          <ul className="mw-simulator-goals">
            {data.learningGoals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {scenarios.length ? (
        <div>
          <h3 className="mw-simulator-panel__h">Szenarien</h3>
          <ol className="mw-list-plain mw-simulator-scenario-list">
            {scenarios.map((s) => (
              <li key={s.id}>
                <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <strong>{s.title}</strong>
                    <div className="mw-small mw-muted">{s.description}</div>
                    {s.fault ? (
                      <div className="mw-row mw-small" style={{ gap: 6, marginTop: 4 }}>
                        <span className="mw-muted">Fehlerbild:</span>
                        <EntityChip entity={titleOf(s.fault)} />
                      </div>
                    ) : null}
                  </div>
                  <ButtonLink to={simulationRunPath(entity.id, s.id)} size="sm" icon="play">
                    <span className="mw-visually-hidden">{s.title} </span>Starten
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <p className="mw-small mw-muted" style={{ margin: 0 }}>
        <Icon name="info" size={14} /> Vereinfachtes Lehrmodell zur Veranschaulichung von Messprinzipien und Alarmen.
      </p>
    </div>
  );
}
