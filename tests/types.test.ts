import { describe, expect, it } from "vitest";
import { EnvelopeSchema, PropertySchema } from "@/lib/types";

const entity = (n: number) => ({ id: `id-${n}`, name: `Artist ${n}`, type: "artist" as const });

describe("PropertySchema", () => {
  const base = { kind: "lineup", name: "Test Fest", market: "United States", exclusives: [] };

  it("rejects a property with no entities", () => {
    expect(PropertySchema.safeParse({ ...base, entities: [] }).success).toBe(false);
  });

  it("rejects a property with eleven entities", () => {
    const entities = Array.from({ length: 11 }, (_, i) => entity(i));
    expect(PropertySchema.safeParse({ ...base, entities }).success).toBe(false);
  });

  it("accepts ten entities", () => {
    const entities = Array.from({ length: 10 }, (_, i) => entity(i));
    expect(PropertySchema.safeParse({ ...base, entities }).success).toBe(true);
  });
});

describe("EnvelopeSchema", () => {
  it("parses a needs_input envelope from the harness", () => {
    const parsed = EnvelopeSchema.parse({
      schema_version: "1.0-preview.1",
      operation: "describe",
      status: "needs_input",
      summary: "Choose the intended Qloo entity.",
      resolution: { issues: [{ input: "Phoenix", kind: "ambiguous", candidates: [{ id: "a", name: "Phoenix" }] }] },
      results: [],
      execution: { transport: "direct", transport_name: "Qloo API", correlation_id: "c1", duration_ms: 12 },
    });
    expect(parsed.status).toBe("needs_input");
  });

  it("rejects an unknown status", () => {
    expect(EnvelopeSchema.safeParse({ operation: "rank", status: "great" }).success).toBe(false);
  });
});
