import type { Envelope, Fact, LedgerEntry, QlooOp, RunEventKind } from "@/lib/types";
import { errorEnvelope, type QlooGateway } from "@/server/qloo/gateway";
import type { Ledger } from "@/server/qloo/ledger";

export type FactSink = {
  add(fact: Omit<Fact, "id">): Fact;
  get(id: string): Fact | undefined;
  all(): Fact[];
};

export function createFactSink(): FactSink {
  const facts: Fact[] = [];
  return {
    add(fact) {
      const stored = { id: `F${facts.length + 1}`, ...fact };
      facts.push(stored);
      return stored;
    },
    get: (id) => facts.find((fact) => fact.id === id),
    all: () => [...facts],
  };
}

export type EngineContext = {
  runId: string;
  gw: QlooGateway;
  ledger: Ledger;
  facts: FactSink;
  emit: (kind: RunEventKind, payload: unknown) => void;
  transportOf: (op: QlooOp, input: Record<string, unknown>) => LedgerEntry["transport"];
  budget: { remaining: number; exhausted?: boolean };
  /** Error codes from Qloo calls that failed after retries. */
  failures: string[];
  signal?: AbortSignal;
};

type ContextOptions = {
  runId: string;
  gw: QlooGateway;
  ledger: Ledger;
  emit: EngineContext["emit"];
  budget: number;
  transportOf?: EngineContext["transportOf"];
  signal?: AbortSignal;
};

const HTTP_OPS = new Set<QlooOp>(["search", "insights_raw", "tags_raw"]);

export function createEngineContext(options: ContextOptions): EngineContext {
  return {
    runId: options.runId,
    gw: options.gw,
    ledger: options.ledger,
    facts: createFactSink(),
    emit: options.emit,
    transportOf: options.transportOf ?? ((op) => (HTTP_OPS.has(op) ? "http" : "mcp")),
    budget: { remaining: options.budget },
    failures: [],
    signal: options.signal,
  };
}

export type QlooCall = { env: Envelope; entry?: LedgerEntry };

/** One Qloo call: budget check, gateway, ledger entry, ledger event. */
export async function qloo(ctx: EngineContext, op: QlooOp, input: Record<string, unknown>): Promise<QlooCall> {
  if (ctx.budget.remaining <= 0) {
    if (!ctx.budget.exhausted) {
      ctx.budget.exhausted = true;
      ctx.emit("step", { key: "budget", label: "Qloo call budget reached", status: "error", detail: "Remaining Qloo lookups in this run were skipped." });
    }
    return { env: errorEnvelope(op, "RUN_BUDGET", "This run reached its Qloo call budget.") };
  }
  ctx.budget.remaining -= 1;
  const env = await ctx.gw.call(op, input, { signal: ctx.signal, runId: ctx.runId });
  const entry = ctx.ledger.record(op, input, env, ctx.transportOf(op, input));
  ctx.emit("ledger", { id: entry.id, op, status: env.status, transport: entry.transport, requests: entry.requests });
  if (env.status === "error") {
    const code = env.error?.code ?? "QLOO_ERROR";
    ctx.failures.push(code);
    ctx.emit("step", { key: `failed:${entry.id}`, label: `Qloo request ${entry.id} failed`, status: "error", detail: `${code}. The parts that depend on it are left out, not guessed.` });
  }
  return { env, entry };
}

/** Runs `fn` over items with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
