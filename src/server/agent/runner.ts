import type { RunEventKind } from "@/lib/types";
import { createEngineContext, type EngineContext } from "@/server/engine/context";
import { createLedger } from "@/server/qloo/ledger";
import type { AgentDeps } from "./deps";
import type { RunStatus } from "./run-store";

export type Step = { key: string; label: string };

export type RunControl = {
  ctx: EngineContext;
  step<T>(s: Step, fn: () => Promise<T>, describe?: (value: T) => string | undefined): Promise<T | undefined>;
  note(s: Step, status: "done" | "empty" | "error", detail?: string): void;
  degrade(reason: string): void;
};

/**
 * Runs a pipeline against one run id: wires the engine context to the event log, turns thrown
 * steps into error events (the run carries on), and settles the run's final status.
 */
export async function executeRun(
  runId: string,
  deps: AgentDeps,
  body: (run: RunControl) => Promise<{ status: Extract<RunStatus, "done" | "paused" | "degraded">; result?: unknown }>,
): Promise<void> {
  const emit = (kind: RunEventKind, payload: unknown) => deps.store.append(runId, kind, payload);
  const ctx = createEngineContext({
    runId,
    gw: deps.gw,
    ledger: createLedger(deps.db, runId),
    emit,
    budget: deps.budget,
    transportOf: deps.transportOf,
  });
  const degraded: string[] = [];
  const control: RunControl = {
    ctx,
    async step(s, fn, describe) {
      emit("step", { ...s, status: "running" });
      try {
        const value = await fn();
        emit("step", { ...s, status: "done", ...(describe ? { detail: describe(value) } : {}) });
        return value;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        emit("step", { ...s, status: "error", detail });
        degraded.push(`${s.label}: ${detail}`);
        return undefined;
      }
    },
    note(s, status, detail) {
      emit("step", { ...s, status, ...(detail ? { detail } : {}) });
    },
    degrade(reason) {
      degraded.push(reason);
    },
  };
  try {
    const outcome = await body(control);
    const status = outcome.status === "done" && (degraded.length || ctx.budget.exhausted || ctx.failures.length) ? "degraded" : outcome.status;
    if (ctx.failures.length) degraded.push(`${ctx.failures.length} Qloo request(s) failed: ${[...new Set(ctx.failures)].join(", ")}`);
    if (outcome.result !== undefined) deps.store.update(runId, { result: outcome.result });
    deps.store.update(runId, { status });
    emit("done", { status, degraded });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emit("error", { detail });
    deps.store.update(runId, { status: "error" });
    emit("done", { status: "error", degraded: [detail] });
  }
}
