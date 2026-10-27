import { z } from "zod";
import {
  ENTITY_TYPES,
  PROPERTY_KINDS,
  type EntityRef,
  type Fact,
  type FitResult,
  type LedgerEntry,
  type Property,
  type SponsorCategory,
} from "@/lib/types";
import { categoryById } from "@/server/engine/categories";
import { checkClaims, type ClaimCheck } from "@/server/engine/claims";
import { mapLimit } from "@/server/engine/context";
import { buildFingerprint, type Fingerprint } from "@/server/engine/fingerprint";
import { scoreFit, type RankEvidence } from "@/server/engine/fit";
import { applyGates } from "@/server/engine/gates";
import { prospect, type Candidate, type ProspectResult } from "@/server/engine/prospect";
import { activationIdeas, draftProperty, llmOnlySponsors, planCategories, writePitch } from "@/server/llm/prompts";
import type { AgentDeps } from "./deps";
import { resolveEntities, type PendingChoice } from "./resolve";
import { executeRun, type RunControl } from "./runner";

export const ScoutInputSchema = z
  .object({
    workspace: z.string().min(1),
    description: z.string().max(2000).optional(),
    property: z
      .object({
        kind: z.enum(PROPERTY_KINDS),
        name: z.string().min(1).max(120),
        market: z.string().min(1).max(60).default("United States"),
        entities: z.array(z.object({ name: z.string().min(1).max(120), type: z.enum(ENTITY_TYPES), id: z.string().optional() })).min(1).max(40),
        exclusives: z.array(z.object({ category: z.string(), holder: z.string().min(1) })).max(20).default([]),
        agePolicy: z.enum(["all_ages", "18_plus", "21_plus", "unknown"]).default("unknown"),
      })
      .optional(),
    categories: z.array(z.string()).max(8).optional(),
    mode: z.enum(["full", "fingerprint"]).default("full"),
  })
  .refine((v) => v.description || v.property, { message: "Describe the property or list its entities." });
export type ScoutInput = z.input<typeof ScoutInputSchema>;

type ScoutState = { input: z.output<typeof ScoutInputSchema>; choices: Record<string, string>; pending?: PendingChoice[] };

export type Pitch = { brand: EntityRef; category: SponsorCategory; verdict: FitResult["verdict"]; markdown: string; check: ClaimCheck };
export type Idea = { brand: EntityRef; title: string; check: ClaimCheck };

export type ScoutResult = {
  property: Property;
  fingerprint: Fingerprint;
  plan: { categories: SponsorCategory[]; why: string; source: "planner" | "default" };
  fits: FitResult[];
  existingPartners: Candidate[];
  pitches: Pitch[];
  ideas: Idea[];
  baseline: { brands: { name: string; category: string; why: string }[]; error?: string };
  facts: Fact[];
  ledger: LedgerEntry[];
  stats: { qlooCalls: number; cached: number; durationMs: number };
};

const DEFAULT_CATEGORIES: Record<Property["kind"], SponsorCategory[]> = {
  podcast: ["software_b2b", "fintech_bank", "wellness_supplements", "consumer_tech", "coffee", "apparel"],
  creator: ["beauty", "apparel", "consumer_tech", "food_cpg", "streaming_media", "qsr"],
  show: ["streaming_media", "qsr", "food_cpg", "auto", "beauty", "telecom"],
  artist: ["beverage_soft", "energy_drink", "apparel", "footwear", "telecom", "streaming_media"],
  lineup: ["beverage_soft", "energy_drink", "beer", "apparel", "telecom", "fintech_bank"],
  team: ["auto", "telecom", "beer", "sports_betting", "apparel", "fintech_bank"],
};

const SIGNAL_CAP = 10;
const SCORED_PER_CATEGORY = 3;
const PITCH_COUNT = 5;

export async function startScout(raw: ScoutInput, deps: AgentDeps): Promise<{ runId: string; done: Promise<void> }> {
  const input = ScoutInputSchema.parse(raw);
  const state: ScoutState = { input, choices: {} };
  const runId = deps.store.create("scout", input.workspace, state);
  return { runId, done: executeRun(runId, deps, (run) => scoutPipeline(runId, state, deps, run)) };
}

export async function resumeScout(runId: string, choice: { input: string; entityId: string }, deps: AgentDeps) {
  const record = deps.store.get(runId);
  if (!record || record.kind !== "scout") throw new Error("No such scout run.");
  if (record.status !== "paused") throw new Error("This run is not waiting for input.");
  const state = record.input as ScoutState;
  state.choices = { ...state.choices, [choice.input]: choice.entityId };
  deps.store.update(runId, { status: "running", input: state });
  return { runId, done: executeRun(runId, deps, (run) => scoutPipeline(runId, state, deps, run)) };
}

