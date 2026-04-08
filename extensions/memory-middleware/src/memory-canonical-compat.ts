import type {
  CanonicalMemoryConfidence,
  CanonicalMemoryRecord,
} from "openclaw/plugin-sdk/memory-canonical-core";
import {
  createCanonicalMemoryIngestionCandidate,
  type CanonicalMemoryIngestionCandidate,
  type CanonicalMemoryIngestionMode,
} from "openclaw/plugin-sdk/memory-canonical-ingestion";
import {
  buildCanonicalMemoryRecordForFamily,
  type BuildCanonicalMemoryRecordForFamilyParams,
} from "openclaw/plugin-sdk/memory-family-policy";
import type {
  ResolvedProjectFactIngestion,
  ResolvedRecurringProcedureIngestion,
  ResolvedResponseStyleIngestion,
  ResolvedWorkflowIngestion,
} from "./memory-ingestion-resolver.js";

type ResolvedCanonicalizableIngestion =
  | ResolvedProjectFactIngestion
  | ResolvedRecurringProcedureIngestion
  | ResolvedWorkflowIngestion
  | Extract<ResolvedResponseStyleIngestion, { action: "capture" }>;

export type BuildCanonicalMemoryRecordFromIngestionParams = {
  ingestion: ResolvedCanonicalizableIngestion;
  projectId?: string;
  captureSeam: string;
  captureProfile?: string;
  sourceAgent?: string;
  sourceSession?: string;
  sourceEvent?: string;
  confirmedAt?: string;
};

export type BuildCanonicalMemoryIngestionCandidateFromResolvedIngestionParams =
  BuildCanonicalMemoryRecordFromIngestionParams & {
    mode: CanonicalMemoryIngestionMode;
  };

function mapIngestionConfidence(confidence: string): CanonicalMemoryConfidence {
  if (confidence === "high") {
    return { level: "high" };
  }
  if (confidence === "medium") {
    return { level: "medium" };
  }
  return { level: "low" };
}

function mapValidationStatus(
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence",
): BuildCanonicalMemoryRecordForFamilyParams["validationStatus"] {
  if (reviewMode === "direct") {
    return "approved";
  }
  return reviewMode === "pending_confirmation" ? "pending_confirmation" : "hold_for_more_evidence";
}

export function isCanonicalizableResolvedResponseStyleIngestion(
  ingestion: ResolvedResponseStyleIngestion,
): ingestion is Extract<ResolvedResponseStyleIngestion, { action: "capture" }> {
  return ingestion.action === "capture";
}

