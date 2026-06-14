import { runInteractionAttempt } from "../interaction-attempt-runtime/attempt.js";
import type { AgentHarness } from "./types.js";

export function createPiAgentHarness(): AgentHarness {
  return {
    id: "pi",
    label: "OpenClaw built-in interaction runtime",
    supports: () => ({ supported: true, priority: 0 }),
    runAttempt: runInteractionAttempt,
  };
}
