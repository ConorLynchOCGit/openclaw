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
  type MemoryFamilyId,
} from "openclaw/plugin-sdk/memory-family-policy";
import type {
  ResolvedCanonicalizableIngestion,
  ResolvedProjectFactIngestion,
  ResolvedRecurringProcedureIngestion,
  ResolvedResponseStyleIngestion,
  WorkflowCaptureCategory,
} from "./memory-ingestion-resolver.js";
import type { OrdinaryTurnAutoCaptureMatch } from "./memory-ingestion-types.js";

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

export type BuildCanonicalMemoryIngestionCandidateFromAutoCaptureMatchParams = {
  familyId: MemoryFamilyId;
  match: OrdinaryTurnAutoCaptureMatch;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  detectionSource: "deterministic" | "semantic";
  evidence: readonly string[];
  observedText: string;
  projectId?: string;
  captureSeam: string;
  captureProfile: string;
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

function resolveWorkflowCompatibilityFamilyId(
  captureCategory: WorkflowCaptureCategory,
): Extract<MemoryFamilyId, "workflow_improvement" | "project_rule" | "unmet_need"> {
  return captureCategory;
}

function resolveResolvedIngestionCompatibilityFamilyId(
  ingestion: ResolvedCanonicalizableIngestion,
): MemoryFamilyId {
  return "captureCategory" in ingestion
    ? resolveWorkflowCompatibilityFamilyId(ingestion.captureCategory)
    : ingestion.familyId;
}

function isResolvedResponseStyleCaptureIngestion(
  ingestion: ResolvedCanonicalizableIngestion,
): ingestion is Extract<ResolvedResponseStyleIngestion, { action: "capture" }> {
  return "responseStyleFamily" in ingestion;
}

function isResolvedProjectFactIngestion(
  ingestion: ResolvedCanonicalizableIngestion,
): ingestion is ResolvedProjectFactIngestion {
  return "factFamily" in ingestion;
}

function isResolvedRecurringProcedureIngestion(
  ingestion: ResolvedCanonicalizableIngestion,
): ingestion is ResolvedRecurringProcedureIngestion {
  return "procedureFamily" in ingestion;
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
  const compatibilityFamilyId = resolveResolvedIngestionCompatibilityFamilyId(ingestion);
  const projectId = compatibilityFamilyId === "response_style" ? undefined : params.projectId;
  const baseParams: BuildCanonicalMemoryRecordForFamilyParams = {
    familyId: compatibilityFamilyId,
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
      ...(isResolvedResponseStyleCaptureIngestion(ingestion) && ingestion.responseStyleFamily
        ? { responseStyleFamily: ingestion.responseStyleFamily }
        : {}),
      ...(isResolvedProjectFactIngestion(ingestion)
        ? {
            factFamily: ingestion.factFamily,
            ...(ingestion.fieldKey ? { fieldKey: ingestion.fieldKey } : {}),
          }
        : {}),
      ...(isResolvedRecurringProcedureIngestion(ingestion)
        ? {
            procedureFamily: ingestion.procedureFamily,
            ...(ingestion.procedureKey ? { procedureKey: ingestion.procedureKey } : {}),
            ...(ingestion.parsed.title ? { procedureTitle: ingestion.parsed.title } : {}),
            ...(ingestion.parsed.steps ? { procedureSteps: ingestion.parsed.steps } : {}),
          }
        : {}),
      ...("lessonFamily" in ingestion ? { lessonFamily: ingestion.lessonFamily } : {}),
      ...("semanticProfileId" in ingestion && typeof ingestion.semanticProfileId === "string"
        ? { semanticProfileId: ingestion.semanticProfileId }
        : {}),
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
      compatibilityFamilyId,
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
        isResolvedResponseStyleCaptureIngestion(ingestion) &&
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
      candidateKind: ingestion.parsed.candidateKind,
      captureClass: ingestion.parsed.captureClass,
      reasonCode: ingestion.parsed.reasonCode,
      template: ingestion.parsed.template,
      metadata: {
        ...(isResolvedResponseStyleCaptureIngestion(ingestion) && ingestion.responseStyleFamily
          ? { responseStyleFamily: ingestion.responseStyleFamily }
          : {}),
        ...(isResolvedProjectFactIngestion(ingestion)
          ? {
              factFamily: ingestion.factFamily,
              ...(ingestion.fieldKey ? { fieldKey: ingestion.fieldKey } : {}),
            }
          : {}),
        ...(isResolvedRecurringProcedureIngestion(ingestion)
          ? {
              procedureFamily: ingestion.procedureFamily,
              ...(ingestion.procedureKey ? { procedureKey: ingestion.procedureKey } : {}),
            }
          : {}),
        ...("lessonFamily" in ingestion ? { lessonFamily: ingestion.lessonFamily } : {}),
        ...("semanticProfileId" in ingestion && typeof ingestion.semanticProfileId === "string"
          ? { semanticProfileId: ingestion.semanticProfileId }
          : {}),
      },
    },
  });
}

