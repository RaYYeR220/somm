"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { Button, inputClass } from "@/components/ui";
import { Drawer } from "./drawer";

/** Publishes the report as a public media kit and hands back the private owner link. */
export function PublishKit({ runId, defaultTitle }: { runId: string; defaultTitle: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<{ url: string; ownerUrl: string } | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="!px-3 !py-1.5 !text-xs !shadow-[3px_3px_0_0_var(--bone)]">
        Publish media kit
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={<h3 className="display text-2xl">Publish a media kit</h3>}>
        {kit ? (
          <div className="space-y-6 text-sm">
            <div>
              <p className="font-semibold">Published</p>
              <p className="mt-1 text-ash">Send this link to brands. It shows the fan profile, the top fits and every receipt.</p>
              <a href={kit.url} className="mt-2 block break-all text-ember-hi underline">{kit.url}</a>
            </div>
            <div className="rounded-sm border border-sand/50 bg-sand/5 p-4">
              <p className="font-semibold">Your private inbox link</p>
              <p className="mt-1 text-ash">Intro requests from brands land here. Keep it to yourself; anyone with it can read and update them.</p>
              <a href={kit.ownerUrl} className="mt-2 block break-all text-bone underline">{kit.ownerUrl}</a>
            </div>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                setKit(await postJson<{ url: string; ownerUrl: string }>("/api/kits", { runId, title }));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not publish.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm text-ash">A public page for brands: who your fans are, the brands they already love, and the evidence. Struck claims and blocked brands are not shown.</p>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Title</span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
            </label>
            {error && <p className="text-sm text-signal">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Publish media kit"}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
