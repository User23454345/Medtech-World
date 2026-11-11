import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, can, type Permission, type PublicUser, type UserSettings } from '@medtech/core';
import { api } from './api.ts';
import { invalidateCache } from './cache.ts';

/**
 * Gemeinsames Benutzerkonto für alle Module: Sitzung, Einstellungen und
 * Favoriten (als Set für schnelle Abfragen in Karten und Detailseiten).
 */
interface AuthContextValue {
  user: PublicUser | null;
  settings: UserSettings | null;
  ready: boolean;
  favorites: Set<string>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  setUser: (u: PublicUser) => void;
  toggleFavorite: (entityId: string) => Promise<boolean>;
  can: (p: Permission) => boolean;
  /** Effektive Einstellungen (Gäste: lokale Einstellungen) */
  effectiveSettings: UserSettings;
  setGuestSettings: (patch: Partial<UserSettings>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_KEY = 'mw-guest-settings';

function loadGuestSettings(): UserSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(GUEST_KEY) ?? '{}') as Partial<UserSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [guestSettings, setGuestSettingsState] = useState<UserSettings>(loadGuestSettings);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await api.me.favorites();
      setFavorites(new Set(res.items.map((f) => f.entityId)));
    } catch {
      setFavorites(new Set());
    }
  }, []);

  useEffect(() => {
    api.auth
      .me()
      .then(async (res) => {
        setUserState(res.user);
        setSettings(res.settings);
        if (res.user) await loadFavorites();
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [loadFavorites]);

  const afterAuth = useCallback(
    async (res: { user: PublicUser; settings: UserSettings }) => {
      setUserState(res.user);
      setSettings(res.settings);
      invalidateCache();
      await loadFavorites();
    },
    [loadFavorites],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      settings,
      ready,
      favorites,
      login: async (email, password) => afterAuth(await api.auth.login(email, password)),
      register: async (email, password, displayName) => afterAuth(await api.auth.register(email, password, displayName)),
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        setUserState(null);
        setSettings(null);
        setFavorites(new Set());
        invalidateCache();
      },
      updateSettings: async (patch) => {
        if (!user) {
          const next = { ...guestSettings, ...patch };
          setGuestSettingsState(next);
          localStorage.setItem(GUEST_KEY, JSON.stringify(next));
          return;
        }
        setSettings(await api.me.updateSettings(patch));
      },
      setUser: setUserState,
      toggleFavorite: async (entityId) => {
        const isFav = favorites.has(entityId);
        if (isFav) await api.me.removeFavorite(entityId);
        else await api.me.addFavorite(entityId);
        setFavorites((prev) => {
          const next = new Set(prev);
          if (isFav) next.delete(entityId);
          else next.add(entityId);
          return next;
        });
        invalidateCache('me:');
        return !isFav;
      },
      can: (p) => can(user?.role, p),
      effectiveSettings: user && settings ? settings : guestSettings,
      setGuestSettings: (patch) => {
        const next = { ...guestSettings, ...patch };
        setGuestSettingsState(next);
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      },
    }),
    [user, settings, ready, favorites, guestSettings, afterAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider');
  return ctx;
}
