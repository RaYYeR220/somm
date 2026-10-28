import type { EntityRef, Property, QlooEntityType, SponsorCategory } from "@/lib/types";
import type { AgentDeps } from "@/server/agent/deps";
import { candidatesFrom } from "@/server/agent/resolve";
import { createEngineContext, mapLimit, qloo, type EngineContext } from "@/server/engine/context";
import { parseEntities } from "@/server/engine/facts";
import { buildFingerprint, type Fingerprint } from "@/server/engine/fingerprint";
import { scoreFit } from "@/server/engine/fit";
import { applyGates } from "@/server/engine/gates";
import { llmOnlyRank } from "@/server/llm/prompts";
import { createLedger } from "@/server/qloo/ledger";
import { auc, mean } from "./auc";

export type GroundTruth = {
  properties: {
    id: string;
    name: string;
    type: "podcast" | "festival" | "sports_team";
    entities: { name: string; qloo_type: string }[];
    sponsors: { brand: string; category: string }[];
    controls: { brand: string; category: string }[];
  }[];
};

type TrapProperty = string | { kind: Property["kind"]; name: string; entities: { name: string; type: QlooEntityType }[] };
export type TrapFile = {
  traps: {
    id: string;
    property: TrapProperty;
    brand: string;
    category: SponsorCategory;
    agePolicy?: Property["agePolicy"];
    exclusives?: Property["exclusives"];
    expect: { verdict?: string; verdictNot?: string; ageGateNot?: string };
  }[];
};

export const METHODS = ["somm", "affinity", "popularity", "llm_only", "negative_control"] as const;
type Method = (typeof METHODS)[number];

type BrandRow = { name: string; positive: boolean; entity: EntityRef; popularity: number | null; scores: Record<Method, number | null> };

const KIND: Record<GroundTruth["properties"][number]["type"], Property["kind"]> = { podcast: "podcast", festival: "lineup", sports_team: "team" };
const asType = (t: string): QlooEntityType => (["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame", "destination"].includes(t) ? (t as QlooEntityType) : "person");

async function resolveOne(ctx: EngineContext, name: string, type: QlooEntityType) {
  const { env } = await qloo(ctx, "search", { query: name, types: `urn:entity:${type}`, take: 5 });
  const candidates = env.status === "ok" ? candidatesFrom(env.results, type) : [];
  const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const exact = candidates.find((c) => norm(c.name) === norm(name));
  const pick = exact ?? [...candidates].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
  return pick ? { entity: { id: pick.id, name: pick.name, type: pick.type } as EntityRef, popularity: pick.popularity } : null;
}

/** One Insights call that scores every candidate brand against the given signals. */
async function affinities(ctx: EngineContext, brandIds: string[], signals: string[], market: string) {
  const { env, entry } = await qloo(ctx, "insights_raw", {
    "filter.type": "urn:entity:brand",
    "filter.results.entities": brandIds,
    "signal.interests.entities": signals,
    "signal.location.query": market,
    take: brandIds.length,
  });
  const map = new Map(parseEntities(env, "brand").map((e) => [e.entity.id, e.affinity]));
  return { map, ledgerId: entry?.id ?? "" };
}

function ctxFor(deps: AgentDeps, runId: string): EngineContext {
  return createEngineContext({ runId, gw: deps.gw, ledger: createLedger(deps.db, runId), emit: () => undefined, budget: deps.budget, transportOf: deps.transportOf });
}

