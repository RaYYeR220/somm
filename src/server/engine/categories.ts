import type { SponsorCategory } from "@/lib/types";
import { mapLimit, qloo, type EngineContext } from "./context";

export type CategoryDef = {
  id: SponsorCategory;
  label: string;
  /** Natural-language concepts resolved against Qloo's brand-scoped tag ontology. */
  tagQueries: string[];
  ageRestricted: boolean;
};

export const CATEGORIES: CategoryDef[] = [
  { id: "beverage_soft", label: "Soft drinks & water", tagQueries: ["soft drinks", "bottled water"], ageRestricted: false },
  { id: "energy_drink", label: "Energy drinks", tagQueries: ["energy drinks"], ageRestricted: false },
  { id: "beer", label: "Beer", tagQueries: ["beer", "brewery"], ageRestricted: true },
  { id: "spirits", label: "Spirits", tagQueries: ["spirits", "liquor"], ageRestricted: true },
  { id: "coffee", label: "Coffee", tagQueries: ["coffee"], ageRestricted: false },
  { id: "qsr", label: "Quick-service restaurants", tagQueries: ["fast food", "quick service restaurant"], ageRestricted: false },
  { id: "food_cpg", label: "Packaged food & snacks", tagQueries: ["snacks", "packaged food"], ageRestricted: false },
  { id: "auto", label: "Automotive", tagQueries: ["automotive", "car manufacturer"], ageRestricted: false },
  { id: "telecom", label: "Telecom", tagQueries: ["wireless carrier", "telecommunications"], ageRestricted: false },
  { id: "fintech_bank", label: "Banking & cards", tagQueries: ["bank", "credit card"], ageRestricted: false },
  { id: "payments", label: "Payments & commerce", tagQueries: ["payments", "ecommerce platform"], ageRestricted: false },
  { id: "crypto", label: "Crypto", tagQueries: ["cryptocurrency exchange"], ageRestricted: false },
  { id: "prediction_markets", label: "Prediction markets", tagQueries: ["prediction market"], ageRestricted: false },
  { id: "sports_betting", label: "Sports betting", tagQueries: ["sports betting", "online gambling"], ageRestricted: true },
  { id: "apparel", label: "Apparel", tagQueries: ["apparel", "clothing"], ageRestricted: false },
  { id: "footwear", label: "Footwear", tagQueries: ["sneakers", "footwear"], ageRestricted: false },
  { id: "beauty", label: "Beauty & grooming", tagQueries: ["cosmetics", "grooming"], ageRestricted: false },
  { id: "wellness_supplements", label: "Wellness & supplements", tagQueries: ["supplements", "wellness"], ageRestricted: false },
  { id: "fitness_wearables", label: "Fitness & wearables", tagQueries: ["fitness", "wearable technology"], ageRestricted: false },
  { id: "consumer_tech", label: "Consumer tech", tagQueries: ["consumer electronics", "smartphones"], ageRestricted: false },
  { id: "software_b2b", label: "Software & SaaS", tagQueries: ["software", "productivity software"], ageRestricted: false },
  { id: "travel_hospitality", label: "Travel & hospitality", tagQueries: ["hotels", "airlines"], ageRestricted: false },
  { id: "streaming_media", label: "Streaming & media", tagQueries: ["streaming service"], ageRestricted: false },
  { id: "gaming", label: "Gaming", tagQueries: ["video game publisher", "gaming"], ageRestricted: false },
  { id: "retail", label: "Retail", tagQueries: ["department store", "retailer"], ageRestricted: false },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export const categoryById = (id: SponsorCategory) => BY_ID.get(id);
export const isAgeRestricted = (id: SponsorCategory) => BY_ID.get(id)?.ageRestricted ?? false;

type TagCandidate = { id: string; name: string; parentTypes: string[] };

function brandTagCandidates(results: unknown): TagCandidate[] {
  const list = Array.isArray(results)
    ? results
    : Array.isArray((results as { tags?: unknown })?.tags)
      ? ((results as { tags: unknown[] }).tags as unknown[])
      : [];
  return list.flatMap((item) => {
    const record = item as { id?: unknown; tag_id?: unknown; name?: unknown; parents?: unknown };
    const id = record.id ?? record.tag_id;
    if (typeof id !== "string" || typeof record.name !== "string") return [];
    const parentTypes = (Array.isArray(record.parents) ? record.parents : [])
      .map((p) => (p as { type?: unknown }).type)
      .filter((t): t is string => typeof t === "string");
    return [{ id, name: record.name, parentTypes }];
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Best brand-scoped tag for a concept: exact name first, else the top-ranked brand tag. */
function pickTag(query: string, candidates: TagCandidate[]): string | null {
  const scoped = candidates.filter((c) => c.parentTypes.includes("urn:entity:brand"));
  return (scoped.find((c) => norm(c.name) === norm(query)) ?? scoped[0])?.id ?? null;
}

const memo = new Map<string, string | null>();

export async function resolveCategoryTags(
  categories: SponsorCategory[],
  ctx: EngineContext,
): Promise<Record<SponsorCategory, string[]>> {
  const out: Record<SponsorCategory, string[]> = {};
  await mapLimit(categories, 4, async (id) => {
    const def = BY_ID.get(id);
    const queries = def?.tagQueries ?? [id.replace(/_/g, " ")];
    const tags = await mapLimit(queries, 2, async (query) => {
      if (memo.has(query) && memo.get(query)) return memo.get(query)!;
      const { env } = await qloo(ctx, "tags_raw", { "filter.query": query, "feature.semantic_search": true, take: 20 });
      const tag = env.status === "ok" ? pickTag(query, brandTagCandidates(env.results)) : null;
      if (tag) memo.set(query, tag);
      return tag;
    });
    out[id] = [...new Set(tags.filter((t): t is string => t !== null))];
  });
  return out;
}

/** Test hook: forget resolved tags between test cases. */
export function clearCategoryTagMemo() {
  memo.clear();
}