function pitchFacts(fp: Fingerprint, fit: FitResult, all: Fact[]): Fact[] {
  const byId = new Map(all.map((f) => [f.id, f]));
  const own = Object.values(fit.components).flatMap((c) => c.facts).map((id) => byId.get(id)).filter((f): f is Fact => Boolean(f));
  const context = fp.facts.filter((f) => /age|Gender|taste tags|percentile|concentration/i.test(f.label)).slice(0, 5);
  const crossDomain = Object.values(fp.crossDomain).flatMap((items) => (items ?? []).slice(0, 2).flatMap((i) => i.facts)).map((id) => byId.get(id)).filter((f): f is Fact => Boolean(f));
  return [...new Map([...own, ...context, ...crossDomain.slice(0, 6)].map((f) => [f.id, f])).values()];
}

function allowedNames(fp: Fingerprint, brand: EntityRef, category: SponsorCategory): string[] {
  return [
    fp.property.name,
    fp.property.market,
    brand.name,
    categoryById(category)?.label ?? category,
    ...fp.property.entities.map((e) => e.name),
    ...fp.tags.map((t) => t.name),
    ...Object.values(fp.crossDomain).flatMap((items) => (items ?? []).map((i) => i.entity.name)),
  ];
}

export function describeLedger(ledger: LedgerEntry[]) {
  return (id: string) => {
    const entry = ledger.find((e) => e.id === id);
    const path = (entry?.requests[0] as { path?: string } | undefined)?.path ?? entry?.op ?? "Qloo";
    return `Qloo ${path} (${id})`;
  };
}

