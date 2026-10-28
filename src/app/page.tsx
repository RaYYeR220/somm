import Link from "next/link";
import { AsciiGlass, type StampLine } from "@/components/ascii-glass";
import { ButtonLink, Stamp } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/categories";
import { getAgentDeps } from "@/server/agent/deps";
import type { DiligenceResult } from "@/server/agent/diligence";
import type { RunRecord } from "@/server/agent/run-store";
import type { ScoutResult } from "@/server/agent/scout";
import evalSummary from "@/data/eval-summary.json";

export const dynamic = "force-dynamic";

type EvalSummary = { status: string; summary?: { mean: Record<string, number | null>; traps: { passed: number; total: number } } };

/** First sentence of a gate reason, without the bracketed figures; a decimal point is not a sentence end. */
function stampReason(reason: string | undefined): string {
  if (!reason) return "gate";
  const first = reason.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? reason;
  return first.replace(/\s*\([^)]*\)/g, "").replace(/[.!?]$/, "");
}

function stampsFrom(runs: RunRecord[]): StampLine[] {
  const lines: StampLine[] = [];
  for (const run of runs) {
    if (run.kind === "scout") {
      const r = run.result as ScoutResult | null;
      if (!r) continue;
      const pick = r.fits.find((f) => f.verdict === "PURSUE");
      const block = r.fits.find((f) => f.verdict === "BLOCKED");
      if (pick) lines.push({ verdict: "PURSUE", line: `${pick.brand.name} for ${r.property.name}, fit ${pick.score}` });
      if (block) lines.push({ verdict: "BLOCKED", line: `${block.brand.name} for ${r.property.name}: ${stampReason(block.reasons[0])}` });
    } else {
      const r = run.result as DiligenceResult | null;
      for (const o of r?.offers ?? []) {
        if (o.fit?.verdict === "CONSIDER" || o.fit?.verdict === "PASS") lines.push({ verdict: o.fit.verdict, line: `${o.offer.propertyName} for ${r!.brand.name}, fit ${o.fit.score}` });
      }
    }
  }
  return lines.slice(0, 8);
}

/** The example report whose board shows the most kinds of verdict, so the first click shows Somm saying no too. */
function showcase(runs: RunRecord[]): RunRecord | undefined {
  const variety = (run: RunRecord) => new Set((run.result as ScoutResult | null)?.fits.map((f) => f.verdict)).size;
  return runs.filter((r) => r.kind === "scout").reduce<RunRecord | undefined>((best, run) => (!best || variety(run) > variety(best) ? run : best), undefined);
}

