export type {
  BuildCanonicalMemoryIngestionCandidateFromAutoCaptureMatchParams,
  BuildCanonicalMemoryIngestionCandidateFromResolvedIngestionParams,
  BuildCanonicalMemoryRecordFromIngestionParams,
} from "./memory-canonical-compat-builders.js";
export {
  buildCanonicalMemoryIngestionCandidateFromAutoCaptureMatch,
  buildCanonicalMemoryIngestionCandidateFromResolvedIngestion,
  buildCanonicalMemoryRecordFromResolvedIngestion,
  isCanonicalizableResolvedResponseStyleIngestion,
} from "./memory-canonical-compat-builders.js";
import type { CompatibilityMemoryFamilyId } from "./memory-compatibility-family.js";

export type CanonicalMemoryRecordMetadataView = {
  kind?: string;
  subject?: string;
  statement?: string;
  tags: string[];
  facets: Record<string, unknown>;
  provenance: Record<string, unknown>;
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
    candidateKind?: string;
    captureClass?: string;
    reasonCode?: string;
    template?: string;
    metadata: Record<string, unknown>;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalCompatString(value: unknown, key: string): string | undefined {
  return readOptionalString(asRecord(value), key);
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
      provenance: asRecord(canonicalRecord.provenance),
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
      return resolveCanonicalRecordFamilyId(candidate);
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

function resolveCanonicalRecordFamilyId(
  candidate: CanonicalMemoryIngestionCandidateMetadataView,
): CompatibilityMemoryFamilyId | undefined {
  const captureCategory = candidate.record.compatibility.captureCategory;
  if (
    captureCategory === "project_fact" ||
    captureCategory === "recurring_procedure" ||
    captureCategory === "workflow_improvement" ||
    captureCategory === "project_rule" ||
    captureCategory === "unmet_need"
  ) {
    return captureCategory;
  }

  const tags = new Set(candidate.record.tags);
  if (tags.has("response_style")) {
    return "response_style";
  }
  if (tags.has("workflow_improvement") || tags.has("workflow_guidance")) {
    return "workflow_improvement";
  }
  if (tags.has("project_fact")) {
    return "project_fact";
  }
  if (tags.has("recurring_procedure") || tags.has("procedure")) {
    return "recurring_procedure";
  }
  if (tags.has("project_rule")) {
    return "project_rule";
  }
  if (tags.has("unmet_need")) {
    return "unmet_need";
  }
  return undefined;
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
