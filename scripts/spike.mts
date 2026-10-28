// Live check of the Qloo data Somm depends on. Usage: npx tsx --env-file=.env.local scripts/spike.mts
// Writes raw envelopes to fixtures/qloo/ (gitignored) and prints their shapes.
import { mkdirSync, writeFileSync } from "node:fs";
import { getAgentDeps } from "@/server/agent/deps";
import { inputKey } from "@/server/qloo/canonical";
import type { QlooOp } from "@/lib/types";

const deps = getAgentDeps();
const shape = (v: unknown, depth = 0): unknown => {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `…${v.length}`] : [];
  if (v && typeof v === "object") return depth > 3 ? "{…}" : Object.fromEntries(Object.entries(v).slice(0, 12).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v;
};
async function call(op: QlooOp, input: Record<string, unknown>) {
  const env = await deps.gw.call(op, input);
  mkdirSync(`fixtures/qloo/${op}`, { recursive: true });
  writeFileSync(`fixtures/qloo/${op}/${inputKey(op, input)}.json`, JSON.stringify(env, null, 2));
  console.log(`\n## ${op} ${JSON.stringify(input).slice(0, 120)} → ${env.status} (${env.result_count ?? "?"})`, env.error ? JSON.stringify(env.error) : "");
  console.log(JSON.stringify(shape(env.results ?? env.series)).slice(0, 700));
  return env;
}
const first = (env: { results?: unknown }) => {
  const r = Array.isArray(env.results) ? env.results : ((env.results as { entities?: unknown[] })?.entities ?? []);
  return (r[0] as { entity_id?: string; id?: string })?.entity_id ?? (r[0] as { id?: string })?.id;
};

const twist = first(await call("search", { query: "This Week in Startups", types: "urn:entity:podcast", take: 5 }));
const carpenter = first(await call("search", { query: "Sabrina Carpenter", types: "urn:entity:artist", take: 5 }));
const ohtani = first(await call("search", { query: "Shohei Ohtani", types: "urn:entity:person", take: 5 }));
const celsius = first(await call("search", { query: "Celsius", types: "urn:entity:brand", take: 5 }));
await call("search", { query: "Los Angeles Dodgers", types: "urn:entity:brand", take: 5 });
await call("tags_raw", { "filter.query": "energy drinks", "feature.semantic_search": true, take: 20 });
for (const id of [twist, carpenter, ohtani].filter(Boolean) as string[]) {
  await call("recommend", { target_type: "brand", signals: [id], limit: 10 });
  await call("audience_demographics", { entity: id });
  await call("where_popular", { entity: id, within: "United States", limit: 20 });
  await call("entity_tags", { entities: [id], limit: 10 });
}
if (twist) await call("trends", { entities: [twist], entity_type: "podcast", start_date: "2026-07-27", end_date: "2026-10-26" });
if (twist && celsius) {
  await call("rank", { options: [twist], option_type: "podcast", signals: [celsius] });
  await call("insights_raw", { "filter.type": "urn:entity:brand", "filter.results.entities": [celsius], "signal.interests.entities": [twist], take: 1 });
  await call("compare_audiences", { group_a: [twist], group_b: [celsius], limit: 5 });
}
await deps.mcp.close();
process.exit(0);
