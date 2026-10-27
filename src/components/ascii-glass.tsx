"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict } from "@/lib/types";
import { Stamp } from "./ui";

export type StampLine = { verdict: Verdict; line: string };

const RAMP = " .:-=+*#%@";

function bowlWidth(t: number) {
  if (t < 0 || t > 1) return 0;
  if (t < 0.7) return 0.42 + 0.2 * Math.sin(Math.PI * t * 0.9);
  const w0 = 0.42 + 0.2 * Math.sin(Math.PI * 0.63);
  const q = (t - 0.7) / 0.3;
  return w0 * Math.sqrt(Math.max(0, 1 - q * q));
}

/** A wine glass drawn in ASCII on canvas; moving the pointer swirls it. The stamp cycles through real verdicts. */
export function AsciiGlass({ stamps }: { stamps: StampLine[] }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || stamps.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % stamps.length), 4000);
    return () => clearInterval(id);
  }, [stamps.length]);

  useEffect(() => {
    const fr = frame.current;
    const cv = canvas.current;
    if (!fr || !cv) return;
    const ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, cw = 0, ch = 0, cols = 0, rows = 0, stir = 0, raf = 0;
    let lastX: number | null = null;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--ember").trim() || "#ff8a3d";

    const size = () => {
      const r = fr.getBoundingClientRect();
      const d = Math.min(devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      cv.width = W * d;
      cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ch = W < 500 ? 10 : 12.5;
      cw = ch * 0.6;
      cols = Math.floor(W / cw);
      rows = Math.floor(H / ch);
      ctx.font = `500 ${ch}px ${getComputedStyle(document.body).getPropertyValue("--font-data") || "monospace"}, monospace`;
      ctx.textBaseline = "top";
    };

    const draw = (now: number) => {
      const T = reduce ? 0 : now / 1000;
      ctx.clearRect(0, 0, W, H);
      stir *= 0.985;
      const glassTop = 0.04, bowlH = 0.47, stemEnd = 0.88;
      for (let j = 0; j < rows; j++) {
        let line = "", hot = "";
        const v = j / rows;
        for (let i = 0; i < cols; i++) {
          const u = ((i + 0.5) * cw - W / 2) / H / 0.3;
          let val = 0, isHot = false;
          const t = (v - glassTop) / bowlH;
          if (t >= 0 && t <= 1) {
            const w = bowlWidth(t), au = Math.abs(u);
            if (au <= w + 0.06) {
              const edge = Math.exp(-Math.pow((au - w) / 0.05, 2));
              const lvl = 0.5 + 0.035 * Math.sin(u * 4 + T * 1.6) + (0.025 + stir * 0.06) * Math.sin(u * 7 - T * 3.1);
              if (t > lvl && au < w - 0.01) {
                val = 0.5 + 0.22 * Math.sin(u * 6 + t * 9 - T * 1.2) + 0.15 * Math.sin(u * 13 - t * 5 + T * 0.7);
                isHot = true;
                if (Math.abs(t - lvl) < 0.03) val = 0.95;
              } else val = 0.06 + edge * 0.9;
              if (!isHot && Math.abs(u + w * 0.55) < 0.05 && t > 0.12 && t < 0.55) val = Math.max(val, 0.55);
              if (t < 0.012) val = Math.max(val, 0.8);
            }
          } else if (v > glassTop + bowlH && v < stemEnd) {
            if (Math.abs(u) < 0.05) val = 0.75;
          } else if (v >= stemEnd && v < stemEnd + 0.035) {
            const fw = 0.46, e = Math.abs(Math.abs(u) - fw * (1 - Math.pow((v - stemEnd - 0.017) / 0.02, 2)));
            if (Math.abs(u) < fw) val = 0.25 + (e < 0.07 ? 0.6 : 0);
          }
          const c = RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(val * (RAMP.length - 1))))];
          if (isHot) {
            hot += c;
            line += " ";
          } else {
            line += c;
            hot += " ";
          }
        }
        ctx.fillStyle = "rgba(239, 232, 221, 0.72)";
        ctx.fillText(line, 0, j * ch);
        ctx.fillStyle = accent;
        ctx.fillText(hot, 0, j * ch);
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const move = (e: PointerEvent) => {
      if (lastX !== null) stir = Math.min(1, stir + Math.abs(e.clientX - lastX) / 300);
      lastX = e.clientX;
    };
    const leave = () => (lastX = null);
    fr.addEventListener("pointermove", move);
    fr.addEventListener("pointerleave", leave);
    const ro = new ResizeObserver(size);
    ro.observe(fr);
    document.fonts.ready.then(() => {
      size();
      raf = requestAnimationFrame(draw);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      fr.removeEventListener("pointermove", move);
      fr.removeEventListener("pointerleave", leave);
    };
  }, []);

  const stamp = stamps[index];
  return (
    <div ref={frame} className="relative aspect-[4/5] w-full max-w-[560px] select-none" aria-hidden>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {stamp && (
        <div key={index} className="absolute bottom-[22%] right-0 rotate-[-4deg] border-2 border-bone bg-ground px-4 py-3 shadow-[6px_6px_0_0_var(--bone)]" style={{ animation: "rise .5s cubic-bezier(.16,1,.3,1) both" }}>
          <Stamp verdict={stamp.verdict} size="lg" className="!border-0 !p-0 !rotate-0" />
          <p className="mt-1 max-w-[260px] font-mono text-[11px] leading-4 text-ash">{stamp.line}</p>
        </div>
      )}
    </div>
  );
}
