import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceRecurringProcedureCandidateStages,
  buildRecurringProcedureStagedInspection,
} from "./recurring-procedure-staged-substrate.js";

const storeValidatedProcedureSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));

vi.mock("./semantic-retrieval-routing.js", () => ({
  storeValidatedProcedureSemanticEmbedding,
}));

describe("buildRecurringProcedureStagedInspection", () => {
  it("marks a validated procedure lifecycle as validated stage", () => {
    expect(
      buildRecurringProcedureStagedInspection({
        matchingValidatedProcedureId: "procedure-1",
        activeValidatedSubjectProcedureIds: ["procedure-1"],
        pendingSubjectCandidateIds: [],
      }),
    ).toMatchObject({
      stage: "validated",
      hasActiveValidatedSubjectTargets: true,
      matchingValidatedProcedureId: "procedure-1",
    });
  });

  it("marks a pending recurring procedure candidate as candidate stage", () => {
    expect(
      buildRecurringProcedureStagedInspection({
        pendingCandidate: {
          id: "candidate-1",
          sourceEventId: "event-1",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        activeValidatedSubjectProcedureIds: [],
        pendingSubjectCandidateIds: ["candidate-1"],
      }),
    ).toMatchObject({
      stage: "candidate",
      hasActiveValidatedSubjectTargets: false,
      pendingCandidate: {
        id: "candidate-1",
      },
    });
  });
});

describe("advanceRecurringProcedureCandidateStages", () => {
  beforeEach(() => {
    storeValidatedProcedureSemanticEmbedding.mockClear();
  });

  it("advances a candidate through draft and validated stages on the shared staged substrate", async () => {
    const reviewCandidate = vi.fn(async () => ({
      accepted: true as const,
      status: "recorded" as const,
      candidateId: "candidate-1",
      outcome: "accepted" as const,
      reviewId: "review-1",
      memoryObjectStateChanged: false,
      reviewState: "candidate" as const,
    }));
    const promoteToProcedureDraft = vi.fn(async () => ({
      accepted: true as const,
      status: "promoted" as const,
      candidateId: "candidate-1",
      procedureId: "procedure-draft-1",
      procedureStatus: "draft" as const,
      sourceEventId: "event-1",
    }));
    const validateProcedure = vi.fn(async () => ({
      accepted: true as const,
      status: "validated" as const,
      procedureId: "procedure-valid-1",
      procedureStatus: "validated" as const,
      procedureRunId: "procedure-run-1",
      sourceCandidateId: "candidate-1",
    }));
    const supersedeValidated = vi.fn(async () => ({
      accepted: true as const,
      status: "already_superseded" as const,
      supersededProcedureIds: [],
    }));

    const result = await advanceRecurringProcedureCandidateStages({
      config: {
        database: {
          driver: "postgres",
          url: "postgres://example.test/openclaw",
        },
      } as never,
      candidateId: "candidate-1",
      title: "Deploy checklist",
      subjectKey: "deploy_checklist",
      correctionPlan: null,
      agentExternalKey: "main",
      sessionKey: "agent:main:main",
      reviewCandidate,
      promoteToProcedureDraft,
      validateProcedure,
      supersedeValidatedProceduresBySubjectKey: supersedeValidated,
      metadata: { source: "unit-test" },
      logLabel: "recurring-procedure",
      logContext: { subjectKey: "deploy_checklist" },
    });

    expect(result).toMatchObject({
      accepted: true,
      stage: "validated",
      artifacts: {
        candidateId: "candidate-1",
        candidateEventId: "event-1",
        draftProcedureId: "procedure-draft-1",
        validatedProcedureId: "procedure-valid-1",
        procedureRunId: "procedure-run-1",
      },
    });
    expect(reviewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "candidate-1", outcome: "accepted" }),
    );
    expect(promoteToProcedureDraft).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "candidate-1", title: "Deploy checklist" }),
    );
    expect(validateProcedure).toHaveBeenCalledWith(
      expect.objectContaining({ procedureId: "procedure-draft-1" }),
    );
    expect(supersedeValidated).not.toHaveBeenCalled();
    expect(storeValidatedProcedureSemanticEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "main",
        sessionKey: "agent:main:main",
        procedureId: "procedure-valid-1",
      }),
    );
  });

  it("uses the same staged helper for correction promotion and validated supersede", async () => {
    const supersedeValidated = vi.fn(async () => ({
      accepted: true as const,
      status: "superseded" as const,
      supersededProcedureIds: ["procedure-old-1"],
    }));

    const result = await advanceRecurringProcedureCandidateStages({
      config: {
        database: {
          driver: "postgres",
          url: "postgres://example.test/openclaw",
        },
      } as never,
      candidateId: "candidate-1",
      title: "Deploy checklist",
      subjectKey: "deploy_checklist",
      correctionPlan: {
        status: "execute",
        reason: "procedure correction should supersede the active validated subject target",
        executionKind: "validated_procedure_supersede",
        supersedeTargetIds: ["procedure-old-1"],
      },
      reviewCandidate: vi.fn(async () => ({
        accepted: true as const,
        status: "recorded" as const,
        candidateId: "candidate-1",
        outcome: "accepted" as const,
        reviewId: "review-1",
        memoryObjectStateChanged: false,
        reviewState: "candidate" as const,
      })),
      promoteToProcedureDraft: vi.fn(async () => ({
        accepted: true as const,
        status: "promoted" as const,
        candidateId: "candidate-1",
        procedureId: "procedure-draft-1",
        procedureStatus: "draft" as const,
        sourceEventId: "event-1",
      })),
      validateProcedure: vi.fn(async () => ({
        accepted: true as const,
        status: "validated" as const,
        procedureId: "procedure-valid-1",
        procedureStatus: "validated" as const,
        procedureRunId: "procedure-run-1",
        sourceCandidateId: "candidate-1",
      })),
      supersedeValidatedProceduresBySubjectKey: supersedeValidated,
      metadata: { source: "unit-test" },
      logLabel: "recurring-procedure",
      logContext: { correctionPromotion: true },
    });

    expect(result).toMatchObject({
      accepted: true,
      stage: "validated",
      artifacts: {
        validatedProcedureId: "procedure-valid-1",
      },
    });
    expect(supersedeValidated).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectKey: "deploy_checklist",
        supersededByProcedureId: "procedure-valid-1",
      }),
    );
  });
});
