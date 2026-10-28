# Reviewing Somm in five minutes

Everything below runs in the browser with no sign-in. Live site: **https://somm-494617981995.us-central1.run.app**

## 1. See a finished report (1 minute)

Open **Reports** and pick **This Week in Startups**.

- The top card names the best pairing and its Fit Score.
- The **Sponsor board** groups every scored brand by verdict. Click any brand to see the five signals behind its score and the gates it passed or failed.
- Every small orange code (`E12`) is a receipt: click it to see the exact Qloo request (endpoint and parameters), whether it went through Qloo's MCP server or the API, and a hash of the answer.

## 2. See it refuse (1 minute)

- In the **Coachella 2026** report, look at the **Blocked** group: the festival's exclusive soft-drink partner is Coca-Cola, so competing waters are blocked in code, with the reason on the card.
- In the **Celsius offer review**, one offer comes from a festival that already works with Red Bull (blocked), and one offer contains text addressed to an AI reviewer. Somm flags it, strips it before the model reads the offer, and shows you what it removed.
- In the **Michelob Ultra offer review**, the age gate holds beer deals at "consider" or blocks them: Qloo measures taste affinity, not the 21+ share that alcohol codes require, so Somm never clears those deals on taste data alone.

## 3. Watch the agent work (2 minutes)

Go to **Read my fans**, click one of the examples, and press **Read my fans**. The report page shows each step and each Qloo request as it happens, then turns into the report. If a name is ambiguous, Somm stops and asks which entity you meant.

In **Pitches**, struck-through sentences are claims the writer made that no Qloo fact supports; they are shown with the reason and are left out of the copy and download.

## 4. Check the claims (1 minute)

- **Proof** shows the pre-registered test on 202 real sponsorships across 24 properties, against a popularity baseline, a model-only baseline and a negative control, including where Somm does no better.
- **Without Qloo** in any report shows what a language model suggests with no taste data, next to Somm's list.
- **Developers** has the MCP endpoint; any MCP client can call `fit_score` or `evaluate_offer` and gets receipts plus a link to the full report.

## Where to look in the code

| Promise | Code |
| --- | --- |
| Every Qloo call is recorded | `src/server/qloo/ledger.ts`, `src/server/engine/context.ts` |
| Qloo through its official MCP server | `src/server/qloo/mcp-gateway.ts` |
| The score is computed in code, not by the model | `src/server/engine/fit.ts` |
| Gates fail closed | `src/server/engine/gates.ts` |
| Unbacked claims are struck | `src/server/engine/claims.ts` |
| Offer text is treated as data | `src/server/engine/gates.ts` (`detectInjection`), `src/server/agent/diligence.ts` |
| The eval | `eval/spec.md`, `eval/runner.ts`, `EVAL.md` |
