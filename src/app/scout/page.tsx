import type { Metadata } from "next";
import { ScoutForm } from "./scout-form";

export const metadata: Metadata = { title: "Read my fans" };

export default function ScoutPage() {
  return (
    <div className="mx-auto grid max-w-[1320px] gap-14 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:py-16">
      <div>
        <h1 className="display text-[clamp(44px,6vw,84px)]">Read my fans</h1>
        <p className="mt-4 max-w-2xl text-lg text-ash">
          Tell Somm what you&apos;re selling. It reads your audience in Qloo&apos;s taste graph, finds the brands those fans already over-index for, and scores each one.
        </p>
        <div className="mt-10">
          <ScoutForm />
        </div>
      </div>
      <aside className="space-y-6 self-start rounded-sm border border-line bg-raised/50 p-6 text-sm lg:sticky lg:top-24">
        <p className="font-semibold text-bone">What you get</p>
        <ol className="space-y-4 text-ash">
          <li>
            <span className="text-bone">A fan fingerprint.</span> Age and gender lean, where fans concentrate, what else they love across music, TV, podcasts and brands.
          </li>
          <li>
            <span className="text-bone">A scored sponsor board.</span> Every brand gets a 0–100 fit from five Qloo signals, then hard gates for exclusivity and age rules.
          </li>
          <li>
            <span className="text-bone">Pitches with receipts.</span> Every number links to the Qloo request behind it; anything unbacked is struck out.
          </li>
          <li>
            <span className="text-bone">A media kit to send.</span> One link brands can open, with a button to ask you for an intro.
          </li>
        </ol>
      </aside>
    </div>
  );
}
