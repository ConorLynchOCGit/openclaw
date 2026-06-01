import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { buildActionReviewArtifact } from "../workflows/action-review-artifacts.ts";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
  type ImplementationTaskPacket,
} from "../workflows/worker-execution-packets.ts";
import {
  compileNodeExecutionPacketForImplementationTask,
  compileNodeExecutionPacketForReadOnlyResource,
  type CodingResourcePacket,
  type NodeExecutionContract,
  type NodeExecutionPacket,
  type ReadOnlyResourcePacket,
} from "../workflows/node-resource-materialization.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  invokeSchedulerRuntimeTool,
  registerSchedulerRuntimeTools,
  type SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";
import {
  NonCodexToolUsingWorkerLoop,
  type NonCodexToolUsingWorkerLoopResult,
  type NonCodexToolUsingWorkerModelClient,
} from "./non-codex-tool-using-worker-loop.ts";

export const WORKER_SMOKE_MATRIX_SCHEMA_VERSION =
  "execution-platform.worker-smoke-matrix.v1" as const;

export type WorkerSmokeMatrixChildClass =
  | "model_task_runtime_contract_child"
  | "workflow_plugin_definition_child"
  | "work_queue_readback_proof_review_child"
  | "valid_no_edit_blocker_child"
  | "neutral_domain_resource_fixture";

export type WorkerSmokeMatrixLaneOutcome =
  | "scoped_edit"
  | "precise_upstream_blocker"
  | "neutral_action_review";

export type WorkerSmokeMatrixLaneSpec = {
  laneId: string;
  childClass: Exclude<WorkerSmokeMatrixChildClass, "neutral_domain_resource_fixture">;
  nodeId: string;
  taskId: string;
  taskTitle: string;
  targetFileRef: string;
  initialContent: string;
  oldText: string;
  newText: string;
  exactEditObjective: string;
  taskSummary: string;
  commitmentIds: string[];
  expectedOutcome: Exclude<WorkerSmokeMatrixLaneOutcome, "neutral_action_review">;
  blocker?: {
    blockerSummary: string;
    missingFields: string[];
    missingRefs: string[];
    requestedUpstreamAction: string;
  };
};

export type WorkerSmokeMatrixLaneResult = {
  laneId: string;
  childClass: WorkerSmokeMatrixChildClass;
  nodeId: string;
  taskId: string;
  outcome: WorkerSmokeMatrixLaneOutcome;
  status: "passed" | "failed";
  runtimeJobId: string;
  graphId: string;
  branchId: string;
  nodeExecutionContractRef: string | null;
  nodeExecutionContractHash: string | null;
  nodeExecutionPacketRef: string | null;
  nodeExecutionPacketHash: string | null;
  domainResourcePacketKind: string | null;
  domainResourcePacketRef: string | null;
  domainResourcePacketHash: string | null;
  implementationTaskPacketRef: string | null;
  implementationTaskPacketHash: string | null;
  changedFileRefs: string[];
  validationRefs: string[];
  evidenceClaimRefs: string[];
  reviewArtifactRefs: string[];
  rollbackMode: "rolled_back" | "not_applicable" | "none";
  rollbackResultRefs: string[];
  workspaceRestored: boolean;
  workerStatus: NonCodexToolUsingWorkerLoopResult["status"] | "not_invoked";
  blockerKind: string | null;
  blockerSummary: string | null;
  nextLegalTransition: string | null;
  workerToolIds: string[];
  matrixToolInvocationRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type WorkerSmokeMatrixProof = {
  artifactKind: "execution_platform.worker_smoke_matrix_proof";
  schemaVersion: typeof WORKER_SMOKE_MATRIX_SCHEMA_VERSION;
  runtimeJobId: string;
  graphId: string;
  generatedAt: string;
  laneResults: WorkerSmokeMatrixLaneResult[];
  pass: boolean;
  scopedEditPassCount: number;
  preciseBlockerPassCount: number;
  neutralFixturePassCount: number;
  childClassesExercised: WorkerSmokeMatrixChildClass[];
  reviewArtifactRefs: string[];
  validationRefs: string[];
  evidenceRefs: string[];
  matrixToolInvocationRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
  workQueueLifecycleMutated: false;
};

type WorkerSmokeLaneMaterialization = {
  implementationTaskPacket: ImplementationTaskPacket;
  nodeExecutionContract: NodeExecutionContract;
  nodeExecutionPacket: NodeExecutionPacket;
  codingResourcePacket: CodingResourcePacket;
  targetPath: string;
};

type WorkerSmokeRuntime = {
  database: Awaited<ReturnType<typeof createExecutionPlatformPgMemTestDatabase>>;
  kernel: RuntimeToolKernel;
  traces: RuntimeToolTraceRepository;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return `sha256:${sha256(JSON.stringify(value))}`;
}

function specialistPayloadFromTaskSummary(taskSummary: string): Record<string, unknown> {
  const marker = "Specialist payload:";
  const markerIndex = taskSummary.indexOf(marker);
  if (markerIndex < 0) {
    return {};
  }
  const text = taskSummary.slice(markerIndex + marker.length).trim();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringListFromPayload(
  payload: Record<string, unknown>,
  key: string,
): string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: Array<string | null | undefined>, max = 80): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .slice(0, max);
}

