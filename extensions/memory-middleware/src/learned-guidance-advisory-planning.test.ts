import { describe, expect, it, vi } from "vitest";
import { BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES } from "./config.js";
import { createLearnedGuidanceAdvisoryPlanningPort } from "./learned-guidance-advisory-planning.js";

function createApprovedWorkflowRecord(params?: {
  id?: string;
  content?: string;
  score?: number;
  matchedFields?: string[];
  captureClass?: "workflow_generalized_guidance";
  subjectKey?: string;
  recommendedAction?: string;
  avoidAction?: string;
  provenance?: "native_capture" | "self_improving_capture";
  reviewState?: "approved" | "candidate";
}) {
  return {
    objectType: "memory_object" as const,
    readSurface:
      params?.reviewState === "candidate"
        ? ("reviewable_candidates_view" as const)
        : ("approved_memory_view" as const),
    id: params?.id ?? "memory-1",
    memoryKind: "project" as const,
    reviewState: params?.reviewState ?? ("approved" as const),
    content:
      params?.content ??
      'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
    projectId: "project-1",
    metadata: {
      candidateMetadata: {
        canonicalIngestionCandidate: {
          record: {
            kind: "feedback",
            subject: "scoped commit workflow",
            statement: params?.recommendedAction ?? 'scripts/committer "<msg>" <file...>',
            tags: ["workflow_improvement", "workflow_guidance", "feedback"],
            facets: {
              workflow_guidance: true,
              captureClass: params?.captureClass ?? "workflow_generalized_guidance",
              subjectKey: params?.subjectKey ?? "subject-1",
              guidancePattern: "use_instead_of",
              recommendedAction: params?.recommendedAction ?? 'scripts/committer "<msg>" <file...>',
              avoidAction: params?.avoidAction ?? "manual git add / git commit",
              ...(params?.provenance ? { provenanceOrigin: params.provenance } : {}),
            },
            compatibility: {
              transitionalFamilyId: "workflow_improvement",
            },
          },
        },
      },
    },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    score: params?.score ?? 0.92,
    matchedFields: params?.matchedFields ?? ["fts_search_document"],
  };
}

function createApprovedCanonicalWorkflowRecord(params?: {
  id?: string;
  content?: string;
  score?: number;
  captureClass?: "workflow_generalized_guidance";
  subjectKey?: string;
}) {
  return {
    objectType: "memory_object" as const,
    readSurface: "approved_memory_view" as const,
    id: params?.id ?? "canonical-memory-1",
    memoryKind: "project" as const,
    reviewState: "approved" as const,
    content:
      params?.content ??
      'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
    projectId: "project-1",
    metadata: {
      candidateMetadata: {
        canonicalIngestionCandidate: {
          record: {
            kind: "feedback",
            subject: "scoped commit workflow",
            statement: 'scripts/committer "<msg>" <file...>',
            tags: ["workflow_improvement", "workflow_guidance", "feedback"],
            facets: {
              workflow_guidance: true,
              captureClass: params?.captureClass ?? "workflow_generalized_guidance",
              subjectKey: params?.subjectKey ?? "canonical-subject-1",
              guidancePattern: "use_instead_of",
              recommendedAction: 'scripts/committer "<msg>" <file...>',
              avoidAction: "manual git add / git commit",
            },
            compatibility: {
              transitionalFamilyId: "workflow_improvement",
            },
          },
        },
      },
    },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    score: params?.score ?? 0.93,
    matchedFields: ["generalized_recommended_action_match"],
  };
}

