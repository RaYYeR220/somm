import { describe, expect, it } from "vitest";
import { clientKey } from "@/server/api/rate-limit";
import { workspaceOf } from "@/server/api/handlers";
import { mcpRateLimited } from "@/server/mcp/server";

const req = (headers: Record<string, string>, body?: unknown) =>
  new Request("https://somm.test/mcp", { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) });

describe("client key", () => {
  it("uses the right-most forwarded address, which the platform proxy appended", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("ignores a spoofed left-most address", () => {
    const a = clientKey(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.9" }));
    const b = clientKey(req({ "x-forwarded-for": "8.8.8.8, 203.0.113.9" }));
    expect(a).toBe(b);
  });
});

describe("workspace cookie", () => {
  it("accepts only server-issued ids", () => {
    const id = "6c23f11a1bb1b17e3e00e1f2bdd1558d";
    expect(workspaceOf(req({ cookie: `somm_ws=${id}` }))).toBe(id);
  });

  it("never lets a chosen name like 'mcp' or 'demo' map onto shared runs", () => {
    for (const name of ["mcp", "demo", "anonymous", "mcp_abc"]) {
      expect(workspaceOf(req({ cookie: `somm_ws=${name}` }))).not.toBe(name);
    }
  });
});

describe("mcp rate limit", () => {
  it("throttles tool calls from one address but not other methods", async () => {
    const headers = { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fit_score", arguments: {} } };
    const results: boolean[] = [];
    for (let i = 0; i < 40; i++) results.push(await mcpRateLimited(req(headers, call)));
    expect(results.filter(Boolean).length).toBeGreaterThan(0);
    expect(await mcpRateLimited(req(headers, { jsonrpc: "2.0", id: 2, method: "tools/list" }))).toBe(false);
  });
});
