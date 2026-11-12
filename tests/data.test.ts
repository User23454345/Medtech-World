import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { summarizeIssues, type PublicUser } from '@medtech/core';
import {
  ContentValidationError,
  EmailTakenError,
  createDataLayer,
  hashPassword,
  seedContent,
  seedFromDirectory,
  tokenize,
  verifyPassword,
  type DataLayer,
  type SeedResult,
} from '@medtech/data';
import { TODAY, entity, files } from './fixtures.ts';

const CONTENT_DIR = resolve(import.meta.dirname, '../content');

describe('Datenschicht mit realen Inhalten', () => {
  let data: DataLayer;
  let seed: SeedResult;

  beforeAll(() => {
    data = createDataLayer({ path: ':memory:' });
    seed = seedFromDirectory(data.db, CONTENT_DIR);
  });
  afterAll(() => data.close());

  it('die Inhalte haben 0 QA-Fehler', () => {
    const errors = seed.report.issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => `[${e.code}] ${e.entityId ?? e.sourceId ?? e.file}: ${e.message}`)).toEqual([]);
    expect(summarizeIssues(seed.report.issues).errors).toBe(0);
  });

  it('Such-Snippets ohne Leerzeichen vor Satzzeichen (Markdown-Reste)', () => {
    const hit = data.content.search('pulsoximetrisch').hits.find((h) => h.id === 'term:spo2');
    expect(hit?.snippet).toBeTruthy();
    expect(hit!.snippet).not.toMatch(/ [.,;:]/);
    expect(hit!.snippet).not.toContain('*');
  });

  it('Bericht und Datenbank sind konsistent', () => {
    const count = (sql: string) => (data.db.prepare(sql).get() as { n: number }).n;
    expect(seed.report.counts.entities).toBeGreaterThan(50);
    expect(count('SELECT count(*) AS n FROM entities')).toBe(seed.report.counts.entities);
    expect(count('SELECT count(*) AS n FROM relations')).toBe(seed.report.counts.relations);
    expect(count('SELECT count(*) AS n FROM sources')).toBe(seed.report.counts.sources);
    expect(count('SELECT count(*) AS n FROM specs')).toBe(seed.report.counts.specs);
    expect(count('SELECT count(*) AS n FROM search_index')).toBe(seed.report.counts.entities);
    expect(data.content.qualityReport()?.counts).toEqual(seed.report.counts);
  });

  it('jede technische Angabe verweist auf eine existierende Quelle', () => {
    const orphanSpecs = data.db.prepare('SELECT count(*) AS n FROM specs s LEFT JOIN sources src ON src.id = s.source_id WHERE src.id IS NULL').get() as { n: number };
    expect(orphanSpecs.n).toBe(0);
  });

  it('erneutes Seeding ist idempotent', () => {
    const again = seedFromDirectory(data.db, CONTENT_DIR);
    expect(again.report.counts).toEqual(seed.report.counts);
    expect((data.db.prepare('SELECT count(*) AS n FROM entities').get() as { n: number }).n).toBe(seed.report.counts.entities);
  });

  describe('Suche', () => {
    it('"SpO2" findet Inhalte über Typen und Module hinweg', () => {
      const res = data.content.search('SpO2', { limit: 200 });
      expect(res.total).toBeGreaterThan(5);
      const types = Object.keys(res.byType);
      expect(types).toEqual(expect.arrayContaining(['term', 'device']));
      const detailTypes = ['component', 'fault', 'learning_module', 'manufacturer', 'product_model'].filter((t) => types.includes(t));
      expect(detailTypes.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(res.byModule)).toEqual(expect.arrayContaining(['wiki', 'repair', 'academy']));
      // Fachbegriff/Gerät stehen vorn
      expect(['term', 'device']).toContain(res.hits[0]!.type);
      expect(res.hits.map((h) => h.id)).toContain('term:spo2');
      // Treffer sind nach Relevanz sortiert
      const scores = res.hits.map((h) => h.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });

    it('"SpO₂" (tiefgestellte Ziffer) liefert dieselben Treffer wie "SpO2"', () => {
      const a = data.content.search('SpO₂', { limit: 200 });
      const b = data.content.search('SpO2', { limit: 200 });
      expect(a.total).toBe(b.total);
      expect(a.hits.map((h) => h.id).sort()).toEqual(b.hits.map((h) => h.id).sort());
    });

    it('leere Anfragen und Sonderzeichen werfen nicht', () => {
      expect(data.content.search('').total).toBe(0);
      expect(data.content.search('   ').total).toBe(0);
      for (const q of ['"*()', 'NEAR(', 'a AND', '"', '*', '-spo2', 'spo2"', "'; DROP TABLE entities; --", '((()))', '^$', 'term:spo2']) {
        expect(() => data.content.search(q)).not.toThrow();
      }
      expect(data.content.search('"*()').total).toBe(0);
    });

    it('Filter nach Typ und Modul und Limit', () => {
      const terms = data.content.search('SpO2', { types: ['term'] });
      expect(terms.hits.length).toBeGreaterThan(0);
      expect(terms.hits.every((h) => h.type === 'term')).toBe(true);
      const repair = data.content.search('SpO2', { module: 'repair', limit: 200 });
      expect(repair.hits.length).toBeGreaterThan(0);
      expect(data.content.search('SpO2', { limit: 2 }).hits).toHaveLength(2);
    });

    it('mehrere Begriffe: UND-Verknüpfung mit ODER-Fallback', () => {
      const res = data.content.search('Pulsoximeter xyzunbekanntxyz');
      expect(res.total).toBeGreaterThan(0);
    });

    it('tokenize zerlegt sicher in Wort-Tokens', () => {
      expect(tokenize('SpO₂ "Sensor"*()')).toEqual(['spo2', 'sensor']);
      expect(tokenize('')).toEqual([]);
      expect(tokenize('a b c d e f g h i j')).toHaveLength(8);
    });
  });

  describe('Detailseiten & Relationen', () => {
    it('get liefert Daten, Quellen, Relationen und Module', () => {
      const e = data.content.get('device:pulsoximeter');
      expect(e).not.toBeNull();
      expect(e!.sources.length).toBeGreaterThan(0);
      expect(e!.relations.length).toBeGreaterThan(0);
      expect(e!.modules).toContain('wiki');
      expect(e!.modules).toContain('copilot');
      expect(data.content.get('device:gibt-es-nicht')).toBeNull();
    });

    it('relationGroups erzeugt die Gegenrichtung (inverse Relationen)', () => {
      const rel = data.db.prepare(`SELECT from_id, to_id FROM relations WHERE rel = 'has_component' LIMIT 1`).get() as { from_id: string; to_id: string };
      const out = data.content.relationGroups(rel.from_id).find((g) => g.rel === 'has_component' && g.direction === 'out');
      expect(out?.label).toBe('Komponenten');
      expect(out?.items.map((i) => i.id)).toContain(rel.to_id);
      const inv = data.content.relationGroups(rel.to_id).find((g) => g.rel === 'has_component' && g.direction === 'in');
      expect(inv).toBeDefined();
      expect(inv!.label).toBe('verbaut in');
      expect(inv!.items.map((i) => i.id)).toContain(rel.from_id);
    });

    it('list filtert nach Typ und Verknüpfung', () => {
      const devices = data.content.list({ type: 'device', limit: 500 });
      expect(devices.total).toBeGreaterThan(0);
      expect(devices.items.every((i) => i.type === 'device')).toBe(true);
      const related = data.content.list({ relatedTo: 'device:pulsoximeter', limit: 500 });
      expect(related.total).toBeGreaterThan(0);
      expect(related.items.map((i) => i.id)).not.toContain('device:pulsoximeter');
    });
  });
});

