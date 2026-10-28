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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repeats a call that failed with a retryable error (rate limit, timeout, 5xx), waiting before each try. */
export function withRetry(inner: QlooGateway, delaysMs: number[] = [800, 2000, 4500]): QlooGateway {
  return {
    async call(op, input, ctx) {
      let envelope = await inner.call(op, input, ctx);
      for (const delay of delaysMs) {
        if (envelope.status !== "error" || !envelope.error?.retryable || ctx?.signal?.aborted) break;
        await sleep(delay);
        envelope = await inner.call(op, input, ctx);
      }
      return envelope;
    },
  };
}

const HTTP_OPS: ReadonlySet<QlooOp> = new Set(["search", "insights_raw", "tags_raw"]);

/** The harness MCP server owns the nine workflows; direct HTTP covers the rest. */
export function createRoutingGateway(mcp: QlooGateway, http: QlooGateway): QlooGateway {
  return {
    call: (op, input, ctx) => (HTTP_OPS.has(op) ? http : mcp).call(op, input, ctx),
  };
}
