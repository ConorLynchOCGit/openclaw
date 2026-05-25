import { describe, expect, it } from "vitest";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "../codex-bridge/agent-team-runtime-evidence.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { buildRuntimeExecutionSpan } from "../observability/runtime-execution-span.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { applyRuntimeWorkerSupervisorControl } from "../workers/runtime-worker-supervisor-controls.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { recordWorkerCloseoutCapsule } from "../workers/worker-closeout-capsule.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "../workflows/agent-team-coding-plugin.ts";
import {
  SKILLIFIER_RUNTIME_JOB_TYPE,
  SKILLIFIER_WORKFLOW_ID,
} from "../workflows/skillifier-runtime-workflow.ts";
import {
  createWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
} from "../workflows/web-research-runtime-evidence.ts";
import {
  WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE,
  createWorkflowCompletionReviewFromCloseout,
  evaluateWorkflowCompletionReviewGate,
  workflowCompletionReviewArtifactMetadata,
} from "../workflows/workflow-completion-review.ts";
import { requireCanonicalWorkflowDefinition } from "../workflows/workflow-definition-registry.ts";
import {
  WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
  workflowDefinitionResolutionArtifactMetadata,
  workflowDefinitionResolutionFor,
} from "../workflows/workflow-definition.ts";
import {
  WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
  evaluateWorkflowEvidenceProfile,
  workflowEvidenceProfileEvaluationArtifactMetadata,
} from "../workflows/workflow-evidence-profile.ts";
import {
  WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
  workflowPluginResolutionArtifactMetadata,
  workflowPluginResolutionFor,
} from "../workflows/workflow-plugin.ts";
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
import "../workflows/product-spec-planning-plugin.test.ts";
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
  it("surfaces runtime artifact payload manifests without hydrating large bodies", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "payload-manifest-readback-item",
        itemType: "execution_workflow",
        title: "Payload manifest readback",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "payload-manifest-readback-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        runId: "payload-manifest-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await runtimeJobs.attachRuntimeArtifactByContract({
        jobId: runtimeJob.jobId,
        artifactType: "execution_platform.node_execution_packet",
        uri: "runtime-job://payload-manifest-readback-job/node-execution-packet/node-1",
        body: {
          packetKind: "node_execution_packet",
          content: "large worker body ".repeat(1_000),
          rawPromptStored: false,
          rawResponseStored: false,
        },
        boundedSummary: "Node execution packet manifest only.",
        targetCommitmentIds: ["c-001"],
        targetNodeIds: ["node-1"],
        resourcePacketKind: "node_execution_packet",
        readinessStatus: "ready",
      });

      const readback = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });

      const summary = readback.runtimeJobs[0]?.artifactPayloads;
      expect(summary).toMatchObject({
        artifactKind: "work_queue_runtime_artifact_payload_manifest_summary",
        manifestCount: 1,
        artifactRefs: ["runtime-job://payload-manifest-readback-job/node-execution-packet/node-1"],
        artifactTypes: ["execution_platform.node_execution_packet"],
        hydrationToolId: "artifact.payload.get_json",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(summary?.payloadRefs[0]).toContain("runtime-artifact-payload://");
      expect(JSON.stringify(summary)).not.toContain("large worker body");
    });
  });

  it("surfaces demand-driven context broker progress from scheduler events", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "context-broker-readback-item",
        itemType: "execution_workflow",
        title: "Context broker readback",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "context-broker-readback-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        runId: "context-broker-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await runtimeJobs.recordEvent({
        jobId: runtimeJob.jobId,
        eventType: "agent_team.scheduler_progress",
        data: {
          artifactKind: "agent_team_scheduler_progress",
          runtimeJobId: runtimeJob.jobId,
          graphId: "graph-1",
          stage: "node_resource_materialization",
          status: "needs_review",
          nodeId: "impl-1",
          currentPhase: "node_resource_materialization_blocked",
          contextBrokerRequestRefs: [
            "runtime-job://context-broker-readback-job/context-broker/graph-1/impl-1/context-broker:abc",
          ],
          contextBrokerStatuses: ["context_scout_required"],
          contextBrokerDedupeKeys: ["context-broker:abc"],
          contextBrokerConsumerNodeIds: ["impl-1"],
          contextBrokerReasonCodes: [
            "context_broker_request_compiled",
            "context_broker_context_scout_required",
          ],
          contextBrokerNextTransition: "dispatch_context_scout",
          expansionAdmissionDecisionRef:
            "runtime-work-graph://expansion-admission/graph-1/1/admission",
          expansionAdmissionPolicyRef: "runtime-work-graph.expansion-admission.v1",
          expansionAdmissionStatus: "accepted_paged",
          expansionAdmissionOriginalNodeCount: 14,
          expansionAdmissionOriginalEdgeCount: 22,
          expansionAdmissionAdmittedNodeCount: 4,
          expansionAdmissionAdmittedEdgeCount: 6,
          expansionAdmissionDeferredNodeCount: 10,
          expansionAdmissionDeferredEdgeCount: 16,
          expansionAdmissionReadyFrontierNodeIds: ["impl-ready-1"],
          expansionAdmissionAdmittedNodeIds: ["context-1", "context-2"],
          expansionAdmissionDeferredNodeIds: ["context-3"],
          expansionAdmissionNextTransition: "persist_admitted_page",
          expansionAdmissionPrerequisiteCritical: false,
          expansionAdmissionReasonCodes: ["expansion_accepted_paged"],
          contextRequestRefs: ["legacy-context-request://impl-1"],
          reasonCodes: ["node_readiness_context_packet_refs_not_accepted_handoffs"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });

      expect(
        model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.contextBroker,
      ).toMatchObject({
        state: "present",
        requestRefs: [
          "runtime-job://context-broker-readback-job/context-broker/graph-1/impl-1/context-broker:abc",
        ],
        statuses: ["context_scout_required"],
        dedupeKeys: ["context-broker:abc"],
        consumerNodeIds: ["impl-1"],
        scoutRequiredCount: 1,
        nextTransition: "dispatch_context_scout",
        rawPromptStored: false,
      });
      expect(
        model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.expansionAdmission,
      ).toMatchObject({
        state: "present",
        status: "accepted_paged",
        originalNodeCount: 14,
        admittedNodeCount: 4,
        deferredNodeCount: 10,
        readyFrontierNodeIds: ["impl-ready-1"],
        admittedNodeIds: ["context-1", "context-2"],
        deferredNodeIds: ["context-3"],
        nextTransition: "persist_admitted_page",
        prerequisiteCritical: false,
      });
    });
  });

  it("surfaces canonical superstep branch results from scheduler progress", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "superstep-branch-readback-item",
        itemType: "execution_workflow",
        title: "Superstep branch readback",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "superstep-branch-readback-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        runId: "superstep-branch-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await runtimeJobs.recordEvent({
        jobId: runtimeJob.jobId,
        eventType: "agent_team.scheduler_progress",
        data: {
          artifactKind: "agent_team_scheduler_progress",
          runtimeJobId: runtimeJob.jobId,
          graphId: "graph-1",
          stage: "scheduler_parallel_frontier",
          status: "needs_review",
          currentPhase: "parallel_frontier_completed",
          schedulerPhase: "execution_in_progress",
          schedulerToolId: "scheduler.join_superstep_frontier",
          schedulerToolInvocationRefs: [
            "runtime-tool://superstep/open",
            "runtime-tool://superstep/branch-results",
            "runtime-tool://superstep/join",
          ],
          parallelFrontier: {
            artifactKind: "runtime_work_graph_parallel_frontier_readback",
            schemaVersion: "execution-platform.runtime-work-graph.parallel-frontier.v1",
            currentSuperstep: 3,
            maxParallelNodeExecutions: 4,
            dependencyLayers: [],
            dependencyLayerCount: 0,
            readyNodeIds: ["impl-a", "impl-b"],
            rawRunnableNodeIds: ["impl-a", "impl-b"],
            selectedNodeIds: ["impl-a", "impl-b"],
            runningNodeIds: [],
            completedNodeIds: ["impl-a"],
            blockedNodeIds: ["impl-b"],
            failedNodeIds: [],
            needsReviewNodeIds: ["impl-b"],
            waitingForHumanNodeIds: [],
            skippedReasonCodes: [],
            conflictDomains: [],
            providerConcurrencyBudgets: [],
            branchResults: [
              {
                artifactKind: "runtime_work_graph_superstep_branch_result",
                schemaVersion: "execution-platform.superstep-branch-result.v1",
                superstepId: "parallel-frontier-3",
                branchId: "parallel-frontier-3:branch:1:impl-a",
                nodeId: "impl-a",
                nodeKind: "implementation",
                capabilityId: "implementation_microtask",
                targetCommitmentIds: ["C1"],
                status: "succeeded",
                failureClass: null,
                errorPath: null,
                errorSummary: null,
                blockerSummary: null,
                repairAction: null,
                nextTransition: "evaluate_downstream",
                evidenceRefs: ["artifact://impl-a/evidence"],
                readinessStateRef: "readiness://impl-a",
                reasonCodes: ["impl_a_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                rawCommandLogStored: false,
                rawDbRowsStored: false,
                secretsStored: false,
              },
              {
                artifactKind: "runtime_work_graph_superstep_branch_result",
                schemaVersion: "execution-platform.superstep-branch-result.v1",
                superstepId: "parallel-frontier-3",
                branchId: "parallel-frontier-3:branch:2:impl-b",
                nodeId: "impl-b",
                nodeKind: "implementation",
                capabilityId: "implementation_microtask",
                targetCommitmentIds: ["C2"],
                status: "blocked_context",
                failureClass: "context_supply",
                errorPath: "nodeReadiness.contextStatus",
                errorSummary: "Accepted context handoff missing.",
                blockerSummary: "Accepted context handoff missing.",
                repairAction: "request_context_repair",
                nextTransition: "request_context_or_reuse_context",
                evidenceRefs: [],
                readinessStateRef: "readiness://impl-b",
                reasonCodes: ["context_handoff_missing"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                rawCommandLogStored: false,
                rawDbRowsStored: false,
                secretsStored: false,
              },
            ],
            joinReadyNodeIds: [],
            contextSynthesisRefs: [],
            implementationGroupCount: 2,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
          reasonCodes: ["scheduler_parallel_frontier_executed"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });

      expect(
        model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.parallelFrontier,
      ).toMatchObject({
        state: "present",
        currentSuperstep: 3,
        selectedNodeIds: ["impl-a", "impl-b"],
        branchResults: [
          {
            branchId: "parallel-frontier-3:branch:1:impl-a",
            nodeId: "impl-a",
            status: "succeeded",
            nextTransition: "evaluate_downstream",
            evidenceRefs: ["artifact://impl-a/evidence"],
          },
          {
            branchId: "parallel-frontier-3:branch:2:impl-b",
            nodeId: "impl-b",
            status: "blocked_context",
            blockerSummary: "Accepted context handoff missing.",
            nextTransition: "request_context_or_reuse_context",
            readinessStateRef: "readiness://impl-b",
          },
        ],
      });
    });
  });

  it("surfaces canonical workflow definition, runtime engine, and completion review state", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "workflow-definition-readback-item",
        itemType: "execution_workflow",
        title: "Workflow definition readback",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "workflow-definition-readback-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        runId: "workflow-definition-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      const definition = requireCanonicalWorkflowDefinition("agent_team.coding");
      const plugin = buildAgentTeamCodingWorkflowPlugin({
        definition,
        executors: {
          "kind:context_scout": {} as never,
          "kind:implementation": {} as never,
          "kind:validation": {} as never,
          "kind:test_review": {} as never,
          "kind:repair": {} as never,
          "kind:reviewer": {} as never,
          "kind:observability_readback": {} as never,
          "kind:human_task": {} as never,
          "kind:closeout": {} as never,
          "role:context_scout": {} as never,
          "role:implementation_engineer": {} as never,
          "role:test_engineer": {} as never,
          "role:reviewer": {} as never,
          "role:observability_scribe": {} as never,
        },
      });
      const profile = evaluateWorkflowEvidenceProfile({
        workflowId: definition.workflowId,
        runtimeJobId: runtimeJob.jobId,
        workItemId: workItem.workItemId,
        closeoutSource: "model",
        evidenceClassRefs: {
          runtime_graph: ["runtime-graph://graph-1"],
          scheduler_tool_trace: ["runtime-tool://scheduler.select_next_node/invocation-1"],
          worker_tool_trace: ["runtime-tool://worker.invoke/invocation-1"],
          source_change: ["repo://file.ts#hash"],
          validation: ["validation://focused"],
          review: ["review://reviewer"],
          closeout: ["closeout://capsule-1"],
          work_queue_readback: ["work-queue://workflow-definition-readback-item/readback"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: runtimeJob.jobId,
        workflowId: definition.workflowId,
      });
      const completionReview = createWorkflowCompletionReviewFromCloseout({
        definition,
        runtimeJobId: runtimeJob.jobId,
        closeoutCapsule: capsule,
        workflowEvidenceProfile: profile,
        profileEvaluationRef: "runtime-job://workflow-definition-readback-job/profile",
        missionLedgerRefs: ["runtime-job://workflow-definition-readback-job/ledger"],
        runtimeGraphRefs: ["runtime-graph://graph-1"],
        runtimeToolTraceRefs: ["runtime-tool://scheduler.select_next_node/invocation-1"],
        validationRefs: ["validation://focused"],
        reviewRefs: ["review://reviewer"],
        closeoutRefs: ["closeout://capsule-1"],
        workQueueReadbackRefs: ["work-queue://workflow-definition-readback-item/readback"],
        limitations: [],
      });
      const completionReviewGate = evaluateWorkflowCompletionReviewGate({
        definition,
        review: completionReview,
        requiredEvidenceRefs: ["runtime-graph://graph-1", "closeout://capsule-1"],
        completionReviewRef: "runtime-job://workflow-definition-readback-job/completion-review",
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: "runtime-job://workflow-definition-readback-job/execution/workflow-definition/agent_team.coding",
        contentType: "application/json",
        metadata: workflowDefinitionResolutionArtifactMetadata(
          workflowDefinitionResolutionFor(definition),
        ),
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: "runtime-job://workflow-definition-readback-job/execution/workflow-plugin/agent_team.coding",
        contentType: "application/json",
        metadata: workflowPluginResolutionArtifactMetadata(
          workflowPluginResolutionFor({ plugin, definition }),
        ),
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: "execution.runtime_workflow_graph_engine_readiness",
        storageKind: "metadata",
        uri: "runtime-job://workflow-definition-readback-job/execution/runtime-workflow-graph-engine/agent_team.coding",
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_workflow_graph_engine_readiness",
          engineId: "runtime-workflow-graph-engine.v1",
          workflowId: definition.workflowId,
          definitionId: definition.definitionId,
          pluginId: plugin.pluginId,
          pluginReady: true,
          ready: true,
          reasonCodes: ["workflow_definition_production_enabled"],
          missingExecutorKeys: [],
          missingPluginExecutorKeys: [],
          missingRuntimeToolFamilies: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      const genericRuntimeResult = {
        artifactKind: "generic_orchestration_runtime_result",
        engineId: "generic-orchestration-runtime-engine.v1",
        workflowId: definition.workflowId,
        runtimeJobId: runtimeJob.jobId,
        status: "succeeded",
        schedulerStatus: "succeeded",
        graphId: "graph-1",
        executedNodeIds: ["node-context", "node-implementation", "node-closeout"],
        addedNodeIds: ["node-context", "node-implementation", "node-closeout"],
        decisionRefs: ["runtime-tool://scheduler/decision-1"],
        reasonCodes: ["generic_orchestration_runtime_scheduler_executed"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
      await runtimeJobs.attachRuntimeArtifactByContract({
        jobId: runtimeJob.jobId,
        artifactType: "execution.generic_orchestration_runtime_result",
        uri: "runtime-job://workflow-definition-readback-job/execution/generic-orchestration-runtime/result/agent_team.coding",
        contentType: "application/json",
        body: genericRuntimeResult,
        boundedSummary: "Generic orchestration runtime succeeded for readback.",
        targetNodeIds: ["node-context", "node-implementation", "node-closeout"],
        resourcePacketKind: "generic_orchestration_runtime_result",
        readinessStatus: "succeeded",
        reasonCodes: ["generic_orchestration_runtime_scheduler_executed"],
        metadata: genericRuntimeResult,
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: "runtime-job://workflow-definition-readback-job/execution/completion-review",
        contentType: "application/json",
        metadata: workflowCompletionReviewArtifactMetadata(completionReview),
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: "execution.workflow_completion_review_gate",
        storageKind: "metadata",
        uri: "runtime-job://workflow-definition-readback-job/execution/completion-review-gate",
        contentType: "application/json",
        metadata: completionReviewGate,
      });

      const readback = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });

      expect(readback.runtimeJobs[0]?.workflow.extension).toMatchObject({
        workflowDefinition: {
          workflowId: "agent_team.coding",
          status: "production_ready",
          productionEnabled: true,
          schedulerBacked: true,
          completionReviewRequired: true,
        },
        workflowPlugin: {
          pluginId: "workflow-plugin.agent_team.coding.v1",
          workflowId: "agent_team.coding",
          status: "production_ready",
          productionEnabled: true,
          completionReviewRequired: true,
          stagedSchedulerProtocolRequired: true,
          stagedGraphAcceptanceRequired: true,
          runtimeDerivedNodeEnvelopeRequired: true,
          runtimeDerivedExpectedEvidenceRequired: true,
          modelAuthoredStructureReviewRequired: true,
          firstNodeApprovalRequired: true,
          directImplementationFirstMovePolicy: "simple_only",
          degradedCloseoutSuccessAllowed: false,
        },
        runtimeWorkflowEngine: {
          ready: true,
          pluginId: "workflow-plugin.agent_team.coding.v1",
          pluginReady: true,
          missingExecutorKeys: [],
          missingPluginExecutorKeys: [],
          missingRuntimeToolFamilies: [],
        },
        genericOrchestrationRuntime: {
          engineId: "generic-orchestration-runtime-engine.v1",
          status: "succeeded",
          schedulerStatus: "succeeded",
          graphId: "graph-1",
          executedNodeIds: ["node-context", "node-implementation", "node-closeout"],
        },
        completionReview: {
          outcome: "accepted",
          confidence: "high",
        },
        completionReviewGate: {
          accepted: true,
          outcome: "accepted",
        },
      });
    });
  });

  it("surfaces workflow evidence profile status and missing classes in readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "workflow-profile-readback-item",
        itemType: "execution_workflow",
        title: "Workflow profile readback",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "workflow-profile-readback-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { workflowId: "agent_team.coding" },
      });
      await workQueue.createWorkRun({
        runId: "workflow-profile-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      const evaluation = evaluateWorkflowEvidenceProfile({
        workflowId: "agent_team.coding",
        runtimeJobId: runtimeJob.jobId,
        workItemId: workItem.workItemId,
        closeoutSource: "model",
        evidenceClassRefs: {
          runtime_graph: ["runtime-graph://graph-1"],
          closeout: ["closeout://capsule-1"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      });
      await runtimeJobs.attachArtifact({
        jobId: runtimeJob.jobId,
        artifactType: WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: "runtime-job://workflow-profile-readback-job/execution/workflow-evidence-profile/agent_team.coding",
        contentType: "application/json",
        metadata: workflowEvidenceProfileEvaluationArtifactMetadata(evaluation),
      });

      const readback = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });

      expect(readback.runtimeJobs[0]?.workflow.blockerReasonCodes).toEqual(
        expect.arrayContaining([
          "workflow_evidence_profile_not_accepted",
          "workflow_evidence_missing:scheduler_tool_trace",
        ]),
      );
      expect(readback.runtimeJobs[0]?.workflow.extension).toMatchObject({
        workflowEvidenceProfile: {
          accepted: false,
          missingEvidenceClasses: expect.arrayContaining(["scheduler_tool_trace"]),
        },
      });
    });
  });

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
          decisionState: "accepted",
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
        planningDecisionState: "accepted",
      });
      expect(model.runtimeJobs[0]?.ownerReadback.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("surfaces Product/Spec Planning decision options and pending or rejected states", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "planning-decision-state-readback-job";
      const workItemId = "planning-decision-state-readback-item";
      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Planning decision state readback",
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
        teamRunId: "team-run-planning-decision-state-readback",
        workflowId: "agent_team.product_spec_planning",
      });
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.product_spec_planning_human_decision_request",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/human-decision/request-1`,
        metadata: {
          artifactKind: "product_spec_planning_human_decision_request",
          decisionState: "pending",
          decisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
          optionsAndTradeoffs: [
            "Approve compile readiness after one reviewer pass.",
            "Reject compile readiness and keep this as plan-only.",
          ],
          whatHappensAfterEachOption: [
            "The compiler can validate child proposals, but still cannot execute them.",
            "The planning job closes without compile-ready child proposals.",
          ],
          requiredResponseShape:
            "Choose approve_compile_ready or reject_compile_ready, with a short reason.",
          deadlineExpiresAt: "2026-05-20T00:00:00.000Z",
          blockingGraphRefs: ["runtime-work-graph://planning-decision-state/blocking-node"],
          resumeRefs: ["runtime-work-graph://planning-decision-state/resume-after-owner"],
          boundedResponseRefs: ["owner-response://planning-decision-state/pending"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      });

      const pendingModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });
      const pendingReadback = pendingModel.runtimeJobs[0]?.ownerReadback;

      expect(pendingReadback).toMatchObject({
        planningMode: "compile_ready",
        planningOutputKind: "compile_ready_output",
        humanDecisionState: "pending",
        planningDecisionState: "pending",
        humanDecisionResponseShape:
          "Choose approve_compile_ready or reject_compile_ready, with a short reason.",
        humanDecisionDeadlineExpiresAt: "2026-05-20T00:00:00.000Z",
        humanDecisionBlockingGraphRefs: [
          "runtime-work-graph://planning-decision-state/blocking-node",
        ],
        humanDecisionResumeRefs: [
          "runtime-work-graph://planning-decision-state/resume-after-owner",
        ],
        humanDecisionBoundedResponseRefs: ["owner-response://planning-decision-state/pending"],
      });
      expect(pendingReadback?.humanDecisionOptions).toEqual([
        {
          optionId: "option-1",
          optionSummary: "Approve compile readiness after one reviewer pass.",
          tradeoffSummary: "Approve compile readiness after one reviewer pass.",
          afterSelectionSummary:
            "The compiler can validate child proposals, but still cannot execute them.",
          decisionRef: null,
        },
        {
          optionId: "option-2",
          optionSummary: "Reject compile readiness and keep this as plan-only.",
          tradeoffSummary: "Reject compile readiness and keep this as plan-only.",
          afterSelectionSummary: "The planning job closes without compile-ready child proposals.",
          decisionRef: null,
        },
      ]);

      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.human_scope_decision",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/runtime-work-graph/human-decision/rejected`,
        metadata: {
          decisionState: "rejected",
          boundedDecisionRef:
            "owner-decision://product-spec-planning/default-compile-ready/rejected",
          boundedResponseRef: "owner-response://planning-decision-state/rejected",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });

      const rejectedModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });

      expect(rejectedModel.runtimeJobs[0]?.ownerReadback).toMatchObject({
        humanDecisionState: "present",
        planningDecisionState: "rejected",
        humanDecisionRefs: expect.arrayContaining([
          "owner-decision://product-spec-planning/default-compile-ready/rejected",
          `runtime-job://${runtimeJobId}/runtime-work-graph/human-decision/rejected`,
        ]),
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
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
          capsuleVersion: 2,
          previousCapsuleRef: `runtime-job://${runtimeJobId}/runtime-work-graph/planning-capsule/capsule-1-v1`,
          modelAuthored: true,
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
      expect(readback?.planningEvidenceSummary).toMatchObject({
        artifactKind: "product_spec_planning_owner_evidence_summary",
        runtimeWorkflowMappingRefs: [
          "workflow://agent_team.product_spec_planning",
          `runtime-job://${runtimeJobId}/runtime-work-graph/planning-surface`,
        ],
        planningCapsuleLifecycleState: "final_accepted",
        planningCapsuleLifecycleRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/planning-capsule/capsule-1-v2`,
        ],
        actionGraphCompileReadinessState: "compile_ready",
        actionGraphCompileReadinessRefs: expect.arrayContaining([
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal-1`,
          "validation://planning-surface/compile-readiness",
        ]),
        childActionsExecuted: false,
        runtimeJobsCreated: false,
        boundedEvidenceState: "bounded",
        rawStorageEvidenceRefs: [],
        reasonCodes: expect.arrayContaining([
          "product_spec_planning_runtime_workflow_mapping_present",
          "product_spec_planning_capsule_lifecycle:final_accepted",
          "product_spec_planning_compile_readiness:compile_ready",
          "product_spec_planning_proposed_child_actions_not_executed",
          "product_spec_planning_child_runtime_jobs_not_created",
          "product_spec_planning_bounded_evidence_refs_only",
        ]),
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
            {
              commitmentId: "commitment-production-evidence-buckets",
              status: "satisfied",
              commitmentText:
                "Expose workflow registration, executable node mapping, orchestrator-first, and compile-readiness evidence buckets.",
              acceptedEvidenceRefs: [
                "workflow://agent_team.product_spec_planning",
                "runtime-node-capability://agent_team.product_spec_planning/planning_orchestrator",
                "runtime-node-capability://agent_team.product_spec_planning/compile_runtime_plan",
                `runtime-job://${runtimeJobId}/runtime-work-graph/planning-orchestrator-first`,
                `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal`,
                "validation://product-spec-planning/compile-runtime-plan",
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
      expect(model.runtimeJobs[0]?.ownerReadback.missionContract).toMatchObject({
        boundedEvidenceState: "bounded",
        rawStorageEvidenceRefs: [],
      });
      expect(model.runtimeJobs[0]?.ownerReadback.planningEvidenceSummary).toMatchObject({
        changedFileRefs: [
          `runtime-job://${runtimeJobId}/codex-direct-main-repo/diff/main-repo-change`,
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        ],
        runtimeWorkflowMappingRefs: [
          "workflow://agent_team.product_spec_planning",
          `runtime-job://${runtimeJobId}/runtime-work-graph/product-spec-planning/graph`,
        ],
        workflowRegistrationEvidenceRefs: ["workflow://agent_team.product_spec_planning"],
        executableNodeMappingEvidenceRefs: expect.arrayContaining([
          "runtime-node-capability://agent_team.product_spec_planning/planning_orchestrator",
          "runtime-node-capability://agent_team.product_spec_planning/compile_runtime_plan",
        ]),
        orchestratorFirstEvidenceRefs: [
          `runtime-job://${runtimeJobId}/runtime-work-graph/planning-orchestrator-first`,
        ],
        actionGraphCompileReadinessRefs: expect.arrayContaining([
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal`,
          `runtime-job://${runtimeJobId}/codex-direct-main-repo/validation`,
        ]),
        actionGraphProposalCompileValidationRefs: expect.arrayContaining([
          `runtime-job://${runtimeJobId}/runtime-work-graph/action-graph/proposal`,
          "validation://product-spec-planning/compile-runtime-plan",
        ]),
        commitmentEvidenceClaimRefs: expect.arrayContaining([
          "workflow://agent_team.product_spec_planning",
          "runtime-node-capability://agent_team.product_spec_planning/planning_orchestrator",
          "validation://product-spec-planning/compile-runtime-plan",
        ]),
        boundedEvidenceState: "bounded",
        rawStorageEvidenceRefs: [],
        reasonCodes: expect.arrayContaining([
          "product_spec_planning_source_change_evidence_present",
          "product_spec_planning_runtime_workflow_mapping_present",
          "product_spec_planning_workflow_registration_evidence_present",
          "product_spec_planning_executable_node_mapping_evidence_present",
          "product_spec_planning_orchestrator_first_evidence_present",
          "product_spec_planning_action_graph_compile_validation_evidence_present",
          "product_spec_planning_commitment_evidence_claim_refs_present",
          "product_spec_planning_bounded_evidence_refs_only",
        ]),
      });
    });
  });

  it("flags unbounded Product/Spec Planning Mission Ledger evidence refs in readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "planning-ledger-raw-ref-readback-job";
      const workItemId = "planning-ledger-raw-ref-readback-item";
      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: { workflowId: "agent_team.product_spec_planning", authorityProfile: "read_only" },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Planning ledger raw ref readback",
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
        teamRunId: "team-run-planning-ledger-raw-ref-readback",
        workflowId: "agent_team.product_spec_planning",
      });
      await recordWorkerCloseoutCapsule({ runtimeJobs, capsule });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.mission_contract_ledger",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/mission-contract-ledger/product-spec-planning/1`,
        metadata: {
          artifactKind: "mission_contract_ledger",
          ledgerStatus: "satisfied",
          blockingCommitments: [
            {
              commitmentId: "commitment-raw-ref",
              status: "satisfied",
              commitmentText: "Reject raw provider log refs as bounded ledger evidence.",
              acceptedEvidenceRefs: [
                `runtime-job://${runtimeJobId}/provider-log/raw-transcript/full`,
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

      expect(model.runtimeJobs[0]?.ownerReadback.missionContract).toMatchObject({
        boundedEvidenceState: "needs_review",
        rawStorageEvidenceRefs: [`runtime-job://${runtimeJobId}/provider-log/raw-transcript/full`],
        reasonCodes: expect.arrayContaining(["mission_contract_raw_storage_evidence_ref_present"]),
      });
      expect(model.runtimeJobs[0]?.ownerReadback.planningEvidenceSummary).toMatchObject({
        boundedEvidenceState: "needs_review",
        rawStorageEvidenceRefs: [`runtime-job://${runtimeJobId}/provider-log/raw-transcript/full`],
        reasonCodes: expect.arrayContaining([
          "product_spec_planning_bounded_evidence_needs_review",
        ]),
      });
      expect(model.runtimeJobs[0]?.ownerReadback.rawPromptStored).toBe(false);
      expect(model.runtimeJobs[0]?.ownerReadback.rawResponseStored).toBe(false);
      expect(model.runtimeJobs[0]?.ownerReadback.rawLogsStored).toBe(false);
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
          boundedAdapterDiagnostics: {
            sourceResult: {
              repairClassificationRefs: [
                "non-codex-worker-repair-classification://readback-validation",
              ],
              repairClassifications: [
                {
                  artifactKind: "runtime_repair_classification",
                  schemaVersion: "v1",
                  classificationId: "readback-validation",
                  classificationRef: "non-codex-worker-repair-classification://readback-validation",
                  failureClass: "validation_failure_repairable",
                  failedBoundaryKind: "validation",
                  repairStrategy: "same_boundary_repair",
                  selectedRepairBoundary: "validation",
                  failedCommitmentIds: ["commitment-readback"],
                  reasonCodes: ["worker_validation_run_failed"],
                  expectedNextAction: "Repair validation and rerun.",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                  rawCommandLogStored: false,
                  rawDbRowsStored: false,
                  secretsStored: false,
                  workQueueLifecycleMutated: false,
                },
              ],
            },
          },
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
          repairClassificationRefs: [
            "non-codex-worker-repair-classification://readback-validation",
          ],
          repairClassifications: [
            {
              classificationRef: "non-codex-worker-repair-classification://readback-validation",
              failureClass: "validation_failure_repairable",
              failedBoundaryKind: "validation",
              repairStrategy: "same_boundary_repair",
              selectedRepairBoundary: "validation",
              expectedNextAction: "Repair validation and rerun.",
              failedCommitmentIds: ["commitment-readback"],
              reasonCodes: ["worker_validation_run_failed"],
            },
          ],
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

  it("surfaces terminal adapter needs_review separately from retry lifecycle", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "adapter-needs-review-job",
        jobType: "executor.agent_team",
        workItemId: "adapter-needs-review-item",
        payload: { workflowId: "agent_team.coding" },
        maxAttempts: 3,
      });
      const claim = await runtimeJobs.claimNextJob({
        workerId: "worker",
        runtimeJobId: job.jobId,
      });
      await runtimeJobs.markJobNeedsReview({
        leaseToken: claim!.leaseToken,
        error: {
          code: "worker_adapter_needs_review",
          retryScheduled: false,
          summary: "Context synthesis needs focused repair.",
          reasonCodes: ["context_synthesis_group_guidance_missing"],
        },
        result: {
          status: "needs_review",
          artifactRefs: ["runtime-job://adapter-needs-review-job/context-synthesis/input-manifest"],
          completedWorkEvidenceRefs: [],
          reasonCodes: ["context_synthesis_group_guidance_missing"],
        },
      });
      await workQueue.createWorkItem({
        workItemId: "adapter-needs-review-item",
        itemType: "execution_workflow",
        title: "Adapter needs review",
      });
      await workQueue.createWorkRun({
        workItemId: "adapter-needs-review-item",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "adapter-needs-review-item",
      });

      expect(model.runtimeJobs[0]?.runtimeJobState).toBe("failed");
      expect(model.runtimeJobs[0]?.ownerProgressReadback.terminalAdapterOutcome).toMatchObject({
        status: "needs_review",
        errorCode: "worker_adapter_needs_review",
        retryScheduled: false,
        reasonCodes: ["context_synthesis_group_guidance_missing"],
      });
      expect(model.runtimeJobs[0]?.ownerProgressReadback.nextAction).toContain("diagnostic");
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
        providerPath: "openrouter",
        currentObjective: "Find target files for the implementation.",
        whyThisNodeWasChosen: "Implementation needs bounded file refs before editing.",
        targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        inputHandoffRefs: ["mission-contract://commitment/code-edit"],
        expectedOutput: "Bounded context refs.",
        currentPhase: "node_started",
        validationState: "not_started",
        selectedCapabilityId: "context_scout",
        selectedProviderCapabilityProfileId:
          "capability-profile://agent_team.coding/context_scout.v1",
        workerRef: "openrouter_model_lane",
        capabilityRoleClass: "context",
        capabilityCostClass: "cheap",
        capabilityLatencyClass: "medium",
        capabilityContextCapacity: "large",
        providerProfileProductionSelectable: true,
        providerProfileRequiresQualification: false,
        selectedModelQualificationProfileId: null,
        qualificationEvidenceRefs: [],
        capabilityUtilityRationale:
          "The context scout is the cheapest way to reduce file uncertainty.",
        capabilityCostRationale: "Use a cheap context lane before expensive implementation.",
        consideredCapabilityIds: ["context_scout", "implementation_complex"],
        consideredProviderCapabilityProfileIds: [
          "capability-profile://agent_team.coding/context_scout.v1",
          "capability-profile://agent_team.coding/implementation_complex.v1",
        ],
        evidenceProducedRefs: ["artifact://context/context-1"],
        evidenceClaimRefs: ["artifact://context/context-1"],
        genericNodeExecutionResultRefs: ["runtime-work-graph://node/context-1/generic-node-result"],
        evidenceClaims: [
          {
            evidenceClaimId: "evidence-claim:runtime-work-graph-1:context-1:context:1",
            commitmentId: "context",
            evidenceKind: "artifact",
            evidenceRef: "artifact://context/context-1",
            claimSummary: "Context scout produced a bounded handoff.",
            producedByNodeId: "context-1",
            producedByCapabilityId: "context_scout",
            producedByExecutorKey: "role:context_scout",
            validationRefs: [],
            changedFileRefs: [],
            limitations: [],
          },
        ],
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
        modelCallSpanId: "model-call-context-1",
        modelCallPhase: "heartbeat",
        modelCallSpanInputHash: "sha256:model-input-context-1",
        modelCallSpanResponseHash: null,
        modelCallSpanElapsedMs: 30_000,
        modelCallSpanTimeoutMs: 900_000,
        modelCallSpanHeartbeatCount: 2,
        modelCallSpanResponseShapeSummary: null,
        modelProviderDiagnostics: {
          structuredAdapterProfile: {
            artifactKind: "structured_adapter_provider_profile",
            profileRef: "structured-adapter-profile://local_semantic_extraction/test",
            taskClass: "local_semantic_extraction",
            reasoningMode: "none",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          structuredAdapterDiagnostics: {
            artifactKind: "structured_adapter_provider_diagnostics",
            profileRef: "structured-adapter-profile://local_semantic_extraction/test",
            contentLength: 1234,
            inputBytes: 9000,
            finishReason: "stop",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          structuredAdapterOutcome: {
            artifactKind: "structured_adapter_outcome",
            profileRef: "structured-adapter-profile://local_semantic_extraction/test",
            status: "succeeded",
            retryAllowed: false,
            schemaRepairRequired: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          usage: { inputTokenCount: 100, outputTokenCount: 50, totalTokenCount: 150 },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        sourcePromptHash: "prompt-hash-1",
        sourcePromptLength: 12345,
        sourcePromptResolutionStatus: "resolved",
        sourcePromptSectionRefs: ["source-prompt://prompt-hash-1/section-001/0-1000"],
        sourcePromptExcerptRequestRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        sourcePromptExcerptProvidedRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        sourcePromptExcerptDeniedRefs: [],
        verifiedContextFileRefs: [
          "extensions/execution-platform/src/work-queue/execution-read-model.ts",
        ],
        contextHandoffPacketRefs: ["runtime-job://job/context-handoff/context-1"],
        contextQualityState: "accepted",
        openContextBlockers: [],
        budgetPolicyRef: "runtime-task-budget://agent_team.coding/context_scout/standard",
        budgetClass: "standard",
        runtimeToolTimeoutMs: 900_000,
        modelCallTimeoutMs: 900_000,
        workerLoopTurnTimeoutMs: 900_000,
        validationCommandTimeoutMs: 900_000,
        progressEmissionIntervalMs: 10_000,
        staleProgressAfterMs: 120_000,
        leaseTimeoutMs: 180_000,
        leaseHeartbeatMs: 60_000,
        elapsedMs: 1250,
        budgetRemainingMs: 898_750,
        heartbeatState: "worker_call_started",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "runtime_execution.span",
      data: {
        executionSpan: buildRuntimeExecutionSpan({
          spanId: "model-call-context-1",
          rootSpanId: "active-graph-progress-runtime-job:runtime-work-graph-1",
          runtimeJobId: job.jobId,
          graphId: "runtime-work-graph-1",
          nodeId: "context-1",
          workItemId,
          spanKind: "model_call",
          status: "heartbeat",
          phase: "heartbeat",
          roleId: "context_scout",
          modelRef: "deepseek/deepseek-v4-flash",
          providerPath: "openrouter",
          objective: "Find target files for the implementation.",
          whySelected: "Implementation needs bounded file refs before editing.",
          currentAction: "Context scout model call is running.",
          inputRefs: ["mission-contract://commitment/code-edit"],
          inputHash: "sha256:model-input-context-1",
          evidenceRefs: ["artifact://context/context-1"],
          elapsedMs: 30_000,
          timeoutMs: 900_000,
          staleAfterMs: 120_000,
          reasonCodes: ["model_call_span_heartbeat"],
        }),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
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
        selectedProviderCapabilityProfileId:
          "capability-profile://agent_team.coding/context_scout.v1",
        workerRef: "openrouter_model_lane",
        roleClass: "context",
        costClass: "cheap",
        latencyClass: "medium",
        contextCapacity: "large",
        productionSelectable: true,
        productionSelectionRequiresQualification: false,
        selectedModelQualificationProfileId: null,
        qualificationEvidenceRefs: [],
        utilityRationale: "The context scout is the cheapest way to reduce file uncertainty.",
        costRationale: "Use a cheap context lane before expensive implementation.",
        whyCheaperOptionsWereInsufficient: null,
        consideredCapabilityIds: ["context_scout", "implementation_complex"],
        consideredProviderCapabilityProfileIds: [
          "capability-profile://agent_team.coding/context_scout.v1",
          "capability-profile://agent_team.coding/implementation_complex.v1",
        ],
      },
      schedulerToolTrace: {
        schedulerPhase: "execution_in_progress",
        latestToolId: "worker.invoke",
        invocationRefs: ["runtime-tool://worker-invoke-1"],
      },
      modelCallProgress: {
        state: "present",
        spanId: "model-call-context-1",
        phase: "heartbeat",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        roleId: "context_scout",
        nodeId: "context-1",
        objective: "Find target files for the implementation.",
        inputHash: "sha256:model-input-context-1",
        responseHash: null,
        elapsedMs: 30_000,
        timeoutMs: 900_000,
        heartbeatCount: 2,
        responseShapeSummary: null,
        structuredAdapterProfile: {
          artifactKind: "structured_adapter_provider_profile",
          profileRef: "structured-adapter-profile://local_semantic_extraction/test",
        },
        structuredAdapterDiagnostics: {
          artifactKind: "structured_adapter_provider_diagnostics",
          contentLength: 1234,
        },
        structuredAdapterOutcome: {
          artifactKind: "structured_adapter_outcome",
          status: "succeeded",
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      spanProgress: {
        state: "present",
        currentSpanId: "model-call-context-1",
        currentSpanKind: "model_call",
        currentPhase: "heartbeat",
        currentStatus: "heartbeat",
        currentModelRef: "deepseek/deepseek-v4-flash",
        currentObjective: "Find target files for the implementation.",
        currentInputRefs: ["mission-contract://commitment/code-edit"],
        currentEvidenceRefs: ["artifact://context/context-1"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      sourcePrompt: {
        promptHash: "prompt-hash-1",
        promptLength: 12345,
        resolutionStatus: "resolved",
        sectionRefs: ["source-prompt://prompt-hash-1/section-001/0-1000"],
        excerptRequestRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        excerptProvidedRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        excerptDeniedRefs: [],
      },
      contextScout: {
        qualityState: "accepted",
        verifiedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        handoffPacketRefs: ["runtime-job://job/context-handoff/context-1"],
        openBlockers: [],
      },
      evidenceProducedRefs: ["artifact://context/context-1"],
      evidenceClaimRefs: ["artifact://context/context-1"],
      genericNodeExecutionResultRefs: ["runtime-work-graph://node/context-1/generic-node-result"],
      evidenceClaims: [
        {
          evidenceClaimId: "evidence-claim:runtime-work-graph-1:context-1:context:1",
          commitmentId: "context",
          evidenceKind: "artifact",
          evidenceRef: "artifact://context/context-1",
          claimSummary: "Context scout produced a bounded handoff.",
          producedByNodeId: "context-1",
          producedByCapabilityId: "context_scout",
          producedByExecutorKey: "role:context_scout",
          validationRefs: [],
          changedFileRefs: [],
          limitations: [],
        },
      ],
      acceptedCommitmentIds: ["context"],
      rejectedCommitmentIds: [],
      openCommitmentIds: ["code-edit", "validation"],
      nextDecisionNeeded: "node_result",
      blockerSummary: "2 blocking commitments remain open.",
      latestToolEventKind: "worker.invoke",
      eli5Progress: "The context scout is finding the files the implementer should edit.",
      budget: {
        policyRef: "runtime-task-budget://agent_team.coding/context_scout/standard",
        budgetClass: "standard",
        runtimeToolTimeoutMs: 900_000,
        modelCallTimeoutMs: 900_000,
        workerLoopTurnTimeoutMs: 900_000,
        validationCommandTimeoutMs: 900_000,
        progressEmissionIntervalMs: 10_000,
        staleProgressAfterMs: 120_000,
        leaseTimeoutMs: 180_000,
        leaseHeartbeatMs: 60_000,
        elapsedMs: 1250,
        budgetRemainingMs: 898_750,
        heartbeatState: "worker_call_started",
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });
});

it("surfaces boundary replay checkpoints and plans in owner graph progress readback", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "boundary-replay-readback-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "boundary-replay-readback-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Replay from context." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Boundary replay readback",
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
        stage: "boundary_replay_checkpoint",
        currentPhase: "boundary_replay_context_scout",
        artifactRefs: [
          "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
          "runtime-work-graph://checkpoint/boundary-replay-checkpoint-1",
        ],
        reasonCodes: ["boundary_replay_checkpoint_recorded", "boundary:context_scout"],
        eli5Progress: "OpenClaw recorded a replay checkpoint for context_scout.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.boundary_replay_checkpoint",
      data: {
        checkpointRef:
          "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
        graphCheckpointRef: "runtime-work-graph://checkpoint/boundary-replay-checkpoint-1",
        checkpointKind: "context_scout",
        registryVersion: "execution-platform.boundary-replay-registry.v1",
        replayStartPolicy: "allowed_from_checkpoint",
        replaySafetyStatus: "safe_to_replay",
        replayFreshnessStatus: "fresh",
        replayContinuationMode: "continue_scheduler",
        reasonCodes: ["context_scout_boundary_checkpoint_recorded"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.boundary_replay_plan",
      data: {
        planRef:
          "runtime-job://boundary-replay-readback-job/boundary-replay-plan/graph/context_scout/plan-1",
        requestedStartBoundary: "context_scout",
        status: "accepted",
        registryVersion: "execution-platform.boundary-replay-registry.v1",
        diagnosticOnly: false,
        allowedNextTransitions: ["continue_scheduler", "repair_boundary"],
        terminalBlockerClasses: ["identity_mismatch", "stale_checkpoint"],
        readbackProjectionFields: ["boundaryKind", "checkpointRefs", "nextLegalTransition"],
        latestAcceptedCheckpointKind: "context_scout",
        missingCheckpointKinds: [],
        latestAcceptedCheckpointRef:
          "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
        exactContinuationMode: "continue_scheduler",
        exactContinuationAction:
          "Continue production scheduler from context_scout through GenericOrchestrationRuntime.",
        skippedUpstreamCheckpointKinds: [
          "router_payload",
          "mission_ledger",
          "commitment_packet_authoring",
          "commitment_packet_review",
          "context_scout",
        ],
        resumeFromArtifactRefs: ["runtime-job://boundary-replay-readback-job/context-scout"],
        invalidReasonCodes: [],
        acceptedCheckpointRefs: [
          "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
        ],
        staleCheckpointRefs: [],
        rejectedCheckpointRefs: [],
        reasonCodes: ["boundary_replay_plan_compiled"],
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

    expect(
      model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.boundaryReplay,
    ).toMatchObject({
      state: "present",
      latestCheckpointKind: "context_scout",
      currentReplayBoundary: "context_scout",
      checkpointRefs: [
        "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
      ],
      graphCheckpointRefs: ["runtime-work-graph://checkpoint/boundary-replay-checkpoint-1"],
      planRefs: [
        "runtime-job://boundary-replay-readback-job/boundary-replay-plan/graph/context_scout/plan-1",
      ],
      replayStartPolicy: "allowed_from_checkpoint",
      replaySafetyStatus: "safe_to_replay",
      replayFreshnessStatus: "fresh",
      replayContinuationMode: "continue_scheduler",
      exactContinuationMode: "continue_scheduler",
      exactContinuationAction:
        "Continue production scheduler from context_scout through GenericOrchestrationRuntime.",
      registryVersion: "execution-platform.boundary-replay-registry.v1",
      diagnosticOnly: false,
      allowedNextTransitions: ["continue_scheduler", "repair_boundary"],
      terminalBlockerClasses: ["identity_mismatch", "stale_checkpoint"],
      readbackProjectionFields: ["boundaryKind", "checkpointRefs", "nextLegalTransition"],
      latestAcceptedCheckpointRef:
        "runtime-job://boundary-replay-readback-job/boundary-replay/graph/context_scout/checkpoint-1",
      latestAcceptedCheckpointKind: "context_scout",
      missingCheckpointKinds: [],
      skippedUpstreamCheckpointKinds: [
        "router_payload",
        "mission_ledger",
        "commitment_packet_authoring",
        "commitment_packet_review",
        "context_scout",
      ],
      resumeFromArtifactRefs: ["runtime-job://boundary-replay-readback-job/context-scout"],
      invalidReasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });
});

it("projects boundary replay from compact latest-run-state when events are unavailable", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "boundary-replay-latest-state-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "boundary-replay-latest-state-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Replay after resources." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Boundary replay latest-run-state readback",
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.latest_run_state",
      storageKind: "metadata",
      uri: "runtime-job://boundary-replay-latest-state-job/latest-run-state/current",
      contentType: "application/json",
      metadata: {
        artifactKind: "execution_platform_latest_run_state",
        schemaVersion: "execution-platform.latest-run-state.v1",
        generatedAt: new Date().toISOString(),
        runtimeJobId: job.jobId,
        current: {
          phase: "boundary_replay_after_resource_materialization",
          graphId: "graph-latest",
        },
        boundaryReplay: {
          state: "present",
          latestCheckpointKind: "after_resource_materialization",
          currentReplayBoundary: "after_resource_materialization",
          nextReplayBoundary: "before_worker_invocation",
          checkpointRefs: [
            "runtime-job://boundary-replay-latest-state-job/boundary-replay/graph/after_resource_materialization/checkpoint-1",
          ],
          graphCheckpointRefs: ["runtime-work-graph://checkpoint/boundary-replay-after-resource"],
          planRefs: [
            "runtime-job://boundary-replay-latest-state-job/boundary-replay-plan/graph/after_resource_materialization/plan-1",
          ],
          replayStartPolicy: "allowed_from_checkpoint",
          replaySafetyStatus: "safe_to_replay",
          replayFreshnessStatus: "fresh",
          replayContinuationMode: "run_node",
          exactContinuationMode: "run_node",
          exactContinuationAction:
            "Resume production scheduler at after_resource_materialization and run the recorded ready node(s): implementation-node.",
          latestAcceptedCheckpointRef:
            "runtime-job://boundary-replay-latest-state-job/boundary-replay/graph/after_resource_materialization/checkpoint-1",
          resumeFromArtifactRefs: ["runtime-job://boundary-replay-latest-state-job/node-packet"],
          invalidReasonCodes: [],
          reasonCodes: ["boundary_replay_requested_checkpoint_accepted"],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      },
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });

    expect(
      model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.boundaryReplay,
    ).toMatchObject({
      state: "present",
      latestCheckpointKind: "after_resource_materialization",
      currentReplayBoundary: "after_resource_materialization",
      nextReplayBoundary: "before_worker_invocation",
      replayContinuationMode: "run_node",
      exactContinuationMode: "run_node",
      latestAcceptedCheckpointRef:
        "runtime-job://boundary-replay-latest-state-job/boundary-replay/graph/after_resource_materialization/checkpoint-1",
      resumeFromArtifactRefs: ["runtime-job://boundary-replay-latest-state-job/node-packet"],
    });
  });
});

it("uses terminal graph progress for open commitments instead of stale historical node state", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "terminal-graph-progress-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "terminal-graph-progress-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Close commitments." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Terminal graph progress readback",
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
        graphId: "terminal-runtime-graph",
        nodeId: "implementation-1",
        activeNodeKind: "implementation",
        roleId: "implementation_engineer",
        currentPhase: "node_started",
        remainingOpenCommitmentIds: ["implementation", "validation"],
        nextDecisionNeeded: "node_result",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    for (let index = 0; index < 55; index += 1) {
      await runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "runtime.heartbeat",
        data: {
          heartbeatIndex: index,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
    }
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "terminal-runtime-graph",
        currentPhase: "scheduler_terminal",
        validationState: "passed",
        remainingOpenCommitmentIds: [],
        nextDecisionNeeded: "none",
        finalizationState: "succeeded",
        schedulerPhase: "finalization_completed",
        schedulerToolId: "scheduler.create_closeout_request",
        schedulerToolInvocationRefs: ["runtime-tool://terminal-closeout"],
        eli5Progress: "The scheduler finished and all blocking commitments are closed.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "terminal-runtime-graph",
        nodeId: "implementation-1",
        activeNodeKind: "implementation",
        roleId: "implementation_engineer",
        currentPhase: "node_started",
        remainingOpenCommitmentIds: ["implementation", "validation"],
        nextDecisionNeeded: "node_result",
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
      graphId: "terminal-runtime-graph",
      currentPhase: "scheduler_terminal",
      validationState: "passed",
      openCommitmentIds: [],
      nextDecisionNeeded: "none",
      finalizationState: "succeeded",
      schedulerToolTrace: {
        schedulerPhase: "finalization_completed",
        latestToolId: "scheduler.create_closeout_request",
        invocationRefs: ["runtime-tool://terminal-closeout"],
      },
      eli5Progress: "The scheduler finished and all blocking commitments are closed.",
    });
  });
});

it("surfaces first-class validation worker progress and repair refs", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "validation-worker-readback-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "validation-worker-readback-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Validate edits." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Validation worker readback",
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
        graphId: "validation-readback-graph",
        nodeId: "validation-1",
        activeNodeKind: "validation",
        roleId: "test_engineer",
        currentPhase: "validation_command_needs_review",
        validationState: "needs_review",
        validationTaskPacketRefs: ["runtime-work-graph://validation-task-packet/packet"],
        validationPlanRefs: ["runtime-tool://validation/plan"],
        validationCommandRefs: ["validation-command://focused"],
        validationCommandSummaries: ["Run focused test files: example.test.ts."],
        currentValidationCommandRef: "validation-command://focused",
        currentValidationCommandSummary: "Run focused test files: example.test.ts.",
        currentValidationCommandStatus: "failed",
        validationResultRefs: ["runtime-job://job/validation/result"],
        validationFailureRefs: ["runtime-tool://validation/classify"],
        validationRepairPlanRefs: ["runtime-tool://validation/repair-plan"],
        validationRepairNodeRefs: ["runtime-work-graph://graph/node/repair"],
        validationRepairHandoffRefs: ["runtime-job://job/validation-repair-handoff/repair"],
        validationQaEvidencePacketRefs: ["runtime-job://job/validation-qa/validation-1"],
        validationQaToolInvocationRefs: [
          "runtime-tool://validation/plan",
          "runtime-tool://validation/run",
        ],
        validationBlockingCommitmentIds: ["commitment-1"],
        validationQaLatestSummary:
          "Validation failed; failure classification, commitment mapping, and same-job repair node refs were recorded.",
        eli5Progress:
          "OpenClaw ran the tests, found failures, and turned them into repair instructions.",
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

    expect(
      model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress.validationQa,
    ).toMatchObject({
      state: "needs_review",
      taskPacketRefs: ["runtime-work-graph://validation-task-packet/packet"],
      planRefs: ["runtime-tool://validation/plan"],
      commandRefs: ["validation-command://focused"],
      commandSummaries: ["Run focused test files: example.test.ts."],
      currentCommandRef: "validation-command://focused",
      currentCommandStatus: "failed",
      resultRefs: ["runtime-job://job/validation/result"],
      failureRefs: ["runtime-tool://validation/classify"],
      repairPlanRefs: ["runtime-tool://validation/repair-plan"],
      repairNodeRefs: ["runtime-work-graph://graph/node/repair"],
      repairHandoffRefs: ["runtime-job://job/validation-repair-handoff/repair"],
      evidencePacketRefs: ["runtime-job://job/validation-qa/validation-1"],
      blockingCommitmentIds: ["commitment-1"],
    });
  });
});

