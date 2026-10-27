"use client";

import { useMemo } from "react";
import type { ScoutResult } from "@/server/agent/scout";
import { CATEGORY_LABEL } from "@/lib/categories";
import { Chip, ScoreRing, SectionHead, Stamp } from "@/components/ui";
import { AgeChart, Sparkline } from "./charts";
import { FactLine, FactReceipts, ReportProvider, useReport } from "./context";
import { FanField } from "./fan-field";
import { FitBoard } from "./fit-board";
import { LedgerTable } from "./ledger-table";
import { PitchViewer } from "./pitch-viewer";
import { PublishKit } from "./publish-kit";

const DOMAIN_TITLE: Record<string, string> = { brand: "Brands", tv_show: "TV", podcast: "Podcasts", artist: "Music", movie: "Film", place: "Places" };

const SECTIONS = [
  ["board", "Sponsor board"],
  ["fans", "Fans"],
  ["pitches", "Pitches"],
  ["ideas", "Activations"],
  ["contrast", "Without Qloo"],
  ["receipts", "Receipts"],
] as const;

function Fingerprint({ r }: { r: ScoutResult }) {
  const { openReceipt, facts } = useReport();
  const fp = r.fingerprint;
  const heatLedger = r.ledger.find((e) => e.op === "where_popular" && e.status === "ok")?.id;
  const trendFact = fp.facts.find((f) => f.label.startsWith("90-day popularity"));
  const tagFact = fp.facts.find((f) => f.label === "Top taste tags");
  return (
    <div className="space-y-10">
      <FanField cells={fp.heatmap} ledgerId={heatLedger} onReceipt={openReceipt} market={fp.property.market} />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div>
          <h3 className="mb-4 font-semibold">Who they are</h3>
          {fp.demographics ? <AgeChart age={fp.demographics.age} gender={fp.demographics.gender} /> : <p className="text-ash">Qloo has no age or gender profile for this audience.</p>}
          {fp.entityDemographics.length > 0 && (
            <p className="mt-3 text-xs text-smoke">
              Averaged over {fp.entityDemographics.map((d) => d.entity.name).join(", ")}
              {fp.entityDemographics.map((d) => (
                <FactReceiptsForLedger key={d.ledgerId} id={d.ledgerId} />
              ))}
            </p>
          )}
        </div>
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 font-semibold">What they&apos;re into</h3>
            <div className="flex flex-wrap gap-2">
              {fp.tags.slice(0, 12).map((t) => (
                <Chip key={t.id}>{t.name}</Chip>
              ))}
              {fp.tags.length === 0 && <p className="text-ash">No taste tags returned.</p>}
            </div>
            {tagFact && <FactReceipts factId={tagFact.id} />}
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Momentum</h3>
            {fp.momentum ? <Sparkline points={fp.momentum.points} /> : <p className="text-ash">No trend data for this property.</p>}
            {trendFact && <FactReceipts factId={trendFact.id} />}
          </div>
        </div>
        <div>
          <h3 className="mb-3 font-semibold">What else these fans love</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {Object.entries(fp.crossDomain).map(([domain, items]) => (
              <div key={domain}>
                <p className="mb-1.5 text-xs text-smoke">{DOMAIN_TITLE[domain] ?? domain}</p>
                <ol className="space-y-1 text-sm">
                  {(items ?? []).slice(0, 5).map((item) => (
                    <li key={item.entity.id} className="flex items-baseline gap-2">
                      <span className="w-4 text-right text-xs text-smoke tabular">{item.rank}</span>
                      <span className="truncate text-bone" title={facts.get(item.facts[0])?.display}>
                        {item.entity.name}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FactReceiptsForLedger({ id }: { id: string }) {
  const { openReceipt } = useReport();
  return (
    <button type="button" onClick={() => openReceipt(id)} className="ml-1 font-mono text-[10.5px] text-ember-hi hover:underline">
      {id}
    </button>
  );
}

function Contrast({ r }: { r: ScoutResult }) {
  const somm = r.fits.filter((f) => f.verdict === "PURSUE" || f.verdict === "CONSIDER").slice(0, 8);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sommNames = new Set(somm.map((f) => norm(f.brand.name)));
  if (r.baseline.brands.length === 0) return <p className="text-ash">The comparison model was not available for this run.</p>;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-sm border border-line p-5">
        <p className="font-semibold">A language model alone</p>
        <p className="mb-4 text-sm text-ash">Asked the same question with no Qloo data. It answers from general knowledge.</p>
        <ol className="space-y-2.5">
          {r.baseline.brands.slice(0, 8).map((b) => (
            <li key={b.name} className="text-sm">
              <span className={sommNames.has(norm(b.name)) ? "text-bone" : "text-ash"}>{b.name}</span>
              <span className="block text-xs text-smoke">{b.why}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-sm border border-ember/50 bg-[var(--ember-wash)] p-5">
        <p className="font-semibold">Somm, with Qloo</p>
        <p className="mb-4 text-sm text-ash">Brands these fans measurably over-index for, scored and gated.</p>
        <ol className="space-y-2.5">
          {somm.map((f, i) => (
            <li key={`${f.brand.id}-${i}`} className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="text-bone">{f.brand.name}</span>
                <span className="block text-xs text-smoke">{CATEGORY_LABEL[f.category] ?? f.category}</span>
              </span>
              <span className="tabular font-display text-lg">{f.score}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function ScoutReport({ runId, result, mine }: { runId: string; result: ScoutResult; mine: boolean }) {
  const r = result;
  const best = r.fits.find((f) => f.verdict === "PURSUE") ?? r.fits.find((f) => f.verdict === "CONSIDER");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of r.fits) c[f.verdict] = (c[f.verdict] ?? 0) + 1;
    return c;
  }, [r.fits]);
  const ideas = r.ideas ?? [];
  return (
    <ReportProvider facts={r.facts} ledger={r.ledger}>
      <header className="rise grid grid-cols-1 gap-8 border-b border-line pb-10 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <p className="text-sm text-ash">Sponsor report for a {r.property.kind === "lineup" ? "festival lineup" : r.property.kind}</p>
          <h1 className="display mt-3 text-[clamp(44px,7vw,96px)]">{r.property.name}</h1>
          <div className="mt-5 flex flex-wrap gap-2">
            {r.property.entities.map((e) => (
              <Chip key={e.id}>{e.name}</Chip>
            ))}
          </div>
          <p className="mt-5 text-sm text-ash tabular">
            {r.stats.qlooCalls} Qloo requests, {r.facts.length} facts, {(r.stats.durationMs / 1000).toFixed(0)} seconds. Market: {r.property.market}.
          </p>
        </div>
        {best && (
          <div className="rounded-sm border border-line-strong bg-raised/70 p-6">
            <p className="text-sm text-ash">The pairing</p>
            <div className="mt-3 flex items-center gap-5">
              <ScoreRing score={best.score} verdict={best.verdict} size={76} />
              <div className="min-w-0">
                <p className="display text-[28px] sm:text-[34px]">{best.brand.name}</p>
                <p className="text-sm text-ash">{CATEGORY_LABEL[best.category] ?? best.category}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <Stamp verdict={best.verdict} size="sm" />
              <span className="text-ash tabular">
                {counts.PURSUE ?? 0} to pursue, {counts.CONSIDER ?? 0} to consider, {counts.BLOCKED ?? 0} blocked
              </span>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-ash">
              {best.components.affinity.facts.slice(0, 1).concat(best.components.demographic.facts.slice(0, 1)).map((id) => (
                <li key={id}>
                  <FactLine factId={id} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <nav aria-label="Report sections" className="sticky top-14 z-40 -mx-4 mb-10 overflow-x-auto border-b border-line bg-ground/90 px-4 backdrop-blur-md [scrollbar-width:none] sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-1 py-2 text-sm">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-ash hover:bg-raised hover:text-bone">
              {label}
            </a>
          ))}
          <span className="ml-auto pl-4">{mine && <PublishKit runId={runId} defaultTitle={`${r.property.name} sponsorship kit`} />}</span>
        </div>
      </nav>

      <section className="mb-20">
        <SectionHead id="board" title="Sponsor board" note={`${r.plan.source === "planner" ? r.plan.why : "Default categories for this kind of property."} Blocked brands stay on the board with the reason.`} />
        <FitBoard fits={r.fits} />
        {r.existingPartners.length > 0 && (
          <p className="mt-6 text-sm text-ash">
            Already partners, left out of prospecting: {r.existingPartners.map((p) => p.entity.name).join(", ")}.
          </p>
        )}
      </section>

      <section className="mb-20">
        <SectionHead id="fans" title="Who the fans are" note="Qloo's aggregate taste signal for the audience of these entities. Hover the map; open any receipt." />
        <Fingerprint r={r} />
      </section>

      <section className="mb-20">
        <SectionHead id="pitches" title="Pitches with receipts" note="Written by the agent from Qloo facts only. A claim Somm can't back is struck before it can leave the building." />
        <PitchViewer pitches={r.pitches} propertyName={r.property.name} />
      </section>

      <section className="mb-20">
        <SectionHead id="ideas" title="Activation ideas" note="Grounded in what these fans also love. Same claim check as the pitches." />
        {ideas.length === 0 ? (
          <p className="text-ash">No activation ideas for this run.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ideas.slice(0, 6).map((idea, i) => (
              <div key={i} className="rounded-sm border border-line p-5">
                <p className="text-xs text-smoke">{idea.brand.name}</p>
                <p className="mt-1 font-semibold text-bone">{idea.title}</p>
                <p className="mt-2 text-sm text-ash">
                  {idea.check.segments.map((s, j) => (
                    <span key={j} className={s.status === "struck" ? "claim-struck" : undefined} title={s.reason}>
                      {s.text.replace(/\[F\d+\]/g, "")}{" "}
                    </span>
                  ))}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-20">
        <SectionHead id="contrast" title="Without Qloo" note="The same question put to a language model with no taste data. Shared picks are highlighted on the left." />
        <Contrast r={r} />
      </section>

      <section>
        <SectionHead id="receipts" title="Every request behind this report" note="Each line is one call to Qloo, through the official MCP server or the API. Identical calls are served from cache." />
        <LedgerTable ledger={r.ledger} />
      </section>
    </ReportProvider>
  );
}
