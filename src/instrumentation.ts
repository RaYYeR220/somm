/** On boot: fail runs a restart interrupted, then build any missing example reports in the background. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getAgentDeps } = await import("@/server/agent/deps");
  const { sweepInterruptedRuns } = await import("@/server/agent/run-store");
  const deps = getAgentDeps();
  const swept = sweepInterruptedRuns(deps.store);
  if (swept) console.log(`[boot] marked ${swept} interrupted run(s) as failed`);
  if (process.env.SEED_DEMOS !== "1") return;
  const { runSeeds } = await import("@/server/agent/seeds");
  setTimeout(() => {
    runSeeds(deps, (line) => console.log(`[seed] ${line}`)).catch((error) => console.error("[seed] failed", error));
  }, 5_000);
}
