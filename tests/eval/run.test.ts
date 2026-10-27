import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/server/db";
import { createRunStore } from "@/server/agent/run-store";
import type { AgentDeps } from "@/server/agent/deps";
import { runEval, type GroundTruth, type TrapFile } from "../../eval/runner";
import { scriptedGateway, okList, entityResult } from "../helpers";
import { fakeLlm, fakeQloo } from "../agent/fakes";

const gt: GroundTruth = {
  properties: [
    {
      id: "p1",
      name: "Founders Weekly",
      type: "podcast",
      entities: [{ name: "Founders Weekly", qloo_type: "podcast" }],
      sponsors: [{ brand: "Real Sponsor", category: "software" }],
      controls: [{ brand: "Control Brand", category: "software" }],
    },
    {
      id: "p2",
      name: "Big Fest",
      type: "festival",
      entities: [{ name: "Headliner", qloo_type: "artist" }],
      sponsors: [{ brand: "Fest Sponsor", category: "beverage" }],
      controls: [{ brand: "Fest Control", category: "beverage" }],
    },
  ],
};
const traps: TrapFile = {
  traps: [
    { id: "t-excl", property: "p2", exclusives: [{ category: "beverage_soft", holder: "Coca-Cola" }], brand: "Pepsi", category: "beverage_soft", expect: { verdict: "BLOCKED" } },
    { id: "t-age", property: "p2", agePolicy: "all_ages", brand: "Beer Co", category: "beer", expect: { verdict: "BLOCKED" } },
  ],
};

describe("runEval", () => {
  it("scores every method per property and checks every trap", async () => {
    const db = openDb(join(mkdtempSync(join(tmpdir(), "somm-eval-")), "e.sqlite"));
    const qloo = scriptedGateway((op, input) => {
      if (op === "insights_raw") {
        const ids = String(input["filter.results.entities"]).split(",");
        return okList(op, ids.map((id) => entityResult(id, id, "brand", id.includes("sponsor") ? 0.9 : 0.4)));
      }
      return fakeQloo(op, input);
    });
    const deps: AgentDeps = { db, gw: qloo.gw, llm: fakeLlm().llm, store: createRunStore(db), budget: 500 };
    const out = await runEval(deps, gt, traps);
    expect(out.properties).toHaveLength(2);
    const p1 = out.properties[0];
    expect(p1.counts).toMatchObject({ sponsors: 1, controls: 1 });
    expect(p1.auc.affinity).toBe(1);
    expect(Object.keys(p1.auc).sort()).toEqual(["affinity", "llm_only", "negative_control", "popularity", "somm"]);
    expect(out.summary.mean.affinity).toBe(1);
    expect(out.traps.map((t) => [t.id, t.pass])).toEqual([
      ["t-excl", true],
      ["t-age", true],
    ]);
    expect(JSON.stringify(out.public)).not.toMatch(/0\.9|0\.4/);
  });
});
