import { describe, expect, it } from "vitest";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "../codex-bridge/agent-team-runtime-evidence.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { applyRuntimeWorkerSupervisorControl } from "../workers/runtime-worker-supervisor-controls.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { recordWorkerCloseoutCapsule } from "../workers/worker-closeout-capsule.ts";
import {
  SKILLIFIER_RUNTIME_JOB_TYPE,
  SKILLIFIER_WORKFLOW_ID,
} from "../workflows/skillifier-runtime-workflow.ts";
import {
  createWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
} from "../workflows/web-research-runtime-evidence.ts";
import { projectCanonicalRuntimeQueue } from "./canonical-runtime-queue.ts";
import {
  buildWorkQueueExecutionReadModel,
  projectFrontDoorRoutingState,
  summarizeWorkQueueExecutionForUi,
} from "./execution-read-model.ts";
import { summarizeProductSpecPlanningValidationRepairEvidence } from "./product-spec-planning-validation-repair-evidence.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";
import "./product-spec-planning-worker-contract.test.ts";
import "./product-spec-planning-mission-readback.test.ts";
import "./product-spec-planning-proof-review.test.ts";
import "./product-spec-planning-commitment-review.test.ts";
import "../codex-bridge/workflow-queued-runner.test.ts";
import "../workflows/runtime-node-capability-registry.test.ts";
import "../workflows/runtime-work-graph-scheduler.test.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
    return await work({ runtimeJobs, workQueue });
  } finally {
    await db.close();
  }
}

