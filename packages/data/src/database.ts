import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

/**
 * Zentrale Datenbank der Plattform.
 *
 * Es gibt GENAU EINE Datenbank für alle Module. Sie besteht aus zwei klar
 * getrennten Bereichen:
 *
 *  1. Inhalte (entities, relations, specs, sources, search_index):
 *     werden bei jedem Seeding vollständig aus /content neu aufgebaut.
 *     /content (Git) ist die maßgebliche Quelle – nachvollziehbar & reviewbar.
 *
 *  2. Nutzerdaten (users, sessions, favorites, progress, notes, history,
 *     settings, inquiries): bleiben beim Seeding erhalten. Verweise auf
 *     Inhalte erfolgen über stabile Entitäts-IDs (typ:slug).
 *
 * Der Zugriff erfolgt ausschließlich über Repositories (siehe repositories/),
 * sodass die Engine später gegen PostgreSQL getauscht werden kann.
 */

export type Database = DatabaseSyncType;

let sqliteModule: typeof import('node:sqlite') | null = null;

function loadSqlite(): typeof import('node:sqlite') {
  if (sqliteModule) return sqliteModule;
  // node:sqlite gibt beim Laden eine ExperimentalWarning aus – die ist hier bewusst akzeptiert.
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const msg = typeof warning === 'string' ? warning : warning.message;
    if (msg.includes('SQLite is an experimental feature')) return;
    return (original as (...a: unknown[]) => void).call(process, warning, ...args);
  }) as typeof process.emitWarning;
  try {
    sqliteModule = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  } finally {
    process.emitWarning = original;
  }
  return sqliteModule;
}

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: /* sql */ `
      -- ===================== Inhalte (aus /content) =====================
      CREATE TABLE sources (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        publisher   TEXT NOT NULL,
        kind        TEXT NOT NULL,
        url         TEXT,
        edition     TEXT,
        isbn        TEXT,
        accessed_at TEXT NOT NULL,
        note        TEXT
      );

      CREATE TABLE entities (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        slug          TEXT NOT NULL,
        title         TEXT NOT NULL,
        aliases       TEXT NOT NULL DEFAULT '[]',
        summary       TEXT NOT NULL,
        body          TEXT NOT NULL DEFAULT '',
        tags          TEXT NOT NULL DEFAULT '[]',
        data          TEXT NOT NULL DEFAULT '{}',
        demo          INTEGER NOT NULL DEFAULT 0,
        review_status TEXT NOT NULL,
        reviewed_at   TEXT NOT NULL,
        reviewer      TEXT,
        flags         TEXT NOT NULL DEFAULT '[]',
        file          TEXT,
        UNIQUE (type, slug)
      );
      CREATE INDEX idx_entities_type ON entities(type, title);

      CREATE TABLE relations (
        from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        rel     TEXT NOT NULL,
        to_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        note    TEXT,
        PRIMARY KEY (from_id, rel, to_id)
      );
      CREATE INDEX idx_relations_to ON relations(to_id, rel);

      CREATE TABLE entity_sources (
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        PRIMARY KEY (entity_id, source_id)
      );

      -- Technische Daten: jede Zeile hat genau eine Quelle
      CREATE TABLE specs (
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        ord       INTEGER NOT NULL,
        key       TEXT NOT NULL,
        label     TEXT NOT NULL,
        value     TEXT NOT NULL,
        value_num REAL,
        unit      TEXT,
        condition TEXT,
        note      TEXT,
        source_id TEXT NOT NULL REFERENCES sources(id),
        PRIMARY KEY (entity_id, ord)
      );
      CREATE INDEX idx_specs_key ON specs(key);

      CREATE VIRTUAL TABLE search_index USING fts5(
        entity_id UNINDEXED,
        title, aliases, tags, summary, body,
        tokenize = 'unicode61 remove_diacritics 2',
        prefix = '2 3'
      );

      CREATE TABLE content_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- ===================== Nutzerdaten (persistent) =====================
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'learner',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE user_settings (
        user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings TEXT NOT NULL
      );

      CREATE TABLE favorites (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_id  TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, entity_id)
      );

      CREATE TABLE progress (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_id  TEXT NOT NULL,
        status     TEXT NOT NULL,
        score      INTEGER,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, entity_id)
      );

      CREATE TABLE notes (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_id  TEXT,
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_notes_user ON notes(user_id, entity_id);

      CREATE TABLE history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        module    TEXT NOT NULL,
        action    TEXT NOT NULL,
        at        TEXT NOT NULL
      );
      CREATE INDEX idx_history_user ON history(user_id, at DESC);

      CREATE TABLE inquiries (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        offer_id   TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
];

export interface OpenOptions {
  /** Pfad zur Datenbankdatei oder ':memory:' */
  path: string;
}

export function openDatabase({ path }: OpenOptions): Database {
  const { DatabaseSync } = loadSqlite();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
  }
  migrate(db);
  return db;
}

function migrate(db: Database) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());
    });
  }
}

export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
