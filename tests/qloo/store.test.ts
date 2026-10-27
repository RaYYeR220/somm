import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/server/db";
import { createCachedGateway } from "@/server/qloo/cached-gateway";
import { createLedger } from "@/server/qloo/ledger";
import type { QlooGateway } from "@/server/qloo/gateway";
import type { Envelope, QlooOp } from "@/lib/types";

function countingGateway(envelope: (op: QlooOp) => Envelope, delayMs = 0) {
  const calls: QlooOp[] = [];
  const gw: QlooGateway = {
    async call(op) {
      calls.push(op);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return envelope(op);
    },
  };
  return { gw, calls };
}

const ok = (op: string): Envelope => ({
  operation: op,
  status: "ok",
  results: [{ entity_id: "b1", name: "Liquid Death", affinity: 0.91 }],
  provenance: { endpoint: "/v2/insights", requests: [{ method: "GET", path: "/v2/insights", query: { "filter.type": "urn:entity:brand" } }] },
});

const tempDb = () => openDb(join(mkdtempSync(join(tmpdir(), "somm-db-")), "test.sqlite"));

describe("cached gateway", () => {
  it("returns a stored ok envelope without calling inner", async () => {
    const db = tempDb();
    const { gw, calls } = countingGateway(ok);
    const cached = createCachedGateway(gw, db, { ttlDays: 30 });
    await cached.call("recommend", { target_type: "brand", signals: ["a"] });
    const second = await cached.call("recommend", { signals: ["a"], target_type: "brand" });
    expect(calls).toHaveLength(1);
    expect(second.status).toBe("ok");
    expect(cached.lastTransport("recommend", { target_type: "brand", signals: ["a"] })).toBe("cache");
  });

  it("does not cache errors", async () => {
    const db = tempDb();
    const { gw, calls } = countingGateway((op) => ({ operation: op, status: "error", error: { code: "QLOO_RATE_LIMIT", retryable: true, recovery: "wait" } }));
    const cached = createCachedGateway(gw, db, { ttlDays: 30 });
    await cached.call("rank", { options: ["x"] });
    await cached.call("rank", { options: ["x"] });
    expect(calls).toHaveLength(2);
  });

  it("concurrent identical calls share one upstream call", async () => {
    const db = tempDb();
    const { gw, calls } = countingGateway(ok, 30);
    const cached = createCachedGateway(gw, db, { ttlDays: 30 });
    const results = await Promise.all(Array.from({ length: 5 }, () => cached.call("trends", { entities: ["a"] })));
    expect(calls).toHaveLength(1);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });
});

describe("ledger", () => {
  it("assigns sequential ids per run that survive reopening", () => {
    const dir = mkdtempSync(join(tmpdir(), "somm-ledger-"));
    const file = join(dir, "l.sqlite");
    const first = createLedger(openDb(file), "run-1");
    const e1 = first.record("recommend", { a: 1 }, ok("recommend"), "mcp");
    const e2 = first.record("rank", { b: 2 }, ok("rank"), "cache");
    expect([e1.id, e2.id]).toEqual(["E1", "E2"]);
    const other = createLedger(openDb(file), "run-2");
    expect(other.record("rank", {}, ok("rank"), "mcp").id).toBe("E1");
    const reopened = createLedger(openDb(file), "run-1");
    expect(reopened.record("trends", {}, ok("trends"), "mcp").id).toBe("E3");
    expect(reopened.all().map((e) => e.op)).toEqual(["recommend", "rank", "trends"]);
    expect(reopened.get("E1")?.requests).toEqual(ok("x").provenance?.requests);
  });

  it("hashes the result payload, not the envelope wrapper", () => {
    const ledger = createLedger(tempDb(), "run-h");
    const a = ledger.record("rank", {}, { ...ok("rank"), summary: "one" }, "mcp");
    const b = ledger.record("rank", {}, { ...ok("rank"), summary: "two" }, "mcp");
    expect(a.resultSha).toBe(b.resultSha);
    expect(a.resultSha).toMatch(/^[0-9a-f]{64}$/);
  });
});
