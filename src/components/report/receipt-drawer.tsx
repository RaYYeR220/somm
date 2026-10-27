"use client";

import type { Fact, LedgerEntry } from "@/lib/types";
import { Drawer } from "./drawer";

const OP_LABEL: Record<string, string> = {
  recommend: "Recommendations (Insights)",
  rank: "Rank a shortlist (Insights)",
  describe: "Entity details",
  where_popular: "Heatmap (Insights)",
  compare_audiences: "Compare audiences",
  entity_tags: "Taste tags (Insights)",
  audience_demographics: "Demographics (Insights)",
  trends: "Trending time series",
  find_tags: "Tag search",
  search: "Entity search",
  insights_raw: "Insights",
  tags_raw: "Tag search",
};

const TRANSPORT_LABEL: Record<string, string> = {
  mcp: "Official Qloo MCP server (qloo mcp)",
  http: "Qloo API, direct",
  cache: "Served from Somm's cache of an earlier identical call",
  fixture: "Recorded response",
};

function queryString(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  return Object.entries(query as Record<string, unknown>)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
    .join("\n");
}

export function ReceiptDrawer({ entry, facts, onClose }: { entry: LedgerEntry | null; facts: Fact[]; onClose: () => void }) {
  const backs = entry ? facts.filter((f) => f.ledgerIds.includes(entry.id)) : [];
  return (
    <Drawer
      open={Boolean(entry)}
      onClose={onClose}
      title={
        entry && (
          <div>
            <p className="font-mono text-xs text-ember-hi">Receipt {entry.id}</p>
            <h3 className="display mt-1 text-2xl">{OP_LABEL[entry.op] ?? entry.op}</h3>
          </div>
        )
      }
    >
      {entry && (
        <div className="space-y-6 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2">
            <dt className="text-smoke">Result</dt>
            <dd className={entry.status === "ok" ? "text-bone" : "text-sand"}>{entry.status === "ok" ? "Answered" : entry.status === "empty" ? "No data for this query" : entry.status}</dd>
            <dt className="text-smoke">Route</dt>
            <dd className="text-bone">{TRANSPORT_LABEL[entry.transport] ?? entry.transport}</dd>
            <dt className="text-smoke">When</dt>
            <dd className="tabular text-bone">{new Date(entry.at).toLocaleString()}</dd>
            <dt className="text-smoke">Answer hash</dt>
            <dd className="break-all font-mono text-xs text-ash">{entry.resultSha}</dd>
          </dl>
          <div>
            <p className="mb-2 font-semibold">The exact request</p>
            {entry.requests.length === 0 && <p className="text-ash">This workflow resolved names only; no Insights request was needed.</p>}
            {entry.requests.map((r, i) => {
              const req = r as { method: string; path: string; query: unknown };
              return (
                <pre key={i} className="overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-well p-3 font-mono text-[12px] leading-relaxed text-ash">
                  <span className="text-ember-hi">{req.method}</span> <span className="text-bone">hackathon.api.qloo.com{req.path}</span>
                  {"\n"}
                  {queryString(req.query)}
                </pre>
              );
            })}
          </div>
          {backs.length > 0 && (
            <div>
              <p className="mb-2 font-semibold">What Somm read from it</p>
              <ul className="space-y-2">
                {backs.slice(0, 12).map((f) => (
                  <li key={f.id} className="border-l-2 border-ember/50 pl-3">
                    <p className="text-bone">{f.label}</p>
                    <p className="text-ash">{f.display}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-smoke">
            Qloo scores describe aggregate audience affinity. They are not facts about any individual, and Somm sends Qloo no personal data.
          </p>
        </div>
      )}
    </Drawer>
  );
}
