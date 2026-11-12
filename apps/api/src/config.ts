import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

export interface AppConfig {
  host: string;
  port: number;
  production: boolean;
  databasePath: string;
  contentDir: string;
  /** Inhalte beim Start neu aus /content laden */
  seedOnStart: boolean;
  /** Pfad zum gebauten Frontend (wird in Produktion mit ausgeliefert) */
  webDist: string | null;
  cookieSecure: boolean;
  /**
   * Vertrauen in X-Forwarded-For (Fastify `trustProxy`). Standard: false.
   * Nur setzen, wenn die API hinter einem Reverse Proxy läuft – als IP/CIDR-Liste
   * des Proxys (z. B. "127.0.0.1" oder "10.0.0.0/8", auch "loopback", "uniquelocal").
   */
  trustProxy: boolean | string;
  /** Demo-Konten anlegen (nur Entwicklung) */
  seedDemoUsers: boolean;
  anthropicApiKey: string | null;
  anthropicModel: string;
  bootstrapAdmin: { email: string; password: string } | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  return {
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT ?? 3001),
    production,
    databasePath: resolve(root, env.DATABASE_PATH ?? '.data/medtech-world.db'),
    contentDir: resolve(root, env.CONTENT_DIR ?? 'content'),
    seedOnStart: (env.SEED_ON_START ?? 'true') !== 'false',
    webDist: production ? resolve(root, env.WEB_DIST ?? 'apps/web/dist') : null,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    cookieSecure: (env.COOKIE_SECURE ?? (production ? 'true' : 'false')) === 'true',
    seedDemoUsers: (env.SEED_DEMO_USERS ?? (production ? 'false' : 'true')) === 'true',
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    bootstrapAdmin: env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } : null,
  };
}

/**
 * TRUST_PROXY: leer/"false" → aus; "true" → jedem Absender vertrauen (nur, wenn die API
 * ausschließlich über den Proxy erreichbar ist); sonst kommagetrennte IP/CIDR-Liste der Proxys.
 * Reine Hop-Zahlen werden von Fastify aus Sicherheitsgründen ignoriert und daher nicht angeboten.
 */
export function parseTrustProxy(value: string | undefined): boolean | string {
  const v = value?.trim();
  if (!v || v === 'false' || /^\d+$/.test(v)) return false;
  if (v === 'true') return true;
  return v;
}

export const REPO_ROOT = root;
