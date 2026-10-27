import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlm, LlmSchemaError } from "@/server/llm/client";

type Body = { messages: { role: string; content: string }[]; tools?: unknown[]; response_format?: unknown };

function fakeLlm(replies: unknown[]) {
  const bodies: Body[] = [];
  const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = replies.shift();
    const message = typeof next === "string" ? { role: "assistant", content: next } : next;
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
  };
  const llm = createLlm({ baseUrl: "https://llm.example/v1", apiKey: "k", model: "m", fetch: fetchImpl as typeof fetch });
  return { llm, bodies };
}

const Schema = z.object({ categories: z.array(z.string()).min(1) });

describe("llm client", () => {
  it("parses JSON, including fenced JSON", async () => {
    const { llm, bodies } = fakeLlm(['```json\n{"categories":["beer"]}\n```']);
    expect(await llm.json(Schema, [{ role: "user", content: "hi" }])).toEqual({ categories: ["beer"] });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
  });

  it("repairs once with the validation error, then succeeds", async () => {
    const { llm, bodies } = fakeLlm(['{"categories":[]}', '{"categories":["coffee"]}']);
    expect(await llm.json(Schema, [{ role: "user", content: "hi" }])).toEqual({ categories: ["coffee"] });
    expect(bodies[1].messages.at(-1)?.content).toMatch(/did not match/i);
  });

  it("throws LlmSchemaError after a failed repair", async () => {
    const { llm } = fakeLlm(["not json", '{"nope":1}']);
    await expect(llm.json(Schema, [{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("runs a tool loop and returns the final answer", async () => {
    const { llm, bodies } = fakeLlm([
      { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "get_fact", arguments: '{"id":"F1"}' } }] },
      "Liquid Death ranks second [F1].",
    ]);
    const seen: unknown[] = [];
    const answer = await llm.tools(
      [{ role: "user", content: "why?" }],
      [{ name: "get_fact", description: "Look up a fact", parameters: { type: "object", properties: { id: { type: "string" } } } }],
      async (name, args) => {
        seen.push([name, args]);
        return { id: "F1", display: "#2 of 10" };
      },
    );
    expect(answer).toBe("Liquid Death ranks second [F1].");
    expect(seen).toEqual([["get_fact", { id: "F1" }]]);
    expect(bodies[1].messages.find((m) => m.role === "tool")?.content).toContain("#2 of 10");
  });

  it("reports not configured without a key", () => {
    const llm = createLlm({ baseUrl: "https://llm.example/v1", apiKey: "", model: "m" });
    expect(llm.ready).toBe(false);
  });
});
