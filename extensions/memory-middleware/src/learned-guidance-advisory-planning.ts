import type { MemoryObjectSearchHybridResult, RankedRetrievedMemoryRecord } from "./db/runtime.js";
import {
  getMemoryFamilyPolicy,
  type MemoryFamilyApplicationMode,
} from "./memory-family-registry.js";
import type { MemoryObjectQueryPort } from "./memory-object-query.js";

export type LearnedGuidanceAdvisoryPlanningInput = {
  query: string;
  projectId?: string;
  maxSuggestions?: number;
};

export type LearnedGuidanceAdvisoryPlanningSuggestion = {
  memoryObjectId: string;
  projectId?: string;
  score: number;
  matchedFields: string[];
  content: string;
  lessonFamily: "supported_lesson" | "generalized_workflow_lesson";
  subjectKey?: string;
  lessonKey?: string;
  toolKey?: string;
  guidancePattern?: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
  provenance: "native_capture" | "self_improving_capture";
  relevance: string[];
};

export type LearnedGuidanceAdvisoryConflict = {
  subjectKey: string;
  memoryObjectIds: string[];
  reason: string;
};

export type LearnedGuidanceAdvisoryPlanningAcceptedResult = {
  accepted: true;
  status: "ok";
  outcome: "guidance_available" | "no_guidance" | "conflict_suppressed";
  advisoryOnly: true;
  advisoryNote: string;
  query: string;
  projectId?: string;
  applicationMode: MemoryFamilyApplicationMode;
  suggestions: LearnedGuidanceAdvisoryPlanningSuggestion[];
  suppressedConflicts: LearnedGuidanceAdvisoryConflict[];
  rationale: string[];
};

export type LearnedGuidanceAdvisoryPlanningRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
};

export type LearnedGuidanceAdvisoryPlanningResult =
  | LearnedGuidanceAdvisoryPlanningAcceptedResult
  | LearnedGuidanceAdvisoryPlanningRejectedResult;

export type LearnedGuidanceAdvisoryPlanningPort = {
  plan(input: LearnedGuidanceAdvisoryPlanningInput): Promise<LearnedGuidanceAdvisoryPlanningResult>;
};

type WorkflowGuidanceMetadata = {
  lessonFamily: "supported_lesson" | "generalized_workflow_lesson";
  subjectKey?: string;
  lessonKey?: string;
  toolKey?: string;
  guidancePattern?: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
  provenance: "native_capture" | "self_improving_capture";
};

type WorkflowGuidanceRecord = Extract<RankedRetrievedMemoryRecord, { objectType: "memory_object" }>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function extractWorkflowGuidanceMetadata(
  record: RankedRetrievedMemoryRecord,
): WorkflowGuidanceMetadata | null {
  if (record.objectType !== "memory_object" || record.reviewState !== "approved") {
    return null;
  }

  const metadata = asRecord(record.metadata);
  const candidateMetadata = asRecord(metadata.candidateMetadata);
  const autoCapture = asRecord(candidateMetadata.autoCapture);
  const lifecycle = asRecord(candidateMetadata.candidateLifecycle);
  const adaptation = asRecord(candidateMetadata.selfImprovingAdaptation);
  const lessonFamily = readOptionalString(autoCapture, "lessonFamily");

  if (lessonFamily !== "supported_lesson" && lessonFamily !== "generalized_workflow_lesson") {
    return null;
  }

  const family = readOptionalString(lifecycle, "family");
  if (family && family !== "workflow_improvement") {
    return null;
  }

  return {
    lessonFamily,
    subjectKey: readOptionalString(autoCapture, "subjectKey"),
    lessonKey: readOptionalString(autoCapture, "lessonKey"),
    toolKey: readOptionalString(autoCapture, "toolKey"),
    guidancePattern: readOptionalString(autoCapture, "guidancePattern"),
    recommendedAction: readOptionalString(autoCapture, "recommendedAction"),
    avoidAction: readOptionalString(autoCapture, "avoidAction"),
    rationale: readOptionalString(autoCapture, "rationale"),
    provenance:
      readOptionalString(adaptation, "origin") === "self_improving_capture"
        ? "self_improving_capture"
        : "native_capture",
  };
}

function extractWorkflowGuidanceEntry(record: RankedRetrievedMemoryRecord): {
  record: WorkflowGuidanceRecord;
  metadata: WorkflowGuidanceMetadata;
} | null {
  const metadata = extractWorkflowGuidanceMetadata(record);
  if (!metadata || record.objectType !== "memory_object") {
    return null;
  }
  return {
    record,
    metadata,
  };
}

function buildSuggestionSignature(metadata: WorkflowGuidanceMetadata, content: string): string {
  return [
    metadata.lessonFamily,
    metadata.subjectKey ?? "",
    metadata.guidancePattern ?? "",
    metadata.recommendedAction ?? "",
    metadata.avoidAction ?? "",
    content.trim(),
  ].join("|");
}

function buildRelevance(
  record: RankedRetrievedMemoryRecord,
  metadata: WorkflowGuidanceMetadata,
): string[] {
  const reasons = ["matched approved workflow guidance through the normal approved retrieval path"];

  if (metadata.toolKey) {
    reasons.push(`matched workflow guidance for ${metadata.toolKey}`);
  }
  if (metadata.guidancePattern === "use_instead_of") {
    reasons.push("guidance suggests one bounded workflow choice over another");
  } else if (metadata.guidancePattern === "trust_for_scope") {
    reasons.push("guidance narrows which signal to trust for this scope");
  } else if (metadata.guidancePattern === "avoid_only") {
    reasons.push("guidance warns against a specific workflow move");
  }
  if (record.matchedFields.length > 0) {
    reasons.push(`matched fields: ${record.matchedFields.join(", ")}`);
  }

  return reasons;
}

