import type { MemorySoakMemoryContextOutcomeEvent } from "./memory-soak-telemetry.js";

export type MemoryContextOutcomeObservation = Omit<
  MemorySoakMemoryContextOutcomeEvent,
  "schemaVersion" | "recordedAt" | "category" | "action" | "source"
>;
