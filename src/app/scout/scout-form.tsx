"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { CATEGORY_LABEL } from "@/lib/categories";
import { EntityPicker, type PickedEntity } from "@/components/entity-picker";
import { Button, Field, cx, inputClass } from "@/components/ui";

type Kind = "podcast" | "artist" | "lineup" | "team" | "show" | "creator";

const KINDS: { id: Kind; label: string; types: string[]; hint: string; placeholder: string }[] = [
  { id: "podcast", label: "Podcast", types: ["podcast", "person"], hint: "The show itself, plus its hosts.", placeholder: "Search a podcast or host" },
  { id: "lineup", label: "Festival lineup", types: ["artist"], hint: "Up to 10 headline and sub-headline acts.", placeholder: "Search an artist" },
  { id: "artist", label: "Artist or tour", types: ["artist"], hint: "The artist, plus any regular collaborators.", placeholder: "Search an artist" },
  { id: "team", label: "Sports team", types: ["person", "brand"], hint: "Star players, plus the team if Qloo knows it as a brand.", placeholder: "Search a player or team" },
  { id: "show", label: "TV show", types: ["tv_show", "person"], hint: "The show and its leads.", placeholder: "Search a show or actor" },
  { id: "creator", label: "Creator", types: ["person"], hint: "The creator, plus close collaborators.", placeholder: "Search a person" },
];

const EXAMPLES: { label: string; kind: Kind; name: string; entities: PickedEntity[] }[] = [
  { label: "This Week in Startups", kind: "podcast", name: "This Week in Startups", entities: [{ name: "This Week in Startups", type: "podcast" }, { name: "Jason Calacanis", type: "person" }] },
  { label: "Coachella 2026", kind: "lineup", name: "Coachella 2026", entities: ["Sabrina Carpenter", "Justin Bieber", "Karol G", "The Strokes", "Addison Rae", "KATSEYE"].map((name) => ({ name, type: "artist" })) },
  { label: "LA Dodgers", kind: "team", name: "Los Angeles Dodgers", entities: ["Shohei Ohtani", "Mookie Betts", "Freddie Freeman", "Yoshinobu Yamamoto"].map((name) => ({ name, type: "person" })) },
];

const AGE: { id: string; label: string }[] = [
  { id: "unknown", label: "Not sure" },
  { id: "all_ages", label: "All ages" },
  { id: "18_plus", label: "18+" },
  { id: "21_plus", label: "21+ only" },
];

export function ScoutForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"pick" | "describe">("pick");
  const [kind, setKind] = useState<Kind>("podcast");
  const [name, setName] = useState("");
  const [entities, setEntities] = useState<PickedEntity[]>([]);
  const [description, setDescription] = useState("");
  const [market, setMarket] = useState("United States");
  const [agePolicy, setAgePolicy] = useState("unknown");
  const [exclusives, setExclusives] = useState<{ category: string; holder: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = KINDS.find((x) => x.id === kind)!;

  const ready = mode === "describe" ? description.trim().length > 20 : name.trim() && entities.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === "describe"
          ? { description }
          : { property: { kind, name: name.trim(), market, agePolicy, exclusives: exclusives.filter((x) => x.holder.trim()), entities } };
      const { runId } = await postJson<{ runId: string }>("/api/scout", body);
      router.push(`/report/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the run.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-9">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ash">Try one:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              setMode("pick");
              setKind(ex.kind);
              setName(ex.name);
              setEntities(ex.entities);
            }}
            className="rounded-full border border-line-strong px-3 py-1 text-bone hover:border-ember"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="How to describe the property" className="inline-flex rounded-sm border border-line-strong p-1 text-sm">
        {(["pick", "describe"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cx("rounded-sm px-4 py-1.5", mode === m ? "bg-bone text-ground" : "text-ash hover:text-bone")}>
            {m === "pick" ? "Pick the entities" : "Describe it in words"}
          </button>
        ))}
      </div>

      {mode === "describe" ? (
        <Field label="Describe what you want sponsored" hint="Name the show, the people in it or the acts on the bill. Somm turns this into Qloo entities and shows you what it picked." htmlFor="desc">
          <textarea id="desc" rows={5} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Our weekly startup podcast, This Week in Startups, hosted by Jason Calacanis…" />
        </Field>
      ) : (
        <>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">What are you sponsoring?</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={kind === x.id}
                  onClick={() => setKind(x.id)}
                  className={cx("rounded-sm border px-3.5 py-2 text-sm", kind === x.id ? "border-ember bg-[var(--ember-wash)] text-bone" : "border-line-strong text-ash hover:text-bone")}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Name" htmlFor="name">
            <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown on the report and the media kit" maxLength={120} />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Who represents the audience</p>
            <p className="text-xs text-smoke">{k.hint} Qloo reads the audience from these.</p>
            <EntityPicker key={kind} value={entities} onChange={setEntities} types={k.types} placeholder={k.placeholder} />
          </div>
          <details className="group rounded-sm border border-line">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm text-ash hover:text-bone">Market, age policy and existing partners</summary>
            <div className="grid gap-6 border-t border-line p-4 md:grid-cols-2">
              <Field label="Market" htmlFor="market" hint="Where fan concentration is mapped.">
                <input id="market" className={inputClass} value={market} onChange={(e) => setMarket(e.target.value)} />
              </Field>
              <Field label="Who can attend or listen" hint="Matters for beer, spirits and betting.">
                <div className="flex flex-wrap gap-2">
                  {AGE.map((a) => (
                    <button key={a.id} type="button" aria-pressed={agePolicy === a.id} onClick={() => setAgePolicy(a.id)} className={cx("rounded-sm border px-3 py-1.5 text-sm", agePolicy === a.id ? "border-ember text-bone" : "border-line-strong text-ash")}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-semibold">Exclusive partners you already have</p>
                <p className="text-xs text-smoke">Somm blocks their competitors in the same category.</p>
                {exclusives.map((x, i) => (
                  <div key={i} className="flex gap-2">
                    <select aria-label="Category" className={cx(inputClass, "w-56")} value={x.category} onChange={(e) => setExclusives(exclusives.map((y, j) => (j === i ? { ...y, category: e.target.value } : y)))}>
                      {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input aria-label="Partner brand" className={inputClass} value={x.holder} placeholder="Brand name" onChange={(e) => setExclusives(exclusives.map((y, j) => (j === i ? { ...y, holder: e.target.value } : y)))} />
                    <button type="button" onClick={() => setExclusives(exclusives.filter((_, j) => j !== i))} className="px-2 text-ash hover:text-bone" aria-label="Remove partner">
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setExclusives([...exclusives, { category: "beverage_soft", holder: "" }])} className="text-sm text-ember-hi underline underline-offset-4">
                  Add an exclusive partner
                </button>
              </div>
            </div>
          </details>
        </>
      )}

      {error && <p className="rounded-sm border border-signal/60 bg-[var(--signal-wash)] p-3 text-sm text-bone">{error}</p>}
      <div className="flex flex-wrap items-center gap-5">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          {busy ? "Starting…" : "Read my fans"}
        </Button>
        <span className="text-sm text-smoke">Takes about a minute. You watch every Qloo request as it happens.</span>
      </div>
    </form>
  );
}
