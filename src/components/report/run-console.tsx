"use client";

import { useState } from "react";
import type { ChoiceView, ReceiptView, StepView } from "@/lib/client/use-run";
import { Button, cx } from "@/components/ui";

const STATUS_MARK: Record<StepView["status"], { mark: string; tone: string; label: string }> = {
  running: { mark: "●", tone: "text-ember live-dot", label: "working" },
  done: { mark: "✓", tone: "text-ember", label: "done" },
  empty: { mark: "○", tone: "text-smoke", label: "nothing found" },
  error: { mark: "!", tone: "text-signal", label: "failed" },
};

const OP_SHORT: Record<string, string> = {
  recommend: "recommend",
  rank: "rank shortlist",
  where_popular: "fan heatmap",
  audience_demographics: "demographics",
  entity_tags: "taste tags",
  trends: "trending",
  search: "search",
  tags_raw: "category tags",
  insights_raw: "insights",
  compare_audiences: "compare audiences",
};

function ChoicePicker({ choice, onChoose }: { choice: ChoiceView; onChoose: (input: string, id: string) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-sm border border-ember/60 bg-[var(--ember-wash)] p-4">
      <p className="font-semibold text-bone">Which &ldquo;{choice.input}&rdquo; did you mean?</p>
      <p className="mt-1 text-sm text-ash">Qloo has more than one {choice.type.replace("_", " ")} with this name. Pick one and Somm carries on.</p>
      <ul className="mt-3 space-y-2">
        {choice.candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(c.id);
                setError(null);
                try {
                  await onChoose(choice.input, c.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not continue the run.");
                  setBusy(null);
                }
              }}
              className="flex w-full items-center justify-between gap-4 rounded-sm border border-line-strong bg-well px-3 py-2 text-left hover:border-ember disabled:opacity-60"
            >
              <span>
                <span className="text-bone">{c.name}</span>
                {c.detail && <span className="ml-2 text-sm text-ash">{c.detail}</span>}
              </span>
              <span className="text-xs text-smoke tabular">{busy === c.id ? "Continuing…" : c.popularity !== null ? `popularity ${(c.popularity * 100).toFixed(0)}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-signal">{error}</p>}
    </div>
  );
}

/** The agent at work: steps on the left, the Qloo requests it makes on the right. */
export function RunConsole({
  title,
  steps,
  receipts,
  choices,
  status,
  error,
  onChoose,
}: {
  title: string;
  steps: StepView[];
  receipts: ReceiptView[];
  choices: ChoiceView[];
  status: string;
  error?: string;
  onChoose: (input: string, id: string) => Promise<void>;
}) {
  const visible = steps.filter((s) => s.key !== "budget" || s.status === "error");
  return (
    <section aria-live="polite" className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-sm border border-line bg-raised/70 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="display text-[28px]">{status === "paused" ? "Waiting for you" : "Somm is tasting"}</h2>
          <span className="text-xs text-ash">{title}</span>
        </div>
        <ol className="space-y-2.5">
          {visible.map((s) => {
            const m = STATUS_MARK[s.status];
            return (
              <li key={s.key} className="grid grid-cols-[18px_1fr] gap-3 text-[15px]" style={{ animation: "rise .4s cubic-bezier(.16,1,.3,1) both" }}>
                <span className={cx("text-center font-mono", m.tone)} aria-label={m.label}>
                  {m.mark}
                </span>
                <span>
                  <span className={s.status === "error" ? "text-signal" : "text-bone"}>{s.label}</span>
                  {s.detail && <span className="ml-2 text-sm text-ash">{s.detail}</span>}
                </span>
              </li>
            );
          })}
          {visible.length === 0 && <li className="text-ash">Connecting to the run…</li>}
        </ol>
        {choices.length > 0 && status === "paused" && (
          <div className="mt-6 space-y-4">
            {choices.map((c) => (
              <ChoicePicker key={c.input} choice={c} onChoose={onChoose} />
            ))}
          </div>
        )}
        {error && <p className="mt-6 rounded-sm border border-signal/60 bg-[var(--signal-wash)] p-3 text-sm text-bone">{error}</p>}
      </div>
      <div className="rounded-sm border border-line bg-well p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-semibold">Qloo requests</h3>
          <span className="tabular text-sm text-ash">{receipts.length}</span>
        </div>
        <ol className="max-h-[420px] space-y-1 overflow-y-auto font-mono text-[12px] leading-5 [scrollbar-width:thin]">
          {receipts
            .slice()
            .reverse()
            .map((r) => (
              <li key={r.id} className="grid grid-cols-[38px_1fr_auto] gap-2 text-ash">
                <span className="text-ember-hi">{r.id}</span>
                <span className="truncate">{OP_SHORT[r.op] ?? r.op}</span>
                <span className={r.status === "ok" ? "text-smoke" : "text-sand"}>{r.transport === "cache" ? "cached" : r.status}</span>
              </li>
            ))}
          {receipts.length === 0 && <li className="text-smoke">No requests yet.</li>}
        </ol>
      </div>
    </section>
  );
}

export function RetryLink() {
  return (
    <Button tone="quiet" onClick={() => location.reload()}>
      Reload the report
    </Button>
  );
}
