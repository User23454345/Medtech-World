/**
 * Lädt alle Inhalte aus /content in die zentrale Datenbank (Nutzerdaten bleiben erhalten)
 * und legt in der Entwicklung Demo-Konten an.
 */
import { summarizeIssues } from '@medtech/core';
import { createDataLayer, seedFromDirectory, ContentValidationError, summarizeIssuesText } from '@medtech/data';
import { loadConfig } from '../apps/api/src/config.ts';
import { bootstrapUsers, DEMO_USERS } from '../apps/api/src/bootstrap.ts';

const config = loadConfig();
const data = createDataLayer({ path: config.databasePath });
try {
  const { report } = seedFromDirectory(data.db, config.contentDir);
  const s = summarizeIssues(report.issues);
  console.log(`✔ ${report.counts.entities} Inhalte, ${report.counts.relations} Verknüpfungen, ${report.counts.specs} technische Angaben, ${report.counts.sources} Quellen geladen (${s.warnings} Warnungen).`);
  await bootstrapUsers(data, config);
  if (config.seedDemoUsers && !config.production) {
    console.log(`✔ Demo-Konten: ${DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(', ')} – Passwort: ${DEMO_USERS[0].password}`);
  }
} catch (e) {
  if (e instanceof ContentValidationError) {
    console.error(`✖ ${e.message}\n${summarizeIssuesText(e.bundle.issues.filter((i) => i.severity === 'error'), 50)}`);
    process.exitCode = 1;
  } else throw e;
} finally {
  data.close();
}
