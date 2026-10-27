import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Verdict } from "@/lib/types";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
export { cx };

type ButtonTone = "primary" | "quiet";

const buttonClass = (tone: ButtonTone, size: "md" | "lg" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition-[transform,box-shadow,background-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
    size === "lg" ? "px-6 py-3.5 text-[15px]" : "px-4 py-2.5 text-sm",
    tone === "primary"
      ? "bg-ember text-ground shadow-[5px_5px_0_0_var(--bone)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_0_var(--bone)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_var(--bone)]"
      : "text-bone underline decoration-line-strong underline-offset-[6px] hover:decoration-ember",
  );

export function Button({ tone = "primary", size, className, ...props }: ComponentProps<"button"> & { tone?: ButtonTone; size?: "md" | "lg" }) {
  return <button className={cx(buttonClass(tone, size), className)} {...props} />;
}

export function ButtonLink({ tone = "primary", size, className, ...props }: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: "md" | "lg" }) {
  return <Link className={cx(buttonClass(tone, size), className)} {...props} />;
}

export const VERDICT_STYLE: Record<Verdict, { label: string; text: string; ring: string; wash: string }> = {
  PURSUE: { label: "Pursue", text: "text-ember", ring: "border-ember", wash: "bg-raised/50" },
  CONSIDER: { label: "Consider", text: "text-sand", ring: "border-sand/70", wash: "bg-raised/30" },
  PASS: { label: "Pass", text: "text-ash", ring: "border-line-strong", wash: "bg-transparent" },
  BLOCKED: { label: "Blocked", text: "text-signal", ring: "border-signal", wash: "bg-[var(--signal-wash)]" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence", text: "text-smoke", ring: "border-dashed border-smoke", wash: "bg-transparent" },
};

/** The verdict as a rubber stamp: the product's one loud object. */
export function Stamp({ verdict, size = "md", className }: { verdict: Verdict; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap border-2 font-display font-semibold tracking-[-0.02em]",
        size === "lg" ? "px-4 py-1.5 text-3xl" : size === "sm" ? "px-1.5 py-0 text-xs" : "px-2.5 py-0.5 text-base",
        s.text,
        s.ring,
        verdict === "BLOCKED" && "-rotate-2",
        className,
      )}
    >
      {s.label}
    </span>
  );
}

/** Fit Score as a ring; no number is drawn when the evidence is insufficient. */
export function ScoreRing({ score, verdict, size = 64 }: { score: number | null; verdict: Verdict; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const tone = verdict === "BLOCKED" ? "var(--signal)" : verdict === "PURSUE" ? "var(--ember)" : verdict === "CONSIDER" ? "var(--sand)" : "var(--smoke)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={score === null ? "No score" : `Fit score ${score} of 100`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray={score === null ? "3 4" : undefined} />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="3"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeLinecap="butt"
        />
      )}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-bone font-display tabular" fontSize={size * 0.32} fontWeight={500}>
        {score === null ? "–" : score}
      </text>
    </svg>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-ash", className)}>{children}</span>;
}

/** A clickable pointer to the Qloo request behind a number. */
export function ReceiptChip({ id, onOpen }: { id: string; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(id)}
      className="inline-flex translate-y-[-1px] items-center rounded-sm border border-ember/40 px-1 font-mono text-[10.5px] leading-[16px] text-ember-hi hover:border-ember hover:bg-[var(--ember-wash)]"
      title={`Open Qloo request ${id}`}
    >
      {id}
    </button>
  );
}

export function SectionHead({ title, note, id }: { title: string; note?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-6 flex scroll-mt-32 flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-line pb-3">
      <h2 className="display text-[clamp(28px,3.4vw,44px)]">{title}</h2>
      {note && <p className="max-w-xl text-sm text-ash">{note}</p>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-bone">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-smoke">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-sm border border-line-strong bg-well px-3 py-2.5 text-[15px] text-bone placeholder:text-smoke focus:border-ember focus:outline-none";
