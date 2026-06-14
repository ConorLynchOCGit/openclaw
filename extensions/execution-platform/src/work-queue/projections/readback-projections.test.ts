import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  type RuntimeJobArtifact,
  type RuntimeJobEvent,
} from "../../runtime-job-repository.ts";
import { activeGraphProgressReadback } from "./active-graph-progress.ts";
import { runtimeArtifactPayloadManifestSummary } from "./runtime-artifact-manifest.ts";

const event = (
  eventType: string,
  data: RuntimeJobEvent["data"],
  eventId = `${eventType}-1`,
): RuntimeJobEvent => ({
  eventId,
  jobId: "job-projection",
  eventType,
  eventTime: new Date("2026-05-24T00:00:00.000Z"),
  workerId: null,
  leaseId: null,
  data,
});

const artifact = (
  artifactType: string,
  metadata: RuntimeJobArtifact["metadata"],
  uri = `runtime-job://job-projection/${artifactType}`,
  storageKind = "metadata",
): RuntimeJobArtifact => ({
  artifactId: `${artifactType}-artifact`,
  jobId: "job-projection",
  artifactType,
  storageKind,
  uri,
  contentType: "application/json",
  sizeBytes: 123,
  sha256: "sha256:test",
  metadata,
  createdAt: new Date("2026-05-24T00:00:00.000Z"),
});

