import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { RunEvent, RunEventKind } from "@/lib/types";
import type { Db } from "@/server/db";

export type RunKind = "scout" | "diligence";
export type RunStatus = "running" | "paused" | "done" | "degraded" | "error";

export type RunRecord = {
  id: string;
  kind: RunKind;
  workspace: string;
  input: unknown;
  status: RunStatus;
  demo: boolean;
  result: unknown;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  kind: RunKind;
  workspace: string;
  input_json: string;
  status: RunStatus;
  demo: number;
  result_json: string | null;
  created_at: string;
  updated_at: string;
};

const fromRow = (row: Row): RunRecord => ({
  id: row.id,
  kind: row.kind,
  workspace: row.workspace,
  input: JSON.parse(row.input_json),
  status: row.status,
  demo: row.demo === 1,
  result: row.result_json ? JSON.parse(row.result_json) : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type RunStore = ReturnType<typeof createRunStore>;

/** Runs a restart interrupted can never finish; mark them failed so viewers aren't left waiting. */
export function sweepInterruptedRuns(store: RunStore): number {
  return store.failInterrupted();
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

export function createRunStore(db: Db) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const now = () => new Date().toISOString();

  const insertRun = db.prepare(
    "INSERT INTO runs (id, kind, workspace, input_json, status, demo, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?)",
  );
  const selectRun = db.prepare("SELECT * FROM runs WHERE id = ?");
  const selectByWorkspace = db.prepare("SELECT * FROM runs WHERE workspace = ? ORDER BY created_at DESC LIMIT 50");
  const selectDemo = db.prepare("SELECT * FROM runs WHERE demo = 1 AND status IN ('done', 'degraded') ORDER BY created_at ASC");
  const nextSeq = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_events WHERE run_id = ?");
  const insertEvent = db.prepare("INSERT INTO run_events (run_id, seq, kind, payload_json, at) VALUES (?, ?, ?, ?, ?)");
  const selectEvents = db.prepare("SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq");

  const append = db.transaction((runId: string, kind: RunEventKind, payload: unknown): RunEvent => {
    const seq = (nextSeq.get(runId) as { seq: number }).seq;
    const event: RunEvent = { runId, seq, kind, at: now(), payload };
    insertEvent.run(runId, seq, kind, JSON.stringify(payload ?? null), event.at);
    return event;
  });

  return {
    create(kind: RunKind, workspace: string, input: unknown, options: { demo?: boolean } = {}): string {
      const id = newId("run");
      const at = now();
      insertRun.run(id, kind, workspace, JSON.stringify(input), options.demo ? 1 : 0, at, at);
      return id;
    },
    get(id: string): RunRecord | undefined {
      const row = selectRun.get(id) as Row | undefined;
      return row ? fromRow(row) : undefined;
    },
    list(workspace: string): RunRecord[] {
      return (selectByWorkspace.all(workspace) as Row[]).map(fromRow);
    },
    listDemo(): RunRecord[] {
      return (selectDemo.all() as Row[]).map(fromRow);
    },
    update(id: string, patch: { status?: RunStatus; input?: unknown; result?: unknown }) {
      const sets: string[] = ["updated_at = @updated_at"];
      const params: Record<string, unknown> = { id, updated_at: now() };
      if (patch.status) {
        sets.push("status = @status");
        params.status = patch.status;
      }
      if (patch.input !== undefined) {
        sets.push("input_json = @input_json");
        params.input_json = JSON.stringify(patch.input);
      }
      if (patch.result !== undefined) {
        sets.push("result_json = @result_json");
        params.result_json = JSON.stringify(patch.result);
      }
      db.prepare(`UPDATE runs SET ${sets.join(", ")} WHERE id = @id`).run(params);
    },
    failInterrupted(): number {
      const stuck = db.prepare("SELECT id FROM runs WHERE status = 'running'").all() as { id: string }[];
      for (const { id } of stuck) {
        db.prepare("UPDATE runs SET status = 'error', updated_at = ? WHERE id = ?").run(now(), id);
        append.immediate(id, "done", { status: "error", degraded: ["The server restarted while this run was in progress. Start it again."] });
      }
      return stuck.length;
    },
    setDemo(id: string, demo: boolean) {
      db.prepare("UPDATE runs SET demo = ? WHERE id = ?").run(demo ? 1 : 0, id);
    },
    append(runId: string, kind: RunEventKind, payload: unknown): RunEvent {
      // IMMEDIATE takes the write lock before reading the next seq, so a Litestream checkpoint makes us wait, not fail.
      const event = append.immediate(runId, kind, payload);
      bus.emit(runId, event);
      return event;
    },
    events(runId: string, fromSeq = 0): RunEvent[] {
      return (selectEvents.all(runId, fromSeq) as { run_id: string; seq: number; kind: RunEventKind; payload_json: string; at: string }[]).map(
        (row) => ({ runId: row.run_id, seq: row.seq, kind: row.kind, at: row.at, payload: JSON.parse(row.payload_json) }),
      );
    },
    /** Replays stored events after `fromSeq`, then streams live ones until unsubscribed. */
    subscribe(runId: string, fromSeq: number, onEvent: (event: RunEvent) => void): () => void {
      let last = fromSeq;
      const deliver = (event: RunEvent) => {
        if (event.seq <= last) return;
        last = event.seq;
        onEvent(event);
      };
      bus.on(runId, deliver);
      for (const event of this.events(runId, fromSeq)) deliver(event);
      return () => bus.off(runId, deliver);
    },
  };
}
