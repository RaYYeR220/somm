import type { Envelope, QlooOp } from "@/lib/types";
import { errorEnvelope, type CallContext, type QlooGateway } from "./gateway";

type HttpGatewayOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Waits before each retry of a retryable failure (rate limit, timeout, 5xx). */
  retryDelaysMs?: number[];
};

const PATHS = { search: "/search", insights_raw: "/v2/insights", tags_raw: "/v2/tags" } as const;

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

/** Heatmaps come back with every cell's full metrics; keep what Somm reads so caches stay small. */
function compactResults(results: unknown): unknown {
  const heatmap = (results as { heatmap?: unknown })?.heatmap;
  if (!Array.isArray(heatmap)) return results;
  return {
    heatmap: heatmap.map((cell) => {
      const c = cell as { location?: { latitude?: number; longitude?: number; geohash?: string }; query?: { affinity?: number; affinity_rank?: number } };
      return {
        location: { latitude: c.location?.latitude, longitude: c.location?.longitude, geohash: c.location?.geohash },
        query: { affinity: c.query?.affinity, affinity_rank: c.query?.affinity_rank },
      };
    }),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Direct calls for the documented endpoints the harness workflows don't expose. */
export function createHttpGateway(options: HttpGatewayOptions): QlooGateway {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, "");
  const delays = options.retryDelaysMs ?? [700, 1800];
  return {
    async call(op, input, ctx) {
      let envelope = await once(op, input, ctx);
      for (const delay of delays) {
        if (envelope.status !== "error" || !envelope.error?.retryable) break;
        await sleep(delay);
        envelope = await once(op, input, ctx);
      }
      return envelope;
    },
  };

  async function once(op: QlooOp, input: Record<string, unknown>, ctx?: CallContext): Promise<Envelope> {
    if (!(op in PATHS)) {
      return errorEnvelope(op, "QLOO_UNSUPPORTED", `${op} is served by the harness workflows.`);
    }
    const path = PATHS[op as keyof typeof PATHS];
    const url = `${base}${path}?${toQuery(input)}`;
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 30_000), ...(ctx?.signal ? [ctx.signal] : [])]);
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
      results: compactResults((body as { results?: unknown }).results ?? []),
      result_count: items.length,
      provenance: {
        endpoint: path,
        requests: [{ method: "GET", path, query: input }],
      },
    };
  }
}
