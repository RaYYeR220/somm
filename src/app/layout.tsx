import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { TopBar } from "@/components/top-bar";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const ui = Manrope({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const data = Geist_Mono({ variable: "--font-data", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Somm — the sponsorship sommelier", template: "%s — Somm" },
  description:
    "Somm reads Qloo's taste graph to find the brands a property's fans already love, says no to the deals it can't prove, and shows the receipt for every number.",
  metadataBase: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
  openGraph: { title: "Somm — agents, but with taste", description: "Sponsorship fit from real cultural taste data, with a receipt for every number.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#100e0c", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${data.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600&display=swap" />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-ember focus:px-3 focus:py-2 focus:text-ground">
          Skip to content
        </a>
        <TopBar />
        <main id="main" className="w-full min-w-0 flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
