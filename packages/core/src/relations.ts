import type { EntityType } from './entity-types.ts';

/**
 * Typisierte Relationen zwischen Entitäten (Wissensgraph).
 *
 * Eine Relation wird genau EINMAL gespeichert (from → to). Die Gegenrichtung
 * wird beim Lesen über `inverseLabel` erzeugt. So bleiben Verknüpfungen
 * konsistent: Wer "Pulsoximeter hat Komponente SpO2-Sensor" pflegt, sieht auf
 * der Sensorseite automatisch "verbaut in Pulsoximeter".
 */
export const RELATION_TYPES = [
  'model_of',
  'manufactured_by',
  'has_component',
  'uses_principle',
  'teaches',
  'quiz_for',
  'simulates',
  'affects',
  'causes',
  'tests',
  'based_on',
  'fits',
  'documents',
  'illustrates',
  'requires_skill',
  'offers',
  'remedied_by',
  'related',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface RelationDefinition {
  type: RelationType;
  /** Beschriftung aus Sicht der Quelle: "<from> {label} <to>" */
  label: string;
  /** Beschriftung aus Sicht des Ziels */
  inverseLabel: string;
  from: readonly EntityType[] | '*';
  to: readonly EntityType[] | '*';
  /** Symmetrische Relationen haben keine Richtung */
  symmetric?: boolean;
}

const HARDWARE = ['device', 'product_model', 'component'] as const;

export const RELATION_DEFS: Record<RelationType, RelationDefinition> = {
  model_of: {
    type: 'model_of',
    label: 'ist Produktmodell von',
    inverseLabel: 'Produktmodelle',
    from: ['product_model'],
    to: ['device'],
  },
  manufactured_by: {
    type: 'manufactured_by',
    label: 'hergestellt von',
    inverseLabel: 'Produkte',
    from: ['product_model', 'spare_part', 'component'],
    to: ['manufacturer'],
  },
  has_component: {
    type: 'has_component',
    label: 'Komponenten',
    inverseLabel: 'verbaut in',
    from: HARDWARE,
    to: ['component'],
  },
  uses_principle: {
    type: 'uses_principle',
    label: 'Messprinzip / Grundlagen',
    inverseLabel: 'angewendet in',
    from: ['device', 'product_model', 'component', 'simulation', 'test_procedure', 'fault'],
    to: ['term'],
  },
  teaches: {
    type: 'teaches',
    label: 'behandelt',
    inverseLabel: 'Lernmodule',
    from: ['learning_module'],
    to: '*',
  },
  quiz_for: {
    type: 'quiz_for',
    label: 'gehört zu',
    inverseLabel: 'Quizfragen',
    from: ['quiz_question'],
    to: ['learning_module', 'device', 'term', 'test_procedure', 'component', 'fault', 'legal_reference'],
  },
  simulates: {
    type: 'simulates',
    label: 'simuliert',
    inverseLabel: 'Simulationen',
    from: ['simulation'],
    to: ['device', 'term', 'fault', 'component'],
  },
  affects: {
    type: 'affects',
    label: 'betrifft',
    inverseLabel: 'Fehlerbilder',
    from: ['fault'],
    to: HARDWARE,
  },
  causes: {
    type: 'causes',
    label: 'mögliche Ursache für',
    inverseLabel: 'mögliche Ursachen',
    from: ['component', 'fault'],
    to: ['fault'],
  },
  tests: {
    type: 'tests',
    label: 'prüft',
    inverseLabel: 'Prüfverfahren',
    from: ['test_procedure'],
    to: HARDWARE,
  },
  based_on: {
    type: 'based_on',
    label: 'Rechtsgrundlage',
    inverseLabel: 'angewendet in',
    from: ['test_procedure', 'learning_module', 'document', 'device', 'job_profile'],
    to: ['legal_reference'],
  },
  fits: {
    type: 'fits',
    label: 'passend für',
    inverseLabel: 'Ersatzteile',
    from: ['spare_part'],
    to: HARDWARE,
  },
  documents: {
    type: 'documents',
    label: 'dokumentiert',
    inverseLabel: 'Dokumentationen',
    from: ['document'],
    to: '*',
  },
  illustrates: {
    type: 'illustrates',
    label: 'zeigt',
    inverseLabel: 'Bilder',
    from: ['media'],
    to: '*',
  },
  requires_skill: {
    type: 'requires_skill',
    label: 'Kompetenzen / Lernpfad',
    inverseLabel: 'relevant für Berufsbild',
    from: ['job_profile'],
    to: ['learning_module', 'term', 'test_procedure', 'device'],
  },
  offers: {
    type: 'offers',
    label: 'Angebot für',
    inverseLabel: 'Angebote im Market',
    from: ['offer'],
    to: ['spare_part', 'product_model', 'device'],
  },
  remedied_by: {
    type: 'remedied_by',
    label: 'Abhilfe / benötigt',
    inverseLabel: 'hilft bei',
    from: ['fault'],
    to: ['spare_part', 'test_procedure', 'document', 'learning_module'],
  },
  related: {
    type: 'related',
    label: 'Siehe auch',
    inverseLabel: 'Siehe auch',
    from: '*',
    to: '*',
    symmetric: true,
  },
};

export function isRelationAllowed(rel: RelationType, from: EntityType, to: EntityType): boolean {
  const def = RELATION_DEFS[rel];
  const okFrom = def.from === '*' || def.from.includes(from);
  const okTo = def.to === '*' || def.to.includes(to);
  if (okFrom && okTo) return true;
  if (def.symmetric) {
    const revFrom = def.from === '*' || def.from.includes(to);
    const revTo = def.to === '*' || def.to.includes(from);
    return revFrom && revTo;
  }
  return false;
}