async function scoutPipeline(runId: string, state: ScoutState, deps: AgentDeps, run: RunControl) {
  const started = Date.now();
  const { ctx } = run;
  const { input } = state;

  // 1. What is this property, in Qloo's terms?
  let draft = input.property;
  if (!draft && input.description) {
    if (!deps.llm.ready) throw new Error("The language model is not configured, so a free-text description can't be read. List the entities instead.");
    const parsed = await run.step({ key: "draft", label: "Reading the property description" }, () => draftProperty(deps.llm, input.description!), (d) => `${d.entities.length} entities`);
    if (!parsed) throw new Error("Could not read the description.");
    draft = { ...parsed, exclusives: [], agePolicy: "unknown" };
  }
  if (!draft) throw new Error("No property given.");
  const resolveStep = { key: "resolve", label: "Finding the property in Qloo's graph" };
  ctx.emit("step", { ...resolveStep, status: "running" });
  let entities = draft.entities;
  if (entities.length > SIGNAL_CAP) {
    ctx.emit("step", { key: "cap", label: "Signal limit", status: "done", detail: `Using the first 10 of ${entities.length} entities (Qloo accepts up to 10 signals).` });
    entities = entities.slice(0, SIGNAL_CAP);
  }
  const resolution = await resolveEntities(entities, ctx, state.choices);
  if (resolution.missing.length) {
    ctx.emit("step", { key: "missing", label: "Not in Qloo", status: "empty", detail: `Skipped, Qloo has no match: ${resolution.missing.join(", ")}` });
  }
  if (resolution.pending.length) {
    for (const pending of resolution.pending) ctx.emit("needs_input", pending);
    deps.store.update(runId, { input: { ...state, pending: resolution.pending } });
    ctx.emit("step", { ...resolveStep, status: "empty", detail: "Waiting for you to pick the right entity." });
    return { status: "paused" as const };
  }
  if (resolution.resolved.length === 0) throw new Error("Qloo has none of these entities, so there is nothing to score.");
  ctx.emit("step", { ...resolveStep, status: "done", detail: resolution.resolved.map((e) => e.name).join(", ") });

  const property: Property = {
    kind: draft.kind,
    name: draft.name,
    market: draft.market ?? "United States",
    exclusives: draft.exclusives ?? [],
    agePolicy: draft.agePolicy ?? "unknown",
    entities: resolution.resolved,
  };

  // 2. Who are the fans?
  const fp = (await run.step({ key: "fingerprint", label: "Building the fan fingerprint" }, () => buildFingerprint(property, ctx)))!;
  if (!fp) throw new Error("Could not build the fan fingerprint.");

  if (input.mode === "fingerprint") {
    const ledger = ctx.ledger.all();
    const result: ScoutResult = {
      property,
      fingerprint: fp,
      plan: { categories: [], why: "", source: "default" },
      fits: [],
      existingPartners: [],
      pitches: [],
      ideas: [],
      baseline: { brands: [] },
      facts: ctx.facts.all(),
      ledger,
      stats: { qlooCalls: ledger.length, cached: ledger.filter((e) => e.transport === "cache").length, durationMs: Date.now() - started },
    };
    return { status: "done" as const, result };
  }

  // 3. Which categories are worth prospecting?
  let plan: ScoutResult["plan"] = { categories: input.categories?.length ? input.categories : DEFAULT_CATEGORIES[property.kind], why: "", source: "default" };
  if (!input.categories?.length && deps.llm.ready) {
    const planned = await run.step({ key: "plan", label: "Choosing sponsor categories" }, () => planCategories(deps.llm, fp), (p) => p.categories.join(", "));
    if (planned) plan = { categories: planned.categories, why: planned.why, source: "planner" };
  } else run.note({ key: "plan", label: "Choosing sponsor categories" }, "done", plan.categories.join(", "));

  // 4. Which brands do these fans already over-index for?
  const prospects = (await run.step({ key: "prospect", label: "Prospecting brands per category" }, () => prospect(property, plan.categories, ctx))) ?? ({ categories: [], existingPartners: [] } as ProspectResult);

  // 5. Score the strongest candidates.
  const toScore = prospects.categories.flatMap((cat) => {
    const affinities = cat.candidates.map((c) => c.affinity);
    const min = Math.min(...affinities);
    const max = Math.max(...affinities);
    return cat.candidates.slice(0, SCORED_PER_CATEGORY).map((candidate, index) => ({
      category: cat.category,
      candidate,
      rank: { value: candidate.affinity, min, max, position: index + 1, of: cat.candidates.length, ledgerId: candidate.ledgerId } satisfies RankEvidence,
    }));
  });
  const scored =
    (await run.step(
      { key: "score", label: `Scoring ${toScore.length} brands` },
      () => mapLimit(toScore, 4, (item) => scoreFit({ fp, brand: item.candidate.entity, category: item.category, rank: item.rank }, ctx)),
      (fits) => `${fits.filter((f) => f.score !== null).length} scored`,
    )) ?? [];

  // 6. Hard gates, in code.
  const fits = (await run.step({ key: "gates", label: "Applying exclusivity and age gates" }, async () => scored.map((fit) => applyGates(fit, { property, fp })), (out) => `${out.filter((f) => f.verdict === "BLOCKED").length} blocked`)) ?? scored;
  fits.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // 7. Evidence-bound pitches and activation ideas.
  const pitches: Pitch[] = [];
  const ideas: Idea[] = [];
  const contenders = fits.filter((f) => f.verdict === "PURSUE" || f.verdict === "CONSIDER").slice(0, PITCH_COUNT);
  if (deps.llm.ready && contenders.length) {
    await run.step({ key: "pitch", label: `Writing ${contenders.length} claim-checked pitches` }, async () => {
      const ledger = ctx.ledger.all();
      await mapLimit(contenders, 3, async (fit) => {
        const facts = pitchFacts(fp, fit, ctx.facts.all());
        const markdown = await writePitch(deps.llm, { property, brand: fit.brand.name, category: categoryById(fit.category)?.label ?? fit.category, verdict: fit.verdict, facts, side: "rights_holder" });
        pitches.push({ brand: fit.brand, category: fit.category, verdict: fit.verdict, markdown, check: checkClaims(markdown, facts, allowedNames(fp, fit.brand, fit.category), { describeLedger: describeLedger(ledger) }) });
      });
      return pitches;
    }, (p) => `${p.reduce((n, x) => n + x.check.struckCount, 0)} unsupported claims struck`);
    await run.step({ key: "activation", label: "Drafting activation ideas" }, async () => {
      await mapLimit(contenders.slice(0, 3), 3, async (fit) => {
        const facts = pitchFacts(fp, fit, ctx.facts.all());
        const out = await activationIdeas(deps.llm, { fp, brand: fit.brand.name, facts });
        for (const idea of out.ideas) ideas.push({ brand: fit.brand, title: idea.title, check: checkClaims(idea.body, facts, allowedNames(fp, fit.brand, fit.category)) });
      });
      return ideas;
    });
  } else if (!deps.llm.ready) run.note({ key: "pitch", label: "Pitches" }, "empty", "Language model not configured; scores and evidence are unaffected.");

  // 8. What a model guesses with no taste data.
  let baseline: ScoutResult["baseline"] = { brands: [] };
  if (deps.llm.ready) {
    const guess = await run.step({ key: "baseline", label: "Asking a model with no Qloo data, for contrast" }, () => llmOnlySponsors(deps.llm, property));
    baseline = guess ? { brands: guess.brands } : { brands: [], error: "baseline unavailable" };
  }

  const ledger = ctx.ledger.all();
  const result: ScoutResult = {
    property,
    fingerprint: fp,
    plan,
    fits,
    existingPartners: prospects.existingPartners,
    pitches,
    ideas,
    baseline,
    facts: ctx.facts.all(),
    ledger,
    stats: { qlooCalls: ledger.length, cached: ledger.filter((e) => e.transport === "cache").length, durationMs: Date.now() - started },
  };
  return { status: "done" as const, result };
}
