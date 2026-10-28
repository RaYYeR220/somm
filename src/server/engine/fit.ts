import { FIT_COMPONENTS, type EntityRef, type FitComponent, type FitResult, type SponsorCategory, type Verdict } from "@/lib/types";
import { qloo, type EngineContext } from "./context";
import { parseDemographics, parseEntities, parseHeatmap, type Demographics, type HeatCell } from "./facts";
import { heatmapQuery, type Fingerprint } from "./fingerprint";

export const WEIGHTS: Record<FitComponent, number> = {
  affinity: 0.35,
  reciprocity: 0.2,
  demographic: 0.2,
  geo: 0.15,
  momentum: 0.1,
};

/** A fit needs at least this many independent components before it gets a number. */
export const MIN_COMPONENTS = 3;

export const THRESHOLDS = { consider: 45, pursue: 65 } as const;

export function combine(scores: Record<FitComponent, number | null>): { score: number | null; available: number } {
  let weight = 0;
  let total = 0;
  for (const name of FIT_COMPONENTS) {
    const value = scores[name];
    if (value === null) continue;
    weight += WEIGHTS[name];
    total += WEIGHTS[name] * value;
  }
  const available = FIT_COMPONENTS.filter((name) => scores[name] !== null).length;
  return { score: available >= MIN_COMPONENTS && weight > 0 ? total / weight : null, available };
}

/** Verdict from the score as displayed (rounded), so the number and the stamp never disagree. */
export function verdictFor(raw: number | null): Verdict {
  if (raw === null) return "INSUFFICIENT_EVIDENCE";
  const score = Math.round(raw);
  if (score >= THRESHOLDS.pursue) return "PURSUE";
  if (score >= THRESHOLDS.consider) return "CONSIDER";
  return "PASS";
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** 100 × cosine of the two age+gender affinity vectors, mapped from [-1, 1] to [0, 100]. */
export function demographicSimilarity(a: Demographics, b: Demographics): number {
  const keys = [
    ...new Set([...Object.keys(a.age), ...Object.keys(b.age)].map((k) => `age:${k}`)),
    ...new Set([...Object.keys(a.gender), ...Object.keys(b.gender)].map((k) => `gender:${k}`)),
  ];
  const pick = (d: Demographics, key: string) => {
    const [group, name] = key.split(":") as ["age" | "gender", string];
    return d[group][name] ?? 0;
  };
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const key of keys) {
    const x = pick(a, key);
    const y = pick(b, key);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 50;
  return clamp(50 * (dot / Math.sqrt(na * nb) + 1));
}

/** Weighted Jaccard over geohash-4 areas (~40 km), weights = summed heatmap affinity. */
export function geoOverlap(a: HeatCell[], b: HeatCell[]): number {
  const bucket = (cells: HeatCell[]) => {
    const m = new Map<string, number>();
    for (const cell of cells) m.set(cell.geohash.slice(0, 4), (m.get(cell.geohash.slice(0, 4)) ?? 0) + cell.affinity);
    return m;
  };
  const ma = bucket(a);
  const mb = bucket(b);
  let min = 0;
  let max = 0;
  for (const key of new Set([...ma.keys(), ...mb.keys()])) {
    const x = ma.get(key) ?? 0;
    const y = mb.get(key) ?? 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
  }
  return max === 0 ? 0 : min / max;
}

/** Slope is the relative popularity-rank improvement; ±20% spans the full scale, flat is 50. */
export function momentumScore(slope: number): number {
  return Math.round(clamp(50 + slope * 250));
}

export type RankEvidence = { value: number; min: number; max: number; position: number; of: number; ledgerId: string };

type FitInput = { fp: Fingerprint; brand: EntityRef; category: SponsorCategory; rank: RankEvidence | null };

export async function scoreFit({ fp, brand, category, rank }: FitInput, ctx: EngineContext): Promise<FitResult> {
  const property = fp.property;
  const lead = property.entities[0];
  const components = Object.fromEntries(
    FIT_COMPONENTS.map((c) => [c, { score: null as number | null, facts: [] as string[] }]),
  ) as unknown as FitResult["components"];

  if (rank) {
    const spread = rank.max - rank.min;
    const relative = spread > 0 ? (rank.value - rank.min) / spread : 1;
    components.affinity.score = Math.round(clamp(100 * (0.6 * relative + 0.4 * rank.value)));
    components.affinity.facts.push(
      ctx.facts.add({
        ledgerIds: [rank.ledgerId],
        label: `${brand.name} ranks #${rank.position} of ${rank.of} brands in this category for ${property.name}'s audience`,
        value: rank.position,
        display: `#${rank.position} of ${rank.of} (affinity ${rank.value.toFixed(2)})`,
      }).id,
    );
  }

  const sameType = property.entities.filter((e) => e.type === lead.type).slice(0, 10);
  const [reciprocal, brandDemo, brandGeo] = await Promise.all([
    qloo(ctx, "rank", { options: sameType.map((e) => e.id), option_type: lead.type, signals: [brand.id], signal_location: property.market }),
    qloo(ctx, "audience_demographics", { entity: brand.id, entity_type: "brand" }),
    qloo(ctx, "insights_raw", heatmapQuery(brand.id, property.market)),
  ]);

  const back = parseEntities(reciprocal.env, lead.type);
  if (back.length && reciprocal.entry) {
    const mean = back.reduce((sum, item) => sum + item.affinity, 0) / back.length;
    components.reciprocity.score = Math.round(clamp(100 * mean));
    components.reciprocity.facts.push(
      ctx.facts.add({
        ledgerIds: [reciprocal.entry.id],
        label: `${brand.name}'s fans' affinity for ${property.name}`,
        value: Number(mean.toFixed(2)),
        display: `${mean.toFixed(2)} affinity back toward ${property.name}`,
      }).id,
    );
  }

  const demo = parseDemographics(brandDemo.env);
  if (demo && fp.demographics && brandDemo.entry) {
    const similarity = Math.round(demographicSimilarity(fp.demographics, demo));
    components.demographic.score = similarity;
    components.demographic.facts.push(
      ctx.facts.add({
        ledgerIds: [brandDemo.entry.id],
        label: `Age and gender profile similarity between ${property.name} and ${brand.name}`,
        value: similarity,
        display: `${similarity}/100 audience-profile match`,
      }).id,
    );
  }

  const cells = parseHeatmap(brandGeo.env);
  if (cells.length && fp.heatmap.length && brandGeo.entry) {
    const overlap = Math.round(100 * geoOverlap(fp.heatmap, cells));
    components.geo.score = overlap;
    components.geo.facts.push(
      ctx.facts.add({
        ledgerIds: [brandGeo.entry.id],
        label: `Overlap between ${property.name}'s and ${brand.name}'s strongest areas in ${property.market}`,
        value: overlap,
        display: `${overlap}% geographic overlap`,
      }).id,
    );
  }

  if (fp.momentum) {
    components.momentum.score = momentumScore(fp.momentum.slope);
    const trendFact = fp.facts.find((f) => f.label.startsWith("Popularity rank trend"));
    if (trendFact) components.momentum.facts.push(trendFact.id);
    else components.momentum.facts.push(ctx.facts.add({ ledgerIds: [], label: "90-day momentum", value: components.momentum.score, display: `momentum ${components.momentum.score}/100` }).id);
  }

  const { score } = combine(Object.fromEntries(FIT_COMPONENTS.map((c) => [c, components[c].score])) as Record<FitComponent, number | null>);
  return {
    brand,
    category,
    components,
    score: score === null ? null : Math.round(score),
    verdict: verdictFor(score),
    reasons: [],
  };
}
