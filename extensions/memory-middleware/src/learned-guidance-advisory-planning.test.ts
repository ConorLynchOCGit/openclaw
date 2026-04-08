import { describe, expect, it, vi } from "vitest";
import { createLearnedGuidanceAdvisoryPlanningPort } from "./learned-guidance-advisory-planning.js";

function createApprovedWorkflowRecord(params?: {
  id?: string;
  content?: string;
  score?: number;
  matchedFields?: string[];
  lessonFamily?: "supported_lesson" | "generalized_workflow_lesson";
  subjectKey?: string;
  recommendedAction?: string;
  avoidAction?: string;
  provenance?: "native_capture" | "self_improving_capture";
}) {
  return {
    objectType: "memory_object" as const,
    readSurface: "approved_memory_view" as const,
    id: params?.id ?? "memory-1",
    memoryKind: "project" as const,
    reviewState: "approved" as const,
    content:
      params?.content ??
      'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
    projectId: "project-1",
    metadata: {
      candidateMetadata: {
        autoCapture: {
          lessonFamily: params?.lessonFamily ?? "supported_lesson",
          subjectKey: params?.subjectKey ?? "subject-1",
          toolKey: "scripts_committer",
          lessonKey: "scripts_committer_required",
          guidancePattern: "use_instead_of",
          recommendedAction: params?.recommendedAction ?? 'scripts/committer "<msg>" <file...>',
          avoidAction: params?.avoidAction ?? "manual git add / git commit",
        },
        candidateLifecycle: {
          family: "workflow_improvement",
        },
        selfImprovingAdaptation:
          params?.provenance === "self_improving_capture"
            ? { origin: "self_improving_capture" }
            : undefined,
      },
    },
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    score: params?.score ?? 0.92,
    matchedFields: params?.matchedFields ?? ["fts_search_document"],
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
    });
  });

  it("surfaces approved workflow guidance as advisory-only inline suggestions", async () => {
    const searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "how should I commit scoped repo changes?",
      records: [createApprovedWorkflowRecord({ provenance: "self_improving_capture" })],
    }));
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid,
      } as never,
      mode: "inline-only",
    });

    const result = await port.plan({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
    });

    expect(searchHybrid).toHaveBeenCalledWith({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
      scope: "approved_only",
      kind: "project",
      limit: 9,
    });
    expect(result).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "guidance_available",
      advisoryOnly: true,
      applicationMode: "guidance_only",
      suggestions: [
        {
          memoryObjectId: "memory-1",
          provenance: "self_improving_capture",
          toolKey: "scripts_committer",
          guidancePattern: "use_instead_of",
        },
      ],
    });
  });

  it("suppresses conflicting workflow guidance for the same subject key", async () => {
    const port = createLearnedGuidanceAdvisoryPlanningPort({
      memoryObjectQuery: {
        searchHybrid: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
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
    });
  });
});
