import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { isEntityId } from '@medtech/core';
import type { DataLayer } from '@medtech/data';
import type { AppConfig } from './config.ts';
import { Copilot } from './copilot.ts';
import { createRateLimiter, HttpError, includeDrafts, parse, requirePermission } from './http.ts';
import { accountRoutes, SESSION_COOKIE } from './routes/account.ts';
import { contentRoutes } from './routes/content.ts';
import { moduleRoutes } from './routes/modules.ts';

/** Header, den das Frontend bei allen schreibenden Anfragen mitsendet (CSRF-Schutz) */
export const CSRF_HEADER = 'x-medtech-client';

export async function buildApp(data: DataLayer, config: AppConfig): Promise<FastifyInstance> {
  const options: FastifyServerOptions = {
    logger: config.production ? { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] } : false,
    bodyLimit: 256 * 1024,
    // Standard: kein Vertrauen in X-Forwarded-For (sonst lassen sich Rate-Limits per Header umgehen)
    trustProxy: config.trustProxy,
  };
  const app = Fastify(options);

  await app.register(cookie);

  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  // ---------------------------------------------------------------- Sicherheit
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token && token.length < 200) {
      req.sessionToken = token;
      req.user = data.users.userForSession(token);
    }
    // CSRF: schreibende API-Aufrufe nur mit eigenem Header (von Browsern nicht cross-site setzbar ohne CORS-Freigabe)
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers[CSRF_HEADER] !== '1') throw new HttpError(403, 'Anfrage ohne gültigen Client-Header abgelehnt.', 'csrf');
    }
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (config.production) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.url.startsWith('/api/') && (req.user || req.url.startsWith('/api/v1/me') || req.url.startsWith('/api/v1/auth'))) {
      reply.header('Cache-Control', 'no-store');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Interner Fehler – bitte später erneut versuchen.' } });
  });

  // ---------------------------------------------------------------- Routen
  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  contentRoutes(app, data);
  accountRoutes(app, data, config);
  moduleRoutes(app, data);

  const copilot = new Copilot(data, config);
  const copilotLimit = createRateLimiter(20, 60_000);
  app.get('/api/v1/copilot/status', async () => ({ mode: copilot.mode }));
  app.post('/api/v1/copilot/ask', async (req, reply) => {
    requirePermission(req, 'copilot:use');
    copilotLimit(req, reply, 'copilot');
    const body = parse(
      z.object({ question: z.string().trim().min(2).max(1000), contextId: z.string().refine(isEntityId).optional() }),
      req.body,
    );
    return copilot.ask(body.question, body.contextId, includeDrafts(req));
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Endpunkt nicht gefunden.' } });
    }
    if (config.webDist && existsSync(config.webDist) && req.method === 'GET') {
      return reply.sendFile('index.html'); // SPA-Fallback
    }
    return reply.code(404).send('Not found');
  });

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false, maxAge: '1h' });
  }

  return app;
}
