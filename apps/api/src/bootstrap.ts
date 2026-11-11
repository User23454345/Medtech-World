import type { DataLayer } from '@medtech/data';
import type { AppConfig } from './config.ts';

/** Demo-Konten für die lokale Entwicklung (niemals in Produktion aktivieren). */
export const DEMO_USERS = [
  { email: 'lernende@medtech.world', password: 'Demo-Passwort-1', displayName: 'Lea Lernend', role: 'learner' },
  { email: 'technik@medtech.world', password: 'Demo-Passwort-1', displayName: 'Tom Technik', role: 'technician' },
  { email: 'redaktion@medtech.world', password: 'Demo-Passwort-1', displayName: 'Rita Redaktion', role: 'editor' },
  { email: 'admin@medtech.world', password: 'Demo-Passwort-1', displayName: 'Ada Admin', role: 'admin' },
] as const;

export async function bootstrapUsers(data: DataLayer, config: AppConfig, log: (msg: string) => void = console.log) {
  if (config.bootstrapAdmin && data.users.count() === 0) {
    await data.users.create({ ...config.bootstrapAdmin, displayName: 'Administration', role: 'admin' });
    log(`Administrator ${config.bootstrapAdmin.email} angelegt.`);
  }
  if (config.seedDemoUsers && !config.production) {
    for (const u of DEMO_USERS) {
      const exists = data.db.prepare('SELECT 1 FROM users WHERE email = ?').get(u.email);
      if (!exists) await data.users.create({ ...u });
    }
  }
}
