import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import type { LedgerEntry } from "@/lib/types";
import type { AgentDeps } from "@/server/agent/deps";
import { startDiligence } from "@/server/agent/diligence";
import { newId, type RunRecord } from "@/server/agent/run-store";
import { resumeScout, startScout, type ScoutResult } from "@/server/agent/scout";
import { mapLimit } from "@/server/engine/context";
import { ANALYST_SYSTEM } from "@/server/llm/prompts";
import { createLedger } from "@/server/qloo/ledger";
import { clientKey, createRateLimiter } from "./rate-limit";

export const WORKSPACE_COOKIE = "somm_ws";

type ApiOptions = { publicUrl: string; runsPerHour?: number; chatPerHour?: number };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const problem = (status: number, message: string) => json({ error: message }, status);

/** Workspace ids are 32 hex chars issued by the proxy; anything else gets a one-off workspace. */
export function workspaceOf(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${WORKSPACE_COOKIE}=([a-f0-9]{32})(?:;|$)`));
  // No valid cookie: a one-off workspace that can never match someone else's runs.
  return match?.[1] ?? `anon_${randomBytes(9).toString("base64url")}`;
}

async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await request.json().catch(() => {
    throw new ZodError([{ code: "custom", message: "Body must be JSON.", path: [], input: undefined }]);
  });
  return schema.parse(raw);
}

function guard(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    if (error instanceof ZodError) return problem(400, error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    const message = error instanceof Error ? error.message : String(error);
    return problem(422, message);
  });
}

/** What a viewer may see of a run: never the workspace id of someone else. */
function publicRun(run: RunRecord, viewer: string) {
  return { id: run.id, kind: run.kind, status: run.status, demo: run.demo, mine: run.workspace === viewer, createdAt: run.createdAt, updatedAt: run.updatedAt, input: run.input, result: run.result };
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "kit";

const KitInput = z.object({ runId: z.string().min(1), title: z.string().min(1).max(120) });
const IntroInput = z.object({ brandName: z.string().min(1).max(120), contact: z.string().min(3).max(200), note: z.string().max(1000).default("") });
const DealPatch = z.object({ id: z.string().min(1), status: z.enum(["new", "talking", "won", "lost"]) });
const ResumeInput = z.object({ input: z.string().min(1), entityId: z.string().min(1) });
const ChatInput = z.object({ runId: z.string().min(1), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(20) });

export function createApi(deps: AgentDeps, options: ApiOptions) {
  const runLimiter = createRateLimiter(options.runsPerHour ?? 30);
  const chatLimiter = createRateLimiter(options.chatPerHour ?? 120);
  const db = deps.db;

  const limited = (request: Request, limiter: ReturnType<typeof createRateLimiter>) =>
    limiter.take(clientKey(request)) ? null : problem(429, "Too many requests from this address; try again in a few minutes.");

  const kitRow = (slug: string) =>
    db.prepare("SELECT slug, run_id, owner_token, title, published, created_at FROM kits WHERE slug = ?").get(slug) as
      | { slug: string; run_id: string; owner_token: string; title: string; published: number; created_at: string }
      | undefined;

  return {
    workspaceOf,

    postScout: (request: Request) =>
      guard(async () => {
        const blocked = limited(request, runLimiter);
        if (blocked) return blocked;
        const input = await body(request, z.object({ description: z.string().optional(), property: z.unknown().optional(), categories: z.array(z.string()).optional() }));
        const { runId } = await startScout({ ...(input as object), workspace: workspaceOf(request) } as Parameters<typeof startScout>[0], deps);
        return json({ runId }, 202);
      }),

    postDiligence: (request: Request) =>
      guard(async () => {
        const blocked = limited(request, runLimiter);
        if (blocked) return blocked;
        const input = (await body(request, z.record(z.string(), z.unknown()))) as object;
        const { runId } = await startDiligence({ ...input, workspace: workspaceOf(request) } as Parameters<typeof startDiligence>[0], deps);
        return json({ runId }, 202);
      }),

    resume: (runId: string, request: Request) =>
      guard(async () => {
        const run = deps.store.get(runId);
        if (!run) return problem(404, "No such run.");
        if (run.workspace !== workspaceOf(request)) return problem(403, "Only the workspace that started this run can answer it.");
        const choice = await body(request, ResumeInput);
        await resumeScout(runId, choice, deps);
        return json({ runId }, 202);
      }),

    getRun: (runId: string, request?: Request) =>
      guard(async () => {
        const run = deps.store.get(runId);
        if (!run) return problem(404, "No such run.");
        return json(publicRun(run, request ? workspaceOf(request) : ""));
      }),

    listRuns: (request: Request) =>
      guard(async () => {
        const mine = deps.store.list(workspaceOf(request)).map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt, title: titleOf(r) }));
        const demos = deps.store.listDemo().map((r) => ({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt, title: titleOf(r) }));
        return json({ mine, demos });
      }),

    streamEvents: (runId: string, request: Request) =>
      guard(async () => {
        if (!deps.store.get(runId)) return problem(404, "No such run.");
        const from = Number(new URL(request.url).searchParams.get("from") ?? request.headers.get("last-event-id") ?? 0) || 0;
        const encoder = new TextEncoder();
        let unsubscribe = () => {};
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const close = () => {
              unsubscribe();
              if (heartbeat) clearInterval(heartbeat);
              try {
                controller.close();
              } catch {
                // already closed
              }
            };
            unsubscribe = deps.store.subscribe(runId, from, (event) => {
              controller.enqueue(encoder.encode(`id: ${event.seq}\nevent: ${event.kind}\ndata: ${JSON.stringify(event.payload)}\n\n`));
              if (event.kind === "done") queueMicrotask(close);
            });
            heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 15_000);
            request.signal?.addEventListener("abort", close);
          },
          cancel() {
            unsubscribe();
            if (heartbeat) clearInterval(heartbeat);
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
      }),

    getLedgerEntry: (runId: string, id: string) =>
      guard(async () => {
        const entry = createLedger(db, runId).get(id);
        return entry ? json(entry) : problem(404, "No such receipt.");
      }),

    search: (request: Request) =>
      guard(async () => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
        const type = url.searchParams.get("type") ?? "";
        if (q.length < 2) return json({ results: [] });
        const env = await deps.gw.call("search", { query: q, ...(type ? { types: `urn:entity:${type}` } : {}), take: 8 });
        const list = Array.isArray(env.results) ? env.results : [];
        const results = list.flatMap((item) => {
          const r = item as Record<string, unknown>;
          const id = r.entity_id ?? r.id;
          if (typeof id !== "string" || typeof r.name !== "string") return [];
          const types = (Array.isArray(r.types) ? r.types : [r.type]).filter((t): t is string => typeof t === "string");
          return [{ id, name: r.name, type: (types[0] ?? "").replace("urn:entity:", ""), popularity: typeof r.popularity === "number" ? r.popularity : null }];
        });
        return json({ results, status: env.status });
      }),

    createKit: (request: Request) =>
      guard(async () => {
        const { runId, title } = await body(request, KitInput);
        const run = deps.store.get(runId);
        if (!run || run.kind !== "scout") return problem(404, "No such scout run.");
        if (run.workspace !== workspaceOf(request)) return problem(403, "Only the workspace that ran this report can publish it.");
        if (run.status !== "done" && run.status !== "degraded") return problem(409, "The report is not finished yet.");
        const slug = `${slugify((run.result as ScoutResult).property.name)}-${randomBytes(3).toString("hex")}`;
        const token = randomBytes(18).toString("base64url");
        db.prepare("INSERT INTO kits (slug, run_id, owner_token, title, created_at) VALUES (?, ?, ?, ?, ?)").run(slug, runId, token, title, new Date().toISOString());
        return json({ slug, url: `${options.publicUrl}/kit/${slug}`, ownerUrl: `${options.publicUrl}/kit/${slug}/owner?k=${token}` }, 201);
      }),

    getKit: (slug: string) =>
      guard(async () => {
        const kit = kitRow(slug);
        if (!kit || !kit.published) return problem(404, "No such media kit.");
        const run = deps.store.get(kit.run_id);
        const result = run?.result as ScoutResult | undefined;
        if (!result) return problem(404, "This kit's report is gone.");
        return json(kitView(kit, result));
      }),

    postIntro: (slug: string, request: Request) =>
      guard(async () => {
        const blocked = limited(request, runLimiter);
        if (blocked) return blocked;
        if (!kitRow(slug)) return problem(404, "No such media kit.");
        const intro = await body(request, IntroInput);
        const id = newId("deal");
        const at = new Date().toISOString();
        db.prepare("INSERT INTO deals (id, kit_slug, brand_name, contact, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)").run(id, slug, intro.brandName, intro.contact, intro.note, at, at);
        return json({ id }, 201);
      }),

    getDeals: (slug: string, request: Request) =>
      guard(async () => {
        const kit = kitRow(slug);
        if (!kit) return problem(404, "No such media kit.");
        if (new URL(request.url).searchParams.get("k") !== kit.owner_token) return problem(403, "This owner link is not valid.");
        const deals = (db.prepare("SELECT * FROM deals WHERE kit_slug = ? ORDER BY created_at DESC").all(slug) as Record<string, string>[]).map((d) => ({
          id: d.id, brandName: d.brand_name, contact: d.contact, note: d.note, status: d.status, createdAt: d.created_at, updatedAt: d.updated_at,
        }));
        return json({ kit: { slug, title: kit.title, runId: kit.run_id }, deals });
      }),

    patchDeal: (slug: string, request: Request) =>
      guard(async () => {
        const kit = kitRow(slug);
        if (!kit) return problem(404, "No such media kit.");
        if (new URL(request.url).searchParams.get("k") !== kit.owner_token) return problem(403, "This owner link is not valid.");
        const patch = await body(request, DealPatch);
        const res = db.prepare("UPDATE deals SET status = ?, updated_at = ? WHERE id = ? AND kit_slug = ?").run(patch.status, new Date().toISOString(), patch.id, slug);
        return res.changes ? json({ ok: true }) : problem(404, "No such deal.");
      }),

    chat: (request: Request) =>
      guard(async () => {
        const blocked = limited(request, chatLimiter);
        if (blocked) return blocked;
        if (!deps.llm.ready) return problem(503, "The analyst is offline: no language model is configured.");
        const { runId, messages } = await body(request, ChatInput);
        const run = deps.store.get(runId);
        if (!run?.result) return problem(404, "No finished report to discuss.");
        return json(await analyst(deps, run, messages));
      }),

    health: () =>
      guard(async () =>
        json({ ok: true, qloo: { configured: Boolean(process.env.QLOO_API_KEY) }, llm: { ready: deps.llm.ready } }),
      ),
  };
}

function titleOf(run: RunRecord): string {
  const result = run.result as { property?: { name?: string }; brand?: { name?: string } } | null;
  if (run.kind === "scout") return result?.property?.name ?? (run.input as { input?: { property?: { name?: string } } })?.input?.property?.name ?? "Scout report";
  return `${result?.brand?.name ?? "Brand"} · offer review`;
}

function kitView(kit: { slug: string; title: string; created_at: string; run_id: string }, result: ScoutResult) {
  const facts = new Map(result.facts.map((f) => [f.id, f]));
  const usedFacts = new Set<string>();
  const fits = result.fits
    .filter((f) => f.verdict === "PURSUE" || f.verdict === "CONSIDER")
    .slice(0, 8)
    .map((f) => {
      Object.values(f.components).forEach((c) => c.facts.forEach((id) => usedFacts.add(id)));
      return { brand: f.brand, category: f.category, score: f.score, verdict: f.verdict, components: f.components };
    });
  result.fingerprint.facts.forEach((f) => usedFacts.add(f.id));
  const ledgerIds = new Set([...usedFacts].flatMap((id) => facts.get(id)?.ledgerIds ?? []));
  const receipts: Pick<LedgerEntry, "id" | "op" | "requests" | "status" | "at" | "transport">[] = result.ledger
    .filter((e) => ledgerIds.has(e.id))
    .map(({ id, op, requests, status, at, transport }) => ({ id, op, requests, status, at, transport }));
  return {
    slug: kit.slug,
    title: kit.title,
    runId: kit.run_id,
    publishedAt: kit.created_at,
    property: result.property,
    fingerprint: { ...result.fingerprint, facts: undefined },
    fits,
    facts: [...usedFacts].map((id) => facts.get(id)).filter(Boolean),
    receipts,
    pitches: result.pitches.map((p) => ({ brand: p.brand, verdict: p.verdict, markdown: p.check.keptMarkdown })),
  };
}

async function analyst(deps: AgentDeps, run: RunRecord, messages: { role: "user" | "assistant"; content: string }[]) {
  const result = run.result as ScoutResult & { offers?: unknown };
  const facts = result.facts ?? [];
  const toolCalls: { name: string; args: unknown }[] = [];
  const summary = JSON.stringify({
    property: (result as ScoutResult).property?.name,
    fits: ((result as ScoutResult).fits ?? []).slice(0, 15).map((f) => ({ brand: f.brand.name, category: f.category, score: f.score, verdict: f.verdict, reasons: f.reasons })),
  }).slice(0, 6000);
  const answer = await deps.llm.tools(
    [
      { role: "system", content: `${ANALYST_SYSTEM}\nReport summary: ${summary}` },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ],
    [
      { name: "get_fact", description: "Look up one fact from this report by id (F1, F2, ...).", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
      { name: "search_facts", description: "Find facts in this report whose label mentions a word.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    ],
    async (name, args) => {
      toolCalls.push({ name, args });
      if (name === "get_fact") return facts.find((f) => f.id === args.id) ?? { error: "no such fact" };
      if (name === "search_facts") {
        const needle = String(args.text ?? "").toLowerCase();
        return facts.filter((f) => f.label.toLowerCase().includes(needle)).slice(0, 12);
      }
      return { error: "unknown tool" };
    },
  );
  void mapLimit;
  return { answer, toolCalls };
}
