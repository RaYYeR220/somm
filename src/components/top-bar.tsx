import Link from "next/link";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/scout", label: "Read my fans" },
  { href: "/diligence", label: "Vet offers" },
  { href: "/reports", label: "Reports" },
  { href: "/proof", label: "Proof" },
  { href: "/developers", label: "Developers" },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ground/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Somm home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="-mx-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm text-ash [scrollbar-width:none]">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-sm px-2 py-1.5 hover:text-bone">
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="hidden items-center gap-2 text-xs text-smoke md:flex">
          <span className="live-dot inline-block size-1.5 rounded-full bg-ember" aria-hidden />
          Live on Qloo
        </span>
      </div>
    </header>
  );
}
