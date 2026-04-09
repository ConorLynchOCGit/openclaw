import type { CanonicalMemoryRetrievalPlan } from "openclaw/plugin-sdk/memory-canonical-retrieval";
import type { MemoryFamilyApplicationMode } from "openclaw/plugin-sdk/memory-family-policy";
import {
  BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES,
  type BoundedWorkflowGuidanceCaptureClass,
} from "./config.js";
import type { MemoryObjectSearchHybridResult, RankedRetrievedMemoryRecord } from "./db/runtime.js";
import { readCanonicalMemoryRecordFromMetadata } from "./memory-canonical-compat.js";
import type { MemoryObjectQueryPort } from "./memory-object-query.js";
import { buildCanonicalMemoryRetrievalPlan } from "./retrieval-intent.js";

export type LearnedGuidanceAdvisoryPlanningInput = {
  query: string;
  projectId?: string;
  maxSuggestions?: number;
};

export type LearnedGuidanceAdvisoryPlanningSuggestion = {
  memoryObjectId: string;
  projectId?: string;
  score: number;
  memoryState: "approved" | "candidate";
  matchedFields: string[];
  content: string;
  captureClass: BoundedWorkflowGuidanceCaptureClass;
  subjectKey?: string;
  subject?: string;
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

export type LearnedGuidanceAdvisoryPlanningRolloutScope = {
  rolloutPhase: "bounded_rollout_proof_v1";
  enablementTarget: "default-off" | "off-production" | "production-canary";
  mode: "inline-only";
  source: "approved_preferred_workflow_guidance";
  approvedOnly: false;
  approvedPreferred: true;
  candidateAdvisoryIncluded: true;
  advisoryOnly: true;
  inlineOnly: true;
  allowedCaptureClasses: Array<BoundedWorkflowGuidanceCaptureClass>;
  defaultMaxSuggestions: number;
};

export type LearnedGuidanceAdvisoryPlanningObservability = {
  outcomeCode:
    | "guidance_available"
    | "conflict_suppressed"
    | "no_guidance"
    | "planner_disabled"
    | "retrieval_not_configured"
    | "retrieval_failed";
  retrievedRecordCount: number;
  eligibleWorkflowGuidanceCount: number;
  filteredOutByScopeCount: number;
  suggestionCount: number;
  suppressedConflictCount: number;
  nativeSuggestionCount: number;
  selfImprovingSuggestionCount: number;
  estimatedPromptTokens: number;
  reasons: string[];
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
  rolloutScope: LearnedGuidanceAdvisoryPlanningRolloutScope;
  observability: LearnedGuidanceAdvisoryPlanningObservability;
};

export type LearnedGuidanceAdvisoryPlanningRejectedResult = {
  accepted: false;
  status: "disabled" | "not_configured" | "failed" | "not_found";
  reason: string;
  rolloutScope?: LearnedGuidanceAdvisoryPlanningRolloutScope;
  observability: LearnedGuidanceAdvisoryPlanningObservability;
};

export type LearnedGuidanceAdvisoryPlanningResult =
  | LearnedGuidanceAdvisoryPlanningAcceptedResult
  | LearnedGuidanceAdvisoryPlanningRejectedResult;

export type LearnedGuidanceAdvisoryPlanningPort = {
  plan(input: LearnedGuidanceAdvisoryPlanningInput): Promise<LearnedGuidanceAdvisoryPlanningResult>;
};

type WorkflowGuidanceMetadata = {
  captureClass: BoundedWorkflowGuidanceCaptureClass;
  memoryState: "approved" | "candidate";
  subjectKey?: string;
  subject?: string;
  guidancePattern?: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
  provenance: "native_capture" | "self_improving_capture";
};

type WorkflowGuidanceRecord = Extract<RankedRetrievedMemoryRecord, { objectType: "memory_object" }>;

function buildRolloutScope(params: {
  enablementTarget: "default-off" | "off-production" | "production-canary";
  allowedCaptureClasses: ReadonlyArray<BoundedWorkflowGuidanceCaptureClass>;
  defaultMaxSuggestions: number;
}): LearnedGuidanceAdvisoryPlanningRolloutScope {
  return {
    rolloutPhase: "bounded_rollout_proof_v1",
    enablementTarget: params.enablementTarget,
    mode: "inline-only",
    source: "approved_preferred_workflow_guidance",
    approvedOnly: false,
    approvedPreferred: true,
    candidateAdvisoryIncluded: true,
    advisoryOnly: true,
    inlineOnly: true,
    allowedCaptureClasses: [...params.allowedCaptureClasses],
    defaultMaxSuggestions: params.defaultMaxSuggestions,
  };
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

function resolveWorkflowGuidanceProvenance(
  canonicalRecord: ReturnType<typeof readCanonicalMemoryRecordFromMetadata>,
): "native_capture" | "self_improving_capture" {
  const record = canonicalRecord;
  if (!record) {
    return "native_capture";
  }
  const captureClass = readOptionalString(record.facets, "captureClass");
  const provenanceOrigin = readOptionalString(record.facets, "provenanceOrigin");
  const captureSeam = readOptionalString(record.provenance, "captureSeam");
  const captureProfile = readOptionalString(record.provenance, "captureProfile");
  if (
    captureClass === "self_improving_capture" ||
    provenanceOrigin === "self_improving_capture" ||
    captureSeam === "self_improving_reduced_profile" ||
    captureProfile === "reduced_profile_candidate_only"
  ) {
    return "self_improving_capture";
  }
  return "native_capture";
}

function extractCanonicalWorkflowGuidanceMetadata(
  record: RankedRetrievedMemoryRecord,
  allowedCaptureClasses: ReadonlySet<BoundedWorkflowGuidanceCaptureClass>,
  canonicalPlan: CanonicalMemoryRetrievalPlan,
): WorkflowGuidanceMetadata | null {
  const canonicalRecord =
    record.objectType === "memory_object"
      ? readCanonicalMemoryRecordFromMetadata(asRecord(record.metadata))
      : null;
  if (
    !canonicalRecord ||
    record.objectType !== "memory_object" ||
    (record.reviewState !== "approved" && record.reviewState !== "candidate")
  ) {
    return null;
  }
  if (
    canonicalRecord.kind !== "feedback" ||
    !canonicalPlan.query.requestedKinds.includes("feedback") ||
    !canonicalRecord.tags.includes("workflow_guidance")
  ) {
    return null;
  }
  const workflowGuidanceFacet = canonicalRecord.facets.workflow_guidance;
  const captureClass = readOptionalString(canonicalRecord.facets, "captureClass");
  if (
    workflowGuidanceFacet !== true ||
    !captureClass ||
    !allowedCaptureClasses.has(captureClass as BoundedWorkflowGuidanceCaptureClass)
  ) {
    return null;
  }

  return {
    captureClass: captureClass as BoundedWorkflowGuidanceCaptureClass,
    memoryState: record.reviewState,
    subjectKey: readOptionalString(canonicalRecord.facets, "subjectKey"),
    subject: canonicalRecord.subject,
    guidancePattern: readOptionalString(canonicalRecord.facets, "guidancePattern"),
    recommendedAction:
      readOptionalString(canonicalRecord.facets, "recommendedAction") ?? canonicalRecord.statement,
    avoidAction: readOptionalString(canonicalRecord.facets, "avoidAction"),
    rationale: readOptionalString(canonicalRecord.facets, "rationale"),
    provenance: resolveWorkflowGuidanceProvenance(canonicalRecord),
  };
}

function extractWorkflowGuidanceMetadata(
  record: RankedRetrievedMemoryRecord,
  allowedCaptureClasses: ReadonlySet<BoundedWorkflowGuidanceCaptureClass>,
  canonicalPlan: CanonicalMemoryRetrievalPlan,
): WorkflowGuidanceMetadata | null {
  return extractCanonicalWorkflowGuidanceMetadata(record, allowedCaptureClasses, canonicalPlan);
}

function extractWorkflowGuidanceEntry(params: {
  record: RankedRetrievedMemoryRecord;
  allowedCaptureClasses: ReadonlySet<BoundedWorkflowGuidanceCaptureClass>;
  canonicalPlan: CanonicalMemoryRetrievalPlan;
}): {
  record: WorkflowGuidanceRecord;
  metadata: WorkflowGuidanceMetadata;
} | null {
  const metadata = extractWorkflowGuidanceMetadata(
    params.record,
    params.allowedCaptureClasses,
    params.canonicalPlan,
  );
  if (!metadata || params.record.objectType !== "memory_object") {
    return null;
  }
  return {
    record: params.record,
    metadata,
  };
}

function buildSuggestionSignature(metadata: WorkflowGuidanceMetadata, content: string): string {
  return [
    metadata.captureClass,
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
  const reasons = [
    metadata.memoryState === "approved"
      ? "matched approved workflow guidance through the normal retrieval path"
      : "matched candidate workflow guidance through the candidate-aware retrieval path",
  ];

  if (metadata.subject) {
    reasons.push(`matched workflow guidance about ${metadata.subject}`);
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
  allowedCaptureClasses: ReadonlySet<BoundedWorkflowGuidanceCaptureClass>;
  canonicalPlan: CanonicalMemoryRetrievalPlan;
}): {
  suggestions: LearnedGuidanceAdvisoryPlanningSuggestion[];
  suppressedConflicts: LearnedGuidanceAdvisoryConflict[];
  eligibleWorkflowGuidanceCount: number;
  filteredOutByScopeCount: number;
} {
  const grouped = new Map<
    string,
    Array<{ record: WorkflowGuidanceRecord; metadata: WorkflowGuidanceMetadata }>
  >();
  let eligibleWorkflowGuidanceCount = 0;
  let filteredOutByScopeCount = 0;

  for (const record of params.records) {
    const anyBoundedMetadata = extractWorkflowGuidanceMetadata(
      record,
      new Set(BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES),
      params.canonicalPlan,
    );
    const entry = extractWorkflowGuidanceEntry({
      record,
      allowedCaptureClasses: params.allowedCaptureClasses,
      canonicalPlan: params.canonicalPlan,
    });
    if (!entry) {
      if (
        anyBoundedMetadata &&
        !params.allowedCaptureClasses.has(anyBoundedMetadata.captureClass)
      ) {
        filteredOutByScopeCount += 1;
      }
      continue;
    }
    eligibleWorkflowGuidanceCount += 1;

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
          "multiple workflow-guidance records matched the same subject with competing advice, so inline advisory output was suppressed",
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
      memoryState: selected.metadata.memoryState,
      matchedFields: selected.record.matchedFields,
      content: selected.record.content,
      captureClass: selected.metadata.captureClass,
      ...(selected.metadata.subjectKey ? { subjectKey: selected.metadata.subjectKey } : {}),
      ...(selected.metadata.subject ? { subject: selected.metadata.subject } : {}),
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
    eligibleWorkflowGuidanceCount,
    filteredOutByScopeCount,
  };
}

function estimatePromptTokens(params: {
  advisoryNote: string;
  suggestions: LearnedGuidanceAdvisoryPlanningSuggestion[];
  suppressedConflicts: LearnedGuidanceAdvisoryConflict[];
  rationale: string[];
}): number {
  const corpus = [
    params.advisoryNote,
    ...params.rationale,
    ...params.suggestions.flatMap((suggestion) => [
      suggestion.content,
      ...suggestion.relevance,
      suggestion.recommendedAction ?? "",
      suggestion.avoidAction ?? "",
      suggestion.rationale ?? "",
    ]),
    ...params.suppressedConflicts.map((conflict) => conflict.reason),
  ].join(" ");
  return Math.max(1, Math.ceil(corpus.length / 4));
}

function buildRejectedResult(params: {
  result: Extract<MemoryObjectSearchHybridResult, { accepted: false }>;
  rolloutScope?: LearnedGuidanceAdvisoryPlanningRolloutScope;
}): LearnedGuidanceAdvisoryPlanningRejectedResult {
  return {
    accepted: false,
    status: params.result.status,
    reason: params.result.reason,
    ...(params.rolloutScope ? { rolloutScope: params.rolloutScope } : {}),
    observability: {
      outcomeCode:
        params.result.status === "not_configured" ? "retrieval_not_configured" : "retrieval_failed",
      retrievedRecordCount: 0,
      eligibleWorkflowGuidanceCount: 0,
      filteredOutByScopeCount: 0,
      suggestionCount: 0,
      suppressedConflictCount: 0,
      nativeSuggestionCount: 0,
      selfImprovingSuggestionCount: 0,
      estimatedPromptTokens: 0,
      reasons: [params.result.reason],
    },
  };
}

export function createLearnedGuidanceAdvisoryPlanningPort(params: {
  memoryObjectQuery: MemoryObjectQueryPort;
  mode: "disabled" | "inline-only";
  rolloutTarget?: "off-production" | "production-canary";
  allowedCaptureClasses?: ReadonlyArray<BoundedWorkflowGuidanceCaptureClass>;
  defaultMaxSuggestions?: number;
}): LearnedGuidanceAdvisoryPlanningPort {
  const applicationMode: MemoryFamilyApplicationMode = "guidance_only";
  const rolloutScope = buildRolloutScope({
    enablementTarget:
      params.rolloutTarget === "off-production" || params.rolloutTarget === "production-canary"
        ? params.rolloutTarget
        : "default-off",
    allowedCaptureClasses: params.allowedCaptureClasses ?? [
      ...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES,
    ],
    defaultMaxSuggestions: Math.min(Math.max(params.defaultMaxSuggestions ?? 3, 1), 10),
  });
  const allowedCaptureClasses = new Set(rolloutScope.allowedCaptureClasses);

  if (params.mode !== "inline-only" || rolloutScope.enablementTarget === "default-off") {
    return {
      async plan() {
        return {
          accepted: false,
          status: "disabled",
          reason:
            params.mode !== "inline-only"
              ? "learned guidance advisory planning mode is not enabled"
              : "learned guidance advisory planning is only enabled for an explicit off-production or production-canary rollout target",
          rolloutScope,
          observability: {
            outcomeCode: "planner_disabled",
            retrievedRecordCount: 0,
            eligibleWorkflowGuidanceCount: 0,
            filteredOutByScopeCount: 0,
            suggestionCount: 0,
            suppressedConflictCount: 0,
            nativeSuggestionCount: 0,
            selfImprovingSuggestionCount: 0,
            estimatedPromptTokens: 0,
            reasons: [
              params.mode !== "inline-only"
                ? "learned guidance advisory planning mode is not enabled"
                : "learned guidance advisory planning is only enabled for an explicit off-production or production-canary rollout target",
            ],
          },
        };
      },
    };
  }

  return {
    async plan(input) {
      const maxSuggestions = Math.min(
        Math.max(input.maxSuggestions ?? rolloutScope.defaultMaxSuggestions, 1),
        10,
      );
      const searchResult = await params.memoryObjectQuery.searchHybrid({
        query: input.query,
        scope: "include_candidates",
        kind: "project",
        ...(input.projectId ? { projectId: input.projectId } : {}),
        limit: Math.max(maxSuggestions * 3, 6),
      });

      if (!searchResult.accepted) {
        return buildRejectedResult({
          result: searchResult,
          rolloutScope: rolloutScope,
        });
      }

      const {
        suggestions,
        suppressedConflicts,
        eligibleWorkflowGuidanceCount,
        filteredOutByScopeCount,
      } = resolveGuidanceSuggestions({
        records: searchResult.records,
        maxSuggestions,
        allowedCaptureClasses,
        canonicalPlan: buildCanonicalMemoryRetrievalPlan({
          input: {
            query: input.query,
            kind: "project",
            scope: "include_candidates",
          },
        }),
      });
      const nativeSuggestionCount = suggestions.filter(
        (suggestion) => suggestion.provenance === "native_capture",
      ).length;
      const selfImprovingSuggestionCount = suggestions.length - nativeSuggestionCount;

      if (suggestions.length > 0) {
        const includesCandidateGuidance = suggestions.some(
          (suggestion) => suggestion.memoryState === "candidate",
        );
        const rationale = [
          includesCandidateGuidance
            ? "approved workflow guidance stayed authoritative while candidate guidance was allowed as provisional inline advice"
            : "approved workflow-guidance lessons matched the current query strongly enough to surface inline advice",
          "the planner stays suggestion-only and never changes execution authority by itself",
        ];
        const advisoryNote = includesCandidateGuidance
          ? "Advisory only. Approved workflow guidance remains authoritative, and candidate workflow guidance is surfaced as provisional inline advice without changing execution authority."
          : "Advisory only. Approved workflow guidance is surfaced as bounded inline suggestions and does not change execution authority.";
        return {
          accepted: true,
          status: "ok",
          outcome: "guidance_available",
          advisoryOnly: true,
          advisoryNote,
          query: input.query,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          applicationMode,
          suggestions,
          suppressedConflicts,
          rationale,
          rolloutScope: {
            ...rolloutScope,
            defaultMaxSuggestions: maxSuggestions,
          },
          observability: {
            outcomeCode: "guidance_available",
            retrievedRecordCount: searchResult.records.length,
            eligibleWorkflowGuidanceCount,
            filteredOutByScopeCount,
            suggestionCount: suggestions.length,
            suppressedConflictCount: suppressedConflicts.length,
            nativeSuggestionCount,
            selfImprovingSuggestionCount,
            estimatedPromptTokens: estimatePromptTokens({
              advisoryNote,
              suggestions,
              suppressedConflicts,
              rationale,
            }),
            reasons: [
              "approved workflow guidance matched the current query",
              ...(filteredOutByScopeCount > 0
                ? [
                    "some approved guidance stayed hidden because it was outside the rollout family scope",
                  ]
                : []),
            ],
          },
        };
      }

      const rationale =
        suppressedConflicts.length > 0
          ? [
              "matching approved workflow-guidance lessons conflicted for at least one subject key, so the planner suppressed advice instead of guessing",
            ]
          : [
              "no approved workflow-guidance lesson matched the current query strongly enough to justify inline advice",
            ];
      const advisoryNote =
        "Advisory only. No learned guidance was surfaced strongly enough to justify an inline suggestion.";
      return {
        accepted: true,
        status: "ok",
        outcome: suppressedConflicts.length > 0 ? "conflict_suppressed" : "no_guidance",
        advisoryOnly: true,
        advisoryNote,
        query: input.query,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        applicationMode,
        suggestions: [],
        suppressedConflicts,
        rationale,
        rolloutScope: {
          ...rolloutScope,
          defaultMaxSuggestions: maxSuggestions,
        },
        observability: {
          outcomeCode: suppressedConflicts.length > 0 ? "conflict_suppressed" : "no_guidance",
          retrievedRecordCount: searchResult.records.length,
          eligibleWorkflowGuidanceCount,
          filteredOutByScopeCount,
          suggestionCount: 0,
          suppressedConflictCount: suppressedConflicts.length,
          nativeSuggestionCount: 0,
          selfImprovingSuggestionCount: 0,
          estimatedPromptTokens: estimatePromptTokens({
            advisoryNote,
            suggestions: [],
            suppressedConflicts,
            rationale,
          }),
          reasons: [
            ...(suppressedConflicts.length > 0
              ? ["conflicting approved workflow guidance was suppressed instead of guessed"]
              : ["no approved workflow guidance matched strongly enough to surface inline advice"]),
            ...(filteredOutByScopeCount > 0
              ? [
                  "some approved guidance stayed hidden because it was outside the rollout family scope",
                ]
              : []),
          ],
        },
      };
    },
  };
}
