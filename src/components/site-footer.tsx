import Link from "next/link";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-10 text-sm text-ash sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-sm">
            Sponsorship fit from Qloo&apos;s cultural taste graph. Qloo describes aggregate audience affinities, not individuals; Somm sends no personal data.
          </p>
        </div>
        <ul className="space-y-2">
          <li><Link className="hover:text-bone" href="/scout">Read my fans</Link></li>
          <li><Link className="hover:text-bone" href="/diligence">Vet sponsorship offers</Link></li>
          <li><Link className="hover:text-bone" href="/reports">Example reports</Link></li>
        </ul>
        <ul className="space-y-2">
          <li><Link className="hover:text-bone" href="/proof">How we test the score</Link></li>
          <li><Link className="hover:text-bone" href="/developers">API and MCP server</Link></li>
          <li><a className="hover:text-bone" href="https://github.com/RaYYeR220/somm">Source code</a></li>
        </ul>
      </div>
    </footer>
  );
}
