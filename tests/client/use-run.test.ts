import { describe, expect, it } from "vitest";
import { runReducer, type ChoiceView, type RunState } from "@/lib/client/use-run";

const choice = (input: string): ChoiceView => ({ input, type: "person", candidates: [{ id: `${input}-1`, name: input, type: "person", popularity: null, detail: null }] });
const paused = (...inputs: string[]): RunState => ({ status: "paused", steps: [], receipts: [], choices: inputs.map(choice), result: null, degraded: [] });

describe("answering the agent's questions", () => {
  it("keeps a question the server asks while the answer is still in flight", () => {
    let state = runReducer(paused("Ben Gilbert"), { type: "resuming" });
    expect(state).toMatchObject({ status: "running", choices: [] });
    // The server resumes, re-resolves from cache and asks again before the POST returns.
    state = runReducer(state, { type: "needs_input", choice: choice("David Rosenthal") });
    state = runReducer(state, { type: "done", status: "paused", degraded: [] });
    expect(state.status).toBe("paused");
    expect(state.choices.map((c) => c.input)).toEqual(["David Rosenthal"]);
  });

  it("puts the questions back if the answer can't be sent", () => {
    const before = paused("Ben Gilbert", "David Rosenthal");
    let state = runReducer(before, { type: "resuming" });
    state = runReducer(state, { type: "resume_failed", choices: before.choices, error: "Could not resume" });
    expect(state).toMatchObject({ status: "paused", error: "Could not resume" });
    expect(state.choices).toHaveLength(2);
  });
});
