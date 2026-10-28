import type { EntityRef, Fact, Property, QlooEntityType } from "@/lib/types";
import { mapLimit, qloo, type EngineContext } from "./context";
import {
  AGE_LABELS,
  averageDemographics,
  parseDemographics,
  parseEntities,
  parseHeatmap,
  parseTags,
  parseTrendSlope,
  isTasteTag,
  signed,
  type Demographics,
  type HeatCell,
  type Momentum,
  type TasteTag,
} from "./facts";

/** Insights heatmap for one entity across a market; returns every cell with its affinity. */
export function heatmapQuery(entityId: string, market: string): Record<string, unknown> {
  return { "filter.type": "urn:heatmap", "signal.interests.entities": entityId, "filter.location.query": market, take: 50 };
}

const TREND_TYPES = new Set<QlooEntityType>(["artist", "book", "brand", "movie", "person", "podcast", "tv_show", "videogame"]);

export const CROSS_DOMAINS = ["brand", "tv_show", "podcast", "artist", "movie", "place"] as const;
export type CrossDomain = (typeof CROSS_DOMAINS)[number];

const DOMAIN_LABEL: Record<CrossDomain, string> = {
  brand: "brands",
  tv_show: "TV shows",
  podcast: "podcasts",
  artist: "artists",
  movie: "films",
  place: "places",
};

export type CrossDomainItem = { entity: EntityRef; affinity: number; rank: number; facts: string[] };

export type Fingerprint = {
  property: Property;
  tags: TasteTag[];
  demographics: Demographics | null;
  entityDemographics: { entity: EntityRef; demographics: Demographics; ledgerId: string }[];
  heatmap: HeatCell[];
  /** Receipt for the heatmap request behind the fan map. */
  heatmapLedgerId?: string;
  crossDomain: Partial<Record<CrossDomain, CrossDomainItem[]>>;
  momentum: Momentum | null;
  facts: Fact[];
};

type Step = { key: string; label: string };

