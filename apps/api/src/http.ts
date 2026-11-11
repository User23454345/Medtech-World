import type { FastifyReply, FastifyRequest } from 'fastify';
import { can, type Permission, type PublicUser } from '@medtech/core';
import type { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    user: PublicUser | null;
    sessionToken: string | null;
  }
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'error',
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, `${what} nicht gefunden.`, 'not_found');

/** Validiert Eingaben mit zod und liefert verständliche 400-Fehler. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const res = schema.safeParse(value);
  if (!res.success) {
    const msg = res.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.map(String).join('.') || 'Eingabe'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, `Ungültige Eingabe – ${msg}`, 'validation');
  }
  return res.data;
}

export function requireUser(req: FastifyRequest): PublicUser {
  if (!req.user) throw new HttpError(401, 'Bitte melde dich an, um diese Funktion zu nutzen.', 'unauthenticated');
  return req.user;
}

export function requirePermission(req: FastifyRequest, permission: Permission): PublicUser | null {
  if (!can(req.user?.role, permission)) {
    if (!req.user) throw new HttpError(401, 'Bitte melde dich an.', 'unauthenticated');
    throw new HttpError(403, 'Für diese Aktion fehlt die Berechtigung.', 'forbidden');
  }
  return req.user;
}

/** Darf der Nutzer Entwürfe sehen? */
export const includeDrafts = (req: FastifyRequest) => can(req.user?.role, 'content:read-drafts');

/**
 * Einfaches In-Memory-Rate-Limit (Fixed Window) pro IP und Bucket.
 * Für Mehrinstanzbetrieb durch Redis o. ä. ersetzen.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return function check(req: FastifyRequest, reply: FastifyReply, bucket: string) {
    const key = `${bucket}|${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }
    if (entry.count > limit) {
      reply.header('Retry-After', Math.ceil((entry.reset - now) / 1000));
      throw new HttpError(429, 'Zu viele Anfragen – bitte kurz warten.', 'rate_limited');
    }
  };
}
