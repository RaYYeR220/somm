import type { Envelope, QlooOp } from "@/lib/types";

export type CallContext = { signal?: AbortSignal; runId?: string };

export interface QlooGateway {
  call(op: QlooOp, input: Record<string, unknown>, ctx?: CallContext): Promise<Envelope>;
}

export function errorEnvelope(operation: string, code: string, summary: string, retryable = false): Envelope {
  return {
    operation,
    status: "error",
    summary,
    results: [],
    error: { code, retryable, recovery: summary },
  };
}

const HTTP_OPS: ReadonlySet<QlooOp> = new Set(["search", "insights_raw"]);

/** The harness MCP server owns the nine workflows; direct HTTP covers the rest. */
export function createRoutingGateway(mcp: QlooGateway, http: QlooGateway): QlooGateway {
  return {
    call: (op, input, ctx) => (HTTP_OPS.has(op) ? http : mcp).call(op, input, ctx),
  };
}
