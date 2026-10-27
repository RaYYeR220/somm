import { EnvelopeSchema, type Envelope, type QlooOp } from "@/lib/types";
import type { Db } from "@/server/db";
import { canonicalJson, inputKey } from "./canonical";
import type { QlooGateway } from "./gateway";

export type CachedGateway = QlooGateway & {
  /** Whether the most recent answer for this call came from the cache or upstream. */
  lastTransport(op: QlooOp, input: Record<string, unknown>): "cache" | "upstream" | undefined;
};

const CACHEABLE = new Set(["ok", "empty"]);

/** Private server-side cache (allowed by Qloo's hackathon terms) with in-flight dedupe. */
export function createCachedGateway(inner: QlooGateway, db: Db, options: { ttlDays: number }): CachedGateway {
  const inFlight = new Map<string, Promise<Envelope>>();
  const transports = new Map<string, "cache" | "upstream">();
  const read = db.prepare("SELECT envelope_json, at FROM qloo_cache WHERE key = ?");
  const write = db.prepare(
    "INSERT INTO qloo_cache (key, op, input_json, envelope_json, at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT (key) DO UPDATE SET envelope_json = excluded.envelope_json, at = excluded.at",
  );
  const maxAgeMs = options.ttlDays * 86_400_000;

  return {
    async call(op, input, ctx) {
      const key = inputKey(op, input);
      const row = read.get(key) as { envelope_json: string; at: string } | undefined;
      if (row && Date.now() - Date.parse(row.at) < maxAgeMs) {
        transports.set(key, "cache");
        return EnvelopeSchema.parse(JSON.parse(row.envelope_json));
      }
      const pending = inFlight.get(key);
      if (pending) return pending;
      const request = inner
        .call(op, input, ctx)
        .then((envelope) => {
          if (CACHEABLE.has(envelope.status)) {
            write.run(key, op, canonicalJson(input), JSON.stringify(envelope), new Date().toISOString());
          }
          transports.set(key, "upstream");
          return envelope;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    },
    lastTransport(op, input) {
      return transports.get(inputKey(op, input));
    },
  };
}
