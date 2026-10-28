import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { openDb } from "@/server/db";
import { createRunStore } from "@/server/agent/run-store";
import type { AgentDeps } from "@/server/agent/deps";
import { createApi } from "@/server/api/handlers";
import { handleMcp } from "@/server/mcp/server";
import { scriptedGateway } from "../helpers";
import { fakeLlm, fakeQloo } from "../agent/fakes";

function setup() {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "somm-api-")), "a.sqlite"));
  const deps: AgentDeps = { db, gw: scriptedGateway(fakeQloo).gw, llm: fakeLlm().llm, store: createRunStore(db), budget: 200 };
  return { deps, api: createApi(deps, { publicUrl: "https://somm.test" }) };
}

const post = (path: string, body: unknown, ws = WS1) =>
  new Request(`https://somm.test${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: `somm_ws=${ws}` }, body: JSON.stringify(body) });
const get = (path: string, ws = WS1) => new Request(`https://somm.test${path}`, { headers: { cookie: `somm_ws=${ws}` } });

const WS1 = "a".repeat(32);
const WSA = "b".repeat(32);
const WSB = "c".repeat(32);

const scoutBody = { property: { kind: "podcast", name: "Founders Weekly", market: "United States", entities: [{ name: "Founders Weekly", type: "podcast" }] } };

async function readSse(response: Response): Promise<{ kind: string; payload: unknown }[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.includes("data:"))
    .map((block) => {
      const kind = block.match(/^event: (.*)$/m)?.[1] ?? "message";
      return { kind, payload: JSON.parse(block.match(/^data: (.*)$/m)![1]) };
    });
}

describe("api", () => {
  it("starts a scout run and replays its events as a stream that ends on done", async () => {
    const { api, deps } = setup();
    const res = await api.postScout(post("/api/scout", scoutBody));
    expect(res.status).toBe(202);
    const { runId } = await res.json();
    await deps.store.get(runId);
    const events = await readSse(await api.streamEvents(runId, get(`/api/runs/${runId}/events`)));
    expect(events.at(-1)?.kind).toBe("done");
    expect(events.some((e) => e.kind === "ledger")).toBe(true);
    const run = await (await api.getRun(runId)).json();
    expect(run.status).toBe("done");
    expect(run.result.fits.length).toBeGreaterThan(0);
  });

  it("rejects an invalid scout body with 400", async () => {
    const { api } = setup();
    const res = await api.postScout(post("/api/scout", { property: { kind: "spaceship" } }));
    expect(res.status).toBe(400);
  });

  it("publishes a media kit, takes an intro request, and guards the owner inbox", async () => {
    const { api } = setup();
    const { runId } = await (await api.postScout(post("/api/scout", scoutBody))).json();
    const events = await readSse(await api.streamEvents(runId, get(`/api/runs/${runId}/events`)));
    expect(events.at(-1)?.kind).toBe("done");
    const kitRes = await api.createKit(post("/api/kits", { runId, title: "Founders Weekly partners" }));
    expect(kitRes.status).toBe(201);
    const { slug, ownerUrl } = await kitRes.json();
    const token = new URL(ownerUrl).searchParams.get("k")!;
    const kit = await (await api.getKit(slug)).json();
    expect(kit.property.name).toBe("Founders Weekly");
    expect(JSON.stringify(kit)).not.toContain(token);
    expect((await api.postIntro(slug, post(`/api/kits/${slug}/intro`, { brandName: "Zap Cola", contact: "partners@zap.example", note: "Q1 flight?" }))).status).toBe(201);
    expect((await api.getDeals(slug, get(`/api/kits/${slug}/deals?k=wrong`))).status).toBe(403);
    const deals = await (await api.getDeals(slug, get(`/api/kits/${slug}/deals?k=${token}`))).json();
    expect(deals.deals[0]).toMatchObject({ brandName: "Zap Cola", status: "new" });
  });

  it("only lets the creating workspace publish a kit from its run", async () => {
    const { api } = setup();
    const { runId } = await (await api.postScout(post("/api/scout", scoutBody, WSA))).json();
    await readSse(await api.streamEvents(runId, get(`/api/runs/${runId}/events`, WSA)));
    expect((await api.createKit(post("/api/kits", { runId, title: "x" }, WSB))).status).toBe(403);
  });

  it("reports health without exposing keys", async () => {
    const { api } = setup();
    const body = await (await api.health()).json();
    expect(body).toMatchObject({ ok: true, llm: { ready: true } });
  });
});

describe("public MCP endpoint", () => {
  it("lists the four tools and returns a fit score with receipts", async () => {
    const { deps } = setup();
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => handleMcp(new Request(input, init), deps, { publicUrl: "https://somm.test" });
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://somm.test/mcp"), { fetch: fetchImpl as typeof fetch }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["evaluate_offer", "fan_fingerprint", "fit_score", "prospect_sponsors"]);
    const result = (await client.callTool({
      name: "fit_score",
      arguments: { property_name: "Night Shift", kind: "podcast", entities: [{ name: "Night Shift", type: "podcast" }], brand: "Zap Cola", category: "energy_drink" },
    })) as { structuredContent?: { verdict?: string; receipts?: unknown[]; report_url?: string } };
    expect(result.structuredContent?.verdict).toBeDefined();
    expect(result.structuredContent?.receipts?.length).toBeGreaterThan(0);
    expect(result.structuredContent?.report_url).toMatch(/^https:\/\/somm\.test\/report\//);
    await client.close();
  });
});

describe("answering a paused run", () => {
  it("accepts every answer in one request", async () => {
    const { api, deps } = setup();
    const res = await api.postScout(post("/api/scout", { property: { kind: "artist", name: "Phoenix", market: "United States", entities: [{ name: "Phoenix", type: "artist" }] } }));
    const { runId } = (await res.json()) as { runId: string };
    for (let i = 0; i < 50 && deps.store.get(runId)!.status !== "paused"; i++) await new Promise((r) => setTimeout(r, 20));
    expect(deps.store.get(runId)!.status).toBe("paused");
    const resumed = await api.resume(runId, post(`/api/runs/${runId}/resume`, { answers: [{ input: "Phoenix", entityId: "art-phoenix" }] }));
    expect(resumed.status).toBe(202);
  });
});
