/** Applied in order; each entry runs once and is recorded in `migrations`. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE qloo_cache (
    key TEXT PRIMARY KEY,
    op TEXT NOT NULL,
    input_json TEXT NOT NULL,
    envelope_json TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('scout', 'diligence')),
    workspace TEXT NOT NULL,
    input_json TEXT NOT NULL,
    status TEXT NOT NULL,
    demo INTEGER NOT NULL DEFAULT 0,
    result_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX runs_workspace ON runs (workspace, created_at);
  CREATE TABLE run_events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
  );
  CREATE TABLE ledger (
    run_id TEXT NOT NULL,
    n INTEGER NOT NULL,
    id TEXT NOT NULL,
    op TEXT NOT NULL,
    input_json TEXT NOT NULL,
    requests_json TEXT NOT NULL,
    status TEXT NOT NULL,
    result_sha TEXT NOT NULL,
    transport TEXT NOT NULL,
    at TEXT NOT NULL,
    PRIMARY KEY (run_id, n)
  );
  CREATE TABLE kits (
    slug TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    owner_token TEXT NOT NULL,
    title TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE deals (
    id TEXT PRIMARY KEY,
    kit_slug TEXT NOT NULL REFERENCES kits (slug),
    brand_name TEXT NOT NULL,
    contact TEXT NOT NULL,
    note TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX deals_kit ON deals (kit_slug, created_at);
  `,
];
