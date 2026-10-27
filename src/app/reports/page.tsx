import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAgentDeps } from "@/server/agent/deps";
import type { DiligenceResult } from "@/server/agent/diligence";
import type { RunRecord } from "@/server/agent/run-store";
import type { ScoutResult } from "@/server/agent/scout";
import { Stamp } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function Card({ run }: { run: RunRecord }) {
  const scout = run.kind === "scout" ? (run.result as ScoutResult | null) : null;
  const dil = run.kind === "diligence" ? (run.result as DiligenceResult | null) : null;
  const title = scout?.property.name ?? (dil ? `${dil.brand.name}` : "Report in progress");
  const best = scout?.fits.find((f) => f.verdict === "PURSUE");
  const blocked = scout ? scout.fits.filter((f) => f.verdict === "BLOCKED").length : dil ? dil.offers.filter((o) => o.fit?.verdict === "BLOCKED").length : 0;
  return (
    <Link href={`/report/${run.id}`} className="group flex flex-col rounded-sm border border-line-strong p-5 hover:border-bone/40">
      <p className="text-xs text-smoke">{run.kind === "scout" ? `Sponsor report, ${scout?.property.kind === "lineup" ? "festival lineup" : scout?.property.kind ?? ""}` : `Offer review, ${dil?.offers.length ?? 0} offers`}</p>
      <p className="display mt-2 text-[30px] group-hover:text-ember-hi">{title}</p>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-sm text-ash">
        {best && (
          <>
            <Stamp verdict="PURSUE" size="sm" /> {best.brand.name} {best.score}
          </>
        )}
        {dil && dil.offers.map((o) => o.fit && <Stamp key={o.offer.propertyName} verdict={o.fit.verdict} size="sm" />)}
        {blocked > 0 && <span className="text-signal">{blocked} blocked</span>}
        {run.status !== "done" && run.status !== "degraded" && <span>{run.status}</span>}
      </div>
    </Link>
  );
}

export default async function ReportsPage() {
  const { store } = getAgentDeps();
  const ws = (await cookies()).get("somm_ws")?.value;
  const demos = store.listDemo();
  const mine = ws ? store.list(ws) : [];
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="display text-[clamp(44px,6vw,84px)]">Reports</h1>
      <p className="mt-4 max-w-2xl text-lg text-ash">Finished runs on real properties, refreshed from Qloo. Open any of them; every number links to its request.</p>
      <section className="mt-12">
        <h2 className="mb-4 font-semibold">Examples</h2>
        {demos.length === 0 ? <p className="text-ash">The example reports are being prepared.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{demos.map((r) => <Card key={r.id} run={r} />)}</div>}
      </section>
      <section className="mt-14">
        <h2 className="mb-4 font-semibold">Yours</h2>
        {mine.length === 0 ? (
          <p className="text-ash">
            Nothing yet. <Link href="/scout" className="text-ember-hi underline">Read your fans</Link> or <Link href="/diligence" className="text-ember-hi underline">vet an offer</Link>; your reports stay in this browser.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map((r) => <Card key={r.id} run={r} />)}</div>
        )}
      </section>
    </div>
  );
}
