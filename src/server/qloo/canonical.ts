import { createHash } from "node:crypto";

/** JSON with object keys sorted at every depth, so equal inputs serialise identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Stable short key for one Qloo operation + input. */
export function inputKey(op: string, input: unknown): string {
  return sha256(`${op}\n${canonicalJson(input)}`).slice(0, 16);
}
