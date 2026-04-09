import { describe, expect, it, vi } from "vitest";
import type { CandidateIngressPort } from "./candidate-ingress.js";
import type { CandidateReviewPort } from "./candidate-review.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { createSelfImprovingCandidateCapturePort } from "./self-improving-candidate-capture.js";

function createConfig(): MemoryMiddlewareConfig {
  return {
    database: {
      driver: "postgres",
      schema: "memory_middleware",
      url: "",
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
    selfImprovingCapture: {
      mode: "candidate-only",
      rolloutTarget: "off-production",
      allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"],
    },
  };
}

describe("self-improving candidate capture", () => {
  it("submits canonical-first workflow-improvement candidates", async () => {
    const candidateIngress: CandidateIngressPort = {
      submitLearning: vi.fn(),
      submitCorrectionSuggestion: vi.fn(),
      submitProcedureSuggestion: vi.fn(),
      submitImprovementNote: vi.fn(async () => ({
        accepted: true as const,
        status: "accepted" as const,
        kind: "improvement" as const,
        storage: "database" as const,
        reviewState: "candidate" as const,
        eventId: "event-1",
        memoryObjectId: "memory-1",
      })),
    };
    const port = createSelfImprovingCandidateCapturePort({
      config: createConfig(),
      candidateIngress,
      candidateReview: {
        review: vi.fn(),
      } as unknown as CandidateReviewPort,
      mode: "candidate-only",
    });

    const result = await port.capture({
      kind: "improvement",
      projectId: "project-1",
      content: "Use scripts/committer for commits here instead of manual git add and git commit.",
    });

    expect(candidateIngress.submitImprovementNote).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          canonicalIngestionCandidate: expect.objectContaining({
            record: expect.objectContaining({
              kind: "feedback",
              compatibility: expect.objectContaining({
                transitionalFamilyId: "workflow_improvement",
              }),
            }),
            compatibility: expect.objectContaining({
              candidateKind: "improvement",
            }),
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      accepted: true,
      status: "accepted",
      kind: "improvement",
    });
  });
});