describe('Entwürfe', () => {
  let data: DataLayer;
  beforeAll(() => {
    data = createDataLayer({ path: ':memory:' });
    seedContent(
      data.db,
      files([
        entity('device:pulsoximeter', { title: 'Pulsoximeter', links: [{ rel: 'uses_principle', to: 'term:entwurfsbegriff' }] }),
        entity('term:entwurfsbegriff', { title: 'Entwurfsbegriff Plethysmografie', review: { status: 'entwurf', reviewedAt: '2026-05-01' } }),
        entity('media:entwurfsbild', {
          title: 'Entwurfsbild',
          links: [{ rel: 'illustrates', to: 'device:pulsoximeter' }],
          review: { status: 'entwurf', reviewedAt: '2026-05-01' },
        }),
      ]),
      { today: TODAY },
    );
  });
  afterAll(() => data.close());

  it('sind ohne includeDrafts unsichtbar', () => {
    expect(data.content.get('term:entwurfsbegriff')).toBeNull();
    expect(data.content.exists('term:entwurfsbegriff')).toBe(false);
    expect(data.content.search('Plethysmografie').total).toBe(0);
    expect(data.content.list({ type: 'term' }).total).toBe(0);
    expect(data.content.typeCounts().term).toBe(0);
    expect(data.content.relationGroups('device:pulsoximeter')).toEqual([]);
  });

  it('verraten sich nicht über Vorschaubilder, relatedTo oder Modulzuordnung', () => {
    expect(data.content.get('device:pulsoximeter')?.thumbnail).toBeUndefined();
    expect(data.content.list({ type: 'device' }).items[0]?.thumbnail).toBeUndefined();
    expect(data.content.list({ relatedTo: 'media:entwurfsbild' })).toEqual({ items: [], total: 0 });
    expect(data.content.list({ relatedTo: 'term:entwurfsbegriff' }).total).toBe(0);
    // mit Redaktionsrechten weiterhin sichtbar
    const opts = { includeDrafts: true };
    expect(data.content.get('device:pulsoximeter', opts)?.thumbnail).toMatch(/^data:image\/svg\+xml/);
    expect(data.content.list({ relatedTo: 'media:entwurfsbild', ...opts }).total).toBe(1);
  });

  it('sind mit includeDrafts sichtbar', () => {
    const opts = { includeDrafts: true };
    expect(data.content.get('term:entwurfsbegriff', opts)?.flags.map((f) => f.kind)).toContain('draft');
    expect(data.content.search('Plethysmografie', opts).total).toBe(1);
    expect(data.content.list({ type: 'term', ...opts }).total).toBe(1);
    expect(data.content.relationGroups('device:pulsoximeter', opts)).toHaveLength(2);
  });

  it('Seeding mit QA-Fehlern wird abgebrochen (Inhalte bleiben unverändert)', () => {
    expect(() => seedContent(data.db, files([entity('device:x', { sources: [] })]), { today: TODAY })).toThrow(ContentValidationError);
    expect(data.content.exists('device:pulsoximeter')).toBe(true);
  });
});

