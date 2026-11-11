import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  DEFAULT_SETTINGS,
  MODULE_IDS,
  ROLES,
  type Favorite,
  type HistoryEntry,
  type ModuleId,
  type Note,
  type ProgressEntry,
  type ProgressStatus,
  type PublicUser,
  type Role,
  type UserSettings,
} from '@medtech/core';
import { transaction, type Database } from './database.ts';
import type { ContentRepository } from './content-repository.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64 } as const;
const SESSION_DAYS = 14;
const HISTORY_LIMIT_PER_USER = 500;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const N = Number(n);
  const R = Number(r);
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: 128 * N * R * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

const toPublic = (r: UserRow): PublicUser => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  role: r.role,
  createdAt: r.created_at,
});

export class EmailTakenError extends Error {
  constructor() {
    super('Diese E-Mail-Adresse ist bereits registriert.');
  }
}

/**
 * Gemeinsame Nutzerverwaltung für alle Module: Konto, Sitzungen, Favoriten,
 * Lernfortschritt, Notizen, Lernhistorie, Einstellungen.
 */
export class UserRepository {
  constructor(
    private readonly db: Database,
    private readonly content: ContentRepository,
  ) {}

  // ----------------------------------------------------------- Konten
  async create(input: { email: string; password: string; displayName: string; role?: Role }): Promise<PublicUser> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const role: Role = input.role && ROLES.includes(input.role) ? input.role : 'learner';
    const hash = await hashPassword(input.password);
    try {
      this.db
        .prepare('INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, input.email.trim().toLowerCase(), input.displayName.trim(), hash, role, now, now);
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new EmailTakenError();
      throw e;
    }
    return this.byId(id)!;
  }

