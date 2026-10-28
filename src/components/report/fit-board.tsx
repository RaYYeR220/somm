"use client";

import { useMemo, useState } from "react";
import type { FitComponent, FitResult, Verdict } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/categories";
import { ScoreRing, Stamp, VERDICT_STYLE, cx } from "@/components/ui";
import { Drawer } from "./drawer";
import { FactLine } from "./context";

const ORDER: Verdict[] = ["PURSUE", "CONSIDER", "PASS", "BLOCKED", "INSUFFICIENT_EVIDENCE"];

export const COMPONENT_COPY: Record<FitComponent, { name: string; question: string }> = {
  affinity: { name: "Fan affinity", question: "How strongly do this audience's fans over-index for the brand, against the category's other brands?" },
  reciprocity: { name: "Love back", question: "Do the brand's own fans like the property too?" },
  demographic: { name: "Who they are", question: "How closely do the two audiences match on age and gender lean?" },
  geo: { name: "Where they are", question: "Do the brand's strongest areas overlap with where these fans concentrate?" },
  momentum: { name: "Momentum", question: "Is the property's popularity rank rising over the latest weeks Qloo reports?" },
};

const WEIGHT: Record<FitComponent, number> = { affinity: 35, reciprocity: 20, demographic: 20, geo: 15, momentum: 10 };

const GATE_NAME: Record<string, string> = { exclusivity: "Category exclusivity", competitor: "Competitor conflict", age_restricted: "Age-restricted category", evidence: "Evidence threshold" };

export function FitDetail({ fit }: { fit: FitResult }) {
  return (
    <div className="space-y-7">
      <div className="flex items-center gap-5">
        <ScoreRing score={fit.score} verdict={fit.verdict} size={84} />
        <div className="space-y-2">
          <Stamp verdict={fit.verdict} />
          <p className="text-sm text-ash">{fit.score === null ? "Somm shows no score: fewer than three independent Qloo signals." : `Weighted from the parts below. Missing parts are left out, not guessed.`}</p>
        </div>
      </div>
      {fit.reasons.length > 0 && (
        <ul className="space-y-2">
          {fit.reasons.map((r) => (
            <li key={r} className={cx("border-l-2 pl-3 text-sm", fit.verdict === "BLOCKED" ? "border-signal text-bone" : "border-sand text-bone")}>
              {r}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-5">
        {(Object.keys(COMPONENT_COPY) as FitComponent[]).map((name) => {
          const part = fit.components[name];
          return (
            <div key={name}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">
                  {COMPONENT_COPY[name].name} <span className="text-xs font-normal text-smoke">weight {WEIGHT[name]}%</span>
                </p>
                <span className="tabular font-display text-xl">{part.score ?? "–"}</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-well">
                {part.score !== null && <div className="h-full bg-ember" style={{ width: `${part.score}%` }} />}
              </div>
              <p className="mt-1.5 text-xs text-smoke">{COMPONENT_COPY[name].question}</p>
              <ul className="mt-1 space-y-1 text-sm text-ash">
                {part.score === null && <li className="text-smoke">Qloo returned no data for this part.</li>}
                {part.facts.map((id) => (
                  <li key={id}>
                    <FactLine factId={id} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {fit.gates && (
        <div>
          <p className="mb-2 font-semibold">Gates, checked in code</p>
          <ul className="space-y-2 text-sm">
            {fit.gates.map((g) => (
              <li key={g.gate} className="grid grid-cols-[64px_1fr] gap-3">
                <span className={cx("font-mono text-xs uppercase", g.outcome === "block" ? "text-signal" : g.outcome === "review" ? "text-sand" : "text-ember")}>{g.outcome}</span>
                <span>
                  <span className="text-bone">{GATE_NAME[g.gate] ?? g.gate}.</span> <span className="text-ash">{g.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FitCard({ fit, onOpen }: { fit: FitResult; onOpen: () => void }) {
  const style = VERDICT_STYLE[fit.verdict];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "group flex w-full items-center gap-4 rounded-sm border p-4 text-left transition-colors hover:border-bone/40",
        fit.verdict === "BLOCKED" ? "border-signal/50" : "border-line-strong",
        style.wash,
      )}
    >
      <ScoreRing score={fit.score} verdict={fit.verdict} size={52} />
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-[17px] font-semibold", fit.verdict === "BLOCKED" && "line-through decoration-signal decoration-2")}>{fit.brand.name}</span>
        <span className="block truncate text-sm text-ash">{CATEGORY_LABEL[fit.category] ?? fit.category}</span>
        {fit.reasons[0] && <span className="mt-1 line-clamp-2 block text-xs text-smoke">{fit.reasons[0]}</span>}
      </span>
      <span className="text-sm text-smoke group-hover:text-bone">Why</span>
    </button>
  );
}

/** Every scored brand, grouped by verdict; refusals sit on the same board as the wins. */
export function FitBoard({ fits }: { fits: FitResult[] }) {
  const [open, setOpen] = useState<FitResult | null>(null);
  const groups = useMemo(() => ORDER.map((v) => ({ verdict: v, fits: fits.filter((f) => f.verdict === v) })).filter((g) => g.fits.length), [fits]);
  if (fits.length === 0) return <p className="text-ash">No brands were scored. Try different categories or add more entities that represent the audience.</p>;
  return (
    <div className="space-y-10">
      {groups.map((g) => (
        <div key={g.verdict}>
          <div className="mb-3 flex items-center gap-3">
            <Stamp verdict={g.verdict} size="sm" />
            <span className="text-sm text-ash tabular">{g.fits.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.fits.map((fit) => (
              <FitCard key={`${fit.brand.id}-${fit.category}-${fit.score}`} fit={fit} onOpen={() => setOpen(fit)} />
            ))}
          </div>
        </div>
      ))}
      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={
          open && (
            <div>
              <p className="text-sm text-ash">{CATEGORY_LABEL[open.category] ?? open.category}</p>
              <h3 className="display mt-1 text-3xl">{open.brand.name}</h3>
            </div>
          )
        }
      >
        {open && <FitDetail fit={open} />}
      </Drawer>
    </div>
  );
}
