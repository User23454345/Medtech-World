import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loading } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import Landing from './Landing.tsx';
import './repair.css';

const DiagnosePage = lazy(() => import('./DiagnosePage.tsx'));

/** MedTech Repair Lab – systematische Fehlerdiagnose an Medizingeräten */
export default function Root() {
  const { effectiveSettings } = useAuth();
  return (
    <div className={effectiveSettings.reducedMotion ? 'mw-repair mw-repair--reduced' : 'mw-repair'}>
      <Suspense
        fallback={
          <div className="mw-container mw-page">
            <Loading />
          </div>
        }
      >
        <Routes>
          <Route index element={<Landing />} />
          <Route path="diagnose/:slug" element={<DiagnosePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}