function proofReasonCodes(results: WorkerSmokeMatrixLaneResult[]): string[] {
  const requiredClasses: WorkerSmokeMatrixChildClass[] = [
    "model_task_runtime_contract_child",
    "workflow_plugin_definition_child",
    "work_queue_readback_proof_review_child",
  ];
  const childClasses = new Set(results.filter((lane) => lane.status === "passed").map((lane) => lane.childClass));
  const hasRequiredClasses = requiredClasses.every((childClass) => childClasses.has(childClass));
  const hasScopedEdit = results.some(
    (lane) => lane.status === "passed" && lane.outcome === "scoped_edit",
  );
  const hasPreciseBlocker = results.some(
    (lane) => lane.status === "passed" && lane.outcome === "precise_upstream_blocker",
  );
  const hasNeutralFixture = results.some(
    (lane) => lane.status === "passed" && lane.outcome === "neutral_action_review",
  );
  return [
    hasRequiredClasses
      ? "worker_smoke_matrix_required_child_classes_passed"
      : "worker_smoke_matrix_required_child_classes_missing",
    hasScopedEdit
      ? "worker_smoke_matrix_scoped_edit_lane_passed"
      : "worker_smoke_matrix_scoped_edit_lane_missing",
    hasPreciseBlocker
      ? "worker_smoke_matrix_precise_blocker_lane_passed"
      : "worker_smoke_matrix_precise_blocker_lane_missing",
    hasNeutralFixture
      ? "worker_smoke_matrix_neutral_fixture_passed"
      : "worker_smoke_matrix_neutral_fixture_missing",
  ];
}

export function defaultProductSpecWorkerSmokeMatrixLanes(): WorkerSmokeMatrixLaneSpec[] {
  return [
    {
      laneId: "model-task-runtime-contract-file",
      childClass: "model_task_runtime_contract_child",
      nodeId: "worker-smoke:model-task-runtime-contract",
      taskId: "worker-smoke-task:model-task-runtime-contract",
      taskTitle: "Model task runtime contract child smoke",
      targetFileRef: "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
      initialContent:
        "export const workerSmokeModelTaskContract = {\n  status: 'before',\n};\n",
      oldText: "status: 'before'",
      newText: "status: 'after'",
      exactEditObjective:
        "Apply one bounded runtime-contract edit through the worker small-verb loop.",
      taskSummary:
        "Product/Spec-derived model-task/runtime contract child. The worker must use the hydrated packet and bounded snapshot, not graph metadata bodies.",
      commitmentIds: ["commitment:model-task-runtime-contract"],
      expectedOutcome: "scoped_edit",
    },
    {
      laneId: "workflow-plugin-definition-file",
      childClass: "workflow_plugin_definition_child",
      nodeId: "worker-smoke:workflow-plugin-definition",
      taskId: "worker-smoke-task:workflow-plugin-definition",
      taskTitle: "Workflow plugin definition child smoke",
      targetFileRef: "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
      initialContent:
        "export const workerSmokeWorkflowPlugin = {\n  enabled: false,\n};\n",
      oldText: "enabled: false",
      newText: "enabled: true",
      exactEditObjective:
        "Apply one bounded workflow-plugin edit through the worker small-verb loop.",
      taskSummary:
        "Product/Spec-derived workflow/plugin definition child. The lane proves plugin-shaped edits receive a hydrated execution packet and review artifact.",
      commitmentIds: ["commitment:workflow-plugin-definition"],
      expectedOutcome: "scoped_edit",
    },
    {
      laneId: "work-queue-readback-proof-review-file",
      childClass: "work_queue_readback_proof_review_child",
      nodeId: "worker-smoke:work-queue-readback-proof-review",
      taskId: "worker-smoke-task:work-queue-readback-proof-review",
      taskTitle: "Work Queue readback proof-review child smoke",
      targetFileRef: "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
      initialContent:
        "export const workerSmokeReadbackProjection = {\n  reviewArtifactRefsVisible: false,\n};\n",
      oldText: "reviewArtifactRefsVisible: false",
      newText: "reviewArtifactRefsVisible: true",
      exactEditObjective:
        "Apply one bounded Work Queue/readback edit through the worker small-verb loop.",
      taskSummary:
        "Product/Spec-derived Work Queue/readback/proof-review child. The lane proves review artifact refs and validation refs survive the worker boundary.",
      commitmentIds: ["commitment:work-queue-readback-proof-review"],
      expectedOutcome: "scoped_edit",
    },
    {
      laneId: "valid-no-edit-upstream-blocker",
      childClass: "valid_no_edit_blocker_child",
      nodeId: "worker-smoke:valid-no-edit-blocker",
      taskId: "worker-smoke-task:valid-no-edit-blocker",
      taskTitle: "Valid no-edit upstream blocker child smoke",
      targetFileRef: "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
      initialContent:
        "export const workerSmokeNoEditBlocker = {\n  requiresUpstreamScope: true,\n};\n",
      oldText: "requiresUpstreamScope: true",
      newText: "requiresUpstreamScope: false",
      exactEditObjective:
        "Report a precise upstream blocker when the executable contract should not be edited.",
      taskSummary:
        "Product/Spec-derived child intentionally exercises the valid no-edit path. The worker must return a typed upstream blocker, not a broad graph repair.",
      commitmentIds: ["commitment:valid-no-edit-blocker"],
      expectedOutcome: "precise_upstream_blocker",
      blocker: {
        blockerSummary:
          "The accepted plan identifies that target selection lacks consumer-authorized edit scope for this child.",
        missingFields: ["domainResourceSelectionPacket.selectedTargetFileRefs"],
        missingRefs: ["domain-resource-selection://valid-no-edit-blocker/missing-authorized-file"],
        requestedUpstreamAction: "repair_domain_resource_selection_scope_before_worker_dispatch",
      },
    },
  ];
}

