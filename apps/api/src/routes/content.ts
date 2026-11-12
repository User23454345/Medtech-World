import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LIST,
  extractWikiLinks,
  MODULE_IDS,
  MODULE_LIST,
  RELATION_DEFS,
  RELATION_TYPES,
  SLUG_PATTERN,
  type EntityDetail,
  type QuizQuestionData,
} from '@medtech/core';
import type { DataLayer } from '@medtech/data';
import { includeDrafts, notFound, parse, requirePermission } from '../http.ts';

/** Antworten von Quizfragen werden nie öffentlich ausgeliefert, nur über /academy/quiz/evaluate geprüft. */
export function publicEntity(detail: EntityDetail): EntityDetail {
  if (detail.type !== 'quiz_question') return detail;
  const { correct: _c, explanation: _e, ...rest } = detail.data as QuizQuestionData;
  // Linktitel nur für Verweise aus den öffentlichen Feldern – Links aus der Erklärung würden die Lösung andeuten
  const visibleLinks = new Set(extractWikiLinks(`${detail.body}\n${JSON.stringify(rest)}`));
  const linkedTitles = Object.fromEntries(Object.entries(detail.linkedTitles).filter(([id]) => visibleLinks.has(id)));
  return { ...detail, linkedTitles, data: { ...rest, multipleAnswers: (detail.data as QuizQuestionData).correct.length > 1 } };
}

const listQuery = z.object({
  type: z.enum(ENTITY_TYPES).optional(),
  types: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.enum(ENTITY_TYPES)))
    .optional(),
  tag: z.string().max(80).optional(),
  relatedTo: z.string().max(200).optional(),
  rel: z.enum(RELATION_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const searchQuery = z.object({
  q: z.string().max(200).default(''),
  types: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.enum(ENTITY_TYPES)))
    .optional(),
  module: z.enum(MODULE_IDS).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function contentRoutes(app: FastifyInstance, data: DataLayer) {
  app.get('/api/v1/meta', async (req) => {
    const meta = data.db.prepare(`SELECT value FROM content_meta WHERE key = 'seeded_at'`).get() as { value: string } | undefined;
    return {
      modules: MODULE_LIST,
      entityTypes: ENTITY_TYPE_LIST,
      relationTypes: Object.values(RELATION_DEFS),
      counts: data.content.typeCounts({ includeDrafts: includeDrafts(req) }),
      seededAt: meta?.value ?? null,
    };
  });

  app.get('/api/v1/entities', async (req) => {
    const q = parse(listQuery, req.query);
    return data.content.list({ ...q, includeDrafts: includeDrafts(req) });
  });

  app.get('/api/v1/entities/:type/:slug', async (req) => {
    const { type, slug } = parse(z.object({ type: z.enum(ENTITY_TYPES), slug: z.string().regex(SLUG_PATTERN) }), req.params);
    const entity = data.content.get(`${type}:${slug}`, { includeDrafts: includeDrafts(req) });
    if (!entity) throw notFound('Inhalt');
    return publicEntity(entity);
  });

  app.get('/api/v1/search', async (req) => {
    const q = parse(searchQuery, req.query);
    return data.content.search(q.q, { types: q.types, module: q.module, limit: q.limit, includeDrafts: includeDrafts(req) });
  });

  app.get('/api/v1/sources', async () => ({ items: data.content.sources() }));

  app.get('/api/v1/sources/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().regex(/^src:[a-z0-9-]+$/) }), req.params);
    const source = data.content.sources().find((s) => s.id === id);
    if (!source) throw notFound('Quelle');
    return { source, usedBy: data.content.entitiesUsingSource(id, { includeDrafts: includeDrafts(req) }) };
  });

  app.get('/api/v1/quality', async (req) => {
    requirePermission(req, 'quality:read');
    const report = data.content.qualityReport();
    if (!report) throw notFound('Qualitätsbericht');
    return report;
  });
}
