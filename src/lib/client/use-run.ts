"use client";

import { useCallback, useEffect, useReducer } from "react";

export type StepView = { key: string; label: string; status: "running" | "done" | "empty" | "error"; detail?: string; at: number };
export type ReceiptView = { id: string; op: string; status: string; transport: string; requests: { method: string; path: string; query: unknown }[] };
export type ChoiceView = { input: string; type: string; candidates: { id: string; name: string; type: string; popularity: number | null; detail: string | null }[] };

export type RunState = {
  status: "connecting" | "running" | "paused" | "done" | "degraded" | "error";
  steps: StepView[];
  receipts: ReceiptView[];
  choices: ChoiceView[];
  result: unknown;
  degraded: string[];
  error?: string;
};

type Action =
  | { type: "step"; step: Omit<StepView, "at"> }
  | { type: "ledger"; receipt: ReceiptView }
  | { type: "needs_input"; choice: ChoiceView }
  | { type: "done"; status: RunState["status"]; degraded: string[] }
  | { type: "result"; result: unknown; status: RunState["status"] }
  | { type: "error"; error: string }
  | { type: "resumed" };

const initial: RunState = { status: "connecting", steps: [], receipts: [], choices: [], result: null, degraded: [] };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "step": {
      const steps = state.steps.filter((s) => s.key !== action.step.key);
      const previous = state.steps.find((s) => s.key === action.step.key);
      return { ...state, status: state.status === "connecting" ? "running" : state.status, steps: [...steps, { ...action.step, at: previous?.at ?? Date.now() }].sort((a, b) => a.at - b.at) };
    }
    case "ledger":
      return state.receipts.some((r) => r.id === action.receipt.id) ? state : { ...state, receipts: [...state.receipts, action.receipt] };
    case "needs_input":
      return { ...state, choices: [...state.choices.filter((c) => c.input !== action.choice.input), action.choice] };
    case "done":
      return { ...state, status: action.status, degraded: action.degraded };
    case "result":
      return { ...state, result: action.result, status: action.status };
    case "error":
      return { ...state, error: action.error };
    case "resumed":
      return { ...state, status: "running", choices: [], error: undefined };
  }
}

async function fetchRun(runId: string) {
  const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error ?? `HTTP ${response.status}`);
  return (await response.json()) as { status: RunState["status"]; result: unknown };
}

/** Live view of one run: replays its event log, then streams new events until it finishes. */
export function useRun(runId: string | null) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    if (!runId) return;
    let closed = false;
    const source = new EventSource(`/api/runs/${runId}/events`);
    const parse = (e: MessageEvent) => {
      try {
        return JSON.parse(e.data);
      } catch {
        return null;
      }
    };
    source.addEventListener("step", (e) => dispatch({ type: "step", step: parse(e as MessageEvent) }));
    source.addEventListener("ledger", (e) => dispatch({ type: "ledger", receipt: parse(e as MessageEvent) }));
    source.addEventListener("needs_input", (e) => {
      const choice = parse(e as MessageEvent);
      if (choice?.input) dispatch({ type: "needs_input", choice });
    });
    source.addEventListener("error", (e) => {
      const payload = (e as MessageEvent).data ? parse(e as MessageEvent) : null;
      if (payload?.detail) dispatch({ type: "error", error: payload.detail });
    });
    source.addEventListener("done", (e) => {
      const payload = parse(e as MessageEvent) ?? {};
      dispatch({ type: "done", status: payload.status ?? "done", degraded: payload.degraded ?? [] });
      // A paused run keeps streaming: the answer resumes it on this same connection.
      if (payload.status === "paused") return;
      source.close();
      fetchRun(runId)
        .then((run) => !closed && dispatch({ type: "result", result: run.result, status: run.status }))
        .catch((error: Error) => !closed && dispatch({ type: "error", error: error.message }));
    });
    return () => {
      closed = true;
      source.close();
    };
  }, [runId]);

  const choose = useCallback(
    async (input: string, entityId: string) => {
      if (!runId) return;
      const response = await fetch(`/api/runs/${runId}/resume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input, entityId }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error ?? "Could not resume");
      dispatch({ type: "resumed" });
    },
    [runId],
  );

  return { ...state, choose };
}
