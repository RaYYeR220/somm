import ngeohash from "ngeohash";
import { ENTITY_TYPES, type EntityRef, type Envelope, type QlooEntityType } from "@/lib/types";

export type Demographics = { age: Record<string, number>; gender: Record<string, number> };
export type HeatCell = { geohash: string; lat: number; lng: number; affinity: number };
export type ScoredEntity = { entity: EntityRef; affinity: number; popularity: number | null };
export type TasteTag = { id: string; name: string; affinity: number | null };
export type Momentum = { slope: number; points: { date: string; value: number }[] };

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
    return [{ id, name, affinity: num(record?.affinity) ?? num(asRecord(record?.query)?.affinity) }];
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

export function parseHeatmap(env: Envelope): HeatCell[] {
  return list(env, "heatmap").flatMap((item) => {
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
    return [{ geohash, lat, lng, affinity }];
  });
}

/** Least-squares slope (percentile points per week) averaged over every returned series. */
export function parseTrendSlope(env: Envelope): Momentum | null {
  const series = Array.isArray(env.series) ? env.series : [];
  const parsed = series.flatMap((s) => {
    const points = (Array.isArray(asRecord(s)?.points) ? (asRecord(s)!.points as unknown[]) : [])
      .flatMap((p) => {
        const record = asRecord(p);
        const value = num(record?.population_percentile);
        return typeof record?.date === "string" && value !== null ? [{ date: record.date, value }] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return points.length >= 2 ? [points] : [];
  });
  if (parsed.length === 0) return null;
  const slopes = parsed.map((points) => {
    const n = points.length;
    const xs = points.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = points.reduce((a, p) => a + p.value, 0) / n;
    const cov = points.reduce((a, p, i) => a + (i - meanX) * (p.value - meanY), 0);
    const varX = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
    return varX === 0 ? 0 : cov / varX;
  });
  return { slope: slopes.reduce((a, b) => a + b, 0) / slopes.length, points: parsed[0] };
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
