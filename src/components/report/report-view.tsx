"use client";

import Link from "next/link";
import type { DiligenceResult } from "@/server/agent/diligence";
import type { ScoutResult } from "@/server/agent/scout";
import { useRun } from "@/lib/client/use-run";
import { DiligenceReport } from "./diligence-report";
import { RunConsole } from "./run-console";
import { ScoutReport } from "./scout-report";

type RunSnapshot = { id: string; kind: "scout" | "diligence"; status: string; result: unknown; mine: boolean; title: string };

/** One URL for a run: the live console while the agent works, the report once it's done. */
export function ReportView({ initial }: { initial: RunSnapshot }) {
  const finished = initial.status === "done" || initial.status === "degraded";
  const live = useRun(finished ? null : initial.id);
  const status = finished ? initial.status : live.status;
  const result = finished ? initial.result : live.result;

  if (result && (status === "done" || status === "degraded")) {
    return (
      <>
        {status === "degraded" && (
          <p className="mb-8 rounded-sm border border-sand/50 bg-sand/5 p-3 text-sm text-ash">
            Some steps came back empty or failed, so parts of this report are missing. Nothing was filled in to cover the gap.
          </p>
        )}
        {initial.kind === "scout" ? <ScoutReport runId={initial.id} result={result as ScoutResult} mine={initial.mine} /> : <DiligenceReport result={result as DiligenceResult} />}
      </>
    );
  }
  if (status === "error") {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="display text-5xl">This run stopped</h1>
        <p className="text-ash">{live.error ?? "The agent hit an error before it could finish."}</p>
        <Link href={initial.kind === "scout" ? "/scout" : "/diligence"} className="text-ember-hi underline">
          Start a new run
        </Link>
      </div>
    );
  }
  return <RunConsole title={initial.title} steps={live.steps} receipts={live.receipts} choices={live.choices} status={live.status} error={live.error} onAnswer={live.answer} />;
}
