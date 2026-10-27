import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Envelope, Property, QlooOp, RunEvent } from "@/lib/types";
import { openDb } from "@/server/db";
import { createEngineContext, type EngineContext } from "@/server/engine/context";
import type { QlooGateway } from "@/server/qloo/gateway";
import { createLedger } from "@/server/qloo/ledger";

export type ScriptedCall = { op: QlooOp; input: Record<string, unknown> };

/** Gateway that answers from a function of (op, input) and records every call. */
export function scriptedGateway(answer: (op: QlooOp, input: Record<string, unknown>) => Envelope) {
  const calls: ScriptedCall[] = [];
  const gw: QlooGateway = {
    async call(op, input) {
      calls.push({ op, input });
      return answer(op, input);
    },
  };
  return { gw, calls };
}

export function testContext(gw: QlooGateway, runId = "run-test", budget = 200): EngineContext & { events: RunEvent[] } {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "somm-ctx-")), "t.sqlite"));
  const events: RunEvent[] = [];
  const ctx = createEngineContext({
    runId,
    gw,
    ledger: createLedger(db, runId),
    budget,
    emit: (kind, payload) => events.push({ runId, seq: events.length + 1, kind, at: new Date().toISOString(), payload }),
  });
  return Object.assign(ctx, { events });
}

export const entityResult = (id: string, name: string, type: string, affinity: number, popularity = 0.5) => ({
  entity_id: id,
  name,
  type: `urn:entity:${type}`,
  affinity,
  popularity,
});

export const okList = (operation: string, results: unknown[]): Envelope => ({
  operation,
  status: "ok",
  results,
  result_count: results.length,
  provenance: { endpoint: "/v2/insights", requests: [{ method: "GET", path: "/v2/insights", query: { operation } }] },
});

export const empty = (operation: string): Envelope => ({ operation, status: "empty", results: [], result_count: 0 });

export const demographicsResult = (age: Record<string, number>, gender: Record<string, number>) => [
  { entity_id: "lead", query: { age, gender } },
];

export const heatmapPoint = (geohash: string, latitude: number, longitude: number, affinity: number) => ({
  location: { latitude, longitude, geohash },
  query: { affinity, affinity_rank: affinity, popularity: 0.5 },
});

export const trendSeries = (name: string, values: number[]) => ({
  entity: { input: name, entityId: name, name },
  points: values.map((v, i) => ({
    date: new Date(Date.UTC(2026, 6, 1 + i * 7)).toISOString().slice(0, 10),
    population_percentile: v,
  })),
});

export const sampleProperty = (overrides: Partial<Property> = {}): Property => ({
  kind: "podcast",
  name: "Founders Weekly",
  market: "United States",
  exclusives: [],
  entities: [
    { id: "pod-1", name: "Founders Weekly", type: "podcast" },
    { id: "per-1", name: "Host One", type: "person" },
  ],
  ...overrides,
});
