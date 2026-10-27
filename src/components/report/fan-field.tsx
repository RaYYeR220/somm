"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ReceiptChip } from "@/components/ui";
import { insidePolygon, US_OUTLINE } from "./us-outline";

export type Cell = { geohash: string; lat: number; lng: number; affinity: number };

// Metro labels are Somm's own reference list, used only to name the nearest city to a Qloo cell.
const METROS: [string, number, number][] = [
  ["New York", 40.71, -74.0], ["Los Angeles", 34.05, -118.24], ["Chicago", 41.88, -87.63], ["Houston", 29.76, -95.37], ["Phoenix", 33.45, -112.07],
  ["Philadelphia", 39.95, -75.17], ["San Antonio", 29.42, -98.49], ["San Diego", 32.72, -117.16], ["Dallas", 32.78, -96.8], ["Austin", 30.27, -97.74],
  ["San Francisco", 37.77, -122.42], ["San Jose", 37.34, -121.89], ["Seattle", 47.61, -122.33], ["Denver", 39.74, -104.99], ["Washington", 38.91, -77.04],
  ["Boston", 42.36, -71.06], ["Nashville", 36.16, -86.78], ["Portland", 45.52, -122.68], ["Las Vegas", 36.17, -115.14], ["Atlanta", 33.75, -84.39],
  ["Miami", 25.76, -80.19], ["Minneapolis", 44.98, -93.27], ["New Orleans", 29.95, -90.07], ["Salt Lake City", 40.76, -111.89], ["Detroit", 42.33, -83.05],
  ["Charlotte", 35.23, -80.84], ["Raleigh", 35.78, -78.64], ["Orlando", 28.54, -81.38], ["Tampa", 27.95, -82.46], ["Pittsburgh", 40.44, -79.99],
  ["Columbus", 39.96, -83.0], ["Kansas City", 39.1, -94.58], ["St. Louis", 38.63, -90.2], ["Sacramento", 38.58, -121.49], ["Baltimore", 39.29, -76.61],
  ["Indianapolis", 39.77, -86.16], ["Cleveland", 41.5, -81.69], ["Cincinnati", 39.1, -84.51], ["Milwaukee", 43.04, -87.91], ["Honolulu", 21.31, -157.86],
];

function nearestMetro(lat: number, lng: number): string | null {
  let best: [string, number] | null = null;
  for (const [name, la, lo] of METROS) {
    const d = (la - lat) ** 2 + ((lo - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (!best || d < best[1]) best = [name, d];
  }
  return best && best[1] < 1.2 ? best[0] : null;
}

/**
 * Where a fanbase concentrates, drawn as a dot field: every dot is a grid point, lit by the
 * nearest Qloo heatmap cell's affinity. Hover a lit area to read the cell and its receipt.
 */
export function FanField({ cells, ledgerId, onReceipt, market }: { cells: Cell[]; ledgerId?: string; onReceipt?: (id: string) => void; market: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });

  const bounds = useMemo(() => {
    const us = market.toLowerCase().includes("united states") || market.toLowerCase() === "us";
    if (us || cells.length === 0) return { minLat: 24, maxLat: 50, minLng: -125, maxLng: -66 };
    const lats = cells.map((c) => c.lat);
    const lngs = cells.map((c) => c.lng);
    const pad = 2;
    return { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLng: Math.min(...lngs) - pad, maxLng: Math.max(...lngs) + pad };
  }, [cells, market]);

  const isUs = useMemo(() => market.toLowerCase().includes("united states") || market.toLowerCase() === "us", [market]);

  const project = useMemo(() => {
    const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
    const spanX = (bounds.maxLng - bounds.minLng) * Math.cos(midLat);
    const spanY = bounds.maxLat - bounds.minLat;
    const scale = Math.min(size.w / spanX, size.h / spanY);
    const offX = (size.w - spanX * scale) / 2;
    const offY = (size.h - spanY * scale) / 2;
    return {
      xy: (lat: number, lng: number) => [offX + (lng - bounds.minLng) * Math.cos(midLat) * scale, offY + (bounds.maxLat - lat) * scale] as const,
      inverse: (x: number, y: number) => [bounds.maxLat - (y - offY) / scale, bounds.minLng + (x - offX) / (Math.cos(midLat) * scale)] as const,
      scale,
    };
  }, [bounds, size]);

  const top = useMemo(() => {
    const seen = new Set<string>();
    return [...cells]
      .sort((a, b) => b.affinity - a.affinity)
      .map((c) => ({ c, name: nearestMetro(c.lat, c.lng) }))
      .filter((x) => x.name && !seen.has(x.name) && seen.add(x.name))
      .slice(0, 5);
  }, [cells]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: Math.max(280, Math.min(520, entry.contentRect.width * 0.52)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);
    const pitch = Math.max(7, size.w / 110);
    const points = cells.map((c) => ({ c, p: project.xy(c.lat, c.lng) }));
    const reach = pitch * 5;
    for (let y = pitch / 2; y < size.h; y += pitch) {
      for (let x = pitch / 2; x < size.w; x += pitch) {
        let heat = 0;
        for (const { c, p } of points) {
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < reach) heat = Math.max(heat, c.affinity * (1 - d / reach) ** 1.4);
        }
        if (heat > 0.06) {
          const r = 1 + heat * pitch * 0.42;
          ctx.fillStyle = `rgba(255, ${Math.round(110 + 60 * heat)}, ${Math.round(50 + 30 * heat)}, ${0.35 + heat * 0.65})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const [lat, lng] = project.inverse(x, y);
          const land = !isUs || insidePolygon(lng, lat, US_OUTLINE);
          ctx.fillStyle = land ? "rgba(239, 232, 221, 0.2)" : "rgba(239, 232, 221, 0.035)";
          const s = land ? 1.6 : 1;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
    }
  }, [cells, project, size, isUs]);

  function onMove(e: React.PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: { cell: Cell; d: number } | null = null;
    for (const c of cells) {
      const [cx, cy] = project.xy(c.lat, c.lng);
      const d = Math.hypot(cx - x, cy - y);
      if (d < 26 && (!best || d < best.d)) best = { cell: c, d };
    }
    setHover(best ? { x, y, cell: best.cell } : null);
  }

  if (cells.length === 0) {
    return <p className="rounded-sm border border-dashed border-line-strong p-6 text-ash">Qloo has no heatmap for this audience in {market}, so Somm draws nothing rather than guess.</p>;
  }

  return (
    <figure className="space-y-3">
      <div ref={wrap} className="relative overflow-hidden rounded-sm border border-line bg-well">
        <canvas
          ref={canvas}
          style={{ width: "100%", height: size.h }}
          className="block cursor-crosshair"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Fan concentration across ${market}. Strongest areas: ${top.map((t) => t.name).join(", ")}.`}
        />
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-sm border border-line-strong bg-raised/95 p-3 text-xs shadow-xl"
            style={{ left: Math.min(hover.x + 14, size.w - 236), top: Math.max(8, hover.y - 70) }}
          >
            <p className="font-semibold text-bone">{nearestMetro(hover.cell.lat, hover.cell.lng) ?? "Area"} </p>
            <p className="mt-1 tabular text-ash">
              Affinity {hover.cell.affinity.toFixed(2)} <span className="text-smoke">cell {hover.cell.geohash}</span>
            </p>
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 text-sm text-ash">
        <span>
          Strongest areas: {top.map((t) => t.name).join(", ") || "spread out"}. Brighter dots mean a stronger over-index.
        </span>
        {ledgerId && <ReceiptChip id={ledgerId} onOpen={onReceipt} />}
      </figcaption>
    </figure>
  );
}
