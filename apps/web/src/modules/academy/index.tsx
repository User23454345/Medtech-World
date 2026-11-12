import { lazy } from 'react';
import { MODULES, type EntityDetail } from '@medtech/core';
import type { EntityAction, WebModule } from '../types.ts';
import { firstTeachingModule } from './academy-logic.ts';

const base = MODULES.academy.path;

const LearningModulePanel = lazy(() => import('./panels.tsx').then((m) => ({ default: m.LearningModulePanel })));
const TestProcedurePanel = lazy(() => import('./panels.tsx').then((m) => ({ default: m.TestProcedurePanel })));
const QuizQuestionPanel = lazy(() => import('./panels.tsx').then((m) => ({ default: m.QuizQuestionPanel })));

function actions(entity: EntityDetail): EntityAction[] {
  if (entity.type === 'learning_module') return [{ label: 'Lernmodul starten', to: `${base}/lernen/${entity.slug}`, icon: 'play' }];
  if (entity.type === 'test_procedure') return [{ label: 'Prüfprotokoll ausfüllen', to: `${base}/pruefung/${entity.slug}`, icon: 'clipboard' }];
  if (entity.type === 'device' || entity.type === 'component' || entity.type === 'term') {
    const m = firstTeachingModule(entity.relations);
    if (m) return [{ label: 'Lernen', to: `${base}/lernen/${m.slug}`, icon: 'graduation' }];
  }
  return [];
}

export const module: WebModule = {
  id: 'academy',
  Root: lazy(() => import('./Root.tsx')),
  entityPanels: [
    { types: ['learning_module'], title: 'Lernmodul', icon: 'graduation', placement: 'main', Component: LearningModulePanel },
    { types: ['test_procedure'], title: 'Prüfablauf', icon: 'clipboard', placement: 'main', Component: TestProcedurePanel },
    { types: ['quiz_question'], title: 'Frage üben', icon: 'question', placement: 'main', Component: QuizQuestionPanel },
  ],
  entityActions: actions,
};