describe("learned-guidance advisory planning", () => {
  it("returns disabled when the inline advisory mode is off", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(),
      } as never,
      mode: "disabled",
    });

    await expect(port.plan({ query: "use the right commit path" })).resolves.toEqual({
      accepted: false,
      status: "disabled",
      reason: "learned guidance advisory planning mode is not enabled",
      rolloutScope: {
        rolloutPhase: "bounded_rollout_proof_v1",
        enablementTarget: "default-off",
        mode: "inline-only",
        source: "approved_preferred_workflow_guidance",
        approvedOnly: false,
        approvedPreferred: true,
        candidateAdvisoryIncluded: true,
        advisoryOnly: true,
        inlineOnly: true,
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
        defaultMaxSuggestions: 3,
      },
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
        reasons: ["learned guidance advisory planning mode is not enabled"],
      },
    });
  });

  it("stays disabled until an explicit off-production or production-canary rollout target is set", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(),
      } as never,
      mode: "inline-only",
    });

    await expect(
      port.plan({ query: "how should I commit scoped repo changes?" }),
    ).resolves.toMatchObject({
      accepted: false,
      status: "disabled",
      reason:
        "learned guidance advisory planning is only enabled for an explicit off-production or production-canary rollout target",
      rolloutScope: {
        enablementTarget: "default-off",
      },
      observability: {
        outcomeCode: "planner_disabled",
      },
    });
  });

  it("surfaces approved workflow guidance as advisory-only inline suggestions", async () => {
    const searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "include_candidates" as const,
      query: "how should I commit scoped repo changes?",
      records: [createApprovedWorkflowRecord({ provenance: "self_improving_capture" })],
    }));
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid,
      } as never,
      mode: "inline-only",
      rolloutTarget: "off-production",
    });

    const result = await port.plan({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
    });

    expect(searchHybrid).toHaveBeenCalledWith({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
      scope: "include_candidates",
      kind: "project",
      limit: 9,
    });
    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "guidance_available",
      advisoryOnly: true,
      applicationMode: "guidance_only",
      rolloutScope: {
        allowedCaptureClasses: [...BOUNDED_WORKFLOW_GUIDANCE_CAPTURE_CLASSES],
        defaultMaxSuggestions: 3,
      },
      suggestions: [
        {
          memoryObjectId: "memory-1",
          memoryState: "approved",
          provenance: "self_improving_capture",
          subject: "scoped commit workflow",
          guidancePattern: "use_instead_of",
        },
      ],
      observability: {
        outcomeCode: "guidance_available",
        retrievedRecordCount: 1,
        eligibleWorkflowGuidanceCount: 1,
        filteredOutByScopeCount: 0,
        suggestionCount: 1,
        selfImprovingSuggestionCount: 1,
      },
    });
  });

  it("prefers canonical workflow guidance metadata when available", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "include_candidates" as const,
          query: "how should I commit scoped repo changes?",
          records: [createApprovedCanonicalWorkflowRecord()],
        })),
      } as never,
      mode: "inline-only",
      rolloutTarget: "off-production",
    });

    await expect(
      port.plan({
        query: "how should I commit scoped repo changes?",
        projectId: "project-1",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      outcome: "guidance_available",
      suggestions: [
        {
          memoryObjectId: "canonical-memory-1",
          memoryState: "approved",
          captureClass: "workflow_generalized_guidance",
          subject: "scoped commit workflow",
          guidancePattern: "use_instead_of",
        },
      ],
    });
  });

  it("supports an explicit production-canary rollout target while staying advisory-only", async () => {
    const searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "include_candidates" as const,
      query: "how should I commit scoped repo changes?",
      records: [createApprovedWorkflowRecord({ provenance: "self_improving_capture" })],
    }));
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid,
      } as never,
      mode: "inline-only",
      rolloutTarget: "production-canary",
    });

    const result = await port.plan({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "guidance_available",
      advisoryOnly: true,
      rolloutScope: {
        enablementTarget: "production-canary",
      },
      observability: {
        outcomeCode: "guidance_available",
      },
    });
  });

  it("suppresses conflicting workflow guidance for the same subject key", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "include_candidates" as const,
          query: "which command should I trust for tests?",
          records: [
            createApprovedWorkflowRecord({
              id: "memory-a",
              subjectKey: "subject-shared",
              content: "Workflow improvement: use pnpm test -- path instead of raw vitest.",
              recommendedAction: "pnpm test -- path",
              avoidAction: "raw vitest",
            }),
            createApprovedWorkflowRecord({
              id: "memory-b",
              subjectKey: "subject-shared",
              content: "Workflow improvement: use pnpm test -- filter instead of raw vitest.",
              recommendedAction: "pnpm test -- filter",
              avoidAction: "raw vitest",
              score: 0.88,
            }),
          ],
        })),
      } as never,
      mode: "inline-only",
      rolloutTarget: "off-production",
    });

    const result = await port.plan({
      query: "which command should I trust for tests?",
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "conflict_suppressed",
      suggestions: [],
      suppressedConflicts: [
        {
          subjectKey: "subject-shared",
          memoryObjectIds: ["memory-a", "memory-b"],
        },
      ],
      observability: {
        outcomeCode: "conflict_suppressed",
        suppressedConflictCount: 1,
        suggestionCount: 0,
      },
    });
  });

  it("keeps approved guidance outside the configured rollout scope suppressed", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "include_candidates" as const,
          query: "how should I run tests here?",
          records: [
            createApprovedWorkflowRecord({
              captureClass: "workflow_generalized_guidance",
              content: "Workflow improvement: use pnpm test -- path instead of raw vitest.",
              recommendedAction: "pnpm test -- path",
              avoidAction: "raw vitest",
            }),
          ],
        })),
      } as never,
      mode: "inline-only",
      rolloutTarget: "off-production",
      allowedCaptureClasses: [],
    });

    const result = await port.plan({
      query: "how should I run tests here?",
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "no_guidance",
      suggestions: [],
      rolloutScope: {
        allowedCaptureClasses: [],
      },
      observability: {
        outcomeCode: "no_guidance",
        eligibleWorkflowGuidanceCount: 0,
        filteredOutByScopeCount: 1,
      },
    });
  });

  it("surfaces candidate workflow guidance as provisional inline advice when no approved record exists", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "include_candidates" as const,
          query: "how should I run tests here?",
          records: [
            createApprovedWorkflowRecord({
              id: "candidate-guidance-1",
              reviewState: "candidate",
              provenance: "self_improving_capture",
            }),
          ],
        })),
      } as never,
      mode: "inline-only",
      rolloutTarget: "off-production",
    });

    await expect(
      port.plan({
        query: "how should I run tests here?",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      outcome: "guidance_available",
      suggestions: [
        {
          memoryObjectId: "candidate-guidance-1",
          memoryState: "candidate",
          provenance: "self_improving_capture",
        },
      ],
      advisoryNote:
        "Advisory only. Approved workflow guidance remains authoritative, and candidate workflow guidance is surfaced as provisional inline advice without changing execution authority.",
    });
  });
});
