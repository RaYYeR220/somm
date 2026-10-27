import type { Metadata } from "next";
import { DiligenceForm } from "./diligence-form";

export const metadata: Metadata = { title: "Vet sponsorship offers" };

export default function DiligencePage() {
  return (
    <div className="mx-auto grid grid-cols-1 max-w-[1320px] gap-14 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:py-16">
      <div>
        <h1 className="display text-[clamp(44px,6vw,84px)]">Vet sponsorship offers</h1>
        <p className="mt-4 max-w-2xl text-lg text-ash">
          Paste the decks and emails you got. Somm checks each property&apos;s fans against yours in Qloo&apos;s taste graph and says which deals to pursue, which to pass on, and which it won&apos;t clear.
        </p>
        <div className="mt-10">
          <DiligenceForm />
        </div>
      </div>
      <aside className="space-y-5 self-start rounded-sm border border-line bg-raised/50 p-6 text-sm text-ash lg:sticky lg:top-24">
        <p className="font-semibold text-bone">What Somm refuses to do</p>
        <p>
          <span className="text-bone">Clear a deal blind.</span> Beer, spirits and betting need measured 21+ audience data; taste data alone never clears them.
        </p>
        <p>
          <span className="text-bone">Ignore a conflict.</span> If the property already works with a competitor you named, the offer is blocked.
        </p>
        <p>
          <span className="text-bone">Obey the offer.</span> Text that tries to instruct an AI reviewer is flagged, removed and shown to you.
        </p>
        <p>
          <span className="text-bone">Guess.</span> When Qloo has no data, the verdict says so instead of inventing a score.
        </p>
      </aside>
    </div>
  );
}