describe("Work Queue readback projection modules", () => {
  it("projects active graph progress from compact refs without raw provider bodies", () => {
    const projection = activeGraphProgressReadback(
      [
        event(
          "agent_team.scheduler_progress",
          {
            graphId: "graph-1",
            nodeId: "node-1",
            activeNodeKind: "implementation_scoped",
            workIntentId: "work-intent-1",
            workIntentTitle: "Patch bounded implementation target",
            executionIntent: "source_edit",
            evidenceMode: ["changed_file_evidence", "validation_evidence"],
            roleId: "implementation",
            modelRef: "qwen/qwen3-coder-next",
            currentObjective: "Apply a scoped patch.",
            currentPhase: "worker.patch",
            blockerSummary: "target snapshot missing",
            schedulerToolId: "node.agent_session.invoke",
            nodeExecutionSnapshotRef: "runtime-job://job-projection/node-execution-snapshot/node-1",
            nodeRunId: "nrun_projection_1",
            nodeAgentId: "execution-coding",
            nodeAgentSessionKey: "agent:execution-coding:node:nrun_projection_1",
            nodeAgentStartReceiptRef:
              "runtime-job://job-projection/node-agent-start-receipt/node-1",
            nodeAgentStartStatus: "blocked",
            nodeAgentStartBlockerKind: "session_lock",
            nodeAgentStartLockAcquisitionOutcome: "active_lock_owner_live",
            nodeFinishArtifactRef: "runtime-job://job-projection/node-finish/node-1",
            nodeFinishStatus: "blocked",
            nodeFinishBlockerKind: "target_snapshot_missing",
            selectedCapabilityId: "implementation.qwen.scoped_patch",
            executorKey: "kind:implementation",
            workerRef: "worker://qwen/implementation",
            nodeReadinessStatus: "blocked",
            nodeReadinessStateRef: "runtime-job://job-projection/readiness/node-1",
            nodeReadinessPhase: "node_agent_session_ready",
            nodeReadinessNextAllowedTransitions: ["compile_node_execution_packet"],
            schedulerToolInvocationRefs: ["runtime-tool://tool-1"],
            workerInternalInputPacketRefs: ["node-execution-packet://node-1"],
            workerInternalToolStatus: "running",
            workerInternalOutputHash: "sha256:worker-output",
            workerInternalProviderLatencyMs: 2500,
            workerInternalProviderUsage: { inputTokens: 10, outputTokens: 20 },
            modelCallSpanId: "span-1",
            modelCallPhase: "implementation_patch",
            modelCallSpanElapsedMs: 2500,
            modelProviderDiagnostics: {
              usage: { inputTokens: 10, outputTokens: 20 },
              responseBody: "must-not-be-special-cased-or-exposed",
            },
            schedulerModelCallEnvelope: {
              artifactKind: "runtime_work_graph_scheduler_model_call_envelope",
              envelopeRef: "runtime-work-graph://scheduler-model-call-envelope/graph-1%3Ascheduler",
              envelopeId: "graph-1:scheduler",
              phase: "heartbeat",
              decisionSlot: "scheduler.select_next_action",
              schedulerPhase: "scheduler_decision_model_call",
              modelRef: "openai-codex/gpt-5.5",
              providerPath: "codex_app_server",
              providerProfileId: "codex_app_server",
              modelTaskClass: "global_reasoning",
              modelPolicyRef: "model-task-policy://global_reasoning/default",
              contractBoundaryId: "scheduler_global_reasoning",
              modelPolicyBindingRef: "model-contract-boundary://scheduler_global_reasoning",
              reasoningMode: "high",
              parserMode: "json_object",
              allowedToolFamily: "scheduler.orchestrator_decision",
              allowedOutputContractId: "runtime_work_graph_orchestrator_plan",
              allowedOutputContractVersion: "v1",
              proofCleanlinessState: "clean",
              proofCleanlinessReasonCodes: ["model_policy_proof_clean"],
              policyMismatchFields: [
                {
                  fieldPath: "timeoutMs",
                  reasonCode: "model_policy_timeout_exceeds_bound",
                },
              ],
              inputByteCount: 32_000,
              outputByteCount: 0,
              graphNodeCount: 3,
              graphEdgeCount: 2,
              commitmentCount: 14,
              sourceRequirementCount: 3,
              activeFrontierCounts: {
                ready: 1,
                blocked: 1,
                running: 0,
              },
              elapsedMs: 180_000,
              timeoutMs: 900_000,
              heartbeatCount: 18,
              heartbeatAgeMs: 10_000,
              finishReason: null,
              nativeFinishReason: null,
              providerResponseShape: {
                choicesLength: null,
                contentLengths: [],
              },
              acceptedToolCallSummary: null,
              rejectedToolCallSummary: null,
              schemaErrorPath: null,
              policyErrorPath: null,
              repairFieldHints: [],
              missingFields: [],
              reasonCodes: ["scheduler_orchestrator_model_call"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
              rawCommandLogStored: false,
              rawDbRowsStored: false,
              secretsStored: false,
            },
            parallelFrontier: {
              selectedNodeIds: ["node-1"],
              branchResults: [
                {
                  branchId: "branch-1",
                  nodeId: "node-1",
                  status: "blocked_resource",
                  errorPath: "nodeReadinessState.snapshotStatus",
                  blockerSummary: "target snapshot missing",
                  readinessStateRef: "runtime-job://job-projection/readiness/node-1",
                },
              ],
              branchScopedFrontierStates: [
                {
                  branchId: "branch-1",
                  nodeId: "node-1",
                  nodeKind: "implementation_scoped",
                  sourceRequirementRef: "requirement://node-1",
                  contractRef: "runtime-job://job-projection/contract/node-1",
                  readinessRef: "runtime-job://job-projection/readiness/node-1",
                  sourceMaterialRequirementRefs: ["source-material-requirement://node-1"],
                  status: "blocked",
                  blocker: {
                    code: "resources_required",
                    summary: "target snapshot missing",
                    schemaPath: "nodeReadinessState.snapshotStatus",
                    policyPath: null,
                    reasonCodes: ["target_snapshot_missing"],
                  },
                  blockerSignature: "branch-1:resources_required:target_snapshot_missing",
                  consumerRefs: ["validation-node-1"],
                  dependentConsumers: ["validation-node-1"],
                  successfulEvidenceRefs: ["runtime-job://job-projection/evidence/sibling-ok"],
                  failedEvidenceRefs: ["runtime-job://job-projection/evidence/node-1-blocked"],
                  repairNodeRefs: ["runtime-work-graph://node/context-repair-node-1"],
                  diagnosticOnlyNodeRefs: ["runtime-work-graph://node/diagnostic-node-1"],
                  nextLegalTransitions: ["compile_node_execution_packet"],
                  capabilityId: "implementation.qwen.scoped_patch",
                  executorKey: "kind:implementation",
                  modelRef: "qwen/qwen3-coder-next",
                  workerRef: "worker://qwen/implementation",
                  phase: "node_agent_session_ready",
                  nodeLifecycleProjectionGate: "node_agent_session_ready",
                  currentToolId: "node.compile_execution_packet",
                },
              ],
            },
            reasonCodes: ["target_snapshot_missing"],
          },
          "scheduler-progress-1",
        ),
        event(
          "execution.boundary_replay_plan",
          {
            planRef:
              "runtime-job://job-projection/boundary-replay-plan/before_worker_invocation/plan-1",
            exactContinuationAction: "Resume from before_worker_invocation.",
            registryVersion: "boundary-replay.v1",
          },
          "boundary-plan-1",
        ),
        event(
          "execution.boundary_replay_checkpoint",
          {
            checkpointKind: "before_worker_invocation",
            checkpointRef:
              "runtime-job://job-projection/boundary-replay/before_worker_invocation/checkpoint-1",
            graphCheckpointRef: "runtime-work-graph://checkpoint/before_worker_invocation/1",
          },
          "boundary-checkpoint-1",
        ),
      ],
      [
        artifact("execution_platform.latest_run_state", {
          generatedAt: "2026-05-24T00:00:00.000Z",
          runtimeJob: { state: "running" },
          activeFrontier: {
            graphId: "graph-1",
            selectedNodeIds: ["node-1"],
            blockedNodeIds: ["node-1"],
            nextTransition: "start_node_agent_session",
            branchStates: [
              {
                branchId: "branch-1",
                nodeId: "node-1",
                status: "blocked_resource",
                blockerSummary: "target snapshot missing",
                errorPath: "nodeReadinessState.snapshotStatus",
                readinessStateRef: "runtime-job://job-projection/readiness/node-1",
                nodeLifecycleProjectionGate: "node_agent_session_ready",
                reasonCodes: ["target_snapshot_missing"],
              },
            ],
          },
          canonicalReadbackGate: {
            artifactKind: "execution_platform.canonical_readback_gate",
            schemaVersion: "execution-platform.canonical-readback-gate.v1",
            state: "present",
            gateKind: "node_agent_session_ready",
            gateStatus: "blocked",
            sourceKind: "branch_scoped_frontier",
            branchId: "branch-1",
            nodeId: "node-1",
            contractRef: "runtime-job://job-projection/contract/node-1",
            schemaPath: "nodeReadinessState.snapshotStatus",
            nextLegalTransition: "compile_node_execution_packet",
            reasonCodes: ["target_snapshot_missing"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawDbRowsStored: false,
          },
        }),
        artifact(
          "execution_platform.node_agent_start_receipt",
          {
            nodeRunId: "nrun_projection_1",
            nodeAgentId: "execution-coding",
            nodeAgentSessionKey: "agent:execution-coding:node:nrun_projection_1",
            nodeAgentStartStatus: "blocked",
            nodeAgentStartBlockerKind: "session_lock",
            nodeAgentStartConfigFingerprint: "sha256:openclaw-config",
            nodeAgentStartConfigEpoch: "2026-05-24T00:00:00.000Z",
            nodeAgentStartProjectRoot: "/root/services/openclaw-roles/live",
            nodeAgentStartExecutionPlatformDocsRoot:
              "/root/services/openclaw-roles/live/docs/projects/execution-platform",
            nodeAgentStartRuntimeHome: "/root/.openclaw",
            nodeAgentStartRuntimeAliases: [
              {
                aliasPath: "/home/node/.openclaw",
                canonicalPath: "/root/.openclaw",
                label: "container-runtime-home-alias",
              },
            ],
            nodeAgentStartSourceRuntimeManifestRef:
              "repo://docs/system/registries/source-runtime-unification.yaml",
            nodeAgentStartLockAcquisitionOutcome: "active_lock_owner_live",
            nodeAgentStartBlockedTools: [
              {
                agentId: "execution-context-scout",
                toolName: "grep",
                blockedBy: ["global_profile"],
                effectiveProfileSource: "agent",
                localPolicyExplicit: true,
              },
            ],
            artifactPolicyRef: "artifact-policy://execution-platform/native-node-start-receipt-v1",
            rawStoragePolicyRef: "raw-storage-policy://execution-platform/no-raw-agent-material-v1",
            boundedRefsOnly: true,
          },
          "runtime-job://job-projection/node-agent-start-receipt/node-1",
        ),
        artifact(
          "execution_platform.node_agent_session_trace",
          {
            nodeRunId: "nrun_projection_1",
            nodeAgentId: "execution-coding",
            nodeAgentSessionKey: "agent:execution-coding:node:nrun_projection_1",
            nodeExecutionSnapshotRef: "runtime-job://job-projection/node-execution-snapshot/node-1",
            nodeWorkerPromptRef: "node-agent-worker-prompt://nrun_projection_1",
            nodeWorkerPromptArtifactRef: "runtime-job://job-projection/node-worker-prompt/node-1",
            nodeWorkerPromptHash: "sha256:node-worker-prompt-prompt",
            nodeWorkerPromptAuthorModelRunRef: "model-run://node-worker-prompt-author/1",
            nodeFinishArtifactRef: "runtime-job://job-projection/node-finish/node-1",
            nodeAgentSessionStatus: "waiting_on_subagent",
            nodeAgentSessionStopReason: "end_turn",
            nodeExecutionWaitingOnSubagent: true,
            nodeAgentObservedToolNames: ["update_plan", "task", "edit", "node_finish"],
            nodeAgentToolCallCount: 6,
            nodeAgentTraceMissingOptics: [],
            nodeAgentTraceEventRefs: {
              sessionLaunchRef:
                "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1",
              sessionLaunchEventRef:
                "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1/session_launch_1",
              workerPromptAuthoredRef: "runtime-job://job-projection/node-worker-prompt/node-1",
              workerPromptHashRef:
                "node-agent-worker-prompt-hash://sha256:node-worker-prompt-prompt",
              parentSessionKeyRef: "agent:execution-coding:node:nrun_projection_1",
              firstPlanUpdateRef:
                "agent:execution-coding:node:nrun_projection_1#tool/update_plan/first",
              scoutSpawnRef: "agent:execution-coding:node:nrun_projection_1#tool/task/first",
              childSessionKeyRef: "agent:execution-context-scout:node:nrun_projection_1/context",
              childResultRef: "runtime-job://job-projection/subagent-result/context-scout-1",
              parentSynthesisRef: "runtime-job://job-projection/session-event/parent-synthesis-1",
              firstEditRef: "agent:execution-coding:node:nrun_projection_1#tool/edit/first",
              validationActionRef:
                "agent:execution-coding:node:nrun_projection_1#tool/validation/first",
              validationScoutResultRef:
                "runtime-job://job-projection/subagent-result/validation-scout-1",
              repairLoopEvidenceRef: "runtime-job://job-projection/session-event/repair-loop-1",
              terminalNodeFinishRef: "runtime-job://job-projection/node-finish/node-1",
              waitingOnSubagentStateRef:
                "agent:execution-coding:node:nrun_projection_1#state/waiting_on_subagent",
            },
            nodeAgentSessionLaunch: {
              ref: "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1",
              eventRef:
                "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1/session_launch_1",
              admissionStatus: "accepted",
              blockerKind: null,
              persisted: true,
              provider: "openrouter",
              model: "moonshotai/kimi-k2.6",
              cwd: "/root/services/openclaw-roles/live",
              reasoningLevel: "stream",
              thinkingLevel: "xhigh",
              promptHashMatched: true,
              toolCatalogRef:
                "openclaw-effective-tool-inventory://agent%3Aexecution-coding%3Anode%3Anrun_projection_1",
            },
            nodeAgentTraceObservations: {
              workerPromptAuthored: true,
              parentSessionStarted: true,
              firstPlanUpdateObserved: true,
              contextScoutSpawnObserved: true,
              sessionsYieldObserved: true,
              childResultObserved: true,
              parentSynthesisObserved: true,
              firstEditObserved: true,
              validationActionObserved: true,
              validationScoutObserved: true,
              repairLoopEvidenceObserved: true,
              terminalNodeFinishObserved: true,
              waitingOnSubagentObserved: true,
            },
            nodeAgentNativeCompactionCount: 1,
            artifactPolicyRef:
              "artifact-policy://execution-platform/native-node-execution-bounded-refs-v1",
            rawStoragePolicyRef: "raw-storage-policy://execution-platform/no-raw-agent-material-v1",
            boundedRefsOnly: true,
          },
          "runtime-job://job-projection/node-agent-session-trace/node-1",
        ),
      ],
    );

    expect(projection.state).toBe("present");
    expect(projection.activeNodeId).toBe("node-1");
    expect(projection.firstOpenGate).toMatchObject({
      gateKind: "node_agent_session_ready",
      gateStatus: "blocked",
      confidence: "canonical",
      sourceKind: "branch_scoped_frontier",
      branchId: "branch-1",
      nodeId: "node-1",
      contractRef: "runtime-job://job-projection/contract/node-1",
      nodeAgentStartReceiptRefs: ["runtime-job://job-projection/node-agent-start-receipt/node-1"],
      schemaPath: "nodeReadinessState.snapshotStatus",
      nextLegalTransition: "compile_node_execution_packet",
      dependentConsumers: ["validation-node-1"],
      successfulSiblingEvidenceRefs: ["runtime-job://job-projection/evidence/sibling-ok"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(projection.firstOpenGateKind).toBe("node_agent_session_ready");
    expect(projection.workerInternal).toMatchObject({
      state: "present",
      modelRef: "qwen/qwen3-coder-next",
      inputPacketRefs: ["node-execution-packet://node-1"],
      outputHash: "sha256:worker-output",
      providerLatencyMs: 2500,
    });
    expect(projection.modelCallProgress).toMatchObject({
      state: "present",
      spanId: "span-1",
      elapsedMs: 2500,
    });
    expect(projection.schedulerModelCallEnvelope).toMatchObject({
      state: "present",
      phase: "heartbeat",
      decisionSlot: "scheduler.select_next_action",
      allowedToolFamily: "scheduler.orchestrator_decision",
      contractBoundaryId: "scheduler_global_reasoning",
      modelPolicyBindingRef: "model-contract-boundary://scheduler_global_reasoning",
      proofCleanlinessState: "clean",
      policyMismatchFields: [
        {
          fieldPath: "timeoutMs",
          reasonCode: "model_policy_timeout_exceeds_bound",
        },
      ],
      inputByteCount: 32_000,
      graphNodeCount: 3,
      activeFrontierCounts: {
        ready: 1,
        blocked: 1,
      },
      heartbeatAgeMs: 10_000,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(projection.parallelFrontier.branchResults[0]).toMatchObject({
      branchId: "branch-1",
      errorPath: "nodeReadinessState.snapshotStatus",
    });
    expect(projection.parallelFrontier.branchScopedFrontierStates[0]).toMatchObject({
      branchId: "branch-1",
      nodeId: "node-1",
      contractRef: "runtime-job://job-projection/contract/node-1",
      readinessRef: "runtime-job://job-projection/readiness/node-1",
      blockerCode: "resources_required",
      blockerSummary: "target snapshot missing",
      blockerSchemaPath: "nodeReadinessState.snapshotStatus",
      dependentConsumers: ["validation-node-1"],
      successfulEvidenceRefs: ["runtime-job://job-projection/evidence/sibling-ok"],
      failedEvidenceRefs: ["runtime-job://job-projection/evidence/node-1-blocked"],
      repairNodeRefs: ["runtime-work-graph://node/context-repair-node-1"],
      diagnosticOnlyNodeRefs: ["runtime-work-graph://node/diagnostic-node-1"],
      nextLegalTransitions: ["compile_node_execution_packet"],
    });
    expect(projection.nodeAgentSession).toMatchObject({
      state: "present",
      nodeRunId: "nrun_projection_1",
      agentId: "execution-coding",
      sessionKey: "agent:execution-coding:node:nrun_projection_1",
      snapshotRefs: ["runtime-job://job-projection/node-execution-snapshot/node-1"],
      startReceiptRefs: ["runtime-job://job-projection/node-agent-start-receipt/node-1"],
      sessionLaunchRef:
        "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1",
      sessionLaunchEventRef:
        "openclaw-session-launch://agent%3Aexecution-coding%3Anode%3Anrun_projection_1/session_launch_1",
      startStatus: "accepted",
      startBlockerKind: null,
      startConfigFingerprint: "sha256:openclaw-config",
      startConfigEpoch: "2026-05-24T00:00:00.000Z",
      startProjectRoot: "/root/services/openclaw-roles/live",
      startExecutionPlatformDocsRoot:
        "/root/services/openclaw-roles/live/docs/projects/execution-platform",
      startRuntimeHome: "/root/.openclaw",
      startRuntimeAliases: [
        {
          aliasPath: "/home/node/.openclaw",
          canonicalPath: "/root/.openclaw",
          label: "container-runtime-home-alias",
        },
      ],
      startSourceRuntimeManifestRef:
        "repo://docs/system/registries/source-runtime-unification.yaml",
      startLockAcquisitionOutcome: "active_lock_owner_live",
      startBlockedTools: [
        {
          agentId: "execution-context-scout",
          toolName: "grep",
          blockedBy: ["global_profile"],
          effectiveProfileSource: "agent",
          localPolicyExplicit: true,
        },
      ],
      traceRefs: ["runtime-job://job-projection/node-agent-session-trace/node-1"],
      finishArtifactRefs: ["runtime-job://job-projection/node-finish/node-1"],
      finishStatus: "blocked",
      finishBlockerKind: "target_snapshot_missing",
      latestToolId: "node.agent_session.invoke",
      observedToolNames: ["update_plan", "task", "edit", "node_finish"],
      toolCallCount: 6,
      traceMissingOptics: [],
      traceEventRefs: {
        childResultRef: "runtime-job://job-projection/subagent-result/context-scout-1",
        parentSynthesisRef: "runtime-job://job-projection/session-event/parent-synthesis-1",
        validationScoutResultRef: "runtime-job://job-projection/subagent-result/validation-scout-1",
        repairLoopEvidenceRef: "runtime-job://job-projection/session-event/repair-loop-1",
        waitingOnSubagentStateRef:
          "agent:execution-coding:node:nrun_projection_1#state/waiting_on_subagent",
      },
      traceObservations: {
        workerPromptAuthored: true,
        firstPlanUpdateObserved: true,
        contextScoutSpawnObserved: true,
        sessionsYieldObserved: true,
        childResultObserved: true,
        parentSynthesisObserved: true,
        firstEditObserved: true,
        validationActionObserved: true,
        validationScoutObserved: true,
        repairLoopEvidenceObserved: true,
        terminalNodeFinishObserved: true,
        waitingOnSubagentObserved: true,
      },
      nativeCompactionCount: 1,
      rawPromptStored: false,
      rawProviderLogStored: false,
    });
    expect(projection.ownerTelemetry).toMatchObject({
      state: "present",
      workIntent: {
        workIntentId: "work-intent-1",
        title: "Patch bounded implementation target",
        executionIntent: "source_edit",
        evidenceMode: ["changed_file_evidence", "validation_evidence"],
      },
      capability: {
        capabilityId: "implementation.qwen.scoped_patch",
        executorKey: "kind:implementation",
        workerRef: "worker://qwen/implementation",
        modelRef: "qwen/qwen3-coder-next",
      },
      runtime: {
        graphId: "graph-1",
        branchId: "branch-1",
        nodeId: "node-1",
        nodeKind: "implementation_scoped",
        currentPhase: "worker.patch",
      },
      refs: {
        inputHandoffRefs: [],
        contextRefs: ["source-material-requirement://node-1"],
        evidenceRefs: [
          "runtime-job://job-projection/evidence/sibling-ok",
          "runtime-job://job-projection/evidence/node-1-blocked",
        ],
      },
      telemetry: {
        measuredTokenUsageAvailable: true,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(JSON.stringify(projection)).not.toContain("boundaryReplay");
    expect(projection.latestRunState).toMatchObject({
      canonicalReadbackGate: {
        gateKind: "node_agent_session_ready",
        nodeId: "node-1",
      },
      agreement: {
        canonicalGateMatches: true,
      },
    });
    expect(JSON.stringify(projection)).not.toContain("must-not-be-special-cased-or-exposed");
    expect(projection.rawPromptStored).toBe(false);
    expect(projection.workerInternal.rawProviderLogStored).toBe(false);
  });

  it("projects native node-agent lifecycle gates instead of stale checkpoint labels", () => {
    const projection = activeGraphProgressReadback(
      [
        event("agent_team.scheduler_progress", {
          graphId: "graph-node-local",
          nodeId: "implementation-node-local",
          activeNodeKind: "implementation_scoped",
          currentPhase: "requirement_map",
          nodeAgentSessionTraceRefs: [
            "runtime-job://job-node-local/node-agent-trace/implementation-node-local",
          ],
          nodeFinishArtifactRefs: [
            "runtime-job://job-node-local/node-finish/implementation-node-local",
          ],
          domainResourceSelectionRefs: ["domain-resource-selection://implementation-node-local/1"],
          domainResourceSelectionStatus: "blocked",
          actionGateStatus: "blocked",
          actionGateMissingFields: ["targetFileSnapshots"],
          evidenceClosureStatus: "pending",
          evidenceClaimRefs: ["evidence-claim://implementation-node-local/1"],
          validationRefs: ["validation://implementation-node-local/diff-check"],
          providerDiagnosticRefs: ["provider-diagnostic://implementation-node-local/context"],
          branchScopedFrontierStates: [
            {
              branchId: "branch-node-resource-demand",
              nodeId: "implementation-node-local",
              nodeKind: "implementation_scoped",
              sourceRequirementRef: "requirement://implementation-node-local",
              contractRef: "contract://implementation-node-local",
              readinessRef: "readiness://implementation-node-local",
              sourceMaterialRequirementRefs: [
                "source-material-requirement://implementation-node-local",
              ],
              nodeAgentSessionTraceRefs: [
                "runtime-job://job-node-local/node-agent-trace/implementation-node-local",
              ],
              nodeFinishArtifactRefs: [
                "runtime-job://job-node-local/node-finish/implementation-node-local",
              ],
              domainResourceSelectionRefs: [
                "domain-resource-selection://implementation-node-local/1",
              ],
              actionGateStatus: "blocked",
              actionGateMissingFields: ["targetFileSnapshots"],
              providerDiagnosticRefs: ["provider-diagnostic://implementation-node-local/context"],
              providerDiagnosticStatus: "available",
              status: "blocked",
              phase: "node_agent_session_ready",
              nodeLifecycleProjectionGate: "node_agent_session_ready",
              blocker: {
                code: "node_worker_prompt_missing_source_material",
                summary: "node worker prompt needs source material before session start",
                schemaPath: "nodeAgentWorkerPrompt.sourceMaterial",
                reasonCodes: ["node_worker_prompt_missing_source_material"],
              },
              nextLegalTransitions: ["start_node_agent_session"],
              capabilityId: "implementation.qwen.scoped_patch",
              executorKey: "kind:implementation",
              modelRef: "qwen/qwen3-coder-next",
              workerRef: "worker://qwen/patch",
            },
          ],
        }),
        event("execution.boundary_replay_checkpoint", {
          checkpointKind: "requirement_map",
          checkpointRef: "checkpoint://stale-requirement-map/stale",
        }),
      ],
      [],
    );

    expect(projection.firstOpenGate).toMatchObject({
      gateKind: "node_agent_session_ready",
      gateStatus: "blocked",
      confidence: "canonical",
      sourceKind: "branch_scoped_frontier",
      branchId: "branch-node-resource-demand",
      nodeId: "implementation-node-local",
      nodeAgentSessionTraceRefs: [
        "runtime-job://job-node-local/node-agent-trace/implementation-node-local",
      ],
      nodeAgentFinishArtifactRefs: [
        "runtime-job://job-node-local/node-finish/implementation-node-local",
      ],
      domainResourceSelectionRefs: ["domain-resource-selection://implementation-node-local/1"],
      actionGateStatus: "blocked",
      providerDiagnosticRefs: ["provider-diagnostic://implementation-node-local/context"],
      schemaPath: "nodeAgentWorkerPrompt.sourceMaterial",
      nextLegalTransition: "start_node_agent_session",
    });
    expect(projection.firstOpenGateKind).toBe("node_agent_session_ready");
    expect(projection.nodeLocalLifecycle).toMatchObject({
      state: "present",
      domainResourceSelection: {
        status: "blocked",
        refs: ["domain-resource-selection://implementation-node-local/1"],
      },
      actionGate: {
        status: "blocked",
        missingFields: ["targetFileSnapshots"],
      },
      evidenceClosure: {
        status: "pending",
        evidenceClaimRefs: ["evidence-claim://implementation-node-local/1"],
        validationRefs: ["validation://implementation-node-local/diff-check"],
      },
      providerDiagnosticRefs: ["provider-diagnostic://implementation-node-local/context"],
      rawProviderLogStored: false,
    });
    expect(JSON.stringify(projection.firstOpenGate)).not.toContain("requirement_map");
  });

  it("projects bounded provider diagnostics and distinguishes preflight from provider response shape", () => {
    const projection = activeGraphProgressReadback(
      [
        event("agent_team.scheduler_progress", {
          graphId: "graph-provider-diag",
          nodeId: "context-node-provider-diag",
          currentPhase: "resource_demand_blocked",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          providerDiagnosticRefs: ["provider-diagnostic://context-node-provider-diag/qwen"],
          modelCallSpanId: "span-provider-diag",
          modelCallPhase: "local_semantic_extraction",
          modelCallSpanElapsedMs: 90_001,
          modelProviderDiagnostics: {
            diagnosticRef: "provider-diagnostic://context-node-provider-diag/qwen",
            modelRef: "qwen/qwen3-coder-next",
            providerPath: "openrouter",
            providerId: "openrouter",
            providerRequestId: "req-context-node-provider-diag",
            profileRef: "structured-adapter-profile://context-node-provider-diag",
            modelTaskClass: "local_semantic_extraction",
            reasoningModeSent: "none",
            responseFormatSent: "prompt_only_json",
            parserMode: "runtime_json_object",
            requestByteCount: 35_600,
            inputBundleRef: "input-bundle://context-node-provider-diag/qwen",
            inputBundleHash: "sha256:input-bundle",
            maxOutputTokens: 3000,
            timeoutMs: 90_000,
            providerStarted: false,
            elapsedMs: 12,
            timeoutState: "not_started",
            finishReason: null,
            nativeFinishReason: null,
            choiceCount: null,
            contentLengthByChoice: [],
            parsedContentLength: 0,
            usageUnavailableReason: "provider_not_invoked_preflight_blocked",
            preflightBlockingReason: "input 35600 exceeds profile max input 32000",
            structuredAdapterPreflight: {
              status: "blocked",
              reasonCodes: ["structured_adapter_preflight_blocked", "input_over_profile"],
            },
            requestProfileDiagnostics: {
              taskClass: "local_semantic_extraction",
              maxInputBytes: 32_000,
              timeoutMs: 90_000,
            },
            providerResponseShape: {
              choicesLength: null,
              contentLengths: [],
            },
            bodyKeys: ["error"],
            choiceKeys: [],
            messageKeys: [],
            errorKeys: ["message", "code"],
            responseBody: "must-not-leak-provider-body",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        }),
      ],
      [],
    );

    expect(projection.providerDiagnostics).toMatchObject({
      state: "present",
      diagnosticRefs: ["provider-diagnostic://context-node-provider-diag/qwen"],
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      providerRequestId: "req-context-node-provider-diag",
      profileRef: "structured-adapter-profile://context-node-provider-diag",
      modelTaskClass: "local_semantic_extraction",
      reasoningModeSent: "none",
      responseFormatSent: "prompt_only_json",
      parserMode: "runtime_json_object",
      requestByteCount: 35_600,
      maxInputBytes: 32_000,
      requestedMaxOutputTokens: 3000,
      requestedTimeoutMs: 90_000,
      profileTimeoutMs: 90_000,
      providerStarted: false,
      preflightStatus: "blocked",
      preflightBlockingReason: "input 35600 exceeds profile max input 32000",
      preflightReasonCodes: ["structured_adapter_preflight_blocked", "input_over_profile"],
      timeoutState: "not_started",
      elapsedMs: 12,
      usageUnavailableReason: "provider_not_invoked_preflight_blocked",
      inputBundleRef: "input-bundle://context-node-provider-diag/qwen",
      inputBundleHash: "sha256:input-bundle",
      responseBodyKeys: ["error"],
      choiceKeys: [],
      errorKeys: ["message", "code"],
      failureClass: "structured_adapter_preflight_blocked",
      rawProviderLogStored: false,
      secretsStored: false,
    });
    expect(JSON.stringify(projection.providerDiagnostics)).not.toContain(
      "must-not-leak-provider-body",
    );
  });

  it("projects bounded heap and manifest optics from latest-run-state", () => {
    const projection = activeGraphProgressReadback(
      [
        event("agent_team.scheduler_progress", {
          graphId: "graph-proof-env",
          nodeId: "implementation-proof-env",
          currentPhase: "domain_action_gate_blocked",
        }),
      ],
      [
        artifact("execution_platform.latest_run_state", {
          proofEnvironment: {
            state: "present",
            heapPhaseSnapshots: [
              {
                snapshotRef: "heap-phase://proof-env/action-gate",
                phase: "domain_action_gate_blocked",
                gateKind: "domain_action_gate_blocked",
                graphId: "graph-proof-env",
                nodeId: "implementation-proof-env",
                heapUsedBytes: 40_000_000,
                heapTotalBytes: 80_000_000,
                rssBytes: 120_000_000,
                externalBytes: 2_000_000,
                arrayBuffersBytes: 1_000_000,
                graphNodeCount: 14,
                graphEdgeCount: 16,
                activeBranchCount: 3,
                largestMetadataBytes: 18_000,
                largestMetadataRef: "runtime-job://proof-env/latest-run-state",
                largestArtifactBodyBytes: 140_000,
                largestArtifactBodyRef: "payload://proof-env/resource-ledger-body",
                latestRunStateMetadataBytes: 18_000,
                schedulerProgressMetadataBytes: 16_000,
                workQueueProjectionMetadataBytes: 12_000,
                providerRequestByteCount: 31_000,
                reasonCodes: ["heap_phase_snapshot_recorded"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                rawCommandLogStored: false,
                rawDbRowsStored: false,
                secretsStored: false,
              },
            ],
            largestMetadataBytes: 18_000,
            largestMetadataRef: "runtime-job://proof-env/latest-run-state",
            largestArtifactBodyBytes: 140_000,
            largestArtifactBodyRef: "payload://proof-env/resource-ledger-body",
            latestRunStateMetadataBytes: 18_000,
            schedulerProgressMetadataBytes: 16_000,
            workQueueProjectionMetadataBytes: 12_000,
            providerRequestMaxBytes: 31_000,
            reasonCodes: ["heap_phase_snapshot_recorded"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawDbRowsStored: false,
            secretsStored: false,
          },
        }),
      ],
    );

    expect(projection.proofEnvironment).toMatchObject({
      state: "present",
      heapPhaseSnapshotRefs: ["heap-phase://proof-env/action-gate"],
      largestMetadataBytes: 18_000,
      largestMetadataRef: "runtime-job://proof-env/latest-run-state",
      largestArtifactBodyBytes: 140_000,
      largestArtifactBodyRef: "payload://proof-env/resource-ledger-body",
      latestRunStateMetadataBytes: 18_000,
      schedulerProgressMetadataBytes: 16_000,
      workQueueProjectionMetadataBytes: 12_000,
      providerRequestMaxBytes: 31_000,
      reasonCodes: ["heap_phase_snapshot_recorded"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    });
  });

  it("treats node lifecycle projection as the canonical gate even when persisted readiness says ready", () => {
    const projection = activeGraphProgressReadback(
      [
        event("agent_team.scheduler_progress", {
          graphId: "graph-readiness-drift",
          nodeId: "implementation-drift",
          activeNodeKind: "implementation",
          currentPhase: "requirement_map",
          nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-drift",
          nodeLifecycleProjectionGate: "node_agent_session_ready",
          nodeLifecycleProjectionStatus: "blocked",
          nodeReadinessStatus: "ready",
          nodeReadinessStateRef: "readiness://implementation-drift/current",
          nodeReadinessPhase: "implementation_ready",
          nodeExecutionContractRef: "contract://implementation-drift",
          nodeExecutionPacketRef: "packet://implementation-drift",
          sourceMaterialRef: "source-material://implementation-drift",
          readinessProjectionStatus: "stale",
          nodeReadinessStale: true,
          readinessProjectionDriftReasonCodes: [
            "readiness_projection_status_mismatch",
            "readiness_projection_nodeExecutionPacketHash_mismatch",
          ],
          readinessProjectionMissingFields: [],
          nodeReadinessNextAllowedTransitions: ["execute_node"],
        }),
        event("execution.boundary_replay_checkpoint", {
          checkpointKind: "requirement_map",
          checkpointRef: "checkpoint://stale-requirement-map/stale",
        }),
      ],
      [],
    );

    expect(projection.firstOpenGate).toMatchObject({
      gateKind: "node_agent_session_ready",
      gateStatus: "blocked",
      confidence: "canonical",
      sourceKind: "branch_scoped_frontier",
      nodeId: "implementation-drift",
      contractRef: "contract://implementation-drift",
      nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-drift",
      sourceMaterialRef: "source-material://implementation-drift",
    });
    expect(projection.firstOpenGateKind).toBe("node_agent_session_ready");
  });

  it("projects runtime artifact payload manifests as refs and counts only", () => {
    const summary = runtimeArtifactPayloadManifestSummary([
      artifact(
        "execution_platform.node_execution_packet",
        {
          artifactKind: "runtime_job_artifact_payload_manifest",
          schemaVersion: RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
          jobId: "job-projection",
          artifactType: "execution_platform.node_execution_packet",
          artifactRef: "runtime-job://job-projection/node-packet/1",
          payloadRef: "runtime-payload://job-projection/node-packet/1",
          storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
          contentType: "application/json",
          byteCount: 1234,
          sha256: "sha256:payload",
          partCount: 1,
          partRefs: [],
          boundedSummary: "node packet manifest",
          targetCommitmentIds: ["C1"],
          targetNodeIds: ["node-1"],
          resourcePacketKind: "coding.node_execution_packet",
          readinessStatus: "ready",
          reasonCodes: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        "runtime-job://job-projection/node-packet/1",
        RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
      ),
    ]);

    expect(summary).toMatchObject({
      manifestCount: 1,
      payloadRefs: ["runtime-payload://job-projection/node-packet/1"],
      artifactRefs: ["runtime-job://job-projection/node-packet/1"],
      totalPayloadBytes: 123,
      hydrationToolId: "artifact.payload.get_json",
      rawPromptStored: false,
    });
  });

  it("keeps execution-read-model as a projection assembler instead of owning active graph projection", () => {
    const source = readFileSync(
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      "utf8",
    );

    expect(source).toContain(
      'import { activeGraphProgressReadback } from "./projections/active-graph-progress.ts";',
    );
    expect(source).not.toContain("function activeGraphProgressReadback(");
    expect(source).not.toContain("function runtimeArtifactPayloadManifestSummary(");
  });
});
