import { describe, expect, it } from "vitest";
import type { Envelope, QlooOp } from "@/lib/types";
import { parseDemographics, parseHeatmap, parseTrendSlope } from "@/server/engine/facts";
import { buildFingerprint } from "@/server/engine/fingerprint";
import {
  demographicsResult,
  empty,
  entityResult,
  heatmapPoint,
  okList,
  sampleProperty,
  scriptedGateway,
  testContext,
  trendSeries,
} from "../helpers";

function fullAnswer(op: QlooOp, input: Record<string, unknown>): Envelope {
  switch (op) {
    case "entity_tags":
      return okList(op, [{ id: "urn:tag:keyword:startups", name: "Startups", affinity: 0.9 }]);
    case "audience_demographics":
      return okList(op, demographicsResult({ "24_and_younger": -0.1, "25_to_29": 0.4, "30_to_34": 0.3 }, { male: 0.2, female: -0.2 }));
    case "where_popular":
      return okList(op, [heatmapPoint("dr5ryb", 40.74, -73.87, 0.99), heatmapPoint("9q8yyk", 37.77, -122.42, 0.97)]);
    case "trends":
      return { ...okList(op, []), series: [trendSeries("pod-1", [80, 82, 84, 86])] };
    case "recommend":
      return okList(op, [
        entityResult("pod-1", "Founders Weekly", String(input.target_type), 0.99),
        entityResult(`${input.target_type}-a`, `Top ${input.target_type}`, String(input.target_type), 0.95),
        entityResult(`${input.target_type}-b`, `Second ${input.target_type}`, String(input.target_type), 0.9),
      ]);
    default:
      return empty(op);
  }
}

describe("buildFingerprint", () => {
  it("records one ledger entry per Qloo call", async () => {
    const { gw, calls } = scriptedGateway(fullAnswer);
    const ctx = testContext(gw);
    await buildFingerprint(sampleProperty(), ctx);
    expect(ctx.ledger.all()).toHaveLength(calls.length);
    expect(calls.map((c) => c.op)).toEqual(expect.arrayContaining(["entity_tags", "audience_demographics", "where_popular", "trends", "recommend"]));
  });

  it("drops the property's own entities from cross-domain results and backs each with a fact", async () => {
    const { gw } = scriptedGateway(fullAnswer);
    const ctx = testContext(gw);
    const fp = await buildFingerprint(sampleProperty(), ctx);
    const podcasts = fp.crossDomain.podcast ?? [];
    expect(podcasts.map((p) => p.entity.id)).not.toContain("pod-1");
    expect(podcasts[0].entity.name).toBe("Top podcast");
    expect(podcasts[0].facts).toHaveLength(1);
    const fact = ctx.facts.get(podcasts[0].facts[0]);
    expect(fact?.ledgerIds[0]).toMatch(/^E\d+$/);
  });

  it("empty demographics yields null, not zeros", async () => {
    const { gw } = scriptedGateway((op, input) => (op === "audience_demographics" ? empty(op) : fullAnswer(op, input)));
    const ctx = testContext(gw);
    const fp = await buildFingerprint(sampleProperty(), ctx);
    expect(fp.demographics).toBeNull();
    expect(ctx.events.some((e) => e.kind === "step" && JSON.stringify(e.payload).includes("empty"))).toBe(true);
  });

  it("averages demographics over up to three entities", async () => {
    let n = 0;
    const { gw } = scriptedGateway((op, input) => {
      if (op !== "audience_demographics") return fullAnswer(op, input);
      n += 1;
      return okList(op, demographicsResult({ "25_to_29": n === 1 ? 0.6 : 0.2 }, { male: 0 }));
    });
    const property = sampleProperty({
      entities: [
        { id: "a", name: "A", type: "artist" },
        { id: "b", name: "B", type: "artist" },
        { id: "c", name: "C", type: "artist" },
        { id: "d", name: "D", type: "artist" },
      ],
    });
    const fp = await buildFingerprint(property, testContext(gw));
    expect(n).toBe(3);
    expect(fp.demographics?.age["25_to_29"]).toBeCloseTo((0.6 + 0.2 + 0.2) / 3);
  });
});

describe("parsers", () => {
  it("heatmap decodes geohash to lat/lng when coordinates are missing", () => {
    const cells = parseHeatmap(okList("where_popular", [{ location: { geohash: "dr5ryb" }, query: { affinity: 0.9 } }]));
    expect(cells[0].lat).toBeCloseTo(40.74, 1);
    expect(cells[0].lng).toBeCloseTo(-73.88, 1);
  });

  it("demographics accepts the documented query.age shape", () => {
    const parsed = parseDemographics(okList("audience_demographics", demographicsResult({ "24_and_younger": 0.3 }, { female: 0.1 })));
    expect(parsed).toEqual({ age: { "24_and_younger": 0.3 }, gender: { female: 0.1 } });
  });

  it("momentum slope is positive for a rising series and negative for a falling one", () => {
    const rising = parseTrendSlope({ operation: "trends", status: "ok", series: [trendSeries("x", [10, 20, 30])] });
    const falling = parseTrendSlope({ operation: "trends", status: "ok", series: [trendSeries("x", [30, 20, 10])] });
    expect(rising?.slope).toBeGreaterThan(0);
    expect(falling?.slope).toBeLessThan(0);
    expect(rising!.points[0].date < rising!.points[2].date).toBe(true);
  });
});

describe("per-entity demographics", () => {
  it("keeps each entity's profile so a single teen-skewed act can be gated", async () => {
    const { gw } = scriptedGateway((op, input) => {
      if (op !== "audience_demographics") return fullAnswer(op, input);
      const youth = input.entity === "b" ? 0.5 : -0.2;
      return okList(op, demographicsResult({ "24_and_younger": youth }, { female: 0 }));
    });
    const property = sampleProperty({
      kind: "lineup",
      entities: [
        { id: "a", name: "A", type: "artist" },
        { id: "b", name: "B", type: "artist" },
      ],
    });
    const fp = await buildFingerprint(property, testContext(gw));
    expect(fp.entityDemographics.map((d) => [d.entity.id, d.demographics.age["24_and_younger"]])).toEqual([
      ["a", -0.2],
      ["b", 0.5],
    ]);
  });
});
