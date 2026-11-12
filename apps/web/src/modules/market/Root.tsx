import { Route, Routes } from 'react-router';
import { NotFound } from '../../pages/NotFound.tsx';
import { InquiriesPage } from './InquiriesPage.tsx';
import { Landing } from './Landing.tsx';
import { OfferPage } from './OfferPage.tsx';
import './market.css';

/** MedTech Market – Demo-Marktplatz mit Kompatibilität aus der zentralen Datenbasis */
export default function Root() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="angebot/:slug" element={<OfferPage />} />
      <Route path="anfragen" element={<InquiriesPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