async function createSmokeRuntime(input: {
  runtimeJobId: string;
  graphId: string;
  nodeIds: string[];
}): Promise<WorkerSmokeRuntime> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  const traces = new RuntimeToolTraceRepository(database.sql);
  const kernel = new RuntimeToolKernel({ registry, traces });
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const graphs = new RuntimeWorkGraphRepository(database.sql);
  await runtimeJobs.enqueueJob({
    jobId: input.runtimeJobId,
    jobType: "executor.agent_team",
    queueName: "agent-team",
    payload: { workflowId: "agent_team.coding", proofGate: "worker_smoke_matrix" },
  });
  await graphs.createGraph({
    graphId: input.graphId,
    rootRuntimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });
  for (const nodeId of input.nodeIds) {
    await graphs.addNode({
      graphId: input.graphId,
      nodeId,
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "worker.kimi.file-implementation",
      nodeStatus: "running",
    });
  }
  return { database, kernel, traces };
}

async function recordMatrixTool(input: {
  kernel: RuntimeToolKernel;
  runtimeJobId: string;
  graphId: string;
  nodeId: string | null;
  toolId:
    | "worker_smoke.prepare_matrix"
    | "worker_smoke.hydrate_lane"
    | "worker_smoke.run_lane"
    | "worker_smoke.record_result"
    | "worker_smoke.assert_review_artifact"
    | "worker_smoke.record_blocker";
  idempotencyKey: string;
  summary: string;
  metadata: Record<string, unknown>;
}): Promise<SchedulerRuntimeToolInvocationSummary> {
  return await invokeSchedulerRuntimeTool({
    kernel: input.kernel,
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    roleRef: "proof_harness",
    modelRef: null,
    idempotencyKey: input.idempotencyKey,
    inputSummary: input.summary,
    metadata: {
      ...input.metadata,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    },
  });
}

function fileSnapshotForLane(input: {
  fileRef: string;
  content: string;
}): ImplementationTaskFileSnapshot {
  return {
    fileRef: input.fileRef,
    snapshotRef: `repo-snapshot://worker-smoke/${sha256(input.fileRef).slice(0, 16)}`,
    contentHash: `sha256:${sha256(input.content)}`,
    byteCount: Buffer.byteLength(input.content, "utf8"),
    sourceKind: "repo_file",
    freshnessStatus: "fresh",
    rawContentStored: false,
  };
}

async function materializeLane(input: {
  lane: WorkerSmokeMatrixLaneSpec;
  runtimeJobId: string;
  graphId: string;
  repoRoot: string;
}): Promise<WorkerSmokeLaneMaterialization> {
  const targetPath = path.join(input.repoRoot, input.lane.targetFileRef);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, input.lane.initialContent, "utf8");
  const snapshot = fileSnapshotForLane({
    fileRef: input.lane.targetFileRef,
    content: input.lane.initialContent,
  });
  const implementationTaskPacket = buildImplementationTaskPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    sourceGraphNodeId: input.lane.nodeId,
    microtaskId: input.lane.taskId,
    microtaskTitle: input.lane.taskTitle,
    exactEditObjective: input.lane.exactEditObjective,
    taskSummary: input.lane.taskSummary,
    targetCommitmentIds: input.lane.commitmentIds,
    domainResourceSelectionRefs: [`domain-resource-selection://worker-smoke/${input.lane.laneId}`],
    targetFileRefs: [input.lane.targetFileRef],
    targetFileSnapshots: [snapshot],
    allowedFileRefs: [input.lane.targetFileRef],
    allowedEditScope: [input.lane.targetFileRef],
    mustReadRefs: [input.lane.targetFileRef],
    likelyModifyRefs: [input.lane.targetFileRef],
    contextPacketRefs: [`resource-requirement://worker-smoke/${input.lane.laneId}`],
    sourceResourceHandoffRefs: [`resource-handoff://worker-smoke/${input.lane.laneId}`],
    sourcePromptExcerptRefs: [`source-prompt://worker-smoke/${input.lane.laneId}`],
    validationCommandRefs:
      input.lane.childClass === "work_queue_readback_proof_review_child"
        ? [`git diff --check -- ${input.lane.targetFileRef}`]
        : [`validation://worker-smoke/${input.lane.laneId}/targeted`],
    acceptanceCriteria: [
      "Worker receives a hydrated NodeExecutionPacket and domain resource packet.",
      "Worker outcome is either a bounded edit with validation/evidence/review artifact or a precise upstream blocker.",
    ],
    expectedEvidenceClaimKinds: ["source_change", "test_validation"],
    evidenceClaimExpectations: [
      "Changed-file refs and validation refs map to the source commitment ids.",
    ],
    successEvidenceDescriptions: [
      "Small-verb worker loop produced reviewable bounded evidence.",
    ],
    contextFreshnessSummary: "fresh",
  });
  const materialized = compileNodeExecutionPacketForImplementationTask({
    runtimeJobId: input.runtimeJobId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    nodeId: input.lane.nodeId,
    nodeKind: "implementation",
    capabilityId: "implementation_microtask",
    executorKey: "kind:implementation",
    workerRef: "openrouter://moonshotai/kimi-k2.6",
    implementationTaskPacket,
  });
  return {
    implementationTaskPacket,
    nodeExecutionContract: materialized.nodeExecutionContract,
    nodeExecutionPacket: materialized.nodeExecutionPacket,
    codingResourcePacket: materialized.codingResourcePacket,
    targetPath,
  };
}