describe("Work Queue front-door routing projection", () => {
  it("derives deterministic active/closed positions from runtime truth when timestamps tie", () => {
    const updatedAt = new Date("2026-05-14T00:00:00.000Z");
    const truth = (workItemId: string, lifecycleState: "running" | "succeeded") => ({
      item: {
        workItemId,
        itemType: "execution_workflow",
        title: workItemId,
        description: null,
        lifecycleState,
        currentVersionId: null,
        metadata: {},
        createdAt: updatedAt,
        updatedAt,
      },
      currentVersion: null,
      versions: [],
      artifacts: [],
      events: [],
      assignments: [],
      dependencies: [],
      parentWorkflowLinks: [],
      runs: [],
      steps: [],
    });

    const buildProjection = (workItemIds: string[]) =>
      projectCanonicalRuntimeQueue(
        workItemIds.map((workItemId) =>
          truth(workItemId, workItemId.includes("closed") ? "succeeded" : "running"),
        ),
      );

    const forward = buildProjection(["zeta-active", "alpha-active", "gamma-closed", "beta-closed"]);
    const reverse = buildProjection(["beta-closed", "gamma-closed", "alpha-active", "zeta-active"]);

    expect(forward.active.map((item) => [item.workItemId, item.activePosition])).toEqual([
      ["alpha-active", 1],
      ["zeta-active", 2],
    ]);
    expect(forward.closed.map((item) => [item.workItemId, item.closedPosition])).toEqual([
      ["beta-closed", 1],
      ["gamma-closed", 2],
    ]);
    expect(reverse.active.map((item) => [item.workItemId, item.activePosition])).toEqual(
      forward.active.map((item) => [item.workItemId, item.activePosition]),
    );
    expect(reverse.closed.map((item) => [item.workItemId, item.closedPosition])).toEqual(
      forward.closed.map((item) => [item.workItemId, item.closedPosition]),
    );
  });

  it("projects DB-backed runtime graph child readback into the UI detail summary", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const parentWorkItemId = "runtime-graph-readback-parent";
      const graphId = "runtime-graph-readback-graph";
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "runtime-graph-readback-job",
        jobType: "executor.runtime_work_graph",
        workItemId: parentWorkItemId,
        payload: { workflowId: "runtime_work_graph" },
      });
      await workQueue.createWorkItem({
        workItemId: parentWorkItemId,
        itemType: "execution_workflow",
        title: "Runtime graph parent",
        description: "Owner-visible graph readback proof.",
        metadata: { graphRef: graphId },
      });
      await workQueue.createWorkRun({
        workItemId: parentWorkItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId,
        graphId,
        nodeId: "implementation-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        runtimeJobId: runtimeJob.jobId,
        queueStatus: "closed",
        evidenceRefs: [
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.ts",
        ],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId,
        graphId,
        nodeId: "validation-1",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        assignedWorkflow: "workflow.qa_test",
        queueStatus: "closed",
        evidenceRefs: ["validation://runtime-graph-readback"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId,
        graphId,
        nodeId: "repair-1",
        nodeKind: "repair",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        evidenceRefs: ["repair://runtime-graph-readback"],
      });
      await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId,
        graphId,
        nodeId: "human-1",
        nodeKind: "human_task",
        assignedRole: "owner",
        assignedWorkflow: "human_operator",
        humanTaskId: "human-task-runtime-graph-readback",
        queueStatus: "blocked",
        evidenceRefs: ["human-task://runtime-graph-readback"],
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: parentWorkItemId,
      });
      const summary = summarizeWorkQueueExecutionForUi(model) as Record<string, unknown>;
      const runtimeGraph = summary.runtimeGraph as {
        planningStatusIsLifecycleState: boolean;
        childActions: unknown[];
        roleInvocations: unknown[];
        humanTasks: unknown[];
        validationRepairLoops: unknown[];
      };

      expect(runtimeGraph.childActions).toHaveLength(4);
      expect(runtimeGraph.roleInvocations).toHaveLength(3);
      expect(runtimeGraph.humanTasks).toHaveLength(1);
      expect(runtimeGraph.validationRepairLoops).toHaveLength(2);
      expect(runtimeGraph.planningStatusIsLifecycleState).toBe(false);
      expect(summary.uiMutationAllowed).toBe(false);
    });
  });

  it("infers planning mode from bounded human decision evidence when contract payload is absent", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "planning-decision-readback-job",
        jobType: "executor.agent_team",
        workItemId: "planning-decision-readback-item",
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId: "planning-decision-readback-item",
        itemType: "execution_workflow",
        title: "Planning decision readback",
      });
      await workQueue.createWorkRun({
        workItemId: "planning-decision-readback-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: job.jobId,
        teamRunId: "team-run-planning-decision-readback",
        workflowId: "agent_team.product_spec_planning",
      });
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.human_scope_decision",
        storageKind: "metadata",
        uri: "runtime-job://planning-decision-readback-job/runtime-work-graph/human-scope-decision/owner-choice",
        metadata: {
          boundedDecisionRef:
            "owner-decision://product-spec-planning/default-child-action-graph-proposals",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "planning-decision-readback-item",
      });

      expect(model.runtimeJobs[0]?.ownerReadback).toMatchObject({
        state: "ready",
        planningMode: "child_action_graph_proposal",
        planningOutputKind: "child_action_graph_proposal_output",
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposals",
          "runtime-job://planning-decision-readback-job/runtime-work-graph/human-scope-decision/owner-choice",
        ],
      });
      expect(model.runtimeJobs[0]?.ownerReadback.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("projects compile-ready Product/Spec Planning contracts into owner readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "planning-compile-ready-readback-job";
      const workItemId = "planning-compile-ready-readback-item";
      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Compile-ready planning readback",
      });
      await workQueue.createWorkRun({
        workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: job.jobId,
        teamRunId: "team-run-planning-compile-ready-readback",
        workflowId: "agent_team.product_spec_planning",
      });
      (
        capsule as unknown as { productSpecPlanningContract?: unknown }
      ).productSpecPlanningContract = {
        artifactKind: "product_spec_planning_worker_contract",
        contractVersion: "v1",
        planningMode: "compile_ready",
        planningOutputKind: "compile_ready_output",
        workflowRefs: [
          "workflow://agent_team.product_spec_planning",
          `runtime-job://${runtimeJobId}/runtime-work-graph/product-spec-planning/proposal`,
        ],
        childActionProposalRefs: [`runtime-work-graph://${runtimeJobId}/proposal/compile-ready`],
        humanDecisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
        validationRefs: ["validation://product-spec-planning/compile-runtime-plan"],
        limitations: ["compile readiness does not execute proposed child actions"],
        eli5Progress:
          "OpenClaw checked the proposed child plan and still kept execution behind approval.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      };
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });

      expect(model.runtimeJobs[0]?.ownerReadback).toMatchObject({
        state: "ready",
        planningMode: "compile_ready",
        planningOutputKind: "compile_ready_output",
        compileReadinessState: "compile_ready",
        childActionProposalRefs: [`runtime-work-graph://${runtimeJobId}/proposal/compile-ready`],
        actionGraphProposalRefs: [`runtime-work-graph://${runtimeJobId}/proposal/compile-ready`],
        humanDecisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
        humanDecisionState: "present",
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
    });
  });

  it("surfaces Product/Spec Planning capsule, research, human decision, proposal, and compile readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "planning-surface-readback-job";
      const workItemId = "planning-surface-readback-item";
      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Planning surface readback",
      });
      await workQueue.createWorkRun({
        workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: job.jobId,
        teamRunId: "team-run-planning-surface-readback",
        workflowId: "agent_team.product_spec_planning",
      });
      (
        capsule as unknown as { productSpecPlanningContract?: unknown }
      ).productSpecPlanningContract = {
        artifactKind: "product_spec_planning_worker_contract",
        contractVersion: "v1",
        planningMode: "compile_ready",
        planningOutputKind: "compile_ready_output",
        workflowRefs: [
          "workflow://agent_team.product_spec_planning",
          `runtime-job://${runtimeJobId}/runtime-work-graph/planning-surface`,
        ],
        childActionProposalRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal-1`,
        ],
        humanDecisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
        validationRefs: ["validation://planning-surface/compile-readiness"],
        limitations: ["compile readiness validates the proposal but does not execute it"],
        eli5Progress: "OpenClaw planned the work, checked the child graph, and kept it parked.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      };
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.product_spec_planning_research_brief",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/research/research-brief-1`,
        metadata: {
          artifactKind: "product_spec_planning_research_brief",
          contractVersion: "v1",
          researchBriefId: "research-brief-1",
          sourceRefs: ["source://docs/runtime-work-graph"],
          citationRefs: ["citation://docs/runtime-work-graph"],
          boundedClaims: ["Scheduler-backed planning needs bounded runtime graph refs."],
          assumptions: ["External docs can change after this planning run."],
          freshnessEvidence: ["checked-at://2026-05-15T00:00:00.000Z"],
          staleExternalAssumptionFlags: ["external docs require freshness review"],
          researchLimitations: ["bounded source refs only"],
          influencedPlanningCapsule: true,
          rawPromptStored: false,
          rawResponseStored: false,
          rawPageStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.product_spec_planning_capsule",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/planning-capsule/capsule-1-v2`,
        metadata: {
          artifactKind: "product_spec_planning_capsule",
          researchInfluenceRefs: [
            `runtime-job://${runtimeJobId}/runtime-work-graph/research/research-brief-1`,
          ],
          staleExternalAssumptionFlags: ["external docs require freshness review"],
          compileReadinessState: "compile_ready",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.product_spec_planning_human_decision_request",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/human-decision/request-1`,
        metadata: {
          artifactKind: "product_spec_planning_human_decision_request",
          decisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
          boundedResponseRefs: ["owner-response://planning-surface/compile-ready"],
          resumeRefs: ["runtime-work-graph://planning-surface/resume-after-decision"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.product_spec_planning_action_graph_proposal",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal-1`,
        metadata: {
          artifactKind: "product_spec_planning_action_graph_proposal",
          compileReadinessState: "compile_ready",
          proposedChildActions: [
            {
              actionId: "implementation",
              title: "Implement planning follow-up",
              assignedWorkflow: "agent_team.coding",
              assignedRoleOrOwner: "implementation_engineer",
              dependencies: ["research"],
              authorityBoundary: "requires_compiler_authority",
              runtimeJobCompileReadiness: "compile_ready",
              validationExpectations: ["pnpm test:file execution-read-model.test.ts"],
            },
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });
      const readback = model.runtimeJobs[0]?.ownerReadback;

      expect(readback).toMatchObject({
        state: "ready",
        planningMode: "compile_ready",
        planningCapsuleRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/planning-capsule/capsule-1-v2`,
        ],
        researchBriefRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/research/research-brief-1`,
        ],
        researchInfluenceRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/research/research-brief-1`,
        ],
        staleExternalAssumptionFlags: ["external docs require freshness review"],
        actionGraphProposalRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal-1`,
        ],
        compileReadinessState: "compile_ready",
        humanDecisionState: "present",
      });
      expect(readback?.humanDecisionRequestRefs).toEqual(
        expect.arrayContaining([
          `runtime-job://${runtimeJobId}/runtime-work-graph/human-decision/request-1`,
          "owner-decision://product-spec-planning/default-compile-ready",
          "owner-response://planning-surface/compile-ready",
        ]),
      );
      expect(readback?.childProposalSummaries).toEqual([
        {
          actionId: "implementation",
          title: "Implement planning follow-up",
          assignedWorkflow: "agent_team.coding",
          assignedRoleOrOwner: "implementation_engineer",
          dependencyCount: 1,
          authorityBoundary: "requires_compiler_authority",
          compileReadinessState: "compile_ready",
          validationExpectations: ["pnpm test:file execution-read-model.test.ts"],
        },
      ]);
      expect(JSON.stringify(readback)).not.toMatch(/raw transcript|provider log|raw page/iu);
      expect(readback?.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("maps Product/Spec Planning Mission Ledger evidence by commitment for owner readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "planning-ledger-evidence-map-job";
      const workItemId = "planning-ledger-evidence-map-item";
      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Planning ledger evidence readback",
      });
      await workQueue.createWorkRun({
        workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: job.jobId,
        teamRunId: "team-run-planning-ledger-evidence-map",
        workflowId: "agent_team.product_spec_planning",
      });
      (
        capsule as unknown as { productSpecPlanningContract?: unknown }
      ).productSpecPlanningContract = {
        artifactKind: "product_spec_planning_worker_contract",
        contractVersion: "v1",
        planningMode: "child_action_graph_proposal",
        planningOutputKind: "child_action_graph_proposal_output",
        workflowRefs: [
          "workflow://agent_team.product_spec_planning",
          `runtime-job://${runtimeJobId}/runtime-work-graph/product-spec-planning/graph`,
        ],
        childActionProposalRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal`,
        ],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        validationRefs: [`runtime-job://${runtimeJobId}/codex-direct-main-repo/validation`],
        limitations: ["compile boundary remains required before execution"],
        eli5Progress: "OpenClaw checked the ledger evidence before closing the planning job.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      };
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.mission_contract_ledger",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/mission-contract-ledger/product-spec-planning/3`,
        metadata: {
          artifactKind: "mission_contract_ledger",
          ledgerStatus: "satisfied",
          blockingCommitments: [
            {
              commitmentId: "commitment-ledger-map",
              status: "satisfied",
              commitmentText: "Map implementation, validation, review, and docs evidence.",
              acceptedEvidenceRefs: [
                `runtime-job://${runtimeJobId}/codex-direct-main-repo/diff/main-repo-change`,
                `runtime-job://${runtimeJobId}/runtime-work-graph/scheduler-role/context_scout/context`,
                `runtime-job://${runtimeJobId}/product-spec-planning/contract`,
                "repo://extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
                "docs://specs/runtime-work-graph.md",
                `runtime-job://${runtimeJobId}/codex-direct-main-repo/validation`,
                `runtime-job://${runtimeJobId}/runtime-work-graph/live-proof/product-spec-planning-live-ux`,
                `runtime-job://${runtimeJobId}/codex-direct-main-repo/review/main-repo-change`,
                "artifact://bounded-ledger-note",
              ],
              remainingWork: [],
            },
          ],
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });
      const commitment = model.runtimeJobs[0]?.ownerReadback.missionContract.blockingCommitments[0];

      expect(commitment).toMatchObject({
        commitmentId: "commitment-ledger-map",
        status: "satisfied",
        changedFileRefs: [
          `runtime-job://${runtimeJobId}/codex-direct-main-repo/diff/main-repo-change`,
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        ],
        validationRefs: [`runtime-job://${runtimeJobId}/codex-direct-main-repo/validation`],
      });
      expect(commitment?.evidenceMap).toMatchObject({
        sourceChangeRefs: [
          `runtime-job://${runtimeJobId}/codex-direct-main-repo/diff/main-repo-change`,
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        ],
        workflowWiringRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/scheduler-role/context_scout/context`,
        ],
        contractRefs: [`runtime-job://${runtimeJobId}/product-spec-planning/contract`],
        testRefs: [
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        ],
        documentationRefs: ["docs://specs/runtime-work-graph.md"],
        validationRefs: [`runtime-job://${runtimeJobId}/codex-direct-main-repo/validation`],
        liveProofRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/live-proof/product-spec-planning-live-ux`,
        ],
        reviewRefs: [
          `runtime-job://${runtimeJobId}/codex-direct-main-repo/review/main-repo-change`,
        ],
        otherEvidenceRefs: ["artifact://bounded-ledger-note"],
      });
      expect(model.runtimeJobs[0]?.ownerReadback.missionContract.reasonCodes).toContain(
        "mission_contract_satisfied",
      );
    });
  });

  it("projects closeout priority notes from runtime projection metadata", async () => {
    await withRuntime(async ({ workQueue }) => {
      const workItemId = "priority-note-readback-item";
      const closeoutRef = "runtime-job://priority-note-readback-job/closeout";
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Priority note readback",
      });

      await workQueue.recordCloseoutProjectionReadback({
        workItemId,
        closeoutRef,
        priorityNote: "  Queue this before long-form parity soak reruns.  ",
      });

      const projection = await workQueue.projectCanonicalRuntimeQueue();
      const projected = projection.active.find((item) => item.workItemId === workItemId);
      expect(projected?.priorityNote).toBe("Queue this before long-form parity soak reruns.");
      expect(projected?.closeoutRefs).toContain(closeoutRef);
      expect(projection.sourceTrackerMode).toBe("db_primary_no_source_tracker");
      let tooLongNoteRejected = false;
      try {
        await workQueue.recordCloseoutProjectionReadback({
          workItemId,
          closeoutRef: "runtime-job://priority-note-readback-job/closeout-too-long",
          priorityNote: "x".repeat(161),
        });
      } catch (error) {
        tooLongNoteRejected =
          error instanceof Error &&
          error.message.includes("closeout_projection_priority_note_exceeds_limit_160");
      }

      expect(tooLongNoteRejected).toBe(true);
    });
  });

  it("projects bounded closeout priority notes into canonical runtime queue truth", async () => {
    await withRuntime(async ({ workQueue }) => {
      const parent = await workQueue.createWorkItem({
        workItemId: "priority-note-projection-parent",
        itemType: "execution_workflow",
        title: "Priority note parent",
      });
      const child = await workQueue.createWorkItem({
        workItemId: "priority-note-projection-child",
        itemType: "execution_workflow",
        title: "Priority note child",
      });

      await workQueue.recordCloseoutProjectionReadback({
        workItemId: parent.workItemId,
        closeoutRef: "runtime-job://priority-note-projection/closeout",
        followUpChildWorkItemIds: [child.workItemId],
        priorityNote: "Prioritize blocker cleanup before accepting net-new coding queue intake.",
        lifecycleMutationAllowed: false,
      });

      const projection = await workQueue.projectCanonicalRuntimeQueue();
      const projectedParent = projection.active.find(
        (item) => item.workItemId === parent.workItemId,
      );
      expect(projectedParent?.childWorkItemIds).toContain(child.workItemId);
      expect(projectedParent?.priorityNote).toBe(
        "Prioritize blocker cleanup before accepting net-new coding queue intake.",
      );
      expect(projectedParent?.runtimeJobIds).toContain("priority-note-projection");
      expect(projectedParent?.runtimeJobRefs).toContain("runtime-job://priority-note-projection");
      expect(projection.sourceTrackerMode).toBe("db_primary_no_source_tracker");
      expect(projectedParent?.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("does not classify corrected no-op repair reason codes as completed repair evidence", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
          metadata: {
            status: "failed",
            proofMode: "forced_validation_failure_once",
            boundedFailureSummary:
              "Controlled parity proof injected one failed validation state for same-job repair.",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/repair-rerun-accepted-no-op",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            reasonCodes: [
              "bounded",
              "controlled_parity_proof_injected_failure",
              "invalid_no_op_repair_for_failed_validation_corrected",
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(false);
    expect(summary.reasonCodes).toContain(
      "product_spec_planning_validation_repair_missing_after_failure",
    );
    expect(summary.reasonCodes).not.toContain("validation_repair_inferred_from_legacy_ref");
    expect(summary.reasonCodes).toContain(
      "product_spec_planning_invalid_no_op_repair_needs_real_repair_evidence",
    );
  });

  it("requires explicit rerun evidence for invalid no-op repair correction", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
          metadata: {
            status: "failed",
            proofMode: "forced_validation_failure_once",
            boundedFailureSummary:
              "Controlled parity proof injected one failed validation state for same-job repair.",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/passed",
          metadata: {
            status: "passed",
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/repair-loop-no-op",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            reasonCodes: ["bounded", "invalid_no_op_repair_for_failed_validation_corrected"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(false);
    expect(summary.reasonCodes).toContain(
      "product_spec_planning_validation_repair_missing_after_failure",
    );
    expect(summary.reasonCodes).toContain(
      "product_spec_planning_invalid_no_op_repair_needs_real_repair_evidence",
    );
  });

  it("classifies failed validation ref reason code as failure evidence", () => {
    const summary = summarizeProductSpecPlanningValidationRepairEvidence({
      artifacts: [
        {
          artifactType: "agent_team.dynamic_validation",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/scoped-run-1",
          metadata: {
            reasonCodes: ["failed validation ref: validation://forced"],
            rawCommandLogsStored: false,
          },
        },
        {
          artifactType: "agent_team.dynamic_validation_repair_loop",
          uri: "runtime-job://native-exec/runtime-work-graph/validation/repair-loop-1",
          metadata: {
            finalState: "passed",
            repairAttemptCount: 1,
            reasonCodes: ["repair_rerun_passed"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          },
        },
      ],
    });

    expect(summary.hasFailureAttemptRef).toBe(true);
    expect(summary.hasRepairAttemptRef).toBe(true);
    expect(summary.hasBothFailureAndRepairRefs).toBe(true);
    expect(summary.reasonCodes).toEqual(
      expect.arrayContaining([
        "validation_failure_recorded_from_metadata",
        "validation_repair_recorded_from_metadata",
        "validation_failure_classified",
        "product_spec_planning_validation_repair_observed",
      ]),
    );
    expect(summary.reasonCodes).not.toContain("validation_failure_inferred_from_legacy_ref");
    expect(summary.reasonCodes).not.toContain("validation_repair_inferred_from_legacy_ref");
  });

  it("projects Skillifier runtime candidate readback without claiming lifecycle ownership", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "skillifier-readback-job",
        jobType: SKILLIFIER_RUNTIME_JOB_TYPE,
        workItemId: "skillifier-readback-work-item",
        payload: {
          workflowId: SKILLIFIER_WORKFLOW_ID,
          targetSkillRefs: ["skill://skillifier-runtime-review"],
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await workQueue.createWorkItem({
        workItemId: "skillifier-readback-work-item",
        itemType: "skillifier_runtime",
        title: "Review Skillifier candidate",
      });
      await workQueue.createWorkRun({
        workItemId: "skillifier-readback-work-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "runtime_worker.adapter_result",
        storageKind: "metadata",
        uri: "runtime-job://skillifier-readback-job/runtime-worker/adapter-result",
        metadata: {
          adapterId: "worker.skillifier.runtime",
          status: "completed",
          reasonCodes: ["skillifier_worker_completed"],
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "skillifier.runtime_candidate",
        storageKind: "metadata",
        uri: "runtime-job://skillifier-readback-job/skillifier/candidate/candidate-1",
        metadata: {
          candidateId: "candidate-1",
          candidateType: "new_skill",
          reviewState: "candidate_ready",
          targetSkillRef: "skill://skillifier-runtime-review",
          opportunitySeedRef: "closeout-capsule://capsule-1/opportunity/seed-1",
          closeoutCapsuleRef: "closeout-capsule://capsule-1",
          modelRef: "model-task://skillifier.structured_json",
          modelTaskRefs: ["runtime-job://skillifier-model-task/model-task/validation"],
          dbOperationRefs: ["runtime-job://skillifier-db-operation/db-operation/metadata"],
          validationRefs: ["validation://skillifier-candidate-schema"],
          reviewRefs: ["review://skillifier-candidate-quality"],
          limitations: ["owner review required before applying skill file"],
          eli5Progress: "OpenClaw created a skill candidate and left file apply review-gated.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawDbRowsStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.closeout_capsule",
        storageKind: "metadata",
        uri: "runtime-job://skillifier-readback-job/closeout-capsule/capsule-1",
        metadata: {
          capsuleId: "capsule-1",
          factualRefs: {
            capsuleHash: "capsule-hash-1",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await recordAgentTeamRuntimeEvidence({
        runtimeJobs,
        evidence: createAgentTeamRuntimeEvidence({
          teamRunId: "team-run-skillifier-readback",
          runtimeJobId: job.jobId,
          objective: "Prepare bounded owner-readable Skillifier readback.",
          roster: [
            {
              roleId: "implementation_engineer",
              modelId: "model://skillifier-impl",
              status: "allowed",
            },
          ],
          roleAssignments: [
            {
              roleId: "implementation_engineer",
              modelId: "model://skillifier-impl",
              assignedAt: "2026-05-09T00:00:00.000Z",
              status: "completed",
            },
          ],
          validationState: "passed",
          reviewState: "reviewed",
          closeoutState: "present",
          authorityStatus: "allowed",
        }),
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "skillifier-readback-work-item",
      });
      const runtime = model.runtimeJobs[0]!;

      expect(runtime.skillifier).toMatchObject({
        state: "present",
        runtimeJobId: job.jobId,
        workflowId: SKILLIFIER_WORKFLOW_ID,
        candidateId: "candidate-1",
        candidateType: "new_skill",
        reviewState: "candidate_ready",
        skillFileEdited: false,
        lifecycleTruthSource: "runtime_job",
        workQueueLifecycleMutationAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(runtime.skillifier.modelTaskRefs).toEqual([
        "runtime-job://skillifier-model-task/model-task/validation",
      ]);
      expect(runtime.skillifier.dbOperationRefs).toEqual([
        "runtime-job://skillifier-db-operation/db-operation/metadata",
      ]);
      const summary = summarizeWorkQueueExecutionForUi(model);
      const skillifier =
        summary && typeof summary === "object" && !Array.isArray(summary)
          ? ((summary as Record<string, unknown>).skillifier as Record<string, unknown> | null)
          : null;
      expect(skillifier).toMatchObject({
        runtimeJobId: "skillifier-readback-job",
        opportunitySeedRef: "closeout-capsule://capsule-1/opportunity/seed-1",
        opportunitySeedQuality: {
          state: "ready",
          reasonCodes: [],
          seedRefCount: 1,
          closeoutCapsuleRefCount: 4,
          roleRefCount: 1,
          modelRefCount: 2,
          validationRefCount: 1,
          boundedValidationEvidence: "present",
        },
        validationEvidence: {
          state: "present",
          refCount: 1,
          refLimit: 10,
          truncated: false,
          reviewRefCount: 1,
          reviewRefLimit: 10,
          reviewRefsTruncated: false,
        },
      });
      expect(skillifier?.opportunitySeedRefs).toEqual([
        "closeout-capsule://capsule-1/opportunity/seed-1",
      ]);
      expect(skillifier?.closeoutCapsuleRefs).toContain("closeout-capsule://capsule-1");
      expect(skillifier?.closeoutCapsuleRefs).toContain(
        "runtime-job://skillifier-readback-job/closeout-capsule/capsule-1",
      );
      expect(skillifier?.roleRefs).toEqual(["role://implementation_engineer"]);
      expect(skillifier?.roleModelRefs).toEqual([
        {
          roleId: "implementation_engineer",
          modelId: "model://skillifier-impl",
          modelRunRef: null,
          status: "completed",
        },
      ]);
    });
  });

  it("projects full owner-readable runtime, worker, permission, control, and capsule readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "owner-readable-coding-job",
        jobType: "executor.agent_team",
        workItemId: "owner-readable-work-item",
        payload: {
          workflowId: "agent_team.coding",
          workflowDisplayName: "Coding Agent Team",
          authorityProfile: "local_yolo",
        },
      });
      await workQueue.createWorkItem({
        workItemId: "owner-readable-work-item",
        itemType: "execution_workflow",
        title: "Owner readable coding work",
      });
      await workQueue.createWorkRun({
        workItemId: "owner-readable-work-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.worker_contract_state",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/worker-contract",
        metadata: {
          contractState: "live",
          workerAdapterId: "worker.acp-codex.coding",
          accepted: true,
          reasonCodes: ["worker_contract_state_live"],
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "runtime_worker.adapter_result",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/runtime-worker/adapter-result",
        metadata: {
          adapterId: "worker.acp-codex.coding",
          status: "completed",
          summary: "completed bounded coding work",
          reasonCodes: ["acp_codex_coding_worker_completed"],
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.coding_real_work_task_graph",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/agent-team/task-graph/team-graph-1",
        metadata: {
          graphId: "team-graph-1",
          requiredSourceEdit: true,
          nodes: [
            { roleId: "orchestrator" },
            { roleId: "context_scout" },
            { roleId: "implementation_engineer" },
            { roleId: "test_engineer" },
          ],
          reasonCodes: ["orchestrator_role_first_in_sequence"],
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await recordAgentTeamRuntimeEvidence({
        runtimeJobs,
        evidence: createAgentTeamRuntimeEvidence({
          teamRunId: "team-run-owner-readable",
          runtimeJobId: job.jobId,
          objective: "Improve owner-readable Work Queue runtime readback.",
          roster: [
            {
              roleId: "implementation_engineer",
              modelId: "model://fixture-impl",
              status: "allowed",
            },
            { roleId: "test_engineer", modelId: "model://fixture-test", status: "allowed" },
          ],
          roleAssignments: [
            {
              roleId: "implementation_engineer",
              modelId: "model://fixture-impl",
              assignedAt: "2026-05-09T00:00:00.000Z",
              status: "completed",
            },
            {
              roleId: "test_engineer",
              modelId: "model://fixture-test",
              assignedAt: "2026-05-09T00:00:00.000Z",
              status: "completed",
            },
          ],
          roleExecutionEvidence: [
            {
              roleId: "implementation_engineer",
              agentId: "implementation_engineer",
              modelRef: "model://fixture-impl",
              providerPath: "codex_app_server",
              transportKind: "codex_app_server",
              modelRunRef: "model-run://implementation",
              responseHash: "response-hash-implementation",
              startedAt: "2026-05-09T00:00:00.000Z",
              completedAt: "2026-05-09T00:00:01.000Z",
              latencyMs: 1000,
              assignedTaskSummary: "Implement readback improvement",
              producedArtifactRefs: [
                "runtime-job://owner-readable-coding-job/runtime-worker/adapter-result",
              ],
              rawPromptStored: false,
              rawResponseStored: false,
            },
          ],
          validationState: "passed",
          reviewState: "reviewed",
          closeoutState: "present",
          authorityStatus: "allowed",
          permissionEvidence: createWorkflowPermissionReadback({
            workflowId: "agent_team.coding",
            authorityProfile: "local_yolo",
          }),
          artifactRefs: ["runtime-job://owner-readable-coding-job/runtime-worker/adapter-result"],
        }),
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: job.jobId,
        teamRunId: "team-run-owner-readable",
      });
      (
        capsule as unknown as { productSpecPlanningContract?: unknown }
      ).productSpecPlanningContract = {
        artifactKind: "product_spec_planning_worker_contract",
        contractVersion: "v1",
        planningMode: "child_action_graph_proposal",
        planningOutputKind: "child_action_graph_proposal_output",
        workflowRefs: [
          "workflow://agent_team.coding",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/team-run-owner-readable-runtime-work-graph",
        ],
        childActionProposalRefs: [
          "runtime-work-graph://team-run-owner-readable/proposal/implementation",
        ],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        validationRefs: ["validation://owner-readable-coding-job/execution-read-model"],
        limitations: [
          "Proposal refs are planning outputs and require compile-time approval before run.",
        ],
        eli5Progress: "OpenClaw planned child actions and kept execution review-gated.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      };
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_validation",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
        metadata: {
          commandRef:
            "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
          status: "failed",
          proofMode: "forced_validation_failure_once",
          boundedFailureSummary:
            "Controlled parity proof injected one failed validation state for same-job repair.",
          rawCommandLogsStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_validation",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-rerun-accepted",
        metadata: {
          commandRef:
            "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
          status: "passed",
          durationMs: 180,
          rawCommandLogsStored: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_validation_repair_loop",
        storageKind: "metadata",
        uri: "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-loop-1",
        metadata: {
          finalState: "passed",
          repairAttemptCount: 1,
          reasonCodes: ["invalid_no_op_repair_for_failed_validation_corrected"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await applyRuntimeWorkerSupervisorControl({
        runtimeJobs,
        request: {
          controlId: "status-readback-owner-readable",
          controlKind: "status_readback",
          runtimeJobId: job.jobId,
          actorId: "operator",
          authenticated: true,
          reason: "owner requested readback",
          targetValidation: { fresh: true, authorized: true, source: "fixture_runtime_state" },
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "owner-readable-work-item",
      });
      const runtime = model.runtimeJobs[0]!;

      expect(runtime.worker).toMatchObject({
        workerAdapterId: "worker.acp-codex.coding",
        workerAdapterStatus: "completed",
        workerContractState: "live",
        workerContractAccepted: true,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(runtime.runtimeControl).toMatchObject({
        state: "present",
        latestControlKind: "status_readback",
        appliedLiveControl: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(runtime.permissionReadback).toMatchObject({
        readbackDecision: "allowed_by_coding_worker_contract",
        modelPromotionBlocked: true,
        workQueueLifecycleMutationBlocked: true,
      });
      expect(runtime.ownerReadback).toMatchObject({
        state: "ready",
        planningMode: "child_action_graph_proposal",
        planningOutputKind: "child_action_graph_proposal_output",
        planningWorkflowRefs: [
          "workflow://agent_team.coding",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/team-run-owner-readable-runtime-work-graph",
        ],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        childActionProposalRefs: [
          "runtime-work-graph://team-run-owner-readable/proposal/implementation",
        ],
        taskSuccess: "satisfied",
        opportunitySeedCount: 1,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(runtime.ownerReadback.validationRefs).toEqual(
        expect.arrayContaining([
          "validation://owner-readable-coding-job/execution-read-model",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-rerun-accepted",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-loop-1",
        ]),
      );
      expect(runtime.ownerReadback.reasonCodes).toEqual(
        expect.arrayContaining(["invalid_no_op_repair_for_failed_validation_corrected"]),
      );
      expect(runtime.agentTeam.roleReports.map((report) => report.roleId)).toEqual([
        "implementation_engineer",
        "test_engineer",
      ]);
      expect(runtime.agentTeam.roleReports[0]).toMatchObject({
        roleId: "implementation_engineer",
        transportKind: "codex_app_server",
        modelRunRef: "model-run://implementation",
        roleCloseoutState: "model",
      });
      expect(runtime.agentTeam.taskGraph).toMatchObject({
        graphId: "team-graph-1",
        state: "present",
        requiredSourceEdit: true,
        nodeCount: 4,
        artifactRef: "runtime-job://owner-readable-coding-job/agent-team/task-graph/team-graph-1",
      });
      expect(model.lifecycleTruthSource).toBe("work_queue_repository");
      expect(model.executionTruthSource).toBe("execution_platform_runtime_jobs");
      expect(JSON.stringify(model)).not.toContain("raw transcript");
    });
  });

  it("surfaces dynamic orchestrator graph as the live task graph in owner readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "dynamic-graph-readback-job",
        jobType: "executor.agent_team",
        workItemId: "dynamic-graph-readback-item",
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkItem({
        workItemId: "dynamic-graph-readback-item",
        itemType: "execution_workflow",
        title: "Dynamic graph readback",
      });
      await workQueue.createWorkRun({
        workItemId: "dynamic-graph-readback-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.coding_real_work_task_graph",
        storageKind: "metadata",
        uri: "runtime-job://dynamic-graph-readback-job/runtime-work-graph/static-seed",
        metadata: {
          graphId: "static-graph-seed",
          requiredSourceEdit: true,
          nodes: [{ roleId: "orchestrator" }],
          reasonCodes: ["static_graph_seed_only"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_orchestrator_plan",
        storageKind: "metadata",
        uri: "runtime-job://dynamic-graph-readback-job/runtime-work-graph/orchestrator/plan",
        metadata: {
          graphId: "dynamic-graph-1",
          modelRef: "openai-codex/gpt-5.5",
          providerPath: "codex_app_server",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          plan: {
            childTasks: [
              {
                actionId: "implementation",
                actionKind: "coding",
                assignedRole: "implementation_engineer",
              },
              { actionId: "validation", actionKind: "qa_test", assignedRole: "test_engineer" },
              { actionId: "review", actionKind: "review", assignedRole: "reviewer" },
            ],
            reasonCodes: ["dynamic_orchestrator_graph_created"],
          },
          workQueueLifecycleMutated: false,
        },
      });
      for (const progress of [
        {
          nodeId: "implementation-1",
          stage: "implementation",
          roleId: "implementation_engineer",
          status: "completed",
          artifactRefs: ["runtime-job://dynamic-graph-readback-job/artifacts/implementation-1"],
        },
        {
          nodeId: "validation-1",
          stage: "validation",
          roleId: "test_engineer",
          status: "completed",
          artifactRefs: ["runtime-job://dynamic-graph-readback-job/artifacts/validation-1"],
        },
        {
          nodeId: "implementation-2",
          stage: "repair",
          roleId: "implementation_engineer",
          status: "completed",
          artifactRefs: ["runtime-job://dynamic-graph-readback-job/artifacts/implementation-2"],
        },
        {
          nodeId: "human-scope-1",
          stage: "human_scope_decision",
          roleId: "human_operator",
          status: "completed",
          artifactRefs: ["runtime-job://dynamic-graph-readback-job/artifacts/human-scope-1"],
        },
      ]) {
        await runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.dynamic_progress",
          storageKind: "metadata",
          uri: `runtime-job://dynamic-graph-readback-job/runtime-work-graph/progress/${progress.nodeId}`,
          metadata: {
            ...progress,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          },
        });
      }
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.human_scope_decision",
        storageKind: "metadata",
        uri: "runtime-job://dynamic-graph-readback-job/runtime-work-graph/human/scope-1",
        metadata: {
          boundedDecisionRef: "owner-decision://dynamic-graph-readback/scope-1",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_validation_repair_loop",
        storageKind: "metadata",
        uri: "runtime-job://dynamic-graph-readback-job/runtime-work-graph/validation/repair-loop-1",
        metadata: {
          finalState: "passed",
          repairAttemptCount: 1,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.kimi_standard_implementation_attempt",
        storageKind: "metadata",
        uri: "runtime-job://dynamic-graph-readback-job/runtime-work-graph/kimi/attempt-1",
        metadata: {
          status: "needs_review",
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          modelRunRef: "openrouter://moonshotai/kimi-k2.6/readback-test",
          changedFileRefs: [],
          validationRefs: [],
          attemptDiagnostics: [
            {
              attempt: 1,
              rejectionStage: "schema_parse",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          ],
          escalatedToCodexBridgeRecommended: true,
          reasonCodes: ["kimi_patch_schema_invalid"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await recordAgentTeamRuntimeEvidence({
        runtimeJobs,
        evidence: createAgentTeamRuntimeEvidence({
          teamRunId: "team-run-dynamic-graph-readback",
          runtimeJobId: job.jobId,
          objective: "Expose dynamic graph readback.",
          roster: [
            {
              roleId: "implementation_engineer",
              modelId: "model://fixture-impl",
              status: "allowed",
            },
          ],
          roleAssignments: [
            {
              roleId: "implementation_engineer",
              modelId: "model://fixture-impl",
              assignedAt: "2026-05-09T00:00:00.000Z",
              status: "completed",
            },
          ],
          modelRoutingEvidence: {
            graphId: "dynamic-graph-1",
            orchestratorModelRef: "openai-codex/gpt-5.5",
            staticSingleJobSequenceUsed: false,
            inlineRoleOnlyExecutionAllowed: false,
          },
          validationState: "running",
          reviewState: "not_started",
          closeoutState: "missing",
        }),
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "dynamic-graph-readback-item",
      });

      expect(model.runtimeJobs[0]?.agentTeam.taskGraph).toMatchObject({
        graphId: "dynamic-graph-1",
        state: "present",
        requiredSourceEdit: true,
        nodeCount: 7,
        edgeCount: 6,
        repeatedRoleInvocationCount: expect.any(Number),
        lastWorker: "human_operator",
        currentStage: "human_scope_decision",
        repairAttemptCount: 1,
        humanDecisionPresent: true,
        kimiImplementation: {
          state: "present",
          status: "needs_review",
          modelRef: "moonshotai/kimi-k2.6",
          attemptCount: 1,
          rejectionStages: ["schema_parse"],
          escalationRecommended: true,
        },
        artifactRef:
          "runtime-job://dynamic-graph-readback-job/runtime-work-graph/orchestrator/plan",
      });
      expect(
        model.runtimeJobs[0]?.agentTeam.taskGraph.repeatedRoleInvocationCount,
      ).toBeGreaterThanOrEqual(1);
      expect(model.runtimeJobs[0]?.agentTeam.taskGraph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId: "implementation-2",
            stage: "repair",
            roleId: "implementation_engineer",
          }),
          expect.objectContaining({
            nodeId: "human-scope-1",
            stage: "human_scope_decision",
            roleId: "human_operator",
          }),
        ]),
      );
    });
  });

  it("surfaces missing required source edits in owner runtime readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "missing-source-edit-job",
        jobType: "executor.agent_team",
        workItemId: "missing-source-edit-item",
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkItem({
        workItemId: "missing-source-edit-item",
        itemType: "execution_workflow",
        title: "Missing source edit coding work",
      });
      await workQueue.createWorkRun({
        workItemId: "missing-source-edit-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "codex_bridge.code_writing_pilot_live_result",
        storageKind: "metadata",
        uri: "runtime-job://missing-source-edit-job/codex-bridge/live-result",
        metadata: {
          completedWorkPathSatisfied: false,
          completedWorkPathReason: "required_source_edit_missing",
          actualFilesChanged: [],
          sourceEditRequirement: {
            reasonCode: "required_source_edit_missing",
            status: "missing_required_source_edit",
            required: true,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "missing-source-edit-item",
      });
      const runtime = model.runtimeJobs[0]!;

      expect(runtime.completedWorkStatus).toBe("unsatisfied");
      expect(runtime.sourceEditStatus).toBe("required_source_edit_missing");
      expect(runtime.completedWorkReasonCode).toBe("required_source_edit_missing");
      expect(runtime.changedFileRefs).toEqual([]);
      expect(runtime.workflow.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("projects missing worker and capsule evidence as needs-review or missing, not success", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "missing-worker-evidence-job",
        jobType: "executor.agent_team",
        workItemId: "missing-worker-evidence-item",
        payload: { workflowId: "agent_team.coding" },
      });
      const claim = await runtimeJobs.claimNextJob({
        workerId: "worker",
        runtimeJobId: job.jobId,
      });
      await runtimeJobs.completeJob({ leaseToken: claim!.leaseToken, result: { ok: true } });
      await workQueue.createWorkItem({
        workItemId: "missing-worker-evidence-item",
        itemType: "execution_workflow",
        title: "Missing worker evidence",
      });
      await workQueue.createWorkRun({
        workItemId: "missing-worker-evidence-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "missing-worker-evidence-item",
      });

      expect(model.runtimeJobs[0]?.worker.state).toBe("needs_review");
      expect(model.runtimeJobs[0]?.ownerReadback.state).toBe("missing");
      expect(model.runtimeJobs[0]?.workflow.lifecycleState).toBe("succeeded");
      expect(model.runtimeJobs[0]?.workflow.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("projects accepted workflow route state separately from lifecycle state", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "front-door-job-1",
        jobType: "executor.agent_team",
        workItemId: "work-item-routing-1",
        payload: {
          workflowId: "agent_team.coding",
          workflowDisplayName: "Coding Agent Team",
          rawPromptStored: false,
        },
      });
      await workQueue.createWorkItem({
        workItemId: "work-item-routing-1",
        itemType: "execution_workflow",
        title: "Routing projection",
      });
      await workQueue.createWorkRun({
        workItemId: "work-item-routing-1",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.front_door.router_result",
        storageKind: "metadata",
        uri: "runtime-job://front-door-job-1/execution/front-door/router-result",
        metadata: {
          output: {
            route: "workflow_execution",
            responseMode: "create_runtime_job",
            executeNow: true,
            confidence: 0.96,
            workflowId: "agent_team.coding",
            jobType: "executor.agent_team",
          },
          schemaVersion: "intent-front-door.router-schema.v1",
          routerConfigVersion: "router-config-v1",
          metadata: {
            modelCandidateId: "fixture-router",
            workflowRegistryVersion: "workflow-registry-v1",
            reasonCodes: ["canonical_router_schema_valid"],
          },
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.front_door.validation",
        storageKind: "metadata",
        uri: "runtime-job://front-door-job-1/execution/front-door/validation",
        metadata: { outcome: "accepted", reasonCodes: ["intent_validation_accepted"] },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.front_door.action_semantics",
        storageKind: "metadata",
        uri: "runtime-job://front-door-job-1/execution/front-door/action-semantics",
        metadata: { outcome: "actions_allowed", reasonCodes: ["requested_actions_allowed"] },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.front_door.clarification_gate",
        storageKind: "metadata",
        uri: "runtime-job://front-door-job-1/execution/front-door/clarification-gate",
        metadata: { outcome: "pass_through", reasonCodes: ["clarification_not_required"] },
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution.front_door.compiled_request",
        storageKind: "metadata",
        uri: "runtime-job://front-door-job-1/execution/front-door/compiled-request",
        metadata: {
          artifactKind: "front_door_compiled_runtime_job_request",
          reasonCodes: ["front_door_runtime_request_compiled"],
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-routing-1",
      });
      const projected = model.runtimeJobs[0]?.workflow.routing;

      expect(projected?.state).toBe("accepted");
      expect(projected?.route).toBe("workflow_execution");
      expect(projected?.validatorOutcome).toBe("accepted");
      expect(projected?.compilerOutcome).toBe("front_door_compiled_runtime_job_request");
      expect(model.runtimeJobs[0]?.workflow.lifecycleState).toBe("pending");
      expect(model.runtimeJobs[0]?.workflow.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("keeps clarification and blocked route state separate from execution success", () => {
    const clarification = projectFrontDoorRoutingState([
      {
        artifactId: "artifact-clarification",
        jobId: "job-clarification",
        artifactType: "execution.front_door.clarification_gate",
        storageKind: "metadata",
        uri: "runtime-job://job-clarification/execution/front-door/clarification-gate",
        contentType: "application/json",
        sizeBytes: null,
        sha256: null,
        metadata: {
          outcome: "clarification_required",
          clarification: {
            clarificationId: "clarification-1",
            questionSummary: "Which job should continue?",
            allowedAnswerShape: "select_target",
            targetRefs: ["runtime-job://job-a", "runtime-job://job-b"],
          },
          reasonCodes: ["multiple_active_jobs"],
        },
        createdAt: new Date(),
      },
    ]);
    const blocked = projectFrontDoorRoutingState([
      {
        artifactId: "artifact-blocked",
        jobId: "job-blocked",
        artifactType: "execution.front_door.validation",
        storageKind: "metadata",
        uri: "runtime-job://job-blocked/execution/front-door/validation",
        contentType: "application/json",
        sizeBytes: null,
        sha256: null,
        metadata: { outcome: "blocked", reasonCodes: ["stale_authority_snapshot"] },
        createdAt: new Date(),
      },
    ]);

    expect(clarification.state).toBe("clarification_required");
    expect(clarification.clarificationRef?.questionSummary).toContain("Which job");
    expect(blocked.state).toBe("blocked");
    expect(blocked.reasonCodes).toContain("stale_authority_snapshot");
  });

  it("projects missing front-door evidence as unknown, not success", () => {
    const projected = projectFrontDoorRoutingState([]);

    expect(projected.state).toBe("unknown");
    expect(projected.reasonCodes).toContain("front_door_routing_evidence_missing");
    expect(projected.rawPromptStored).toBe(false);
    expect(projected.rawResponseStored).toBe(false);
    expect(projected.rawLogsStored).toBe(false);
    expect(projected.workQueueLifecycleMutationAllowed).toBe(false);
  });

  it("projects multi-intent and child handoff refs without raw content", () => {
    const projected = projectFrontDoorRoutingState([
      {
        artifactId: "artifact-multi-intent",
        jobId: "job-multi-intent",
        artifactType: "execution.front_door.multi_intent_plan",
        storageKind: "metadata",
        uri: "runtime-job://job-multi-intent/execution/front-door/multi-intent-plan",
        contentType: "application/json",
        sizeBytes: null,
        sha256: null,
        metadata: { outcome: "plan_compiled", reasonCodes: ["multi_intent_plan_compiled"] },
        createdAt: new Date(),
      },
      {
        artifactId: "artifact-child-handoffs",
        jobId: "job-multi-intent",
        artifactType: "execution.front_door.child_handoffs",
        storageKind: "metadata",
        uri: "runtime-job://job-multi-intent/execution/front-door/child-handoffs",
        contentType: "application/json",
        sizeBytes: null,
        sha256: null,
        metadata: [{ childWorkflowId: "single_agent.web_research" }],
        createdAt: new Date(),
      },
    ]);

    expect(projected.multiIntentPlanOutcome).toBe("plan_compiled");
    expect(projected.childWorkflowHandoffCount).toBe(1);
    expect(JSON.stringify(projected)).not.toContain("raw transcript");
  });

  it("projects web research evidence without lifecycle ownership or raw pages", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "web-research-projection-job",
        jobType: "executor.single_agent",
        queueName: "web-research",
        workItemId: "web-research-projection-item",
        payload: {
          workflowId: "single_agent.web_research",
          objectiveSummary: "Research current structured-output docs.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await workQueue.createWorkItem({
        workItemId: "web-research-projection-item",
        itemType: "execution_workflow",
        title: "Web research projection",
      });
      await workQueue.createWorkRun({
        workItemId: "web-research-projection-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await recordWebResearchRuntimeEvidence({
        runtimeJobs,
        evidence: createWebResearchRuntimeEvidence({
          runtimeJobId: job.jobId,
          researchRunId: "web-research-projection-run",
          boundedQuerySummary: "Research current structured-output docs.",
          boundedAnswerSummary: "Structured-output docs should be cited by bounded refs only.",
          sources: [
            {
              sourceRef: "official-openai-docs://structured-outputs",
              sourceKind: "official_docs",
              urlHash: "url-hash",
              contentHash: "content-hash",
              titleSummary: "OpenAI structured outputs guide",
              citationSummary: "Official docs summary ref.",
              retrievedAt: "2026-05-08T00:00:00.000Z",
            },
          ],
        }),
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "web-research-projection-item",
      });
      const projected = model.runtimeJobs[0]?.webResearch;

      expect(projected?.state).toBe("present");
      expect(projected?.sourceCount).toBe(1);
      expect(projected?.citationCount).toBe(1);
      expect(projected?.rawPageStored).toBe(false);
      expect(projected?.externalWritePerformed).toBe(false);
      expect(projected?.workQueueLifecycleMutationAllowed).toBe(false);
      expect(JSON.stringify(projected)).not.toContain("raw page");
    });
  });

  it("projects canonical runtime queue from repository truth and closeout projection metadata", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const parent = await workQueue.createWorkItem({
        workItemId: "canonical-parent",
        itemType: "execution_workflow",
        title: "Canonical parent",
      });
      const child = await workQueue.createWorkItem({
        workItemId: "canonical-child",
        itemType: "execution_workflow",
        title: "Canonical child",
      });
      await workQueue.addDependency({
        workItemId: child.workItemId,
        dependsOnWorkItemId: parent.workItemId,
        dependencyType: "child_action",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "canonical-runtime-parent",
        jobType: "executor.agent_team",
      });
      await workQueue.createWorkRun({
        workItemId: parent.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await workQueue.recordCloseoutProjectionReadback({
        workItemId: parent.workItemId,
        closeoutRef: "runtime-job://canonical-runtime-parent/closeout",
        graphRefs: ["runtime-job://canonical-runtime-parent/runtime-work-graph/orchestrator/plan"],
        validationRefs: [
          "runtime-job://canonical-runtime-parent/runtime-work-graph/validation/rerun",
        ],
        humanDecisionRefs: ["owner-decision://work-queue/canonical-scope"],
        followUpChildWorkItemIds: [parent.workItemId, "canonical-follow-up-child"],
        blockerReasonCodes: ["repair_attempt_recorded"],
        limitations: ["closeout updates projection metadata only"],
        eli5Progress:
          "We kept the queue order from runtime truth and only attached bounded closeout refs.",
        nextStep: "Review child follow-up before creating a new runtime job.",
      });

      const projection = await workQueue.projectCanonicalRuntimeQueue();
      const parentProjection = projection.active.find(
        (item) => item.workItemId === parent.workItemId,
      );
      expect(parentProjection?.runtimeJobIds).toEqual(["canonical-runtime-parent"]);
      expect(parentProjection?.closeoutRefs).toContain(
        "runtime-job://canonical-runtime-parent/closeout",
      );
      expect(parentProjection?.graphRefs).toContain(
        "runtime-job://canonical-runtime-parent/runtime-work-graph/orchestrator/plan",
      );
      expect(parentProjection?.validationRefs).toContain(
        "runtime-job://canonical-runtime-parent/runtime-work-graph/validation/rerun",
      );
      expect(parentProjection?.humanDecisionRefs).toContain(
        "owner-decision://work-queue/canonical-scope",
      );
      expect(parentProjection?.childWorkItemIds).toContain("canonical-follow-up-child");
      expect(parentProjection?.childWorkItemIds).not.toContain(parent.workItemId);
      expect(parentProjection?.blockerReasonCodes).toContain("repair_attempt_recorded");
      expect(parentProjection?.blockerReasonCodes).toContain(
        "closeout_readback_self_child_ref_rejected",
      );
      expect(parentProjection?.eli5Progress).toContain("queue order from runtime truth");
      expect(parentProjection?.nextStep).toContain("Review child follow-up");
      expect(parentProjection?.lifecycleTruthSource).toBe("work_queue_repository");
      expect(parentProjection?.sourceTrackerLifecycleOwner).toBe(false);
      expect(parentProjection?.workQueueLifecycleMutationAllowed).toBe(false);
      expect(projection.sourceTrackerMode).toBe("db_primary_no_source_tracker");
      expect(projection.lifecycleTruthSource).toBe("work_queue_repository");
      const truthProjection = projectCanonicalRuntimeQueue([
        (await workQueue.readWorkItemTruth(parent.workItemId))!,
        (await workQueue.readWorkItemTruth(child.workItemId))!,
      ]);
      expect(truthProjection.active[0]?.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });
});
it("builds an owner-readable fallback summary when model closeout prose is absent", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const job = await runtimeJobs.enqueueJob({
      jobId: "planning-fallback-summary-job",
      jobType: "executor.agent_team",
      workItemId: "planning-fallback-summary-item",
      payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
    });
    await workQueue.createWorkItem({
      workItemId: "planning-fallback-summary-item",
      itemType: "execution_workflow",
      title: "Planning fallback summary",
    });
    await workQueue.createWorkRun({
      workItemId: "planning-fallback-summary-item",
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.product_spec_planning_worker_contract",
      storageKind: "metadata",
      uri: "runtime-job://planning-fallback-summary-job/planning-contract",
      metadata: {
        artifactKind: "product_spec_planning_worker_contract",
        contractVersion: "v1",
        planningMode: "child_action_graph_proposal",
        planningOutputKind: "child_action_graph_proposal_output",
        workflowRefs: [
          "workflow://agent_team.coding",
          "runtime-job://planning-fallback-summary-job/runtime-work-graph/graph",
        ],
        childActionProposalRefs: [
          "runtime-job://planning-fallback-summary-job/runtime-work-graph/proposal/implementation",
        ],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposals",
        ],
        validationRefs: ["validation://planning-fallback-summary"],
        limitations: ["Owner review still required before execution."],
        eli5Progress: "OpenClaw mapped planning defaults from bounded contract evidence.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      },
    });
    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId: "planning-fallback-summary-item",
    });
    expect(model.runtimeJobs[0]?.ownerReadback.state).toBe("needs_review");
    expect(model.runtimeJobs[0]?.ownerReadback.humanReportSummary).toContain("Planning mode");
    expect(model.runtimeJobs[0]?.ownerReadback.humanReportSummary).toContain(
      "bounded human decision",
    );
    expect(model.runtimeJobs[0]?.ownerReadback.planningMode).toBe("child_action_graph_proposal");
  });
});

it("accepts invalid no-op repair correction only with linked passed rerun validation refs", () => {
  const passedRerunRef =
    "runtime-job://native-exec/runtime-work-graph/validation/repair-rerun-explicit";
  const summary = summarizeProductSpecPlanningValidationRepairEvidence({
    artifacts: [
      {
        artifactType: "agent_team.dynamic_validation",
        uri: "runtime-job://native-exec/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
        metadata: {
          status: "failed",
          proofMode: "forced_validation_failure_once",
          boundedFailureSummary:
            "Controlled parity proof injected one failed validation state for same-job repair.",
          rawCommandLogsStored: false,
        },
      },
      {
        artifactType: "agent_team.dynamic_validation",
        uri: passedRerunRef,
        metadata: {
          status: "passed",
          rawCommandLogsStored: false,
        },
      },
      {
        artifactType: "agent_team.dynamic_validation_repair_loop",
        uri: "runtime-job://native-exec/runtime-work-graph/validation/repair-loop-no-op-linked",
        metadata: {
          finalState: "passed",
          repairAttemptCount: 1,
          validationRefs: [passedRerunRef],
          reasonCodes: ["bounded", "invalid_no_op_repair_for_failed_validation_corrected"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      },
    ],
  });

  expect(summary.hasFailureAttemptRef).toBe(true);
  expect(summary.hasRepairAttemptRef).toBe(true);
  expect(summary.hasBothFailureAndRepairRefs).toBe(true);
  expect(summary.reasonCodes).toEqual(
    expect.arrayContaining(["validation_repair_recorded_from_metadata"]),
  );
  expect(summary.reasonCodes).not.toContain(
    "product_spec_planning_validation_repair_missing_after_failure",
  );
});

it("surfaces bounded Codex app-server progress in owner progress readback", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "app-server-progress-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "app-server-progress-runtime-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Improve readback." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "App-server progress readback",
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "codex_parity.app_server_progress",
      data: {
        artifactKind: "codex_parity_app_server_progress_projection",
        runtimeJobId: job.jobId,
        graphNodeId: "implementation-1",
        modelRef: "openai-codex/gpt-5.5",
        providerPath: "codex_app_server",
        event: {
          method: "item/completed",
          threadId: "thread-abc",
          turnId: "turn-def",
          phase: "item_completed",
          itemType: "fileChange",
          status: "completed",
          fileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
          commandRefs: ["pnpm test:file execution-read-model.test.ts"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });

    expect(model.runtimeJobs[0]?.ownerProgressReadback.appServerProgress).toMatchObject({
      state: "present",
      eventCount: 1,
      activePhase: "item_completed",
      lastMethod: "item/completed",
      lastItemType: "fileChange",
      lastItemStatus: "completed",
      threadRefs: ["codex-thread://thread-abc"],
      turnRefs: ["codex-turn://turn-def"],
      fileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      commandRefs: ["pnpm test:file execution-read-model.test.ts"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });
});

it("surfaces active scheduler graph progress in owner progress readback", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "active-graph-progress-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "active-graph-progress-runtime-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Improve readback." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Active graph progress readback",
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "runtime-work-graph-1",
        nodeId: "context-1",
        activeNodeKind: "context_scout",
        roleId: "context_scout",
        modelRef: "deepseek/deepseek-v4-flash",
        currentObjective: "Find target files for the implementation.",
        whyThisNodeWasChosen: "Implementation needs bounded file refs before editing.",
        targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        inputHandoffRefs: ["mission-contract://commitment/code-edit"],
        expectedOutput: "Bounded context refs.",
        currentPhase: "node_started",
        validationState: "not_started",
        selectedCapabilityId: "context_scout",
        capabilityCostClass: "cheap",
        capabilityUtilityRationale:
          "The context scout is the cheapest way to reduce file uncertainty.",
        capabilityCostRationale: "Use a cheap context lane before expensive implementation.",
        consideredCapabilityIds: ["context_scout", "implementation_complex"],
        evidenceProducedRefs: ["artifact://context/context-1"],
        evidenceClaimRefs: ["artifact://context/context-1"],
        acceptedCommitmentIds: ["context"],
        rejectedCommitmentIds: [],
        remainingOpenCommitmentIds: ["code-edit", "validation"],
        nextDecisionNeeded: "node_result",
        blockerSummary: "2 blocking commitments remain open.",
        latestToolEventKind: "worker.invoke",
        eli5Progress: "The context scout is finding the files the implementer should edit.",
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.invoke",
        schedulerToolInvocationRefs: ["runtime-tool://worker-invoke-1"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });

    expect(model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress).toMatchObject({
      state: "present",
      graphId: "runtime-work-graph-1",
      activeNodeId: "context-1",
      activeNodeKind: "context_scout",
      roleId: "context_scout",
      modelRef: "deepseek/deepseek-v4-flash",
      objective: "Find target files for the implementation.",
      whySelected: "Implementation needs bounded file refs before editing.",
      targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      inputHandoffRefs: ["mission-contract://commitment/code-edit"],
      expectedOutput: "Bounded context refs.",
      currentPhase: "node_started",
      validationState: "not_started",
      costAwareDecision: {
        selectedCapabilityId: "context_scout",
        costClass: "cheap",
        utilityRationale: "The context scout is the cheapest way to reduce file uncertainty.",
        costRationale: "Use a cheap context lane before expensive implementation.",
        whyCheaperOptionsWereInsufficient: null,
        consideredCapabilityIds: ["context_scout", "implementation_complex"],
      },
      schedulerToolTrace: {
        schedulerPhase: "execution_in_progress",
        latestToolId: "worker.invoke",
        invocationRefs: ["runtime-tool://worker-invoke-1"],
      },
      evidenceProducedRefs: ["artifact://context/context-1"],
      evidenceClaimRefs: ["artifact://context/context-1"],
      acceptedCommitmentIds: ["context"],
      rejectedCommitmentIds: [],
      openCommitmentIds: ["code-edit", "validation"],
      nextDecisionNeeded: "node_result",
      blockerSummary: "2 blocking commitments remain open.",
      latestToolEventKind: "worker.invoke",
      eli5Progress: "The context scout is finding the files the implementer should edit.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });
});

it("links closed work items to their closeout runtime job for progress readback", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "closed-closeout-runtime-progress-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "closed-closeout-runtime-progress-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Close with evidence." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Closed item runtime progress readback",
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "closed-runtime-graph",
        nodeId: "implementation-1",
        activeNodeKind: "implementation",
        roleId: "implementation_engineer",
        modelRef: "moonshotai/kimi-k2.6",
        currentObjective: "Apply a scoped non-Codex file edit.",
        currentPhase: "worker_loop_completed",
        validationState: "passed",
        changedFileRefs: ["extensions/execution-platform/src/codex-bridge/proof.ts"],
        validationRefs: ["validation://closed-runtime-progress"],
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.evidence.handoff",
        schedulerToolInvocationRefs: ["runtime-tool://worker-evidence-handoff"],
        workerToolIds: ["worker.repo.search", "worker.evidence.handoff"],
        reasonCodes: ["scheduler_tool_invoked:worker.evidence.handoff"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: job.jobId,
      closeoutRef: "closeout://closed-runtime-progress",
      accepted: true,
      validationRequired: true,
      validationRef: "validation://closed-runtime-progress",
      sourceEditRequired: true,
      changedFileRefs: ["extensions/execution-platform/src/codex-bridge/proof.ts"],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });

    expect(model.linkedRuntimeJobIds).toEqual([job.jobId]);
    expect(model.convergenceSlice?.runtimeJobRefs).toEqual([`runtime-job://${job.jobId}`]);
    expect(model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress).toMatchObject({
      state: "present",
      graphId: "closed-runtime-graph",
      activeNodeId: "implementation-1",
      workerToolTrace: {
        latestWorkerToolId: "worker.evidence.handoff",
        workerToolIds: ["worker.repo.search", "worker.evidence.handoff"],
        invocationRefs: ["runtime-tool://worker-evidence-handoff"],
        changedFileRefs: ["extensions/execution-platform/src/codex-bridge/proof.ts"],
        validationRefs: ["validation://closed-runtime-progress"],
      },
    });
  });
});
