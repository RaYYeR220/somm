import type { Fact } from "@/lib/types";

export type ClaimSegment = {
  text: string;
  status: "kept" | "struck";
  reason?: string;
  line: number;
  prefix: string;
};

export type ClaimCheck = { segments: ClaimSegment[]; keptMarkdown: string; struckCount: number };

type Options = { describeLedger?: (ledgerId: string) => string };

const MARKER = /\[F(\d+)\]/g;
const NUMBER = /-?\d+(?:\.\d+)?/g;
const RANKING = /%|×|\bover-?index|\btop\b|#\d|\branks?\b|\branked\b|\bmost\b|\bhighest\b|\bstrongest\b|\bmore likely\b|\bpercent|\bleading\b|\bbest\b/i;
const STOP = new Set(
  "I We Our Your You They This That These Those The A An It Its Qloo Somm US USA UK TV CEO Gen Z Why How What When Where Who Fans Sources Brand Brands Audience Listeners".split(" ").map((w) => w.toLowerCase()),
);

const normalizeMinus = (s: string) => s.replace(/[−–]/g, "-");
const numbersIn = (s: string) => (normalizeMinus(s).match(NUMBER) ?? []).map(Number);

function properNouns(sentence: string): string[] {
  const words = sentence.replace(MARKER, "").split(/\s+/).filter(Boolean);
  const names: string[] = [];
  let run: string[] = [];
  let runStart = -1;
  const flush = () => {
    if (run.length && !(runStart === 0 && run.length === 1)) {
      const name = run.join(" ");
      if (!run.every((w) => STOP.has(w.toLowerCase()))) names.push(name);
    }
    run = [];
    runStart = -1;
  };
  words.forEach((raw, index) => {
    const word = raw.replace(/^[("“'#]+|[)"”',.:;!?]+$/g, "").replace(/'s$/i, "");
    const capital = /^[A-Z][A-Za-z0-9&'.-]*$/.test(word) && !/^\d/.test(word);
    if (capital && !(run.length === 0 && STOP.has(word.toLowerCase()))) {
      if (run.length === 0) runStart = index;
      run.push(word);
      if (/[,.;:!?)]$/.test(raw)) flush();
    } else flush();
  });
  flush();
  return names;
}

function isAllowed(name: string, allowed: string[]): boolean {
  const n = name.toLowerCase();
  return allowed.some((a) => {
    const x = a.toLowerCase();
    return x.includes(n) || n.includes(x);
  });
}

function judge(sentence: string, facts: Map<string, Fact>, allowed: string[]): { status: "kept" | "struck"; reason?: string } {
  const ids = [...sentence.matchAll(MARKER)].map((m) => `F${m[1]}`);
  const missing = ids.filter((id) => !facts.has(id));
  if (missing.length) return { status: "struck", reason: `Cites ${missing.join(", ")}, which is not a fact from this run.` };
  const cited = ids.map((id) => facts.get(id)!);
  const bare = sentence.replace(MARKER, "");
  const numbers = numbersIn(bare);
  const needsEvidence = numbers.length > 0 || RANKING.test(bare);
  if (needsEvidence && cited.length === 0) return { status: "struck", reason: "Makes a number or ranking claim without a Qloo receipt." };
  if (cited.length && numbers.length) {
    const known = cited.flatMap((f) => [...(typeof f.value === "number" ? [f.value] : numbersIn(String(f.value))), ...numbersIn(f.display), ...numbersIn(f.label)]);
    const unmatched = numbers.filter((x) =>
      !known.some((k) => (Number.isInteger(x) && Number.isInteger(k) ? x === k : Math.abs(Math.abs(x) - Math.abs(k)) <= 0.011)),
    );
    if (unmatched.length) return { status: "struck", reason: `The number ${unmatched[0]} does not match the cited fact.` };
  }
  const unknown = properNouns(bare).filter((name) => !isAllowed(name, allowed));
  if (unknown.length && cited.length === 0) return { status: "struck", reason: `Names ${unknown[0]}, which Qloo did not return in this run.` };
  return { status: "kept" };
}

const LINE_PREFIX = /^(\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s+)?)(.*)$/;

/** Splits a pitch into sentences, strikes any claim without a matching Qloo-backed fact, and exports the rest with sources. */
export function checkClaims(markdown: string, factList: Fact[], allowedNames: string[], options: Options = {}): ClaimCheck {
  const facts = new Map(factList.map((f) => [f.id, f]));
  const segments: ClaimSegment[] = [];
  const keptLines: string[] = [];
  const footnotes = new Map<string, number>();

  markdown.split(/\r?\n/).forEach((rawLine, line) => {
    const [, prefix = "", body = ""] = rawLine.match(LINE_PREFIX) ?? [];
    if (!body.trim()) {
      keptLines.push(rawLine);
      return;
    }
    // A citation written after the full stop ("… 0.92. [F3]") belongs to the sentence before it.
    const sentences = /^\s*#/.test(prefix) ? [body] : body.split(/(?<=[.!?](?:\s*\[F\d+\])*)\s+(?=["“(A-Z0-9#−-])/);
    const kept: string[] = [];
    for (const sentence of sentences) {
      const verdict = judge(sentence, facts, allowedNames);
      segments.push({ text: sentence, status: verdict.status, ...(verdict.reason ? { reason: verdict.reason } : {}), line, prefix });
      if (verdict.status === "kept") {
        kept.push(
          sentence.replace(MARKER, (_, n: string) => {
            const id = `F${n}`;
            if (!footnotes.has(id)) footnotes.set(id, footnotes.size + 1);
            return `[${footnotes.get(id)}]`;
          }),
        );
      }
    }
    if (kept.length) keptLines.push(`${prefix}${kept.join(" ")}`);
  });

  let keptMarkdown = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (footnotes.size) {
    const describe = options.describeLedger ?? ((id: string) => `Qloo request ${id}`);
    const sources = [...footnotes.entries()].map(([id, n]) => {
      const fact = facts.get(id)!;
      return `[${n}] ${fact.display} — ${fact.ledgerIds.map(describe).join(", ") || "derived"}`;
    });
    keptMarkdown += `\n\n---\n**Sources**\n\n${sources.join("\n")}`;
  }
  return { segments, keptMarkdown, struckCount: segments.filter((s) => s.status === "struck").length };
}
