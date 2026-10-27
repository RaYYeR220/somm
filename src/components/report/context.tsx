"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Fact, LedgerEntry } from "@/lib/types";
import { ReceiptChip } from "@/components/ui";
import { ReceiptDrawer } from "./receipt-drawer";

type ReportContext = {
  facts: Map<string, Fact>;
  ledger: Map<string, LedgerEntry>;
  openReceipt: (ledgerId: string) => void;
};

const Ctx = createContext<ReportContext | null>(null);

export function ReportProvider({ facts, ledger, children }: { facts: Fact[]; ledger: LedgerEntry[]; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const value = useMemo<ReportContext>(
    () => ({ facts: new Map(facts.map((f) => [f.id, f])), ledger: new Map(ledger.map((e) => [e.id, e])), openReceipt: setOpen }),
    [facts, ledger],
  );
  const entry = open ? value.ledger.get(open) ?? null : null;
  return (
    <Ctx.Provider value={value}>
      {children}
      <ReceiptDrawer entry={entry} facts={facts} onClose={() => setOpen(null)} />
    </Ctx.Provider>
  );
}

export function useReport() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReport outside ReportProvider");
  return ctx;
}

/** Receipt chips for every Qloo request behind one fact. */
export function FactReceipts({ factId }: { factId: string }) {
  const { facts, openReceipt } = useReport();
  const fact = facts.get(factId);
  if (!fact || fact.ledgerIds.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {fact.ledgerIds.map((id) => (
        <ReceiptChip key={id} id={id} onOpen={openReceipt} />
      ))}
    </span>
  );
}

/** One fact rendered as its human label plus receipts. */
export function FactLine({ factId, className = "" }: { factId: string; className?: string }) {
  const { facts } = useReport();
  const fact = facts.get(factId);
  if (!fact) return null;
  return (
    <span className={className}>
      {fact.display}
      <FactReceipts factId={factId} />
    </span>
  );
}

export function useOpenReceipt() {
  const { openReceipt } = useReport();
  return useCallback((id: string) => openReceipt(id), [openReceipt]);
}
