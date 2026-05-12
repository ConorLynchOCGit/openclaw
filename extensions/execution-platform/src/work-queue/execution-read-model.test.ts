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
import {
  buildWorkQueueExecutionReadModel,
  projectFrontDoorRoutingState,
  summarizeWorkQueueExecutionForUi,
} from "./execution-read-model.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

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
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
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
        taskSuccess: "satisfied",
        opportunitySeedCount: 1,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
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
});