function modelClientForLane(lane: WorkerSmokeMatrixLaneSpec): NonCodexToolUsingWorkerModelClient {
  let specialistTurn = 0;
  return {
    async nextTurn(input) {
      if (input.modelSlot === "context_decision") {
        const isSpecialistSubturn = input.taskSummary.includes("Specialist payload:");
        if (!isSpecialistSubturn) {
          const toolCalls = [
            {
              callId: `${lane.laneId}:request-context`,
              toolId: "worker.context.request_more",
              reason: "Request the bounded target context before accepting an edit window.",
              input: {
                requestedFileRefs: [lane.targetFileRef],
                reason: "Inspect the target file to decide the next legal worker action.",
                expectedUse: "Use the bounded snapshot to accept an exact context window.",
              },
            },
          ];
          return {
            modelRunRef: `model-smoke://context-request/${lane.laneId}/${input.turn}`,
            responseText: JSON.stringify({ toolCalls }),
            responseHash: hashJson(toolCalls),
            latencyMs: 3,
            usage: {
              inputTokenCount: 256,
              outputTokenCount: 128,
              totalTokenCount: 384,
              estimatedCostUsd: 0,
            },
            providerResponseDiagnostics: {
              providerId: "deterministic-smoke-model",
              finishReason: "stop",
              choiceCount: 1,
              contentLength: JSON.stringify(toolCalls).length,
              rawPromptStored: false,
              rawResponseStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          };
        }
        specialistTurn += 1;
        const specialistPayload = specialistPayloadFromTaskSummary(input.taskSummary);
        const searchMatchRefs = stringListFromPayload(specialistPayload, "searchMatchRefs");
        const openedExactWindowRefs = stringListFromPayload(
          specialistPayload,
          "openedExactWindowRefs",
        );
        const selectedMatchRef =
          searchMatchRefs.find((ref) => ref.includes(lane.targetFileRef)) ??
          searchMatchRefs[0] ??
          `file-window://${lane.targetFileRef}#L1-L80`;
        const selectedExactWindowRef =
          openedExactWindowRefs.find((ref) => ref.includes(lane.targetFileRef)) ??
          openedExactWindowRefs[0] ??
          selectedMatchRef;
        const toolCall =
          specialistTurn === 1
            ? {
                callId: `${lane.laneId}:search-target`,
                toolId: "resource.scout.choose_search_query",
                reason: "Search the legal refs for the bounded smoke-test edit target.",
                input: {
                  ref: "legal_refs",
                  query: lane.oldText.split(/\s+/u)[0] ?? "status",
                  expectedUse: "Find the target file window before edit planning.",
                },
              }
            : specialistTurn === 2
              ? {
                  callId: `${lane.laneId}:choose-target-window`,
                  toolId: "resource.scout.choose_window_from_matches",
                  reason: "Open the bounded target window selected from search matches.",
                  input: {
                    selectedWindowRefs: [selectedMatchRef],
                    expectedUse: "Inspect the smoke-test edit surface.",
                  },
                }
              : specialistTurn === 3
                ? {
                    callId: `${lane.laneId}:contract-target-window`,
                    toolId: "resource.scout.contract_window",
                    reason: "Confirm the exact bounded target window for this narrow edit.",
                    input: {
                      windowRef: selectedExactWindowRef,
                      startLine: 1,
                      endLine: 3,
                      expectedUse: "Use the exact window for worker edit planning.",
                    },
                  }
                : {
                    callId: `${lane.laneId}:submit-exact-handles`,
                    toolId: "resource.scout.submit_exact_handles",
                    reason: "Submit the exact bounded target window after search and inspection.",
                    input: {
                      exactContextRefs: [selectedExactWindowRef],
                      handoffSummary: "The exact target window contains the smoke-test edit surface.",
                      expectedUse: "Hydrate this exact window for worker-owned edit planning.",
                    },
                  };
        return {
          modelRunRef: `model-smoke://context-specialist/${lane.laneId}/${input.turn}`,
          responseText: JSON.stringify({ toolCalls: [toolCall] }),
          responseHash: hashJson(toolCall),
          latencyMs: 3,
          usage: {
            inputTokenCount: 256,
            outputTokenCount: 96,
            totalTokenCount: 352,
            estimatedCostUsd: 0,
          },
          providerResponseDiagnostics: {
            providerId: "deterministic-smoke-model",
            finishReason: "stop",
            choiceCount: 1,
            contentLength: JSON.stringify(toolCall).length,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        };
      }
      if (input.modelSlot === "patch") {
        const toolCall =
          lane.expectedOutcome === "scoped_edit"
            ? {
                callId: `${lane.laneId}:author-edit`,
                toolId: "worker.patch.author_edit",
                reason: "Author exactly one bounded edit from the accepted plan and snapshot.",
                input: {
                  fileEdits: [
                    {
                      path: lane.targetFileRef,
                      operation: "replace_text",
                      oldText: lane.oldText,
                      newText: lane.newText,
                      rationale: lane.exactEditObjective,
                    },
                  ],
                },
              }
            : {
                callId: `${lane.laneId}:upstream-blocker`,
                toolId: "worker.repair.mark_upstream_blocker",
                reason:
                  "Return the precise upstream blocker instead of editing from insufficient authority.",
                input: {
                  blockerSummary:
                    lane.blocker?.blockerSummary ??
                    "The current executable handoff is not sufficient for a safe edit.",
                  requestedUpstreamAction:
                    lane.blocker?.requestedUpstreamAction ??
                    "repair_upstream_context_or_task_packet",
                  missingFields: lane.blocker?.missingFields ?? ["nodeExecutionContract"],
                  missingRefs: lane.blocker?.missingRefs ?? [],
                },
              };
        return {
          modelRunRef: `model-smoke://patch/${lane.laneId}/${input.turn}`,
          responseText: JSON.stringify({ toolCalls: [toolCall] }),
          responseHash: hashJson(toolCall),
          latencyMs: 4,
          usage: {
            inputTokenCount: 128,
            outputTokenCount: 64,
            totalTokenCount: 192,
            estimatedCostUsd: 0,
          },
          providerResponseDiagnostics: {
            providerId: "deterministic-smoke-model",
            finishReason: "stop",
            choiceCount: 1,
            contentLength: JSON.stringify(toolCall).length,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
        };
      }
      const hasWorkerContextResult = input.toolResultSummaries.some(
        (summary) =>
          summary.includes("worker.context.request_more") ||
          summary.includes("worker_context_request_more_fulfilled") ||
          summary.includes("worker_context_request_more_specialist_subturn_completed"),
      );
      const toolCalls =
        !hasWorkerContextResult
          ? [
              {
                callId: `${lane.laneId}:request-context`,
                toolId: "worker.context.request_more",
                reason: "Request the bounded target context before accepting an edit window.",
                input: {
                  requestedFileRefs: [lane.targetFileRef],
                  reason: "Inspect the target file to decide the next legal worker action.",
                  expectedUse: "Use the bounded snapshot to accept an exact context window.",
                },
              },
            ]
          : [
                {
                  callId: `${lane.laneId}:plan-edit`,
                  toolId: "worker.edit.plan",
                  reason: "Plan one scoped edit or one precise upstream blocker.",
                  input: {
                    editPlanSteps: [
                      {
                        stepId: `${lane.laneId}:step-1`,
                        objective: lane.exactEditObjective,
                        targetFileRefs: [lane.targetFileRef],
                        validationExpectation: "Runtime-owned validation records the outcome.",
                        commitmentIdsAdvanced: lane.commitmentIds,
                      },
                    ],
                  },
                },
              ];
      return {
        modelRunRef: `model-smoke://controller/${lane.laneId}/${input.turn}`,
        responseText: JSON.stringify({ toolCalls }),
        responseHash: hashJson(toolCalls),
        latencyMs: 3,
        usage: {
          inputTokenCount: 256,
          outputTokenCount: 128,
          totalTokenCount: 384,
          estimatedCostUsd: 0,
        },
        providerResponseDiagnostics: {
          providerId: "deterministic-smoke-model",
          finishReason: "stop",
          choiceCount: 1,
          contentLength: JSON.stringify(toolCalls).length,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      };
    },
  };
}

function firstBlockerFromResult(result: NonCodexToolUsingWorkerLoopResult): {
  blockerKind: string | null;
  blockerSummary: string | null;
  nextLegalTransition: string | null;
} {
  const upstreamBlocker = result.toolResults.find(
    (toolResult) =>
      toolResult.toolId === "worker.repair.mark_upstream_blocker" ||
      toolResult.toolId === "worker.progress.mark_no_edit_blocker",
  );
  const metadata =
    upstreamBlocker?.metadata && typeof upstreamBlocker.metadata === "object"
      ? (upstreamBlocker.metadata as Record<string, unknown>)
      : {};
  return {
    blockerKind:
      upstreamBlocker?.toolId === "worker.repair.mark_upstream_blocker"
        ? "upstream_context_or_authority_blocker"
        : upstreamBlocker?.toolId === "worker.progress.mark_no_edit_blocker"
          ? "no_edit_after_plan"
          : null,
    blockerSummary:
      typeof metadata.blockerSummary === "string"
        ? metadata.blockerSummary
        : upstreamBlocker?.summary ?? null,
    nextLegalTransition:
      typeof metadata.requestedUpstreamAction === "string"
        ? metadata.requestedUpstreamAction
        : typeof metadata.nextLegalTransition === "string"
          ? metadata.nextLegalTransition
          : null,
  };
}

async function runEditableSmokeLane(input: {
  runtime: WorkerSmokeRuntime;
  runtimeJobId: string;
  graphId: string;
  repoRoot: string;
  lane: WorkerSmokeMatrixLaneSpec;
}): Promise<WorkerSmokeMatrixLaneResult> {
  const materialized = await materializeLane({
    lane: input.lane,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    repoRoot: input.repoRoot,
  });
  const matrixToolInvocations: string[] = [];
  const hydrate = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.lane.nodeId,
    toolId: "worker_smoke.hydrate_lane",
    idempotencyKey: `${input.lane.laneId}:hydrate`,
    summary: `Hydrate worker smoke lane ${input.lane.laneId}.`,
    metadata: {
      laneId: input.lane.laneId,
      childClass: input.lane.childClass,
      nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      domainResourcePacketRef: materialized.codingResourcePacket.packetRef,
    },
  });
  matrixToolInvocations.push(hydrate.invocationRef);

  const loop = new NonCodexToolUsingWorkerLoop({
    runtimeToolKernel: input.runtime.kernel,
    modelClient: modelClientForLane(input.lane),
    validationRunner: {
      async run(commandRef) {
        return {
          validationRef: `validation://worker-smoke/${input.lane.laneId}/${sha256(commandRef).slice(0, 12)}`,
          status: "passed",
          summary: `Worker smoke validation passed for ${input.lane.laneId}.`,
        };
      },
    },
  });
  const runTool = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.lane.nodeId,
    toolId: "worker_smoke.run_lane",
    idempotencyKey: `${input.lane.laneId}:run`,
    summary: `Run worker smoke lane ${input.lane.laneId}.`,
    metadata: {
      laneId: input.lane.laneId,
      expectedOutcome: input.lane.expectedOutcome,
    },
  });
  matrixToolInvocations.push(runTool.invocationRef);
  const workerResult = await loop.run({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.lane.nodeId,
    workerId: "worker.kimi.file-implementation",
    roleId: "implementation_engineer",
    taskId: input.lane.taskId,
    taskTitle: input.lane.taskTitle,
    exactEditObjective: input.lane.exactEditObjective,
    implementationTaskPacket: materialized.implementationTaskPacket,
    nodeExecutionContract: materialized.nodeExecutionContract,
    nodeExecutionPacket: materialized.nodeExecutionPacket,
    codingResourcePacket: materialized.codingResourcePacket,
    whyThisWorkerWasSelected:
      "Smoke matrix selected the non-Codex small-verb worker to prove contract hydration across multiple child classes.",
    expectedOutput:
      "Bounded edit with validation/evidence/review artifact or precise upstream blocker.",
    repoRoot: input.repoRoot,
    allowedFileRefs: [input.lane.targetFileRef],
    domainResourceSelectionRefs: [`domain-resource-selection://worker-smoke/${input.lane.laneId}`],
    targetFileRefs: [input.lane.targetFileRef],
    deniedFileRefs: [],
    contextPackRefs: [`resource-handoff://worker-smoke/${input.lane.laneId}`],
    sourcePromptExcerptRefs: [`source-prompt://worker-smoke/${input.lane.laneId}`],
    priorNodeOutputRefs: [`work-intent://worker-smoke/${input.lane.laneId}`],
    validationCommandRefs: materialized.implementationTaskPacket.validationCommandRefs,
    acceptanceCriteria: materialized.implementationTaskPacket.acceptanceCriteria,
    targetCommitmentIds: input.lane.commitmentIds,
    expectedEvidenceClaimKinds: ["source_change", "test_validation"],
    stopIfMissingOrEscalate: materialized.implementationTaskPacket.stopIfMissingOrEscalate,
    budgetPolicyRefs: ["runtime-task-budget://worker-smoke/matrix"],
    budgetPolicy: {
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      maxOutputTokens: 4_000,
      timeoutMs: 120_000,
      maxTurns: 2,
      maxAttempts: 1,
      modelPolicy: {
        patch: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          timeoutMs: 120_000,
          maxOutputTokens: 4_000,
          maxAttempts: 1,
        },
      },
    },
  });

  const afterWorkerContent = await readFile(materialized.targetPath, "utf8");
  const edited = afterWorkerContent.includes(input.lane.newText);
  const rollbackResultRefs: string[] = [];
  let workspaceRestored = false;
  if (workerResult.changedFileRefs.length > 0) {
    await writeFile(materialized.targetPath, input.lane.initialContent, "utf8");
    const restoredContent = await readFile(materialized.targetPath, "utf8");
    workspaceRestored = restoredContent === input.lane.initialContent;
    rollbackResultRefs.push(
      `rollback://worker-smoke/${input.lane.laneId}/${sha256(restoredContent).slice(0, 16)}`,
    );
  }

  if (workerResult.reviewArtifactRefs.length > 0) {
    const reviewTool = await recordMatrixTool({
      kernel: input.runtime.kernel,
      runtimeJobId: input.runtimeJobId,
      graphId: input.graphId,
      nodeId: input.lane.nodeId,
      toolId: "worker_smoke.assert_review_artifact",
      idempotencyKey: `${input.lane.laneId}:review-artifact`,
      summary: `Assert review artifact hydration for ${input.lane.laneId}.`,
      metadata: {
        laneId: input.lane.laneId,
        reviewArtifactRefs: workerResult.reviewArtifactRefs,
        rollbackResultRefs,
      },
    });
    matrixToolInvocations.push(reviewTool.invocationRef);
  }

  const blocker = firstBlockerFromResult(workerResult);
  const expectedScopedEdit = input.lane.expectedOutcome === "scoped_edit";
  const expectedPreciseBlocker = input.lane.expectedOutcome === "precise_upstream_blocker";
  const passed =
    expectedScopedEdit
      ? workerResult.status === "completed" &&
        edited &&
        workerResult.changedFileRefs.includes(input.lane.targetFileRef) &&
        workerResult.validationRefs.length > 0 &&
        workerResult.evidenceClaims.length > 0 &&
        workerResult.reviewArtifactRefs.length > 0 &&
        workspaceRestored
      : workerResult.status === "needs_review" &&
        blocker.blockerKind === "upstream_context_or_authority_blocker" &&
        workerResult.repairClassificationRefs.length > 0 &&
        workerResult.changedFileRefs.length === 0;
  const recordTool = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.lane.nodeId,
    toolId: expectedPreciseBlocker ? "worker_smoke.record_blocker" : "worker_smoke.record_result",
    idempotencyKey: `${input.lane.laneId}:record-result`,
    summary: `Record worker smoke lane ${input.lane.laneId} result.`,
    metadata: {
      laneId: input.lane.laneId,
      status: passed ? "passed" : "failed",
      workerStatus: workerResult.status,
      outcome: expectedPreciseBlocker ? "precise_upstream_blocker" : "scoped_edit",
      changedFileRefs: workerResult.changedFileRefs,
      validationRefs: workerResult.validationRefs,
      reviewArtifactRefs: workerResult.reviewArtifactRefs,
      repairClassificationRefs: workerResult.repairClassificationRefs,
      blockerKind: blocker.blockerKind,
      nextLegalTransition: blocker.nextLegalTransition,
    },
  });
  matrixToolInvocations.push(recordTool.invocationRef);

  return {
    laneId: input.lane.laneId,
    childClass: input.lane.childClass,
    nodeId: input.lane.nodeId,
    taskId: input.lane.taskId,
    outcome: expectedPreciseBlocker ? "precise_upstream_blocker" : "scoped_edit",
    status: passed ? "passed" : "failed",
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    branchId: `${input.graphId}:${input.lane.nodeId}`,
    nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
    nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
    nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
    nodeExecutionPacketHash: hashJson(materialized.nodeExecutionPacket),
    domainResourcePacketKind: materialized.codingResourcePacket.packetKind,
    domainResourcePacketRef: materialized.codingResourcePacket.packetRef,
    domainResourcePacketHash: hashJson(materialized.codingResourcePacket),
    implementationTaskPacketRef: materialized.implementationTaskPacket.packetRef,
    implementationTaskPacketHash: hashJson(materialized.implementationTaskPacket),
    changedFileRefs: workerResult.changedFileRefs,
    validationRefs: workerResult.validationRefs,
    evidenceClaimRefs: workerResult.evidenceClaims.map((claim) => claim.evidenceRef),
    reviewArtifactRefs: workerResult.reviewArtifactRefs,
    rollbackMode: workerResult.changedFileRefs.length > 0 ? "rolled_back" : "none",
    rollbackResultRefs,
    workspaceRestored,
    workerStatus: workerResult.status,
    blockerKind: blocker.blockerKind,
    blockerSummary: blocker.blockerSummary,
    nextLegalTransition: blocker.nextLegalTransition,
    workerToolIds: workerResult.toolResults.map((result) => result.toolId),
    matrixToolInvocationRefs: matrixToolInvocations,
    reasonCodes: uniqueStrings(
      [
        ...workerResult.reasonCodes,
        passed ? "worker_smoke_lane_passed" : "worker_smoke_lane_failed",
        expectedPreciseBlocker
          ? "worker_smoke_precise_upstream_blocker_exercised"
          : "worker_smoke_scoped_edit_exercised",
        workspaceRestored ? "worker_smoke_workspace_restored" : null,
      ],
      80,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

async function runNeutralDomainFixture(input: {
  runtime: WorkerSmokeRuntime;
  runtimeJobId: string;
  graphId: string;
}): Promise<WorkerSmokeMatrixLaneResult> {
  const nodeId = "worker-smoke:neutral-domain-resource";
  const taskId = "worker-smoke-task:neutral-domain-resource";
  const materialized: {
    nodeExecutionContract: NodeExecutionContract;
    nodeExecutionPacket: NodeExecutionPacket;
    readOnlyResourcePacket: ReadOnlyResourcePacket;
    readiness: unknown;
  } = compileNodeExecutionPacketForReadOnlyResource({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    nodeId,
    nodeKind: "permit_review",
    capabilityId: "planning_decision_review",
    executorKey: "kind:permit_review",
    workerRef: "worker.neutral.action-review",
    packetId: `${nodeId}:read-only-resource`,
    executionIntent: "source_grounding",
    evidenceMode: ["read_only_evidence"],
    sourceRefs: ["permit-review://case/worker-smoke"],
    contextPacketRefs: ["resource-requirement://permit-review/worker-smoke"],
    acceptedResourceHandoffRefs: ["resource-handoff://permit-review/worker-smoke"],
    validationRefs: ["validation://permit-review/schema"],
    targetCommitmentIds: ["commitment:neutral-permit-review"],
    evidenceClaimExpectations: ["Neutral action review artifact can be hydrated by ref."],
    authorityScope: ["permit-review://case/**"],
  });
  const hydrate = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId,
    toolId: "worker_smoke.hydrate_lane",
    idempotencyKey: "neutral-domain-resource:hydrate",
    summary: "Hydrate neutral domain resource smoke fixture.",
    metadata: {
      laneId: "neutral-domain-resource",
      childClass: "neutral_domain_resource_fixture",
      nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
      nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
      domainResourcePacketRef: materialized.readOnlyResourcePacket.packetRef,
    },
  });
  const actionReview = buildActionReviewArtifact({
    runtimeJobId: input.runtimeJobId,
    workflowId: "permit_review.workflow",
    graphId: input.graphId,
    branchId: `${input.graphId}:${nodeId}`,
    nodeId,
    workerId: "worker.neutral.action-review",
    roleId: "permit_review_worker",
    capabilityId: "planning_decision_review",
    taskId,
    actionKind: "permit_review.workflow",
    actionStatus: "applied",
    reviewState: "pending_model_or_human_review",
    authorityScopeRefs: ["permit-review://case/**"],
    nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
    nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
    nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
    nodeExecutionPacketHash: hashJson(materialized.nodeExecutionPacket),
    domainResourcePacketRef: materialized.readOnlyResourcePacket.packetRef,
    domainResourcePacketHash: hashJson(materialized.readOnlyResourcePacket),
    domainResourceSelectionPacketRef: null,
    domainResourceSelectionPacketHash: null,
    validationRefs: ["validation://permit-review/schema"],
    evidenceClaimRefs: ["evidence://permit-review/claim"],
    rollbackMode: "not_applicable",
    rollbackResultRefs: [],
    reviewDecisionRefs: [],
    payloadRefs: ["permit-review://case/worker-smoke"],
    payloadHashes: [hashJson(materialized.readOnlyResourcePacket)],
    payloadCounts: { resourcePacketCount: 1, decisionCount: 1 },
    boundedSummary:
      "Neutral non-coding action review fixture proves the review spine is domain-shaped.",
    reasonCodes: ["worker_smoke_neutral_action_review_artifact_built"],
  });
  const review = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId,
    toolId: "worker_smoke.assert_review_artifact",
    idempotencyKey: "neutral-domain-resource:review-artifact",
    summary: "Assert neutral action review artifact hydration.",
    metadata: {
      laneId: "neutral-domain-resource",
      actionReviewArtifactRef: actionReview.artifactRef,
      actionReviewArtifactHash: actionReview.artifactHash,
    },
  });
  const record = await recordMatrixTool({
    kernel: input.runtime.kernel,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId,
    toolId: "worker_smoke.record_result",
    idempotencyKey: "neutral-domain-resource:record-result",
    summary: "Record neutral domain resource smoke fixture.",
    metadata: {
      laneId: "neutral-domain-resource",
      outcome: "neutral_action_review",
      actionReviewArtifactRef: actionReview.artifactRef,
    },
  });
  return {
    laneId: "neutral-domain-resource",
    childClass: "neutral_domain_resource_fixture",
    nodeId,
    taskId,
    outcome: "neutral_action_review",
    status: "passed",
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    branchId: `${input.graphId}:${nodeId}`,
    nodeExecutionContractRef: materialized.nodeExecutionContract.contractRef,
    nodeExecutionContractHash: materialized.nodeExecutionContract.contractHash,
    nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
    nodeExecutionPacketHash: hashJson(materialized.nodeExecutionPacket),
    domainResourcePacketKind: materialized.readOnlyResourcePacket.packetKind,
    domainResourcePacketRef: materialized.readOnlyResourcePacket.packetRef,
    domainResourcePacketHash: hashJson(materialized.readOnlyResourcePacket),
    implementationTaskPacketRef: null,
    implementationTaskPacketHash: null,
    changedFileRefs: [],
    validationRefs: ["validation://permit-review/schema"],
    evidenceClaimRefs: ["evidence://permit-review/claim"],
    reviewArtifactRefs: [actionReview.artifactRef],
    rollbackMode: "not_applicable",
    rollbackResultRefs: [],
    workspaceRestored: true,
    workerStatus: "not_invoked",
    blockerKind: null,
    blockerSummary: null,
    nextLegalTransition: "review_action_artifact",
    workerToolIds: [],
    matrixToolInvocationRefs: [hydrate.invocationRef, review.invocationRef, record.invocationRef],
    reasonCodes: [
      "worker_smoke_neutral_domain_resource_fixture_passed",
      "worker_smoke_action_review_artifact_hydrateable",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

export async function runWorkerSmokeMatrixProof(input: {
  runtimeJobId?: string;
  graphId?: string;
  repoRoot?: string;
  lanes?: WorkerSmokeMatrixLaneSpec[];
} = {}): Promise<WorkerSmokeMatrixProof> {
  const runtimeJobId = input.runtimeJobId ?? "worker-smoke-matrix-job";
  const graphId = input.graphId ?? "worker-smoke-matrix-graph";
  const repoRoot =
    input.repoRoot ?? (await mkdtemp(path.join(tmpdir(), "openclaw-worker-smoke-matrix-")));
  const lanes = input.lanes ?? defaultProductSpecWorkerSmokeMatrixLanes();
  const runtime = await createSmokeRuntime({
    runtimeJobId,
    graphId,
    nodeIds: [...lanes.map((lane) => lane.nodeId), "worker-smoke:neutral-domain-resource"],
  });
  try {
    const prepare = await recordMatrixTool({
      kernel: runtime.kernel,
      runtimeJobId,
      graphId,
      nodeId: null,
      toolId: "worker_smoke.prepare_matrix",
      idempotencyKey: "prepare-matrix",
      summary: "Prepare multi-child worker smoke matrix.",
      metadata: {
        laneIds: lanes.map((lane) => lane.laneId),
        childClasses: lanes.map((lane) => lane.childClass),
        neutralFixtureIncluded: true,
      },
    });
    const laneResults: WorkerSmokeMatrixLaneResult[] = [];
    for (const lane of lanes) {
      laneResults.push(
        await runEditableSmokeLane({
          runtime,
          runtimeJobId,
          graphId,
          repoRoot,
          lane,
        }),
      );
    }
    laneResults.push(await runNeutralDomainFixture({ runtime, runtimeJobId, graphId }));
    const reasonCodes = proofReasonCodes(laneResults);
    const pass =
      reasonCodes.includes("worker_smoke_matrix_required_child_classes_passed") &&
      reasonCodes.includes("worker_smoke_matrix_scoped_edit_lane_passed") &&
      reasonCodes.includes("worker_smoke_matrix_precise_blocker_lane_passed") &&
      reasonCodes.includes("worker_smoke_matrix_neutral_fixture_passed") &&
      laneResults.every((lane) => lane.status === "passed");
    const traceRows = await runtime.traces.listInvocations({ graphId, limit: 200 });
    return {
      artifactKind: "execution_platform.worker_smoke_matrix_proof",
      schemaVersion: WORKER_SMOKE_MATRIX_SCHEMA_VERSION,
      runtimeJobId,
      graphId,
      generatedAt: new Date().toISOString(),
      laneResults,
      pass,
      scopedEditPassCount: laneResults.filter(
        (lane) => lane.status === "passed" && lane.outcome === "scoped_edit",
      ).length,
      preciseBlockerPassCount: laneResults.filter(
        (lane) => lane.status === "passed" && lane.outcome === "precise_upstream_blocker",
      ).length,
      neutralFixturePassCount: laneResults.filter(
        (lane) => lane.status === "passed" && lane.outcome === "neutral_action_review",
      ).length,
      childClassesExercised: uniqueStrings(
        laneResults.map((lane) => lane.childClass),
        20,
      ) as WorkerSmokeMatrixChildClass[],
      reviewArtifactRefs: uniqueStrings(
        laneResults.flatMap((lane) => lane.reviewArtifactRefs),
        80,
      ),
      validationRefs: uniqueStrings(
        laneResults.flatMap((lane) => lane.validationRefs),
        80,
      ),
      evidenceRefs: uniqueStrings(
        laneResults.flatMap((lane) => lane.evidenceClaimRefs),
        80,
      ),
      matrixToolInvocationRefs: uniqueStrings(
        [
          prepare.invocationRef,
          ...laneResults.flatMap((lane) => lane.matrixToolInvocationRefs),
          ...traceRows
            .filter((row) => row.toolId.startsWith("worker_smoke."))
          .map((row) => row.invocationId),
        ],
        120,
      ),
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          pass ? "worker_smoke_matrix_passed" : "worker_smoke_matrix_failed",
          "raw_storage_flags_false",
          "runtime_semantic_judgment_not_required",
        ],
        80,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: false,
    };
  } finally {
    await runtime.database.close();
  }
}
