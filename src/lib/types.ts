import { z } from "zod";

export const QLOO_OPS = [
  "recommend",
  "rank",
  "describe",
  "where_popular",
  "compare_audiences",
  "entity_tags",
  "audience_demographics",
  "trends",
  "find_tags",
  "search",
  "insights_raw",
  "tags_raw",
] as const;
export type QlooOp = (typeof QLOO_OPS)[number];

export const ENTITY_TYPES = [
  "artist",
  "book",
  "brand",
  "movie",
  "person",
  "place",
  "podcast",
  "tv_show",
  "videogame",
  "destination",
] as const;
export const QlooEntityTypeSchema = z.enum(ENTITY_TYPES);
export type QlooEntityType = z.infer<typeof QlooEntityTypeSchema>;

export const ENVELOPE_STATUSES = ["ok", "empty", "needs_input", "partial", "degraded", "error"] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const EnvelopeSchema = z
  .object({
    operation: z.string(),
    status: z.enum(ENVELOPE_STATUSES),
    summary: z.string().optional(),
    results: z.unknown().optional(),
    series: z.unknown().optional(),
    result_count: z.number().int().nonnegative().optional(),
    resolution: z.unknown().optional(),
    interpretation: z.unknown().optional(),
    provenance: z
      .object({
        endpoint: z.string(),
        requests: z
          .array(z.object({ method: z.literal("GET"), path: z.string(), query: z.unknown() }))
          .optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({ code: z.string(), retryable: z.boolean(), recovery: z.string() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const EntityRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: QlooEntityTypeSchema,
});
export type EntityRef = z.infer<typeof EntityRefSchema>;

export const PROPERTY_KINDS = ["podcast", "artist", "lineup", "team", "show", "creator"] as const;

export const SponsorCategorySchema = z.string().min(1);
export type SponsorCategory = z.infer<typeof SponsorCategorySchema>;

export const PropertySchema = z.object({
  kind: z.enum(PROPERTY_KINDS),
  name: z.string().min(1).max(120),
  entities: z.array(EntityRefSchema).min(1).max(10),
  market: z.string().min(1),
  exclusives: z.array(z.object({ category: SponsorCategorySchema, holder: z.string().min(1) })),
  agePolicy: z.enum(["all_ages", "18_plus", "21_plus", "unknown"]).default("unknown"),
});
export type Property = z.input<typeof PropertySchema>;

export type LedgerEntry = {
  id: string;
  runId: string;
  op: QlooOp;
  input: unknown;
  requests: unknown[];
  status: EnvelopeStatus;
  resultSha: string;
  at: string;
  transport: "mcp" | "http" | "cache" | "fixture";
};

export type Fact = {
  id: string;
  ledgerIds: string[];
  label: string;
  value: number | string;
  display: string;
};

export const FIT_COMPONENTS = ["affinity", "reciprocity", "demographic", "geo", "momentum"] as const;
export type FitComponent = (typeof FIT_COMPONENTS)[number];

export const VERDICTS = ["BLOCKED", "INSUFFICIENT_EVIDENCE", "PASS", "CONSIDER", "PURSUE"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type GateOutcome = { gate: "exclusivity" | "age_restricted" | "evidence" | "competitor"; outcome: "pass" | "review" | "block"; reason: string };

export type FitResult = {
  brand: EntityRef;
  category: SponsorCategory;
  components: Record<FitComponent, { score: number | null; facts: string[] }>;
  score: number | null;
  verdict: Verdict;
  reasons: string[];
  gates?: GateOutcome[];
  /** Other categories this brand was also prospected in (the age gate checks all of them). */
  alsoIn?: SponsorCategory[];
};

export type RunEventKind = "step" | "ledger" | "needs_input" | "fact" | "result" | "error" | "done";

export type RunEvent = {
  runId: string;
  seq: number;
  kind: RunEventKind;
  at: string;
  payload: unknown;
};
