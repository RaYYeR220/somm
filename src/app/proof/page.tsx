import type { Metadata } from "next";
import evalSummary from "@/data/eval-summary.json";

export const metadata: Metadata = { title: "How we test the score" };

type Summary = {
  status: string;
  generatedAt?: string;
  summary?: {
    mean: Record<string, number | null>;
    byType: Record<string, Record<string, number | null>>;
    wins: Record<string, number>;
    traps: { passed: number; total: number };
  };
  properties?: { id: string; name: string; type: string; counts: { sponsors: number; controls: number; resolvedSponsors: number; resolvedControls: number }; auc: Record<string, number | null> }[];
  traps?: { id: string; pass: boolean; verdict: string | null; ageGate: string | null; reason: string }[];
};

const METHOD: [string, string, string][] = [
  ["somm", "Somm fit score", "The production scorer, all five signals."],
  ["affinity", "Qloo affinity only", "One Qloo Insights call ranking the candidates for this audience."],
  ["popularity", "Popularity only", "How popular the brand is overall, ignoring the property. The baseline to beat."],
  ["llm_only", "Model only", "The same language model, asked to rank the same brands with no Qloo data."],
  ["negative_control", "Negative control", "Affinity computed against a different property's fans. Should be near chance."],
];

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : v.toFixed(2));

