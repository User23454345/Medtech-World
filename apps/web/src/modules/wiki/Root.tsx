import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loading } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import WikiLanding from './pages/WikiLanding.tsx';
import './wiki.css';

const GlossaryPage = lazy(() => import('./pages/GlossaryPage.tsx'));
const DevicesPage = lazy(() => import('./pages/DevicesPage.tsx'));
const ManufacturersPage = lazy(() => import('./pages/ManufacturersPage.tsx'));
const LegalPage = lazy(() => import('./pages/LegalPage.tsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.tsx'));

/** MedTech Wiki – zentrales Nachschlagewerk der Plattform */
export default function Root() {
  const { effectiveSettings } = useAuth();
  return (
    <div className={effectiveSettings.reducedMotion ? 'mw-wiki mw-wiki--reduced-motion' : 'mw-wiki'}>
      <Suspense
        fallback={
          <div className="mw-container mw-page">
            <Loading />
          </div>
        }
      >
        <Routes>
          <Route index element={<WikiLanding />} />
          <Route path="glossar" element={<GlossaryPage />} />
          <Route path="geraete" element={<DevicesPage />} />
          <Route path="hersteller" element={<ManufacturersPage />} />
          <Route path="recht" element={<LegalPage />} />
          <Route path="dokumente" element={<DocumentsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}
