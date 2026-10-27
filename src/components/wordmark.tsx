/** Wordmark: a small filled glass, then the name in the display face. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display text-[22px] font-semibold tracking-[-0.05em] text-bone ${className}`}>
      <svg viewBox="0 0 14 20" width="13" height="19" aria-hidden className="-translate-y-px">
        <path d="M1.5 1h11c0 5-2.2 8.2-5.5 8.6C3.7 9.2 1.5 6 1.5 1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.7 5.2h8.6c-.6 2.5-2.1 3.7-4.3 3.9-2.2-.2-3.7-1.4-4.3-3.9Z" fill="var(--ember)" />
        <path d="M7 9.6V17M3.5 18.6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      somm
    </span>
  );
}