export default function Home() {
  const demos = getAgentDeps().store.listDemo();
  const stamps = stampsFrom(demos);
  const firstScout = showcase(demos);
  const ev = evalSummary as EvalSummary;
  return (
    <>
      <section className="grid-ground relative overflow-hidden border-b border-line">
        <div className="mx-auto grid grid-cols-1 max-w-[1320px] items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-20">
          <div className="rise">
            <h1 className="display text-[clamp(56px,9vw,124px)]">
              Agents,
              <br />
              but with taste.
            </h1>
            <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-ash">
              Somm is a sponsorship agent. It reads Qloo&apos;s cultural taste graph to find the brands a podcast, tour or team&apos;s fans already love, says no to the deals it can&apos;t prove, and shows the receipt for every number.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <ButtonLink href={firstScout ? `/report/${firstScout.id}` : "/scout"} size="lg">
                {firstScout ? "Open a live report" : "Read my fans"}
              </ButtonLink>
              <ButtonLink href="/diligence" tone="quiet">
                For brands: vet an offer
              </ButtonLink>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <AsciiGlass
              stamps={
                stamps.length
                  ? stamps
                  : [
                      { verdict: "PURSUE", line: "sample: an energy drink for a founders podcast" },
                      { verdict: "BLOCKED", line: "sample: a beer brand for a teen-skewed audience" },
                    ]
              }
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
        <h2 className="display max-w-3xl text-[clamp(32px,4vw,56px)]">How Somm decides</h2>
        <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          {[
            ["Reads the fans", "It turns your show, lineup or roster into Qloo entities and builds a fingerprint: who the fans are, where they live, what else they love across music, TV, podcasts and brands."],
            ["Pairs the brands", "For each sponsor category it finds the brands those fans over-index for, then scores each one from five Qloo signals: affinity, love back, age and gender match, geography and momentum."],
            ["Refuses what it can't prove", "Code, not the model, blocks category conflicts and age-restricted deals it can't clear. Pitches are claim-checked: any number without a Qloo receipt is struck before it ships."],
          ].map(([title, body], i) => (
            <li key={title} className="border-t border-line-strong pt-5">
              <span className="font-mono text-sm text-ember">{i + 1}</span>
              <h3 className="mt-2 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-ash">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {demos.length > 0 && (
        <section className="border-y border-line bg-raised/40">
          <div className="mx-auto max-w-[1320px] px-4 py-20 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="display text-[clamp(32px,4vw,56px)]">Live reports</h2>
              <Link href="/reports" className="text-sm text-ash underline underline-offset-4 hover:text-bone">
                All reports
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {demos.slice(0, 6).map((run) => {
                const scout = run.kind === "scout" ? (run.result as ScoutResult) : null;
                const dil = run.kind === "diligence" ? (run.result as DiligenceResult) : null;
                const top = scout?.fits.filter((f) => f.verdict === "PURSUE").slice(0, 3) ?? [];
                return (
                  <Link key={run.id} href={`/report/${run.id}`} className="group flex flex-col rounded-sm border border-line-strong bg-ground p-6 hover:border-bone/40">
                    <p className="text-xs text-smoke">{scout ? "Who should sponsor" : "Which offers to take"}</p>
                    <p className="display mt-2 text-[34px] group-hover:text-ember-hi">{scout?.property.name ?? dil?.brand.name}</p>
                    <ul className="mt-5 space-y-2 text-sm">
                      {top.map((f) => (
                        <li key={f.brand.id} className="flex items-center justify-between gap-3">
                          <span className="text-bone">
                            {f.brand.name} <span className="text-smoke">{CATEGORY_LABEL[f.category]}</span>
                          </span>
                          <span className="tabular font-display">{f.score}</span>
                        </li>
                      ))}
                      {dil?.offers.slice(0, 4).map((o) => (
                        <li key={o.offer.propertyName} className="flex items-center justify-between gap-3">
                          <span className="text-bone">{o.offer.propertyName}</span>
                          <Stamp verdict={o.fit?.verdict ?? "INSUFFICIENT_EVIDENCE"} size="sm" />
                        </li>
                      ))}
                    </ul>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto grid grid-cols-1 max-w-[1320px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="display text-[clamp(32px,4vw,56px)]">Checked against real deals</h2>
          <p className="mt-5 max-w-xl text-ash">
            We tested Somm on 202 real sponsorships across 24 podcasts, festivals and teams, with the method fixed before the first run. What we found: today&apos;s sponsors are no better matched to their fans than brands in the same category that didn&apos;t sign. Sponsorship money isn&apos;t following taste yet.
          </p>
          <ButtonLink href="/proof" tone="quiet" className="mt-6">
            Read the results, including what Somm can&apos;t do
          </ButtonLink>
        </div>
        <dl className="grid grid-cols-2 gap-px self-start border border-line bg-line">
          <div className="bg-ground p-6">
            <dt className="text-sm text-ash">Real sponsorships checked</dt>
            <dd className="display mt-2 text-5xl tabular">202</dd>
          </div>
          <div className="bg-ground p-6">
            <dt className="text-sm text-ash">Today&apos;s sponsors vs fan fit, AUC (0.5 is a coin flip)</dt>
            <dd className="display mt-2 text-5xl tabular text-ash">{ev.summary?.mean.somm != null ? ev.summary.mean.somm.toFixed(2) : "soon"}</dd>
          </div>
          <div className="bg-ground p-6">
            <dt className="text-sm text-ash">Gate traps caught</dt>
            <dd className="display mt-2 text-5xl tabular">{ev.summary ? `${ev.summary.traps.passed}/${ev.summary.traps.total}` : "soon"}</dd>
          </div>
          <div className="bg-ground p-6">
            <dt className="text-sm text-ash">Numbers without a receipt</dt>
            <dd className="display mt-2 text-5xl tabular">0</dd>
          </div>
        </dl>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid grid-cols-1 max-w-[1320px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="display text-[clamp(32px,4vw,56px)]">Your agent can ask too</h2>
            <p className="mt-5 max-w-xl text-ash">
              Somm runs on Qloo&apos;s official MCP server and exposes its own: fan fingerprints, sponsor prospects, fit scores and offer reviews, each with receipts and a link to the full report.
            </p>
            <ButtonLink href="/developers" tone="quiet" className="mt-6">
              Connect over MCP or HTTP
            </ButtonLink>
          </div>
          <pre className="overflow-x-auto rounded-sm border border-line bg-well p-5 font-mono text-[13px] leading-6 text-ash">
            <span className="text-smoke">{"// any MCP client"}</span>
            {"\n"}
            {`{ "mcpServers": { "somm": { "url": "${process.env.PUBLIC_URL ?? "https://somm.example"}/mcp" } } }`}
            {"\n\n"}
            <span className="text-smoke">{"// then ask"}</span>
            {"\n"}
            <span className="text-bone">fit_score</span>
            {`({ property_name: "This Week in Startups", brand: "Celsius", category: "energy_drink" })`}
          </pre>
        </div>
      </section>
    </>
  );
}
