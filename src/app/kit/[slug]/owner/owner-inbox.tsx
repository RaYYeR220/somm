"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getJson, patchJson } from "@/lib/client/api";
import { cx } from "@/components/ui";

type Deal = { id: string; brandName: string; contact: string; note: string; status: "new" | "talking" | "won" | "lost"; createdAt: string };
const COLUMNS: { id: Deal["status"]; label: string }[] = [
  { id: "new", label: "New" },
  { id: "talking", label: "Talking" },
  { id: "won", label: "Signed" },
  { id: "lost", label: "Passed" },
];

/** The kit owner's deal board; the secret link is the only key. */
export function OwnerInbox({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<{ kit: { title: string; runId: string }; deals: Deal[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/kits/${slug}/deals?k=${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    try {
      setData(await getJson(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the inbox.");
    }
  }, [path]);
  useEffect(() => {
    let alive = true;
    getJson<{ kit: { title: string; runId: string }; deals: Deal[] }>(path)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path]);

  if (error) return <p className="text-ash">{error} Check that you opened the full owner link you were given when you published.</p>;
  if (!data) return <p className="text-ash">Loading the inbox…</p>;
  const move = async (id: string, status: Deal["status"]) => {
    setData({ ...data, deals: data.deals.map((d) => (d.id === id ? { ...d, status } : d)) });
    await patchJson(path, { id, status }).catch(load);
  };
  return (
    <div>
      <p className="text-sm text-ash">Private inbox</p>
      <h1 className="display mt-2 text-[clamp(40px,6vw,72px)]">{data.kit.title}</h1>
      <p className="mt-3 text-ash">
        Intro requests from your media kit. <Link href={`/kit/${slug}`} className="text-ember-hi underline">Open the public kit</Link>
      </p>
      {data.deals.length === 0 ? (
        <p className="mt-10 rounded-sm border border-dashed border-line-strong p-8 text-ash">No requests yet. Send the public kit link to the brands at the top of your board.</p>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="rounded-sm border border-line bg-raised/40 p-3">
              <p className="mb-3 flex justify-between px-1 text-sm font-semibold">
                {col.label} <span className="tabular text-smoke">{data.deals.filter((d) => d.status === col.id).length}</span>
              </p>
              <ul className="space-y-2">
                {data.deals
                  .filter((d) => d.status === col.id)
                  .map((d) => (
                    <li key={d.id} className="rounded-sm border border-line-strong bg-ground p-3 text-sm">
                      <p className="font-semibold text-bone">{d.brandName}</p>
                      <p className="break-all text-ash">{d.contact}</p>
                      {d.note && <p className="mt-2 text-smoke">{d.note}</p>}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {COLUMNS.filter((c) => c.id !== d.status).map((c) => (
                          <button key={c.id} type="button" onClick={() => move(d.id, c.id)} className={cx("rounded-sm border border-line px-2 py-0.5 text-xs text-ash hover:border-ember hover:text-bone")}>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
