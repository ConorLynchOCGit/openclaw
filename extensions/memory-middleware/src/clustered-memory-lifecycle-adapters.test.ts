import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";

const inspectClusteredMemoryObjectLifecycle = vi.hoisted(() => vi.fn());

vi.mock("./clustered-memory-lifecycle.js", async () => {
  const actual = await vi.importActual<typeof import("./clustered-memory-lifecycle.js")>(
    "./clustered-memory-lifecycle.js",
  );
  return {
    ...actual,
    inspectClusteredMemoryObjectLifecycle,
  };
});

import { inspectProjectFactLifecycle } from "./project-fact-lifecycle.js";
import { inspectWorkflowImprovementLifecycle } from "./workflow-improvement-lifecycle.js";

function createConfig(): MemoryMiddlewareConfig {
  return {
    database: {
      driver: "postgres",
      schema: "memory_middleware",
      url: "postgres://memory:test@127.0.0.1:5432/openclaw",
    },
    candidateIngress: {
      mode: "submit-review-only",
    },
    memoryObjectQuery: {
      mode: "read-only",
    },
    backgroundJobs: {
      inspectionMode: "disabled",
      advisorySchedulingMode: "disabled",
      executeSchedulingMode: "disabled",
      advisoryJobClasses: ["proactive_plan"],
      executeJobClasses: ["proactive_execute_run_drift_check"],
    },
    autoCapture: {
      profile: "user-preference-v2",
      allowedAgents: ["chief", "main"],
    },
    autoPromotion: {
      profile: "explicit-user-preference-v1",
      allowedAgents: ["chief", "main"],
    },
  };
}

describe("clustered lifecycle adapters", () => {
  it("routes project-fact lifecycle inspection through the shared engine", async () => {
    inspectClusteredMemoryObjectLifecycle.mockResolvedValueOnce({
      matchingApprovedObjectId: "approved-fact-1",
      pendingCandidate: {
        id: "candidate-fact-1",
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        confirmationState: "hold_for_more_evidence",
      },
      activeApprovedSubjectObjectIds: ["approved-fact-1"],
      pendingSubjectCandidateIds: ["candidate-fact-1"],
      activeApprovedSubjectEntries: [
        {
          id: "approved-fact-1",
          reviewState: "approved",
          createdAt: "2026-04-07T00:00:00.000Z",
          updatedAt: "2026-04-07T00:00:00.000Z",
          projectScope: "Atlas",
          normalizedProjectScope: "atlas",
          subjectKey: "project-fact-subject",
        },
      ],
      pendingSubjectCandidates: [],
    });

    await expect(
      inspectProjectFactLifecycle({
        config: createConfig(),
        key: "project-fact-key",
        subjectKey: "project-fact-subject",
        projectId: "00000000-0000-4000-8000-000000000123",
      }),
    ).resolves.toMatchObject({
      matchingApprovedObjectId: "approved-fact-1",
      activeApprovedSubjectObjectIds: ["approved-fact-1"],
      pendingSubjectCandidateIds: ["candidate-fact-1"],
    });

    expect(inspectClusteredMemoryObjectLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        logLabel: "project-fact",
        projectScoped: true,
        projectId: "00000000-0000-4000-8000-000000000123",
        pendingStates: ["pending_confirmation", "hold_for_more_evidence"],
      }),
    );
  });

  it("routes workflow-improvement lifecycle inspection through the shared engine", async () => {
    inspectClusteredMemoryObjectLifecycle.mockResolvedValueOnce({
      matchingApprovedObjectId: "approved-workflow-1",
      pendingCandidate: {
        id: "candidate-workflow-1",
        createdAt: "2026-04-07T00:00:00.000Z",
        updatedAt: "2026-04-07T00:00:00.000Z",
        confirmationState: "review_required",
      },
      activeApprovedSubjectObjectIds: ["approved-workflow-1"],
      pendingSubjectCandidateIds: ["candidate-workflow-1"],
      activeApprovedSubjectEntries: [
        {
          id: "approved-workflow-1",
          reviewState: "approved",
          createdAt: "2026-04-07T00:00:00.000Z",
          updatedAt: "2026-04-07T00:00:00.000Z",
          lessonFamily: "generalized_project_rule",
          guidancePattern: "use_instead_of",
          subjectKey: "workflow-subject",
        },
      ],
      pendingSubjectCandidates: [],
    });

    await expect(
      inspectWorkflowImprovementLifecycle({
        config: createConfig(),
        key: "workflow-key",
        subjectKey: "workflow-subject",
        projectId: "00000000-0000-4000-8000-000000000321",
      }),
    ).resolves.toMatchObject({
      matchingApprovedObjectId: "approved-workflow-1",
      activeApprovedSubjectObjectIds: ["approved-workflow-1"],
      pendingSubjectCandidateIds: ["candidate-workflow-1"],
    });

    expect(inspectClusteredMemoryObjectLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        logLabel: "workflow-improvement",
        projectScoped: true,
        projectId: "00000000-0000-4000-8000-000000000321",
        pendingStates: ["pending_confirmation", "review_required", "hold_for_more_evidence"],
      }),
    );
  });
});
