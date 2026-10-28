import ngeohash from "ngeohash";
import { ENTITY_TYPES, type EntityRef, type Envelope, type QlooEntityType } from "@/lib/types";

export type Demographics = { age: Record<string, number>; gender: Record<string, number> };
export type HeatCell = { geohash: string; lat: number; lng: number; affinity: number; rank?: number };
export type ScoredEntity = { entity: EntityRef; affinity: number; popularity: number | null };
export type TasteTag = { id: string; name: string; affinity: number | null; type?: string };
export type Momentum = { slope: number; points: { date: string; value: number }[]; factId?: string };

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function list(env: Envelope, ...keys: string[]): unknown[] {
  if (Array.isArray(env.results)) return env.results;
  const record = asRecord(env.results);
  for (const key of keys) if (Array.isArray(record?.[key])) return record![key] as unknown[];
  return [];
}

export function entityTypeOf(urn: unknown): QlooEntityType | null {
  if (typeof urn !== "string") return null;
  const short = urn.replace(/^urn:entity:/, "");
  return (ENTITY_TYPES as readonly string[]).includes(short) ? (short as QlooEntityType) : null;
}

export function parseEntities(env: Envelope, fallbackType?: QlooEntityType): ScoredEntity[] {
  return list(env, "entities").flatMap((item) => {
    const record = asRecord(item);
    const id = record?.entity_id ?? record?.id;
    const name = record?.name;
    const type = entityTypeOf(record?.type) ?? fallbackType ?? null;
    const affinity = num(record?.affinity) ?? num(asRecord(record?.query)?.affinity);
    if (typeof id !== "string" || typeof name !== "string" || !type || affinity === null) return [];
    return [{ entity: { id, name, type }, affinity, popularity: num(record?.popularity) }];
  });
}

export function parseTags(env: Envelope): TasteTag[] {
  return list(env, "tags").flatMap((item) => {
    const record = asRecord(item);
    const id = record?.id ?? record?.tag_id;
    const name = record?.name;
    if (typeof id !== "string" || typeof name !== "string") return [];
    return [{ id, name, affinity: num(record?.affinity) ?? num(asRecord(record?.query)?.affinity), ...(typeof record?.type === "string" ? { type: record.type } : {}) }];
  });
}

const numericMap = (value: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(asRecord(value) ?? {}).filter((entry): entry is [string, number] => num(entry[1]) !== null));

export function parseDemographics(env: Envelope): Demographics | null {
  const first = asRecord(list(env, "demographics")[0]);
  if (!first) return null;
  const source = asRecord(first.query) ?? first;
  const age = numericMap(source.age);
  const gender = numericMap(source.gender);
  return Object.keys(age).length + Object.keys(gender).length > 0 ? { age, gender } : null;
}

export function averageDemographics(items: Demographics[]): Demographics | null {
  if (items.length === 0) return null;
  const mean = (pick: (d: Demographics) => Record<string, number>) => {
    const keys = [...new Set(items.flatMap((d) => Object.keys(pick(d))))];
    return Object.fromEntries(keys.map((key) => [key, items.reduce((sum, d) => sum + (pick(d)[key] ?? 0), 0) / items.length]));
  };
  return { age: mean((d) => d.age), gender: mean((d) => d.gender) };
}

/** Every heatmap cell, strongest first (ties broken by Qloo's affinity rank). */
export function parseHeatmap(env: Envelope): HeatCell[] {
  const cells = list(env, "heatmap").flatMap((item): HeatCell[] => {
    const record = asRecord(item);
    const location = asRecord(record?.location) ?? record;
    const geohash = location?.geohash;
    const affinity = num(asRecord(record?.query)?.affinity) ?? num(record?.affinity);
    if (typeof geohash !== "string" || affinity === null) return [];
    let lat = num(location?.latitude);
    let lng = num(location?.longitude);
    if (lat === null || lng === null) {
      const decoded = ngeohash.decode(geohash);
      lat = decoded.latitude;
      lng = decoded.longitude;
    }
    const rank = num(asRecord(record?.query)?.affinity_rank);
    return [{ geohash, lat, lng, affinity, ...(rank !== null ? { rank } : {}) }];
  });
  return cells.sort((a, b) => b.affinity - a.affinity || (b.rank ?? 0) - (a.rank ?? 0));
}

/**
 * Momentum from Qloo's weekly popularity rank (lower rank = more popular): the relative rank
 * improvement from the first to the last week, averaged over every returned series.
 * Points carry the rank, oldest first.
 */
export function parseTrendSlope(env: Envelope): Momentum | null {
  const series = Array.isArray(env.series) ? env.series : [];
  const parsed = series.flatMap((s) => {
    const points = (Array.isArray(asRecord(s)?.points) ? (asRecord(s)!.points as unknown[]) : [])
      .flatMap((p) => {
        const record = asRecord(p);
        const rank = Number(record?.population_rank);
        return typeof record?.date === "string" && Number.isFinite(rank) && rank > 0 ? [{ date: record.date, value: rank }] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return points.length >= 2 ? [points] : [];
  });
  if (parsed.length === 0) return null;
  const changes = parsed.map((points) => (points[0].value - points[points.length - 1].value) / points[0].value);
  return { slope: changes.reduce((a, b) => a + b, 0) / changes.length, points: parsed[0] };
}

/** Tag types that describe venues (price band, accepted cards, star rating) rather than taste. */
export function isTasteTag(tag: { id: string; type?: string | null }): boolean {
  const type = tag.type ?? tag.id;
  return !/:place$|credit_card|cost_description|hotel_rating|inclusivity|specialty_dish|amenity/.test(type);
}

export const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55 and older",
};

export const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
