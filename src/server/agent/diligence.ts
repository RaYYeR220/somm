import { z } from "zod";
import type { EntityRef, Fact, FitResult, LedgerEntry, Property, SponsorCategory } from "@/lib/types";
import { categoryById, CATEGORIES } from "@/server/engine/categories";
import { checkClaims, type ClaimCheck } from "@/server/engine/claims";
import { mapLimit, qloo } from "@/server/engine/context";
import { parseEntities } from "@/server/engine/facts";
import { buildFingerprint } from "@/server/engine/fingerprint";
import { scoreFit } from "@/server/engine/fit";
import { applyGates, detectInjection, stripInjection } from "@/server/engine/gates";
import { prospect } from "@/server/engine/prospect";
import { OffersSchema, parseOffers, writePitch } from "@/server/llm/prompts";
import type { AgentDeps } from "./deps";
import { resolveEntities } from "./resolve";
import { executeRun, type RunControl } from "./runner";
import { describeLedger } from "./scout";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const DiligenceInputSchema = z.object({
  workspace: z.string().min(1),
  brand: z.object({
    name: z.string().min(1).max(120),
    category: z.enum(CATEGORY_IDS),
    competitors: z.array(z.string().min(1).max(120)).max(20).default([]),
  }),
  offersText: z.string().max(12_000).default(""),
  offers: OffersSchema.shape.offers.optional(),
});
export type DiligenceInput = z.input<typeof DiligenceInputSchema>;

type Offer = z.output<typeof OffersSchema>["offers"][number];

export type OfferReview = {
  offer: Offer;
  property: Property | null;
  injection: { flagged: boolean; spans: string[] };
  fit: FitResult | null;
  notes: string[];
  memo: { markdown: string; check: ClaimCheck } | null;
};

export type Alternative = { entity: EntityRef; affinity: number; domain: string; fact: string };