  byId(id: string): PublicUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toPublic(row) : null;
  }

  count(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n;
  }

  async authenticate(email: string, password: string): Promise<PublicUser | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
    if (!row) {
      // Gleiche Laufzeit wie bei existierendem Konto (kein User-Enumeration-Timing)
      await hashPassword(password);
      return null;
    }
    return (await verifyPassword(password, row.password_hash)) ? toPublic(row) : null;
  }

  updateProfile(userId: string, patch: { displayName?: string }): PublicUser | null {
    if (patch.displayName) {
      this.db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(patch.displayName.trim(), new Date().toISOString(), userId);
    }
    return this.byId(userId);
  }

  async changePassword(userId: string, current: string, next: string): Promise<boolean> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!row || !(await verifyPassword(current, row.password_hash))) return false;
    const hash = await hashPassword(next);
    transaction(this.db, () => {
      this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, new Date().toISOString(), userId);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    });
    return true;
  }

  setRole(userId: string, role: Role): PublicUser | null {
    this.db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, new Date().toISOString(), userId);
    return this.byId(userId);
  }

  listUsers(): PublicUser[] {
    return (this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as unknown as UserRow[]).map(toPublic);
  }

  /** DSGVO Art. 17: Konto und alle personenbezogenen Daten löschen */
  deleteUser(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ----------------------------------------------------------- Sitzungen
  createSession(userId: string): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(sha256(token), userId, now.toISOString(), expiresAt.toISOString());
    // abgelaufene Sitzungen aufräumen
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
    return { token, expiresAt };
  }

  userForSession(token: string): PublicUser | null {
    const row = this.db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
    return row ? toPublic(row) : null;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  // ----------------------------------------------------------- Einstellungen
  getSettings(userId: string): UserSettings {
    const row = this.db.prepare('SELECT settings FROM user_settings WHERE user_id = ?').get(userId) as { settings: string } | undefined;
    return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.settings) as Partial<UserSettings>) : {}) };
  }

  updateSettings(userId: string, patch: Partial<UserSettings>): UserSettings {
    const next = { ...this.getSettings(userId), ...patch };
    if (!MODULE_IDS.includes(next.startModule)) next.startModule = DEFAULT_SETTINGS.startModule;
    this.db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings) VALUES (?, ?)').run(userId, JSON.stringify(next));
    if (!next.trackHistory) this.clearHistory(userId);
    return next;
  }

  // ----------------------------------------------------------- Favoriten
  listFavorites(userId: string): Favorite[] {
    const rows = this.db.prepare('SELECT entity_id, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Array<{
      entity_id: string;
      created_at: string;
    }>;
    const sums = this.content.summariesByIds(rows.map((r) => r.entity_id));
    return rows.map((r) => ({ entityId: r.entity_id, createdAt: r.created_at, entity: sums.get(r.entity_id) ?? null }));
  }

  addFavorite(userId: string, entityId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO favorites (user_id, entity_id, created_at) VALUES (?,?,?)').run(userId, entityId, new Date().toISOString());
  }

  removeFavorite(userId: string, entityId: string): void {
    this.db.prepare('DELETE FROM favorites WHERE user_id = ? AND entity_id = ?').run(userId, entityId);
  }

  // ----------------------------------------------------------- Lernfortschritt
  listProgress(userId: string): ProgressEntry[] {
    const rows = this.db.prepare('SELECT * FROM progress WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as Array<{
      entity_id: string;
      status: ProgressStatus;
      score: number | null;
      updated_at: string;
    }>;
    const sums = this.content.summariesByIds(rows.map((r) => r.entity_id));
    return rows.map((r) => ({ entityId: r.entity_id, status: r.status, score: r.score, updatedAt: r.updated_at, entity: sums.get(r.entity_id) ?? null }));
  }

  /** Fortschritt speichern. Ein abgeschlossenes Modul bleibt abgeschlossen; der beste Score zählt. */
  setProgress(userId: string, entityId: string, status: ProgressStatus, score: number | null): ProgressEntry {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO progress (user_id, entity_id, status, score, updated_at) VALUES (?,?,?,?,?)
         ON CONFLICT (user_id, entity_id) DO UPDATE SET
           status = CASE WHEN progress.status = 'completed' THEN 'completed' ELSE excluded.status END,
           score  = CASE WHEN excluded.score IS NULL THEN progress.score
                         WHEN progress.score IS NULL THEN excluded.score
                         ELSE max(progress.score, excluded.score) END,
           updated_at = excluded.updated_at`,
      )
      .run(userId, entityId, status, score, now);
    return this.listProgress(userId).find((p) => p.entityId === entityId)!;
  }

  // ----------------------------------------------------------- Notizen
  listNotes(userId: string, entityId?: string): Note[] {
    const rows = (
      entityId
        ? this.db.prepare('SELECT * FROM notes WHERE user_id = ? AND entity_id = ? ORDER BY updated_at DESC').all(userId, entityId)
        : this.db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(userId)
    ) as Array<{ id: string; entity_id: string | null; text: string; created_at: string; updated_at: string }>;
    const sums = this.content.summariesByIds(rows.flatMap((r) => (r.entity_id ? [r.entity_id] : [])));
    return rows.map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      text: r.text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      entity: r.entity_id ? (sums.get(r.entity_id) ?? null) : null,
    }));
  }

  createNote(userId: string, entityId: string | null, text: string): Note {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO notes (id, user_id, entity_id, text, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(id, userId, entityId, text, now, now);
    return this.listNotes(userId).find((n) => n.id === id)!;
  }

  updateNote(userId: string, noteId: string, text: string): Note | null {
    const res = this.db.prepare('UPDATE notes SET text = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(text, new Date().toISOString(), noteId, userId);
    if (Number(res.changes) === 0) return null;
    return this.listNotes(userId).find((n) => n.id === noteId) ?? null;
  }

  deleteNote(userId: string, noteId: string): boolean {
    return Number(this.db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId).changes) > 0;
  }

  // ----------------------------------------------------------- Lernhistorie
  recordHistory(userId: string, entityId: string, module: ModuleId, action: HistoryEntry['action']): void {
    if (!this.getSettings(userId).trackHistory) return;
    const now = new Date().toISOString();
    // gleiche Ansicht innerhalb von 10 Minuten nicht doppelt protokollieren
    const recent = this.db
      .prepare('SELECT 1 FROM history WHERE user_id = ? AND entity_id = ? AND action = ? AND at > ?')
      .get(userId, entityId, action, new Date(Date.now() - 10 * 60_000).toISOString());
    if (recent) return;
    this.db.prepare('INSERT INTO history (user_id, entity_id, module, action, at) VALUES (?,?,?,?,?)').run(userId, entityId, module, action, now);
    this.db
      .prepare('DELETE FROM history WHERE user_id = ? AND id NOT IN (SELECT id FROM history WHERE user_id = ? ORDER BY at DESC LIMIT ?)')
      .run(userId, userId, HISTORY_LIMIT_PER_USER);
  }

  listHistory(userId: string, limit = 50): HistoryEntry[] {
    const rows = this.db.prepare('SELECT * FROM history WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(userId, Math.min(limit, 500)) as Array<{
      entity_id: string;
      module: ModuleId;
      action: HistoryEntry['action'];
      at: string;
    }>;
    const sums = this.content.summariesByIds(rows.map((r) => r.entity_id));
    return rows.map((r) => ({ entityId: r.entity_id, module: r.module, action: r.action, at: r.at, entity: sums.get(r.entity_id) ?? null }));
  }

  clearHistory(userId: string): void {
    this.db.prepare('DELETE FROM history WHERE user_id = ?').run(userId);
  }

  // ----------------------------------------------------------- Market-Anfragen
  createInquiry(userId: string, offerId: string, message: string): { id: string; createdAt: string } {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db.prepare('INSERT INTO inquiries (id, user_id, offer_id, message, created_at) VALUES (?,?,?,?,?)').run(id, userId, offerId, message, createdAt);
    return { id, createdAt };
  }

  listInquiries(userId: string) {
    return this.db.prepare('SELECT id, offer_id AS offerId, message, created_at AS createdAt FROM inquiries WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  }

  // ----------------------------------------------------------- DSGVO-Export
  /** DSGVO Art. 15/20: alle gespeicherten personenbezogenen Daten maschinenlesbar */
  exportData(userId: string) {
    return {
      exportedAt: new Date().toISOString(),
      user: this.byId(userId),
      settings: this.getSettings(userId),
      favorites: this.listFavorites(userId).map(({ entityId, createdAt }) => ({ entityId, createdAt })),
      progress: this.listProgress(userId).map(({ entity: _e, ...p }) => p),
      notes: this.listNotes(userId).map(({ entity: _e, ...n }) => n),
      history: this.listHistory(userId, 500).map(({ entity: _e, ...h }) => h),
      inquiries: this.listInquiries(userId),
    };
  }
}
