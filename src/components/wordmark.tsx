/** Wordmark: the name set in the display face, with a glass for the "o". */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display text-[22px] font-semibold tracking-[-0.05em] text-bone ${className}`}>
      s
      <svg viewBox="0 0 14 20" width="12" height="17" aria-hidden className="mx-[1px] translate-y-[2px] self-center">
        <path d="M1.5 1h11c0 5-2.2 8.2-5.5 8.6C3.7 9.2 1.5 6 1.5 1Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M2.6 5.4h8.8c-.6 2.4-2.2 3.6-4.4 3.8-2.2-.2-3.8-1.4-4.4-3.8Z" fill="var(--ember)" />
        <path d="M7 9.6V17M3.5 18.6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      mm
    </span>
  );
}
