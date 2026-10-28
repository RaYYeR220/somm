import type { EntityRef, QlooEntityType } from "@/lib/types";
import { mapLimit, qloo, type EngineContext } from "@/server/engine/context";
import { entityTypeOf } from "@/server/engine/facts";

export type EntityInput = { name: string; type: QlooEntityType; id?: string };
export type Candidate = { id: string; name: string; type: QlooEntityType; popularity: number | null; detail: string | null };
export type PendingChoice = { input: string; type: QlooEntityType; candidates: Candidate[] };
export type Resolution = { resolved: EntityRef[]; pending: PendingChoice[]; missing: string[]; auto: string[]; failed: string[] };

/** Lower-case letters and digits in any script, accents removed, words separated by single spaces. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Every word of the shorter name appears in the longer one. */
export function sameWords(a: string, b: string): boolean {
  const ta = norm(a).split(" ").filter(Boolean);
  const tb = norm(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return short.every((w) => long.has(w));
}

export function candidatesFrom(results: unknown, fallback: QlooEntityType): Candidate[] {
  const list = Array.isArray(results) ? results : Array.isArray((results as { entities?: unknown })?.entities) ? (results as { entities: unknown[] }).entities : [];
  return list.flatMap((item) => {
    const r = item as Record<string, unknown>;
    const id = r.entity_id ?? r.id;
    if (typeof id !== "string" || typeof r.name !== "string") return [];
    const types = Array.isArray(r.types) ? r.types : [r.type];
    const type = types.map(entityTypeOf).find((t) => t !== null) ?? fallback;
    const props = (r.properties ?? {}) as Record<string, unknown>;
    const detail = [r.disambiguation, props.short_description, props.release_year].find((v) => typeof v === "string" || typeof v === "number");
    return [{ id, name: r.name, type, popularity: typeof r.popularity === "number" ? r.popularity : null, detail: detail === undefined ? null : String(detail) }];
  });
}

/** The candidate a name stands for: the exact name, else the most popular name sharing every word, else none. */
export function bestMatch(name: string, candidates: Candidate[]): Candidate | null {
  const byPopularity = (list: Candidate[]) => [...list].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  const exact = byPopularity(candidates.filter((c) => norm(c.name) === norm(name)));
  return exact[0] ?? byPopularity(candidates.filter((c) => sameWords(c.name, name)))[0] ?? null;
}

/**
 * Turns named inputs into Qloo entity ids via /search. Clear matches resolve; unclear ones become
 * a question for the user, or (auto) the most popular candidate with a visible note.
 */
export async function resolveEntities(
  inputs: EntityInput[],
  ctx: EngineContext,
  choices: Record<string, string> = {},
  options: { auto?: boolean } = {},
): Promise<Resolution> {
  const out: Resolution = { resolved: [], pending: [], missing: [], auto: [], failed: [] };
  const results = await mapLimit(inputs, 4, async (input) => {
    if (input.id) return { kind: "resolved" as const, entity: { id: input.id, name: input.name, type: input.type } };
    const { env } = await qloo(ctx, "search", { query: input.name, types: `urn:entity:${input.type}`, take: 5 });
    const candidates = env.status === "ok" ? candidatesFrom(env.results, input.type) : [];
    const chosen = choices[input.name];
    if (chosen) {
      const match = candidates.find((c) => c.id === chosen);
      return { kind: "resolved" as const, entity: { id: chosen, name: match?.name ?? input.name, type: match?.type ?? input.type } };
    }
    if (env.status === "error") return { kind: "failed" as const, name: input.name, code: env.error?.code ?? "QLOO_ERROR" };
    if (candidates.length === 0) return { kind: "missing" as const, name: input.name };
    const byPopularity = (list: Candidate[]) => [...list].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const exact = candidates.filter((c) => norm(c.name) === norm(input.name));
    const pick = (c: Candidate) => ({ id: c.id, name: c.name, type: c.type });
    if (exact.length === 1) return { kind: "resolved" as const, entity: pick(exact[0]) };
    if (exact.length > 1) {
      const [top, second] = byPopularity(exact);
      // Namesakes: a popular entity next to obscure ones is the one people mean.
      if ((top.popularity ?? 0) >= 0.5 && (second?.popularity ?? 0) < (top.popularity ?? 0) * 0.6) return { kind: "resolved" as const, entity: pick(top) };
      if (options.auto) return { kind: "auto" as const, entity: pick(top), name: input.name };
      return { kind: "pending" as const, choice: { input: input.name, type: input.type, candidates: exact.slice(0, 5) } };
    }
    // No exact name: only a name that contains every word of the input (or vice versa) can stand in,
    // and the substitution is always shown. "AG1" may become "AG1 Energy"; "David Protein" never becomes a gallery.
    const close = byPopularity(candidates.filter((c) => sameWords(c.name, input.name)));
    if (close.length === 1 || (close.length > 1 && options.auto)) return { kind: "auto" as const, entity: pick(close[0]), name: input.name };
    if (options.auto) return { kind: "missing" as const, name: input.name };
    return { kind: "pending" as const, choice: { input: input.name, type: input.type, candidates: candidates.slice(0, 5) } };
  });
  for (const r of results) {
    if (r.kind === "resolved") out.resolved.push(r.entity);
    else if (r.kind === "auto") {
      out.resolved.push(r.entity);
      out.auto.push(`${r.name} → ${r.entity.name}`);
    } else if (r.kind === "missing") out.missing.push(r.name);
    else if (r.kind === "failed") out.failed.push(`${r.name} (${r.code})`);
    else out.pending.push(r.choice);
  }
  const seen = new Set<string>();
  out.resolved = out.resolved.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return out;
}