export async function runEval(deps: AgentDeps, gt: GroundTruth, trapFile: TrapFile, log: (line: string) => void = () => undefined) {
  const prepared = await mapLimit(gt.properties, 2, async (p) => {
    const ctx = ctxFor(deps, `eval-${p.id}`);
    const resolved = (await mapLimit(p.entities, 4, (e) => resolveOne(ctx, e.name, asType(e.qloo_type)))).filter((r) => r !== null);
    const property: Property = { kind: KIND[p.type], name: p.name, market: "United States", exclusives: [], agePolicy: "unknown", entities: resolved.map((r) => r!.entity).slice(0, 10) };
    const fp = property.entities.length ? await buildFingerprint(property, ctx, new Date(), { light: true }) : null;
    log(`${p.id}: ${property.entities.length}/${p.entities.length} entities resolved`);
    return { p, ctx, property, fp };
  });

  const properties: {
    id: string;
    name: string;
    type: GroundTruth["properties"][number]["type"];
    counts: { sponsors: number; controls: number; resolvedSponsors: number; resolvedControls: number; entities: number };
    auc: Record<Method, number | null>;
    detail: { name: string; matched: string; positive: boolean; scores: Record<Method, number | null> }[];
  }[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const { p, ctx, property, fp } = prepared[i];
    const other = prepared[(i + 1) % prepared.length];
    const wanted = [...p.sponsors.map((s) => ({ name: s.brand, positive: true })), ...p.controls.map((c) => ({ name: c.brand, positive: false }))];
    const found = await mapLimit(wanted, 4, async (w) => ({ ...w, hit: await resolveOne(ctx, w.name, "brand") }));
    const rows: BrandRow[] = found
      .filter((f) => f.hit)
      .map((f) => ({ name: f.name, positive: f.positive, entity: f.hit!.entity, popularity: f.hit!.popularity, scores: { somm: null, affinity: null, popularity: f.hit!.popularity, llm_only: null, negative_control: null } }));
    const unique = [...new Map(rows.map((r) => [r.entity.id, r])).values()];

    if (fp && unique.length) {
      const ids = unique.map((r) => r.entity.id);
      const own = await affinities(ctx, ids, property.entities.map((e) => e.id), property.market);
      const shifted = other.property.entities.length ? await affinities(ctx, ids, other.property.entities.map((e) => e.id), property.market) : null;
      const values = [...own.map.values()];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const order = [...own.map.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
      await mapLimit(unique, 4, async (row) => {
        const value = own.map.get(row.entity.id);
        row.scores.affinity = value ?? null;
        row.scores.negative_control = shifted?.map.get(row.entity.id) ?? null;
        const rank = value === undefined ? null : { value, min, max, position: order.indexOf(row.entity.id) + 1, of: order.length, ledgerId: own.ledgerId };
        row.scores.somm = (await scoreFit({ fp, brand: row.entity, category: "eval", rank }, ctx)).score;
      });
    }
    if (deps.llm.ready && unique.length) {
      try {
        const { ranking } = await llmOnlyRank(deps.llm, property.entities.length ? property : { ...property, entities: [{ id: "x", name: p.name, type: "person" }] }, unique.map((r) => r.name));
        const norm = (s: string) => s.toLowerCase().trim();
        unique.forEach((row) => {
          const at = ranking.findIndex((n) => norm(n) === norm(row.name));
          row.scores.llm_only = at < 0 ? 0 : (ranking.length - at) / ranking.length;
        });
      } catch (error) {
        log(`${p.id}: model-only ranking failed (${error instanceof Error ? error.message : error})`);
      }
    }
    const aucs = Object.fromEntries(
      METHODS.map((m) => {
        const scored = unique.filter((r) => r.scores[m] !== null);
        return [m, auc(scored.filter((r) => r.positive).map((r) => r.scores[m]!), scored.filter((r) => !r.positive).map((r) => r.scores[m]!))];
      }),
    ) as Record<Method, number | null>;
    properties.push({
      id: p.id,
      name: p.name,
      type: p.type,
      counts: { sponsors: p.sponsors.length, controls: p.controls.length, resolvedSponsors: unique.filter((r) => r.positive).length, resolvedControls: unique.filter((r) => !r.positive).length, entities: property.entities.length },
      auc: aucs,
      detail: unique.map((r) => ({ name: r.name, matched: r.entity.name, positive: r.positive, scores: r.scores })),
    });
    log(`${p.id}: ${METHODS.map((m) => `${m}=${aucs[m]?.toFixed(2) ?? "–"}`).join(" ")}`);
  }

  // Gate traps: exercised through the production gates with real fingerprints.
  const byId = new Map(prepared.map((x) => [x.p.id, x]));
  const traps = await mapLimit(trapFile.traps, 2, async (trap) => {
    const ctx = ctxFor(deps, `eval-trap-${trap.id}`);
    let property: Property | null = null;
    let fp: Fingerprint | null = null;
    if (typeof trap.property === "string") {
      const base = byId.get(trap.property);
      property = base ? { ...base.property, agePolicy: trap.agePolicy ?? "unknown", exclusives: trap.exclusives ?? [] } : null;
      fp = base?.fp ? { ...base.fp, property: property! } : null;
    } else {
      const resolved = (await mapLimit(trap.property.entities, 3, (e) => resolveOne(ctx, e.name, e.type))).filter((r) => r !== null);
      property = { kind: trap.property.kind, name: trap.property.name, market: "United States", agePolicy: trap.agePolicy ?? "unknown", exclusives: trap.exclusives ?? [], entities: resolved.map((r) => r!.entity) };
      fp = property.entities.length ? await buildFingerprint(property, ctx, new Date(), { light: true }) : null;
    }
    const brand = await resolveOne(ctx, trap.brand, "brand");
    if (!property || !fp || !brand) return { id: trap.id, pass: false, verdict: null, ageGate: null, reason: "could not resolve property or brand in Qloo" };
    const fit = applyGates(await scoreFit({ fp, brand: brand.entity, category: trap.category, rank: null }, ctx), { property, fp });
    const ageGate = fit.gates?.find((g) => g.gate === "age_restricted")?.outcome ?? null;
    const pass =
      (!trap.expect.verdict || fit.verdict === trap.expect.verdict) &&
      (!trap.expect.verdictNot || fit.verdict !== trap.expect.verdictNot) &&
      (!trap.expect.ageGateNot || (ageGate !== null && ageGate !== trap.expect.ageGateNot));
    return { id: trap.id, pass, verdict: fit.verdict, ageGate, reason: fit.reasons[0] ?? "" };
  });

  const mean_ = Object.fromEntries(METHODS.map((m) => [m, mean(properties.map((p) => p.auc[m]))])) as Record<Method, number | null>;
  const byType = Object.fromEntries(
    (["podcast", "festival", "sports_team"] as const).map((t) => [t, Object.fromEntries(METHODS.map((m) => [m, mean(properties.filter((p) => p.type === t).map((p) => p.auc[m]))]))]),
  );
  const wins = Object.fromEntries(
    METHODS.map((m) => [m, properties.filter((p) => p.auc[m] !== null && METHODS.every((o) => o === m || p.auc[o] === null || p.auc[m]! >= p.auc[o]!)).length]),
  );
  const summary = { mean: mean_, byType, wins, traps: { passed: traps.filter((t) => t.pass).length, total: traps.length } };
  const publicView = {
    generatedAt: new Date().toISOString(),
    summary,
    properties: properties.map(({ detail: _detail, ...rest }) => rest),
    traps,
  };
  return { properties, traps, summary, public: publicView };
}