it("keeps active node detail visible when child sync events are newer", async () => {
  await withRuntime(async ({ runtimeJobs, workQueue }) => {
    const workItemId = "active-graph-child-sync-readback-work-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "active-graph-child-sync-readback-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding", objectiveSummary: "Improve planning." },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Active graph child sync readback",
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.mission_contract_ledger",
      storageKind: "metadata",
      uri: "runtime-job://active-graph-child-sync-readback-job/mission-contract/mission-1/1",
      contentType: "application/json",
      metadata: {
        artifactKind: "mission_contract_ledger",
        missionId: "mission-1",
        ledgerStatus: "active",
        missionGate: "clear_to_execute",
        ownerObjectiveSummary: "Improve Product/Spec Planning.",
        blockingCommitments: [
          {
            commitmentId: "planning-workflow",
            status: "pending",
            commitmentText: "Wire Product/Spec Planning as a production workflow.",
            whyItMatters: "Owners need planning work to execute through runtime truth.",
            expectedEvidenceDescription: "Source edits, focused validation, and readback proof.",
            acceptedEvidenceRefs: [],
            remainingWork: ["Implement workflow registration and readback."],
            blocking: true,
          },
        ],
        nonBlockingCommitments: [],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "child-sync-runtime-graph",
        schedulerToolId: "scheduler.draft_commitment_work_breakdown",
        currentPhase: "work_breakdown_compiled",
        commitmentWorkPacketSummaries: [
          {
            packetRef: "runtime-work-graph://commitment-work-packet/planning-workflow/abc123",
            commitmentId: "planning-workflow",
            acceptanceCriteriaCount: 3,
            expectedEvidenceKinds: ["mission_commitment_evidence"],
            likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "child-sync-runtime-graph",
        stage: "context_synthesis_node",
        status: "completed",
        roleId: "context_synthesis",
        nodeId: "context_synthesis_global_barrier",
        artifactRefs: ["runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted"],
        currentPhase: "context_synthesis_accepted",
        schedulerPhase: "context_synthesis_accepted",
        contextSynthesisRef:
          "runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted",
        contextSynthesisStatus: "accepted",
        contextSynthesisImplementationGroupCount: 16,
        contextSynthesisDependencyCount: 7,
        contextSynthesisParallelGroupCount: 4,
        contextSynthesisBlockerCount: 0,
        contextSynthesisValidationLaneCount: 3,
        contextSynthesisReviewLaneCount: 2,
        contextSynthesisWorkerFitSummary:
          "Use scoped workers for independent implementation groups and reserve Codex for integration repair.",
        contextSynthesisGraphCompileInputSummary:
          "Accepted synthesis produced 16 groups, 7 dependencies, and 3 validation lanes.",
        contextSynthesisImplementationGroupIds: ["group-a", "group-b"],
        contextSynthesisTargetRefs: ["extensions/execution-platform/src/workflows/"],
        contextSynthesisValidationLanes: ["workflow tests", "readback tests"],
        contextSynthesisReviewLanes: ["runtime workflow review"],
        contextSynthesisSemanticCodeIntelligenceRefs: ["code-intelligence://semantic/abc123"],
        contextSnapshotRefs: ["context-snapshot://synthesis/abc123"],
        eli5Progress:
          "OpenClaw accepted the context synthesis map and can now compile implementation nodes.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "child-sync-runtime-graph",
        nodeId: "context-1",
        activeNodeKind: "context_scout",
        roleId: "context_scout",
        modelRef: "moonshotai/kimi-k2.6",
        currentObjective: "Find workflow and readback surfaces for Product/Spec Planning.",
        whyThisNodeWasChosen: "Context is required before implementation child nodes.",
        targetRefs: ["extensions/execution-platform/src/workflows/"],
        currentPhase: "node_started",
        schedulerPhase: "execution_in_progress",
        codeIntelligenceToolId: "code.get_definition",
        codeIntelligenceRuntimeToolInvocationRefs: ["runtime-tool://code-definition-1"],
        codeIntelligenceResultRefs: ["code-intelligence://code.get_definition/abc123"],
        codeIntelligenceSymbolRefs: ["code-symbol://workflow.ts:10:buildWorkflow"],
        codeIntelligenceDiagnosticRefs: ["code-diagnostic://workflow.ts:12:ts2322"],
        codeIntelligenceRelatedTestRefs: ["repo-file://workflow.test.ts#abc123"],
        codeIntelligenceImpactRefs: ["repo-file://workflow.ts#abc123"],
        codeIntelligenceSemanticMode: "typescript_semantic",
        codeIntelligenceBackendId: "typescript_language_service",
        codeIntelligenceBackendState: "ready",
        codeIntelligenceBackendHealthRef:
          "code-intelligence-backend-health://typescript_language_service/abc123",
        codeIntelligenceWorkspaceSnapshotRef: "code-intelligence-workspace://abc123",
        codeIntelligenceSemanticConfidence: "high",
        codeIntelligenceFallbackUsed: false,
        codeIntelligenceFallbackReasonCodes: [],
        codeIntelligenceDiagnosticVersionRef: "code-intelligence-diagnostics://abc123",
        codeIntelligenceProjectConfigRefs: ["repo-config://tsconfig.json#abc123"],
        codeIntelligenceLimitations: [],
        codeIntelligenceBackendLatencyMs: 17,
        codeIntelligenceSymbolCount: 1,
        codeIntelligenceLocationCount: 1,
        codeIntelligenceDiagnosticCount: 1,
        codeIntelligenceImportEdgeCount: 0,
        codeIntelligenceRelatedTestCount: 1,
        codeIntelligenceCodeActionCount: 0,
        codeIntelligenceSummary: "Resolved TypeScript semantic definition.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "child-sync-runtime-graph",
        stage: "work_queue_child_sync",
        status: "completed",
        roleId: "context_scout",
        nodeId: "context-1",
        artifactRefs: ["work-queue://child-context-1"],
        reasonCodes: ["work_queue_child_created"],
        currentPhase: "work_queue_child_synced",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "child-sync-runtime-graph",
        stage: "scheduler_parallel_frontier",
        status: "started",
        schedulerToolId: "scheduler.select_next_node",
        currentPhase: "parallel_frontier_evaluated",
        parallelFrontier: {
          artifactKind: "runtime_work_graph_parallel_frontier_readback",
          schemaVersion: "execution-platform.runtime-work-graph.parallel-frontier.v1",
          currentSuperstep: 2,
          maxParallelNodeExecutions: 4,
          dependencyLayerCount: 3,
          readyNodeIds: ["implementation-a", "implementation-b"],
          rawRunnableNodeIds: ["implementation-a", "implementation-b"],
          selectedNodeIds: ["implementation-a", "implementation-b"],
          runningNodeIds: [],
          completedNodeIds: ["context-1"],
          blockedNodeIds: [],
          failedNodeIds: [],
          needsReviewNodeIds: [],
          waitingForHumanNodeIds: [],
          skippedReasonCodes: [],
          conflictDomains: [
            { nodeId: "implementation-a", keys: ["write:src/a.ts"] },
            { nodeId: "implementation-b", keys: ["write:src/b.ts"] },
          ],
          providerConcurrencyBudgets: [
            {
              key: "provider:profile:openrouter.qwen3-coder-next",
              limit: 2,
              runnableNodeIds: ["implementation-a", "implementation-b", "implementation-c"],
              selectedNodeIds: ["implementation-a", "implementation-b"],
              skippedNodeIds: ["implementation-c"],
            },
          ],
          branchResults: [
            {
              superstepId: "parallel-frontier-2-implementation-a-implementation-b",
              branchId:
                "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
              nodeId: "implementation-a",
              nodeKind: "implementation",
              capabilityId: "implementation_microtask",
              targetCommitmentIds: ["planning-workflow"],
              status: "needs_review",
              failureClass: "resource_materialization",
              errorPath: "nodeExecutionPacket.targetFileSnapshots",
              repairAction: "split_into_file_resolved_tasks",
              evidenceRefs: ["runtime-work-graph://implementation-context-packet/a"],
              readinessStateRef: "node-readiness://implementation-a",
              reasonCodes: ["implementation_context_resource_packet_bounds_exceeded"],
            },
          ],
          joinReadyNodeIds: [],
          contextSynthesisRefs: [
            "runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted",
          ],
          implementationGroupCount: 16,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        schedulerFrontierState: {
          artifactKind: "runtime_work_graph_scheduler_frontier_state",
          schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
          graphId: "child-sync-runtime-graph",
          currentSuperstep: 2,
          nodeCount: 4,
          edgeCount: 3,
          executableReadyNodeIds: ["implementation-a", "implementation-b"],
          selectedExecutableNodeIds: ["implementation-a", "implementation-b"],
          blockedFrontierNodeIds: ["implementation-c"],
          aggregateBlockedNodeIds: [],
          nonRunnableNodeIds: ["implementation-c"],
          dependencyBlockedNodeIds: [],
          contextBlockedNodeIds: [],
          resourceBlockedNodeIds: ["implementation-c"],
          validationBlockedNodeIds: [],
          reviewBlockedNodeIds: [],
          closeoutBlockedNodeIds: [],
          branchIds: ["frontier:2:branch:1:implementation-a"],
          readinessRefs: ["node-readiness://implementation-a"],
          resourceRefs: ["runtime-work-graph://implementation-context-packet/a"],
          contextRefs: ["runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted"],
          openCommitmentIds: ["planning-workflow"],
          lockConflictNodeIds: [],
          providerBudgetBlockedNodeIds: ["implementation-c"],
          nextLegalTransition: "execute_frontier",
          reasonCodes: ["scheduler_canonical_frontier_state_evaluated"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        noProgressSignature: {
          artifactKind: "runtime_work_graph_no_progress_signature",
          schemaVersion: "execution-platform.runtime-work-graph.no-progress-signature.v1",
          graphId: "child-sync-runtime-graph",
          iteration: 2,
          superstep: 2,
          nodeCount: 4,
          edgeCount: 3,
          executableFrontierNodeIds: [],
          blockedFrontierNodeIds: ["implementation-c"],
          blockerReasonCodes: ["node_resources_required_before_worker_execution"],
          openCommitmentIds: ["planning-workflow"],
          newEvidenceRefs: [],
          newReadinessRefs: [],
          newWorkQueueRefs: [],
          createdNodeIds: [],
          reusedNodeIds: ["implementation-c"],
          createdEdgeIds: [],
          reusedEdgeIds: [],
          selectedDecisionId: "reuse-implementation-c",
          selectedDecisionKind: "add_nodes",
          terminalBlockerCode: "graph_persistence_reused_only",
          signatureHash: "abc123-no-progress",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        noProgressRepeatCount: 2,
        missionLedgerEvaluationThrottle: {
          artifactKind: "runtime_work_graph_mission_ledger_evaluation_throttle",
          schemaVersion:
            "execution-platform.runtime-work-graph.mission-ledger-evaluation-throttle.v1",
          nodeId: "context-1",
          nodeKind: "context_scout",
          eventClass: "context",
          shouldEvaluate: false,
          evidenceClaimCount: 0,
          reasonCodes: ["mission_contract_evaluation_throttled_no_closure_claims"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.latest_run_state",
      storageKind: "metadata",
      uri: "runtime-job://child-sync-runtime-job/latest-run-state/current",
      contentType: "application/json",
      metadata: {
        artifactKind: "execution_platform_latest_run_state",
        schemaVersion: "execution-platform.latest-run-state.v1",
        generatedAt: "2026-05-20T00:00:00.000Z",
        runtimeJobId: job.jobId,
        workItemId,
        process: {
          isRunning: true,
          terminalStatus: null,
          adapterTerminalStatus: null,
          retryState: null,
        },
        runtimeJob: { state: "running" },
        current: {
          phase: "parallel_frontier_evaluated",
          graphId: "child-sync-runtime-graph",
          nodeId: "context-1",
        },
        activeFrontier: {
          state: "present",
          status: "needs_review",
          graphId: "child-sync-runtime-graph",
          currentSuperstep: 2,
          selectedNodeIds: ["implementation-a", "implementation-b"],
          runningNodeIds: [],
          completedNodeIds: ["context-1"],
          blockedNodeIds: ["implementation-c"],
          failedNodeIds: [],
          needsReviewNodeIds: [],
          waitingForHumanNodeIds: [],
          openCommitmentIds: ["planning-workflow"],
          nextTransition: "run_frontier",
          schedulerNextLegalTransition: "execute_frontier",
          noProgress: {
            state: "present",
            signatureHash: "abc123-no-progress",
            repeatCount: 2,
            terminalBlockerCode: "graph_persistence_reused_only",
            reasonCodes: ["node_resources_required_before_worker_execution"],
          },
          missionLedgerEvaluationThrottle: {
            state: "present",
            nodeId: "context-1",
            shouldEvaluate: false,
            reasonCodes: ["mission_contract_evaluation_throttled_no_closure_claims"],
          },
          counts: {
            selected: 2,
            running: 0,
            completed: 1,
            blocked: 1,
            failed: 0,
            needsReview: 0,
            waitingForHuman: 0,
            branchStates: 1,
            truncated: false,
          },
          branchStates: [
            {
              branchId:
                "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
              nodeId: "implementation-a",
              status: "needs_review",
              blockerSummary: "Resource packet exceeded bounds.",
              errorPath: "nodeExecutionPacket.targetFileSnapshots",
              readinessStateRef: "node-readiness://implementation-a",
              reasonCodes: ["implementation_context_resource_packet_bounds_exceeded"],
            },
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
      },
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });

    expect(
      model.runtimeJobs[0]?.ownerReadback.missionContract.blockingCommitments[0],
    ).toMatchObject({
      commitmentId: "planning-workflow",
      whyItMatters: "Owners need planning work to execute through runtime truth.",
      expectedEvidenceDescription: "Source edits, focused validation, and readback proof.",
    });
    expect(model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress).toMatchObject({
      activeNodeId: "context-1",
      activeNodeKind: "context_scout",
      roleId: "context_scout",
      modelRef: "moonshotai/kimi-k2.6",
      objective: "Find workflow and readback surfaces for Product/Spec Planning.",
      whySelected: "Context is required before implementation child nodes.",
      currentPhase: "parallel_frontier_evaluated",
      codeIntelligence: {
        state: "present",
        semanticMode: "typescript_semantic",
        backendId: "typescript_language_service",
        backendState: "ready",
        backendHealthRef: "code-intelligence-backend-health://typescript_language_service/abc123",
        workspaceSnapshotRef: "code-intelligence-workspace://abc123",
        semanticConfidence: "high",
        fallbackUsed: false,
        diagnosticVersionRef: "code-intelligence-diagnostics://abc123",
        projectConfigRefs: ["repo-config://tsconfig.json#abc123"],
        backendLatencyMs: 17,
        resultCounts: {
          symbols: 1,
          locations: 1,
          diagnostics: 1,
          importEdges: 0,
          relatedTests: 1,
          codeActions: 0,
        },
        activeToolId: "code.get_definition",
        resultRefs: ["code-intelligence://code.get_definition/abc123"],
        diagnosticRefs: ["code-diagnostic://workflow.ts:12:ts2322"],
        latestSummary: "Resolved TypeScript semantic definition.",
      },
      commitmentWorkPackets: [
        {
          packetRef: "runtime-work-graph://commitment-work-packet/planning-workflow/abc123",
          commitmentId: "planning-workflow",
          acceptanceCriteriaCount: 3,
          expectedEvidenceKinds: ["mission_commitment_evidence"],
          likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
        },
      ],
      contextSynthesis: {
        state: "accepted",
        synthesisRef: "runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted",
        status: "accepted",
        implementationGroupCount: 16,
        dependencyCount: 7,
        parallelGroupCount: 4,
        blockerCount: 0,
        validationLaneCount: 3,
        reviewLaneCount: 2,
        workerFitSummary:
          "Use scoped workers for independent implementation groups and reserve Codex for integration repair.",
        graphCompileInputSummary:
          "Accepted synthesis produced 16 groups, 7 dependencies, and 3 validation lanes.",
        implementationGroupIds: ["group-a", "group-b"],
        validationLanes: ["workflow tests", "readback tests"],
        reviewLanes: ["runtime workflow review"],
        semanticCodeIntelligenceRefs: ["code-intelligence://semantic/abc123"],
        nextDecision: "compile_post_synthesis_graph",
      },
      parallelFrontier: {
        state: "present",
        currentSuperstep: 2,
        maxParallelNodeExecutions: 4,
        dependencyLayerCount: 3,
        readyNodeIds: ["implementation-a", "implementation-b"],
        selectedNodeIds: ["implementation-a", "implementation-b"],
        completedNodeIds: ["context-1"],
        providerConcurrencyBudgets: [
          {
            key: "provider:profile:openrouter.qwen3-coder-next",
            limit: 2,
            runnableNodeIds: ["implementation-a", "implementation-b", "implementation-c"],
            selectedNodeIds: ["implementation-a", "implementation-b"],
            skippedNodeIds: ["implementation-c"],
          },
        ],
        branchResults: [
          {
            superstepId: "parallel-frontier-2-implementation-a-implementation-b",
            branchId:
              "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
            nodeId: "implementation-a",
            nodeKind: "implementation",
            capabilityId: "implementation_microtask",
            targetCommitmentIds: ["planning-workflow"],
            status: "needs_review",
            failureClass: "resource_materialization",
            errorPath: "nodeExecutionPacket.targetFileSnapshots",
            repairAction: "split_into_file_resolved_tasks",
            evidenceRefs: ["runtime-work-graph://implementation-context-packet/a"],
            readinessStateRef: "node-readiness://implementation-a",
            reasonCodes: ["implementation_context_resource_packet_bounds_exceeded"],
          },
        ],
        contextSynthesisRefs: [
          "runtime-work-graph://child-sync-runtime-graph/context-synthesis/accepted",
        ],
        implementationGroupCount: 16,
      },
      schedulerFrontier: {
        state: "present",
        currentSuperstep: 2,
        executableReadyNodeIds: ["implementation-a", "implementation-b"],
        selectedExecutableNodeIds: ["implementation-a", "implementation-b"],
        blockedFrontierNodeIds: ["implementation-c"],
        resourceBlockedNodeIds: ["implementation-c"],
        providerBudgetBlockedNodeIds: ["implementation-c"],
        nextLegalTransition: "execute_frontier",
      },
      latestRunState: {
        state: "present",
        artifactRef: "runtime-job://child-sync-runtime-job/latest-run-state/current",
        currentPhase: "parallel_frontier_evaluated",
        graphId: "child-sync-runtime-graph",
        activeFrontierStatus: "needs_review",
        selectedNodeIds: ["implementation-a", "implementation-b"],
        blockedNodeIds: ["implementation-c"],
        nextTransition: "run_frontier",
        schedulerNextLegalTransition: "execute_frontier",
        noProgressRepeatCount: 2,
        terminalBlockerCode: "graph_persistence_reused_only",
        missionLedgerThrottleShouldEvaluate: false,
        branchStates: [
          {
            nodeId: "implementation-a",
            status: "needs_review",
            errorPath: "nodeExecutionPacket.targetFileSnapshots",
            readinessStateRef: "node-readiness://implementation-a",
          },
        ],
        agreement: {
          state: "present",
          graphIdMatches: true,
          selectedNodeIdsMatch: true,
          blockedNodeIdsMatch: true,
          nextTransitionMatches: true,
          reasonCodes: [],
        },
      },
      noProgress: {
        state: "present",
        signatureHash: "abc123-no-progress",
        repeatCount: 2,
        selectedDecisionId: "reuse-implementation-c",
        terminalBlockerCode: "graph_persistence_reused_only",
        blockedFrontierNodeIds: ["implementation-c"],
        reusedNodeIds: ["implementation-c"],
      },
      missionLedgerEvaluationThrottle: {
        state: "present",
        nodeId: "context-1",
        eventClass: "context",
        shouldEvaluate: false,
        evidenceClaimCount: 0,
      },
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
        status: "succeeded",
        validationState: "passed",
        changedFileRefs: ["extensions/execution-platform/src/codex-bridge/proof.ts"],
        validationRefs: ["validation://closed-runtime-progress"],
        evidenceProducedRefs: ["runtime-tool://worker-evidence-handoff"],
        evidenceClaimRefs: ["evidence-claim://worker-edit-proof"],
        schedulerPhase: "execution_in_progress",
        schedulerToolId: "worker.evidence.handoff",
        schedulerToolInvocationRefs: ["runtime-tool://worker-evidence-handoff"],
        workerToolIds: ["worker.repo.search", "worker.evidence.handoff"],
        workerInternalToolStatus: "succeeded",
        workerInternalCompoundToolId: "coding.inspect_edit_validate",
        workerInternalCompoundSubEventCount: 6,
        workerInternalCompoundSubEventPhases: [
          "inspect",
          "plan",
          "apply_patch",
          "validate",
          "emit_evidence",
          "close",
        ],
        workerInternalInputPacketRefs: ["implementation-task-packet://closed-runtime-progress"],
        workerInternalContextRefs: [
          "context-handoff://closed-runtime-progress/context",
          "context-synthesis://closed-runtime-progress/synthesis",
          "code-intelligence://closed-runtime-progress/symbols",
        ],
        workerInternalContextSynthesisRefs: [
          "context-synthesis://closed-runtime-progress/synthesis",
        ],
        workerInternalCodeIntelligenceRefs: ["code-intelligence://closed-runtime-progress/symbols"],
        currentValidationCommandRef: "validation-command://closed-runtime-progress/focused",
        currentValidationCommandSummary: "Run focused worker validation.",
        currentValidationCommandStatus: "succeeded",
        editTransactionRefs: ["edit-transaction://closed-runtime-progress"],
        editTransactionPhase: "closed",
        editTransactionStatus: "closed",
        editTransactionRepairCount: 1,
        workerInternalOutputHash: "sha256:closed-runtime-worker-output",
        workerInternalOutputContentLength: 240,
        workerInternalProviderLatencyMs: 1234,
        workerInternalProviderTimeoutMs: 480000,
        workerInternalProviderFinishReason: "content",
        workerInternalProviderTokenCount: 512,
        nextDecisionNeeded: "review_worker_evidence",
        eli5Progress: "The non-Codex worker applied a scoped edit and handed off evidence.",
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
      workerInternal: {
        state: "present",
        phase: "worker_loop_completed",
        phaseStatus: "succeeded",
        objective: "Apply a scoped non-Codex file edit.",
        roleId: "implementation_engineer",
        modelRef: "moonshotai/kimi-k2.6",
        selectedToolId: "worker.evidence.handoff",
        toolStatus: "succeeded",
        compoundToolId: "coding.inspect_edit_validate",
        compoundSubEventCount: 6,
        compoundSubEventPhases: [
          "inspect",
          "plan",
          "apply_patch",
          "validate",
          "emit_evidence",
          "close",
        ],
        toolInvocationRefs: ["runtime-tool://worker-evidence-handoff"],
        inputPacketRefs: ["implementation-task-packet://closed-runtime-progress"],
        contextRefs: [
          "context-handoff://closed-runtime-progress/context",
          "context-synthesis://closed-runtime-progress/synthesis",
          "code-intelligence://closed-runtime-progress/symbols",
        ],
        contextSynthesisRefs: ["context-synthesis://closed-runtime-progress/synthesis"],
        codeIntelligenceRefs: ["code-intelligence://closed-runtime-progress/symbols"],
        currentValidationCommandRef: "validation-command://closed-runtime-progress/focused",
        currentValidationCommandSummary: "Run focused worker validation.",
        currentValidationCommandStatus: "succeeded",
        editTransactionRefs: ["edit-transaction://closed-runtime-progress"],
        editTransactionPhase: "closed",
        editTransactionStatus: "closed",
        editTransactionRepairCount: 1,
        changedFileRefs: ["extensions/execution-platform/src/codex-bridge/proof.ts"],
        validationRefs: ["validation://closed-runtime-progress"],
        evidenceRefs: ["runtime-tool://worker-evidence-handoff"],
        evidenceClaimRefs: ["evidence-claim://worker-edit-proof"],
        outputHash: "sha256:closed-runtime-worker-output",
        outputContentLength: 240,
        providerLatencyMs: 1234,
        providerTimeoutMs: 480000,
        providerFinishReason: "content",
        providerTokenCount: 512,
        nextDecision: "review_worker_evidence",
        eli5: "The non-Codex worker applied a scoped edit and handed off evidence.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      },
    });
  });
});
