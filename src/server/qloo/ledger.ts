import type { Envelope, LedgerEntry, QlooOp } from "@/lib/types";
import type { Db } from "@/server/db";
import { canonicalJson, sha256 } from "./canonical";

export type Ledger = {
  record(op: QlooOp, input: unknown, envelope: Envelope, transport: LedgerEntry["transport"]): LedgerEntry;
  all(): LedgerEntry[];
  get(id: string): LedgerEntry | undefined;
};

type Row = {
  run_id: string;
  id: string;
  op: QlooOp;
  input_json: string;
  requests_json: string;
  status: LedgerEntry["status"];
  result_sha: string;
  transport: LedgerEntry["transport"];
  at: string;
};

const fromRow = (row: Row): LedgerEntry => ({
  id: row.id,
  runId: row.run_id,
  op: row.op,
  input: JSON.parse(row.input_json),
  requests: JSON.parse(row.requests_json),
  status: row.status,
  resultSha: row.result_sha,
  transport: row.transport,
  at: row.at,
});

/** Hash of what Qloo answered, independent of summary text or timing. */
export function resultSha(envelope: Envelope): string {
  return sha256(canonicalJson({ results: envelope.results ?? null, series: envelope.series ?? null }));
}

/** Append-only record of every Qloo call a run made; ids are E1..En per run. */
export function createLedger(db: Db, runId: string): Ledger {
  const next = db.prepare("SELECT COALESCE(MAX(n), 0) + 1 AS n FROM ledger WHERE run_id = ?");
  const insert = db.prepare(
    "INSERT INTO ledger (run_id, n, id, op, input_json, requests_json, status, result_sha, transport, at) " +
      "VALUES (@run_id, @n, @id, @op, @input_json, @requests_json, @status, @result_sha, @transport, @at)",
  );
  const selectAll = db.prepare("SELECT * FROM ledger WHERE run_id = ? ORDER BY n");
  const selectOne = db.prepare("SELECT * FROM ledger WHERE run_id = ? AND id = ?");

  const record = db.transaction((op: QlooOp, input: unknown, envelope: Envelope, transport: LedgerEntry["transport"]) => {
    const n = (next.get(runId) as { n: number }).n;
    const row: Row & { n: number } = {
      run_id: runId,
      n,
      id: `E${n}`,
      op,
      input_json: canonicalJson(input),
      requests_json: JSON.stringify(envelope.provenance?.requests ?? []),
      status: envelope.status,
      result_sha: resultSha(envelope),
      transport,
      at: new Date().toISOString(),
    };
    insert.run(row);
    return fromRow(row);
  });

  return {
    record: (op, input, envelope, transport) => record(op, input, envelope, transport),
    all: () => (selectAll.all(runId) as Row[]).map(fromRow),
    get: (id) => {
      const row = selectOne.get(runId, id) as Row | undefined;
      return row ? fromRow(row) : undefined;
    },
  };
}