function resolveGuidanceSuggestions(params: {
  records: RankedRetrievedMemoryRecord[];
  maxSuggestions: number;
}): {
  suggestions: LearnedGuidanceAdvisoryPlanningSuggestion[];
  suppressedConflicts: LearnedGuidanceAdvisoryConflict[];
} {
  const grouped = new Map<
    string,
    Array<{ record: WorkflowGuidanceRecord; metadata: WorkflowGuidanceMetadata }>
  >();

  for (const record of params.records) {
    const entry = extractWorkflowGuidanceEntry(record);
    if (!entry) {
      continue;
    }
    const groupKey = entry.metadata.subjectKey ?? entry.record.id;
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(entry);
    } else {
      grouped.set(groupKey, [entry]);
    }
  }

  const suggestions: LearnedGuidanceAdvisoryPlanningSuggestion[] = [];
  const suppressedConflicts: LearnedGuidanceAdvisoryConflict[] = [];

  for (const [subjectKey, entries] of grouped) {
    entries.sort((left, right) => right.record.score - left.record.score);
    const signatures = new Set(
      entries.map(({ record, metadata }) => buildSuggestionSignature(metadata, record.content)),
    );
    if (signatures.size > 1) {
      suppressedConflicts.push({
        subjectKey,
        memoryObjectIds: entries.map(({ record }) => record.id),
        reason:
          "multiple approved workflow-guidance lessons matched the same subject with competing advice, so inline advisory output was suppressed",
      });
      continue;
    }

    const selected = entries[0];
    if (!selected) {
      continue;
    }

    suggestions.push({
      memoryObjectId: selected.record.id,
      ...(selected.record.projectId ? { projectId: selected.record.projectId } : {}),
      score: selected.record.score,
      matchedFields: selected.record.matchedFields,
      content: selected.record.content,
      lessonFamily: selected.metadata.lessonFamily,
      ...(selected.metadata.subjectKey ? { subjectKey: selected.metadata.subjectKey } : {}),
      ...(selected.metadata.lessonKey ? { lessonKey: selected.metadata.lessonKey } : {}),
      ...(selected.metadata.toolKey ? { toolKey: selected.metadata.toolKey } : {}),
      ...(selected.metadata.guidancePattern
        ? { guidancePattern: selected.metadata.guidancePattern }
        : {}),
      ...(selected.metadata.recommendedAction
        ? { recommendedAction: selected.metadata.recommendedAction }
        : {}),
      ...(selected.metadata.avoidAction ? { avoidAction: selected.metadata.avoidAction } : {}),
      ...(selected.metadata.rationale ? { rationale: selected.metadata.rationale } : {}),
      provenance: selected.metadata.provenance,
      relevance: buildRelevance(selected.record, selected.metadata),
    });
  }

  suggestions.sort((left, right) => right.score - left.score);

  return {
    suggestions: suggestions.slice(0, params.maxSuggestions),
    suppressedConflicts,
  };
}

function buildRejectedResult(
  result: Extract<MemoryObjectSearchHybridResult, { accepted: false }>,
): LearnedGuidanceAdvisoryPlanningRejectedResult {
  return {
    accepted: false,
    status: result.status,
    reason: result.reason,
  };
}

export function createLearnedGuidanceAdvisoryPlanningPort(params: {
  memoryObjectQuery: MemoryObjectQueryPort;
  mode: "disabled" | "inline-only";
}): LearnedGuidanceAdvisoryPlanningPort {
  const applicationMode = getMemoryFamilyPolicy("workflow_improvement").applicationPolicy.mode;

  if (params.mode !== "inline-only") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason: "learned guidance advisory planning mode is not enabled",
        };
      },
    };
  }

  return {
    async plan(input) {
      const maxSuggestions = Math.min(Math.max(input.maxSuggestions ?? 3, 1), 10);
      const searchResult = await params.memoryObjectQuery.searchHybrid({
        query: input.query,
        scope: "approved_only",
        kind: "project",
        ...(input.projectId ? { projectId: input.projectId } : {}),
        limit: Math.max(maxSuggestions * 3, 6),
      });

      if (!searchResult.accepted) {
        return buildRejectedResult(searchResult);
      }

      const { suggestions, suppressedConflicts } = resolveGuidanceSuggestions({
        records: searchResult.records,
        maxSuggestions,
      });

      if (suggestions.length > 0) {
        return {
          accepted: true,
          status: "ok",
          outcome: "guidance_available",
          advisoryOnly: true,
          advisoryNote:
            "Advisory only. Approved workflow guidance is surfaced as bounded inline suggestions and does not change execution authority.",
          query: input.query,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          applicationMode,
          suggestions,
          suppressedConflicts,
          rationale: [
            "approved workflow-guidance lessons matched the current query strongly enough to surface inline advice",
            "durable memory remains the authority and the planner stays suggestion-only",
          ],
        };
      }

      return {
        accepted: true,
        status: "ok",
        outcome: suppressedConflicts.length > 0 ? "conflict_suppressed" : "no_guidance",
        advisoryOnly: true,
        advisoryNote:
          "Advisory only. No learned guidance was surfaced strongly enough to justify an inline suggestion.",
        query: input.query,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        applicationMode,
        suggestions: [],
        suppressedConflicts,
        rationale:
          suppressedConflicts.length > 0
            ? [
                "matching approved workflow-guidance lessons conflicted for at least one subject key, so the planner suppressed advice instead of guessing",
              ]
            : [
                "no approved workflow-guidance lesson matched the current query strongly enough to justify inline advice",
              ],
      };
    },
  };
}
