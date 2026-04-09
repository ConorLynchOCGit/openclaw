import { describe, expect, it, vi } from "vitest";
import {
  attemptApprovedMemoryObjectCorrectionPromotion,
  executeMemoryObjectCorrectionPlan,
  isExecutableMemoryObjectCorrectionPlan,
  resolveMemoryCorrectionPlan,
  resolveMemoryCorrectionPromotionPolicy,
} from "./memory-correction-engine.js";

describe("resolveMemoryCorrectionPlan", () => {
  it("maps auto-promotion profiles onto a closed correction policy", () => {
    expect(resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1")).toBe(
      "allow_immediate_bounded_correction",
    );
    expect(resolveMemoryCorrectionPromotionPolicy("disabled")).toBe(
      "defer_immediate_bounded_correction",
    );
  });

  it("executes immediate bounded correction for response style when an approved subject target exists", () => {
    const plan = resolveMemoryCorrectionPlan({
      familyId: "response_style",
      trigger: "explicit_correction",
      promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
      activeApprovedSubjectObjectIds: ["memory-approved-1"],
    });
    expect(plan).toEqual({
      status: "execute",
      reason: "bounded correction should immediately supersede an approved subject target",
      executionKind: "approved_memory_object_supersede",
      supersedeTargetIds: ["memory-approved-1"],
    });
    expect(isExecutableMemoryObjectCorrectionPlan(plan)).toBe(true);
  });

  it("holds unmet-need corrections even when a target exists", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "unmet_need",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeApprovedSubjectObjectIds: ["memory-approved-need-1"],
      }),
    ).toEqual({
      status: "hold",
      reason: "family correction policy remains held until a later slice activates it",
      executionKind: "hold",
      supersedeTargetIds: [],
    });
  });

  it("executes recurring-procedure correction through the validated-procedure supersede path", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeValidatedSubjectProcedureIds: ["procedure-1"],
      }),
    ).toEqual({
      status: "execute",
      reason:
        "bounded correction should immediately validate and supersede the active procedure subject",
      executionKind: "validated_procedure_supersede",
      supersedeTargetIds: ["procedure-1"],
    });
  });

  it("allows recurring-procedure correction planning even when no validated target is present yet", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "recurring_procedure",
        trigger: "explicit_correction",
        promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
        activeValidatedSubjectProcedureIds: [],
      }),
    ).toEqual({
      status: "execute",
      reason:
        "bounded correction should immediately validate and supersede the active procedure subject",
      executionKind: "validated_procedure_supersede",
      supersedeTargetIds: [],
    });
  });

  it("executes cluster auto-review supersede for generalized workflow-family conflicts", () => {
    expect(
      resolveMemoryCorrectionPlan({
        familyId: "project_rule",
        trigger: "cluster_auto_review",
        conflictingApprovedObjectIds: ["memory-rule-1", "memory-rule-2"],
      }),
    ).toEqual({
      status: "execute",
      reason: "cluster auto-review supersedes older conflicting approved subject targets",
      executionKind: "approved_memory_object_supersede",
      supersedeTargetIds: ["memory-rule-1", "memory-rule-2"],
    });
  });

  it("supports custom supersede executors for canonical clustered promotions", async () => {
    const reviewCandidate = vi.fn(async () => ({ accepted: true as const }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-new-1",
    }));
    const supersedeTargets = vi.fn(async () => ({ accepted: true as const }));

    const result = await executeMemoryObjectCorrectionPlan({
      familyId: "workflow_improvement",
      plan: {
        status: "execute",
        reason: "cluster auto-review supersedes older conflicting approved subject targets",
        executionKind: "approved_memory_object_supersede",
        supersedeTargetIds: ["memory-old-1"],
      },
      candidateId: "candidate-1",
      reviewCandidate,
      promoteToMemory,
      promotionMetadata: { source: "test" },
      reviewerAgentId: "agent-1",
      config: { database: { url: "", schema: "memory_middleware" } },
      schema: "memory_middleware",
      logContext: { candidateId: "candidate-1" },
      logLabel: "workflow-improvement auto-review",
      supersedeRationale: "superseded by clustered evidence",
      supersedeSource: "test",
      supersedeReason: "test",
      supersedeTargets,
    });

    expect(result).toEqual({
      accepted: true,
      promotedMemoryObjectId: "memory-new-1",
    });
    expect(reviewCandidate).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      outcome: "accepted",
      reviewerAgentId: "agent-1",
      metadata: { source: "test" },
    });
    expect(promoteToMemory).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      promoterAgentId: "agent-1",
      metadata: { source: "test" },
    });
    expect(supersedeTargets).toHaveBeenCalledWith({
      promotedMemoryObjectId: "memory-new-1",
      supersedeTargetIds: ["memory-old-1"],
    });
  });

  it("returns a non-executable attempt without invoking promotion hooks", async () => {
    const reviewCandidate = vi.fn(async () => ({ accepted: true as const }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-new-1",
    }));

    const result = await attemptApprovedMemoryObjectCorrectionPromotion({
      familyId: "project_fact",
      trigger: "explicit_correction",
      promotionPolicy: resolveMemoryCorrectionPromotionPolicy("disabled"),
      activeApprovedSubjectObjectIds: ["memory-old-1"],
      candidateId: "candidate-1",
      reviewCandidate,
      promoteToMemory,
      promotionMetadata: { source: "test" },
      config: { database: { url: "", schema: "memory_middleware" } },
      schema: "memory_middleware",
      logContext: { candidateId: "candidate-1" },
      logLabel: "project-fact correction",
      supersedeRationale: "superseded by correction",
      supersedeSource: "test",
      supersedeReason: "test",
    });

    expect(result).toEqual({
      kind: "not_executable",
      plan: {
        status: "skip",
        reason: "correction promotion policy does not permit immediate correction promotion",
        executionKind: "approved_memory_object_supersede",
        supersedeTargetIds: [],
      },
    });
    expect(reviewCandidate).not.toHaveBeenCalled();
    expect(promoteToMemory).not.toHaveBeenCalled();
  });

  it("executes an approved-memory correction attempt through the shared helper", async () => {
    const reviewCandidate = vi.fn(async () => ({ accepted: true as const }));
    const promoteToMemory = vi.fn(async () => ({
      accepted: true as const,
      promotedMemoryObjectId: "memory-new-1",
    }));

    const result = await attemptApprovedMemoryObjectCorrectionPromotion({
      familyId: "project_fact",
      trigger: "explicit_correction",
      promotionPolicy: resolveMemoryCorrectionPromotionPolicy("explicit-user-preference-v1"),
      activeApprovedSubjectObjectIds: ["memory-old-1"],
      candidateId: "candidate-1",
      reviewerAgentId: "agent-1",
      reviewCandidate,
      promoteToMemory,
      promotionMetadata: { source: "test" },
      config: { database: { url: "", schema: "memory_middleware" } },
      schema: "memory_middleware",
      logContext: { candidateId: "candidate-1" },
      logLabel: "project-fact correction",
      supersedeRationale: "superseded by correction",
      supersedeSource: "test",
      supersedeReason: "test",
    });

    expect(result).toEqual({
      kind: "executed",
      plan: {
        status: "execute",
        reason: "bounded correction should immediately supersede an approved subject target",
        executionKind: "approved_memory_object_supersede",
        supersedeTargetIds: ["memory-old-1"],
      },
      accepted: true,
      promotedMemoryObjectId: "memory-new-1",
    });
    expect(reviewCandidate).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      outcome: "accepted",
      reviewerAgentId: "agent-1",
      metadata: { source: "test" },
    });
    expect(promoteToMemory).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      promoterAgentId: "agent-1",
      metadata: { source: "test" },
    });
  });
});
