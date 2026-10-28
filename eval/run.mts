// Usage: npx tsx --env-file=.env.local eval/run.mts
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAgentDeps } from "@/server/agent/deps";
import { METHODS, runEval, type GroundTruth, type TrapFile } from "./runner";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const spec = read("./spec.md");
const gtText = read("./ground-truth.json");
const trapText = read("./traps.json");
for (const [name, text] of [["ground-truth.json", gtText], ["traps.json", trapText]] as const) {
  if (!spec.includes(sha(text))) {
    console.error(`${name} does not match the hash registered in eval/spec.md; refusing to run.`);
    process.exit(1);
  }
}

const deps = getAgentDeps();
const out = await runEval(deps, JSON.parse(gtText) as GroundTruth, JSON.parse(trapText) as TrapFile, (line) => console.log(line));
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
writeFileSync(new URL("./out/detail.json", import.meta.url), JSON.stringify(out, null, 2));
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(out.public, null, 2) + "\n");
// The site's proof page reads this aggregate copy.
writeFileSync(
  new URL("../src/data/eval-summary.json", import.meta.url),
  JSON.stringify({ status: "done", generatedAt: out.public.generatedAt, summary: out.summary, properties: out.public.properties, traps: out.traps }, null, 2) + "\n",
);

const pct = (v: number | null) => (v === null ? "–" : v.toFixed(2));
const label: Record<(typeof METHODS)[number], string> = {
  somm: "Somm Fit Score",
  affinity: "Qloo affinity only",
  popularity: "Popularity only",
  llm_only: "Model only (no Qloo)",
  negative_control: "Negative control",
};
const lines = [
  "# Eval results",
  "",
  `Run ${out.public.generatedAt}. Method and success criteria were registered in advance in [eval/spec.md](eval/spec.md).`,
  "",
  "| Method | Mean AUC | Podcasts | Festivals | Teams | Properties won |",
  "| --- | --- | --- | --- | --- | --- |",
  ...METHODS.map((m) => `| ${label[m]} | ${pct(out.summary.mean[m])} | ${pct(out.summary.byType.podcast[m])} | ${pct(out.summary.byType.festival[m])} | ${pct(out.summary.byType.sports_team[m])} | ${out.summary.wins[m]} |`),
  "",
  `Gate traps: **${out.summary.traps.passed}/${out.summary.traps.total}** produced the expected outcome.`,
  "",
  "| Trap | Verdict | Age gate | Pass |",
  "| --- | --- | --- | --- |",
  ...out.traps.map((t) => `| ${t.id} | ${t.verdict ?? "–"} | ${t.ageGate ?? "–"} | ${t.pass ? "yes" : "**no**"} |`),
  "",
  "## Per property",
  "",
  "| Property | Type | Sponsors / controls matched | Somm | Affinity | Popularity | Model only | Negative control |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...out.public.properties.map((p) => `| ${p.name} | ${p.type} | ${p.counts.resolvedSponsors}/${p.counts.sponsors} · ${p.counts.resolvedControls}/${p.counts.controls} | ${pct(p.auc.somm)} | ${pct(p.auc.affinity)} | ${pct(p.auc.popularity)} | ${pct(p.auc.llm_only)} | ${pct(p.auc.negative_control)} |`),
  "",
];
writeFileSync(new URL("../EVAL.md", import.meta.url), lines.join("\n"));
console.log(lines.slice(4, 12).join("\n"));
await deps.mcp.close();
process.exit(0);
