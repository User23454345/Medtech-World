import { resolve } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublicUser, QuizQuestionData } from '@medtech/core';
import { createDataLayer, seedFromDirectory, type DataLayer } from '@medtech/data';
import { buildApp, CSRF_HEADER } from '../apps/api/src/app.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { SESSION_COOKIE } from '../apps/api/src/routes/account.ts';

const CONTENT_DIR = resolve(import.meta.dirname, '../content');
const PW = 'Test-Passwort-123';

/** Testkonfiguration: keine Demo-Konten, kein Sprachmodell, kein statisches Frontend */
const testConfig = () => loadConfig({ NODE_ENV: 'test', SEED_DEMO_USERS: 'false', SEED_ON_START: 'false', DATABASE_PATH: ':memory:' });

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function client(app: FastifyInstance) {
  return async (method: Method, url: string, opts: { body?: unknown; cookie?: string | null; csrf?: boolean } = {}) => {
    const headers: Record<string, string> = {};
    if (opts.csrf !== false && method !== 'GET') headers[CSRF_HEADER] = '1';
    if (opts.cookie) headers.cookie = `${SESSION_COOKIE}=${opts.cookie}`;
    return app.inject({ method, url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
  };
}

const sessionFrom = (res: LightMyRequestResponse) => res.cookies.find((c) => c.name === SESSION_COOKIE);

describe('REST-API /api/v1', () => {
  let data: DataLayer;
  let app: FastifyInstance;
  let call: ReturnType<typeof client>;

  let learner: PublicUser;
  let editor: PublicUser;
  let admin: PublicUser;
  let learnerToken: string;
  let editorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    data = createDataLayer({ path: ':memory:' });
    seedFromDirectory(data.db, CONTENT_DIR);
    app = await buildApp(data, testConfig());
    await app.ready();
    call = client(app);
    [learner, editor, admin] = await Promise.all([
      data.users.create({ email: 'lernend@test.de', password: PW, displayName: 'Lernend' }),
      data.users.create({ email: 'redaktion@test.de', password: PW, displayName: 'Redaktion', role: 'editor' }),
      data.users.create({ email: 'admin@test.de', password: PW, displayName: 'Admin', role: 'admin' }),
    ]);
    learnerToken = data.users.createSession(learner.id).token;
    editorToken = data.users.createSession(editor.id).token;
    adminToken = data.users.createSession(admin.id).token;
  });

  afterAll(async () => {
    await app.close();
    data.close();
  });

  describe('Allgemein & Sicherheit', () => {
    it('Health-Check', async () => {
      const res = await call('GET', '/api/v1/health');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('Sicherheitsheader sind gesetzt', async () => {
      const res = await call('GET', '/api/v1/health');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toContain('camera=()');
      // HSTS nur in Produktion
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('Sicherheitsheader auch bei Fehlerantworten', async () => {
      const res = await call('GET', '/api/v1/gibt-es-nicht');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toBeTruthy();
    });

    it('unbekannte API-Route → 404 als JSON', async () => {
      const res = await call('GET', '/api/v1/gibt-es-nicht');
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.json()).toEqual({ error: { code: 'not_found', message: expect.any(String) } });
    });

    it('CSRF: schreibende Anfragen ohne x-medtech-client: 1 → 403', async () => {
      const res = await call('POST', '/api/v1/auth/login', { body: { email: 'lernend@test.de', password: PW }, csrf: false });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('csrf');

      const wrong = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { [CSRF_HEADER]: 'true' } });
      expect(wrong.statusCode).toBe(403);

      const del = await call('DELETE', '/api/v1/me/history', { cookie: learnerToken, csrf: false });
      expect(del.statusCode).toBe(403);
    });

    it('ungültige Eingaben → 400 mit verständlicher Meldung', async () => {
      const res = await call('POST', '/api/v1/auth/register', { body: { email: 'kein-mail', password: 'kurz', displayName: 'X' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('validation');
      expect(res.json().error.message).toContain('Ungültige Eingabe');
    });
  });

  describe('Authentifizierung', () => {
    it('Registrierung → Cookie → /auth/me → Logout', async () => {
      const reg = await call('POST', '/api/v1/auth/register', { body: { email: 'Neu@Test.de', password: PW, displayName: 'Neue Person' } });
      expect(reg.statusCode).toBe(201);
      expect(reg.json().user).toMatchObject({ email: 'neu@test.de', role: 'learner', displayName: 'Neue Person' });
      expect(reg.json().settings).toMatchObject({ trackHistory: true });
      const cookie = sessionFrom(reg)!;
      expect(cookie).toBeDefined();
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe('Lax');
      expect(cookie.path).toBe('/');
      expect(cookie.secure).toBeFalsy();

      const me = await call('GET', '/api/v1/auth/me', { cookie: cookie.value });
      expect(me.json().user.email).toBe('neu@test.de');
      expect(me.headers['cache-control']).toBe('no-store');

      const out = await call('POST', '/api/v1/auth/logout', { cookie: cookie.value });
      expect(out.statusCode).toBe(200);
      expect(sessionFrom(out)?.value).toBe('');
      const after = await call('GET', '/api/v1/auth/me', { cookie: cookie.value });
      expect(after.json()).toEqual({ user: null, settings: null });
    });

    it('doppelte Registrierung → 409', async () => {
      const res = await call('POST', '/api/v1/auth/register', { body: { email: 'LERNEND@test.de', password: PW, displayName: 'Doppelt' } });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('email_taken');
    });

    it('Login mit richtigem und falschem Passwort', async () => {
      const ok = await call('POST', '/api/v1/auth/login', { body: { email: 'lernend@test.de', password: PW } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().user.id).toBe(learner.id);
      expect(sessionFrom(ok)?.value).toBeTruthy();

      const bad = await call('POST', '/api/v1/auth/login', { body: { email: 'lernend@test.de', password: 'Falsch-Falsch-1' } });
      expect(bad.statusCode).toBe(401);
      expect(bad.json().error.code).toBe('invalid_credentials');
      expect(sessionFrom(bad)).toBeUndefined();
    });

    it('Gäste: /auth/me liefert null, geschützte /me-Routen → 401', async () => {
      expect((await call('GET', '/api/v1/auth/me')).json()).toEqual({ user: null, settings: null });
      for (const [method, url] of [
        ['GET', '/api/v1/me/settings'],
        ['GET', '/api/v1/me/favorites'],
        ['PUT', '/api/v1/me/favorites/term:spo2'],
        ['GET', '/api/v1/me/progress'],
        ['GET', '/api/v1/me/notes'],
        ['GET', '/api/v1/me/history'],
        ['GET', '/api/v1/me/export'],
        ['PATCH', '/api/v1/me'],
      ] as const) {
        const res = await call(method, url, { body: method === 'GET' ? undefined : {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
        expect(res.json().error.code).toBe('unauthenticated');
      }
    });

    it('ungültiges Sitzungs-Cookie wird wie Gast behandelt', async () => {
      const res = await call('GET', '/api/v1/me/settings', { cookie: 'erfunden' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Inhalte', () => {
    it('/meta liefert Module, Typen und Zählungen', async () => {
      const res = await call('GET', '/api/v1/meta');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.modules).toHaveLength(8);
      expect(body.counts.device).toBeGreaterThan(0);
      expect(body.seededAt).toBeTruthy();
    });

    it('Detailseite und 404', async () => {
      const ok = await call('GET', '/api/v1/entities/device/pulsoximeter');
      expect(ok.statusCode).toBe(200);
      expect(ok.json().id).toBe('device:pulsoximeter');
      expect((await call('GET', '/api/v1/entities/device/gibt-es-nicht')).statusCode).toBe(404);
      expect((await call('GET', '/api/v1/entities/unbekannt/foo')).statusCode).toBe(400);
    });

    it('Suche über die API', async () => {
      const res = await call('GET', '/api/v1/search?q=SpO2&types=term,device');
      expect(res.statusCode).toBe(200);
      expect(res.json().hits.length).toBeGreaterThan(0);
      expect(res.json().hits.every((h: { type: string }) => ['term', 'device'].includes(h.type))).toBe(true);
      expect((await call('GET', '/api/v1/search?q=%22*()')).statusCode).toBe(200);
      expect((await call('GET', '/api/v1/search?types=foo')).statusCode).toBe(400);
    });

    it('Quizfragen enthalten weder Lösung noch Erklärung', async () => {
      const list = await call('GET', '/api/v1/entities?type=quiz_question&limit=500');
      const items = list.json().items as Array<{ slug: string }>;
      expect(items.length).toBeGreaterThan(0);
      for (const q of items.slice(0, 5)) {
        const res = await call('GET', `/api/v1/entities/quiz_question/${q.slug}`);
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data).not.toHaveProperty('correct');
        expect(body.data).not.toHaveProperty('explanation');
        expect(typeof body.data.multipleAnswers).toBe('boolean');
        expect(body.data.options.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('Qualitätsbericht: 401 Gast, 403 Lernende, 200 Redaktion', async () => {
      expect((await call('GET', '/api/v1/quality')).statusCode).toBe(401);
      const learnerRes = await call('GET', '/api/v1/quality', { cookie: learnerToken });
      expect(learnerRes.statusCode).toBe(403);
      expect(learnerRes.json().error.code).toBe('forbidden');
      const editorRes = await call('GET', '/api/v1/quality', { cookie: editorToken });
      expect(editorRes.statusCode).toBe(200);
      expect(editorRes.json().counts.entities).toBeGreaterThan(0);
      expect(Array.isArray(editorRes.json().issues)).toBe(true);
    });

    it('Quellen-Endpunkte', async () => {
      const list = await call('GET', '/api/v1/sources');
      const first = list.json().items[0];
      expect(first.id).toMatch(/^src:/);
      const detail = await call('GET', `/api/v1/sources/${first.id}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().source.id).toBe(first.id);
      expect((await call('GET', '/api/v1/sources/src:gibt-es-nicht')).statusCode).toBe(404);
    });
  });

  describe('Prüfakademie: Quizauswertung', () => {
    const quizFor = () => {
      const rows = data.db
        .prepare(`SELECT from_id AS q, to_id AS m FROM relations WHERE rel = 'quiz_for' AND to_id LIKE 'learning_module:%' ORDER BY to_id, from_id`)
        .all() as Array<{ q: string; m: string }>;
      const moduleId = rows[0]!.m;
      const questions = rows.filter((r) => r.m === moduleId).map((r) => data.content.get<QuizQuestionData>(r.q)!);
      return { moduleId, questions };
    };

    it('alle richtig → 100 %, bestanden, Fortschritt "completed" gespeichert', async () => {
      const { moduleId, questions } = quizFor();
      const res = await call('POST', '/api/v1/academy/quiz/evaluate', {
        cookie: learnerToken,
        body: { contextId: moduleId, answers: questions.map((q) => ({ questionId: q.id, selected: q.data.correct })) },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ score: 100, passed: true, passScore: 80 });
      expect(body.results).toHaveLength(questions.length);
      expect(body.results[0].explanation).toBeTruthy();
      expect(body.results[0].correctOptions).toEqual(questions[0]!.data.correct);

      const progress = data.users.listProgress(learner.id).find((p) => p.entityId === moduleId);
      expect(progress).toMatchObject({ status: 'completed', score: 100 });
      expect(data.users.listHistory(learner.id).some((h) => h.entityId === moduleId && h.action === 'quiz')).toBe(true);
    });

    it('falsche Antworten werden korrekt bewertet; bester Score bleibt gespeichert', async () => {
      const { moduleId, questions } = quizFor();
      const answers = questions.map((q, i) => ({
        questionId: q.id,
        selected: i === 0 ? q.data.options.filter((o) => !q.data.correct.includes(o.id)).map((o) => o.id).slice(0, 1) : q.data.correct,
      }));
      const res = await call('POST', '/api/v1/academy/quiz/evaluate', { cookie: learnerToken, body: { contextId: moduleId, answers } });
      const expected = Math.round(((questions.length - 1) / questions.length) * 100);
      expect(res.json().score).toBe(expected);
      expect(res.json().results[0].correct).toBe(false);
      expect(data.users.listProgress(learner.id).find((p) => p.entityId === moduleId)).toMatchObject({ status: 'completed', score: 100 });
    });

    it('Mehrfachauswahl: Teilmenge ist falsch, doppelte Auswahl wird ignoriert', async () => {
      const { questions } = quizFor();
      const q = questions[0]!;
      const dup = await call('POST', '/api/v1/academy/quiz/evaluate', { body: { answers: [{ questionId: q.id, selected: [...q.data.correct, ...q.data.correct] }] } });
      expect(dup.json().score).toBe(100);
      const none = await call('POST', '/api/v1/academy/quiz/evaluate', { body: { answers: [{ questionId: q.id, selected: [] }] } });
      expect(none.json()).toMatchObject({ score: 0, passed: false });
    });

    it('Gäste erhalten eine Auswertung ohne gespeicherten Fortschritt; unbekannte Frage → 404', async () => {
      const { questions } = quizFor();
      const res = await call('POST', '/api/v1/academy/quiz/evaluate', { body: { answers: [{ questionId: questions[0]!.id, selected: ['x'] }] } });
      expect(res.statusCode).toBe(200);
      const unknown = await call('POST', '/api/v1/academy/quiz/evaluate', { body: { answers: [{ questionId: 'quiz_question:gibt-es-nicht', selected: ['a'] }] } });
      expect(unknown.statusCode).toBe(404);
      const notQuiz = await call('POST', '/api/v1/academy/quiz/evaluate', { body: { answers: [{ questionId: 'term:spo2', selected: ['a'] }] } });
      expect(notQuiz.statusCode).toBe(404);
    });
  });

  describe('Persönliche Daten', () => {
    it('Favoriten über die API (nur existierende Inhalte)', async () => {
      expect((await call('PUT', '/api/v1/me/favorites/term:spo2', { cookie: learnerToken })).statusCode).toBe(200);
      expect((await call('PUT', '/api/v1/me/favorites/term:gibt-es-nicht', { cookie: learnerToken })).statusCode).toBe(404);
      expect((await call('PUT', '/api/v1/me/favorites/kaputt', { cookie: learnerToken })).statusCode).toBe(400);
      const list = await call('GET', '/api/v1/me/favorites', { cookie: learnerToken });
      expect(list.json().items.map((f: { entityId: string }) => f.entityId)).toContain('term:spo2');
      expect((await call('DELETE', '/api/v1/me/favorites/term:spo2', { cookie: learnerToken })).statusCode).toBe(200);
    });

    it('Notizen sind zwischen Nutzern isoliert', async () => {
      const created = await call('POST', '/api/v1/me/notes', { cookie: learnerToken, body: { entityId: 'term:spo2', text: 'Private Notiz' } });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      expect((await call('GET', '/api/v1/me/notes', { cookie: editorToken })).json().items).toEqual([]);
      expect((await call('PATCH', `/api/v1/me/notes/${id}`, { cookie: editorToken, body: { text: 'fremd' } })).statusCode).toBe(404);
      expect((await call('DELETE', `/api/v1/me/notes/${id}`, { cookie: editorToken })).statusCode).toBe(404);
      expect((await call('PATCH', `/api/v1/me/notes/${id}`, { cookie: learnerToken, body: { text: 'geändert' } })).json().text).toBe('geändert');
      expect((await call('DELETE', `/api/v1/me/notes/${id}`, { cookie: learnerToken })).statusCode).toBe(200);
    });

    it('Einstellungen: nur bekannte Felder (strict)', async () => {
      const ok = await call('PATCH', '/api/v1/me/settings', { cookie: learnerToken, body: { theme: 'dark' } });
      expect(ok.json().theme).toBe('dark');
      const bad = await call('PATCH', '/api/v1/me/settings', { cookie: learnerToken, body: { role: 'admin' } });
      expect(bad.statusCode).toBe(400);
    });

    it('Datenexport als Download', async () => {
      const res = await call('GET', '/api/v1/me/export', { cookie: learnerToken });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.json().user.id).toBe(learner.id);
    });
  });

  describe('Market (Demo)', () => {
    it('Anfrage zu einem Demo-Angebot: nur angemeldet, wird gespeichert', async () => {
      const offer = data.content.list({ type: 'offer', limit: 1 }).items[0]!;
      const url = `/api/v1/market/offers/${offer.slug}/inquiries`;
      expect((await call('POST', url, { body: { message: 'Ist das Teil lieferbar?' } })).statusCode).toBe(401);
      const res = await call('POST', url, { cookie: learnerToken, body: { message: 'Ist das Teil lieferbar?' } });
      expect(res.statusCode).toBe(201);
      expect(res.json().notice).toContain('Demo');
      expect((await call('POST', '/api/v1/market/offers/gibt-es-nicht/inquiries', { cookie: learnerToken, body: { message: 'Hallo Welt' } })).statusCode).toBe(404);
      const list = await call('GET', '/api/v1/market/inquiries', { cookie: learnerToken });
      expect(list.json().items.map((i: { offerId: string }) => i.offerId)).toContain(offer.id);
    });
  });

  describe('Konto löschen (DSGVO Art. 17)', () => {
    it('erfordert das Passwort und entfernt Konto und Sitzung', async () => {
      const reg = await call('POST', '/api/v1/auth/register', { body: { email: 'loeschen@test.de', password: PW, displayName: 'Zu Löschen' } });
      const token = sessionFrom(reg)!.value;
      const id = reg.json().user.id as string;
      const wrong = await call('DELETE', '/api/v1/me', { cookie: token, body: { password: 'Falsch-Falsch-1' } });
      expect(wrong.statusCode).toBe(400);
      expect(data.users.byId(id)).not.toBeNull();
      const ok = await call('DELETE', '/api/v1/me', { cookie: token, body: { password: PW } });
      expect(ok.statusCode).toBe(200);
      expect(data.users.byId(id)).toBeNull();
      expect((await call('GET', '/api/v1/auth/me', { cookie: token })).json().user).toBeNull();
    });
  });

  describe('Administration', () => {
    it('Nutzerliste nur für Administration', async () => {
      expect((await call('GET', '/api/v1/admin/users', { cookie: learnerToken })).statusCode).toBe(403);
      expect((await call('GET', '/api/v1/admin/users', { cookie: editorToken })).statusCode).toBe(403);
      const res = await call('GET', '/api/v1/admin/users', { cookie: adminToken });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json())).not.toContain('scrypt');
    });

    it('Rollenänderung durch Nicht-Admins ist verboten', async () => {
      const res = await call('PATCH', `/api/v1/admin/users/${learner.id}`, { cookie: learnerToken, body: { role: 'admin' } });
      expect(res.statusCode).toBe(403);
      expect(data.users.byId(learner.id)?.role).toBe('learner');
      const editorRes = await call('PATCH', `/api/v1/admin/users/${learner.id}`, { cookie: editorToken, body: { role: 'editor' } });
      expect(editorRes.statusCode).toBe(403);
    });

    it('Admin kann sich nicht selbst herabstufen', async () => {
      const res = await call('PATCH', `/api/v1/admin/users/${admin.id}`, { cookie: adminToken, body: { role: 'learner' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('self_demote');
      expect(data.users.byId(admin.id)?.role).toBe('admin');
    });

    it('Admin kann Rollen anderer ändern', async () => {
      const res = await call('PATCH', `/api/v1/admin/users/${editor.id}`, { cookie: adminToken, body: { role: 'technician' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.role).toBe('technician');
      data.users.setRole(editor.id, 'editor');
      expect((await call('PATCH', `/api/v1/admin/users/00000000-0000-4000-8000-000000000000`, { cookie: adminToken, body: { role: 'editor' } })).statusCode).toBe(404);
      expect((await call('PATCH', `/api/v1/admin/users/${editor.id}`, { cookie: adminToken, body: { role: 'superuser' } })).statusCode).toBe(400);
    });
  });

  describe('Copilot', () => {
    it('Status: Retrieval-Modus ohne API-Schlüssel', async () => {
      expect((await call('GET', '/api/v1/copilot/status')).json()).toEqual({ mode: 'retrieval' });
    });

    it('Frage im Retrieval-Modus liefert belegte Inhalte (Zitate)', async () => {
      const res = await call('POST', '/api/v1/copilot/ask', { body: { question: 'Wie funktioniert die Pulsoximetrie?' } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe('retrieval');
      expect(body.citations.length).toBeGreaterThan(0);
      expect(body.citations[0]).toMatchObject({ index: 1, entity: { id: expect.any(String), title: expect.any(String) } });
      expect(body.citations.every((c: { entity: { type: string } }) => c.entity.type !== 'quiz_question' && c.entity.type !== 'offer')).toBe(true);
      expect(body.answer).toContain('[1]');
      expect(body.disclaimer).toBeTruthy();
    });

    it('Kontext-Entität wird als erstes Zitat geführt', async () => {
      const res = await call('POST', '/api/v1/copilot/ask', { body: { question: 'Was ist das?', contextId: 'device:pulsoximeter' } });
      expect(res.json().citations[0].entity.id).toBe('device:pulsoximeter');
    });

    it('keine Treffer → Antwort ohne Zitate; ungültige Eingabe → 400', async () => {
      const res = await call('POST', '/api/v1/copilot/ask', { body: { question: 'xyzqwvbn' } });
      expect(res.json().citations).toEqual([]);
      expect((await call('POST', '/api/v1/copilot/ask', { body: { question: '' } })).statusCode).toBe(400);
    });
  });
});

describe('Rate-Limiting', () => {
  it('Login: 11. Versuch innerhalb einer Minute → 429 mit Retry-After', async () => {
    const data = createDataLayer({ path: ':memory:' });
    const app = await buildApp(data, testConfig());
    try {
      const call = client(app);
      // Ungültige Eingaben zählen ebenfalls (Limit greift vor der Validierung) – so bleibt der Test schnell
      for (let i = 1; i <= 10; i++) {
        const res = await call('POST', '/api/v1/auth/login', { body: { email: `x${i}@test.de` } });
        expect(res.statusCode, `Versuch ${i}`).toBe(400);
      }
      const blocked = await call('POST', '/api/v1/auth/login', { body: { email: 'x@test.de', password: 'egal-egal-1' } });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('rate_limited');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // Andere Buckets (Registrierung) sind unabhängig
      const reg = await call('POST', '/api/v1/auth/register', { body: {} });
      expect(reg.statusCode).toBe(400);
    } finally {
      await app.close();
      data.close();
    }
  });
});
