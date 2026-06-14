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
import { startAcceptedNativeExecutionSessionForTest } from "../workflows/native-execution-test-fixtures.ts";
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
import { WorkQueueRepository } from "./work-queue-repository.ts";
import "../workflows/runtime-node-capability-registry.test.ts";

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
  it("projects native execution session tree truth from runtime events", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "native-session-tree-readback-item",
        itemType: "execution_workflow",
        title: "Native session tree readback",
      });
      const started = await startAcceptedNativeExecutionSessionForTest({
        runtimeJobs,
        request: {
          objective: "Execute native agentic orchestration.",
          refs: [{ ref: "work-queue://item/native-session-tree-readback-item" }],
          validationSignal: "session tree projects correctly",
        },
        runtime: {
          sessionId: "session-native-parent",
          agentProfile: "execution-orchestrator",
          workItemId: workItem.workItemId,
          idempotencyKey: "native-session-tree-readback",
        },
      });
      await workQueue.createWorkRun({
        runId: "native-session-tree-readback-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: started.runtimeJobId,
        runState: "running",
      });
      await runtimeJobs.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.child.started",
        data: {
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-native-parent",
          eventKind: "child_session_started",
          parentSessionId: "session-native-parent",
          childSessionId: "session-open-blocking",
          childRelation: "blocking",
          timestamp: "2026-06-12T00:00:01.000Z",
          summary: "Coding child started.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await runtimeJobs.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.child.started",
        data: {
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-native-parent",
          eventKind: "child_session_started",
          parentSessionId: "session-native-parent",
          childSessionId: "session-background",
          childRelation: "background",
          timestamp: "2026-06-12T00:00:02.000Z",
          summary: "Background review started.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await runtimeJobs.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.child.failed",
        data: {
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-native-parent",
          eventKind: "child_session_failed",
          parentSessionId: "session-native-parent",
          childSessionId: "session-failed-blocking",
          childRelation: "blocking",
          timestamp: "2026-06-12T00:00:03.000Z",
          blockerKind: "validation_failed",
          reason: "Validation child failed.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await runtimeJobs.recordEvent({
        jobId: started.runtimeJobId,
        eventType: "execution.finish.rejected",
        data: {
          runtimeJobId: started.runtimeJobId,
          sessionId: "session-native-parent",
          eventKind: "finish_recorded",
          parentSessionId: null,
          childSessionId: null,
          childRelation: null,
          timestamp: "2026-06-12T00:00:04.000Z",
          accepted: false,
          summary: "Finish rejected pending child repair.",
          correction: "Repair the failed child or finish blocked.",
          waitingForHumanQuestion: "Should the failed child be canceled?",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        runtimeJobs,
        workQueue,
        workItemId: workItem.workItemId,
      });
      const tree = model.runtimeJobs[0]?.nativeSessionTree;

      expect(tree).toMatchObject({
        state: "present",
        parentSessionId: "session-native-parent",
        activeSessionId: "session-native-parent",
        activeChildCount: 2,
        blockingChildCount: 2,
        backgroundChildCount: 1,
        failedChildCount: 1,
        completedChildCount: 0,
        openBlockingChildSessionIds: ["session-open-blocking"],
        failedBlockingChildSessionIds: ["session-failed-blocking"],
        backgroundChildSessionIds: ["session-background"],
        currentBlocker: "Repair the failed child or finish blocked.",
        waitingForHumanQuestion: "Should the failed child be canceled?",
        latestMeaningfulProgressSummary: "Finish rejected pending child repair.",
        finishEvidenceStatus: "rejected",
        rawPromptStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(summarizeWorkQueueExecutionForUi(model)).toMatchObject({
        nativeSessionTree: expect.objectContaining({
          finishEvidenceStatus: "rejected",
          openBlockingChildSessionIds: ["session-open-blocking"],
        }),
      });
    });
  });

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
        artifactType: "execution_platform.node_execution_snapshot",
        uri: "runtime-job://payload-manifest-readback-job/node-execution-snapshot/node-1",
        body: {
          snapshotKind: "node_execution_snapshot",
          content: "large worker body ".repeat(1_000),
          rawPromptStored: false,
          rawResponseStored: false,
        },
        boundedSummary: "Node execution snapshot manifest only.",
        targetCommitmentIds: ["c-001"],
        targetNodeIds: ["node-1"],
        resourcePacketKind: "node_execution_snapshot",
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
        artifactRefs: [
          "runtime-job://payload-manifest-readback-job/node-execution-snapshot/node-1",
        ],
        artifactTypes: ["execution_platform.node_execution_snapshot"],
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
          stage: "node_agent_session",
          status: "needs_review",
          nodeId: "impl-1",
          currentPhase: "node_agent_session_blocked",
          contextBrokerRequestRefs: [
            "runtime-job://context-broker-readback-job/context-broker/graph-1/impl-1/context-broker:abc",
          ],
          contextBrokerStatuses: ["context_specialist_required"],
          contextBrokerDedupeKeys: ["context-broker:abc"],
          contextBrokerConsumerNodeIds: ["impl-1"],
          contextBrokerReasonCodes: [
            "resource_broker_request_compiled",
            "resource_broker_context_specialist_required",
          ],
          contextBrokerNextTransition: "dispatch_context_specialist_subturn",
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
        statuses: ["context_specialist_required"],
        dedupeKeys: ["context-broker:abc"],
        consumerNodeIds: ["impl-1"],
        scoutRequiredCount: 1,
        nextTransition: "dispatch_context_specialist_subturn",
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
                nodeLifecycleProjectionRef: "node-lifecycle-projection://impl-a",
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
                status: "needs_review",
                failureClass: "node_worker_prompt_authoring_blocked",
                errorPath: "nodeAgentWorkerPrompt.sourceMaterial",
                errorSummary: "Node worker prompt source material missing.",
                blockerSummary: "Node worker prompt source material missing.",
                repairAction: "node.agent_session.invoke",
                nextTransition: "node.agent_session.invoke",
                evidenceRefs: [],
                nodeLifecycleProjectionRef: "node-lifecycle-projection://impl-b",
                reasonCodes: ["node_worker_prompt_missing_source_material"],
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
            status: "needs_review",
            blockerSummary: "Node worker prompt source material missing.",
            nextTransition: "node.agent_session.invoke",
            nodeLifecycleProjectionRef: "node-lifecycle-projection://impl-b",
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
          "kind:implementation": {} as never,
          "kind:validation": {} as never,
          "kind:test_review": {} as never,
          "kind:repair": {} as never,
          "kind:reviewer": {} as never,
          "kind:observability_readback": {} as never,
          "kind:human_task": {} as never,
          "kind:closeout": {} as never,
          "role:orchestrator": {} as never,
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
        runtimeToolTraceRefs: ["runtime-tool://runtime_graph.select_next_node/invocation-1"],
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
          "workflow_evidence_missing:worker_tool_trace",
        ]),
      );
      expect(readback.runtimeJobs[0]?.workflow.extension).toMatchObject({
        workflowEvidenceProfile: {
          accepted: false,
          missingEvidenceClasses: expect.arrayContaining(["worker_tool_trace"]),
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
        humanDecisionRefs: [],
        humanDecisionState: "not_required",
        taskSuccess: "satisfied",
        opportunitySeedCount: 1,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(runtime.ownerReadback.validationRefs).toEqual(
        expect.arrayContaining([
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/forced-repair-proof-8912274f7479",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-rerun-accepted",
          "runtime-job://owner-readable-coding-job/runtime-work-graph/validation/repair-loop-1",
        ]),
      );
      expect(runtime.ownerReadback.reasonCodes).toEqual(
        expect.arrayContaining(["model_authored_closeout_capsule_readback_ready"]),
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
          summary: "Node-local write gate needs target snapshot repair.",
          reasonCodes: ["action_gate_target_snapshot_missing"],
        },
        result: {
          status: "needs_review",
          artifactRefs: ["runtime-job://adapter-needs-review-job/action-gate/impl-1"],
          completedWorkEvidenceRefs: [],
          reasonCodes: ["action_gate_target_snapshot_missing"],
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
        reasonCodes: ["action_gate_target_snapshot_missing"],
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
        activeNodeKind: "implementation",
        roleId: "implementation_engineer",
        modelRef: "deepseek/deepseek-v4-flash",
        providerPath: "openrouter",
        currentObjective: "Find target files for the implementation.",
        whyThisNodeWasChosen: "Implementation needs bounded file refs before editing.",
        targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        inputHandoffRefs: ["mission-contract://commitment/code-edit"],
        expectedOutput: "Bounded context refs.",
        currentPhase: "node_started",
        validationState: "not_started",
        selectedCapabilityId: "implementation_microtask",
        selectedProviderCapabilityProfileId:
          "capability-profile://agent_team.coding/implementation_microtask.v1",
        workerRef: "agent.execution-coding.native-node-session",
        capabilityRoleClass: "implementation",
        capabilityCostClass: "cheap",
        capabilityLatencyClass: "medium",
        capabilityContextCapacity: "medium",
        providerProfileProductionSelectable: true,
        providerProfileRequiresQualification: false,
        selectedModelQualificationProfileId: null,
        qualificationEvidenceRefs: [],
        capabilityUtilityRationale:
          "The scoped implementation lane is ready after native source grounding.",
        capabilityCostRationale: "Use a cheap implementation lane before expensive implementation.",
        consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
        consideredProviderCapabilityProfileIds: [
          "capability-profile://agent_team.coding/implementation_microtask.v1",
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
            claimSummary: "Implementation produced bounded evidence.",
            producedByNodeId: "context-1",
            producedByCapabilityId: "implementation_microtask",
            producedByExecutorKey: "kind:implementation",
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
        sourcePromptBodyRef: "source-prompt://prompt-hash-1/body",
        sourcePromptExcerptRequestRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        sourcePromptExcerptProvidedRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        sourcePromptExcerptDeniedRefs: [],
        nodeAgentSessionTraceRef: "runtime-job://job/node-agent-trace/context-1",
        nodeAgentTraceEventRefs: {
          scoutSpawnRef: "runtime-job://job/session-event/scout-spawn-1",
          childSessionKeyRef: "agent:execution-context-scout:node:context-1",
          childResultRef: "runtime-job://job/subagent-result/context-1",
          parentSynthesisRef: "runtime-job://job/session-event/parent-synthesis-1",
        },
        nodeAgentTraceObservations: {
          contextScoutSpawnObserved: true,
          sessionsYieldObserved: true,
          childResultObserved: true,
          parentSynthesisObserved: true,
        },
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
          currentAction: "context scout model call is running.",
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
      activeNodeKind: "implementation",
      roleId: "implementation_engineer",
      modelRef: "deepseek/deepseek-v4-flash",
      objective: "Find target files for the implementation.",
      whySelected: "Implementation needs bounded file refs before editing.",
      targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      inputHandoffRefs: ["mission-contract://commitment/code-edit"],
      expectedOutput: "Bounded context refs.",
      currentPhase: "node_started",
      validationState: "not_started",
      costAwareDecision: {
        selectedCapabilityId: "implementation_microtask",
        selectedProviderCapabilityProfileId:
          "capability-profile://agent_team.coding/implementation_microtask.v1",
        workerRef: "agent.execution-coding.native-node-session",
        roleClass: "implementation",
        costClass: "cheap",
        latencyClass: "medium",
        contextCapacity: "medium",
        productionSelectable: true,
        productionSelectionRequiresQualification: false,
        selectedModelQualificationProfileId: null,
        qualificationEvidenceRefs: [],
        utilityRationale: "The scoped implementation lane is ready after native source grounding.",
        costRationale: "Use a cheap implementation lane before expensive implementation.",
        whyCheaperOptionsWereInsufficient: null,
        consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
        consideredProviderCapabilityProfileIds: [
          "capability-profile://agent_team.coding/implementation_microtask.v1",
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
        roleId: "implementation_engineer",
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
        sourcePromptBodyRef: "source-prompt://prompt-hash-1/body",
        excerptRequestRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        excerptProvidedRefs: ["runtime-job://job/source-prompt/excerpt/request-1"],
        excerptDeniedRefs: [],
      },
      contextScout: {
        qualityState: "native_subagent_spawn_observed",
        verifiedFileRefs: [],
        scoutSpawnRef: "runtime-job://job/session-event/scout-spawn-1",
        childSessionKeyRef: "agent:execution-context-scout:node:context-1",
        childResultRef: "runtime-job://job/subagent-result/context-1",
        parentSynthesisRef: "runtime-job://job/session-event/parent-synthesis-1",
        sessionsYieldObserved: true,
        childResultObserved: true,
        parentSynthesisObserved: true,
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
          claimSummary: "Implementation produced bounded evidence.",
          producedByNodeId: "context-1",
          producedByCapabilityId: "implementation_microtask",
          producedByExecutorKey: "kind:implementation",
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
    await runtimeJobs.attachRuntimeArtifactByContract({
      jobId: job.jobId,
      artifactType: "execution_platform.mission_contract_ledger",
      uri: "runtime-job://active-graph-child-sync-readback-job/mission-contract/mission-1/1",
      contentType: "application/json",
      body: {
        artifactKind: "mission_contract_ledger",
        missionId: "mission-1",
        ledgerStatus: "active",
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
      boundedSummary: "Active graph child sync Mission Ledger fixture.",
      targetCommitmentIds: ["planning-workflow"],
      resourcePacketKind: "mission_contract_ledger",
      readinessStatus: "accepted",
      reasonCodes: ["mission_contract_ledger_fixture_attached_by_contract"],
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
            packetRef: "runtime-work-graph://source-contract/planning-workflow/abc123",
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
        schedulerToolId: "runtime_graph.select_next_node",
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
              failureClass: "node_worker_prompt_authoring_blocked",
              errorPath: "nodeAgentWorkerPrompt.sourceMaterial",
              repairAction: "split_into_file_resolved_tasks",
              evidenceRefs: ["runtime-job://node-execution-snapshot/a"],
              nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-a",
              reasonCodes: ["node_worker_prompt_missing_source_material"],
            },
          ],
          branchScopedFrontierStates: [
            {
              branchId:
                "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
              nodeId: "implementation-a",
              nodeKind: "implementation",
              sourceRequirementRef: "requirement://planning-workflow/implementation-a",
              contractRef: "node-contract://implementation-a",
              readinessRef: "node-lifecycle-projection://implementation-a",
              sourceMaterialRequirementRefs: ["source-material-requirement://implementation-a"],
              sourceMaterialPacketRef: "runtime-job://node-execution-snapshot/a",
              nodeExecutionSnapshotRef: "runtime-job://node-execution-snapshot/a",
              status: "needs_review",
              blocker: {
                code: "node_worker_prompt_missing_source_material",
                summary: "Node worker prompt source material missing.",
                schemaPath: "nodeAgentWorkerPrompt.sourceMaterial",
                policyPath: null,
                reasonCodes: ["node_agent_context_snapshot_missing"],
              },
              blockerSignature:
                "node_worker_prompt_authoring_blocked:implementation:node_worker_prompt_missing_source_material",
              consumerRefs: ["validation-a"],
              dependentConsumers: ["validation-a"],
              siblingBranchIds: [
                "parallel-frontier-2-implementation-a-implementation-b:branch:2:implementation-b",
              ],
              successfulEvidenceRefs: ["runtime-job://node-execution-snapshot/b"],
              failedEvidenceRefs: ["runtime-job://node-execution-snapshot/a"],
              repairNodeRefs: ["runtime-work-graph://node/repair-implementation-a"],
              diagnosticOnlyNodeRefs: ["runtime-work-graph://node/diag-implementation-a"],
              nextLegalTransitions: ["node.agent_session.invoke"],
              capabilityId: "implementation_microtask",
              executorKey: "kind:implementation",
              phase: "node_agent_session_ready",
              currentToolId: "node.agent_session.invoke",
              rootCauseRef:
                "runtime-work-graph://frontier-root-cause/child-sync-runtime-graph/abc123-no-progress/repeat/2",
              rootCauseSystemic: true,
            },
          ],
          joinReadyNodeIds: [],
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
          readinessRefs: ["node-lifecycle-projection://implementation-a"],
          resourceRefs: ["runtime-job://node-execution-snapshot/a"],
          contextRefs: [
            "runtime-job://child-sync-runtime-job/node-resource-ledger/implementation-a/manifest",
          ],
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
          blockerReasonCodes: ["node_agent_session_snapshot_missing"],
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
        frontierRootCauseArtifact: {
          artifactKind: "runtime_work_graph_frontier_root_cause",
          schemaVersion: "execution-platform.runtime-work-graph.frontier-root-cause.v1",
          graphId: "child-sync-runtime-graph",
          iteration: 2,
          superstep: 2,
          signatureHash: "abc123-no-progress",
          repeatCount: 2,
          systemic: true,
          stage: "graph_persistence_reused_only",
          affectedNodeIds: ["implementation-c"],
          affectedBranchIds: ["frontier:2:branch:1:implementation-c"],
          unaffectedSiblingBranchIds: [
            "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
          ],
          successfulSiblingEvidenceRefs: ["runtime-job://node-execution-snapshot/a"],
          firstOccurrenceRef:
            "runtime-work-graph://frontier-root-cause/child-sync-runtime-graph/abc123-no-progress/first",
          lastOccurrenceRef:
            "runtime-work-graph://frontier-root-cause/child-sync-runtime-graph/abc123-no-progress/repeat/2",
          missingFields: ["nodeExecutionSnapshotRef"],
          reasonCodes: ["node_agent_session_snapshot_missing"],
          schemaErrorPaths: ["nodeExecutionSnapshot.contextRefs"],
          policyErrorPaths: [],
          contractRefs: ["node-contract://implementation-c"],
          contractVersions: ["execution-platform.node-execution-contract.v1"],
          sourceMaterialPacketKinds: ["node_execution_source_material"],
          sourceMaterialPacketRefs: [],
          providerProfileIds: [],
          attemptedTransitions: ["node.agent_session.invoke"],
          recommendedRepairBoundary: "node_agent_session_resume",
          nextLegalTransitions: ["node.agent_session.invoke"],
          noProgressSignature: {
            signatureHash: "abc123-no-progress",
          },
          branchDiagnostics: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
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
            reasonCodes: ["node_agent_session_snapshot_missing"],
          },
          rootCause: {
            state: "present",
            signatureHash: "abc123-no-progress",
            repeatCount: 2,
            systemic: true,
            recommendedRepairBoundary: "node_agent_session_resume",
            affectedNodeIds: ["implementation-c"],
            affectedBranchIds: ["frontier:2:branch:1:implementation-c"],
            successfulSiblingEvidenceRefs: ["runtime-job://node-execution-snapshot/a"],
            missingFields: ["nodeExecutionSnapshotRef"],
            schemaErrorPaths: ["nodeExecutionSnapshot.contextRefs"],
            policyErrorPaths: [],
            contractRefs: ["node-contract://implementation-c"],
            sourceMaterialPacketKinds: ["node_execution_source_material"],
            providerProfileIds: [],
            nextLegalTransitions: ["node.agent_session.invoke"],
            reasonCodes: ["node_agent_session_snapshot_missing"],
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
              errorPath: "nodeExecutionSnapshot.contextRefs",
              nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-a",
              reasonCodes: ["node_agent_context_snapshot_missing"],
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
            failureClass: "node_worker_prompt_authoring_blocked",
            errorPath: "nodeAgentWorkerPrompt.sourceMaterial",
            repairAction: "split_into_file_resolved_tasks",
            evidenceRefs: ["runtime-job://node-execution-snapshot/a"],
            nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-a",
            reasonCodes: ["node_worker_prompt_missing_source_material"],
          },
        ],
        branchScopedFrontierStates: [
          {
            branchId:
              "parallel-frontier-2-implementation-a-implementation-b:branch:1:implementation-a",
            nodeId: "implementation-a",
            contractRef: "node-contract://implementation-a",
            readinessRef: "node-lifecycle-projection://implementation-a",
            sourceMaterialRequirementRefs: ["source-material-requirement://implementation-a"],
            dependentConsumers: ["validation-a"],
            blockerCode: "node_worker_prompt_missing_source_material",
            blockerSchemaPath: "nodeAgentWorkerPrompt.sourceMaterial",
            successfulEvidenceRefs: ["runtime-job://node-execution-snapshot/b"],
            failedEvidenceRefs: ["runtime-job://node-execution-snapshot/a"],
            repairNodeRefs: ["runtime-work-graph://node/repair-implementation-a"],
            diagnosticOnlyNodeRefs: ["runtime-work-graph://node/diag-implementation-a"],
            nextLegalTransitions: ["node.agent_session.invoke"],
            rootCauseSystemic: true,
          },
        ],
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
        rootCauseRecommendedRepairBoundary: "node_agent_session_resume",
        missionLedgerThrottleShouldEvaluate: false,
        branchStates: [
          {
            nodeId: "implementation-a",
            status: "needs_review",
            errorPath: "nodeExecutionSnapshot.contextRefs",
            nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-a",
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
      rootCause: {
        state: "present",
        signatureHash: "abc123-no-progress",
        recommendedRepairBoundary: "node_agent_session_resume",
        affectedNodeIds: ["implementation-c"],
        missingFields: ["nodeExecutionSnapshotRef"],
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
          "resource-handoff://closed-runtime-progress/context",
          "node-resource-ledger://closed-runtime-progress/manifest",
          "code-intelligence://closed-runtime-progress/symbols",
        ],
        workerInternalContextSynthesisRefs: [],
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
          "resource-handoff://closed-runtime-progress/context",
          "node-resource-ledger://closed-runtime-progress/manifest",
          "code-intelligence://closed-runtime-progress/symbols",
        ],
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
