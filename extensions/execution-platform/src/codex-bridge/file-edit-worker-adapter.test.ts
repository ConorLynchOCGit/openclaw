import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import {
  fileEditWorkerProfileFor,
  ModelAgnosticFileEditWorkerAdapter,
} from "./file-edit-worker-adapter.ts";
import type { KimiMicrotaskImplementationExecutorResult } from "./kimi-microtask-implementation-executor.ts";

function kimiResult(
  overrides: Partial<KimiMicrotaskImplementationExecutorResult> = {},
): KimiMicrotaskImplementationExecutorResult {
  return {
    artifactKind: "kimi_microtask_implementation_executor_result",
    microtaskId: "task-1",
    microtaskTitle: "Scoped edit",
    status: "completed",
    modelRef: "moonshotai/kimi-k2.6",
    providerPath: "openrouter",
    modelRunRef: "openrouter://kimi/run",
    changedFileRefs: ["extensions/execution-platform/src/work-queue/planning-lifecycle.ts"],
    diffHash: "sha256:diff",
    validationRefs: ["validation://passed"],
    artifactRefs: ["runtime-work-graph://kimi/result"],
    limitations: [],
    contextExpansionRequests: [],
    editPlanSteps: [],
    evidenceClaims: [],
    attemptDiagnostics: [],
    reasonCodes: ["kimi_microtask_completed"],
    escalatedToCodexBridgeRecommended: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}

describe("ModelAgnosticFileEditWorkerAdapter", () => {
  const baseInput = {
    workerKind: "kimi_standard_implementation" as const,
    workerId: "worker.kimi.file-edit",
    roleId: "implementation_engineer",
    taskId: "task-1",
    taskTitle: "Scoped edit",
    exactEditObjective: "Add one bounded production-safe helper.",
    repoRoot: "/repo",
    allowedFileRefs: ["extensions/execution-platform/src/work-queue/planning-lifecycle.ts"],
    targetFileRefs: ["extensions/execution-platform/src/work-queue/planning-lifecycle.ts"],
    contextPackRefs: ["context-pack://planning"],
    validationCommandRefs: ["pnpm test:file planning-lifecycle.test.ts"],
    acceptanceCriteria: ["changed-file evidence", "validation evidence"],
  };

  it("routes Kimi through the generic file edit worker contract", async () => {
    let exactEditObjective = "";
    let contextScoutHandoff = "";
    let recommendedEditPoint = "";
    let rationaleForCallingThisRole = "";
    const adapter = new ModelAgnosticFileEditWorkerAdapter({
      kimiExecutor: {
        async run(input) {
          exactEditObjective = input.exactEditObjective;
          contextScoutHandoff = input.contextScoutHandoff ?? "";
          recommendedEditPoint = input.recommendedEditPoints?.[0]?.path ?? "";
          rationaleForCallingThisRole = input.rationaleForCallingThisRole ?? "";
          return kimiResult();
        },
      },
    });

    const result = await adapter.run({
      ...baseInput,
      previousFailureSummary: "validation failed once",
      priorFailureRefs: ["validation://failed"],
      rationaleForCallingThisRole:
        "The orchestrator selected Kimi because this is a standard one-file edit packet.",
      contextScoutHandoff: "Context scout found the exact planning lifecycle helper to edit.",
      recommendedEditPoints: [
        {
          path: "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
          symbolOrRegion: "buildPlanningCapsule",
          reason: "This helper owns the target output shape.",
        },
      ],
    });

    expect(exactEditObjective).toContain("Previous bounded failure summary");
    expect(contextScoutHandoff).toContain("exact planning lifecycle helper");
    expect(recommendedEditPoint).toBe(
      "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
    );
    expect(rationaleForCallingThisRole).toContain("standard one-file edit packet");
    expect(result.status).toBe("applied_change");
    expect(result.workerKind).toBe("kimi_standard_implementation");
    expect(result.changedFileRefs).toEqual([
      "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
    ]);
    expect(result.reasonCodes).toContain("file_edit_worker_generic_adapter_used");
    expect(result.reasonCodes).toContain("file_edit_worker_kimi_standard_implementation");
    expect(result.workerProfile).toMatchObject({
      profileId: "file-edit-worker.kimi-standard.v1",
      responseFormatMode: "prompt_only",
      escalationWorkerKind: "codex_complex_implementation",
      qualificationCandidateIds: ["openrouter.moonshotai.kimi-k2.6"],
    });
    expect(result.workerProfile.preferredEditFormats).toContain("search_replace_block");
    expect(result.rawPromptStored).toBe(false);
  });

  it("maps Kimi failure into escalation instead of fake implementation success", async () => {
    const adapter = new ModelAgnosticFileEditWorkerAdapter({
      kimiExecutor: {
        async run() {
          return kimiResult({
            status: "escalated",
            changedFileRefs: [],
            diffHash: null,
            validationRefs: [],
            limitations: ["Kimi returned prose instead of a patch."],
            reasonCodes: ["kimi_no_json_object"],
            escalatedToCodexBridgeRecommended: true,
          });
        },
      },
    });

    const result = await adapter.run(baseInput);

    expect(result.status).toBe("escalate");
    expect(result.changedFileRefs).toEqual([]);
    expect(result.reasonCodes).toContain("kimi_no_json_object");
  });

  it("represents non-Kimi workers as policy slots under the same contract", async () => {
    const adapter = new ModelAgnosticFileEditWorkerAdapter({
      kimiExecutor: {
        async run() {
          throw new Error("kimi should not run");
        },
      },
    });

    const result = await adapter.run({
      ...baseInput,
      workerKind: "frontend_implementation",
      workerId: "worker.frontend.file-edit",
    });

    expect(result.status).toBe("needs_review");
    expect(result.sourceAdapterKind).toBe("policy_slot");
    expect(result.workerProfile.profileId).toBe(
      "file-edit-worker.frontend_implementation.policy-slot.v1",
    );
    expect(result.reasonCodes).toContain("file_edit_worker_policy_slot_requires_executor");
  });

  it("keeps model-specific editing behavior in explicit profiles instead of prompt hacks", () => {
    expect(fileEditWorkerProfileFor("kimi_standard_implementation")).toMatchObject({
      responseFormatMode: "prompt_only",
      maxTargetFiles: 6,
      wholeFileReplacement: "allowed_when_small",
    });
    expect(fileEditWorkerProfileFor("codex_complex_implementation")).toMatchObject({
      providerPath: "codex_app_server",
      maxRepairAttempts: 5,
      qualificationCandidateIds: ["codex.policy.strongest-coding"],
    });
  });

  it("records first-class runtime tool traces for the non-Codex file-edit worker loop", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const runtimeToolKernel = new RuntimeToolKernel({ registry, traces });
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "job-file-edit-worker-loop",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });
      await graphs.createGraph({
        graphId: "graph-file-edit-worker-loop",
        rootRuntimeJobId: "job-file-edit-worker-loop",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      await graphs.addNode({
        graphId: "graph-file-edit-worker-loop",
        nodeId: "node-kimi-edit",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        modelOrWorkerRef: "worker.kimi.file-implementation",
        nodeStatus: "running",
      });
      const adapter = new ModelAgnosticFileEditWorkerAdapter({
        runtimeToolKernel,
        kimiExecutor: {
          async run() {
            return kimiResult({
              contextExpansionRequests: [
                {
                  requestId: "context-1",
                  requestedFileRefs: [
                    "extensions/execution-platform/src/work-queue/planning-lifecycle.test.ts",
                  ],
                  reason: "Need adjacent focused validation context.",
                  commitmentIds: ["commitment-source-edit"],
                  status: "provided",
                  providedContextRefs: ["context-pack://kimi/context-1"],
                  deniedReasonCode: null,
                  rawPromptStored: false,
                  rawResponseStored: false,
                },
              ],
              editPlanSteps: [
                {
                  stepId: "step-1",
                  objective: "Update production helper.",
                  targetFileRefs: [
                    "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
                  ],
                  validationExpectation: "Focused validation passes.",
                  rollbackBoundary: "step",
                  commitmentIdsAdvanced: ["commitment-source-edit"],
                },
              ],
              evidenceClaims: [
                {
                  commitmentId: "commitment-source-edit",
                  evidenceRef: "runtime-work-graph://kimi/evidence/source-edit",
                  claimSummary: "Kimi edited the scoped file and validation passed.",
                  changedFileRefs: [
                    "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
                  ],
                  validationRefs: ["validation://passed"],
                  limitations: [],
                  confidence: "high",
                  rawPromptStored: false,
                  rawResponseStored: false,
                },
              ],
              attemptDiagnostics: [
                {
                  attempt: 1,
                  modelRef: "moonshotai/kimi-k2.6",
                  providerPath: "openrouter",
                  modelRunRef: "openrouter://kimi/first",
                  responseHash: "sha256:first",
                  responsePresent: true,
                  responseLength: 200,
                  latencyMs: 25,
                  maxOutputTokens: 8_000,
                  timeoutMs: 480_000,
                  hadFencedJson: false,
                  hadJsonObject: true,
                  topLevelKeys: ["fileEdits"],
                  hadFileEditsKey: true,
                  parsedStatus: "patch_proposed",
                  parsedNeedsReview: null,
                  parsedFileEditCount: 1,
                  boundedBlockerSummary: null,
                  hadPatchLikeContent: false,
                  schemaParseState: "valid",
                  schemaFailureCategories: [],
                  normalizedEditCount: 1,
                  rejectionStage: null,
                  reasonCodes: ["kimi_patch_response_normalized"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                {
                  attempt: 2,
                  modelRef: "moonshotai/kimi-k2.6",
                  providerPath: "openrouter",
                  modelRunRef: "openrouter://kimi/repair",
                  responseHash: "sha256:repair",
                  responsePresent: true,
                  responseLength: 240,
                  latencyMs: 30,
                  maxOutputTokens: 8_000,
                  timeoutMs: 480_000,
                  hadFencedJson: false,
                  hadJsonObject: true,
                  topLevelKeys: ["fileEdits"],
                  hadFileEditsKey: true,
                  parsedStatus: "patch_proposed",
                  parsedNeedsReview: null,
                  parsedFileEditCount: 1,
                  boundedBlockerSummary: null,
                  hadPatchLikeContent: false,
                  schemaParseState: "valid",
                  schemaFailureCategories: [],
                  normalizedEditCount: 1,
                  rejectionStage: null,
                  reasonCodes: ["kimi_patch_response_normalized"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              reasonCodes: [
                "kimi_patch_applied_and_validated",
                "kimi_patch_repaired_after_feedback",
              ],
            });
          },
        },
      });

      const result = await adapter.run({
        ...baseInput,
        runtimeJobId: "job-file-edit-worker-loop",
        graphId: "graph-file-edit-worker-loop",
        nodeId: "node-kimi-edit",
      });
      const invocations = await traces.listInvocations({
        graphId: "graph-file-edit-worker-loop",
        limit: 50,
      });
      const toolIds = invocations.map((invocation) => invocation.toolId);

      expect(result.status).toBe("applied_change");
      expect(result.runtimeToolInvocationRefs.length).toBeGreaterThan(0);
      expect(toolIds).toContain("worker.file_context.inspect");
      expect(toolIds).toContain("worker.context.request_more");
      expect(toolIds).toContain("worker.context.provide_bounded_snapshot");
      expect(toolIds).toContain("worker.file_edit.plan");
      expect(toolIds).toContain("worker.file_edit.propose_patch");
      expect(toolIds).toContain("worker.file_edit.repair");
      expect(toolIds).toContain("worker.file_edit.apply_patch");
      expect(toolIds).toContain("worker.validation.run");
      expect(toolIds).toContain("worker.evidence.handoff");
      expect(toolIds).not.toContain("worker.file_edit.escalate");
      expect(result.reasonCodes).toContain("scheduler_tool_invoked:worker.file_edit.apply_patch");
      expect(result.editPlanSteps[0]?.stepId).toBe("step-1");
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-source-edit");
      expect(result.rawPromptStored).toBe(false);
    } finally {
      await database.close();
    }
  });
});
