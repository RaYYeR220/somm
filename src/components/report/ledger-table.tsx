"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/lib/types";
import { Button } from "@/components/ui";
import { useReport } from "./context";

const ROUTE: Record<string, string> = { mcp: "MCP", http: "API", cache: "cache", fixture: "recorded" };

export function LedgerTable({ ledger }: { ledger: LedgerEntry[] }) {
  const { openReceipt } = useReport();
  const [all, setAll] = useState(false);
  const rows = all ? ledger : ledger.slice(0, 12);
  return (
    <div>
      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-smoke">
            <tr>
              <th className="px-4 py-2.5 font-normal">Receipt</th>
              <th className="px-4 py-2.5 font-normal">Workflow</th>
              <th className="px-4 py-2.5 font-normal">Endpoint</th>
              <th className="px-4 py-2.5 font-normal">Route</th>
              <th className="px-4 py-2.5 font-normal">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-raised/60">
                <td className="px-4 py-2">
                  <button type="button" onClick={() => openReceipt(e.id)} className="font-mono text-xs text-ember-hi hover:underline">
                    {e.id}
                  </button>
                </td>
                <td className="px-4 py-2 text-bone">{e.op.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 font-mono text-xs text-ash">{(e.requests[0] as { path?: string } | undefined)?.path ?? "name lookup"}</td>
                <td className="px-4 py-2 text-ash">{ROUTE[e.transport] ?? e.transport}</td>
                <td className={e.status === "ok" ? "px-4 py-2 text-ash" : "px-4 py-2 text-sand"}>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ledger.length > 12 && (
        <div className="mt-4">
          <Button tone="quiet" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${ledger.length} requests`}
          </Button>
        </div>
      )}
    </div>
  );
}
