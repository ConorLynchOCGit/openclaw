import type {
  MemoryIngestionQuarantineReportRecord,
  MemoryIngestionTelemetryEvent,
} from "./types.ts";

function assertNoDarkDataValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkDataValue(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[_-]/gu, "").toLowerCase();
    if (
      normalizedKey === "rawprompt" ||
      normalizedKey === "prompttext" ||
      normalizedKey === "fulltranscript" ||
      normalizedKey === "transcript" ||
      normalizedKey === "rawtoollog" ||
      normalizedKey === "secret" ||
      normalizedKey === "privatephrase"
    ) {
      throw new Error(`memory ingestion telemetry rejected dark-data field: ${path}.${key}`);
    }
    assertNoDarkDataValue(nested, `${path}.${key}`);
  }
}

export function assertMemoryIngestionReportRecordHasNoDarkData(
  record: MemoryIngestionQuarantineReportRecord,
): MemoryIngestionQuarantineReportRecord {
  assertNoDarkDataValue(record, "report");
  return record;
}

export function assertMemoryIngestionTelemetryHasNoDarkData(
  event: MemoryIngestionTelemetryEvent,
): MemoryIngestionTelemetryEvent {
  assertNoDarkDataValue(event, "event");
  return event;
}
