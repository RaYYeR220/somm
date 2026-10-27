"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Right-hand sheet; closes on Escape or backdrop click and returns focus where it came from. */
export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col border-l border-line-strong bg-raised shadow-[-24px_0_60px_rgba(0,0,0,0.45)] outline-none ${wide ? "max-w-2xl" : "max-w-lg"}`}
        style={{ animation: "rise .35s cubic-bezier(.16,1,.3,1) both" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">{title}</div>
          <button type="button" onClick={onClose} className="rounded-sm px-2 py-1 text-sm text-ash hover:text-bone">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
