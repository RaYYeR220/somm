import { getAgentDeps } from "@/server/agent/deps";
import { handleMcp } from "@/server/mcp/server";
import { createApi } from "./handlers";

const key = Symbol.for("somm.api");

export const publicUrl = () => (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** One API instance per server process (shared rate limits, shared harness child). */
export function api() {
  const holder = globalThis as unknown as Record<symbol, ReturnType<typeof createApi> | undefined>;
  holder[key] ??= createApi(getAgentDeps(), { publicUrl: publicUrl() });
  return holder[key]!;
}

export const mcp = (request: Request) => handleMcp(request, getAgentDeps(), { publicUrl: publicUrl() });