export default function ProofPage() {
  const ev = evalSummary as Summary;
  const done = ev.status === "done" && ev.summary;
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="display text-[clamp(44px,6vw,84px)]">How we test the score</h1>
      <p className="mt-5 max-w-3xl text-lg text-ash">
        A fit score is only worth something if it agrees with what brands actually do. We gathered 202 real sponsorships, each with a public source, across 9 podcasts, 8 festivals and 7 teams, plus 122 brands in the same categories that did not sponsor them. We wrote the method down and hashed the answer key before the first run.
      </p>

      <section className="mt-12 rounded-sm border border-ember/50 bg-[var(--ember-wash)] p-6 sm:p-8">
        <h2 className="display text-3xl">What we found</h2>
        <p className="mt-4 max-w-3xl text-bone">
          The brands that actually sponsor these 24 properties are no better matched to their fans, by Qloo&apos;s taste data, than same-category brands that don&apos;t. Somm&apos;s Fit Score separates them at chance level, and so does Qloo affinity on its own. A language model with no taste data does better, mostly on deals that were widely announced: it is remembering the status quo, not judging fit.
        </p>
        <p className="mt-3 max-w-3xl text-ash">
          Somm doesn&apos;t predict who already signed, and we don&apos;t claim it does. It shows which brands a property&apos;s fans over-index for, with a receipt for every number. The test says today&apos;s sponsorship money mostly isn&apos;t following that signal.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-ash">
          This is run 2. Run 1 had a bug that the negative control caught: a market location signal that drowned out each audience. We fixed it and ran again, and say so in the registration. Both runs are in the repository.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="display mb-6 text-4xl">Results</h2>
        {!done ? (
          <p className="rounded-sm border border-dashed border-line-strong p-6 text-ash">The first live run hasn&apos;t been published yet. The method and the answer key are already fixed in the repository.</p>
        ) : (
          <>
            <p className="mb-6 text-sm text-ash">
              AUC is the chance that a brand that really sponsored the property scores higher than one that didn&apos;t: 0.5 is a coin flip, 1.0 is perfect. Run on {new Date(ev.generatedAt!).toLocaleDateString()}.
            </p>
            <div className="overflow-x-auto rounded-sm border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs text-smoke">
                  <tr>
                    <th className="px-4 py-3 font-normal">Method</th>
                    <th className="px-4 py-3 font-normal">Mean AUC</th>
                    <th className="px-4 py-3 font-normal">Podcasts</th>
                    <th className="px-4 py-3 font-normal">Festivals</th>
                    <th className="px-4 py-3 font-normal">Teams</th>
                    <th className="px-4 py-3 font-normal">Properties won</th>
                  </tr>
                </thead>
                <tbody>
                  {METHOD.map(([id, name, note]) => (
                    <tr key={id} className={id === "somm" ? "border-b border-line bg-[var(--ember-wash)]" : "border-b border-line/60"}>
                      <td className="px-4 py-3">
                        <p className="text-bone">{name}</p>
                        <p className="text-xs text-smoke">{note}</p>
                      </td>
                      <td className="px-4 py-3 font-display text-xl tabular">{fmt(ev.summary!.mean[id])}</td>
                      <td className="px-4 py-3 tabular text-ash">{fmt(ev.summary!.byType.podcast?.[id])}</td>
                      <td className="px-4 py-3 tabular text-ash">{fmt(ev.summary!.byType.festival?.[id])}</td>
                      <td className="px-4 py-3 tabular text-ash">{fmt(ev.summary!.byType.sports_team?.[id])}</td>
                      <td className="px-4 py-3 tabular text-ash">{ev.summary!.wins[id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mb-4 mt-12 text-xl font-semibold">
              Gate traps: {ev.summary!.traps.passed} of {ev.summary!.traps.total} caught
            </h3>
            <ul className="space-y-2 text-sm">
              {ev.traps?.map((t) => (
                <li key={t.id} className="grid grid-cols-[70px_1fr] gap-3">
                  <span className={t.pass ? "text-ember" : "text-signal"}>{t.pass ? "caught" : "missed"}</span>
                  <span className="text-ash">
                    <span className="font-mono text-xs text-bone">{t.id}</span> {t.verdict ? `verdict ${t.verdict.toLowerCase().replace("_", " ")}` : ""}. {t.reason}
                  </span>
                </li>
              ))}
            </ul>
            <h3 className="mb-4 mt-12 text-xl font-semibold">Per property</h3>
            <div className="overflow-x-auto rounded-sm border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-xs text-smoke">
                  <tr>
                    <th className="px-4 py-2.5 font-normal">Property</th>
                    <th className="px-4 py-2.5 font-normal">Matched in Qloo</th>
                    {METHOD.map(([id, name]) => (
                      <th key={id} className="px-4 py-2.5 font-normal">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ev.properties?.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2 text-bone">{p.name}</td>
                      <td className="px-4 py-2 tabular text-ash">
                        {p.counts.resolvedSponsors}/{p.counts.sponsors} sponsors, {p.counts.resolvedControls}/{p.counts.controls} controls
                      </td>
                      {METHOD.map(([id]) => (
                        <td key={id} className="px-4 py-2 tabular text-ash">
                          {fmt(p.auc[id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-2">
        <div>
          <h2 className="display mb-4 text-3xl">What this does not show</h2>
          <ul className="space-y-3 text-ash">
            <li>Fit is not the same as who pays. Budgets, agencies and timing decide deals too, so some real sponsors are poor fits and some good fits never signed.</li>
            <li>A control brand being absent from our sources doesn&apos;t prove it never sponsored the property. Podcast ads are inserted per listener, so podcast controls are the weakest.</li>
            <li>The model-only baseline can remember real deals from press coverage. A high score there is memory, not audience reasoning.</li>
            <li>Qloo scores are aggregate audience affinities. They say nothing about any individual and can&apos;t certify the 21+ share that alcohol and betting codes require, which is why Somm never clears those deals on taste alone.</li>
          </ul>
        </div>
        <div>
          <h2 className="display mb-4 text-3xl">How the score is built</h2>
          <ul className="space-y-3 text-ash">
            <li><span className="text-bone">Fan affinity, 35%.</span> Where the brand ranks for this audience among the category&apos;s brands.</li>
            <li><span className="text-bone">Love back, 20%.</span> Whether the brand&apos;s fans like the property too.</li>
            <li><span className="text-bone">Who they are, 20%.</span> Similarity of the two audiences&apos; age and gender lean.</li>
            <li><span className="text-bone">Where they are, 15%.</span> Overlap of the strongest areas in the market.</li>
            <li><span className="text-bone">Momentum, 10%.</span> The property&apos;s popularity trend over the past year.</li>
            <li>Missing parts are left out and the rest re-weighted. With fewer than three parts, Somm shows no score at all.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
