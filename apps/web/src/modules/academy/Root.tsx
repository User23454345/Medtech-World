import { Route, Routes } from 'react-router';
import { Landing } from './Landing.tsx';
import { LearningPlayer } from './LearningPlayer.tsx';
import { ProtocolPage } from './ProtocolPage.tsx';
import { NotFound } from '../../pages/NotFound.tsx';
import './academy.css';

/** MedTech Prüfakademie: Startseite, Lernmodul-Player und Prüfprotokoll */
export default function Root() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="lernen/:slug" element={<LearningPlayer />} />
      <Route path="pruefung/:slug" element={<ProtocolPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
