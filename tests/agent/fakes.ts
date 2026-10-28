import type { Envelope, QlooOp } from "@/lib/types";
import { createLlm } from "@/server/llm/client";
import { demographicsResult, empty, entityResult, heatmapPoint, isHeatmapCall, okList, trendSeries } from "../helpers";

/** A small, consistent fake taste graph for orchestrator tests. */
export function fakeQloo(op: QlooOp, input: Record<string, unknown>): Envelope {
  switch (op) {
    case "search": {
      const query = String(input.query);
      if (query === "Phoenix") {
        return okList(op, [
          { entity_id: "art-phoenix", name: "Phoenix", types: ["urn:entity:artist"], popularity: 0.8 },
          { entity_id: "art-phoenix-2", name: "Phoenix", types: ["urn:entity:artist"], popularity: 0.3 },
        ]);
      }
      if (query === "Nobody Knows This") return empty(op);
      const type = String(input.types ?? "urn:entity:podcast");
      const id = `${type.replace("urn:entity:", "")}-${query.toLowerCase().replace(/\W+/g, "-")}`;
      return okList(op, [{ entity_id: id, name: query, types: [type], popularity: 0.6 }]);
    }
    case "tags_raw":
      return okList(op, [{ id: `urn:tag:brand:${String(input["filter.query"]).replace(/\W+/g, "_")}`, name: String(input["filter.query"]), parents: [{ type: "urn:entity:brand" }] }]);
    case "entity_tags":
      return okList(op, [{ id: "urn:tag:keyword:startups", name: "Startups", affinity: 0.9 }]);
    case "audience_demographics":
      return okList(op, demographicsResult({ "24_and_younger": -0.15, "25_to_29": 0.35, "30_to_34": 0.3 }, { male: 0.2, female: -0.2 }));
    case "insights_raw":
      if (isHeatmapCall(op, input)) return okList(op, [heatmapPoint("dr5ryb", 40.74, -73.87, 0.99), heatmapPoint("9q8yyk", 37.77, -122.42, 0.96)]);
      return empty(op);
    case "trends":
      return { ...okList(op, []), series: [trendSeries("x", [900, 880, 850, 830])] };
    case "recommend": {
      if (input.target_type === "brand") {
        const tag = String((input.include_tags as string[] | undefined)?.[0] ?? "any");
        return okList(op, [
          entityResult(`brand-a-${tag}`, `Alpha ${tag.split(":").pop()}`, "brand", 0.97),
          entityResult(`brand-b-${tag}`, `Beta ${tag.split(":").pop()}`, "brand", 0.93),
          entityResult(`brand-c-${tag}`, `Gamma ${tag.split(":").pop()}`, "brand", 0.88),
          entityResult(`brand-d-${tag}`, `Delta ${tag.split(":").pop()}`, "brand", 0.8),
        ]);
      }
      const t = String(input.target_type);
      return okList(op, [entityResult(`${t}-1`, `First ${t}`, t, 0.9), entityResult(`${t}-2`, `Second ${t}`, t, 0.85)]);
    }
    case "rank": {
      const options = (input.options as string[]) ?? [];
      return okList(op, options.map((id, i) => entityResult(id, id, String(input.option_type), 0.9 - i * 0.05)));
    }
    default:
      return empty(op);
  }
}

/** LLM fake that answers by recognising which prompt it was sent. */
export function fakeLlm(overrides: { offers?: unknown } = {}) {
  const prompts: string[] = [];
  const fetchImpl = async (_: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const text = body.messages.map((m) => m.content).join("\n");
    prompts.push(text);
    let content: string;
    if (text.includes("Choose 4 to 8 sponsor categories")) content = JSON.stringify({ categories: ["energy_drink", "coffee", "auto"], why: "Founders run on caffeine and drive to offsites." });
    else if (text.includes("Turn this description")) content = JSON.stringify({ kind: "podcast", name: "Founders Weekly", market: "United States", entities: [{ name: "Founders Weekly", type: "podcast" }, { name: "Host One", type: "person" }] });
    else if (text.includes("Extract each sponsorship offer")) {
      content = JSON.stringify(
        overrides.offers ?? {
          offers: [
            { propertyName: "Night Shift", kind: "podcast", entities: [{ name: "Night Shift", type: "podcast" }], askUsd: 12000, currentSponsors: [] },
            { propertyName: "Rival Radio", kind: "podcast", entities: [{ name: "Rival Radio", type: "podcast" }], currentSponsors: ["Monster Energy"] },
            { propertyName: "Sneaky Show", kind: "podcast", entities: [{ name: "Sneaky Show", type: "podcast" }], currentSponsors: [] },
          ],
        },
      );
    } else if (text.includes("Write a short sponsorship pitch")) content = "## A fit worth a call\n\nThe audiences line up on age and gender [F1]. Fans like what you make.";
    else if (text.includes("activation ideas")) content = JSON.stringify({ ideas: [{ title: "Founders' coffee bar", body: "A coffee cart at the live taping.", facts: [] }] });
    else if (text.includes("Which 8 brands should sponsor")) content = JSON.stringify({ brands: [{ name: "Red Bull", category: "energy", why: "generic" }] });
    else content = "{}";
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  };
  return { llm: createLlm({ baseUrl: "https://llm.example/v1", apiKey: "k", model: "m", fetch: fetchImpl as typeof fetch }), prompts };
}
