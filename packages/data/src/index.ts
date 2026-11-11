import { openDatabase, type Database, type OpenOptions } from './database.ts';
import { ContentRepository } from './content-repository.ts';
import { UserRepository } from './user-repository.ts';

export * from './database.ts';
export * from './seed.ts';
export * from './content-repository.ts';
export * from './user-repository.ts';

/** Zugriffsschicht auf die zentrale Datenbank – von API, Skripten und Tests genutzt. */
export interface DataLayer {
  db: Database;
  content: ContentRepository;
  users: UserRepository;
  close(): void;
}

export function createDataLayer(opts: OpenOptions): DataLayer {
  const db = openDatabase(opts);
  const content = new ContentRepository(db);
  const users = new UserRepository(db, content);
  return { db, content, users, close: () => db.close() };
}
