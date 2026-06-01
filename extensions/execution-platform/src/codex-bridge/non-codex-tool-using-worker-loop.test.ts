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
import { buildImplementationTaskPacket } from "../workflows/worker-execution-packets.ts";
import { compileNodeExecutionPacketForImplementationTask } from "../workflows/node-resource-materialization.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import { NonCodexToolUsingWorkerLoop } from "./non-codex-tool-using-worker-loop.ts";

async function createRuntime(graphId: string, jobId: string, nodeId: string) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  const traces = new RuntimeToolTraceRepository(database.sql);
  const kernel = new RuntimeToolKernel({ registry, traces });
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const graphs = new RuntimeWorkGraphRepository(database.sql);
  await runtimeJobs.enqueueJob({
    jobId,
    jobType: "executor.agent_team",
    queueName: "agent-team",
    payload: { workflowId: "agent_team.coding" },
  });
  await graphs.createGraph({
    graphId,
    rootRuntimeJobId: jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });
  await graphs.addNode({
    graphId,
    nodeId,
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: "worker.kimi.file-implementation",
    nodeStatus: "running",
  });
  return { database, kernel };
}

describe("NonCodexToolUsingWorkerLoop", () => {
  it("blocks before provider calls when the canonical NodeExecutionPacket is missing", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-no-packet-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/no-packet-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const noPacket = true;\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-no-worker-packet",
      "job-no-worker-packet",
      "node-no-worker-packet",
    );
    try {
      let modelCalled = false;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCalled = true;
            throw new Error("provider_should_not_be_called_without_node_execution_packet");
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_without_node_execution_packet");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-no-worker-packet",
        graphId: "graph-no-worker-packet",
        nodeId: "node-no-worker-packet",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-no-worker-packet",
        taskTitle: "No packet worker surface guard",
        exactEditObjective: "Prove the worker loop does not expose broad tools without a packet.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file no-packet-target.test.ts"],
        acceptanceCriteria: ["No provider call happens without a NodeExecutionPacket."],
        targetCommitmentIds: ["commitment-no-packet"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 1,
        },
      });

      expect(modelCalled).toBe(false);
      expect(result.status).toBe("needs_review");
      expect(result.modelRunRefs).toEqual([]);
      expect(result.toolResults).toEqual([]);
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "non_codex_worker_node_execution_packet_required",
          "non_codex_worker_no_packet_model_tool_surface_deleted",
        ]),
      );
      expect(
        result.repairClassifications.some(
          (classification) =>
            classification.failureClass === "upstream_packet_insufficient" &&
            classification.failedFieldPaths.includes("nodeExecutionPacket"),
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("allows partial context packets to enter worker-owned context tools", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-partial-context-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/partial-context-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const target = true;\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-partial-context",
      "job-partial-context",
      "node-partial-context",
    );
    try {
      const taskPacket = buildImplementationTaskPacket({
        microtaskId: "task-partial-context",
        microtaskTitle: "Partial context worker surface",
        executionIntent: "source_edit",
        exactEditObjective: "Find the relevant implementation window before editing.",
        taskSummary: "Worker must search/read before planning edits.",
        whyThisWorkerWasSelected: "Exercise worker-owned context discovery.",
        expectedOutput: "Context windows and then edits.",
        targetCommitmentIds: ["commitment-partial-context"],
        targetFileRefs: [],
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        contextPacketRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["Worker may request context before editing."],
        expectedEvidenceClaimKinds: ["source_change"],
        stopIfMissingOrEscalate: ["Use worker.context tools before edit tools."],
        budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/standard"],
        downstreamConsumer: "validation_and_review",
        successEvidenceDescriptions: ["Context tools were exposed from partial packet state."],
      });
      const packets = compileNodeExecutionPacketForImplementationTask({
        runtimeJobId: "job-partial-context",
        workflowId: "agent_team.coding",
        graphId: "graph-partial-context",
        nodeId: "node-partial-context",
        nodeKind: "implementation",
        capabilityId: "implementation_microtask",
        executorKey: "kind:implementation",
        workerRef: "worker.kimi.file-implementation",
        implementationTaskPacket: taskPacket,
      });
      let modelCalled = false;
      let firstPrompt = "";
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            modelCalled = true;
            firstPrompt ||= input.taskSummary;
            return {
              modelRunRef: "openrouter://qwen/partial-context-tool",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "propose-searches",
                    toolId: "worker.context.propose_searches",
                    reason: "Need model-authored search terms before edit planning.",
                    input: {
                      searchTerms: ["partial context target"],
                      expectedUse: "Find exact edit windows before planning.",
                    },
                  },
                ],
              }),
              responseHash: "sha256:partial-context-tool",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_during_partial_context_discovery");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-partial-context",
        graphId: "graph-partial-context",
        nodeId: "node-partial-context",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-partial-context",
        taskTitle: "Partial context worker surface",
        exactEditObjective: "Find the relevant implementation window before editing.",
        implementationTaskPacket: taskPacket,
        nodeExecutionContract: packets.nodeExecutionContract,
        nodeExecutionPacket: packets.nodeExecutionPacket,
        codingResourcePacket: packets.codingResourcePacket,
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["Worker may request context before editing."],
        targetCommitmentIds: ["commitment-partial-context"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 1,
        },
      });

      expect(modelCalled).toBe(true);
      expect(firstPrompt).toContain("worker.context.propose_searches");
      expect(firstPrompt).toContain("worker.context.search");
      expect(firstPrompt).not.toContain("Visible model-facing tools: worker.edit.plan");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_partial_context_allowed_despite_target_readiness_gap",
      );
      expect(result.repairClassifications).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ failureClass: "upstream_packet_insufficient" }),
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("requires model-accepted exact context windows before edit planning", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-context-loop-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/context-loop-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      [
        "export function targetImplementation(input: string): string {",
        "  return input.trim();",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-context-loop",
      "job-context-loop",
      "node-context-loop",
    );
    try {
      const taskPacket = buildImplementationTaskPacket({
        microtaskId: "task-context-loop",
        microtaskTitle: "Worker-owned context loop",
        executionIntent: "source_edit",
        exactEditObjective: "Find targetImplementation and plan the smallest safe edit.",
        taskSummary: "Worker must search, open, accept an exact window, then plan.",
        whyThisWorkerWasSelected: "Exercise Codex-like worker context discovery.",
        expectedOutput: "Accepted exact window refs before edit planning.",
        targetCommitmentIds: ["commitment-context-loop"],
        targetFileRefs: [],
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        contextPacketRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["Context windows must be model accepted before edit planning."],
        expectedEvidenceClaimKinds: ["source_change"],
        stopIfMissingOrEscalate: ["Use search/read/window tools before edit tools."],
        budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/standard"],
        downstreamConsumer: "validation_and_review",
        successEvidenceDescriptions: ["Exact context windows were accepted before planning."],
      });
      const packets = compileNodeExecutionPacketForImplementationTask({
        runtimeJobId: "job-context-loop",
        workflowId: "agent_team.coding",
        graphId: "graph-context-loop",
        nodeId: "node-context-loop",
        nodeKind: "implementation",
        capabilityId: "implementation_microtask",
        executorKey: "kind:implementation",
        workerRef: "worker.kimi.file-implementation",
        implementationTaskPacket: taskPacket,
      });
      let turn = 0;
      const prompts: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            turn += 1;
            prompts.push(input.taskSummary);
            const responses = [
              {
                callId: "search-target",
                toolId: "worker.context.search",
                reason: "Find the implementation symbol before reading.",
                input: {
                  query: "targetImplementation",
                  expectedUse: "Find exact windows for edit planning.",
                },
              },
              {
                callId: "open-match",
                toolId: "worker.context.open_around_match",
                reason: "Open the model-selected search hit.",
                input: {
                  matchRef: `file-window://${fileRef}#L1-L4`,
                  expectedUse: "Inspect implementation pattern.",
                },
              },
              {
                callId: "expand-window",
                toolId: "worker.context.expand_window",
                reason: "Read enough surrounding context before accepting the exact window.",
                input: {
                  windowRef: `file-window://${fileRef}#L1-L4`,
                  beforeLines: 0,
                  afterLines: 2,
                  expectedUse: "Confirm implementation boundary before edit planning.",
                },
              },
              {
                callId: "accept-window",
                toolId: "worker.context.accept_window",
                reason: "The opened window is the exact edit-relevant implementation surface.",
                input: {
                  windowRefs: [`file-window://${fileRef}#L1-L4`],
                  summary: "targetImplementation is defined in the accepted window.",
                  expectedUse: "Use this exact window for edit planning.",
                },
              },
              {
                callId: "plan-edit",
                toolId: "worker.edit.plan",
                reason: "Plan after exact context window acceptance.",
                input: {
                  editPlanSteps: [
                    {
                      stepId: "step-1",
                      objective: "Update targetImplementation behavior.",
                      targetFileRefs: [fileRef],
                      targetRegion: { startLine: 1, endLine: 3 },
                      validationExpectation: "Run structural validation.",
                      commitmentIdsAdvanced: ["commitment-context-loop"],
                    },
                  ],
                },
              },
            ];
            return {
              modelRunRef: `openrouter://qwen/context-loop-${turn}`,
              responseText: JSON.stringify({ toolCalls: [responses[Math.min(turn - 1, responses.length - 1)]] }),
              responseHash: `sha256:context-loop-${turn}`,
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_before_patch");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-context-loop",
        graphId: "graph-context-loop",
        nodeId: "node-context-loop",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-context-loop",
        taskTitle: "Worker-owned context loop",
        exactEditObjective: "Find targetImplementation and plan the smallest safe edit.",
        implementationTaskPacket: taskPacket,
        nodeExecutionContract: packets.nodeExecutionContract,
        nodeExecutionPacket: packets.nodeExecutionPacket,
        codingResourcePacket: packets.codingResourcePacket,
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["Context windows must be model accepted before edit planning."],
        targetCommitmentIds: ["commitment-context-loop"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 5,
        },
      });

      expect(result.toolCalls.map((call) => call.toolId).slice(0, 5)).toEqual([
        "worker.context.search",
        "worker.context.open_around_match",
        "worker.context.expand_window",
        "worker.context.accept_window",
        "worker.edit.plan",
      ]);
      expect(result.editPlanSteps).toHaveLength(1);
      expect(
        result.toolResults.find((toolResult) => toolResult.toolId === "worker.edit.plan")?.status,
      ).toBe("succeeded");
      expect(prompts[2]).toContain("worker.context.expand_window");
      expect(prompts[2]).not.toContain("Visible model-facing tools: worker.edit.plan");
      expect(prompts[3]).toContain("worker.context.accept_window");
      expect(prompts[4]).toContain("Worker lifecycle phase: edit_plan");
      expect(prompts[4]).toContain("worker.edit.plan");
    } finally {
      await database.close();
    }
  });

  it("keeps Codex-like context search/read tools available during validation repair", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-validation-repair-context-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/validation-repair-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/validation-repair-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      [
        "export function targetImplementation(input: string): string {",
        "  return input.trim();",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, testRef),
      [
        "import { targetImplementation } from './validation-repair-target';",
        "it('keeps validation behavior stable', () => {",
        "  expect(targetImplementation('  Mixed  ')).toBe('mixed');",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-validation-repair-context",
      "job-validation-repair-context",
      "node-validation-repair-context",
    );
    try {
      const taskPacket = buildImplementationTaskPacket({
        microtaskId: "task-validation-repair-context",
        microtaskTitle: "Validation repair context loop",
        executionIntent: "source_edit",
        exactEditObjective: "Update targetImplementation and repair validation using context search.",
        taskSummary: "Worker must search, edit, respond to failed validation by searching tests, then repair.",
        whyThisWorkerWasSelected: "Exercise Codex-like context discovery after validation failure.",
        expectedOutput: "Validated source change with evidence.",
        targetCommitmentIds: ["commitment-validation-repair-context"],
        targetFileRefs: [],
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        contextPacketRefs: [],
        validationCommandRefs: ["validation://focused/targetImplementation"],
        acceptanceCriteria: ["Validation repair may search/read tests before authoring the repair."],
        expectedEvidenceClaimKinds: ["source_change", "validation"],
        stopIfMissingOrEscalate: ["Search related tests if validation fails."],
        budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/standard"],
        downstreamConsumer: "validation_and_review",
        successEvidenceDescriptions: ["Validation failure repair used model-authored context tools."],
      });
      const packets = compileNodeExecutionPacketForImplementationTask({
        runtimeJobId: "job-validation-repair-context",
        workflowId: "agent_team.coding",
        graphId: "graph-validation-repair-context",
        nodeId: "node-validation-repair-context",
        nodeKind: "implementation",
        capabilityId: "implementation_microtask",
        executorKey: "kind:implementation",
        workerRef: "worker.kimi.file-implementation",
        implementationTaskPacket: taskPacket,
      });
      let controllerTurn = 0;
      let patchTurn = 0;
      let validationRepairTurn = 0;
      let validationRunCount = 0;
      const prompts: Array<{ slot: string; text: string }> = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            prompts.push({ slot: input.modelSlot, text: input.taskSummary });
            if (input.modelSlot === "patch") {
              patchTurn += 1;
              return {
                modelRunRef: `openrouter://qwen/validation-repair-patch-${patchTurn}`,
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: `author-patch-${patchTurn}`,
                      toolId: "worker.patch.author_edit",
                      reason: "Author the forced patch from the accepted edit plan.",
                      input: {
                        path: fileRef,
                        operation: "replace_range",
                        targetRegion: { startLine: 1, endLine: 3 },
                        replacement: [
                          "export function targetImplementation(input: string): string {",
                          "  return input.trim().toUpperCase();",
                          "}",
                        ].join("\n"),
                        rationale: "Initial implementation edit; validation will check behavior.",
                      },
                    },
                  ],
                }),
                responseHash: `sha256:validation-repair-patch-${patchTurn}`,
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.modelSlot === "validation_repair") {
              validationRepairTurn += 1;
              return {
                modelRunRef: `openrouter://qwen/validation-repair-context-${validationRepairTurn}`,
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "find-related-tests",
                      toolId: "worker.context.find_tests",
                      reason: "The validation failure names targetImplementation; find its related tests.",
                      input: {
                        fileRef,
                        symbol: "targetImplementation",
                        expectedUse: "Open the exact failing test before repairing the implementation.",
                      },
                    },
                    {
                      callId: "open-related-test",
                      toolId: "worker.context.open_adjacent",
                      reason: "Read the model-selected adjacent test file.",
                      input: {
                        adjacentFileRef: testRef,
                        startLine: 1,
                        endLine: 5,
                        expectedUse: "Use the test expectation to repair validation.",
                      },
                    },
                    {
                      callId: "accept-related-test",
                      toolId: "worker.context.accept_window",
                      reason: "The test window explains the lowercase expectation.",
                      input: {
                        windowRefs: [`file-window://${testRef}#L1-L5`],
                        summary: "The test expects lowercase trimmed output.",
                        expectedUse: "Repair targetImplementation to satisfy validation.",
                      },
                    },
                    {
                      callId: "repair-validation",
                      toolId: "worker.repair.author_edit",
                      reason: "Repair the implementation according to the accepted test window.",
                      input: {
                        path: fileRef,
                        operation: "replace_range",
                        targetRegion: { startLine: 1, endLine: 3 },
                        replacement: [
                          "export function targetImplementation(input: string): string {",
                          "  return input.trim().toLowerCase();",
                          "}",
                        ].join("\n"),
                        rationale: "Validation test expects lowercase output.",
                      },
                    },
                  ],
                }),
                responseHash: `sha256:validation-repair-context-${validationRepairTurn}`,
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.modelSlot === "evidence") {
              return {
                modelRunRef: "openrouter://qwen/validation-repair-evidence",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "claim-evidence",
                      toolId: "worker.evidence.claim_from_validation",
                      reason: "Claim evidence from the repaired file and passed validation.",
                      input: {
                        changedFileRefs: [fileRef],
                        validationRefs: ["validation://focused/targetImplementation/2"],
                        targetCommitmentIds: ["commitment-validation-repair-context"],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:validation-repair-evidence",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            controllerTurn += 1;
            const responses = [
              {
                callId: "search-target",
                toolId: "worker.context.search",
                reason: "Find the implementation before planning.",
                input: { query: "targetImplementation", expectedUse: "Find exact edit windows." },
              },
              {
                callId: "open-match",
                toolId: "worker.context.open_around_match",
                reason: "Open the selected implementation match.",
                input: {
                  matchRef: `file-window://${fileRef}#L1-L4`,
                  expectedUse: "Inspect implementation before edit planning.",
                },
              },
              {
                callId: "expand-match",
                toolId: "worker.context.expand_window",
                reason: "Expand the selected implementation match before accepting it.",
                input: {
                  windowRef: `file-window://${fileRef}#L1-L4`,
                  beforeLines: 0,
                  afterLines: 8,
                  expectedUse: "Inspect enough implementation context before edit planning.",
                },
              },
              {
                callId: "accept-window",
                toolId: "worker.context.accept_window",
                reason: "Accept the implementation window for planning.",
                input: {
                  windowRefs: [`file-window://${fileRef}#L1-L4`],
                  summary: "targetImplementation is the edit surface.",
                  expectedUse: "Plan the implementation edit.",
                },
              },
              {
                callId: "plan-edit",
                toolId: "worker.edit.plan",
                reason: "Plan the implementation edit.",
                input: {
                  editPlanSteps: [
                    {
                      stepId: "step-1",
                      objective: "Change targetImplementation behavior.",
                      targetFileRefs: [fileRef],
                      targetRegion: { startLine: 1, endLine: 3 },
                      validationExpectation: "Focused validation must pass.",
                      commitmentIdsAdvanced: ["commitment-validation-repair-context"],
                    },
                  ],
                },
              },
            ];
            return {
              modelRunRef: `openrouter://qwen/validation-repair-controller-${controllerTurn}`,
              responseText: JSON.stringify({
                toolCalls: [responses[Math.min(controllerTurn - 1, responses.length - 1)]],
              }),
              responseHash: `sha256:validation-repair-controller-${controllerTurn}`,
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run(commandRef) {
            validationRunCount += 1;
            return {
              validationRef: `validation://focused/targetImplementation/${validationRunCount}`,
              status: validationRunCount === 1 ? "failed" : "passed",
              commandRef,
              summary:
                validationRunCount === 1
                  ? `${testRef}:3 expected targetImplementation('  Mixed  ') to be 'mixed'`
                  : "Focused validation passed after repair.",
              exitCode: validationRunCount === 1 ? 1 : 0,
              failureKind: validationRunCount === 1 ? "test_failure" : null,
              stderr: validationRunCount === 1 ? `${testRef}:3 expected lowercase output` : "",
              rawCommandLogStored: false,
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-validation-repair-context",
        graphId: "graph-validation-repair-context",
        nodeId: "node-validation-repair-context",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-validation-repair-context",
        taskTitle: "Validation repair context loop",
        exactEditObjective: "Update targetImplementation and repair validation using context search.",
        implementationTaskPacket: taskPacket,
        nodeExecutionContract: packets.nodeExecutionContract,
        nodeExecutionPacket: packets.nodeExecutionPacket,
        codingResourcePacket: packets.codingResourcePacket,
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [],
        contextPackRefs: [],
        validationCommandRefs: ["validation://focused/targetImplementation"],
        acceptanceCriteria: ["Validation repair may search/read tests before authoring the repair."],
        targetCommitmentIds: ["commitment-validation-repair-context"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 6,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.toolCalls.map((call) => call.toolId)).toEqual(
        expect.arrayContaining([
          "worker.context.find_tests",
          "worker.context.open_adjacent",
          "worker.context.accept_window",
          "worker.repair.author_edit",
          "worker.evidence.claim_from_validation",
        ]),
      );
      expect(validationRunCount).toBe(2);
      const validationRepairPrompt = prompts.find((prompt) => prompt.slot === "validation_repair")?.text ?? "";
      expect(validationRepairPrompt).toContain("worker.context.find_tests");
      expect(validationRepairPrompt).toContain("worker.context.open_adjacent");
      expect(validationRepairPrompt).toContain("worker.context.search_symbols");
      expect(validationRepairPrompt).toContain("worker.repair.author_edit");
      const patchPrompt = prompts.find((prompt) => prompt.slot === "patch")?.text ?? "";
      expect(patchPrompt).toContain("worker.patch.author_edit");
      expect(patchPrompt).not.toContain("worker.context.find_tests");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "return input.trim().toLowerCase();",
      );
    } finally {
      await database.close();
    }
  });
});
