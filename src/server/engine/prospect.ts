import type { EntityRef, Property, SponsorCategory } from "@/lib/types";
import { categoryById, resolveCategoryTags } from "./categories";
import { mapLimit, qloo, type EngineContext } from "./context";
import { parseEntities } from "./facts";

export type Candidate = { entity: EntityRef; affinity: number; popularity: number | null; ledgerId: string };
export type CategoryProspects = { category: SponsorCategory; tags: string[]; candidates: Candidate[] };
export type ProspectResult = { categories: CategoryProspects[]; existingPartners: Candidate[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Brands whose audiences over-index with the property's fans, per sponsor category. */
export async function prospect(property: Property, categories: SponsorCategory[], ctx: EngineContext): Promise<ProspectResult> {
  const tagsByCategory = await resolveCategoryTags(categories, ctx);
  const partners = new Set(property.exclusives.map((e) => norm(e.holder)));
  const existingPartners: Candidate[] = [];
  const signals = property.entities.map((e) => e.id);

  const results = await mapLimit(categories, 3, async (category): Promise<CategoryProspects> => {
    const tags = tagsByCategory[category] ?? [];
    const label = categoryById(category)?.label ?? category;
    if (tags.length === 0) {
      ctx.emit("step", { key: `prospect:${category}`, label: `Prospecting ${label}`, status: "empty", detail: "no Qloo brand tag matched this category" });
      return { category, tags, candidates: [] };
    }
    const { env, entry } = await qloo(ctx, "recommend", { target_type: "brand", signals, include_tags: tags, include_tags_operator: "union", limit: 10 });
    const candidates: Candidate[] = [];
    for (const item of parseEntities(env, "brand")) {
      const candidate = { ...item, ledgerId: entry?.id ?? "" };
      if (partners.has(norm(item.entity.name))) existingPartners.push(candidate);
      else candidates.push(candidate);
    }
    ctx.emit("step", {
      key: `prospect:${category}`,
      label: `Prospecting ${label}`,
      status: candidates.length ? "done" : "empty",
      detail: `${candidates.length} brands`,
    });
    return { category, tags, candidates };
  });
  return { categories: results, existingPartners };
}
