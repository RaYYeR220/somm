"use client";

import { useState } from "react";

const AGE_ORDER = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"];
const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 and under",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55 and over",
};

/** Diverging bars around zero: warm = over-indexes, cool = under-indexes. Every bar is labelled. */
export function AgeChart({ age, gender }: { age: Record<string, number>; gender: Record<string, number> }) {
  const keys = AGE_ORDER.filter((k) => k in age).concat(Object.keys(age).filter((k) => !AGE_ORDER.includes(k)));
  const max = Math.max(0.3, ...Object.values(age).map(Math.abs), ...Object.values(gender).map(Math.abs));
  const row = (label: string, v: number, key: string) => (
    <div key={key} className="grid grid-cols-[92px_1fr_52px] items-center gap-3 text-sm" title={`${label}: ${v >= 0 ? "+" : ""}${v.toFixed(2)} affinity`}>
      <span className="text-ash">{label}</span>
      <span className="relative h-4">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <span
          className="absolute inset-y-[3px]"
          style={{
            left: v >= 0 ? "50%" : `${50 - (Math.abs(v) / max) * 50}%`,
            width: `${(Math.abs(v) / max) * 50}%`,
            background: v >= 0 ? "var(--data-warm)" : "var(--data-cool)",
            borderRadius: v >= 0 ? "0 3px 3px 0" : "3px 0 0 3px",
          }}
        />
      </span>
      <span className="tabular text-right text-bone">{`${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      {keys.map((k) => row(AGE_LABEL[k] ?? k, age[k], k))}
      {Object.keys(gender).length > 0 && <div className="my-3 h-px bg-line" />}
      {Object.entries(gender).map(([k, v]) => row(k[0].toUpperCase() + k.slice(1), v, `g-${k}`))}
      <div className="flex justify-between pt-2 text-xs text-smoke">
        <span>
          <span className="mr-1 inline-block size-2 rounded-[2px] bg-data-cool align-middle" /> under-indexes
        </span>
        <span>
          over-indexes <span className="ml-1 inline-block size-2 rounded-[2px] bg-data-warm align-middle" />
        </span>
      </div>
    </div>
  );
}

/** Weekly popularity rank (lower is better, so the axis is flipped) with a hover readout. */
export function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const w = 320;
  const h = 72;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values) - 0.5;
  const hi = Math.max(...values) + 0.5;
  const x = (i: number) => (i / (points.length - 1)) * (w - 8) + 4;
  const y = (v: number) => 6 + ((v - lo) / (hi - lo)) * (h - 12);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const shown = hover ?? points.length - 1;
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full max-w-[420px] touch-none"
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(Math.round((((e.clientX - r.left) / r.width) * w - 4) / ((w - 8) / (points.length - 1))));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Popularity rank from ${values[0]} to ${values[values.length - 1]}`}
      >
        <path d={d} fill="none" stroke="var(--data-warm)" strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && hover >= 0 && hover < points.length && <line x1={x(hover)} x2={x(hover)} y1="0" y2={h} stroke="var(--line-strong)" />}
        <circle cx={x(Math.min(Math.max(shown, 0), points.length - 1))} cy={y(points[Math.min(Math.max(shown, 0), points.length - 1)].value)} r="4" fill="var(--data-warm)" stroke="var(--raised)" strokeWidth="2" />
      </svg>
      <p className="tabular text-sm text-ash">
        {points[Math.min(Math.max(shown, 0), points.length - 1)].date}: popularity rank #{points[Math.min(Math.max(shown, 0), points.length - 1)].value.toLocaleString("en-US")}
      </p>
    </div>
  );
}
