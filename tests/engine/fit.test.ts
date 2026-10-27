import { describe, expect, it } from "vitest";
import type { EntityRef, Envelope, QlooOp } from "@/lib/types";
import { combine, demographicSimilarity, geoOverlap, momentumScore, scoreFit, verdictFor } from "@/server/engine/fit";
import type { Fingerprint } from "@/server/engine/fingerprint";
import { demographicsResult, empty, entityResult, heatmapPoint, okList, sampleProperty, scriptedGateway, testContext } from "../helpers";

const brand: EntityRef = { id: "b-ld", name: "Liquid Death", type: "brand" };

const fingerprint = (): Fingerprint => ({
  property: sampleProperty(),
  tags: [],
  demographics: { age: { "24_and_younger": -0.1, "25_to_29": 0.4, "30_to_34": 0.3 }, gender: { male: 0.2, female: -0.2 } },
  heatmap: [
    { geohash: "dr5ryb", lat: 40.74, lng: -73.87, affinity: 0.99 },
    { geohash: "9q8yyk", lat: 37.77, lng: -122.42, affinity: 0.97 },
  ],
  crossDomain: {},
  momentum: { slope: 0.5, points: [{ date: "2026-08-01", value: 80 }, { date: "2026-10-01", value: 84 }] },
  facts: [],
});

function brandAnswer(op: QlooOp): Envelope {
  if (op === "rank") return okList(op, [entityResult("pod-1", "Founders Weekly", "podcast", 0.8)]);
  if (op === "audience_demographics") return okList(op, demographicsResult({ "24_and_younger": -0.1, "25_to_29": 0.4, "30_to_34": 0.3 }, { male: 0.2, female: -0.2 }));
  if (op === "where_popular") return okList(op, [heatmapPoint("dr5ryc", 40.75, -73.86, 0.95), heatmapPoint("c23nb6", 47.6, -122.3, 0.9)]);
  return empty(op);
}

describe("combine", () => {
  it("renormalises weights over the available components", () => {
    const { score, available } = combine({ affinity: 80, reciprocity: null, demographic: 60, geo: 40, momentum: null });
    expect(available).toBe(3);
    expect(score).toBeCloseTo((80 * 0.35 + 60 * 0.2 + 40 * 0.15) / 0.7, 5);
  });

  it("returns a null score with only two components", () => {
    expect(combine({ affinity: 90, reciprocity: 90, demographic: null, geo: null, momentum: null }).score).toBeNull();
  });
});

describe("component maths", () => {
  it("geo overlap is 1 for identical heatmaps and 0 for disjoint ones", () => {
    const a = [{ geohash: "dr5ryb", lat: 0, lng: 0, affinity: 0.9 }];
    expect(geoOverlap(a, a)).toBeCloseTo(1);
    expect(geoOverlap(a, [{ geohash: "9q8yyk", lat: 0, lng: 0, affinity: 0.9 }])).toBe(0);
  });

  it("demographic similarity of identical profiles is 100 and of opposite profiles is 0", () => {
    const d = { age: { a: 0.4, b: -0.2 }, gender: { male: 0.1, female: -0.1 } };
    const opposite = { age: { a: -0.4, b: 0.2 }, gender: { male: -0.1, female: 0.1 } };
    expect(demographicSimilarity(d, d)).toBeCloseTo(100);
    expect(demographicSimilarity(d, opposite)).toBeCloseTo(0);
  });

  it("momentum maps a flat trend to 50 and clamps", () => {
    expect(momentumScore(0)).toBe(50);
    expect(momentumScore(100)).toBe(100);
    expect(momentumScore(-100)).toBe(0);
  });

  it("verdict thresholds follow the ladder", () => {
    expect(verdictFor(null)).toBe("INSUFFICIENT_EVIDENCE");
    expect(verdictFor(44.9)).toBe("PASS");
    expect(verdictFor(45)).toBe("CONSIDER");
    expect(verdictFor(65)).toBe("PURSUE");
  });
});

describe("scoreFit", () => {
  it("scores every component and lists the facts behind each", async () => {
    const { gw, calls } = scriptedGateway(brandAnswer);
    const ctx = testContext(gw);
    const fit = await scoreFit({ fp: fingerprint(), brand, category: "energy_drink", rank: { value: 0.95, min: 0.8, max: 0.97, position: 2, of: 10, ledgerId: "E1" } }, ctx);
    expect(calls.map((c) => c.op).sort()).toEqual(["audience_demographics", "rank", "where_popular"]);
    for (const [name, component] of Object.entries(fit.components)) {
      expect(component.score, name).not.toBeNull();
      expect(component.facts.length, name).toBeGreaterThan(0);
      for (const id of component.facts) expect(ctx.facts.get(id), `${name}:${id}`).toBeDefined();
    }
    expect(fit.score).not.toBeNull();
    expect(fit.components.demographic.score).toBeCloseTo(100);
  });

  it("still scores when brand demographics are missing", async () => {
    const { gw } = scriptedGateway((op) => (op === "audience_demographics" ? empty(op) : brandAnswer(op)));
    const fit = await scoreFit({ fp: fingerprint(), brand, category: "energy_drink", rank: null }, testContext(gw));
    expect(fit.components.demographic.score).toBeNull();
    expect(fit.components.affinity.score).toBeNull();
    expect(fit.score).not.toBeNull();
  });

  it("is insufficient when Qloo knows nothing about the brand", async () => {
    const { gw } = scriptedGateway((op) => empty(op));
    const fp = { ...fingerprint(), momentum: null };
    const fit = await scoreFit({ fp, brand, category: "energy_drink", rank: null }, testContext(gw));
    expect(fit.score).toBeNull();
    expect(fit.verdict).toBe("INSUFFICIENT_EVIDENCE");
  });
});