export function buildCanonicalMemoryRecordFromResolvedIngestion(
  params: BuildCanonicalMemoryRecordFromIngestionParams,
): CanonicalMemoryRecord {
  const { ingestion } = params;
  const projectId = ingestion.familyId === "response_style" ? undefined : params.projectId;
  const baseParams: BuildCanonicalMemoryRecordForFamilyParams = {
    familyId: ingestion.familyId,
    subject: ingestion.parsed.subject,
    statement: ingestion.parsed.value,
    projectId,
    confidence: mapIngestionConfidence(ingestion.confidence),
    validationStatus: mapValidationStatus(ingestion.reviewMode),
    provenance: {
      captureSeam: params.captureSeam,
      ...(params.captureProfile ? { captureProfile: params.captureProfile } : {}),
      ...(params.sourceAgent ? { sourceAgent: params.sourceAgent } : {}),
      ...(params.sourceSession ? { sourceSession: params.sourceSession } : {}),
      ...(params.sourceEvent ? { sourceEvent: params.sourceEvent } : {}),
      reviewState: ingestion.reviewMode,
    },
    recency: {
      observedAt: new Date().toISOString(),
      ...(params.confirmedAt ? { confirmedAt: params.confirmedAt } : {}),
    },
    facets: {
      subjectKey: ingestion.parsed.subjectKey,
      captureClass: ingestion.parsed.captureClass,
      detectionSource: ingestion.detectionSource,
      source: ingestion.source,
      observedText: ingestion.observedText,
      ...(ingestion.familyId === "response_style" && ingestion.responseStyleFamily
        ? { responseStyleFamily: ingestion.responseStyleFamily }
        : {}),
      ...(ingestion.familyId === "project_fact"
        ? {
            factFamily: ingestion.factFamily,
            ...(ingestion.fieldKey ? { fieldKey: ingestion.fieldKey } : {}),
          }
        : {}),
      ...(ingestion.familyId === "recurring_procedure"
        ? {
            procedureFamily: ingestion.procedureFamily,
            ...(ingestion.procedureKey ? { procedureKey: ingestion.procedureKey } : {}),
            ...(ingestion.parsed.title ? { procedureTitle: ingestion.parsed.title } : {}),
            ...(ingestion.parsed.steps ? { procedureSteps: ingestion.parsed.steps } : {}),
          }
        : {}),
      ...("lessonFamily" in ingestion ? { lessonFamily: ingestion.lessonFamily } : {}),
      ...("lessonKey" in ingestion && ingestion.lessonKey
        ? { lessonKey: ingestion.lessonKey }
        : {}),
      ...("toolKey" in ingestion && ingestion.toolKey ? { toolKey: ingestion.toolKey } : {}),
      ...("guidancePattern" in ingestion && ingestion.guidancePattern
        ? { guidancePattern: ingestion.guidancePattern }
        : {}),
      ...("parsed" in ingestion && ingestion.parsed.projectScope
        ? { projectScope: ingestion.parsed.projectScope }
        : {}),
      ...("parsed" in ingestion && ingestion.parsed.recommendedAction
        ? { recommendedAction: ingestion.parsed.recommendedAction }
        : {}),
      ...("parsed" in ingestion && ingestion.parsed.avoidAction
        ? { avoidAction: ingestion.parsed.avoidAction }
        : {}),
      ...("parsed" in ingestion && ingestion.parsed.neededCapability
        ? { neededCapability: ingestion.parsed.neededCapability }
        : {}),
    },
    tags: [
      ingestion.familyId,
      ...(ingestion.source === "raw" ? ["raw_ingestion"] : []),
      ...(ingestion.detectionSource === "semantic"
        ? ["semantic_ingestion"]
        : ["deterministic_ingestion"]),
    ],
  };
  return buildCanonicalMemoryRecordForFamily(baseParams);
}

export function buildCanonicalMemoryIngestionCandidateFromResolvedIngestion(
  params: BuildCanonicalMemoryIngestionCandidateFromResolvedIngestionParams,
): CanonicalMemoryIngestionCandidate {
  const { ingestion } = params;
  const record = buildCanonicalMemoryRecordFromResolvedIngestion(params);
  return createCanonicalMemoryIngestionCandidate({
    record,
    identity: {
      dedupeKey: ingestion.parsed.key,
      clusterKey:
        ingestion.familyId === "response_style" &&
        ingestion.responseStyleFamily !== "generalized_guidance"
          ? undefined
          : ingestion.parsed.key,
      subjectKey: ingestion.parsed.subjectKey,
    },
    capture: {
      mode: params.mode,
      source: ingestion.source,
      observedText: ingestion.observedText,
      evidence: ingestion.evidence,
      detectionSource: ingestion.detectionSource,
      reviewMode: ingestion.reviewMode,
    },
    compatibility: {
      transitionalFamilyId: ingestion.familyId,
      candidateKind: ingestion.parsed.candidateKind,
      captureClass: ingestion.parsed.captureClass,
      reasonCode: ingestion.parsed.reasonCode,
      template: ingestion.parsed.template,
      metadata: {
        ...(ingestion.familyId === "response_style" && ingestion.responseStyleFamily
          ? { responseStyleFamily: ingestion.responseStyleFamily }
          : {}),
        ...(ingestion.familyId === "project_fact"
          ? {
              factFamily: ingestion.factFamily,
              ...(ingestion.fieldKey ? { fieldKey: ingestion.fieldKey } : {}),
            }
          : {}),
        ...(ingestion.familyId === "recurring_procedure"
          ? {
              procedureFamily: ingestion.procedureFamily,
              ...(ingestion.procedureKey ? { procedureKey: ingestion.procedureKey } : {}),
            }
          : {}),
        ...("lessonFamily" in ingestion ? { lessonFamily: ingestion.lessonFamily } : {}),
        ...("lessonKey" in ingestion && ingestion.lessonKey
          ? { lessonKey: ingestion.lessonKey }
          : {}),
        ...("toolKey" in ingestion && ingestion.toolKey ? { toolKey: ingestion.toolKey } : {}),
      },
    },
  });
}
