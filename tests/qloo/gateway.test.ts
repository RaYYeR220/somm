import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { canonicalJson, inputKey } from "@/server/qloo/canonical";
import { createFixtureGateway } from "@/server/qloo/fixture-gateway";
import { createHttpGateway } from "@/server/qloo/http-gateway";
import { createMcpGateway } from "@/server/qloo/mcp-gateway";
import { createRoutingGateway } from "@/server/qloo/gateway";
import type { Envelope, QlooOp } from "@/lib/types";

const okEnvelope = (operation: string): Envelope => ({ operation, status: "ok", results: [] });

function fakeFetch(status: number, body: unknown, seen: Request[] = []) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("canonicalJson", () => {
  it("orders keys so equal inputs share a key", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
    expect(inputKey("rank", { a: 1, b: 2 })).toBe(inputKey("rank", { b: 2, a: 1 }));
    expect(inputKey("rank", { a: 1 })).not.toBe(inputKey("recommend", { a: 1 }));
  });
});

describe("fixture gateway", () => {
  const dir = mkdtempSync(join(tmpdir(), "somm-fx-"));
  const input = { target_type: "brand", signals: ["x"] };
  mkdirSync(join(dir, "recommend"), { recursive: true });
  writeFileSync(join(dir, "recommend", `${inputKey("recommend", input)}.json`), JSON.stringify(okEnvelope("recommend")));

  it("is keyed by canonical input", async () => {
    const gw = createFixtureGateway(dir);
    const env = await gw.call("recommend", { signals: ["x"], target_type: "brand" });
    expect(env.status).toBe("ok");
  });

  it("reports a missing fixture as an error envelope", async () => {
    const gw = createFixtureGateway(dir);
    const env = await gw.call("recommend", { target_type: "movie" });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("FIXTURE_MISSING");
  });
});

describe("http gateway", () => {
  it("maps 401 to QLOO_AUTH", async () => {
    const gw = createHttpGateway({ baseUrl: "https://hackathon.api.qloo.com", apiKey: "k", fetch: fakeFetch(401, { error: "no" }) });
    const env = await gw.call("search", { query: "Coachella" });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("QLOO_AUTH");
    expect(env.error?.retryable).toBe(false);
  });

  it("maps 429 to a retryable QLOO_RATE_LIMIT", async () => {
    const gw = createHttpGateway({ baseUrl: "https://hackathon.api.qloo.com", apiKey: "k", fetch: fakeFetch(429, {}) });
    const env = await gw.call("insights_raw", { "filter.type": "urn:entity:brand" });
    expect(env.error?.code).toBe("QLOO_RATE_LIMIT");
    expect(env.error?.retryable).toBe(true);
  });

  it("sends X-Api-Key and records provenance", async () => {
    const seen: Request[] = [];
    const gw = createHttpGateway({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "secret-key",
      fetch: fakeFetch(200, { results: [{ entity_id: "e1", name: "Coachella" }] }, seen),
    });
    const env = await gw.call("search", { query: "Coachella", types: "urn:entity:place", take: 3 });
    expect(env.status).toBe("ok");
    expect(seen[0].headers.get("x-api-key")).toBe("secret-key");
    const url = new URL(seen[0].url);
    expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/search");
    expect(url.searchParams.get("query")).toBe("Coachella");
    expect(env.provenance?.requests?.[0]).toMatchObject({ method: "GET", path: "/search" });
    expect(JSON.stringify(env)).not.toContain("secret-key");
  });

  it("returns empty when insights has no entities", async () => {
    const gw = createHttpGateway({ baseUrl: "https://hackathon.api.qloo.com", apiKey: "k", fetch: fakeFetch(200, { results: { entities: [] } }) });
    const env = await gw.call("insights_raw", { "filter.type": "urn:entity:brand" });
    expect(env.status).toBe("empty");
  });
});

describe("routing gateway", () => {
  it("sends search and raw insights to http and workflows to mcp", async () => {
    const calls: string[] = [];
    const stub = (name: string) => ({
      call: async (op: QlooOp) => {
        calls.push(`${name}:${op}`);
        return okEnvelope(op);
      },
    });
    const gw = createRoutingGateway(stub("mcp"), stub("http"));
    await gw.call("search", {});
    await gw.call("insights_raw", {});
    await gw.call("recommend", {});
    expect(calls).toEqual(["http:search", "http:insights_raw", "mcp:recommend"]);
  });
});

describe("mcp gateway (official harness, no key)", () => {
  const env = { ...process.env, QLOO_API_KEY: "", QLOO_HOME: mkdtempSync(join(tmpdir(), "somm-qh-")) };
  delete (env as Record<string, string | undefined>).QLOO_API_KEY;
  const gw = createMcpGateway({ env });
  afterAll(() => gw.close());

  it("reports capabilities without contacting Qloo", async () => {
    const caps = (await gw.capabilities()) as { status?: string; adapter?: { id?: string } };
    expect(caps.adapter?.id).toMatch(/^qloo_harness/);
  });

  it("surfaces a missing credential as an error envelope, not a throw", async () => {
    const result = await gw.call("recommend", { target_type: "brand", signals: ["Coachella"] });
    expect(result.status).toBe("error");
    expect(result.error?.code).toMatch(/QLOO_/);
  });
});
