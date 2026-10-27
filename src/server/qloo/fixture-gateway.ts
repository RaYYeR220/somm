import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EnvelopeSchema } from "@/lib/types";
import { inputKey } from "./canonical";
import { errorEnvelope, type QlooGateway } from "./gateway";

/** Replays envelopes recorded under `<dir>/<op>/<inputKey>.json`. */
export function createFixtureGateway(dir: string): QlooGateway {
  return {
    async call(op, input) {
      const file = join(dir, op, `${inputKey(op, input)}.json`);
      if (!existsSync(file)) return errorEnvelope(op, "FIXTURE_MISSING", `No recorded response for ${op}.`);
      return EnvelopeSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    },
  };
}
