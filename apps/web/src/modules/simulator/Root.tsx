import { Route, Routes } from 'react-router';
import { NotFound } from '../../pages/NotFound.tsx';
import { Landing } from './Landing.tsx';
import { RunPage } from './RunPage.tsx';

/** MedTech Simulator: Übersicht und Simulationslauf (/simulator/:slug) */
export default function Root() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path=":slug" element={<RunPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
