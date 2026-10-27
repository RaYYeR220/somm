"use client";

import { useState } from "react";
import type { DiligenceResult, OfferReview } from "@/server/agent/diligence";
import { CATEGORY_LABEL } from "@/lib/categories";
import { Chip, ScoreRing, SectionHead, Stamp, cx } from "@/components/ui";
import { FactReceipts, ReportProvider } from "./context";
import { Drawer } from "./drawer";
import { FitDetail } from "./fit-board";
import { LedgerTable } from "./ledger-table";

const usd = (n: number | null) => (n === null ? null : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

function OfferCard({ review, onOpen }: { review: OfferReview; onOpen: () => void }) {
  const verdict = review.fit?.verdict ?? "INSUFFICIENT_EVIDENCE";
  return (
    <article className={cx("flex flex-col rounded-sm border p-5", verdict === "BLOCKED" ? "border-signal/60 bg-[var(--signal-wash)]" : verdict === "PURSUE" ? "border-ember/60 bg-[var(--ember-wash)]" : "border-line-strong")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-smoke">{review.offer.kind}</p>
          <h3 className={cx("display mt-1 text-[28px]", verdict === "BLOCKED" && "line-through decoration-signal decoration-2")}>{review.offer.propertyName}</h3>
          <p className="mt-1 text-sm text-ash tabular">
            {usd(review.offer.askUsd) ? `Asking ${usd(review.offer.askUsd)}` : "No price stated"}
            {review.offer.deliverables ? `. ${review.offer.deliverables}` : ""}
          </p>
        </div>
        <ScoreRing score={review.fit?.score ?? null} verdict={verdict} size={60} />
      </div>
      <div className="mt-4">
        <Stamp verdict={verdict} />
      </div>
      {review.injection.flagged && (
        <div className="mt-4 rounded-sm border border-sand/60 bg-sand/5 p-3 text-sm">
          <p className="font-semibold text-sand">Instructions to the reviewer found and removed</p>
          <p className="mt-1 text-ash">
            The offer contained text aimed at an AI reviewer: <span className="claim-struck">{review.injection.spans[0]}</span>. It was stripped before the agent read the offer and did not change the score.
          </p>
        </div>
      )}
      {review.fit?.reasons.map((reason) => (
        <p key={reason} className={cx("mt-3 border-l-2 pl-3 text-sm", verdict === "BLOCKED" ? "border-signal text-bone" : "border-sand text-ash")}>
          {reason}
        </p>
      ))}
      {review.notes.filter((n) => !n.startsWith("This offer contained")).map((n) => (
        <p key={n} className="mt-3 text-sm text-smoke">
          {n}
        </p>
      ))}
      {review.fit && (
        <button type="button" onClick={onOpen} className="mt-auto pt-5 text-left text-sm text-ash underline decoration-line-strong underline-offset-4 hover:text-bone">
          See how the score was built
        </button>
      )}
    </article>
  );
}

export function DiligenceReport({ result }: { result: DiligenceResult }) {
  const r = result;
  const [open, setOpen] = useState<OfferReview | null>(null);
  const order = { PURSUE: 0, CONSIDER: 1, PASS: 2, BLOCKED: 3, INSUFFICIENT_EVIDENCE: 4 } as const;
  const offers = [...r.offers].sort((a, b) => order[a.fit?.verdict ?? "INSUFFICIENT_EVIDENCE"] - order[b.fit?.verdict ?? "INSUFFICIENT_EVIDENCE"] || (b.fit?.score ?? 0) - (a.fit?.score ?? 0));
  const memos = r.offers.filter((o) => o.memo);
  return (
    <ReportProvider facts={r.facts} ledger={r.ledger}>
      <header className="rise border-b border-line pb-10">
        <p className="text-sm text-ash">Offer review for a brand</p>
        <h1 className="display mt-3 text-[clamp(44px,7vw,96px)]">{r.brand.name}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Chip>{CATEGORY_LABEL[r.category] ?? r.category}</Chip>
          {r.competitors.map((c) => (
            <Chip key={c} className="border-signal/40">
              Competitor: {c}
            </Chip>
          ))}
        </div>
        <p className="mt-5 text-sm text-ash tabular">
          {r.offers.length} offers read, {r.stats.qlooCalls} Qloo requests, {(r.stats.durationMs / 1000).toFixed(0)} seconds.
        </p>
      </header>

      <section className="my-14">
        <SectionHead title="Verdicts" note="Each offer is scored against your brand's audience. Conflicts and age rules are enforced in code, whatever the offer says." />
        <div className="grid gap-4 md:grid-cols-2">
          {offers.map((o) => (
            <OfferCard key={o.offer.propertyName} review={o} onOpen={() => setOpen(o)} />
          ))}
        </div>
      </section>

      {memos.length > 0 && (
        <section className="mb-20">
          <SectionHead title="Decision memos" note="For the offers worth a conversation. Unbacked claims are struck." />
          <div className="grid gap-4 md:grid-cols-2">
            {memos.map((o) => (
              <article key={o.offer.propertyName} className="rounded-sm border border-line bg-raised/60 p-5 text-[15px] leading-relaxed">
                {o.memo!.check.segments.map((s, i) => (
                  <span key={i} className={s.status === "struck" ? "claim-struck" : s.prefix.trim().startsWith("#") ? "display mb-2 block text-xl text-bone" : "text-bone/90"} title={s.reason}>
                    {s.text.replace(/^## /, "").split(/(\[F\d+\])/g).map((part, j) => {
                      const m = part.match(/^\[(F\d+)\]$/);
                      return m ? (s.status === "kept" ? <FactReceipts key={j} factId={m[1]} /> : null) : <span key={j}>{part}</span>;
                    })}{" "}
                  </span>
                ))}
              </article>
            ))}
          </div>
        </section>
      )}

      {r.alternatives.length > 0 && (
        <section className="mb-20">
          <SectionHead title={`Where ${r.brand.name}'s fans already are`} note="Properties Qloo finds over-indexing with your own audience. A shortlist to approach before the offers arrive." />
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
            {(["podcast", "artist", "tv_show"] as const).map((domain) => {
              const items = r.alternatives.filter((a) => a.domain === domain);
              if (!items.length) return null;
              return (
                <div key={domain}>
                  <p className="mb-2 text-xs text-smoke">{domain === "tv_show" ? "TV" : domain === "artist" ? "Music" : "Podcasts"}</p>
                  <ol className="space-y-1.5 text-sm">
                    {items.map((a) => (
                      <li key={a.entity.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-bone">{a.entity.name}</span>
                        <FactReceipts factId={a.fact} />
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Every request behind this review" />
        <LedgerTable ledger={r.ledger} />
      </section>

      <Drawer open={Boolean(open?.fit)} onClose={() => setOpen(null)} title={open && <h3 className="display text-3xl">{open.offer.propertyName}</h3>}>
        {open?.fit && <FitDetail fit={open.fit} />}
      </Drawer>
    </ReportProvider>
  );
}
