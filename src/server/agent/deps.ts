import type { LedgerEntry, QlooOp } from "@/lib/types";
import { getDb, type Db } from "@/server/db";
import { getLlm, type Llm } from "@/server/llm/client";
import { createCachedGateway } from "@/server/qloo/cached-gateway";
import { createRoutingGateway, type QlooGateway } from "@/server/qloo/gateway";
import { createHttpGateway } from "@/server/qloo/http-gateway";
import { createMcpGateway, type McpGateway } from "@/server/qloo/mcp-gateway";
import { createRunStore, type RunStore } from "./run-store";

export type AgentDeps = {
  db: Db;
  gw: QlooGateway;
  llm: Llm;
  store: RunStore;
  /** Maximum Qloo calls one run may make. */
  budget: number;
  transportOf?: (op: QlooOp, input: Record<string, unknown>) => LedgerEntry["transport"];
};

export const QLOO_BASE_URL = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

type Shared = AgentDeps & { mcp: McpGateway };
const globalKey = Symbol.for("somm.agent.deps");

/** Process-wide dependencies: one harness child, one database, one cache. */
export function getAgentDeps(): Shared {
  const holder = globalThis as unknown as Record<symbol, Shared | undefined>;
  if (holder[globalKey]) return holder[globalKey]!;
  const db = getDb();
  const apiKey = process.env.QLOO_API_KEY ?? "";
  const qlooHome = process.env.QLOO_HOME ?? `${process.env.DATA_DIR ?? "./data"}/qloo-home`;
  const mcp = createMcpGateway({
    env: { ...process.env, QLOO_API_KEY: apiKey, QLOO_BASE_URL, QLOO_TRUSTED_BASE_URL: QLOO_BASE_URL, QLOO_HOME: qlooHome },
  });
  const http = createHttpGateway({ baseUrl: QLOO_BASE_URL, apiKey });
  const cached = createCachedGateway(createRoutingGateway(mcp, http), db, { ttlDays: 30 });
  const httpOps = new Set<QlooOp>(["search", "insights_raw", "tags_raw"]);
  const deps: Shared = {
    db,
    gw: cached,
    llm: getLlm(),
    store: createRunStore(db),
    budget: Number(process.env.QLOO_RUN_BUDGET ?? 140),
    mcp,
    transportOf: (op, input) => (cached.lastTransport(op, input) === "cache" ? "cache" : httpOps.has(op) ? "http" : "mcp"),
  };
  holder[globalKey] = deps;
  return deps;
}
