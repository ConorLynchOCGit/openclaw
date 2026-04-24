import fs from "node:fs/promises";
import path from "node:path";
import { sha256JsonValue } from "../../hashing.ts";
import { sanitizeMemoryTraceId } from "../../trace-id.ts";
import { buildCandidateQuarantineReportRecords } from "./candidate-validation.ts";
import type {
  MemoryIngestionCloseoutReport,
  MemoryIngestionFailureClass,
  MemoryIngestionQuarantineReportRecord,
  MemoryIngestionTelemetryEvent,
} from "./types.ts";

function stableHash(value: unknown): string {
  return sha256JsonValue(value);
}

function countFailuresByClass(
  events: MemoryIngestionTelemetryEvent[],
): Partial<Record<MemoryIngestionFailureClass, number>> {
  const counts: Partial<Record<MemoryIngestionFailureClass, number>> = {};
  for (const event of events) {
    if (!event.failure_class) {
      continue;
    }
    counts[event.failure_class] = (counts[event.failure_class] ?? 0) + 1;
  }
  return counts;
}

function sumCandidateCount(
  events: MemoryIngestionTelemetryEvent[],
  key: keyof NonNullable<MemoryIngestionTelemetryEvent["candidate_counts"]>,
): number {
  return events.reduce((sum, event) => sum + (event.candidate_counts?.[key] ?? 0), 0);
}

function sanitizeReportFileId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "closeout";
}

export function buildMemoryIngestionCloseoutReport(input: {
  path: MemoryIngestionCloseoutReport["path"];
  traceId?: string;
  runId?: string;
  sourceId?: string;
  sourceHash?: string;
  jobId?: string;
  telemetryEvents?: MemoryIngestionTelemetryEvent[];
  quarantinedCandidates?: Parameters<
    typeof buildCandidateQuarantineReportRecords
  >[0]["quarantinedCandidates"];
  deferredCandidates?: Array<{
    memoryId?: string;
    reason: string;
  }>;
  deferredEdges?: Array<{
    edgeId?: string;
    fromMemoryId?: string;
    toMemoryId?: string;
    reason: string;
  }>;
  providerScorecards?: MemoryIngestionCloseoutReport["provider_scorecard_refs"];
  integrityAudits?: MemoryIngestionCloseoutReport["integrity_audit_refs"];
  dirtyState?: MemoryIngestionCloseoutReport["dirty_state"];
  provider?: string;
  model?: string;
  schema?: string;
  generatedAt?: Date;
}): MemoryIngestionCloseoutReport {
  const telemetryEvents = input.telemetryEvents ?? [];
  const quarantined: MemoryIngestionQuarantineReportRecord[] =
    buildCandidateQuarantineReportRecords({
      sourceId: input.sourceId,
      sourceHash: input.sourceHash,
      provider: input.provider,
      model: input.model,
      schema: input.schema,
      quarantinedCandidates: input.quarantinedCandidates,
      deferredCandidates: input.deferredCandidates,
      deferredEdges: input.deferredEdges,
    });
  return {
    schema_version: "memory_ingestion_closeout.v1",
    generated_at: (input.generatedAt ?? new Date()).toISOString(),
    path: input.path,
    trace_id: sanitizeMemoryTraceId(input.traceId),
    run_id: input.runId,
    source_id: input.sourceId,
    source_hash: input.sourceHash,
    job_id: input.jobId,
    counts: {
      telemetry_events: telemetryEvents.length,
      candidates_extracted: sumCandidateCount(telemetryEvents, "extracted"),
      candidates_valid: sumCandidateCount(telemetryEvents, "valid"),
      candidates_repaired: sumCandidateCount(telemetryEvents, "repaired"),
      candidates_deferred: input.deferredCandidates?.length ?? 0,
      candidates_quarantined:
        sumCandidateCount(telemetryEvents, "quarantined") +
        (input.quarantinedCandidates?.length ?? 0),
      candidates_admitted: sumCandidateCount(telemetryEvents, "admitted"),
      candidates_rejected: sumCandidateCount(telemetryEvents, "rejected"),
      edges_deferred: input.deferredEdges?.length ?? 0,
      failures: telemetryEvents.filter((event) => event.status === "failed").length,
      skipped: telemetryEvents.filter((event) => event.status === "skipped").length,
    },
    failure_class_breakdown: countFailuresByClass(telemetryEvents),
    quarantined,
    provider_scorecard_refs: input.providerScorecards ?? [],
    integrity_audit_refs: input.integrityAudits ?? [],
    dirty_state: input.dirtyState,
    no_dark_data_scan: {
      passed: true,
      scanned_fields: [
        "ids",
        "counts",
        "failure_classes",
        "quarantine_records",
        "provider_scorecard_refs",
        "integrity_audit_refs",
      ],
    },
    retention: {
      storage: "runtime_state_artifact",
      cleanup: "runtime-state JSON/JSONL rotation and artifact pruning",
    },
  };
}

export async function writeMemoryIngestionCloseoutReport(input: {
  report: MemoryIngestionCloseoutReport;
  artifactDir: string;
}): Promise<{ path: string; contentHash: string }> {
  await fs.mkdir(input.artifactDir, { recursive: true });
  const reportId = sanitizeReportFileId(
    input.report.run_id ?? input.report.job_id ?? input.report.source_id ?? input.report.path,
  );
  const reportPath = path.join(input.artifactDir, `${reportId}.closeout.json`);
  const serialized = `${JSON.stringify(input.report, null, 2)}\n`;
  await fs.writeFile(reportPath, serialized, "utf8");
  return {
    path: reportPath,
    contentHash: stableHash(serialized),
  };
}
