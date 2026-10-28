// Builds the example reports judges see on the landing page. Usage: npx tsx --env-file=.env.local scripts/seed.mts
import { getAgentDeps } from "@/server/agent/deps";
import { runSeeds } from "@/server/agent/seeds";

const deps = getAgentDeps();
await runSeeds(deps, (line) => console.log(line));
await deps.mcp.close();
process.exit(0);