export function buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch(
  params: BuildCanonicalMemoryIngestionCandidateFromAutoCaptureMatchParams,
): CanonicalMemoryIngestionCandidate {
  const projectId = params.familyId === "response_style" ? undefined : params.projectId;
  const record = buildCanonicalMemoryRecordForFamily({
    familyId: params.familyId,
    subject: params.match.subject,
    statement: params.match.value,
    projectId,
    confidence: {
      level: params.detectionSource === "deterministic" ? "high" : "medium",
    },
    validationStatus: mapValidationStatus(params.reviewMode),
    provenance: {
      captureSeam: params.captureSeam,
      captureProfile: params.captureProfile,
      reviewState: params.reviewMode,
    },
    facets: {
      subjectKey: params.match.subjectKey,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      template: params.match.template,
      ...(params.match.projectScope ? { projectScope: params.match.projectScope } : {}),
      ...(params.match.responseStyleFamily
        ? { responseStyleFamily: params.match.responseStyleFamily }
        : {}),
      ...(params.match.factFamily ? { factFamily: params.match.factFamily } : {}),
      ...(params.match.fieldKey ? { fieldKey: params.match.fieldKey } : {}),
      ...(params.match.procedureFamily ? { procedureFamily: params.match.procedureFamily } : {}),
      ...(params.match.procedureKey ? { procedureKey: params.match.procedureKey } : {}),
      ...(params.match.lessonFamily ? { lessonFamily: params.match.lessonFamily } : {}),
      ...(typeof params.match.semanticProfileId === "string"
        ? { semanticProfileId: params.match.semanticProfileId }
        : {}),
      ...(params.match.guidancePattern ? { guidancePattern: params.match.guidancePattern } : {}),
      ...(params.match.recommendedAction
        ? { recommendedAction: params.match.recommendedAction }
        : {}),
      ...(params.match.avoidAction ? { avoidAction: params.match.avoidAction } : {}),
      ...(params.match.neededCapability ? { neededCapability: params.match.neededCapability } : {}),
    },
    tags: [
      params.familyId,
      params.detectionSource === "semantic" ? "semantic_ingestion" : "deterministic_ingestion",
    ],
  });

  return createCanonicalMemoryIngestionCandidate({
    record,
    identity: {
      dedupeKey: params.match.key,
      clusterKey: params.match.key,
      subjectKey: params.match.subjectKey,
    },
    capture: {
      mode: "ordinary_turn",
      source: "transcript",
      observedText: params.observedText,
      evidence: [...params.evidence],
      detectionSource: params.detectionSource,
      reviewMode: params.reviewMode,
    },
    compatibility: {
      candidateKind: params.match.candidateKind,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      template: params.match.template,
      ...(typeof params.match.semanticProfileId === "string"
        ? {
            metadata: {
              semanticProfileId: params.match.semanticProfileId,
            },
          }
        : {}),
    },
  });
}
