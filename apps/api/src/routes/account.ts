import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MODULE_IDS, ROLES, isEntityId } from '@medtech/core';
import { EmailTakenError, type DataLayer } from '@medtech/data';
import type { AppConfig } from '../config.ts';
import { createRateLimiter, HttpError, includeDrafts, notFound, parse, requirePermission, requireUser } from '../http.ts';

export const SESSION_COOKIE = 'mw_session';

const email = z.email('Bitte eine gültige E-Mail-Adresse angeben').max(200);
const password = z
  .string()
  .min(10, 'Das Passwort muss mindestens 10 Zeichen haben')
  .max(200)
  .refine((p) => /[A-Za-zÄÖÜäöüß]/.test(p) && /[^A-Za-zÄÖÜäöüß]/.test(p), 'Das Passwort braucht Buchstaben und mindestens eine Ziffer oder ein Sonderzeichen');
const displayName = z.string().trim().min(2).max(80);
const entityIdParam = z.object({ entityId: z.string().refine(isEntityId, 'Ungültige Entitäts-ID') });

export function accountRoutes(app: FastifyInstance, data: DataLayer, config: AppConfig) {
  const authLimit = createRateLimiter(10, 60_000);

  const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date) =>
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      expires: expiresAt,
    });

  /** Prüft, dass die Entität existiert (und für den Nutzer sichtbar ist). */
  const assertEntity = (req: Parameters<typeof includeDrafts>[0], id: string) => {
    if (!data.content.exists(id, { includeDrafts: includeDrafts(req) })) throw notFound('Inhalt');
  };

  // ------------------------------------------------------------------ Auth
  app.post('/api/v1/auth/register', async (req, reply) => {
    authLimit(req, reply, 'register');
    const body = parse(z.object({ email, password, displayName }), req.body);
    try {
      const user = await data.users.create(body);
      const session = data.users.createSession(user.id);
      setSessionCookie(reply, session.token, session.expiresAt);
      return reply.code(201).send({ user, settings: data.users.getSettings(user.id) });
    } catch (e) {
      if (e instanceof EmailTakenError) throw new HttpError(409, e.message, 'email_taken');
      throw e;
    }
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    authLimit(req, reply, 'login');
    const body = parse(z.object({ email: z.string().max(200), password: z.string().max(200) }), req.body);
    const user = await data.users.authenticate(body.email, body.password);
    if (!user) throw new HttpError(401, 'E-Mail-Adresse oder Passwort ist falsch.', 'invalid_credentials');
    const session = data.users.createSession(user.id);
    setSessionCookie(reply, session.token, session.expiresAt);
    return { user, settings: data.users.getSettings(user.id) };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    if (req.sessionToken) data.users.deleteSession(req.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/auth/me', async (req) => {
    if (!req.user) return { user: null, settings: null };
    return { user: req.user, settings: data.users.getSettings(req.user.id) };
  });

  // ------------------------------------------------------------------ Profil & Einstellungen
  app.patch('/api/v1/me', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ displayName: displayName.optional() }), req.body);
    return { user: data.users.updateProfile(user.id, body) };
  });

  app.put('/api/v1/me/password', async (req, reply) => {
    authLimit(req, reply, 'password');
    const user = requireUser(req);
    const body = parse(z.object({ currentPassword: z.string().max(200), newPassword: password }), req.body);
    const ok = await data.users.changePassword(user.id, body.currentPassword, body.newPassword);
    if (!ok) throw new HttpError(400, 'Das aktuelle Passwort ist nicht korrekt.', 'invalid_password');
    // alle Sitzungen wurden beendet – neue Sitzung für dieses Gerät
    const session = data.users.createSession(user.id);
    setSessionCookie(reply, session.token, session.expiresAt);
    return { ok: true };
  });

  app.get('/api/v1/me/settings', async (req) => data.users.getSettings(requireUser(req).id));

  app.patch('/api/v1/me/settings', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z
        .object({
          theme: z.enum(['system', 'light', 'dark']),
          startModule: z.enum(MODULE_IDS),
          trackHistory: z.boolean(),
          reducedMotion: z.boolean(),
        })
        .partial()
        .strict(),
      req.body,
    );
    return data.users.updateSettings(user.id, body);
  });

  // ------------------------------------------------------------------ Favoriten
  app.get('/api/v1/me/favorites', async (req) => ({ items: data.users.listFavorites(requireUser(req).id) }));

  app.put('/api/v1/me/favorites/:entityId', async (req) => {
    const user = requireUser(req);
    const { entityId } = parse(entityIdParam, req.params);
    assertEntity(req, entityId);
    data.users.addFavorite(user.id, entityId);
    return { ok: true };
  });

  app.delete('/api/v1/me/favorites/:entityId', async (req) => {
    const user = requireUser(req);
    const { entityId } = parse(entityIdParam, req.params);
    data.users.removeFavorite(user.id, entityId);
    return { ok: true };
  });

  // ------------------------------------------------------------------ Lernfortschritt
  app.get('/api/v1/me/progress', async (req) => ({ items: data.users.listProgress(requireUser(req).id) }));

  app.put('/api/v1/me/progress/:entityId', async (req) => {
    const user = requireUser(req);
    const { entityId } = parse(entityIdParam, req.params);
    const body = parse(z.object({ status: z.enum(['started', 'completed']), score: z.number().int().min(0).max(100).nullable().default(null) }), req.body);
    assertEntity(req, entityId);
    return data.users.setProgress(user.id, entityId, body.status, body.score);
  });

  // ------------------------------------------------------------------ Notizen
  const noteText = z.string().trim().min(1).max(10_000);

  app.get('/api/v1/me/notes', async (req) => {
    const user = requireUser(req);
    const q = parse(z.object({ entityId: z.string().refine(isEntityId).optional() }), req.query);
    return { items: data.users.listNotes(user.id, q.entityId) };
  });

  app.post('/api/v1/me/notes', async (req, reply) => {
    const user = requireUser(req);
    const body = parse(z.object({ entityId: z.string().refine(isEntityId).nullable().default(null), text: noteText }), req.body);
    if (body.entityId) assertEntity(req, body.entityId);
    return reply.code(201).send(data.users.createNote(user.id, body.entityId, body.text));
  });

  app.patch('/api/v1/me/notes/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ text: noteText }), req.body);
    const note = data.users.updateNote(user.id, id, body.text);
    if (!note) throw notFound('Notiz');
    return note;
  });

  app.delete('/api/v1/me/notes/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    if (!data.users.deleteNote(user.id, id)) throw notFound('Notiz');
    return { ok: true };
  });

  // ------------------------------------------------------------------ Lernhistorie
  app.get('/api/v1/me/history', async (req) => {
    const user = requireUser(req);
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }), req.query);
    return { items: data.users.listHistory(user.id, q.limit) };
  });

  app.post('/api/v1/me/history', async (req) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        entityId: z.string().refine(isEntityId),
        module: z.enum(MODULE_IDS),
        action: z.enum(['view', 'quiz', 'simulation', 'diagnosis']),
      }),
      req.body,
    );
    assertEntity(req, body.entityId);
    data.users.recordHistory(user.id, body.entityId, body.module, body.action);
    return { ok: true };
  });

  app.delete('/api/v1/me/history', async (req) => {
    data.users.clearHistory(requireUser(req).id);
    return { ok: true };
  });

  // ------------------------------------------------------------------ Datenschutz
  app.get('/api/v1/me/export', async (req, reply) => {
    const user = requireUser(req);
    reply.header('Content-Disposition', 'attachment; filename="medtech-world-daten.json"');
    return data.users.exportData(user.id);
  });

  app.delete('/api/v1/me', async (req, reply) => {
    authLimit(req, reply, 'delete');
    const user = requireUser(req);
    const body = parse(z.object({ password: z.string().max(200) }), req.body);
    const ok = await data.users.authenticate(user.email, body.password);
    if (!ok) throw new HttpError(400, 'Das Passwort ist nicht korrekt.', 'invalid_password');
    data.users.deleteUser(user.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Administration
  app.get('/api/v1/admin/users', async (req) => {
    requirePermission(req, 'users:manage');
    return { items: data.users.listUsers() };
  });

  app.patch('/api/v1/admin/users/:id', async (req) => {
    const admin = requirePermission(req, 'users:manage')!;
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const body = parse(z.object({ role: z.enum(ROLES) }), req.body);
    if (id === admin.id && body.role !== 'admin') throw new HttpError(400, 'Die eigene Administratorrolle kann nicht entzogen werden.', 'self_demote');
    const user = data.users.setRole(id, body.role);
    if (!user) throw notFound('Nutzer');
    return { user };
  });
}
