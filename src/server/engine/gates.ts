import type { FitResult, GateOutcome, Property, Verdict } from "@/lib/types";
import { categoryById, isAgeRestricted } from "./categories";
import { signed } from "./facts";
import type { Fingerprint } from "./fingerprint";

/**
 * Audience-composition codes for age-restricted categories. Qloo reports affinity (over/under-index),
 * not the share of an audience that is 21+, so Somm can flag risk but never certify compliance.
 */
export const ADULT_COMPOSITION_CODES = {
  beer: {
    name: "Beer Institute Advertising and Marketing Code",
    threshold: "73.6% of the audience 21+",
    url: "https://www.beerinstitute.org/policy-responsibility/responsibility/advertising-marketing-code/",
  },
  spirits: {
    name: "DISCUS Code of Responsible Practices",
    threshold: "73.8% of the audience 21+",
    url: "https://distilledspirits.org/wp-content/uploads/2025/09/Final-2025-DISCUS-Code.pdf",
  },
  sports_betting: {
    name: "AGA Responsible Marketing Code for Sports Wagering",
    threshold: "73.6% of the audience 21+",
    url: "https://www.americangaming.org/wp-content/uploads/2025/04/AGA_RMCSW_2024.pdf",
  },
} as const;

/** 24-and-younger affinity at or above this blocks an age-restricted deal. */
export const YOUTH_BLOCK = 0.25;
/** At or above this (but below YOUTH_BLOCK) the deal needs measured audience composition. */
export const YOUTH_REVIEW = 0.1;
const YOUTH_KEY = "24_and_younger";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const RANK: Record<Verdict, number> = { BLOCKED: 0, INSUFFICIENT_EVIDENCE: 1, PASS: 2, CONSIDER: 3, PURSUE: 4 };
const lower = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);

export type GateContext = {
  property: Property;
  fp: Fingerprint;
  brandSide?: { competitors: string[]; propertySponsors: string[] };
};

function exclusivityGate(fit: FitResult, property: Property): GateOutcome {
  const held = property.exclusives.filter((e) => e.category === fit.category && norm(e.holder) !== norm(fit.brand.name));
  if (held.length === 0) return { gate: "exclusivity", outcome: "pass", reason: "No exclusive partner holds this category." };
  return {
    gate: "exclusivity",
    outcome: "block",
    reason: `Category exclusivity: ${held.map((e) => e.holder).join(", ")} holds ${categoryById(fit.category)?.label ?? fit.category} for ${property.name}.`,
  };
}

function competitorGate(ctx: GateContext): GateOutcome | null {
  if (!ctx.brandSide) return null;
  const sponsors = new Set(ctx.brandSide.propertySponsors.map(norm));
  const conflicts = ctx.brandSide.competitors.filter((c) => sponsors.has(norm(c)));
  if (conflicts.length === 0) return { gate: "competitor", outcome: "pass", reason: "No listed competitor sponsors this property." };
  return { gate: "competitor", outcome: "block", reason: `${ctx.property.name} already partners with your competitor ${conflicts.join(", ")}.` };
}

function ageGate(fit: FitResult, ctx: GateContext): GateOutcome | null {
  if (!isAgeRestricted(fit.category)) return null;
  const code = ADULT_COMPOSITION_CODES[fit.category as keyof typeof ADULT_COMPOSITION_CODES];
  const cite = code ? ` ${code.name} requires ${code.threshold}.` : "";
  const { property, fp } = ctx;

  if (property.agePolicy === "all_ages") {
    return {
      gate: "age_restricted",
      outcome: "block",
      reason: `${property.name} admits all ages, so a property-wide ${categoryById(fit.category)?.label ?? fit.category} deal is out; activation would have to sit inside 21+-gated zones.${cite}`,
    };
  }
  const youth = fp.demographics?.age[YOUTH_KEY];
  if (youth === undefined) {
    return {
      gate: "age_restricted",
      outcome: "block",
      reason: `Age-restricted category with no audience-age evidence from Qloo; Somm will not clear it blind.${cite}`,
    };
  }
  if (youth >= YOUTH_BLOCK) {
    return {
      gate: "age_restricted",
      outcome: "block",
      reason: `The audience over-indexes for ages 24 and younger (${signed(youth)} affinity).${cite} Taste data cannot show that share, so this deal is blocked until measured audience data clears it.`,
    };
  }
  const youngActs = fp.entityDemographics.filter((d) => (d.demographics.age[YOUTH_KEY] ?? -1) >= YOUTH_BLOCK).map((d) => d.entity.name);
  if (youth >= YOUTH_REVIEW || youngActs.length > 0) {
    const acts = youngActs.length ? ` Youth-skewed acts: ${youngActs.join(", ")} — keep the brand off their slots.` : "";
    return {
      gate: "age_restricted",
      outcome: "review",
      reason: `Some youth skew (${signed(youth)} affinity, ages 24 and younger).${acts}${cite} Confirm with measured audience composition before signing.`,
    };
  }
  return {
    gate: "age_restricted",
    outcome: "pass",
    reason: `No youth skew in Qloo's age affinity (${signed(youth)}).${cite} Confirm composition with measured data before signing.`,
  };
}

/** Applies the hard gates in code; the ladder is BLOCKED > INSUFFICIENT_EVIDENCE > PASS > CONSIDER > PURSUE. */
export function applyGates(fit: FitResult, ctx: GateContext): FitResult {
  const gates = [exclusivityGate(fit, ctx.property), competitorGate(ctx), ageGate(fit, ctx)].filter((g): g is GateOutcome => g !== null);
  if (fit.score === null) {
    gates.push({ gate: "evidence", outcome: "block", reason: "Fewer than three independent Qloo signals; no score is shown." });
  }
  let verdict = fit.verdict;
  if (gates.some((g) => g.outcome === "block" && g.gate !== "evidence")) verdict = "BLOCKED";
  else if (fit.score === null) verdict = "INSUFFICIENT_EVIDENCE";
  else if (gates.some((g) => g.outcome === "review")) verdict = lower(verdict, "CONSIDER");
  const reasons = gates.filter((g) => g.outcome !== "pass").map((g) => g.reason);
  return { ...fit, verdict, gates, reasons };
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)?\s*(instructions|rules|prompts?|guidelines)\b/gi,
  /\b(you are|act as|pretend to be)\s+(an?\s+|the\s+)?(helpful\s+)?(ai|assistant|model|reviewer|language model|chatbot)\b/gi,
  /\b(rate|rates|score|scores|mark|grade)\s+(this|us|it|this offer|the offer)\b.{0,30}?\b(10|100|perfect|pursue|approve|maximum|top)\b/gi,
  /<\/?\s*system\s*>|\bsystem prompt\b|\bnew rules\b/gi,
  /\bas an ai\b/gi,
  /\b(ai|llm|model|automated)\s+reviewers?\b/gi,
  /\bapprove\s+(every|all|this)\s+offers?\b/gi,
  /\bfit score is\s+\d+/gi,
];

/** Finds text aimed at an automated reviewer rather than at a human buyer. */
export function detectInjection(text: string): { flagged: boolean; spans: string[] } {
  const spans = INJECTION_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[0]));
  return { flagged: spans.length > 0, spans };
}

/** Offer text with flagged spans removed before any model sees it. */
export function stripInjection(text: string): string {
  return INJECTION_PATTERNS.reduce((out, pattern) => out.replace(pattern, "[removed]"), text);
}
