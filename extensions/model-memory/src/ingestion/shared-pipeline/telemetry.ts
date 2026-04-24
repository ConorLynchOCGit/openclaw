import { assertMemoryIngestionTelemetryHasNoDarkData } from "./dark-data.ts";
import { classifyMemoryIngestionFailure } from "./failure-policy.ts";
import type { MemoryIngestionTelemetryEvent } from "./types.ts";

export function createMemoryIngestionTelemetryEvent(
  input: Omit<MemoryIngestionTelemetryEvent, "schema_version">,
): MemoryIngestionTelemetryEvent {
  return assertMemoryIngestionTelemetryHasNoDarkData({
    schema_version: "memory_ingestion_telemetry.v1",
    ...input,
  });
}

export function createMemoryIngestionFailureTelemetry(input: {
  path: MemoryIngestionTelemetryEvent["path"];
  stage: MemoryIngestionTelemetryEvent["stage"];
  error: unknown;
}): MemoryIngestionTelemetryEvent {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return createMemoryIngestionTelemetryEvent({
    path: input.path,
    stage: input.stage,
    status: "failed",
    failure_class: classifyMemoryIngestionFailure(message),
  });
}
