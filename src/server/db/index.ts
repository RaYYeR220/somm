import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./schema";

export type Db = Database.Database;

export function openDb(file: string): Db {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  // Litestream holds the write lock briefly while it checkpoints; wait for it rather than fail.
  db.pragma("busy_timeout = 30000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (n INTEGER PRIMARY KEY, at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT n FROM migrations").all() as { n: number }[]).map((row) => row.n));
  MIGRATIONS.forEach((sql, n) => {
    if (done.has(n)) return;
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (n, at) VALUES (?, ?)").run(n, new Date().toISOString());
    }).immediate();
  });
}

let shared: Db | null = null;

/** The process-wide database under DATA_DIR. */
export function getDb(): Db {
  if (!shared) shared = openDb(join(resolve(process.env.DATA_DIR ?? "./data"), "somm.sqlite"));
  return shared;
}
