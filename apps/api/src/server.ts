import { createDataLayer, seedFromDirectory, ContentValidationError, summarizeIssuesText } from '@medtech/data';
import { buildApp } from './app.ts';
import { bootstrapUsers } from './bootstrap.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const data = createDataLayer({ path: config.databasePath });

if (config.seedOnStart) {
  try {
    const { report } = seedFromDirectory(data.db, config.contentDir);
    console.log(`Inhalte geladen: ${report.counts.entities} Einträge, ${report.counts.relations} Verknüpfungen, ${report.counts.sources} Quellen.`);
  } catch (e) {
    if (e instanceof ContentValidationError) {
      console.error(e.message);
      console.error(summarizeIssuesText(e.bundle.issues, 20));
      process.exit(1);
    }
    throw e;
  }
}

await bootstrapUsers(data, config);
const app = await buildApp(data, config);
await app.listen({ host: config.host, port: config.port });
console.log(`MedTech World API läuft auf http://${config.host}:${config.port} (Copilot: ${config.anthropicApiKey ? 'Sprachmodell' : 'Retrieval-Modus'})`);

const shutdown = async () => {
  await app.close();
  data.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
