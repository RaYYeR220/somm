import { describe, expect, it } from "vitest";
import { resolveEntities } from "@/server/agent/resolve";
import { okList, scriptedGateway, testContext } from "../helpers";

const person = (id: string, popularity: number | null, detail: string) => ({ entity_id: id, name: "Yoshinobu Yamamoto", types: ["urn:entity:person"], popularity, disambiguation: detail });

describe("resolveEntities", () => {
  it("takes the clearly most popular namesake without asking", async () => {
    const { gw } = scriptedGateway((op) => okList(op, [person("pitcher", 0.84, "1998"), person("other", null, "1943"), person("third", 0.2, "1960")]));
    const out = await resolveEntities([{ name: "Yoshinobu Yamamoto", type: "person" }], testContext(gw));
    expect(out.resolved.map((e) => e.id)).toEqual(["pitcher"]);
    expect(out.pending).toHaveLength(0);
  });

  it("still asks when two namesakes are similarly popular", async () => {
    const { gw } = scriptedGateway((op) => okList(op, [person("a", 0.8, "band"), person("b", 0.75, "city")]));
    const out = await resolveEntities([{ name: "Yoshinobu Yamamoto", type: "person" }], testContext(gw));
    expect(out.pending[0].candidates.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