describe('Nutzerverwaltung', () => {
  let data: DataLayer;
  let alice: PublicUser;
  let bob: PublicUser;
  const PW = 'Sicheres-Passwort-1';

  beforeAll(async () => {
    data = createDataLayer({ path: ':memory:' });
    seedFromDirectory(data.db, CONTENT_DIR);
    [alice, bob] = await Promise.all([
      data.users.create({ email: 'Alice@Example.org ', password: PW, displayName: ' Alice ' }),
      data.users.create({ email: 'bob@example.org', password: PW, displayName: 'Bob', role: 'technician' }),
    ]);
  });
  afterAll(() => data.close());

  beforeEach(() => {
    if (!data.users.byId(alice.id)) return;
    data.users.updateSettings(alice.id, { trackHistory: true });
    data.users.clearHistory(alice.id);
  });

  it('Passwort-Hashing mit scrypt', async () => {
    const h = await hashPassword('Geheim-123');
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword('Geheim-123', h)).toBe(true);
    expect(await verifyPassword('geheim-123', h)).toBe(false);
    expect(await verifyPassword('Geheim-123', 'kaputt')).toBe(false);
  });

  it('create normalisiert E-Mail und Namen; Standardrolle ist learner', () => {
    expect(alice.email).toBe('alice@example.org');
    expect(alice.displayName).toBe('Alice');
    expect(alice.role).toBe('learner');
    expect(bob.role).toBe('technician');
    expect(alice).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(alice)).not.toContain('scrypt');
  });

  it('authenticate: richtiges Passwort ok, falsches Passwort und unbekannte E-Mail scheitern', async () => {
    expect((await data.users.authenticate('ALICE@example.org', PW))?.id).toBe(alice.id);
    expect(await data.users.authenticate('alice@example.org', 'Falsches-Passwort-1')).toBeNull();
    expect(await data.users.authenticate('niemand@example.org', PW)).toBeNull();
  });

  it('doppelte E-Mail-Adresse → EmailTakenError (ohne Beachtung der Groß-/Kleinschreibung)', async () => {
    await expect(data.users.create({ email: 'ALICE@example.org', password: PW, displayName: 'Doppelt' })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('Sitzungen: gültig, abgelaufen, gelöscht', () => {
    const s = data.users.createSession(alice.id);
    expect(s.token.length).toBeGreaterThan(30);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(data.users.userForSession(s.token)?.id).toBe(alice.id);
    expect(data.users.userForSession('falsches-token')).toBeNull();
    // Token wird nur gehasht gespeichert
    expect(data.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(s.token)).toBeUndefined();

    const expired = data.users.createSession(alice.id);
    // alle Sitzungen ablaufen lassen
    data.db.prepare(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?`).run(alice.id);
    expect(data.users.userForSession(expired.token)).toBeNull();
    expect(data.users.userForSession(s.token)).toBeNull();

    const fresh = data.users.createSession(alice.id);
    // abgelaufene Sitzungen werden beim Anlegen neuer Sitzungen aufgeräumt
    expect((data.db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(alice.id) as { n: number }).n).toBe(1);
    data.users.deleteSession(fresh.token);
    expect(data.users.userForSession(fresh.token)).toBeNull();
  });

  it('Favoriten: hinzufügen (idempotent), auflisten mit Kurzinfo, entfernen; pro Nutzer getrennt', () => {
    data.users.addFavorite(alice.id, 'device:pulsoximeter');
    data.users.addFavorite(alice.id, 'device:pulsoximeter');
    const favs = data.users.listFavorites(alice.id);
    expect(favs).toHaveLength(1);
    expect(favs[0]!.entity?.title).toBeTruthy();
    expect(data.users.listFavorites(bob.id)).toEqual([]);
    data.users.removeFavorite(bob.id, 'device:pulsoximeter');
    expect(data.users.listFavorites(alice.id)).toHaveLength(1);
    data.users.removeFavorite(alice.id, 'device:pulsoximeter');
    expect(data.users.listFavorites(alice.id)).toEqual([]);
  });

  it('Favorit auf später gelöschten Inhalt bleibt erhalten (entity: null)', () => {
    data.users.addFavorite(alice.id, 'term:nicht-mehr-vorhanden');
    expect(data.users.listFavorites(alice.id)[0]).toMatchObject({ entityId: 'term:nicht-mehr-vorhanden', entity: null });
    data.users.removeFavorite(alice.id, 'term:nicht-mehr-vorhanden');
  });

  it('Lernfortschritt: abgeschlossen bleibt abgeschlossen, bester Score zählt', () => {
    const id = 'term:spo2';
    expect(data.users.setProgress(alice.id, id, 'started', 40)).toMatchObject({ status: 'started', score: 40 });
    expect(data.users.setProgress(alice.id, id, 'completed', 90)).toMatchObject({ status: 'completed', score: 90 });
    expect(data.users.setProgress(alice.id, id, 'started', 50)).toMatchObject({ status: 'completed', score: 90 });
    expect(data.users.setProgress(alice.id, id, 'started', null)).toMatchObject({ status: 'completed', score: 90 });
    expect(data.users.setProgress(alice.id, id, 'completed', 100)).toMatchObject({ status: 'completed', score: 100 });
    expect(data.users.setProgress(alice.id, 'device:pulsoximeter', 'started', null)).toMatchObject({ status: 'started', score: null });
    expect(data.users.setProgress(alice.id, 'device:pulsoximeter', 'started', 30)).toMatchObject({ score: 30 });
    expect(data.users.listProgress(bob.id)).toEqual([]);
  });

  it('Notizen: nur die eigene Person darf lesen, ändern und löschen', () => {
    const note = data.users.createNote(alice.id, 'term:spo2', 'Meine Notiz');
    expect(note).toMatchObject({ entityId: 'term:spo2', text: 'Meine Notiz' });
    expect(note.entity?.id).toBe('term:spo2');
    const free = data.users.createNote(alice.id, null, 'Allgemeine Notiz');
    expect(free.entity).toBeNull();

    expect(data.users.listNotes(bob.id)).toEqual([]);
    expect(data.users.updateNote(bob.id, note.id, 'Gehackt')).toBeNull();
    expect(data.users.deleteNote(bob.id, note.id)).toBe(false);
    expect(data.users.listNotes(alice.id, 'term:spo2').map((n) => n.text)).toEqual(['Meine Notiz']);

    expect(data.users.updateNote(alice.id, note.id, 'Geändert')?.text).toBe('Geändert');
    expect(data.users.deleteNote(alice.id, note.id)).toBe(true);
    expect(data.users.deleteNote(alice.id, note.id)).toBe(false);
    expect(data.users.listNotes(alice.id).map((n) => n.id)).toEqual([free.id]);
    data.users.deleteNote(alice.id, free.id);
  });

  it('Lernhistorie: dedupliziert gleiche Ansichten innerhalb kurzer Zeit', () => {
    data.users.recordHistory(alice.id, 'term:spo2', 'wiki', 'view');
    data.users.recordHistory(alice.id, 'term:spo2', 'wiki', 'view');
    data.users.recordHistory(alice.id, 'term:spo2', 'academy', 'quiz');
    data.users.recordHistory(alice.id, 'device:pulsoximeter', 'wiki', 'view');
    const h = data.users.listHistory(alice.id);
    expect(h).toHaveLength(3);
    expect(h.filter((e) => e.entityId === 'term:spo2' && e.action === 'view')).toHaveLength(1);
    expect(h[0]!.entity).not.toBeNull();
    expect(data.users.listHistory(alice.id, 1)).toHaveLength(1);
    expect(data.users.listHistory(bob.id)).toEqual([]);
  });

  it('Lernhistorie: trackHistory = false löscht die Historie und protokolliert nichts mehr', () => {
    data.users.recordHistory(alice.id, 'term:spo2', 'wiki', 'view');
    expect(data.users.listHistory(alice.id)).toHaveLength(1);
    const s = data.users.updateSettings(alice.id, { trackHistory: false });
    expect(s.trackHistory).toBe(false);
    expect(data.users.listHistory(alice.id)).toEqual([]);
    data.users.recordHistory(alice.id, 'device:pulsoximeter', 'wiki', 'view');
    expect(data.users.listHistory(alice.id)).toEqual([]);
  });

  it('Einstellungen: Defaults, Teilaktualisierung, ungültiges Startmodul', () => {
    expect(data.users.getSettings(bob.id)).toEqual({ theme: 'system', startModule: 'wiki', trackHistory: true, reducedMotion: false });
    expect(data.users.updateSettings(bob.id, { theme: 'dark' })).toMatchObject({ theme: 'dark', startModule: 'wiki' });
    expect(data.users.updateSettings(bob.id, { startModule: 'unbekannt' as never }).startModule).toBe('wiki');
    expect(data.users.getSettings(bob.id).theme).toBe('dark');
  });

  it('Profil und Rolle ändern', () => {
    expect(data.users.updateProfile(bob.id, { displayName: '  Bob B.  ' })?.displayName).toBe('Bob B.');
    expect(data.users.setRole(bob.id, 'editor')?.role).toBe('editor');
    expect(data.users.setRole('00000000-0000-0000-0000-000000000000', 'admin')).toBeNull();
    expect(data.users.listUsers().map((u) => u.id)).toEqual(expect.arrayContaining([alice.id, bob.id]));
    expect(data.users.count()).toBeGreaterThanOrEqual(2);
  });

  it('exportData enthält alle personenbezogenen Daten in definierter Struktur', () => {
    data.users.addFavorite(alice.id, 'term:spo2');
    data.users.createNote(alice.id, 'term:spo2', 'Export-Notiz');
    data.users.recordHistory(alice.id, 'term:spo2', 'wiki', 'view');
    data.users.createInquiry(alice.id, 'offer:demo', 'Anfrage');
    const ex = data.users.exportData(alice.id);
    expect(Object.keys(ex).sort()).toEqual(['exportedAt', 'favorites', 'history', 'inquiries', 'notes', 'progress', 'settings', 'user'].sort());
    expect(ex.user?.id).toBe(alice.id);
    expect(ex.favorites).toEqual([{ entityId: 'term:spo2', createdAt: expect.any(String) }]);
    expect(ex.notes.map((n) => n.text)).toContain('Export-Notiz');
    expect(ex.notes[0]).not.toHaveProperty('entity');
    expect(ex.progress.length).toBeGreaterThan(0);
    expect(ex.progress[0]).not.toHaveProperty('entity');
    expect(ex.history).toHaveLength(1);
    expect(ex.inquiries).toHaveLength(1);
    expect(JSON.stringify(ex)).not.toContain('scrypt$');
  });

  it('Passwortänderung beendet alle Sitzungen', async () => {
    const s = data.users.createSession(bob.id);
    expect(await data.users.changePassword(bob.id, 'falsch-falsch-1', 'Neues-Passwort-2')).toBe(false);
    expect(data.users.userForSession(s.token)?.id).toBe(bob.id);
    expect(await data.users.changePassword(bob.id, PW, 'Neues-Passwort-2')).toBe(true);
    expect(data.users.userForSession(s.token)).toBeNull();
  });

  it('deleteUser löscht alle Nutzerdaten (Kaskade)', () => {
    data.users.createSession(alice.id);
    data.users.setProgress(alice.id, 'term:spo2', 'started', 10);
    data.users.recordHistory(alice.id, 'term:spo2', 'wiki', 'view');
    const tables = ['sessions', 'user_settings', 'favorites', 'progress', 'notes', 'history', 'inquiries'];
    const countFor = (t: string) => (data.db.prepare(`SELECT count(*) AS n FROM ${t} WHERE user_id = ?`).get(alice.id) as { n: number }).n;
    for (const t of tables) expect(countFor(t), t).toBeGreaterThan(0);
    data.users.deleteUser(alice.id);
    expect(data.users.byId(alice.id)).toBeNull();
    for (const t of tables) expect(countFor(t), t).toBe(0);
    // andere Nutzer bleiben unberührt
    expect(data.users.byId(bob.id)).not.toBeNull();
  });

  it('Seeding lässt Nutzerdaten unberührt', () => {
    data.users.addFavorite(bob.id, 'term:spo2');
    seedFromDirectory(data.db, CONTENT_DIR);
    expect(data.users.listFavorites(bob.id).map((f) => f.entityId)).toContain('term:spo2');
  });
});
