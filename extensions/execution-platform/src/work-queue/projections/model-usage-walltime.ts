import type { JsonValue } from "../../runtime-job-repository.ts";
import {
  asRecord,
  boundedDiagnosticValue,
  numberValue,
  stringArrayValue,
  stringValue,
} from "./projection-utils.ts";

export function projectModelCallProgress(input: { latestModelCallData: Record<string, unknown> }) {
  const { latestModelCallData } = input;
  return {
    state: stringValue(latestModelCallData.modelCallSpanId) ? "present" : "missing",
    spanId: stringValue(latestModelCallData.modelCallSpanId),
    phase: stringValue(latestModelCallData.modelCallPhase),
    modelRef: stringValue(latestModelCallData.modelRef),
    providerPath: stringValue(latestModelCallData.providerPath),
    modelTaskClass: stringValue(latestModelCallData.modelTaskClass),
    modelTaskPolicyRef: stringValue(latestModelCallData.modelTaskPolicyRef),
    reasoningMode: stringValue(latestModelCallData.reasoningMode),
    parserMode: stringValue(latestModelCallData.parserMode),
    roleId: stringValue(latestModelCallData.roleId),
    nodeId: stringValue(latestModelCallData.nodeId),
    objective: stringValue(latestModelCallData.currentObjective),
    inputHash: stringValue(latestModelCallData.modelCallSpanInputHash),
    responseHash: stringValue(latestModelCallData.modelCallSpanResponseHash),
    elapsedMs: numberValue(latestModelCallData.modelCallSpanElapsedMs),
    timeoutMs: numberValue(latestModelCallData.modelCallSpanTimeoutMs),
    heartbeatCount: numberValue(latestModelCallData.modelCallSpanHeartbeatCount),
    responseShapeSummary:
      (asRecord(latestModelCallData.modelCallSpanResponseShapeSummary) as JsonValue | null) ?? null,
    providerDiagnostics:
      (boundedDiagnosticValue(latestModelCallData.modelProviderDiagnostics) as JsonValue | null) ??
      null,
    structuredAdapterProfile:
      (asRecord(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.structuredAdapterProfile,
      ) as JsonValue | null) ?? null,
    structuredAdapterDiagnostics:
      (asRecord(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.structuredAdapterDiagnostics,
      ) as JsonValue | null) ?? null,
    structuredAdapterOutcome:
      (asRecord(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.structuredAdapterOutcome,
      ) as JsonValue | null) ?? null,
    modelTaskClassification:
      (asRecord(latestModelCallData.modelTaskClassification) as JsonValue | null) ?? null,
    modelTaskTelemetry:
      (asRecord(latestModelCallData.modelTaskTelemetry) as JsonValue | null) ?? null,
    providerUsage:
      (asRecord(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.usage,
      ) as JsonValue | null) ??
      (asRecord(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.providerUsage,
      ) as JsonValue | null) ??
      null,
    usageUnavailableReason: stringValue(
      asRecord(latestModelCallData.modelProviderDiagnostics)?.usageUnavailableReason,
    ),
    reasonCodes: stringArrayValue(latestModelCallData.reasonCodes, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export type ModelCallProgressReadback = ReturnType<typeof projectModelCallProgress>;
