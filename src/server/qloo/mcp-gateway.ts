import { existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EnvelopeSchema, type Envelope } from "@/lib/types";
import { errorEnvelope, type QlooGateway } from "./gateway";

type McpGatewayOptions = {
  /** Path to the harness entry point; defaults to the local node_modules install. */
  bin?: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type McpGateway = QlooGateway & {
  capabilities(): Promise<unknown>;
  listTools(): Promise<{ name: string; description?: string; inputSchema: unknown }[]>;
  close(): Promise<void>;
};

export function harnessBin(): string {
  const configured = process.env.QLOO_HARNESS_BIN;
  if (configured) return configured;
  return join(process.cwd(), "node_modules", "@qloo", "qloo-harness", "dist", "bin.js");
}

type ToolResult = {
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
  isError?: boolean;
};

function textOf(result: ToolResult): string {
  return (result.content ?? []).map((part) => part.text ?? "").join("\n").trim();
}

function errorCodeFor(text: string): { code: string; retryable: boolean } {
  if (/authenticat|api key|credential/i.test(text)) return { code: "QLOO_AUTH", retryable: false };
  if (/rate limit|429/i.test(text)) return { code: "QLOO_RATE_LIMIT", retryable: true };
  if (/timed? ?out/i.test(text)) return { code: "QLOO_TIMEOUT", retryable: true };
  return { code: "QLOO_TOOL_ERROR", retryable: false };
}

export function toEnvelope(op: string, result: ToolResult): Envelope {
  const candidates: unknown[] = [result.structuredContent];
  const text = textOf(result);
  if (text.startsWith("{")) {
    try {
      candidates.push(JSON.parse(text));
    } catch {
      // not JSON; handled below
    }
  }
  for (const candidate of candidates) {
    const parsed = EnvelopeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  const { code, retryable } = errorCodeFor(text);
  return errorEnvelope(op, code, text || `${op} returned no result.`, retryable);
}

/** Talks to the official `qloo mcp` server over stdio; one long-lived child per process. */
export function createMcpGateway(options: McpGatewayOptions): McpGateway {
  const timeoutMs = options.timeoutMs ?? 45_000;
  let connecting: Promise<Client> | null = null;

  async function connect(): Promise<Client> {
    const bin = options.bin ?? harnessBin();
    if (!existsSync(/*turbopackIgnore: true*/ bin)) throw new Error(`Qloo harness not found at ${bin}`);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, "mcp"],
      env: options.env as Record<string, string>,
      stderr: "pipe",
    });
    const client = new Client({ name: "somm", version: "1.0.0" });
    transport.onclose = () => {
      connecting = null;
    };
    await client.connect(transport);
    return client;
  }

  function client(): Promise<Client> {
    if (!connecting) {
      connecting = connect().catch((error) => {
        connecting = null;
        throw error;
      });
    }
    return connecting;
  }

  async function callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    const c = await client();
    return (await c.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs, signal })) as ToolResult;
  }

  return {
    async call(op, input, ctx) {
      try {
        return toEnvelope(op, await callTool(`qloo_${op}`, input, ctx?.signal));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const timedOut = /timed? ?out/i.test(message);
        return errorEnvelope(op, timedOut ? "QLOO_TIMEOUT" : "QLOO_MCP_ERROR", message, true);
      }
    },
    async capabilities() {
      const result = await callTool("qloo_capabilities", {});
      return result.structuredContent ?? JSON.parse(textOf(result) || "{}");
    },
    async listTools() {
      const c = await client();
      return (await c.listTools()).tools;
    },
    async close() {
      const pending = connecting;
      connecting = null;
      if (pending) await (await pending).close().catch(() => undefined);
    },
  };
}
