import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskFileSnapshot,
} from "../workflows/mission-work-packets.ts";
import { compileNodeExecutionPacketForImplementationTask } from "../workflows/node-resource-materialization.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import {
  fileEditWorkerProfileFor,
  ModelAgnosticFileEditWorkerAdapter,
} from "./file-edit-worker-adapter.ts";
import { NonCodexToolUsingWorkerLoop } from "./non-codex-tool-using-worker-loop.ts";

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

  function readyWorkerPackets(input: {
    runtimeJobId: string;
    graphId: string;
    nodeId: string;
    fileRef: string;
    commitmentId: string;
    validationCommandRef: string;
  }) {
    const snapshot: ImplementationTaskFileSnapshot = {
      fileRef: input.fileRef,
      snapshotRef: `repo-snapshot://${input.fileRef}`,
      contentHash: "sha256:file-edit-worker-snapshot",
      byteCount: 128,
      sourceKind: "repo_file",
      freshnessStatus: "fresh",
      rawContentStored: false,
    };
    const taskPacket = buildImplementationTaskPacket({
      runtimeJobId: input.runtimeJobId,
      workflowId: "agent_team.coding",
      graphId: input.graphId,
      sourceGraphNodeId: input.nodeId,
      microtaskId: `${input.nodeId}:task-1`,
      exactEditObjective: "Make the bounded file edit requested by this worker task.",
      taskSummary: "Use hydrated file snapshots and validation refs for this worker invocation.",
      targetCommitmentIds: [input.commitmentId],
      targetFileRefs: [input.fileRef],
      targetFileSnapshots: [snapshot],
      allowedFileRefs: [input.fileRef],
      allowedEditScope: [input.fileRef],
      mustReadRefs: [input.fileRef],
      likelyModifyRefs: [input.fileRef],
      contextPacketRefs: [`context-handoff://${input.nodeId}`],
      sourceContextHandoffRefs: [`context-handoff://${input.nodeId}`],
      validationCommandRefs: [input.validationCommandRef],
      acceptanceCriteria: ["The worker applies a bounded edit and returns validation evidence."],
      evidenceClaimExpectations: [
        `Changed file and validation evidence close ${input.commitmentId}.`,
      ],
    });
    return compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: input.runtimeJobId,
      workflowId: "agent_team.coding",
      graphId: input.graphId,
      nodeId: input.nodeId,
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "worker.kimi.file-implementation",
      implementationTaskPacket: taskPacket,
    });
  }

  it("retires the Kimi JSON patch proposal path from production success", async () => {
    const adapter = new ModelAgnosticFileEditWorkerAdapter({});

    const result = await adapter.run(baseInput);

    expect(result.status).toBe("needs_review");
    expect(result.changedFileRefs).toEqual([]);
    expect(result.sourceAdapterKind).toBe("kimi_microtask_executor_retired");
    expect(result.reasonCodes).toContain("file_edit_worker_kimi_patch_json_path_retired");
    expect(result.reasonCodes).toContain("non_codex_tool_worker_runtime_required");
  });

  it("keeps model-specific editing behavior in explicit profiles instead of prompt hacks", () => {
    expect(fileEditWorkerProfileFor("kimi_standard_implementation")).toMatchObject({
      responseFormatMode: "prompt_only",
      maxTargetFiles: 6,
      maxToolSelectionTurns: 5,
      maxRecommendedContextRefs: 18,
      reasoningMode: "none",
      jsonReliabilityMode: "policy_owned",
      knownFailureModes: expect.arrayContaining(["malformed_single_tool_action"]),
      wholeFileReplacement: "allowed_when_small",
      qualificationCandidateIds: expect.arrayContaining([
        "openrouter.qwen.qwen3-coder-next",
        "openrouter.moonshotai.kimi-k2.6",
      ]),
    });
    const kimiProfile = fileEditWorkerProfileFor("kimi_standard_implementation");
    expect(kimiProfile.modelPolicySlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot: "controller",
          modelRef: "qwen/qwen3-coder-next",
          reasoningMode: "none",
        }),
        expect.objectContaining({
          slot: "patch",
          modelRef: "moonshotai/kimi-k2.6",
          reasoningMode: "none",
        }),
        expect.objectContaining({
          slot: "validation_repair",
          modelRef: "qwen/qwen3-coder-next",
          reasoningMode: "none",
        }),
      ]),
    );
    expect(fileEditWorkerProfileFor("codex_complex_implementation")).toMatchObject({
      providerPath: "codex_app_server",
      maxRepairAttempts: 5,
      qualificationCandidateIds: ["codex.policy.strongest-coding"],
    });
  });

  it("routes production Kimi work through NonCodexToolWorkerRuntime tool actions", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-file-edit-adapter-"));
    const fileRef = "extensions/execution-platform/src/work-queue/planning-lifecycle.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const label = 'before';\n", "utf8");

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
        toolUsingKimiWorkerLoop: new NonCodexToolUsingWorkerLoop({
          runtimeToolKernel,
          modelClient: {
            async nextTurn(input) {
              if (input.modelSlot === "context_decision") {
                return {
                  modelRunRef: "openrouter://qwen/tool-worker-context",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "read",
                        toolId: "worker.repo.read_files",
                        reason: "Read target before editing.",
                        input: { fileRefs: [fileRef] },
                      },
                    ],
                  }),
                  responseHash: "sha256:tool-worker-context",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (input.modelSlot === "patch") {
                return {
                  modelRunRef: "openrouter://kimi/tool-worker-author",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "plan",
                        toolId: "worker.edit.plan",
                        reason: "Plan scoped edit.",
                        input: {
                          editPlanSteps: [
                            {
                              stepId: "step-1",
                              objective: "Change label value.",
                              targetFileRefs: [fileRef],
                              validationExpectation: "Focused validation passes.",
                              commitmentIdsAdvanced: ["commitment-source-edit"],
                            },
                          ],
                        },
                      },
                      {
                        callId: "apply",
                        toolId: "worker.edit.apply_patch",
                        reason: "Apply runtime-owned edit.",
                        input: {
                          fileEdits: [
                            {
                              path: fileRef,
                              operation: "replace_text",
                              oldText: "label = 'before'",
                              newText: "label = 'after'",
                              rationale: "Scoped worker edit.",
                            },
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:tool-worker-author",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (input.modelSlot === "controller") {
                return {
                  modelRunRef: "openrouter://qwen/tool-worker-validation",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "validate",
                        toolId: "worker.validation.run",
                        reason: "Run focused validation.",
                        input: { commandRefs: ["pnpm test:file planning-lifecycle.test.ts"] },
                      },
                    ],
                  }),
                  responseHash: "sha256:tool-worker-validation",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (input.modelSlot === "validation_repair") {
                return {
                  modelRunRef: "openrouter://qwen/strict-validation-repair-escalate",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "strict-escalate",
                        toolId: "worker.escalate",
                        reason:
                          "Validation was not allowed to proceed because the controller/applicator phase boundary was violated.",
                        input: {
                          reason: "Controller attempted applicator work in strict split mode.",
                          unsuitableReasonCodes: [
                            "worker_phase_authority_blocked_controller_applicator",
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:strict-validation-repair-escalate",
                  latencyMs: 1,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              return {
                modelRunRef: "openrouter://qwen/tool-worker-evidence",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "claim",
                      toolId: "worker.evidence.claim",
                      reason: "Claim commitment evidence.",
                      input: {
                        evidenceClaims: [
                          {
                            commitmentId: "commitment-source-edit",
                            claimSummary: "Kimi tool worker edited and validated the scoped file.",
                            changedFileRefs: [fileRef],
                            validationRefs: ["validation://passed"],
                            confidence: "high",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:tool-worker-evidence",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            },
          },
          validationRunner: {
            async run() {
              return {
                validationRef: "validation://passed",
                status: "passed",
                summary: "focused validation passed",
              };
            },
          },
        }),
      });

      const result = await adapter.run({
        ...baseInput,
        runtimeJobId: "job-file-edit-worker-loop",
        graphId: "graph-file-edit-worker-loop",
        nodeId: "node-kimi-edit",
        ...readyWorkerPackets({
          runtimeJobId: "job-file-edit-worker-loop",
          graphId: "graph-file-edit-worker-loop",
          nodeId: "node-kimi-edit",
          fileRef,
          commitmentId: "commitment-source-edit",
          validationCommandRef: "pnpm test:file planning-lifecycle.test.ts",
        }),
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/work-queue/"],
        targetFileRefs: [fileRef],
        targetCommitmentIds: ["commitment-source-edit"],
        budgetPolicy: { maxTurns: 4 },
      });

      expect(result.status).toBe("applied_change");
      expect(result.sourceAdapterKind).toBe("non_codex_tool_worker_runtime");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://passed"]);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-source-edit");
      expect(result.workerPhaseRefs.length).toBeGreaterThan(0);
      expect(result.workerPhases.map((phase) => phase.phase)).toEqual(
        expect.arrayContaining(["context", "author", "applicator", "validation", "evidence"]),
      );
      expect(result.reasonCodes).not.toContain("file_edit_worker_kimi_patch_json_path_retired");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "label = 'after'",
      );
      const invocations = await traces.listInvocations({
        graphId: "graph-file-edit-worker-loop",
        limit: 50,
      });
      const toolIds = invocations.map((invocation) => invocation.toolId);
      expect(toolIds).toEqual(
        expect.arrayContaining([
          "worker.repo.read_files",
          "worker.edit.plan",
          "worker.edit.apply_patch",
          "worker.validation.run",
          "worker.evidence.claim_from_validation",
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("blocks production controller turns from applying edits directly", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-file-edit-adapter-strict-phase-"));
    const fileRef = "extensions/execution-platform/src/work-queue/strict-phase.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const strictPhase = 'before';\n", "utf8");

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
        jobId: "job-file-edit-worker-strict-phase",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });
      await graphs.createGraph({
        graphId: "graph-file-edit-worker-strict-phase",
        rootRuntimeJobId: "job-file-edit-worker-strict-phase",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      await graphs.addNode({
        graphId: "graph-file-edit-worker-strict-phase",
        nodeId: "node-kimi-strict-phase",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        modelOrWorkerRef: "worker.kimi.file-implementation",
        nodeStatus: "running",
      });
      let controllerAttemptedDirectEdit = false;
      const adapter = new ModelAgnosticFileEditWorkerAdapter({
        runtimeToolKernel,
        toolUsingKimiWorkerLoop: new NonCodexToolUsingWorkerLoop({
          runtimeToolKernel,
          modelClient: {
            async nextTurn(input) {
              if (input.modelSlot === "context_decision") {
                return {
                  modelRunRef: "openrouter://qwen/strict-context",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "read-target",
                        toolId: "worker.repo.read_files",
                        reason: "Read before editing.",
                        input: { fileRefs: [fileRef] },
                      },
                    ],
                  }),
                  responseHash: "sha256:strict-context",
                  latencyMs: 1,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (input.modelSlot === "patch") {
                return {
                  modelRunRef: "openrouter://kimi/strict-author",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "plan-target",
                        toolId: "worker.edit.plan",
                        reason: "Plan the edit only.",
                        input: {
                          editPlanSteps: [
                            {
                              stepId: "step-1",
                              objective: "Change strictPhase value.",
                              targetFileRefs: [fileRef],
                              validationExpectation: "not reached",
                              commitmentIdsAdvanced: ["commitment-strict-phase"],
                            },
                          ],
                        },
                      },
                      {
                        callId: "apply-author-edit",
                        toolId: "worker.edit.apply_patch",
                        reason: "Patch author applies the first scoped edit.",
                        input: {
                          fileEdits: [
                            {
                              path: fileRef,
                              operation: "replace_text",
                              oldText: "'before'",
                              newText: "'mid'",
                              rationale: "This edit is allowed because it is in the patch lane.",
                            },
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:strict-author",
                  latencyMs: 1,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (input.modelSlot === "controller") {
                controllerAttemptedDirectEdit = true;
                return {
                  modelRunRef: "openrouter://qwen/strict-controller-bad-apply",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "bad-controller-apply",
                        toolId: "worker.edit.apply_patch",
                        reason: "Controller incorrectly tries to apply an edit.",
                        input: {
                          fileEdits: [
                            {
                              path: fileRef,
                              operation: "replace_text",
                              oldText: "'mid'",
                              newText: "'after'",
                              rationale: "This must be blocked in strict production mode.",
                            },
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:strict-controller-bad-apply",
                  latencyMs: 1,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              return {
                modelRunRef: `openrouter://qwen/strict-${input.modelSlot}-escalate`,
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: `strict-${input.modelSlot}-escalate`,
                      toolId: "worker.escalate",
                      reason: "Stop after the strict phase-boundary proof.",
                      input: {
                        reason: `Unexpected slot ${input.modelSlot} after strict phase-boundary proof.`,
                        unsuitableReasonCodes: ["strict_phase_test_terminal_escalation"],
                      },
                    },
                  ],
                }),
                responseHash: `sha256:strict-${input.modelSlot}-escalate`,
                latencyMs: 1,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            },
          },
          validationRunner: {
            async run() {
              return {
                validationRef: "validation://strict-phase/passed",
                status: "passed",
                summary: "strict phase validation passed",
              };
            },
          },
        }),
      });

      const result = await adapter.run({
        ...baseInput,
        runtimeJobId: "job-file-edit-worker-strict-phase",
        graphId: "graph-file-edit-worker-strict-phase",
        nodeId: "node-kimi-strict-phase",
        ...readyWorkerPackets({
          runtimeJobId: "job-file-edit-worker-strict-phase",
          graphId: "graph-file-edit-worker-strict-phase",
          nodeId: "node-kimi-strict-phase",
          fileRef,
          commitmentId: "commitment-strict-phase",
          validationCommandRef: "pnpm test:file strict-phase.test.ts",
        }),
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/work-queue/"],
        targetFileRefs: [fileRef],
        targetCommitmentIds: ["commitment-strict-phase"],
        budgetPolicy: { maxTurns: 3 },
      });

      expect(result.status).toBe("applied_change");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://strict-phase/passed"]);
      expect(controllerAttemptedDirectEdit).toBe(false);
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "non_codex_worker_post_patch_exit_to_runtime_validation",
          "non_codex_worker_runtime_auto_validation_after_patch",
        ]),
      );
      expect(result.workerPhases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            phase: "validation",
            status: "succeeded",
            toolId: "worker.validation.run",
          }),
        ]),
      );
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain("'mid'");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.not.toContain(
        "'after'",
      );
    } finally {
      await database.close();
    }
  });
});
