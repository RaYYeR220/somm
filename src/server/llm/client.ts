import type { z } from "zod";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

type LlmOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type CallOptions = { temperature?: number; maxTokens?: number; signal?: AbortSignal };

export class LlmSchemaError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
  }
}

export type Llm = {
  ready: boolean;
  model: string;
  text(messages: ChatMessage[], options?: CallOptions): Promise<string>;
  json<T>(schema: z.ZodType<T>, messages: ChatMessage[], options?: CallOptions): Promise<T>;
  tools(
    messages: ChatMessage[],
    tools: ToolSpec[],
    run: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    options?: CallOptions & { maxSteps?: number; onToolCall?: (name: string, args: unknown) => void },
  ): Promise<string>;
};

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Minimal client for any OpenAI-compatible chat-completions endpoint. */
export function createLlm(options: LlmOptions): Llm {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const vendorExtras = /venice\.ai/.test(options.baseUrl) ? { venice_parameters: { include_venice_system_prompt: false } } : {};

  async function complete(messages: ChatMessage[], extra: Record<string, unknown>, call: CallOptions = {}) {
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 90_000), ...(call.signal ? [call.signal] : [])]);
    const response = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: call.temperature ?? 0.3,
        max_tokens: call.maxTokens ?? 1800,
        ...vendorExtras,
        ...extra,
      }),
      signal,
    });
    if (!response.ok) throw new Error(`LLM request failed with HTTP ${response.status}`);
    const body = (await response.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("LLM returned no message");
    return message;
  }

  return {
    ready: Boolean(options.apiKey && options.model),
    model: options.model,
    async text(messages, call) {
      return ((await complete(messages, {}, call)).content ?? "").trim();
    },
    async json(schema, messages, call) {
      const attempt = async (msgs: ChatMessage[]) => {
        const raw = (await complete(msgs, { response_format: { type: "json_object" } }, { temperature: 0.2, ...call })).content ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(stripFence(raw));
        } catch {
          return { ok: false as const, raw, error: "The reply was not valid JSON." };
        }
        const result = schema.safeParse(parsed);
        return result.success ? { ok: true as const, value: result.data } : { ok: false as const, raw, error: result.error.message };
      };
      const first = await attempt(messages);
      if (first.ok) return first.value;
      const repair: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: first.raw },
        { role: "user", content: `That reply did not match the required JSON schema: ${first.error.slice(0, 600)}. Reply with corrected JSON only.` },
      ];
      const second = await attempt(repair);
      if (second.ok) return second.value;
      throw new LlmSchemaError(second.error, second.raw);
    },
    async tools(messages, tools, run, call = {}) {
      const transcript = [...messages];
      const specs = tools.map((t) => ({ type: "function", function: t }));
      for (let step = 0; step < (call.maxSteps ?? 8); step++) {
        const message = await complete(transcript, { tools: specs, tool_choice: "auto" }, call);
        if (!message.tool_calls?.length) return (message.content ?? "").trim();
        transcript.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
        for (const toolCall of message.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }
          call.onToolCall?.(toolCall.function.name, args);
          let result: unknown;
          try {
            result = await run(toolCall.function.name, args);
          } catch (error) {
            result = { error: error instanceof Error ? error.message : String(error) };
          }
          transcript.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result).slice(0, 12_000) });
        }
      }
      return "I ran out of steps before finishing; try a narrower question.";
    },
  };
}

let shared: Llm | null = null;

export function getLlm(): Llm {
  if (!shared) {
    shared = createLlm({
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.venice.ai/api/v1",
      apiKey: process.env.LLM_API_KEY ?? "",
      model: process.env.LLM_MODEL ?? "",
    });
  }
  return shared;
}
