import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isEntityId, type QuizQuestionData } from '@medtech/core';
import type { DataLayer } from '@medtech/data';
import { HttpError, includeDrafts, notFound, parse, requirePermission } from '../http.ts';

/** Bestehensgrenze für Quizze (Prozent) */
export const QUIZ_PASS_SCORE = 80;

/**
 * Modulspezifische Endpunkte. Alle Module lesen Inhalte aus derselben
 * zentralen Datenbasis (ContentRepository) – hier liegt nur Logik, die
 * serverseitig laufen muss (z. B. Quizauswertung ohne Antwort-Leak).
 */
export function moduleRoutes(app: FastifyInstance, data: DataLayer) {
  // ------------------------------------------------------------ Prüfakademie
  app.post('/api/v1/academy/quiz/evaluate', async (req) => {
    const body = parse(
      z.object({
        /** Lernmodul (oder andere Entität), zu dem das Quiz gehört – für den Lernfortschritt */
        contextId: z.string().refine(isEntityId).optional(),
        answers: z
          .array(z.object({ questionId: z.string().refine(isEntityId), selected: z.array(z.string().max(20)).max(10) }))
          .min(1)
          .max(100),
      }),
      req.body,
    );
    const drafts = includeDrafts(req);
    const results = body.answers.map((a) => {
      const q = data.content.get<QuizQuestionData>(a.questionId, { includeDrafts: drafts });
      if (!q || q.type !== 'quiz_question') throw notFound(`Quizfrage ${a.questionId}`);
      const correct = [...q.data.correct].sort();
      const selected = [...new Set(a.selected)].sort();
      const isCorrect = correct.length === selected.length && correct.every((c, i) => c === selected[i]);
      return { questionId: a.questionId, correct: isCorrect, correctOptions: q.data.correct, explanation: q.data.explanation };
    });
    const score = Math.round((results.filter((r) => r.correct).length / results.length) * 100);
    const passed = score >= QUIZ_PASS_SCORE;

    if (req.user && body.contextId) {
      if (!data.content.exists(body.contextId, { includeDrafts: drafts })) throw notFound('Lernmodul');
      data.users.setProgress(req.user.id, body.contextId, passed ? 'completed' : 'started', score);
      data.users.recordHistory(req.user.id, body.contextId, 'academy', 'quiz');
    }
    return { score, passed, passScore: QUIZ_PASS_SCORE, results };
  });

  // ------------------------------------------------------------ Market
  app.post('/api/v1/market/offers/:slug/inquiries', async (req, reply) => {
    const user = requirePermission(req, 'market:inquire');
    if (!user) throw new HttpError(401, 'Bitte melde dich an.', 'unauthenticated');
    const { slug } = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }), req.params);
    const body = parse(z.object({ message: z.string().trim().min(5).max(2000) }), req.body);
    const offerId = `offer:${slug}`;
    if (!data.content.exists(offerId)) throw notFound('Angebot');
    const inquiry = data.users.createInquiry(user.id, offerId, body.message);
    return reply.code(201).send({
      ...inquiry,
      notice: 'Demo-Marktplatz: Die Anfrage wurde gespeichert, aber nicht an einen realen Anbieter übermittelt.',
    });
  });

  app.get('/api/v1/market/inquiries', async (req) => {
    const user = requirePermission(req, 'market:inquire');
    if (!user) throw new HttpError(401, 'Bitte melde dich an.', 'unauthenticated');
    return { items: data.users.listInquiries(user.id) };
  });
}
