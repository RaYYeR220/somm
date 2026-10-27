import type { Envelope } from "@/lib/types";
import { errorEnvelope, type QlooGateway } from "./gateway";

type HttpGatewayOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const PATHS = { search: "/search", insights_raw: "/v2/insights" } as const;

function toQuery(input: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params;
}

function statusError(op: string, status: number): Envelope {
  if (status === 401) return errorEnvelope(op, "QLOO_AUTH", "Qloo rejected the API key.");
  if (status === 403) return errorEnvelope(op, "QLOO_FORBIDDEN", "This Qloo entity type or endpoint is not available to this key.");
  if (status === 429) return errorEnvelope(op, "QLOO_RATE_LIMIT", "Qloo rate limit reached; retry shortly.", true);
  return errorEnvelope(op, "QLOO_UPSTREAM", `Qloo returned HTTP ${status}.`, status >= 500);
}

function resultItems(body: unknown): unknown[] {
  const results = (body as { results?: unknown })?.results;
  if (Array.isArray(results)) return results;
  if (results && typeof results === "object") {
    for (const key of ["entities", "tags", "heatmap", "demographics", "audiences"]) {
      const list = (results as Record<string, unknown>)[key];
      if (Array.isArray(list)) return list;
    }
  }
  return [];
}

/** Direct calls for the documented endpoints the harness workflows don't expose. */
export function createHttpGateway(options: HttpGatewayOptions): QlooGateway {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  return {
    async call(op, input, ctx) {
      if (op !== "search" && op !== "insights_raw") {
        return errorEnvelope(op, "QLOO_UNSUPPORTED", `${op} is served by the harness workflows.`);
      }
      const path = PATHS[op];
      const url = `${base}${path}?${toQuery(input)}`;
      const signal = AbortSignal.any([
        AbortSignal.timeout(options.timeoutMs ?? 20_000),
        ...(ctx?.signal ? [ctx.signal] : []),
      ]);
      let response: Response;
      try {
        response = await doFetch(url, { headers: { "X-Api-Key": options.apiKey, accept: "application/json" }, signal });
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        return errorEnvelope(op, timedOut ? "QLOO_TIMEOUT" : "QLOO_NETWORK_ERROR", "Could not reach Qloo.", true);
      }
      if (!response.ok) return statusError(op, response.status);
      const body = (await response.json()) as unknown;
      const items = resultItems(body);
      return {
        operation: op,
        status: items.length > 0 ? "ok" : "empty",
        results: (body as { results?: unknown }).results ?? [],
        result_count: items.length,
        provenance: {
          endpoint: path,
          requests: [{ method: "GET", path, query: input }],
        },
      };
    },
  };
}
