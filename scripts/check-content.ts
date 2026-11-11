/**
 * Qualitätsprüfung der Inhalte (CI): Schema, Dubletten, Widersprüche, Belege,
 * Rechtsstand, interne Links. Mit --external werden zusätzlich alle
 * Quellen-URLs per HTTP geprüft (benötigt Internetzugang).
 * Exit-Code 1 bei Fehlern.
 */
import { resolve } from 'node:path';
import { buildContentBundle, summarizeIssues } from '@medtech/core';
import { readContentDir, summarizeIssuesText } from '@medtech/data';

const dir = resolve(import.meta.dirname, '../content');
const bundle = buildContentBundle(readContentDir(dir));
const verbose = process.argv.includes('--verbose');

if (process.argv.includes('--external')) {
  const urls = bundle.sources.filter((s) => s.url);
  console.log(`Prüfe ${urls.length} externe Quellen-URLs …`);
  await Promise.all(
    urls.map(async (s) => {
      try {
        let res = await fetch(s.url!, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
        if (res.status === 405 || res.status === 403) res = await fetch(s.url!, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
        if (res.status >= 400) bundle.issues.push({ severity: 'error', code: 'source.url-broken', message: `URL antwortet mit HTTP ${res.status}: ${s.url}`, sourceId: s.id, file: s.file });
      } catch (e) {
        bundle.issues.push({ severity: 'warning', code: 'source.url-unreachable', message: `URL nicht erreichbar (${(e as Error).message}): ${s.url}`, sourceId: s.id, file: s.file });
      }
    }),
  );
}

const s = summarizeIssues(bundle.issues);
const shown = verbose ? bundle.issues : bundle.issues.filter((i) => i.severity !== 'info');
if (shown.length) console.log(summarizeIssuesText(shown));
console.log(
  `\n${bundle.entities.length} Inhalte · ${bundle.relations.length} Verknüpfungen · ${bundle.sources.length} Quellen — ${s.errors} Fehler, ${s.warnings} Warnungen, ${s.infos} Hinweise`,
);
if (s.errors > 0) process.exitCode = 1;
