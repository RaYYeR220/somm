"use client";

import { useState } from "react";
import type { Fact, FitResult, LedgerEntry, Property } from "@/lib/types";
import type { Fingerprint } from "@/server/engine/fingerprint";
import { CATEGORY_LABEL } from "@/lib/categories";
import { postJson } from "@/lib/client/api";
import { AgeChart } from "@/components/report/charts";
import { FactLine, ReportProvider } from "@/components/report/context";
import { FanField } from "@/components/report/fan-field";
import { Button, Chip, Field, ScoreRing, inputClass } from "@/components/ui";

export type KitData = {
  slug: string;
  title: string;
  runId: string;
  publishedAt: string;
  property: Property;
  fingerprint: Omit<Fingerprint, "facts">;
  fits: Pick<FitResult, "brand" | "category" | "score" | "verdict" | "components">[];
  facts: Fact[];
  receipts: Pick<LedgerEntry, "id" | "op" | "requests" | "status" | "at" | "transport">[];
  pitches: { brand: { name: string }; verdict: string; markdown: string }[];
};

function IntroForm({ slug, brands }: { slug: string; brands: string[] }) {
  const [brandName, setBrandName] = useState(brands[0] ?? "");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  if (state === "sent") {
    return (
      <div className="rounded-sm border border-ember/60 bg-[var(--ember-wash)] p-6">
        <p className="display text-3xl">Request sent</p>
        <p className="mt-2 text-ash">The team behind this kit sees it in their inbox and replies to {contact}.</p>
      </div>
    );
  }
  return (
    <form
      className="grid grid-cols-1 gap-5 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        try {
          await postJson(`/api/kits/${slug}/intro`, { brandName, contact, note });
          setState("sent");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send.");
          setState("error");
        }
      }}
    >
      <Field label="Your brand" htmlFor="b">
        <input id="b" className={inputClass} value={brandName} onChange={(e) => setBrandName(e.target.value)} required maxLength={120} />
      </Field>
      <Field label="How to reach you" htmlFor="c" hint="A work email or a phone number.">
        <input id="c" className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={200} />
      </Field>
      <div className="md:col-span-2">
        <Field label="What you have in mind" htmlFor="n">
          <textarea id="n" rows={3} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Timing, budget range, the kind of activation you'd like." />
        </Field>
      </div>
      {state === "error" && <p className="text-sm text-signal md:col-span-2">{error}</p>}
      <div className="md:col-span-2">
        <Button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Request an intro"}
        </Button>
      </div>
    </form>
  );
}

/** The public media kit: a lineup poster of brands billed by fit, with the evidence underneath. */
export function KitView({ kit }: { kit: KitData }) {
  const fp = kit.fingerprint;
  const ledger = kit.receipts.map((r) => ({ ...r, runId: kit.runId, input: null, resultSha: "" })) as LedgerEntry[];
  const head = kit.fits.slice(0, 2);
  const support = kit.fits.slice(2, 8);
  return (
    <ReportProvider facts={kit.facts} ledger={ledger}>
      <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6 lg:py-16">
        <p className="text-sm text-ash">Media kit, published {new Date(kit.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        <section className="mt-4 overflow-hidden rounded-sm border border-line-strong bg-raised/60">
          <div className="border-b border-line px-6 py-8 sm:px-10">
            <h1 className="display text-[clamp(48px,8vw,108px)]">{kit.property.name}</h1>
            <p className="mt-3 max-w-2xl text-ash">{kit.title}. Brands this audience already over-indexes for, measured on Qloo&apos;s taste graph.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {kit.property.entities.map((e) => (
                <Chip key={e.id}>{e.name}</Chip>
              ))}
            </div>
          </div>
          <div className="px-6 py-10 text-center sm:px-10">
            <p className="text-sm text-ash">Top billing</p>
            {head.map((f) => (
              <p key={f.brand.id} className="display mt-3 text-[clamp(40px,7vw,92px)] leading-[0.95]">
                {f.brand.name}
                <span className="ml-3 align-middle font-mono text-base tracking-normal text-ember">{f.score}</span>
              </p>
            ))}
            <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2">
              {support.map((f) => (
                <span key={f.brand.id} className="font-display text-[clamp(22px,3vw,34px)] font-medium tracking-[-0.03em] text-bone/85">
                  {f.brand.name} <span className="font-mono text-sm tracking-normal text-ember">{f.score}</span>
                </span>
              ))}
            </div>
            <p className="mt-8 text-xs text-smoke">Fit scores out of 100 from five Qloo signals. Open any brand below for its evidence.</p>
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="display mb-5 text-4xl">Where the fans are</h2>
            <FanField cells={fp.heatmap} market={kit.property.market} />
          </div>
          <div>
            <h2 className="display mb-5 text-4xl">Who they are</h2>
            {fp.demographics ? <AgeChart age={fp.demographics.age} gender={fp.demographics.gender} /> : <p className="text-ash">No demographic profile from Qloo.</p>}
            <div className="mt-8 flex flex-wrap gap-2">
              {fp.tags.slice(0, 10).map((t) => (
                <Chip key={t.id}>{t.name}</Chip>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="display mb-6 text-4xl">The evidence</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {kit.fits.slice(0, 6).map((f) => (
              <div key={f.brand.id} className="rounded-sm border border-line p-5">
                <div className="flex items-center gap-4">
                  <ScoreRing score={f.score} verdict={f.verdict} size={52} />
                  <div>
                    <p className="text-lg font-semibold">{f.brand.name}</p>
                    <p className="text-sm text-ash">{CATEGORY_LABEL[f.category] ?? f.category}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-ash">
                  {Object.values(f.components)
                    .flatMap((c) => c.facts)
                    .slice(0, 4)
                    .map((id) => (
                      <li key={id}>
                        <FactLine factId={id} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-sm border border-line-strong p-6 sm:p-10">
          <h2 className="display text-4xl">Talk to the team</h2>
          <p className="mb-8 mt-3 max-w-2xl text-ash">Interested in sponsoring {kit.property.name}? Leave your details and the team gets back to you.</p>
          <IntroForm slug={kit.slug} brands={kit.fits.map((f) => f.brand.name)} />
        </section>
        <p className="mt-10 text-xs text-smoke">
          Built with Somm on Qloo data. Scores describe aggregate audience taste, not individuals. <a href={`/report/${kit.runId}`} className="underline">Full report</a>
        </p>
      </div>
    </ReportProvider>
  );
}