function step(ctx: EngineContext, s: Step, status: "running" | "done" | "empty" | "error", detail?: string) {
  ctx.emit("step", { ...s, status, ...(detail ? { detail } : {}) });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function buildFingerprint(
  property: Property,
  ctx: EngineContext,
  today = new Date(),
  options: { light?: boolean } = {},
): Promise<Fingerprint> {
  const ids = property.entities.map((e) => e.id);
  const own = new Set(ids);
  const lead = property.entities[0];

  const tagsStep = { key: "taste_tags", label: "Reading the audience's taste tags" };
  const demoStep = { key: "demographics", label: "Profiling who the fans are" };
  const geoStep = { key: "heatmap", label: `Mapping where fans live in ${property.market}` };
  const trendStep = { key: "momentum", label: "Checking the popularity trend" };
  const crossStep = { key: "cross_domain", label: "Tasting what fans love across domains" };
  (options.light ? [demoStep, geoStep, trendStep] : [tagsStep, demoStep, geoStep, trendStep, crossStep]).forEach((s) => step(ctx, s, "running"));
  const entityDemographics: Fingerprint["entityDemographics"] = [];
  let heatmapLedgerId: string | undefined;

  const tagsTask = (async () => {
    if (options.light) return [];
    // Taste tags for the lead entities; very large groups make the workflow fail.
    const { env, entry } = await qloo(ctx, "entity_tags", { entities: ids.slice(0, 5), limit: 20 });
    const tags = parseTags(env).filter(isTasteTag).slice(0, 12);
    if (tags.length && entry) {
      ctx.facts.add({ ledgerIds: [entry.id], label: "Top taste tags", value: tags.slice(0, 5).map((t) => t.name).join(", "), display: tags.slice(0, 5).map((t) => t.name).join(", ") });
    }
    step(ctx, tagsStep, tags.length ? "done" : "empty", `${tags.length} tags`);
    return tags;
  })();

  const demoTask = (async () => {
    const calls = await mapLimit(property.entities.slice(0, 3), 3, (entity) =>
      qloo(ctx, "audience_demographics", { entity: entity.id, entity_type: entity.type }),
    );
    const parsed = calls
      .map((c, i) => ({ entity: property.entities[i], demo: parseDemographics(c.env), entry: c.entry }))
      .filter((x) => x.demo && x.entry);
    const demographics = averageDemographics(parsed.map((x) => x.demo!));
    entityDemographics.push(...parsed.map((x) => ({ entity: x.entity, demographics: x.demo!, ledgerId: x.entry!.id })));
    if (demographics) {
      const ledgerIds = parsed.map((x) => x.entry!.id);
      const [topAge, topValue] = Object.entries(demographics.age).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (topAge !== undefined) {
        ctx.facts.add({ ledgerIds, label: `Strongest age over-index: ${AGE_LABELS[topAge] ?? topAge}`, value: Number(topValue.toFixed(2)), display: `${signed(topValue)} affinity, ages ${AGE_LABELS[topAge] ?? topAge}` });
      }
      const youth = demographics.age["24_and_younger"];
      if (youth !== undefined) {
        ctx.facts.add({ ledgerIds, label: "Youth affinity (24 and younger)", value: Number(youth.toFixed(2)), display: `${signed(youth)} affinity, ages 24 and younger` });
      }
      const [topGender, genderValue] = Object.entries(demographics.gender).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (topGender !== undefined) {
        ctx.facts.add({ ledgerIds, label: `Gender lean: ${topGender}`, value: Number(genderValue.toFixed(2)), display: `${signed(genderValue)} affinity, ${topGender}` });
      }
    }
    step(ctx, demoStep, demographics ? "done" : "empty");
    return demographics;
  })();

  const geoTask = (async () => {
    // The full heatmap (every cell, not just the top few) comes from Insights directly.
    const { env, entry } = await qloo(ctx, "insights_raw", heatmapQuery(lead.id, property.market));
    heatmapLedgerId = entry?.id;
    const cells = parseHeatmap(env);
    step(ctx, geoStep, cells.length ? "done" : "empty", `${cells.length} cells`);
    return cells;
  })();

  const trendTask = (async () => {
    if (!TREND_TYPES.has(lead.type)) {
      step(ctx, trendStep, "empty", "Qloo has no popularity trend for this kind of entity");
      return null;
    }
    const sameType = property.entities.filter((e) => e.type === lead.type).slice(0, 5);
    // Qloo's hackathon trend data needs a long window; the latest 20 weeks come back.
    const start = new Date(today.getTime() - 365 * 86_400_000);
    const { env, entry } = await qloo(ctx, "trends", {
      entities: sameType.map((e) => e.id),
      entity_type: lead.type as Exclude<QlooEntityType, "destination">,
      start_date: isoDate(start),
      end_date: isoDate(today),
    });
    const momentum = parseTrendSlope(env);
    if (momentum && entry) {
      const first = momentum.points[0];
      const last = momentum.points[momentum.points.length - 1];
      const fmt = (n: number) => "#" + n.toLocaleString("en-US");
      momentum.factId = ctx.facts.add({
        ledgerIds: [entry.id],
        label: "Popularity rank trend, " + first.date + " to " + last.date,
        value: Number((momentum.slope * 100).toFixed(1)),
        display: first.value === last.value ? "popularity rank steady at " + fmt(last.value) : "popularity rank " + fmt(first.value) + " → " + fmt(last.value),
      }).id;
    }
    step(ctx, trendStep, momentum ? "done" : "empty");
    return momentum;
  })();

  const crossTask = (async () => {
    if (options.light) return {} as Fingerprint["crossDomain"];
    const lists = await mapLimit([...CROSS_DOMAINS], 3, async (domain) => {
      const input: Record<string, unknown> = { target_type: domain, signals: ids, limit: 10 };
      // Places are filtered to the market. Other domains get no location signal: it outweighs the
      // audience's own signal and makes every property look the same.
      if (domain === "place") input.filter_location = property.market;
      const { env, entry } = await qloo(ctx, "recommend", input);
      const items = parseEntities(env, domain)
        .filter((item) => !own.has(item.entity.id))
        .slice(0, 8)
        .map((item, index): CrossDomainItem => {
          const fact = ctx.facts.add({
            ledgerIds: entry ? [entry.id] : [],
            label: `${item.entity.name}: #${index + 1} of ${DOMAIN_LABEL[domain]} for this audience`,
            value: index + 1,
            display: `#${index + 1} ${DOMAIN_LABEL[domain].replace(/s$/, "")} affinity (${item.affinity.toFixed(2)})`,
          });
          return { entity: item.entity, affinity: item.affinity, rank: index + 1, facts: [fact.id] };
        });
      return [domain, items] as const;
    });
    const crossDomain = Object.fromEntries(lists.filter(([, items]) => items.length > 0));
    step(ctx, crossStep, Object.keys(crossDomain).length ? "done" : "empty", `${Object.keys(crossDomain).length} domains`);
    return crossDomain as Fingerprint["crossDomain"];
  })();

  const [tags, demographics, heatmap, momentum, crossDomain] = await Promise.all([tagsTask, demoTask, geoTask, trendTask, crossTask]);
  return { property, tags, demographics, entityDemographics, heatmap, heatmapLedgerId, crossDomain, momentum, facts: ctx.facts.all() };
}
