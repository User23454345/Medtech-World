import { useMemo } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { MODULES } from '@medtech/core';
import { UiProvider, type LinkComponent } from '@medtech/ui';
import { AuthProvider } from './lib/auth.tsx';
import { WEB_MODULE_LIST } from './modules/registry.ts';
import { AppShell } from './shell/AppShell.tsx';
import { EntityPage } from './shell/EntityPage.tsx';
import { Home } from './pages/Home.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import {
  AccountHome,
  AdminUsersPage,
  FavoritesPage,
  HistoryPage,
  LoginPage,
  NotesPage,
  ProgressPage,
  RegisterPage,
  SettingsPage,
} from './pages/account.tsx';
import { AboutPage, PrivacyPage, QualityPage, SourcesPage } from './pages/platform.tsx';

const RouterLink: LinkComponent = ({ to, children, ...rest }) => (
  <Link to={to} {...rest}>
    {children}
  </Link>
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="suche" element={<SearchPage />} />
        <Route path="e/:type/:slug" element={<EntityPage />} />
        {WEB_MODULE_LIST.map((m) => (
          <Route key={m.id} path={`${MODULES[m.id].path.slice(1)}/*`} element={<m.Root />} />
        ))}
        <Route path="konto">
          <Route index element={<AccountHome />} />
          <Route path="anmelden" element={<LoginPage />} />
          <Route path="registrieren" element={<RegisterPage />} />
          <Route path="favoriten" element={<FavoritesPage />} />
          <Route path="fortschritt" element={<ProgressPage />} />
          <Route path="notizen" element={<NotesPage />} />
          <Route path="verlauf" element={<HistoryPage />} />
          <Route path="einstellungen" element={<SettingsPage />} />
        </Route>
        <Route path="admin/nutzer" element={<AdminUsersPage />} />
        <Route path="qualitaet" element={<QualityPage />} />
        <Route path="quellen" element={<SourcesPage />} />
        <Route path="ueber" element={<AboutPage />} />
        <Route path="datenschutz" element={<PrivacyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const ui = useMemo(() => ({ Link: RouterLink }), []);
  return (
    <BrowserRouter>
      <UiProvider value={ui}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  );
}
