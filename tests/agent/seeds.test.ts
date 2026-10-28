import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/server/db";
import { createRunStore } from "@/server/agent/run-store";
import type { AgentDeps } from "@/server/agent/deps";
import { runSeeds } from "@/server/agent/seeds";
import { scriptedGateway } from "../helpers";
import { fakeLlm, fakeQloo } from "./fakes";

function deps(): AgentDeps {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "somm-seed-")), "s.sqlite"));
  return { db, gw: scriptedGateway(fakeQloo).gw, llm: fakeLlm().llm, store: createRunStore(db), budget: 200 };
}

describe("example reports", () => {
  it("builds only the examples that are missing", async () => {
    const d = deps();
    const first = await runSeeds(d);
    const demos = d.store.listDemo().length;
    expect(demos).toBeGreaterThan(0);
    expect(first).toHaveLength(demos);
    expect(await runSeeds(d)).toEqual([]);
    expect(d.store.listDemo()).toHaveLength(demos);
  });

  it("refresh rebuilds every example and retires the old copy", async () => {
    const d = deps();
    await runSeeds(d);
    const before = d.store.listDemo().map((r) => r.id);
    await runSeeds(d, () => undefined, { refresh: true });
    const after = d.store.listDemo().map((r) => r.id);
    expect(after).toHaveLength(before.length);
    expect(after.filter((id) => before.includes(id))).toEqual([]);
  });
});
