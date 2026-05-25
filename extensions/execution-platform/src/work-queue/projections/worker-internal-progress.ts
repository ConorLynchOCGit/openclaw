import type { JsonValue } from "../../runtime-job-repository.ts";
import {
  asRecord,
  boundedDiagnosticValue,
  numberValue,
  stringArrayValue,
  stringValue,
} from "./projection-utils.ts";

export function projectWorkerInternalProgress(input: {
  latestWorkerInternalData: Record<string, unknown>;
  latestWorkerToolId: string | null;
}) {
  const { latestWorkerInternalData, latestWorkerToolId } = input;
  return {
    state:
      stringValue(latestWorkerInternalData.currentPhase) ||
      stringValue(latestWorkerInternalData.workerInternalToolStatus) ||
      stringArrayValue(latestWorkerInternalData.workerPhaseRefs, 1).length > 0
        ? stringValue(latestWorkerInternalData.status) === "needs_review" ||
          stringValue(latestWorkerInternalData.currentPhase)?.includes("needs_review")
          ? "needs_review"
          : "present"
        : "missing",
    phase: stringValue(latestWorkerInternalData.currentPhase),
    phaseStatus: stringValue(latestWorkerInternalData.status),
    objective: stringValue(latestWorkerInternalData.currentObjective),
    whySelected: stringValue(latestWorkerInternalData.whyThisNodeWasChosen),
    roleId: stringValue(latestWorkerInternalData.roleId),
    modelRef: stringValue(latestWorkerInternalData.modelRef),
    providerPath: stringValue(latestWorkerInternalData.providerPath),
    workerRef: stringValue(latestWorkerInternalData.workerRef),
    capabilityId:
      stringValue(latestWorkerInternalData.capabilityId) ??
      stringValue(latestWorkerInternalData.selectedCapabilityId),
    selectedToolId:
      stringValue(latestWorkerInternalData.schedulerToolId) ??
      stringValue(latestWorkerInternalData.latestToolEventKind) ??
      latestWorkerToolId,
    toolStatus: stringValue(latestWorkerInternalData.workerInternalToolStatus),
    compoundToolId: stringValue(latestWorkerInternalData.workerInternalCompoundToolId),
    compoundSubEventCount: numberValue(
      latestWorkerInternalData.workerInternalCompoundSubEventCount,
    ),
    compoundSubEventPhases: stringArrayValue(
      latestWorkerInternalData.workerInternalCompoundSubEventPhases,
      20,
    ),
    toolInvocationRefs: [
      ...new Set([
        ...stringArrayValue(latestWorkerInternalData.schedulerToolInvocationRefs, 20),
        ...stringArrayValue(latestWorkerInternalData.artifactRefs, 20).filter((ref) =>
          ref.startsWith("runtime-tool://"),
        ),
        ...stringArrayValue(latestWorkerInternalData.evidenceProducedRefs, 20).filter((ref) =>
          ref.startsWith("runtime-tool://"),
        ),
      ]),
    ].slice(0, 20),
    targetRefs: stringArrayValue(latestWorkerInternalData.targetRefs, 30),
    inputPacketRefs: stringArrayValue(latestWorkerInternalData.workerInternalInputPacketRefs, 20),
    contextRefs: [
      ...new Set([
        ...stringArrayValue(latestWorkerInternalData.workerInternalContextRefs, 30),
        ...stringArrayValue(latestWorkerInternalData.inputHandoffRefs, 30),
      ]),
    ].slice(0, 30),
    contextSynthesisRefs: stringArrayValue(
      latestWorkerInternalData.workerInternalContextSynthesisRefs,
      20,
    ),
    codeIntelligenceRefs: stringArrayValue(
      latestWorkerInternalData.workerInternalCodeIntelligenceRefs,
      20,
    ),
    currentValidationCommandRef: stringValue(latestWorkerInternalData.currentValidationCommandRef),
    currentValidationCommandSummary: stringValue(
      latestWorkerInternalData.currentValidationCommandSummary,
    ),
    currentValidationCommandStatus: stringValue(
      latestWorkerInternalData.currentValidationCommandStatus,
    ),
    editTransactionRefs: stringArrayValue(latestWorkerInternalData.editTransactionRefs, 20),
    editTransactionPhase: stringValue(latestWorkerInternalData.editTransactionPhase),
    editTransactionStatus: stringValue(latestWorkerInternalData.editTransactionStatus),
    editTransactionRepairCount: numberValue(latestWorkerInternalData.editTransactionRepairCount),
    changedFileRefs: stringArrayValue(latestWorkerInternalData.changedFileRefs, 20),
    validationRefs: stringArrayValue(latestWorkerInternalData.validationRefs, 20),
    evidenceRefs: stringArrayValue(latestWorkerInternalData.evidenceProducedRefs, 20),
    evidenceClaimRefs: stringArrayValue(latestWorkerInternalData.evidenceClaimRefs, 20),
    outputHash:
      stringValue(latestWorkerInternalData.workerInternalOutputHash) ??
      stringValue(latestWorkerInternalData.modelCallSpanResponseHash),
    outputContentLength: numberValue(latestWorkerInternalData.workerInternalOutputContentLength),
    providerLatencyMs:
      numberValue(latestWorkerInternalData.workerInternalProviderLatencyMs) ??
      numberValue(latestWorkerInternalData.modelCallSpanElapsedMs),
    providerTimeoutMs:
      numberValue(latestWorkerInternalData.workerInternalProviderTimeoutMs) ??
      numberValue(latestWorkerInternalData.modelCallSpanTimeoutMs),
    providerFinishReason: stringValue(latestWorkerInternalData.workerInternalProviderFinishReason),
    providerTokenCount: numberValue(latestWorkerInternalData.workerInternalProviderTokenCount),
    providerUsage:
      (asRecord(latestWorkerInternalData.workerInternalProviderUsage) as JsonValue | null) ??
      (asRecord(
        asRecord(latestWorkerInternalData.modelProviderDiagnostics)?.usage,
      ) as JsonValue | null) ??
      null,
    usageUnavailableReason:
      stringValue(latestWorkerInternalData.workerInternalUsageUnavailableReason) ??
      stringValue(
        asRecord(latestWorkerInternalData.modelProviderDiagnostics)?.usageUnavailableReason,
      ),
    providerDiagnostics:
      (boundedDiagnosticValue(
        latestWorkerInternalData.modelProviderDiagnostics,
      ) as JsonValue | null) ?? null,
    repairClassificationRef: stringValue(
      asRecord(latestWorkerInternalData.repairClassification)?.classificationRef,
    ),
    repairFailureClass: stringValue(
      asRecord(latestWorkerInternalData.repairClassification)?.failureClass,
    ),
    blockerSummary: stringValue(latestWorkerInternalData.blockerSummary),
    nextDecision: stringValue(latestWorkerInternalData.nextDecisionNeeded),
    eli5: stringValue(latestWorkerInternalData.eli5Progress),
    reasonCodes: stringArrayValue(latestWorkerInternalData.reasonCodes, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

export type WorkerInternalProgressReadback = ReturnType<typeof projectWorkerInternalProgress>;
