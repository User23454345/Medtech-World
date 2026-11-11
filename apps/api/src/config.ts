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
    cookieSecure: (env.COOKIE_SECURE ?? (production ? 'true' : 'false')) === 'true',
    seedDemoUsers: (env.SEED_DEMO_USERS ?? (production ? 'false' : 'true')) === 'true',
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    bootstrapAdmin: env.ADMIN_EMAIL && env.ADMIN_PASSWORD ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } : null,
  };
}

export const REPO_ROOT = root;