export type DiligenceResult = {
  brand: EntityRef;
  category: SponsorCategory;
  competitors: string[];
  offers: OfferReview[];
  alternatives: Alternative[];
  facts: Fact[];
  ledger: LedgerEntry[];
  stats: { qlooCalls: number; cached: number; durationMs: number };
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MAX_OFFERS = 10;

/** True when every word of a company name appears, in order, in the offer text. */
function chunkMentions(text: string, company: string): boolean {
  const words = norm(company).split(" ").filter(Boolean);
  return words.length > 0 && new RegExp(`\\b${words.join("\\s+")}\\b`).test(norm(text));
}

/** Splits pasted offers on blank lines so injected text can be traced to the offer it came from. */
function chunks(text: string): string[] {
  return text.split(/\n\s*\n|^\s*-{3,}\s*$/m).map((c) => c.trim()).filter(Boolean);
}

export async function startDiligence(raw: DiligenceInput, deps: AgentDeps): Promise<{ runId: string; done: Promise<void> }> {
  const input = DiligenceInputSchema.parse(raw);
  if (!input.offers?.length && !input.offersText.trim()) throw new Error("Paste at least one offer.");
  const runId = deps.store.create("diligence", input.workspace, input);
  return { runId, done: executeRun(runId, deps, (run) => diligencePipeline(input, deps, run)) };
}

async function diligencePipeline(input: z.output<typeof DiligenceInputSchema>, deps: AgentDeps, run: RunControl) {
  const started = Date.now();
  const { ctx } = run;
  const category = input.brand.category;

  const brandResolution = await run.step({ key: "resolve", label: `Finding ${input.brand.name} in Qloo's graph` }, () =>
    resolveEntities([{ name: input.brand.name, type: "brand" }], ctx, {}, { auto: true }),
  );
  const brand = brandResolution?.resolved[0];
  if (!brand) throw new Error(`Qloo has no brand called ${input.brand.name}.`);
  if (brandResolution?.auto.length) ctx.emit("step", { key: "resolve_note", label: "Matched brand", status: "done", detail: brandResolution.auto.join("; ") });

  // Untrusted text: detect reviewer-directed instructions, strip them, then parse.
  const allChunks = chunks(input.offersText);
  const rawChunks = allChunks.slice(0, MAX_OFFERS);
  if (allChunks.length > MAX_OFFERS) {
    ctx.emit("step", { key: "too_many", label: "Too many offers", status: "empty", detail: `Reviewing the first 10 of ${allChunks.length} offers. Run the rest separately.` });
  }
  const flaggedChunks = rawChunks.map((text) => ({ text, ...detectInjection(text) })).filter((c) => c.flagged);
  if (flaggedChunks.length) {
    ctx.emit("step", { key: "injection", label: "Screening offers for instructions aimed at reviewers", status: "done", detail: `${flaggedChunks.length} offer(s) contained instructions to the reviewer; removed before reading.` });
  }
  let offers: Offer[] = input.offers ?? [];
  if (!offers.length) {
    if (!deps.llm.ready) throw new Error("The language model is not configured, so pasted offers can't be read.");
    const parsed = await run.step({ key: "parse_offers", label: "Reading the offers" }, () => parseOffers(deps.llm, rawChunks.map(stripInjection).join("\n\n")), (p) => `${p.offers.length} offers`);
    offers = parsed?.offers ?? [];
  }
  if (!offers.length) throw new Error("No offers could be read from the text.");

  const reviews = await mapLimit(offers, 2, async (offer): Promise<OfferReview> => {
    const index = offers.indexOf(offer);
    const chunk = rawChunks.find((c) => norm(offer.propertyName) && norm(c).includes(norm(offer.propertyName))) ?? (offers.length === rawChunks.length ? rawChunks[index] : undefined);
    const source = chunk ? flaggedChunks.find((c) => c.text === chunk) : undefined;
    const review: OfferReview = { offer, property: null, injection: { flagged: Boolean(source), spans: source?.spans ?? [] }, fit: null, notes: [], memo: null };
    if (source) review.notes.push("This offer contained instructions aimed at an automated reviewer. They were removed and had no effect on the score.");
    const stepInfo = { key: `offer:${offer.propertyName}`, label: `Evaluating ${offer.propertyName}` };
    ctx.emit("step", { ...stepInfo, status: "running" });

    const resolution = await resolveEntities(offer.entities, ctx, {}, { auto: true });
    if (resolution.auto.length) review.notes.push(`Matched by closest name: ${resolution.auto.join("; ")}. Check these are the right entities.`);
    if (resolution.missing.length) review.notes.push(`Qloo has no match for: ${resolution.missing.join(", ")}.`);
    // Competitors named anywhere in the offer's own text count, whatever the model extracted.
    const named = chunk ? input.brand.competitors.filter((c) => chunkMentions(chunk, c)) : [];
    const brandSide = { competitors: input.brand.competitors, propertySponsors: [...offer.currentSponsors, ...named] };
    if (!resolution.resolved.length) {
      // No Qloo data means no score, but conflicts and age rules still apply.
      review.notes.push("Qloo doesn't know this property, so Somm gives no score.");
      const unknown: Property = { kind: offer.kind, name: offer.propertyName, market: "United States", exclusives: [], agePolicy: "unknown", entities: [{ id: "unknown", name: offer.propertyName, type: "brand" }] };
      const blank = { property: unknown, tags: [], demographics: null, entityDemographics: [], heatmap: [], crossDomain: {}, momentum: null, facts: [] };
      const none = { score: null, facts: [] };
      review.fit = applyGates(
        { brand, category, components: { affinity: none, reciprocity: none, demographic: none, geo: none, momentum: none }, score: null, verdict: "INSUFFICIENT_EVIDENCE", reasons: [] },
        { property: unknown, fp: blank, brandSide },
      );
      ctx.emit("step", { ...stepInfo, status: "empty", detail: `not in Qloo, ${review.fit.verdict.toLowerCase().replace("_", " ")}` });
      return review;
    }
    const property: Property = { kind: offer.kind, name: offer.propertyName, market: "United States", exclusives: [], agePolicy: "unknown", entities: resolution.resolved.slice(0, 10) };
    review.property = property;
    const offerCtx = {
      ...ctx,
      emit: (kind: Parameters<typeof ctx.emit>[0], payload: unknown) =>
        ctx.emit(kind, kind === "step" ? { ...(payload as object), key: `${offer.propertyName}:${(payload as { key: string }).key}`, label: `${offer.propertyName}: ${(payload as { label: string }).label}` } : payload),
    };
    const fp = await buildFingerprint(property, offerCtx, new Date(), { light: true });

    // Where does this brand sit among the category's top brands for this audience?
    const field = await prospect(property, [category], ctx);
    const peers = field.categories[0]?.candidates.filter((c) => c.entity.id !== brand.id).slice(0, 9) ?? [];
    const ranked = await qloo(ctx, "rank", { options: [brand.id, ...peers.map((p) => p.entity.id)], option_type: "brand", signals: property.entities.map((e) => e.id) });
    const order = parseEntities(ranked.env, "brand").sort((a, b) => b.affinity - a.affinity);
    const position = order.findIndex((e) => e.entity.id === brand.id);
    const rank =
      position >= 0 && ranked.entry
        ? { value: order[position].affinity, min: Math.min(...order.map((o) => o.affinity)), max: Math.max(...order.map((o) => o.affinity)), position: position + 1, of: order.length, ledgerId: ranked.entry.id }
        : null;

    const fit = await scoreFit({ fp, brand, category, rank }, ctx);
    review.fit = applyGates(fit, { property, fp, brandSide });
    ctx.emit("step", { ...stepInfo, status: "done", detail: review.fit.score === null ? review.fit.verdict : `${review.fit.verdict} · ${review.fit.score}` });
    return review;
  });

  // Decision memos for the offers worth a conversation.
  if (deps.llm.ready) {
    const worth = reviews.filter((r) => r.fit && (r.fit.verdict === "PURSUE" || r.fit.verdict === "CONSIDER")).slice(0, 3);
    if (worth.length) {
      await run.step({ key: "memos", label: "Writing claim-checked decision memos" }, async () => {
        const ledger = ctx.ledger.all();
        const byId = new Map(ctx.facts.all().map((f) => [f.id, f]));
        await mapLimit(worth, 3, async (r) => {
          const facts = Object.values(r.fit!.components).flatMap((c) => c.facts).map((id) => byId.get(id)).filter((f): f is Fact => Boolean(f));
          const markdown = await writePitch(deps.llm, { property: r.property!, brand: brand.name, category: categoryById(category)?.label ?? category, verdict: r.fit!.verdict, facts, side: "brand" });
          const allowed = [brand.name, r.property!.name, r.property!.market, categoryById(category)?.label ?? category, ...r.property!.entities.map((e) => e.name)];
          r.memo = { markdown, check: checkClaims(markdown, facts, allowed, { describeLedger: describeLedger(ledger) }) };
        });
      });
    }
  }

  // Properties whose fans already love this brand.
  const alternatives =
    (await run.step({ key: "alternatives", label: `Finding properties whose fans love ${brand.name}` }, async () => {
      const lists = await mapLimit(["podcast", "artist", "tv_show"] as const, 3, async (domain) => {
        const { env, entry } = await qloo(ctx, "recommend", { target_type: domain, signals: [brand.id], limit: 5 });
        return parseEntities(env, domain).slice(0, 5).map((item, index): Alternative => ({
          entity: item.entity,
          affinity: item.affinity,
          domain,
          fact: ctx.facts.add({ ledgerIds: entry ? [entry.id] : [], label: `${item.entity.name}: #${index + 1} ${domain.replace("_", " ")} for ${brand.name}'s fans`, value: index + 1, display: `#${index + 1} for ${brand.name}'s fans (affinity ${item.affinity.toFixed(2)})` }).id,
        }));
      });
      return lists.flat();
    }, (a) => `${a.length} properties`)) ?? [];

  const ledger = ctx.ledger.all();
  const result: DiligenceResult = {
    brand,
    category,
    competitors: input.brand.competitors,
    offers: reviews,
    alternatives,
    facts: ctx.facts.all(),
    ledger,
    stats: { qlooCalls: ledger.length, cached: ledger.filter((e) => e.transport === "cache").length, durationMs: Date.now() - started },
  };
  return { status: "done" as const, result };
}
