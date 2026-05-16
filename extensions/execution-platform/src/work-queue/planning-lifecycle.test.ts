import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  PLANNING_CAPSULE_ARTIFACT_KIND,
  PLANNING_CAPSULE_SCHEMA_VERSION,
  buildPlanningCapsuleFromOpportunitySeed,
  createPlanningCapsuleFromOpportunitySeed,
  createPlanningCapsuleWorkQueueVersion,
  validatePlanningCapsule,
  type PlanningCapsule,
} from "./planning-lifecycle.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

function capsule(overrides: Partial<PlanningCapsule> = {}): PlanningCapsule {
  return {
    artifactKind: PLANNING_CAPSULE_ARTIFACT_KIND,
    schemaVersion: PLANNING_CAPSULE_SCHEMA_VERSION,
    capsuleId: "planning-capsule-1",
    workItemId: "planning-work-item",
    lifecycleState: "approved_action_graph",
    objective: "Plan a production-safe Product/Spec Planning worker upgrade.",
    currentState: "A draft action graph exists and needs compile-ready readback.",
    assumptions: ["Runtime jobs remain lifecycle truth."],
    nonGoals: ["Do not deploy."],
    childActions: [
      {
        actionId: "spec-contract",
        title: "Define Product/Spec Planning worker contract",
        assignedWorkflow: "agent_team.architecture",
        dependencyActionIds: [],
        status: "approved",
        evidenceRefs: ["runtime-job://job-1/spec-contract"],
      },
    ],
    workflowRecommendations: ["agent_team.coding", "agent_team.qa_test"],
    contextMemoryNeeds: ["execution-platform runtime work graph docs"],
    humanDecisionRefs: ["owner-decision://planning/default-child-actions"],
    validationPlan: [
      "pnpm test:file extensions/execution-platform/src/work-queue/planning-lifecycle.test.ts",
    ],
    risks: ["Planning capsules must not mutate lifecycle state."],
    openQuestions: ["Should the owner approve child action graph proposals by default?"],
    rollbackRecoveryNotes: ["Remove the planning capsule version if rejected."],
    eli5Progress: "We turned planning into a versioned capsule the queue can show and compile.",
    modelAuthored: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
    ...overrides,
  };
}

describe("Planning Capsule lifecycle", () => {
  it("validates bounded model-authored capsules and rejects lifecycle mutation claims", () => {
    expect(validatePlanningCapsule(capsule())).toMatchObject({ accepted: true });
    const lifecycleMutatingCapsule = {
      ...capsule(),
      workQueueLifecycleMutationAllowed: true,
    } as unknown as PlanningCapsule;
    expect(validatePlanningCapsule(lifecycleMutatingCapsule)).toMatchObject({
      accepted: false,
      reasonCodes: expect.arrayContaining(["planning_capsule_cannot_mutate_work_queue_lifecycle"]),
    });
  });

  it("persists Planning Capsules as Work Queue versions and metadata artifacts", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
      await workQueue.createWorkItem({
        workItemId: "planning-work-item",
        itemType: "product_spec_planning",
        title: "Product/Spec Planning production upgrade",
        metadata: { source: "test" },
      });

      const result = await createPlanningCapsuleWorkQueueVersion({
        workQueue,
        workItemId: "planning-work-item",
        capsule: capsule(),
        actorId: "test-planner",
      });
      const truth = await workQueue.readWorkItemTruth("planning-work-item");

      expect(result.artifactKind).toBe("planning_capsule_persistence_result");
      expect(result.rawPromptStored).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
      expect(truth?.versions).toHaveLength(1);
      expect(truth?.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactType: PLANNING_CAPSULE_ARTIFACT_KIND,
            sha256: result.capsuleHash,
          }),
        ]),
      );
      expect(truth?.item.queueStatus).toBe("active");
    } finally {
      await database.close();
    }
  });

  it("unpacks accepted closeout opportunity seeds into Planning Capsule intake", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
      await workQueue.createWorkItem({
        workItemId: "seed-work-item",
        itemType: "closeout_follow_up_work_item",
        title: "Improve planning readback",
        description: "Accepted opportunity seed.",
      });
      const seed = {
        seedId: "seed-1",
        kind: "follow_up_work_item" as const,
        title: "Improve Planning Capsule readback",
        rationale: "The closeout found that planning state was hard to review.",
        recommendedNextStep:
          "Add readback showing planning capsule versions and compile readiness.",
        evidenceRefs: ["runtime-job://job/closeout-capsule/capsule-1"],
        confidence: "high" as const,
      };
      const capsule = buildPlanningCapsuleFromOpportunitySeed({
        workItemId: "seed-work-item",
        capsuleId: "planning-from-seed-1",
        seed,
        sourceCloseoutRef: "runtime-job://job/closeout-capsule/capsule-1",
        sourceCapsuleRef: "closeout-capsule://capsule-1",
        qualityReviewRef: "model-task://review/seed-1",
      });

      expect(capsule.lifecycleState).toBe("planning_draft");
      expect(capsule.childActions).toHaveLength(2);
      expect(capsule.workflowRecommendations).toContain("agent_team.product_spec_planning");
      expect(validatePlanningCapsule(capsule)).toMatchObject({ accepted: true });

      const persisted = await createPlanningCapsuleFromOpportunitySeed({
        workQueue,
        workItemId: "seed-work-item",
        capsuleId: "planning-from-seed-1",
        seed,
        sourceCloseoutRef: "runtime-job://job/closeout-capsule/capsule-1",
        sourceCapsuleRef: "closeout-capsule://capsule-1",
        qualityReviewRef: "model-task://review/seed-1",
      });

      expect(persisted.artifact.metadata).toMatchObject({
        capsuleId: "planning-from-seed-1",
        lifecycleState: "planning_draft",
      });
      const truth = await workQueue.readWorkItemTruth("seed-work-item");
      expect(truth?.versions).toHaveLength(1);
      expect(truth?.artifacts[0]?.artifactType).toBe(PLANNING_CAPSULE_ARTIFACT_KIND);
    } finally {
      await database.close();
    }
  });
});
