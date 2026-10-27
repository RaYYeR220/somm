import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { ENTITY_TYPES, PROPERTY_KINDS, type Fact, type FitResult, type LedgerEntry } from "@/lib/types";
import type { AgentDeps } from "@/server/agent/deps";
import { startDiligence, type DiligenceResult } from "@/server/agent/diligence";
import { startScout, type ScoutResult } from "@/server/agent/scout";
import { CATEGORIES } from "@/server/engine/categories";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const entities = z.array(z.object({ name: z.string().min(1), type: z.enum(ENTITY_TYPES) })).min(1).max(10).describe("Named entities that represent the audience: the show, hosts, headline artists, star players.");

type Options = { publicUrl: string };

function receipts(ledger: LedgerEntry[], factIds: string[], facts: Fact[]) {
  const ids = new Set(factIds.flatMap((id) => facts.find((f) => f.id === id)?.ledgerIds ?? []));
  return ledger.filter((e) => ids.has(e.id)).map((e) => ({ id: e.id, op: e.op, status: e.status, requests: e.requests, at: e.at }));
}

function fitView(fit: FitResult, facts: Fact[]) {
  const ids = Object.values(fit.components).flatMap((c) => c.facts);
  return {
    brand: fit.brand.name,
    category: fit.category,
    score: fit.score,
    verdict: fit.verdict,
    reasons: fit.reasons,
    evidence: ids.map((id) => facts.find((f) => f.id === id)).filter(Boolean).map((f) => ({ id: f!.id, claim: f!.label, value: f!.display })),
  };
}

const result = (data: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data });

function buildServer(deps: AgentDeps, options: Options): McpServer {
  const server = new McpServer({ name: "somm", version: "1.0.0" });
  const reportUrl = (runId: string) => `${options.publicUrl}/report/${runId}`;

  server.registerTool(
    "fan_fingerprint",
    {
      description: "Cross-domain taste profile of a property's fans from Qloo: taste tags, age/gender affinity, where fans concentrate, momentum, and what else they love.",
      inputSchema: { property_name: z.string().min(1), kind: z.enum(PROPERTY_KINDS), entities, market: z.string().default("United States") },
    },
    async (args) => {
      const { runId, done } = await startScout({ workspace: "mcp", mode: "fingerprint", property: { kind: args.kind, name: args.property_name, market: args.market, entities: args.entities } }, deps);
      await done;
      const run = deps.store.get(runId)!;
      const r = run.result as ScoutResult | null;
      if (!r) return result({ status: run.status, report_url: reportUrl(runId), note: "No fingerprint; see the report for which step stopped." });
      return result({
        status: run.status,
        report_url: reportUrl(runId),
        property: r.property.name,
        facts: r.fingerprint.facts.map((f) => ({ id: f.id, claim: f.label, value: f.display })),
        also_loved: Object.fromEntries(Object.entries(r.fingerprint.crossDomain).map(([d, items]) => [d, (items ?? []).map((i) => i.entity.name)])),
        receipts: receipts(r.ledger, r.fingerprint.facts.map((f) => f.id), r.facts),
      });
    },
  );

  server.registerTool(
    "prospect_sponsors",
    {
      description: "Find and score the brands whose audiences over-index with a property's fans, per sponsor category, with hard exclusivity and age gates applied.",
      inputSchema: {
        property_name: z.string().min(1),
        kind: z.enum(PROPERTY_KINDS),
        entities,
        categories: z.array(z.enum(CATEGORY_IDS)).max(8).optional(),
        exclusives: z.array(z.object({ category: z.enum(CATEGORY_IDS), holder: z.string() })).max(10).default([]),
      },
    },
    async (args) => {
      const { runId, done } = await startScout({ workspace: "mcp", categories: args.categories, property: { kind: args.kind, name: args.property_name, entities: args.entities, exclusives: args.exclusives } }, deps);
      await done;
      const run = deps.store.get(runId)!;
      const r = run.result as ScoutResult | null;
      if (!r) return result({ status: run.status, report_url: reportUrl(runId) });
      const top = r.fits.slice(0, 12);
      return result({
        status: run.status,
        report_url: reportUrl(runId),
        fits: top.map((f) => fitView(f, r.facts)),
        receipts: receipts(r.ledger, top.flatMap((f) => Object.values(f.components).flatMap((c) => c.facts)), r.facts),
      });
    },
  );

  server.registerTool(
    "fit_score",
    {
      description: "Score how well one brand fits one property's audience (0–100) with the verdict PURSUE / CONSIDER / PASS / BLOCKED / INSUFFICIENT_EVIDENCE and the Qloo evidence behind it.",
      inputSchema: {
        property_name: z.string().min(1),
        kind: z.enum(PROPERTY_KINDS),
        entities,
        brand: z.string().min(1),
        category: z.enum(CATEGORY_IDS),
        competitors: z.array(z.string()).max(10).default([]),
        current_sponsors: z.array(z.string()).max(20).default([]),
      },
    },
    async (args) => {
      const { runId, done } = await startDiligence(
        {
          workspace: "mcp",
          brand: { name: args.brand, category: args.category, competitors: args.competitors },
          offers: [{ propertyName: args.property_name, kind: args.kind, entities: args.entities, askUsd: null, deliverables: null, currentSponsors: args.current_sponsors }],
        },
        deps,
      );
      await done;
      return diligenceOut(deps, runId, reportUrl);
    },
  );

  server.registerTool(
    "evaluate_offer",
    {
      description: "Read pasted sponsorship offers for a brand and return a verdict per offer. Offer text is treated as untrusted data; instructions aimed at reviewers are flagged and removed.",
      inputSchema: { brand: z.string().min(1), category: z.enum(CATEGORY_IDS), competitors: z.array(z.string()).max(10).default([]), offer_text: z.string().min(1).max(12_000) },
    },
    async (args) => {
      const { runId, done } = await startDiligence({ workspace: "mcp", brand: { name: args.brand, category: args.category, competitors: args.competitors }, offersText: args.offer_text }, deps);
      await done;
      return diligenceOut(deps, runId, reportUrl);
    },
  );

  return server;
}

function diligenceOut(deps: AgentDeps, runId: string, reportUrl: (id: string) => string) {
  const run = deps.store.get(runId)!;
  const r = run.result as DiligenceResult | null;
  if (!r) return result({ status: run.status, report_url: reportUrl(runId) });
  const offers = r.offers.map((o) => ({
    property: o.offer.propertyName,
    injection_flagged: o.injection.flagged,
    notes: o.notes,
    ...(o.fit ? fitView(o.fit, r.facts) : { verdict: "INSUFFICIENT_EVIDENCE", score: null }),
  }));
  const factIds = r.offers.flatMap((o) => (o.fit ? Object.values(o.fit.components).flatMap((c) => c.facts) : []));
  const first = offers[0] ?? {};
  return result({ status: run.status, report_url: reportUrl(runId), ...(offers.length === 1 ? first : {}), offers, receipts: receipts(r.ledger, factIds, r.facts) });
}

/** Stateless streamable-HTTP MCP endpoint: one server per request, no sessions. */
export async function handleMcp(request: Request, deps: AgentDeps, options: Options): Promise<Response> {
  const server = buildServer(deps, options);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  return response;
}
