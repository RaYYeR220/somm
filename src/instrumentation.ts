/** On a fresh deployment, build the example reports once in the background. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SEED_DEMOS !== "1") return;
  const { getAgentDeps } = await import("@/server/agent/deps");
  const { runSeeds } = await import("@/server/agent/seeds");
  const deps = getAgentDeps();
  if (deps.store.listDemo().length > 0) return;
  setTimeout(() => {
    runSeeds(deps, (line) => console.log(`[seed] ${line}`)).catch((error) => console.error("[seed] failed", error));
  }, 5_000);
}
