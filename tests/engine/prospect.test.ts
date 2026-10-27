import { describe, expect, it } from "vitest";
import type { Envelope, QlooOp } from "@/lib/types";
import { CATEGORIES, resolveCategoryTags } from "@/server/engine/categories";
import { prospect } from "@/server/engine/prospect";
import { empty, entityResult, okList, sampleProperty, scriptedGateway, testContext } from "../helpers";

const brandTag = (id: string, name: string) => ({ id, name, type: "urn:tag:category", parents: [{ type: "urn:entity:brand" }] });
const movieTag = (id: string, name: string) => ({ id, name, type: "urn:tag:genre", parents: [{ type: "urn:entity:movie" }] });

describe("categories", () => {
  it("flags only alcohol and betting categories as age restricted", () => {
    const restricted = CATEGORIES.filter((c) => c.ageRestricted).map((c) => c.id).sort();
    expect(restricted).toEqual(["beer", "spirits", "sports_betting"]);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
  });

  it("keeps only brand-scoped tags and prefers the exact name", async () => {
    const { gw, calls } = scriptedGateway((op, input) => {
      if (op !== "tags_raw") return empty(op);
      if (String(input["filter.query"]) === "energy drinks") {
        return okList(op, [movieTag("urn:tag:genre:energy", "Energy"), brandTag("urn:tag:category:brand:soft", "Soft Drinks"), brandTag("urn:tag:category:brand:energy_drinks", "Energy Drinks")]);
      }
      return empty(op);
    });
    const ctx = testContext(gw);
    const tags = await resolveCategoryTags(["energy_drink", "beer"], ctx);
    expect(tags.energy_drink).toEqual(["urn:tag:category:brand:energy_drinks"]);
    expect(tags.beer).toEqual([]);
    expect(calls.every((c) => c.input["feature.semantic_search"] === true)).toBe(true);
  });
});

describe("prospect", () => {
  const answer = (op: QlooOp, input: Record<string, unknown>): Envelope => {
    if (op === "tags_raw") return okList(op, [brandTag(`urn:tag:category:brand:${String(input["filter.query"]).replace(/\s/g, "_")}`, String(input["filter.query"]))]);
    if (op === "recommend") {
      return okList(op, [
        entityResult("b-red", "Red Bull", "brand", 0.97),
        entityResult("b-ld", "Liquid Death", "brand", 0.95),
        entityResult("b-cel", "Celsius", "brand", 0.9),
      ]);
    }
    return empty(op);
  };

  it("passes resolved tag URNs and the property's entities to recommend", async () => {
    const { gw, calls } = scriptedGateway(answer);
    const result = await prospect(sampleProperty(), ["energy_drink"], testContext(gw));
    const rec = calls.find((c) => c.op === "recommend")!;
    expect(rec.input).toMatchObject({ target_type: "brand", signals: ["pod-1", "per-1"] });
    expect((rec.input.include_tags as string[])[0]).toMatch(/^urn:tag:/);
    expect(result.categories[0].candidates.map((c) => c.entity.name)).toEqual(["Red Bull", "Liquid Death", "Celsius"]);
    expect(result.categories[0].candidates[0].ledgerId).toMatch(/^E\d+$/);
  });

  it("excludes existing partner brands and reports them separately", async () => {
    const { gw } = scriptedGateway(answer);
    const property = sampleProperty({ exclusives: [{ category: "energy_drink", holder: "red bull" }] });
    const result = await prospect(property, ["energy_drink"], testContext(gw));
    expect(result.categories[0].candidates.map((c) => c.entity.name)).not.toContain("Red Bull");
    expect(result.existingPartners.map((p) => p.entity.name)).toEqual(["Red Bull"]);
  });

  it("returns empty candidates with a warning when a category has no brand tags", async () => {
    const { gw, calls } = scriptedGateway((op) => empty(op));
    const ctx = testContext(gw);
    const result = await prospect(sampleProperty(), ["beer"], ctx);
    expect(result.categories[0].candidates).toEqual([]);
    expect(calls.some((c) => c.op === "recommend")).toBe(false);
    expect(ctx.events.some((e) => JSON.stringify(e.payload).includes("no Qloo brand tag"))).toBe(true);
  });
});

describe("client category labels", () => {
  it("cover every server category with the same label", async () => {
    const { CATEGORY_LABEL } = await import("@/lib/categories");
    for (const c of CATEGORIES) expect(CATEGORY_LABEL[c.id], c.id).toBe(c.label);
  });
});
