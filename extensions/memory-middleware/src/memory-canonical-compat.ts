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
  ResolvedWorkflowIngestion,
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

export type CanonicalMemoryRecordMetadataView = {
  kind?: string;
  subject?: string;
  statement?: string;
  tags: string[];
  facets: Record<string, unknown>;
  compatibility: Record<string, unknown>;
};

export type CanonicalMemoryIngestionCandidateMetadataView = {
  record: CanonicalMemoryRecordMetadataView;
  identity: {
    dedupeKey?: string;
    clusterKey?: string;
    subjectKey?: string;
  };
  capture: {
    mode?: string;
    source?: string;
    detectionSource?: string;
    reviewMode?: string;
  };
  compatibility: {
    transitionalFamilyId?: string;
    candidateKind?: string;
    captureClass?: string;
    reasonCode?: string;
    template?: string;
    metadata: Record<string, unknown>;
  };
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : undefined;
}

export function readCanonicalMemoryRecordFromMetadata(
  metadata: Record<string, unknown> | undefined,
): CanonicalMemoryRecordMetadataView | null {
  const candidate = readCanonicalMemoryIngestionCandidateFromMetadata(metadata);
  return candidate?.record ?? null;
}

function readCanonicalCandidateContainer(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const metadataRecord = asRecord(metadata);
  return asRecord(
    metadataRecord.canonicalIngestionCandidate ??
      asRecord(metadataRecord.candidateMetadata).canonicalIngestionCandidate ??
      asRecord(metadataRecord.promotionMetadata).canonicalIngestionCandidate ??
      asRecord(metadataRecord.autoPromotion).canonicalIngestionCandidate,
  );
}

export function readCanonicalMemoryIngestionCandidateFromMetadata(
  metadata: Record<string, unknown> | undefined,
): CanonicalMemoryIngestionCandidateMetadataView | null {
  const canonicalCandidate = readCanonicalCandidateContainer(metadata);
  const canonicalRecord = asRecord(canonicalCandidate.record);
  if (Object.keys(canonicalRecord).length === 0 && Object.keys(canonicalCandidate).length === 0) {
    return null;
  }
  return {
    record: {
      kind: readOptionalString(canonicalRecord, "kind"),
      subject: readOptionalString(canonicalRecord, "subject"),
      statement: readOptionalString(canonicalRecord, "statement"),
      tags: readOptionalStringArray(canonicalRecord, "tags") ?? [],
      facets: asRecord(canonicalRecord.facets),
      compatibility: asRecord(canonicalRecord.compatibility),
    },
    identity: {
      dedupeKey: readOptionalString(asRecord(canonicalCandidate.identity), "dedupeKey"),
      clusterKey: readOptionalString(asRecord(canonicalCandidate.identity), "clusterKey"),
      subjectKey: readOptionalString(asRecord(canonicalCandidate.identity), "subjectKey"),
    },
    capture: {
      mode: readOptionalString(asRecord(canonicalCandidate.capture), "mode"),
      source: readOptionalString(asRecord(canonicalCandidate.capture), "source"),
      detectionSource: readOptionalString(asRecord(canonicalCandidate.capture), "detectionSource"),
      reviewMode: readOptionalString(asRecord(canonicalCandidate.capture), "reviewMode"),
    },
    compatibility: {
      transitionalFamilyId: readOptionalString(
        asRecord(canonicalCandidate.compatibility),
        "transitionalFamilyId",
      ),
      candidateKind: readOptionalString(
        asRecord(canonicalCandidate.compatibility),
        "candidateKind",
      ),
      captureClass: readOptionalString(asRecord(canonicalCandidate.compatibility), "captureClass"),
      reasonCode: readOptionalString(asRecord(canonicalCandidate.compatibility), "reasonCode"),
      template: readOptionalString(asRecord(canonicalCandidate.compatibility), "template"),
      metadata: asRecord(asRecord(canonicalCandidate.compatibility).metadata),
    },
  };
}

function readOptionalStringAtPath(
  metadata: Record<string, unknown> | undefined,
  path: readonly string[],
): string | undefined {
  let current: unknown = metadata;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : undefined;
}

function resolveCanonicalAliasKey(path: readonly string[]): string | undefined {
  if (path.length === 2 && (path[0] === "autoCapture" || path[0] === "autoPromotion")) {
    return path[1];
  }
  if (
    path.length === 3 &&
    ((path[0] === "candidateMetadata" && path[1] === "autoCapture") ||
      (path[0] === "promotionMetadata" && path[1] === "autoPromotion"))
  ) {
    return path[2];
  }
  return undefined;
}

function readCanonicalAliasString(
  candidate: CanonicalMemoryIngestionCandidateMetadataView,
  key: string,
): string | undefined {
  switch (key) {
    case "key":
      return candidate.identity.dedupeKey;
    case "clusterKey":
      return candidate.identity.clusterKey;
    case "subjectKey":
      return candidate.identity.subjectKey;
    case "subject":
      return candidate.record.subject;
    case "value":
      return candidate.record.statement;
    case "family":
      return candidate.compatibility.transitionalFamilyId;
    case "candidateKind":
      return candidate.compatibility.candidateKind;
    case "captureClass":
      return candidate.compatibility.captureClass;
    case "reasonCode":
      return candidate.compatibility.reasonCode;
    case "template":
      return candidate.compatibility.template;
    default: {
      const recordFacet = candidate.record.facets[key];
      if (typeof recordFacet === "string" && recordFacet.trim().length > 0) {
        return recordFacet.trim();
      }
      const compatibilityValue = candidate.compatibility.metadata[key];
      return typeof compatibilityValue === "string" && compatibilityValue.trim().length > 0
        ? compatibilityValue.trim()
        : undefined;
    }
  }
}

export function readCanonicalFirstMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: readonly string[],
): string | undefined {
  const aliasKey = resolveCanonicalAliasKey(path);
  if (aliasKey) {
    const candidate = readCanonicalMemoryIngestionCandidateFromMetadata(metadata);
    if (candidate) {
      const canonicalValue = readCanonicalAliasString(candidate, aliasKey);
      if (canonicalValue) {
        return canonicalValue;
      }
    }
  }
  return readOptionalStringAtPath(metadata, path);
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
      ...(params.match.lessonKey ? { lessonKey: params.match.lessonKey } : {}),
      ...(params.match.toolKey ? { toolKey: params.match.toolKey } : {}),
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
      transitionalFamilyId: params.familyId,
      candidateKind: params.match.candidateKind,
      captureClass: params.match.captureClass,
      reasonCode: params.match.reasonCode,
      template: params.match.template,
    },
  });
}
