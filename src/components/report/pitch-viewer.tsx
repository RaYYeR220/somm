"use client";

import { useMemo, useState } from "react";
import type { ClaimCheck, ClaimSegment } from "@/server/engine/claims";
import type { EntityRef, Verdict } from "@/lib/types";
import { Button, Stamp, cx } from "@/components/ui";
import { FactReceipts } from "./context";

type PitchView = { brand: EntityRef; verdict: Verdict; check: ClaimCheck };

function SegmentText({ segment }: { segment: ClaimSegment }) {
  const parts = segment.text.split(/(\[F\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(F\d+)\]$/);
        if (m) return segment.status === "kept" ? <FactReceipts key={i} factId={m[1]} /> : null;
        return <span key={i}>{part.replace(/^## /, "")}</span>;
      })}
    </>
  );
}

export function PitchBody({ check, showStruck }: { check: ClaimCheck; showStruck: boolean }) {
  const lines = useMemo(() => {
    const byLine = new Map<number, ClaimSegment[]>();
    for (const s of check.segments) byLine.set(s.line, [...(byLine.get(s.line) ?? []), s]);
    return [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, segs]) => segs);
  }, [check]);
  return (
    <div className="space-y-3 text-[16px] leading-relaxed">
      {lines.map((segs, i) => {
        const prefix = segs[0].prefix.trim();
        const visible = segs.filter((s) => showStruck || s.status === "kept");
        if (visible.length === 0) return null;
        const content = visible.map((s, j) => (
          <span key={j} className={s.status === "struck" ? "claim-struck" : undefined} title={s.reason}>
            <SegmentText segment={s} />{" "}
          </span>
        ));
        if (prefix.startsWith("#")) return <h4 key={i} className="display text-2xl text-bone">{content}</h4>;
        if (prefix === "-" || prefix === "*") return <p key={i} className="grid grid-cols-[16px_1fr] text-ash"><span className="text-ember">–</span><span>{content}</span></p>;
        return <p key={i} className="text-bone/90">{content}</p>;
      })}
    </div>
  );
}

/** Evidence-bound pitches: struck claims stay visible on screen with the reason, and never leave in an export. */
export function PitchViewer({ pitches, propertyName }: { pitches: PitchView[]; propertyName: string }) {
  const [active, setActive] = useState(0);
  const [showStruck, setShowStruck] = useState(true);
  const [copied, setCopied] = useState(false);
  if (pitches.length === 0) return <p className="text-ash">No pitches yet: Somm writes them only for brands it rates Pursue or Consider.</p>;
  const pitch = pitches[Math.min(active, pitches.length - 1)];
  const struck = pitch.check.segments.filter((s) => s.status === "struck");
  const download = () => {
    const blob = new Blob([pitch.check.keptMarkdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${propertyName} x ${pitch.brand.name}.md`.replace(/[^\w .-]+/g, "");
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div role="tablist" aria-label="Pitches" className="flex gap-2 overflow-x-auto lg:flex-col">
        {pitches.map((p, i) => (
          <button
            key={`${p.brand.id}-${i}`}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cx("flex items-center justify-between gap-3 whitespace-nowrap rounded-sm border px-3 py-2 text-left text-sm", i === active ? "border-ember bg-[var(--ember-wash)] text-bone" : "border-line text-ash hover:text-bone")}
          >
            {p.brand.name}
            <span className="text-xs text-smoke tabular">{p.check.struckCount ? `${p.check.struckCount} struck` : "clean"}</span>
          </button>
        ))}
      </div>
      <article className="rounded-sm border border-line bg-raised/60 p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Stamp verdict={pitch.verdict} size="sm" />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 text-ash">
              <input type="checkbox" checked={showStruck} onChange={(e) => setShowStruck(e.target.checked)} className="accent-[var(--ember)]" />
              Show struck claims
            </label>
            <Button
              tone="quiet"
              onClick={async () => {
                await navigator.clipboard.writeText(pitch.check.keptMarkdown);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? "Copied" : "Copy pitch"}
            </Button>
            <Button tone="quiet" onClick={download}>
              Download
            </Button>
          </div>
        </div>
        <PitchBody check={pitch.check} showStruck={showStruck} />
        {struck.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-semibold text-signal">Somm struck {struck.length === 1 ? "one claim" : `${struck.length} claims`} it could not back with Qloo data</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {struck.map((s, i) => (
                <li key={i} className="text-ash">
                  <span className="claim-struck">{s.text.replace(/\[F\d+\]/g, "").replace(/^## /, "")}</span> <span className="text-smoke">— {s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-6 text-xs text-smoke">Copy and download include only the kept text, with numbered sources for every figure.</p>
      </article>
    </div>
  );
}
