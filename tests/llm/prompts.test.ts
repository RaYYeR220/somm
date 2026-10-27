import { describe, expect, it } from "vitest";
import { createLlm } from "@/server/llm/client";
import { OffersSchema, parseOffers, planCategories, PlanSchema } from "@/server/llm/prompts";
import type { Fingerprint } from "@/server/engine/fingerprint";
import { sampleProperty } from "../helpers";

function llmReplying(replies: string[]) {
  const prompts: string[] = [];
  const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    prompts.push(body.messages.map((m: { content: string }) => m.content).join("\n"));
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: replies.shift() } }] }));
  };
  return { llm: createLlm({ baseUrl: "https://llm.example/v1", apiKey: "k", model: "m", fetch: fetchImpl as typeof fetch }), prompts };
}

const fp: Fingerprint = {
  property: sampleProperty(),
  tags: [{ id: "t", name: "Startups", affinity: 0.9 }],
  demographics: null,
  entityDemographics: [],
  heatmap: [],
  crossDomain: {},
  momentum: null,
  facts: [],
};

describe("prompts", () => {
  it("plan rejects categories outside the catalog", () => {
    expect(PlanSchema.safeParse({ categories: ["beer", "coffee", "spaceships"], why: "x" }).success).toBe(false);
    expect(PlanSchema.safeParse({ categories: ["beer", "coffee", "auto"], why: "x" }).success).toBe(true);
  });

  it("plan prompt carries the fingerprint and the catalog", async () => {
    const { llm, prompts } = llmReplying(['{"categories":["coffee","auto","software_b2b"],"why":"founders"}']);
    const plan = await planCategories(llm, fp);
    expect(plan.categories).toEqual(["coffee", "auto", "software_b2b"]);
    expect(prompts[0]).toContain("Founders Weekly");
    expect(prompts[0]).toContain("energy_drink: Energy drinks");
  });

  it("offer parsing fills defaults and fences user text as data", async () => {
    const { llm, prompts } = llmReplying([
      '{"offers":[{"propertyName":"Night Shift","kind":"podcast","entities":[{"name":"Night Shift","type":"podcast"}]}]}',
    ]);
    const parsed = await parseOffers(llm, "Night Shift podcast, two reads per episode.");
    expect(parsed.offers[0]).toMatchObject({ askUsd: null, deliverables: null, currentSponsors: [] });
    expect(prompts[0]).toContain('"""Night Shift podcast');
  });

  it("offer schema rejects more than ten offers", () => {
    const offer = { propertyName: "x", kind: "podcast", entities: [{ name: "x", type: "podcast" }] };
    expect(OffersSchema.safeParse({ offers: Array.from({ length: 11 }, () => offer) }).success).toBe(false);
  });
});
