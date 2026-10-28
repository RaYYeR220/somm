import type { Metadata } from "next";

export const metadata: Metadata = { title: "API and MCP server" };
// PUBLIC_URL is set on the running service, not at build time.
export const dynamic = "force-dynamic";

const TOOLS: [string, string, string][] = [
  ["fan_fingerprint", "property_name, kind, entities[], market?", "Taste tags, age and gender lean, where fans concentrate, momentum, and what else they love, with receipts."],
  ["prospect_sponsors", "property_name, kind, entities[], categories?, exclusives?", "Brands the fans over-index for in each category, scored and gated."],
  ["fit_score", "property_name, kind, entities[], brand, category, competitors?, current_sponsors?", "One brand against one property: score, verdict, reasons and evidence."],
  ["evaluate_offer", "brand, category, competitors?, offer_text", "Reads pasted offers as untrusted text and returns a verdict for each."],
];

const ROUTES: [string, string, string][] = [
  ["POST", "/api/scout", "Start a sponsor report. Body: { property } or { description }. Returns { runId }."],
  ["POST", "/api/diligence", "Start an offer review. Body: { brand: { name, category, competitors }, offersText }."],
  ["GET", "/api/runs/:id/events", "Server-sent events: each step, each Qloo request, questions, and done."],
  ["GET", "/api/runs/:id", "The run and, once finished, its full result with facts and receipts."],
  ["GET", "/api/ledger/:runId/:id", "One receipt: the exact Qloo request and a hash of the answer."],
  ["POST", "/api/kits", "Publish a finished report as a media kit. Returns the public and owner links."],
];

export default function DevelopersPage() {
  const base = (process.env.PUBLIC_URL ?? "https://somm.example").replace(/\/+$/, "");
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="display text-[clamp(44px,6vw,84px)]">API and MCP server</h1>
      <p className="mt-5 max-w-3xl text-lg text-ash">
        Give your own agent Somm&apos;s sponsorship judgment. Every answer carries receipts for the Qloo requests behind it and a link to the full report a person can check.
      </p>

      <section className="mt-14">
        <h2 className="display mb-4 text-4xl">MCP</h2>
        <p className="mb-5 max-w-3xl text-ash">Streamable HTTP, no sign-in, rate-limited per address. Add it to any MCP client:</p>
        <pre className="overflow-x-auto rounded-sm border border-line bg-well p-5 font-mono text-[13px] leading-6 text-bone">{`{
  "mcpServers": {
    "somm": { "url": "${base}/mcp" }
  }
}`}</pre>
        <div className="mt-8 overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-smoke">
              <tr>
                <th className="px-4 py-2.5 font-normal">Tool</th>
                <th className="px-4 py-2.5 font-normal">Arguments</th>
                <th className="px-4 py-2.5 font-normal">Returns</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, args, out]) => (
                <tr key={name} className="border-b border-line/60 last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-ember-hi">{name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ash">{args}</td>
                  <td className="px-4 py-3 text-ash">{out}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-smoke">
          Under the hood Somm calls Qloo through Qloo&apos;s own MCP server (<span className="font-mono">qloo mcp</span>), and the Qloo API directly for search, tags and multi-brand Insights calls.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="display mb-4 text-4xl">HTTP</h2>
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <tbody>
              {ROUTES.map(([method, path, desc]) => (
                <tr key={path + method} className="border-b border-line/60 last:border-0 align-top">
                  <td className="w-20 px-4 py-3 font-mono text-xs text-ember-hi">{method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-bone">{path}</td>
                  <td className="px-4 py-3 text-ash">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="mt-6 overflow-x-auto rounded-sm border border-line bg-well p-5 font-mono text-[13px] leading-6 text-ash">{`curl -X POST ${base}/api/scout \\
  -H 'content-type: application/json' \\
  -d '{"property":{"kind":"podcast","name":"This Week in Startups",
       "entities":[{"name":"This Week in Startups","type":"podcast"},
                   {"name":"Jason Calacanis","type":"person"}]}}'

curl -N ${base}/api/runs/<runId>/events`}</pre>
      </section>
    </div>
  );
}
