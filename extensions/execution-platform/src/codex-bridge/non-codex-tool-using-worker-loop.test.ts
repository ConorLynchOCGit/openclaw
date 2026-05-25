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
  return { database, kernel, traces };
}

describe("NonCodexToolUsingWorkerLoop", () => {
  it("classifies empty worker model responses before terminal needs_review", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-empty-response-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/empty-response-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const emptyResponseTarget = true;\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-empty-response",
      "job-empty-response",
      "node-empty-response",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://qwen/empty-response",
              responseText: null,
              responseHash: "sha256:empty",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://empty-response/unreachable",
              status: "failed",
              summary: "unreachable",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-empty-response",
        graphId: "graph-empty-response",
        nodeId: "node-empty-response",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-empty-response",
        taskTitle: "Empty response classification proof",
        exactEditObjective: "Classify empty worker model output before stopping.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["classification recorded"],
        targetCommitmentIds: ["commitment-empty-response"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(
        result.repairClassifications.some((item) => item.failureClass === "provider_no_content"),
      ).toBe(true);
      expect(result.reasonCodes).toContain("non_codex_worker_model_call_empty_response");
    } finally {
      await database.close();
    }
  });

  it("blocks before provider calls when NodeExecutionPacket hydration is incomplete", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-worker-gate-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/worker-gate-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const workerGate = 'before';\n", "utf8");
    const fileSnapshot: ImplementationTaskFileSnapshot = {
      fileRef,
      snapshotRef: "repo-snapshot://worker-gate-target",
      contentHash: "sha256:worker-gate-target",
      byteCount: 35,
      sourceKind: "repo_file",
      freshnessStatus: "fresh",
      rawContentStored: false,
    };
    const implementationTaskPacket = buildImplementationTaskPacket({
      runtimeJobId: "job-worker-gate",
      workflowId: "agent_team.coding",
      graphId: "graph-worker-gate",
      sourceGraphNodeId: "node-worker-gate",
      microtaskId: "task-worker-gate",
      exactEditObjective: "Prove worker invocation blocks before provider calls without hydration.",
      taskSummary: "The task is otherwise worker-ready, but the resource body is omitted.",
      targetCommitmentIds: ["commitment-worker-gate"],
      targetFileRefs: [fileRef],
      targetFileSnapshots: [fileSnapshot],
      allowedFileRefs: [fileRef],
      allowedEditScope: [fileRef],
      mustReadRefs: [fileRef],
      likelyModifyRefs: [fileRef],
      contextPacketRefs: ["context-handoff://worker-gate"],
      sourceContextHandoffRefs: ["context-handoff://worker-gate"],
      validationCommandRefs: ["pnpm test:file worker-gate-target.test.ts"],
      acceptanceCriteria: ["No provider call happens until packet hydration is complete."],
      evidenceClaimExpectations: ["Changed-file and validation refs close the commitment."],
      successEvidenceDescriptions: ["Worker readiness gate blocks incomplete hydration."],
    });
    const materialized = compileNodeExecutionPacketForImplementationTask({
      runtimeJobId: "job-worker-gate",
      workflowId: "agent_team.coding",
      graphId: "graph-worker-gate",
      nodeId: "node-worker-gate",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      workerRef: "openrouter://moonshotai/kimi-k2.6",
      implementationTaskPacket,
    });
    const { database, kernel } = await createRuntime(
      "graph-worker-gate",
      "job-worker-gate",
      "node-worker-gate",
    );
    try {
      let modelCalled = false;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCalled = true;
            throw new Error("provider_should_not_be_called_without_hydrated_resource_packet");
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://worker-gate/unreachable",
              status: "failed",
              summary: "unreachable",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-worker-gate",
        graphId: "graph-worker-gate",
        nodeId: "node-worker-gate",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-worker-gate",
        taskTitle: "Worker readiness gate",
        exactEditObjective: "Do not call a model when the NodeExecutionPacket is not hydrated.",
        implementationTaskPacket,
        nodeExecutionPacket: materialized.nodeExecutionPacket,
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context-handoff://worker-gate"],
        validationCommandRefs: ["pnpm test:file worker-gate-target.test.ts"],
        acceptanceCriteria: ["provider call is blocked"],
        targetCommitmentIds: ["commitment-worker-gate"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxTurns: 1,
        },
      });

      expect(modelCalled).toBe(false);
      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("worker_invocation_resource_packet_parse_failed");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_repair_failure_class:upstream_packet_insufficient",
      );
    } finally {
      await database.close();
    }
  });

  it("edits, validates, and claims evidence through runtime tools without patch JSON", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-tool-worker-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/tool-loop-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/tool-loop-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function toolLoopLabel() {\n  return 'before';\n}\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, testRef),
      "import { expect, it } from 'vitest';\nit('returns label', () => expect('after').toBe('after'));\n",
      "utf8",
    );
    const { database, kernel, traces } = await createRuntime(
      "graph-tool-worker",
      "job-tool-worker",
      "node-tool-worker",
    );
    try {
      const phaseEvents: string[] = [];
      let validationCalls = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        phaseSink(event) {
          phaseEvents.push(event.phase);
          expect(event.rawPromptStored).toBe(false);
          expect(event.rawResponseStored).toBe(false);
        },
        modelClient: {
          async nextTurn(input) {
            expect(input.taskSummary).toContain("structured runtime tools");
            expect(input.taskSummary).toContain("Runtime owns file reads");
            expect(input.taskSummary).toContain("ImplementationTaskPacket v3 summary");
            return {
              modelRunRef: "openrouter://kimi/tool-selection",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "search-target",
                    toolId: "worker.repo.search",
                    reason: "Find the target helper before editing.",
                    input: { query: "toolLoopLabel" },
                  },
                  {
                    callId: "read-target",
                    toolId: "worker.repo.read_files",
                    reason: "Read the target and test snapshots.",
                    input: { fileRefs: [fileRef, testRef] },
                  },
                  {
                    callId: "plan-edit",
                    toolId: "worker.edit.plan",
                    reason: "Plan the scoped runtime-owned edit.",
                    input: {
                      editPlanSteps: [
                        {
                          stepId: "step-1",
                          objective: "Change the helper return value.",
                          targetFileRefs: [fileRef],
                          validationExpectation: "Focused validation passes.",
                          commitmentIdsAdvanced: ["commitment-tool-worker"],
                        },
                      ],
                    },
                  },
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a runtime-owned replace_text edit.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "return 'before';",
                          newText: "return 'after';",
                          rationale: "Apply the scoped implementation edit.",
                        },
                      ],
                    },
                  },
                  {
                    callId: "apply-redundant-edit",
                    toolId: "worker.edit.apply_patch",
                    reason:
                      "Simulate an obsolete redundant patch attempt that should not poison later passing validation.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "return 'missing-after-success';",
                          newText: "return 'after';",
                          rationale: "This stale replacement should fail after the real edit.",
                        },
                      ],
                    },
                  },
                  {
                    callId: "run-validation",
                    toolId: "worker.validation.run",
                    reason: "Run approved validation refs.",
                    input: { commandRefs: ["pnpm test:file tool-loop-target.test.ts"] },
                  },
                  {
                    callId: "claim-evidence",
                    toolId: "worker.evidence.claim",
                    reason: "Claim commitment evidence after validation.",
                    input: {
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-tool-worker",
                          claimSummary: "Kimi tool worker edited the helper and validation passed.",
                          changedFileRefs: [fileRef],
                          validationRefs: ["validation://tool-loop-target/1"],
                          confidence: "high",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:tool-selection",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            return {
              validationRef: `validation://tool-loop-target/${validationCalls}`,
              status: "passed",
              summary: "bounded validation pass",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker",
        graphId: "graph-tool-worker",
        nodeId: "node-tool-worker",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-tool-worker",
        taskTitle: "Tool worker proof",
        exactEditObjective: "Use tools to discover, edit, validate, and claim evidence.",
        whyThisWorkerWasSelected:
          "Kimi is the cheapest sufficiently capable worker for this scoped helper edit.",
        expectedOutput: "Changed-file refs, validation refs, and evidence claims.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        deniedFileRefs: ["extensions/execution-platform/src/codex-bridge/unrelated.ts"],
        contextPackRefs: [],
        sourcePromptExcerptRefs: ["source-prompt://job-tool-worker/section/objective"],
        contextSynthesisRefs: ["context-synthesis://job-tool-worker/synthesis"],
        priorNodeOutputRefs: ["runtime-work-graph://node/context-scout/generic-node-result"],
        validationCommandRefs: ["pnpm test:file tool-loop-target.test.ts"],
        acceptanceCriteria: ["repo tools used", "source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-tool-worker"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        stopIfMissingOrEscalate: [
          "Request context before editing if snapshots are insufficient.",
          "Escalate after one bounded repair if validation remains failed.",
        ],
        budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/test"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 8_000,
          timeoutMs: 300_000,
          maxTurns: 1,
          maxAttempts: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.reasonCodes).toContain(
        "worker_edit_apply_patch_failure:replace_text_occurrence_count_0:extensions/execution-platform/src/codex-bridge/tool-loop-target.ts",
      );
      expect(phaseEvents).toEqual(
        expect.arrayContaining([
          "worker.loop.started",
          "worker.tool.selected",
          "worker.tool.started",
          "worker.tool.completed",
          "worker.loop.completed",
        ]),
      );
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.repo.search",
          "worker.repo.read_files",
          "worker.edit.plan",
          "worker.edit.apply_patch",
          "worker.validation.run",
          "worker.evidence.claim",
        ]),
      );
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://tool-loop-target/1"]);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-tool-worker");
      expect(result.editTransactionRefs).toHaveLength(1);
      expect(result.editTransactions.at(-1)).toMatchObject({
        status: "closed",
        phase: "close",
        changedFileRefs: [fileRef],
        validationRefs: ["validation://tool-loop-target/1"],
        evidenceClaimRefs: expect.arrayContaining([
          expect.stringMatching(/^worker-evidence:\/\//u),
        ]),
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "return 'after';",
      );
      const traceRows = await traces.listInvocations({ graphId: "graph-tool-worker", limit: 50 });
      expect(traceRows.map((row) => row.toolId)).toEqual(
        expect.arrayContaining([
          "worker.repo.search",
          "worker.repo.read_files",
          "worker.edit.apply_patch",
          "worker.validation.run",
          "worker.evidence.claim",
        ]),
      );
      expect(traceRows.every((row) => !row.rawPromptStored)).toBe(true);
      const applyTrace = traceRows.find((row) => row.toolId === "worker.edit.apply_patch");
      expect(applyTrace?.metadata).toMatchObject({
        editTransactionRef: result.editTransactionRefs[0],
        rawPromptStored: false,
        rawResponseStored: false,
      });
      const editReviewArtifacts = await database.sql.query(
        "select artifact_type, artifact_ref, metadata from execution_platform.runtime_tool_artifacts where artifact_type = $1 order by created_at asc",
        ["execution_platform.non_codex_worker_edit_review_patch"],
      );
      expect(editReviewArtifacts.rows).toHaveLength(1);
      const editReviewMetadata = editReviewArtifacts.rows[0]?.metadata;
      expect(editReviewMetadata).toMatchObject({
        artifactKind: "non_codex_worker_edit_review_patch",
        schemaVersion: "execution-platform.non-codex-worker-edit-review.v1",
        changedFileRefs: [fileRef],
        validationRefs: [],
        operationCount: 1,
        storedOperationCount: 1,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });
      expect(editReviewMetadata?.metadataCompactedForRuntimeToolStorage).toBeUndefined();
      expect(editReviewMetadata?.operations?.[0]).toMatchObject({
        path: fileRef,
        operation: "replace_text",
        oldTextPreview: "return 'before';",
        newTextPreview: "return 'after';",
      });
    } finally {
      await database.close();
    }
  });

  it("accepts the small model-facing coding tool facade and normalizes to runtime-owned tools", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-worker-tool-facade-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/facade-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function facadeLabel() {\n  return 'before';\n}\n",
      "utf8",
    );
    const { database, kernel, traces } = await createRuntime(
      "graph-worker-facade",
      "job-worker-facade",
      "node-worker-facade",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://qwen/tool-facade",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "facade-search",
                    toolId: "repo.search",
                    reason: "Find the helper by symbol.",
                    input: { query: "facadeLabel" },
                  },
                  {
                    callId: "facade-open",
                    toolId: "repo.open_file",
                    reason: "Read the target file before editing.",
                    input: { path: fileRef, start_line: 1, end_line: 5 },
                  },
                  {
                    callId: "facade-edit",
                    toolId: "edit.search_replace",
                    reason: "Apply the smallest source edit.",
                    input: {
                      path: fileRef,
                      find: "return 'before';",
                      replace: "return 'after';",
                      occurrenceIndex: 0,
                    },
                  },
                  {
                    callId: "facade-check",
                    toolId: "checks.run",
                    reason: "Run the approved focused check.",
                    input: { check_id: "pnpm test:file facade-target.test.ts" },
                  },
                  {
                    callId: "facade-evidence",
                    toolId: "worker.evidence.claim",
                    reason: "Claim evidence after the runtime-owned edit and check.",
                    input: {
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-worker-facade",
                          claimSummary:
                            "The model-facing tool facade normalized into runtime-owned edit and validation tools.",
                          changedFileRefs: [fileRef],
                          validationRefs: ["validation://facade-target/1"],
                          confidence: "high",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:tool-facade",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://facade-target/1",
              status: "passed",
              summary: "facade validation pass",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-worker-facade",
        graphId: "graph-worker-facade",
        nodeId: "node-worker-facade",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-worker-facade",
        taskTitle: "Model-facing tool facade proof",
        exactEditObjective: "Use small public tool verbs that normalize to runtime tools.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file facade-target.test.ts"],
        acceptanceCriteria: ["facade tool aliases normalize", "validation passes"],
        targetCommitmentIds: ["commitment-worker-facade"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.reasonCodes).toContain(
        "non_codex_tool_loop_model_facing_tool_alias_normalized",
      );
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.repo.search",
          "worker.repo.read_files",
          "worker.edit.apply_patch",
          "worker.validation.run",
          "worker.evidence.claim",
        ]),
      );
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "return 'after';",
      );
      const traceRows = await traces.listInvocations({
        graphId: "graph-worker-facade",
        limit: 50,
      });
      expect(traceRows.map((row) => row.toolId)).toEqual(
        expect.arrayContaining([
          "worker.repo.search",
          "worker.repo.read_files",
          "worker.edit.apply_patch",
          "worker.validation.run",
        ]),
      );
      expect(traceRows.every((row) => !row.rawPromptStored && !row.rawResponseStored)).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("validates already-satisfied target refs after a no-op patch attempt", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-tool-worker-noop-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/tool-loop-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/tool-loop-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function toolLoopLabel() {\n  return 'after';\n}\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, testRef),
      "import { expect, it } from 'vitest';\nit('returns label', () => expect('after').toBe('after'));\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-noop",
      "job-tool-worker-noop",
      "node-tool-worker-noop",
    );
    try {
      let validationCalls = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/noop-tool-selection",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "read-target",
                    toolId: "worker.repo.read_files",
                    reason: "Read the current target snapshot.",
                    input: { fileRefs: [fileRef, testRef] },
                  },
                  {
                    callId: "plan-edit",
                    toolId: "worker.edit.plan",
                    reason: "Plan the scoped edit even though it may already be present.",
                    input: {
                      editPlanSteps: [
                        {
                          stepId: "step-1",
                          objective: "Ensure the helper returns after.",
                          targetFileRefs: [fileRef],
                          validationExpectation: "Focused validation passes.",
                          commitmentIdsAdvanced: ["commitment-tool-worker-noop"],
                        },
                      ],
                    },
                  },
                  {
                    callId: "apply-obsolete-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Attempt an obsolete edit because the file is already repaired.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "return 'before';",
                          newText: "return 'after';",
                          rationale: "Apply the intended state.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:noop-tool-selection",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            return {
              validationRef: `validation://tool-loop-target-noop/${validationCalls}`,
              status: "passed",
              summary: "bounded validation pass",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-noop",
        graphId: "graph-tool-worker-noop",
        nodeId: "node-tool-worker-noop",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-tool-worker-noop",
        taskTitle: "Tool worker no-op proof",
        exactEditObjective: "Validate and claim evidence when the target edit is already present.",
        whyThisWorkerWasSelected:
          "Kimi is the cheapest sufficiently capable worker for this scoped helper edit.",
        expectedOutput: "Changed-file refs, validation refs, and evidence claims.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        deniedFileRefs: [],
        contextPackRefs: [],
        sourcePromptExcerptRefs: [],
        contextSynthesisRefs: [],
        priorNodeOutputRefs: [],
        validationCommandRefs: ["pnpm test:file tool-loop-target.test.ts"],
        acceptanceCriteria: ["target refs validated", "evidence claimed"],
        targetCommitmentIds: ["commitment-tool-worker-noop"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        stopIfMissingOrEscalate: ["Escalate if validation fails."],
        budgetPolicyRefs: ["runtime-task-budget://agent_team.coding/implementation_microtask/test"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 8_000,
          timeoutMs: 300_000,
          maxTurns: 1,
          maxAttempts: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef, testRef]);
      expect(result.validationRefs).toEqual(["validation://tool-loop-target-noop/1"]);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-tool-worker-noop");
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "non_codex_worker_runtime_validation_after_noop_patch",
          "non_codex_worker_existing_target_refs_validated",
          "non_codex_worker_runtime_evidence_packet_after_validation",
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("uses Qwen controller slots and Kimi reasoning-none patch slot", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-policy-worker-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/policy-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/policy-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const policyTarget = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "export const policyTest = true;\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-policy-worker",
      "job-policy-worker",
      "node-policy-worker",
    );
    try {
      const calls: Array<{ slot: string; modelRef: string; reasoningMode: string }> = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            calls.push({
              slot: input.modelSlot,
              modelRef: input.modelRef,
              reasoningMode: input.reasoningMode,
            });
            if (input.modelSlot === "context_decision") {
              return {
                modelRunRef: "openrouter://qwen/context",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read bounded target files.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                  ],
                }),
                responseHash: "sha256:qwen-context",
                latencyMs: 1,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.modelSlot === "patch") {
              return {
                modelRunRef: "openrouter://kimi/patch",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan scoped edit.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Update policy target constant.",
                            targetFileRefs: [fileRef],
                            validationExpectation: "Focused validation passes.",
                            commitmentIdsAdvanced: ["commitment-policy-worker"],
                          },
                        ],
                      },
                    },
                    {
                      callId: "apply-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Apply scoped edit.",
                      input: {
                        fileEdits: [
                          {
                            path: fileRef,
                            operation: "replace_text",
                            oldText: "'before'",
                            newText: "'after'",
                            rationale: "Apply policy-slot patch.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:kimi-patch",
                latencyMs: 1,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.modelSlot === "controller") {
              return {
                modelRunRef: "openrouter://qwen/validation",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "run-validation",
                      toolId: "worker.validation.run",
                      reason: "Run approved validation.",
                      input: { commandRefs: ["pnpm test:file policy-target.test.ts"] },
                    },
                  ],
                }),
                responseHash: "sha256:qwen-validation",
                latencyMs: 1,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://qwen/evidence",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "claim-evidence",
                    toolId: "worker.evidence.claim",
                    reason: "Claim evidence.",
                    input: {
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-policy-worker",
                          claimSummary: "Scoped edit was applied and validation passed.",
                          changedFileRefs: [fileRef],
                          validationRefs: ["validation://policy/1"],
                          confidence: "high",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:qwen-evidence",
              latencyMs: 1,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://policy/1",
              status: "passed",
              summary: "bounded validation pass",
            };
          },
        },
      });
      const result = await loop.run({
        runtimeJobId: "job-policy-worker",
        graphId: "graph-policy-worker",
        nodeId: "node-policy-worker",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-policy-worker",
        taskTitle: "Policy slot worker proof",
        exactEditObjective: "Edit the policy target constant.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: ["context://policy-worker"],
        validationCommandRefs: ["pnpm test:file policy-target.test.ts"],
        acceptanceCriteria: ["edit applied", "validation passed", "evidence claimed"],
        targetCommitmentIds: ["commitment-policy-worker"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        budgetPolicy: {
          maxOutputTokens: 10_000,
          timeoutMs: 480_000,
          maxTurns: 4,
          maxAttempts: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(calls).toEqual([
        {
          slot: "context_decision",
          modelRef: "qwen/qwen3-coder-next",
          reasoningMode: "none",
        },
        { slot: "patch", modelRef: "moonshotai/kimi-k2.6", reasoningMode: "none" },
      ]);
      expect(result.reasonCodes).toContain("non_codex_worker_model_policy_slots_used");
      expect(result.reasonCodes).toContain("non_codex_worker_patch_reasoning:none");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_post_patch_exit_to_runtime_validation",
      );
    } finally {
      await database.close();
    }
  });

  it("blocks Kimi as production controller before any provider call", async () => {
    const { database, kernel } = await createRuntime(
      "graph-kimi-controller-blocked",
      "job-kimi-controller-blocked",
      "node-kimi-controller-blocked",
    );
    try {
      let modelCalls = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCalls += 1;
            throw new Error("provider_should_not_be_called_for_unqualified_controller");
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_unqualified_controller");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-kimi-controller-blocked",
        graphId: "graph-kimi-controller-blocked",
        nodeId: "node-kimi-controller-blocked",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-kimi-controller-blocked",
        taskTitle: "Kimi controller blocked",
        exactEditObjective: "Prove Kimi cannot control the production tool loop.",
        repoRoot: "/tmp",
        allowedFileRefs: ["extensions/execution-platform/src/"],
        targetFileRefs: ["extensions/execution-platform/src/example.ts"],
        contextPackRefs: ["context://already-present"],
        validationCommandRefs: ["pnpm test:file example.test.ts"],
        acceptanceCriteria: ["controller gate blocks before provider calls"],
        targetCommitmentIds: ["commitment-controller-gate"],
        budgetPolicy: {
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 1,
          modelPolicy: {
            controller: {
              modelRef: "moonshotai/kimi-k2.6",
              providerPath: "openrouter",
              reasoningMode: "none",
            },
          },
        },
      });

      expect(modelCalls).toBe(0);
      expect(result.status).toBe("needs_review");
      expect(result.providerCapabilitySlotGate.status).toBe("blocked");
      expect(result.providerCapabilitySlotGate.kimiControllerBlocked).toBe(true);
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "kimi_controller_role_blocked:controller",
          "provider_slot_profile_not_production_qualified:controller:openrouter.moonshotai.kimi-k2.6",
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("blocks Kimi patch author turns that use omitted reasoning in production policy", async () => {
    const { database, kernel } = await createRuntime(
      "graph-kimi-omit-blocked",
      "job-kimi-omit-blocked",
      "node-kimi-omit-blocked",
    );
    try {
      let modelCalls = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCalls += 1;
            throw new Error("provider_should_not_be_called_for_bad_patch_reasoning");
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_bad_patch_reasoning");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-kimi-omit-blocked",
        graphId: "graph-kimi-omit-blocked",
        nodeId: "node-kimi-omit-blocked",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-kimi-omit-blocked",
        taskTitle: "Kimi omit blocked",
        exactEditObjective: "Prove Kimi patch turns require reasoning none.",
        repoRoot: "/tmp",
        allowedFileRefs: ["extensions/execution-platform/src/"],
        targetFileRefs: ["extensions/execution-platform/src/example.ts"],
        contextPackRefs: ["context://already-present"],
        validationCommandRefs: ["pnpm test:file example.test.ts"],
        acceptanceCriteria: ["patch reasoning gate blocks before provider calls"],
        targetCommitmentIds: ["commitment-patch-gate"],
        budgetPolicy: {
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 1,
          modelPolicy: {
            patch: {
              modelRef: "moonshotai/kimi-k2.6",
              providerPath: "openrouter",
              reasoningMode: "omit",
            },
          },
        },
      });

      expect(modelCalls).toBe(0);
      expect(result.status).toBe("needs_review");
      expect(result.providerCapabilitySlotGate.status).toBe("blocked");
      expect(result.reasonCodes).toContain("provider_slot_reasoning_mode_not_allowed:patch:omit");
    } finally {
      await database.close();
    }
  });

  it("applies repeated replace_text edits when the worker provides explicit occurrence disambiguation", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-disambiguated-edit-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/repeated-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      [
        "export function firstLabel() {",
        "  return 'same';",
        "}",
        "export function secondLabel() {",
        "  return 'same';",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-disambiguated-edit",
      "job-disambiguated-edit",
      "node-disambiguated-edit",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/disambiguated-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "read-target",
                    toolId: "worker.repo.read_files",
                    reason: "Read the repeated target.",
                    input: { fileRefs: [fileRef] },
                  },
                  {
                    callId: "apply-second-occurrence",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply the edit to the second repeated return only.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "return 'same';",
                          newText: "return 'changed';",
                          occurrenceIndex: 1,
                          rationale: "Disambiguate the repeated snippet by occurrence.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:disambiguated-edit",
              latencyMs: 1,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://not-run",
              status: "passed",
              summary: "not run",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-disambiguated-edit",
        graphId: "graph-disambiguated-edit",
        nodeId: "node-disambiguated-edit",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-disambiguated-edit",
        taskTitle: "Disambiguated edit",
        exactEditObjective: "Edit the second repeated return only.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["second return changed"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.changedFileRefs).toEqual([fileRef]);
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "export function firstLabel() {\n  return 'same';\n}\nexport function secondLabel() {\n  return 'changed';",
      );
    } finally {
      await database.close();
    }
  });

  it("returns actionable ambiguity diagnostics instead of applying repeated replace_text blindly", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-ambiguous-edit-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/ambiguous-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const one = 'same';\nexport const two = 'same';\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-ambiguous-edit",
      "job-ambiguous-edit",
      "node-ambiguous-edit",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/ambiguous-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-ambiguous",
                    toolId: "worker.edit.apply_patch",
                    reason: "Attempt an ambiguous edit.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'same'",
                          newText: "'changed'",
                          rationale: "Missing disambiguation.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:ambiguous-edit",
              latencyMs: 1,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_after_ambiguous_edit");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-ambiguous-edit",
        graphId: "graph-ambiguous-edit",
        nodeId: "node-ambiguous-edit",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-ambiguous-edit",
        taskTitle: "Ambiguous edit",
        exactEditObjective: "Attempt an ambiguous edit.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["runtime rejects ambiguous edit"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.changedFileRefs).toEqual([]);
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "worker_edit_apply_patch_failure:replace_text_ambiguous_occurrences_2_requires_occurrence_index_or_context",
          ),
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("returns a context request instead of pretending implementation failed", async () => {
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-context",
      "job-tool-worker-context",
      "node-tool-worker-context",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/context-request",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "need-context",
                    toolId: "worker.context.request_more",
                    reason: "The packet did not contain the required target snapshot.",
                    input: {
                      requestId: "need-context",
                      requestedFileRefs: ["extensions/execution-platform/src/missing.ts"],
                      reason: "Need the missing target file before editing.",
                      commitmentIds: ["commitment-context"],
                    },
                  },
                ],
              }),
              responseHash: "sha256:context-request",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_context_request");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-context",
        graphId: "graph-tool-worker-context",
        nodeId: "node-tool-worker-context",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-context",
        taskTitle: "Context request",
        exactEditObjective: "Request context before editing.",
        repoRoot: "/tmp",
        allowedFileRefs: ["extensions/execution-platform/src/"],
        targetFileRefs: ["extensions/execution-platform/src/missing.ts"],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file missing.test.ts"],
        acceptanceCriteria: ["context requested"],
        targetCommitmentIds: ["commitment-context"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.contextExpansionRequests[0]).toMatchObject({
        requestId: "need-context",
        status: "requested",
      });
      expect(result.reasonCodes).toContain("worker_context_request_more_unfulfilled");
      expect(result.changedFileRefs).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("reads bounded line windows and reports denied refs without failing the whole repo-read tool", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-read-range-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/range-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      Array.from(
        { length: 40 },
        (_, index) => `export const line${index + 1} = ${index + 1};`,
      ).join("\n"),
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-read-range",
      "job-tool-worker-read-range",
      "node-tool-worker-read-range",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            expect(input.taskSummary).toContain("input.fileRanges");
            expect(input.taskSummary).toContain("CURRENT_SLICE");
            return {
              modelRunRef: "openrouter://qwen/read-range",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "read-window",
                    toolId: "worker.repo.read_files",
                    reason:
                      "Read the missing bounded line window and accidentally include an invalid shorthand ref.",
                    input: {
                      fileRanges: [{ fileRef, startLine: 11, endLine: 13 }],
                      fileRefs: ["CURRENT_SLICE"],
                    },
                  },
                ],
              }),
              responseHash: "sha256:read-range",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_read_range");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-read-range",
        graphId: "graph-tool-worker-read-range",
        nodeId: "node-tool-worker-read-range",
        workerId: "worker.qwen.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-read-range",
        taskTitle: "Read range",
        exactEditObjective: "Read a bounded line range without failing on a denied sibling ref.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["line range read"],
        targetCommitmentIds: ["commitment-read-range"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("worker_repo_read_files_line_ranges_completed");
      expect(result.reasonCodes).toContain("worker_repo_read_files_partial_denied_refs");
      expect(result.reasonCodes).not.toContain("runtime_tool_executor_threw");
      const readResult = result.toolResults.find(
        (tool) => tool.toolId === "worker.repo.read_files",
      );
      const metadata = readResult?.metadata as {
        snapshots?: Array<{ lineNumberedContent?: string; startLine?: number; endLine?: number }>;
        deniedFileRefs?: string[];
      };
      expect(metadata.deniedFileRefs).toEqual(["CURRENT_SLICE"]);
      expect(metadata.snapshots?.[0]).toMatchObject({ startLine: 11, endLine: 13 });
      expect(metadata.snapshots?.[0]?.lineNumberedContent).toContain("  11| export const line11");
      expect(metadata.snapshots?.[0]?.lineNumberedContent).not.toContain("  10|");
    } finally {
      await database.close();
    }
  });

  it("blocks repeated pre-edit context expansion after a targeted line-range read", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-context-budget-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/context-budget-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      Array.from(
        { length: 80 },
        (_, index) => `export const budgetLine${index + 1} = ${index + 1};`,
      ).join("\n"),
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-context-budget",
      "job-tool-worker-context-budget",
      "node-tool-worker-context-budget",
    );
    try {
      let modelCallCount = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCallCount += 1;
            if (modelCallCount === 1) {
              return {
                modelRunRef: "openrouter://qwen/initial-read",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-initial",
                      toolId: "worker.repo.read_files",
                      reason: "Read initial bounded target snapshot.",
                      input: { fileRefs: [fileRef] },
                    },
                  ],
                }),
                responseHash: "sha256:initial-read",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (modelCallCount === 2) {
              return {
                modelRunRef: "openrouter://kimi/first-range",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-first-range",
                      toolId: "worker.repo.read_files",
                      reason: "Read one missing line range before edit planning.",
                      input: { fileRanges: [{ fileRef, startLine: 20, endLine: 25 }] },
                    },
                  ],
                }),
                responseHash: "sha256:first-range",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (modelCallCount === 3) {
              return {
                modelRunRef: "openrouter://kimi/repeated-range",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-second-range",
                      toolId: "worker.repo.read_files",
                      reason: "Try another context-only read instead of editing.",
                      input: { fileRanges: [{ fileRef, startLine: 30, endLine: 35 }] },
                    },
                  ],
                }),
                responseHash: "sha256:repeated-range",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/escalate-after-context-budget",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "escalate-context-budget",
                    toolId: "worker.escalate",
                    reason: "Stop after the context budget forces an edit-or-escalate decision.",
                    input: {
                      reason: "No safe edit selected after targeted context expansion.",
                      unsuitableReasonCodes: ["test_context_budget_exhausted"],
                    },
                  },
                ],
              }),
              responseHash: "sha256:escalate-after-context-budget",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_context_budget");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-context-budget",
        graphId: "graph-tool-worker-context-budget",
        nodeId: "node-tool-worker-context-budget",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-context-budget",
        taskTitle: "Context budget",
        exactEditObjective:
          "Do not spend the entire implementation loop on repeated context reads.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["context budget enforced"],
        targetCommitmentIds: ["commitment-context-budget"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 5,
          maxToolCalls: 8,
          phaseAuthorityMode: "strict",
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("non_codex_worker_pre_plan_context_budget_exhausted");
      expect(
        result.toolResults.filter((tool) => tool.toolId === "worker.repo.read_files"),
      ).toHaveLength(2);
      expect(result.toolResults.map((tool) => tool.summary).join("\n")).not.toContain("30 bounded");
    } finally {
      await database.close();
    }
  });

  it("blocks repeated post-plan context expansion without an edit or escalation", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-tool-worker-context-cap-"),
    );
    const fileRef = "extensions/execution-platform/src/codex-bridge/context-cap-target.ts";
    const extraRef = "extensions/execution-platform/src/codex-bridge/context-cap-extra.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const contextCap = 'before';\n", "utf8");
    await writeFile(
      path.join(repoRoot, extraRef),
      "export const contextCapExtra = true;\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-context-cap",
      "job-tool-worker-context-cap",
      "node-tool-worker-context-cap",
    );
    try {
      let turn = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            turn += 1;
            const toolCalls =
              turn === 1
                ? [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      input: { fileRefs: [fileRef] },
                    },
                  ]
                : turn === 2
                  ? [
                      {
                        callId: "plan-edit",
                        toolId: "worker.edit.plan",
                        input: {
                          steps: [
                            {
                              fileRef,
                              action: "replace before with after",
                              rationale: "Plan before editing.",
                            },
                          ],
                        },
                      },
                    ]
                  : [
                      {
                        callId: `context-again-${turn}`,
                        toolId: "worker.context.request_more",
                        input: {
                          requestId: `context-again-${turn}`,
                          requestedFileRefs: [extraRef],
                          reason: "Need more context instead of editing.",
                        },
                      },
                    ];
            return {
              modelRunRef: `openrouter://kimi/context-cap/${turn}`,
              responseText: JSON.stringify({ toolCalls }),
              responseHash: `sha256:context-cap-${turn}`,
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_without_patch");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-context-cap",
        graphId: "graph-tool-worker-context-cap",
        nodeId: "node-tool-worker-context-cap",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-context-cap",
        taskTitle: "Context expansion cap",
        exactEditObjective: "Do not allow repeated context requests after an edit plan.",
        repoRoot,
        allowedFileRefs: [fileRef, extraRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file context-cap-target.test.ts"],
        acceptanceCriteria: ["context expansion capped"],
        targetCommitmentIds: ["commitment-context-cap"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 4,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.contextExpansionRequests).toHaveLength(0);
      expect(result.reasonCodes).toContain(
        "worker_patch_force_author_from_plan_invoked_after_plan",
      );
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.patch.force_author_from_plan",
          "worker.progress.mark_no_edit_blocker",
        ]),
      );
      expect(result.reasonCodes).toContain("non_codex_tool_worker_changed_file_refs_missing");
    } finally {
      await database.close();
    }
  });

  it("blocks repeated generic reads after bounded snapshots before edit planning", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-tool-worker-read-cap-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/read-cap-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const readCap = 'before';\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-read-cap",
      "job-tool-worker-read-cap",
      "node-tool-worker-read-cap",
    );
    try {
      let turn = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            turn += 1;
            return {
              modelRunRef: `openrouter://kimi/read-cap/${turn}`,
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: `read-${turn}`,
                    toolId: "worker.repo.read_files",
                    input: { fileRefs: [fileRef] },
                  },
                ],
              }),
              responseHash: `sha256:read-cap-${turn}`,
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_without_patch");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-read-cap",
        graphId: "graph-tool-worker-read-cap",
        nodeId: "node-tool-worker-read-cap",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-read-cap",
        taskTitle: "Repeated read cap",
        exactEditObjective: "Do not allow repeated generic reads after snapshots.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file read-cap-target.test.ts"],
        acceptanceCriteria: ["generic reads capped"],
        targetCommitmentIds: ["commitment-read-cap"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 2,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_pre_plan_progress_guard_blocked_generic_context_turn",
      );
      expect(result.reasonCodes).toContain("non_codex_tool_worker_changed_file_refs_missing");
    } finally {
      await database.close();
    }
  });

  it("rejects edit plans that target files outside the worker scope before forced patch authoring", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-plan-scope-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/plan-scope-target.ts";
    const outsideRef = "docs/projects/execution-platform/generated-summary.md";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const planScope = 'before';\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-plan-scope",
      "job-plan-scope",
      "node-plan-scope",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            return {
              modelRunRef: `openrouter://kimi/plan-scope-${input.turn}`,
              responseText:
                input.turn === 1
                  ? JSON.stringify({
                      toolCalls: [
                        {
                          callId: "read-target",
                          toolId: "worker.repo.read_files",
                          reason: "Read the allowed target.",
                          input: { fileRefs: [fileRef] },
                        },
                      ],
                    })
                  : JSON.stringify({
                      toolCalls: [
                        {
                          callId: "bad-plan",
                          toolId: "worker.edit.plan",
                          reason: "Incorrectly plan an out-of-scope generated file.",
                          input: {
                            editPlanSteps: [
                              {
                                stepId: "step-1",
                                objective: "Create a generated summary outside the task scope.",
                                targetFileRefs: [outsideRef],
                                commitmentIdsAdvanced: ["commitment-plan-scope"],
                              },
                            ],
                          },
                        },
                      ],
                    }),
              responseHash: `sha256:plan-scope-${input.turn}`,
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_after_out_of_scope_plan");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-plan-scope",
        graphId: "graph-plan-scope",
        nodeId: "node-plan-scope",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-plan-scope",
        taskTitle: "Plan scope proof",
        exactEditObjective: "Do not allow an edit plan to expand the write scope.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["out-of-scope plan rejected"],
        targetCommitmentIds: ["commitment-plan-scope"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 2_000,
          timeoutMs: 60_000,
          maxTurns: 2,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.changedFileRefs).toEqual([]);
      expect(result.reasonCodes).toContain("worker_edit_plan_scope_validation_failed");
      expect(result.reasonCodes).toContain("worker_edit_plan_target_ref_out_of_scope");
      expect(result.toolResults.map((tool) => tool.toolId)).not.toContain(
        "worker.patch.force_author_from_plan",
      );
    } finally {
      await database.close();
    }
  });

  it("normalizes explicit model-facing file refs in edit plans and patch-author calls", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-plan-ref-normalize-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/plan-ref-normalize-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const planRefNormalize = 'before';\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-plan-ref-normalize",
      "job-plan-ref-normalize",
      "node-plan-ref-normalize",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/plan-ref-normalize-read",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read the target through a model-facing file handle.",
                      input: { fileRefs: [`file:${fileRef}#L1-L3`] },
                    },
                  ],
                }),
                responseHash: "sha256:plan-ref-normalize-read",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/plan-ref-normalize-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan a scoped edit using targetRef alias.",
                      input: {
                        planSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the exported label.",
                            targetRef: `file:${fileRef}#L1-L1`,
                            validationExpectation: "Structural validation passes.",
                            commitmentIdsAdvanced: ["commitment-plan-ref-normalize"],
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:plan-ref-normalize-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/plan-ref-normalize-patch",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "author-edit",
                    toolId: "worker.patch.author_edit",
                    reason: "Author one edit from the normalized plan.",
                    input: {
                      path: `file:${fileRef}#L1-L1`,
                      operation: "replace_text",
                      targetText: "'before'",
                      replacement: "'after'",
                      rationale: "Apply the scoped implementation edit.",
                    },
                  },
                ],
              }),
              responseHash: "sha256:plan-ref-normalize-patch",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            return {
              validationRef: "validation://plan-ref-normalize/passed",
              status: fileBody.includes("'after'") ? "passed" : "failed",
              summary: "normalized ref edit validation",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-plan-ref-normalize",
        graphId: "graph-plan-ref-normalize",
        nodeId: "node-plan-ref-normalize",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-plan-ref-normalize",
        taskTitle: "Plan ref normalization proof",
        exactEditObjective: "Normalize explicit file handles without semantic inference.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["normalized file refs accepted"],
        targetCommitmentIds: ["commitment-plan-ref-normalize"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://plan-ref-normalize/passed"]);
      expect(result.reasonCodes).toContain(
        "worker_patch_force_author_from_plan_invoked_after_plan",
      );
      expect(result.reasonCodes).not.toContain("worker_edit_plan_target_refs_missing");
    } finally {
      await database.close();
    }
  });

  it("defaults targetless edit plans only when the execution packet has one target file", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-plan-single-target-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/plan-single-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const planSingleTarget = 'before';\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-plan-single-target",
      "job-plan-single-target",
      "node-plan-single-target",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/plan-single-target-read",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      input: { fileRefs: [fileRef] },
                    },
                  ],
                }),
                responseHash: "sha256:plan-single-target-read",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/plan-single-target-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan the sole-target edit without repeating the target ref.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the exported label.",
                            validationExpectation: "Structural validation passes.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:plan-single-target-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/plan-single-target-patch",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "author-edit",
                    toolId: "worker.patch.author_edit",
                    input: {
                      path: fileRef,
                      operation: "replace_text",
                      targetText: "'before'",
                      replacement: "'after'",
                      rationale: "Apply the scoped implementation edit.",
                    },
                  },
                ],
              }),
              responseHash: "sha256:plan-single-target-patch",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            return {
              validationRef: "validation://plan-single-target/passed",
              status: fileBody.includes("'after'") ? "passed" : "failed",
              summary: "single target default validation",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-plan-single-target",
        graphId: "graph-plan-single-target",
        nodeId: "node-plan-single-target",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-plan-single-target",
        taskTitle: "Single target plan default proof",
        exactEditObjective: "Use the sole hydrated target when the edit plan omits a target ref.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["sole-target default accepted"],
        targetCommitmentIds: ["commitment-plan-single-target"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.reasonCodes).toContain(
        "worker_edit_plan_single_target_ref_defaulted_from_execution_packet",
      );
    } finally {
      await database.close();
    }
  });

  it("refreshes truncated prior snapshots before forced patch authoring", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-forced-snapshot-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/forced-snapshot-target.ts";
    const lines = Array.from({ length: 320 }, (_, index) =>
      index === 299
        ? "export const forcedSnapshotMarker = 'before';"
        : `export const forcedSnapshotLine${index + 1} = ${index + 1};`,
    );
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), `${lines.join("\n")}\n`, "utf8");
    const { database, kernel } = await createRuntime(
      "graph-forced-snapshot",
      "job-forced-snapshot",
      "node-forced-snapshot",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/forced-snapshot-read",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      input: { fileRefs: [fileRef] },
                    },
                  ],
                }),
                responseHash: "sha256:forced-snapshot-read",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/forced-snapshot-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the line 300 marker.",
                            targetFileRefs: [fileRef],
                            targetRegions: [{ startLine: 300, endLine: 300 }],
                            validationExpectation: "Structural validation passes.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:forced-snapshot-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            expect(input.taskSummary).toContain(" 300| export const forcedSnapshotMarker");
            return {
              modelRunRef: "openrouter://kimi/forced-snapshot-patch",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "author-edit",
                    toolId: "worker.patch.author_edit",
                    input: {
                      path: fileRef,
                      operation: "replace_text",
                      targetText: "export const forcedSnapshotMarker = 'before';",
                      replacement: "export const forcedSnapshotMarker = 'after';",
                      rationale: "Apply the edit using the refreshed one-file snapshot.",
                    },
                  },
                ],
              }),
              responseHash: "sha256:forced-snapshot-patch",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            return {
              validationRef: "validation://forced-snapshot/passed",
              status: fileBody.includes("'after'") ? "passed" : "failed",
              summary: "forced snapshot validation",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-forced-snapshot",
        graphId: "graph-forced-snapshot",
        nodeId: "node-forced-snapshot",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-forced-snapshot",
        taskTitle: "Forced snapshot refresh proof",
        exactEditObjective:
          "Refresh truncated bounded context before asking the forced patch-author lane to edit.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["truncated snapshot refreshed"],
        targetCommitmentIds: ["commitment-forced-snapshot"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://forced-snapshot/passed"]);
    } finally {
      await database.close();
    }
  });

  it("hydrates multiple distant target windows before forced patch authoring", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-forced-windows-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/forced-window-target.ts";
    const lines = Array.from({ length: 1_000 }, (_, index) => {
      if (index === 299) {
        return "export const forcedWindowMarkerA = 'before-a';";
      }
      if (index === 849) {
        return "export const forcedWindowMarkerB = 'before-b';";
      }
      return `export const forcedWindowLine${index + 1} = ${index + 1};`;
    });
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), `${lines.join("\n")}\n`, "utf8");
    const { database, kernel } = await createRuntime(
      "graph-forced-windows",
      "job-forced-windows",
      "node-forced-windows",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/forced-windows-read",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      input: { fileRefs: [fileRef] },
                    },
                  ],
                }),
                responseHash: "sha256:forced-windows-read",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/forced-windows-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change both distant marker declarations.",
                            targetFileRefs: [fileRef],
                            targetRegions: [
                              { startLine: 300, endLine: 300 },
                              { startLine: 850, endLine: 850 },
                            ],
                            validationExpectation: "Structural validation passes.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:forced-windows-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            expect(input.taskSummary).toContain("windowCount=2");
            expect(input.taskSummary).toContain("--- window-1: lines");
            expect(input.taskSummary).toContain("--- window-2: lines");
            expect(input.taskSummary).toContain(" 300| export const forcedWindowMarkerA");
            expect(input.taskSummary).toContain(" 850| export const forcedWindowMarkerB");
            return {
              modelRunRef: "openrouter://kimi/forced-windows-patch",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "author-edit",
                    toolId: "worker.patch.author_edit",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "export const forcedWindowMarkerA = 'before-a';",
                          newText: "export const forcedWindowMarkerA = 'after-a';",
                          rationale: "Apply the first distant window edit.",
                        },
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "export const forcedWindowMarkerB = 'before-b';",
                          newText: "export const forcedWindowMarkerB = 'after-b';",
                          rationale: "Apply the second distant window edit.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:forced-windows-patch",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            return {
              validationRef: "validation://forced-windows/passed",
              status:
                fileBody.includes("'after-a'") && fileBody.includes("'after-b'")
                  ? "passed"
                  : "failed",
              summary: "forced multi-window validation",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-forced-windows",
        graphId: "graph-forced-windows",
        nodeId: "node-forced-windows",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-forced-windows",
        taskTitle: "Forced multi-window proof",
        exactEditObjective:
          "Hydrate multiple distant bounded windows before asking the forced patch-author lane to edit.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["distant windows hydrated"],
        targetCommitmentIds: ["commitment-forced-windows"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://forced-windows/passed"]);
    } finally {
      await database.close();
    }
  });

  it("repairs malformed post-validation tool-call output without discarding completed edits", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-tool-worker-repair-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/tool-loop-repair-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/tool-loop-repair-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function repairedToolLoopLabel() {\n  return 'before';\n}\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "import { expect, it } from 'vitest';\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-repair",
      "job-tool-worker-repair",
      "node-tool-worker-repair",
    );
    try {
      let turn = 0;
      let repairPromptSeen = false;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            turn += 1;
            if (turn === 1) {
              return {
                modelRunRef: "openrouter://kimi/initial-edit",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read the target before editing.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan the scoped edit.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the helper return value.",
                            targetFileRefs: [fileRef],
                            validationExpectation: "Focused validation passes.",
                            commitmentIdsAdvanced: ["commitment-tool-worker-repair"],
                          },
                        ],
                      },
                    },
                    {
                      callId: "apply-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Apply a runtime-owned replace_text edit.",
                      input: {
                        fileEdits: [
                          {
                            path: fileRef,
                            operation: "replace_text",
                            oldText: "return 'before';",
                            newText: "return 'after';",
                            rationale: "Apply the scoped implementation edit.",
                          },
                        ],
                      },
                    },
                    {
                      callId: "run-validation",
                      toolId: "worker.validation.run",
                      reason: "Run approved validation refs.",
                      input: { commandRefs: ["pnpm test:file tool-loop-repair-target.test.ts"] },
                    },
                  ],
                }),
                responseHash: "sha256:initial-edit",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/malformed-post-validation",
                responseText: "The validation passed, so I would now claim evidence.",
                responseHash: "sha256:malformed-post-validation",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            repairPromptSeen = input.taskSummary.includes("Previous model response repair notes");
            return {
              modelRunRef: "openrouter://kimi/repaired-evidence",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "claim-evidence",
                    toolId: "worker.evidence.claim",
                    reason: "Claim commitment evidence after validation.",
                    input: {
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-tool-worker-repair",
                          claimSummary: "The tool worker edited the target and validation passed.",
                          changedFileRefs: [fileRef],
                          validationRefs: ["validation://tool-loop-repair-target/1"],
                          confidence: "high",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:repaired-evidence",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://tool-loop-repair-target/1",
              status: "passed",
              summary: "bounded validation pass",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-repair",
        graphId: "graph-tool-worker-repair",
        nodeId: "node-tool-worker-repair",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-tool-worker-repair",
        taskTitle: "Tool worker malformed response repair",
        exactEditObjective:
          "Use tools to edit, validate, repair malformed response output, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file tool-loop-repair-target.test.ts"],
        acceptanceCriteria: ["source edit applied", "validation passed", "evidence claimed"],
        targetCommitmentIds: ["commitment-tool-worker-repair"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(turn).toBe(3);
      expect(repairPromptSeen).toBe(true);
      expect(result.reasonCodes).toContain("non_codex_tool_loop_model_tool_json_invalid");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://tool-loop-repair-target/1"]);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-tool-worker-repair");
    } finally {
      await database.close();
    }
  });

  it("treats validation failure as repaired when the same worker loop explains and reruns validation", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-tool-worker-validation-"),
    );
    const fileRef = "extensions/execution-platform/src/codex-bridge/tool-loop-validation-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/tool-loop-validation-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function validationRepairLabel() {\n  return 'before';\n}\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "import { expect, it } from 'vitest';\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-tool-worker-validation",
      "job-tool-worker-validation",
      "node-tool-worker-validation",
    );
    try {
      let turn = 0;
      let validationCalls = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            turn += 1;
            if (turn === 1) {
              return {
                modelRunRef: "openrouter://kimi/validation-initial",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read the target before editing.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                    {
                      callId: "apply-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Apply a runtime-owned replace_text edit.",
                      input: {
                        fileEdits: [
                          {
                            path: fileRef,
                            operation: "replace_text",
                            oldText: "return 'before';",
                            newText: "return 'after';",
                            rationale: "Apply the scoped implementation edit.",
                          },
                        ],
                      },
                    },
                    {
                      callId: "run-validation",
                      toolId: "worker.validation.run",
                      reason: "Run approved validation refs.",
                      input: {
                        commandRefs: ["pnpm test:file tool-loop-validation-target.test.ts"],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:validation-initial",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (turn === 2) {
              expect(input.taskSummary).toContain("A validation run needs review");
              return {
                modelRunRef: "openrouter://kimi/validation-repair",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "explain-validation",
                      toolId: "worker.validation.explain_failure",
                      reason: "Classify the controlled validation failure.",
                      input: {
                        summary: "The first validation was a controlled transient failure.",
                        commitmentIds: ["commitment-tool-worker-validation"],
                      },
                    },
                    {
                      callId: "rerun-validation",
                      toolId: "worker.validation.run",
                      reason: "Rerun approved validation after classifying the transient failure.",
                      input: {
                        commandRefs: ["pnpm test:file tool-loop-validation-target.test.ts"],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:validation-repair",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/validation-evidence",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "claim-evidence",
                    toolId: "worker.evidence.claim",
                    reason: "Claim commitment evidence after repaired validation passed.",
                    input: {
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-tool-worker-validation",
                          claimSummary:
                            "The worker edited the target and validation passed after repair.",
                          changedFileRefs: [fileRef],
                          validationRefs: ["validation://tool-loop-validation-target/2"],
                          confidence: "high",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:validation-evidence",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            return {
              validationRef: `validation://tool-loop-validation-target/${validationCalls}`,
              status: validationCalls === 1 ? "failed" : "passed",
              summary:
                validationCalls === 1 ? "controlled validation failure" : "bounded validation pass",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-tool-worker-validation",
        graphId: "graph-tool-worker-validation",
        nodeId: "node-tool-worker-validation",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-tool-worker-validation",
        taskTitle: "Tool worker validation repair",
        exactEditObjective:
          "Use tools to edit, handle validation failure, rerun, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file tool-loop-validation-target.test.ts"],
        acceptanceCriteria: ["source edit applied", "validation repaired", "evidence claimed"],
        targetCommitmentIds: ["commitment-tool-worker-validation"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.validationRefs).toEqual(["validation://tool-loop-validation-target/2"]);
      expect(result.reasonCodes).toContain("worker_validation_run_failed");
      expect(result.reasonCodes).toContain("worker_validation_run_completed");
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining(["worker.validation.run", "worker.evidence.claim_from_validation"]),
      );
    } finally {
      await database.close();
    }
  });

  it("derives focused validation commands from scoped test refs when packets omit validation refs", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-derived-validation-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/derived-validation-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/derived-validation-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const derivedValidationLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-derived-validation",
      "job-derived-validation",
      "node-derived-validation",
    );
    try {
      const validationCommandRefs: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/derived-validation",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a scoped edit and let runtime own validation.",
                    input: {
                      edits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "before",
                          newText: "after",
                          reason: "Change bounded fixture label.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:derived-validation",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run(commandRef) {
            validationCommandRefs.push(commandRef);
            return {
              validationRef: "validation://derived-validation/passed",
              status: "passed",
              summary: "derived validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-derived-validation",
        graphId: "graph-derived-validation",
        nodeId: "node-derived-validation",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-derived-validation",
        taskTitle: "Derived validation proof",
        exactEditObjective: "Apply a scoped edit and validate with runtime-derived test refs.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "runtime validation derived"],
        targetCommitmentIds: ["commitment-derived-validation"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      if (result.status !== "completed") {
        throw new Error(
          JSON.stringify(
            {
              reasonCodes: result.reasonCodes,
              limitations: result.limitations,
              validationCommandRefs,
              toolResults: result.toolResults.map((tool) => ({
                toolId: tool.toolId,
                status: tool.status,
                summary: tool.summary,
                reasonCodes: tool.reasonCodes,
              })),
            },
            null,
            2,
          ),
        );
      }
      expect(result.status).toBe("completed");
      expect(validationCommandRefs).toEqual([`pnpm test:file ${testRef}`]);
      expect(result.reasonCodes).toContain("non_codex_worker_runtime_auto_validation_after_patch");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_runtime_evidence_packet_after_validation",
      );
      expect(result.validationRefs).toEqual(["validation://derived-validation/passed"]);
    } finally {
      await database.close();
    }
  });

  it("derives sibling validation from repo-safe target refs without expanding edit scope", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-target-sibling-validation-"),
    );
    const fileRef = "extensions/execution-platform/src/codex-bridge/target-sibling-validation.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/target-sibling-validation.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const targetSiblingValidationLabel = 'before';\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, testRef),
      "it('has sibling validation', () => {});\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-target-sibling-validation",
      "job-target-sibling-validation",
      "node-target-sibling-validation",
    );
    try {
      let modelCallCount = 0;
      const validationCommandRefs: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCallCount += 1;
            if (modelCallCount > 1) {
              throw new Error("runtime_should_exit_to_validation_without_an_extra_model_turn");
            }
            return {
              modelRunRef: "openrouter://kimi/target-sibling-validation",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason:
                      "Apply a scoped edit and let runtime derive sibling validation from the target ref.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'after'",
                          rationale: "Change bounded fixture label.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:target-sibling-validation",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run(commandRef) {
            validationCommandRefs.push(commandRef);
            return {
              validationRef: "validation://target-sibling-validation/passed",
              status: "passed",
              summary: "target sibling validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-target-sibling-validation",
        graphId: "graph-target-sibling-validation",
        nodeId: "node-target-sibling-validation",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-target-sibling-validation",
        taskTitle: "Target sibling validation proof",
        exactEditObjective:
          "Apply a scoped edit and validate via repo-safe sibling test derivation.",
        repoRoot,
        allowedFileRefs: [fileRef],
        targetFileRefs: [fileRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: [
          "source edit applied",
          "runtime validation derived from target sibling",
        ],
        targetCommitmentIds: ["commitment-target-sibling-validation"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 5,
        },
      });

      expect(result.status).toBe("completed");
      expect(modelCallCount).toBe(1);
      expect(validationCommandRefs).toEqual([`pnpm test:file ${testRef}`]);
      expect(result.reasonCodes).toContain(
        "non_codex_worker_post_patch_exit_to_runtime_validation",
      );
      expect(result.reasonCodes).toContain("non_codex_worker_runtime_auto_validation_after_patch");
      expect(result.validationRefs).toEqual(["validation://target-sibling-validation/passed"]);
    } finally {
      await database.close();
    }
  });

  it("grounds empty repo read requests from prior repo search results", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-grounded-read-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/grounded-read-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/grounded-read-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const groundedReadLabel = 'before'; // groundedReadNeedle\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-grounded-read",
      "job-grounded-read",
      "node-grounded-read",
    );
    try {
      let turn = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            turn += 1;
            if (turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/grounded-read-context",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "search-target",
                      toolId: "worker.repo.search",
                      reason: "Find the target symbol.",
                      input: { query: "groundedReadNeedle" },
                    },
                    {
                      callId: "read-bad-target",
                      toolId: "worker.repo.read_files",
                      reason:
                        "Accidentally request a directory; runtime should ground this from search results.",
                      input: { fileRefs: ["extensions/execution-platform/src/codex-bridge/"] },
                    },
                  ],
                }),
                responseHash: "sha256:grounded-read-context",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/grounded-read-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a scoped edit after runtime-grounded read.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'after'",
                          rationale: "Update the label.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:grounded-read-edit",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://grounded-read/passed",
              status: "passed",
              summary: "grounded read validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-grounded-read",
        graphId: "graph-grounded-read",
        nodeId: "node-grounded-read",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-grounded-read",
        taskTitle: "Grounded read proof",
        exactEditObjective:
          "Use repo search, recover a bad read_files request from search refs, edit, validate, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["runtime grounded bad read request", "source edit applied"],
        targetCommitmentIds: ["commitment-grounded-read"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 2,
        },
      });

      expect(result.status).toBe("completed");
      const readResult = result.toolResults.find(
        (tool) => tool.toolId === "worker.repo.read_files",
      );
      expect(readResult?.status).toBe("succeeded");
      expect(JSON.stringify(readResult?.metadata)).toContain(fileRef);
      expect(result.changedFileRefs).toEqual([fileRef]);
    } finally {
      await database.close();
    }
  });

  it("repairs runtime-owned auto-validation failures before returning needs_review", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-auto-validation-repair-"),
    );
    const fileRef =
      "extensions/execution-platform/src/codex-bridge/auto-validation-repair-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/auto-validation-repair-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const autoValidationRepairLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-auto-validation-repair",
      "job-auto-validation-repair",
      "node-auto-validation-repair",
    );
    try {
      let validationCalls = 0;
      const seenModelSlots: string[] = [];
      const repairTaskSummaries: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            seenModelSlots.push(input.modelSlot);
            if (input.modelSlot === "validation_repair") {
              repairTaskSummaries.push(input.taskSummary);
              expect(input.taskSummary).toContain(
                "Runtime-owned validation failed after source edits.",
              );
              expect(input.taskSummary).toContain("failedValidation=");
              return {
                modelRunRef: "openrouter://qwen/auto-validation-repair",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "explain-validation",
                      toolId: "worker.validation.explain_failure",
                      reason: "Classify the failed runtime-owned validation.",
                      input: {
                        summary: "The first edit set the label to an invalid value.",
                        commitmentIds: ["commitment-auto-validation-repair"],
                      },
                    },
                    {
                      callId: "repair-edit",
                      toolId: "worker.repair.author_edit",
                      reason: "Repair the failed validation with a bounded semantic edit body.",
                      input: {
                        path: fileRef,
                        operation: "replace_text",
                        targetText: "'bad'",
                        replacement: "'after'",
                        rationale: "Set the label to the validated value.",
                      },
                    },
                  ],
                }),
                responseHash: "sha256:auto-validation-repair",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/auto-validation-initial",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a scoped edit and let runtime own validation.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'bad'",
                          rationale: "Apply an intentionally failing first edit.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:auto-validation-initial",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            return {
              validationRef: `validation://auto-validation-repair/${validationCalls}`,
              status: validationCalls === 1 ? "failed" : "passed",
              summary: validationCalls === 1 ? "label was bad" : "label passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-auto-validation-repair",
        graphId: "graph-auto-validation-repair",
        nodeId: "node-auto-validation-repair",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-auto-validation-repair",
        taskTitle: "Auto validation repair proof",
        exactEditObjective:
          "Apply a scoped edit, let runtime validation fail once, repair in the same worker loop, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "auto validation repaired"],
        targetCommitmentIds: ["commitment-auto-validation-repair"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(seenModelSlots).toContain("validation_repair");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_validation_failed_repair_turn_started",
      );
      expect(result.reasonCodes).toContain(
        "non_codex_worker_validation_failure_context_auto_prepared",
      );
      expect(result.reasonCodes).toContain("worker_repair_author_edit_compiled_to_runtime_patch");
      expect(result.reasonCodes).toContain("non_codex_worker_repair_classification_recorded");
      expect(result.repairClassificationRefs.length).toBeGreaterThan(0);
      expect(
        result.repairClassifications.some(
          (item) => item.failureClass === "validation_failure_repairable",
        ),
      ).toBe(true);
      expect(result.reasonCodes).toContain("non_codex_worker_runtime_auto_validation_after_repair");
      expect(result.validationRefs).toEqual(["validation://auto-validation-repair/2"]);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-auto-validation-repair");
      expect(repairTaskSummaries[0]).toContain("worker.validation.get_failure_context");
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.validation.get_failure_context",
          "worker.repair.author_edit",
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("runs safe diff validation when edited files have no targeted test command", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-diff-validation-"));
    const fileRef = "docs/projects/execution-platform/non-codex-diff-validation.md";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "Before\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-diff-validation",
      "job-diff-validation",
      "node-diff-validation",
    );
    try {
      const validationCommands: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/diff-validation",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-doc-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a docs-only edit and let runtime choose structural validation.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "Before",
                          newText: "After",
                          rationale: "Exercise diff validation fallback.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:diff-validation",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run(commandRef) {
            validationCommands.push(commandRef);
            return {
              validationRef: "validation://diff-validation/passed",
              status: commandRef.startsWith(`git diff --check -- ${fileRef}`)
                ? "passed"
                : "not_run",
              summary: "diff check validation",
              commandRef,
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-diff-validation",
        graphId: "graph-diff-validation",
        nodeId: "node-diff-validation",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-diff-validation",
        taskTitle: "Diff validation proof",
        exactEditObjective:
          "Apply a docs-only edit and validate it with runtime-owned diff hygiene.",
        repoRoot,
        allowedFileRefs: ["docs/projects/execution-platform/"],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context://diff-validation"],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "diff validation passed"],
        targetCommitmentIds: ["commitment-diff-validation"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(validationCommands).toEqual([`git diff --check -- ${fileRef}`]);
      expect(result.reasonCodes).toContain("non_codex_worker_runtime_auto_validation_after_patch");
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.validation.run_structural_default",
          "worker.evidence.claim_from_validation",
        ]),
      );
      expect(result.validationRefs).toEqual(["validation://diff-validation/passed"]);
    } finally {
      await database.close();
    }
  });

  it("does not rerun failed runtime validation until validation repair applies a new edit", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-validation-edit-gate-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/validation-edit-gate-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/validation-edit-gate-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const validationEditGateLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-validation-edit-gate",
      "job-validation-edit-gate",
      "node-validation-edit-gate",
    );
    try {
      let validationCalls = 0;
      const repairTaskSummaries: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.modelSlot === "validation_repair") {
              repairTaskSummaries.push(input.taskSummary);
              if (repairTaskSummaries.length === 1) {
                return {
                  modelRunRef: "openrouter://qwen/validation-edit-gate-explain",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "explain-validation",
                        toolId: "worker.validation.explain_failure",
                        reason: "Explain the failing validation before editing.",
                        input: {
                          summary: "The label is still bad and needs a source repair.",
                          commitmentIds: ["commitment-validation-edit-gate"],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:validation-edit-gate-explain",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              expect(input.taskSummary).toContain("did not apply a repair edit");
              return {
                modelRunRef: "openrouter://qwen/validation-edit-gate-repair",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "repair-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Apply the bounded validation repair.",
                      input: {
                        fileEdits: [
                          {
                            path: fileRef,
                            operation: "replace_text",
                            oldText: "'bad'",
                            newText: "'after'",
                            rationale: "Set the label to the expected value.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:validation-edit-gate-repair",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/validation-edit-gate-initial",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply an edit that runtime validation will reject.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'bad'",
                          rationale: "Create a controlled validation failure.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:validation-edit-gate-initial",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            const passed = fileBody.includes("'after'");
            return {
              validationRef: `validation://validation-edit-gate/${validationCalls}`,
              status: passed ? "passed" : "failed",
              summary: passed ? "label passed" : "label was not repaired",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-validation-edit-gate",
        graphId: "graph-validation-edit-gate",
        nodeId: "node-validation-edit-gate",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-validation-edit-gate",
        taskTitle: "Validation edit gate proof",
        exactEditObjective:
          "Apply a scoped edit, require real repair after validation failure, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "repair edit required before validation rerun"],
        targetCommitmentIds: ["commitment-validation-edit-gate"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(validationCalls).toBe(2);
      expect(repairTaskSummaries).toHaveLength(2);
      expect(result.reasonCodes).toContain("non_codex_worker_validation_repair_action_missing");
      expect(result.reasonCodes).toContain("non_codex_worker_runtime_auto_validation_after_repair");
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining(["worker.edit.apply_patch", "worker.validation.run"]),
      );
      expect(result.validationRefs).toEqual(["validation://validation-edit-gate/2"]);
    } finally {
      await database.close();
    }
  });

  it("refreshes current file snapshots before retrying stale validation repair patches", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-stale-repair-refresh-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/stale-repair-refresh-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/stale-repair-refresh-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const staleRepairRefreshLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-stale-repair-refresh",
      "job-stale-repair-refresh",
      "node-stale-repair-refresh",
    );
    try {
      let validationCalls = 0;
      let repairTurns = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.modelSlot === "validation_repair") {
              repairTurns += 1;
              if (repairTurns === 1) {
                return {
                  modelRunRef: "openrouter://qwen/stale-repair-first",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "stale-repair-edit",
                        toolId: "worker.edit.apply_patch",
                        reason: "This patch is stale and must trigger a runtime freshness read.",
                        input: {
                          fileEdits: [
                            {
                              path: fileRef,
                              operation: "replace_text",
                              oldText: "'missing'",
                              newText: "'after'",
                              rationale: "Stale validation repair proposal.",
                            },
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:stale-repair-first",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              expect(input.taskSummary).toContain("line-numbered");
              expect(input.taskSummary).toContain("staleRepairRefreshLabel");
              return {
                modelRunRef: "openrouter://qwen/stale-repair-second",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "fresh-repair-edit",
                      toolId: "worker.edit.apply_patch",
                      reason: "Repair from the current snapshot after runtime freshness refresh.",
                      input: {
                        fileEdits: [
                          {
                            path: fileRef,
                            operation: "replace_text",
                            oldText: "'bad'",
                            newText: "'after'",
                            rationale: "Use the current file state after the freshness read.",
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:stale-repair-second",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/stale-repair-initial",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "initial-bad-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply an edit that validation will reject.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'bad'",
                          rationale: "Create a controlled validation failure.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:stale-repair-initial",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            validationCalls += 1;
            const fileBody = await readFile(path.join(repoRoot, fileRef), "utf8");
            const passed = fileBody.includes("'after'");
            return {
              validationRef: `validation://stale-repair-refresh/${validationCalls}`,
              status: passed ? "passed" : "failed",
              summary: passed ? "label passed" : "label was not repaired",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-stale-repair-refresh",
        graphId: "graph-stale-repair-refresh",
        nodeId: "node-stale-repair-refresh",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-stale-repair-refresh",
        taskTitle: "Stale validation repair refresh proof",
        exactEditObjective:
          "Apply a scoped edit, require validation repair, refresh stale patch context, and complete.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "stale validation repair refresh happened"],
        targetCommitmentIds: ["commitment-stale-repair-refresh"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(validationCalls).toBe(2);
      expect(result.reasonCodes).toContain("worker_repo_read_files_patch_freshness_refresh");
      expect(result.reasonCodes).toContain(
        `worker_edit_apply_patch_failure:replace_text_occurrence_count_0:${fileRef}`,
      );
      expect(result.validationRefs).toEqual(["validation://stale-repair-refresh/2"]);
    } finally {
      await database.close();
    }
  });

  it("repairs invalid patch-model JSON through the forced patch-author boundary", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-patch-json-repair-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/patch-json-repair-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/patch-json-repair-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const patchJsonRepairLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-patch-json-repair",
      "job-patch-json-repair",
      "node-patch-json-repair",
    );
    try {
      const seenSlots: string[] = [];
      let patchTurnCount = 0;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            seenSlots.push(input.modelSlot);
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/patch-json-context",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read the target.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                  ],
                }),
                responseHash: "sha256:patch-json-context",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.modelSlot === "patch") {
              patchTurnCount += 1;
              if (patchTurnCount === 2) {
                return {
                  modelRunRef: "openrouter://kimi/patch-json-plan-repair",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "plan-edit",
                        toolId: "worker.edit.plan",
                        reason: "Plan the edit after invalid patch-lane JSON.",
                        input: {
                          editPlanSteps: [
                            {
                              stepId: "step-1",
                              objective: "Change the label.",
                              targetFileRefs: [fileRef],
                              validationExpectation: "Focused validation passes.",
                              commitmentIdsAdvanced: ["commitment-patch-json-repair"],
                            },
                          ],
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:patch-json-plan-repair",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              if (patchTurnCount > 2) {
                return {
                  modelRunRef: "openrouter://kimi/patch-json-patch-repair",
                  responseText: JSON.stringify({
                    toolCalls: [
                      {
                        callId: "apply-edit",
                        toolId: "worker.patch.author_edit",
                        reason:
                          "Patch lane repairs invalid patch-model JSON with the forced author tool.",
                        input: {
                          path: fileRef,
                          operation: "replace_text",
                          targetText: "'before'",
                          replacement: "'after'",
                          rationale: "Apply the scoped implementation edit.",
                        },
                      },
                    ],
                  }),
                  responseHash: "sha256:patch-json-patch-repair",
                  latencyMs: 5,
                  rawPromptStored: false,
                  rawResponseStored: false,
                };
              }
              return {
                modelRunRef: "openrouter://kimi/patch-json-invalid",
                responseText: "I would apply the edit now.",
                responseHash: "sha256:patch-json-invalid",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            throw new Error(`unexpected_model_slot:${input.modelSlot}`);
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://patch-json-repair/passed",
              status: "passed",
              summary: "patch JSON repair validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-patch-json-repair",
        graphId: "graph-patch-json-repair",
        nodeId: "node-patch-json-repair",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-patch-json-repair",
        taskTitle: "Patch JSON repair proof",
        exactEditObjective:
          "Recover from invalid patch-model JSON and still complete a scoped edit.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-patch-json-repair"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 4,
        },
      });

      expect(result.status).toBe("completed");
      expect(seenSlots).toEqual(["context_decision", "patch", "patch", "patch"]);
      expect(result.reasonCodes).toContain("non_codex_worker_patch_json_invalid_patch_repair_next");
      expect(result.reasonCodes).toContain(
        "worker_patch_force_author_from_plan_invoked_after_plan",
      );
      expect(result.reasonCodes).toContain("worker_patch_author_edit_compiled_to_runtime_patch");
      expect(result.validationRefs).toEqual(["validation://patch-json-repair/passed"]);
    } finally {
      await database.close();
    }
  });

  it("routes patch-lane context tool requests through controller before resuming patching", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-patch-context-handoff-"),
    );
    const fileRef =
      "extensions/execution-platform/src/codex-bridge/patch-context-handoff-target.ts";
    const extraRef =
      "extensions/execution-platform/src/codex-bridge/patch-context-handoff-extra.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const patchContextHandoff = 'before';\n",
      "utf8",
    );
    await writeFile(
      path.join(repoRoot, extraRef),
      "export const patchContextExtra = true;\n",
      "utf8",
    );
    const { database, kernel } = await createRuntime(
      "graph-patch-context-handoff",
      "job-patch-context-handoff",
      "node-patch-context-handoff",
    );
    try {
      const seenSlots: string[] = [];
      const seenPhases: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        phaseSink(event) {
          seenPhases.push(event.phase);
        },
        modelClient: {
          async nextTurn(input) {
            seenSlots.push(input.modelSlot);
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/patch-context-first",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read the initial target before patching.",
                      input: { fileRefs: [fileRef] },
                    },
                  ],
                }),
                responseHash: "sha256:patch-context-first",
                latencyMs: 5,
                usage: {
                  inputTokenCount: 10,
                  outputTokenCount: 5,
                  totalTokenCount: 15,
                  estimatedCostUsd: 0.001,
                },
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (
              input.modelSlot === "patch" &&
              !input.toolResultSummaries.some((summary) => summary.includes(extraRef))
            ) {
              return {
                modelRunRef: "openrouter://kimi/patch-context-request",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-extra-from-patch",
                      toolId: "worker.repo.read_files",
                      reason: "Need one more bounded context file before editing.",
                      input: { fileRefs: [extraRef] },
                    },
                  ],
                }),
                responseHash: "sha256:patch-context-request",
                latencyMs: 5,
                usage: {
                  inputTokenCount: 20,
                  outputTokenCount: 8,
                  totalTokenCount: 28,
                  estimatedCostUsd: 0.002,
                },
                providerResponseDiagnostics: {
                  modelCallSpanId: "kimi-context-request",
                  finishReason: "stop",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            expect(input.modelSlot).toBe("patch");
            expect(input.toolResultSummaries.some((summary) => summary.includes(extraRef))).toBe(
              true,
            );
            return {
              modelRunRef: "openrouter://kimi/patch-context-apply",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-after-context",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply the scoped edit after controller replayed the context request.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "'before'",
                          newText: "'after'",
                          rationale: "Patch after bounded context handoff.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:patch-context-apply",
              latencyMs: 5,
              usage: {
                inputTokenCount: 22,
                outputTokenCount: 12,
                totalTokenCount: 34,
                estimatedCostUsd: 0.003,
              },
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://patch-context-handoff/passed",
              status: "passed",
              summary: "patch context handoff validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-patch-context-handoff",
        graphId: "graph-patch-context-handoff",
        nodeId: "node-patch-context-handoff",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-patch-context-handoff",
        taskTitle: "Patch context handoff",
        exactEditObjective:
          "Route patch-lane context requests through controller before applying the edit.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context-synthesis://patch-context-handoff"],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied after context handoff"],
        targetCommitmentIds: ["commitment-patch-context-handoff"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 4,
          phaseAuthorityMode: "strict",
        },
      });

      expect(seenSlots.slice(0, 3)).toEqual(["context_decision", "patch", "patch"]);
      expect(seenSlots).not.toContain("escalation");
      expect(seenPhases).toContain("worker.phase_queue.routed_subturn");
      expect(seenPhases).not.toContain("worker.phase_queue.replayed");
      expect(result.changedFileRefs).toContain(fileRef);
      expect(result.reasonCodes).toContain(
        "non_codex_worker_patch_context_request_routed_to_runtime_subturn",
      );
      expect(result.reasonCodes).toContain(
        "non_codex_worker_patch_context_subturn_no_extra_model_turn",
      );
      expect(result.reasonCodes).not.toContain(
        "worker_phase_authority_blocked:patch:context:worker.repo.read_files",
      );
    } finally {
      await database.close();
    }
  });

  it("accepts a bare patch-author body after an edit plan and applies it through runtime", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-bare-patch-author-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/bare-patch-author-target.ts";
    const testRef =
      "extensions/execution-platform/src/codex-bridge/bare-patch-author-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const barePatchLabel = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-bare-patch-author",
      "job-bare-patch-author",
      "node-bare-patch-author",
    );
    try {
      const seenTools: string[] = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/bare-patch-context",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read target and test.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                  ],
                }),
                responseHash: "sha256:bare-patch-context",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/bare-patch-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan a narrow label edit.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the exported label.",
                            targetFileRefs: [fileRef],
                            validationExpectation: "Focused validation passes.",
                            commitmentIdsAdvanced: ["commitment-bare-patch-author"],
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:bare-patch-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/bare-patch-author",
              responseText: JSON.stringify({
                path: fileRef,
                operation: "replace_text",
                targetText: "'before'",
                replacement: "'after'",
                rationale: "Apply the planned semantic edit without a generic tool envelope.",
              }),
              responseHash: "sha256:bare-patch-author",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://bare-patch-author/passed",
              status: "passed",
              summary: "bare patch author validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-bare-patch-author",
        graphId: "graph-bare-patch-author",
        nodeId: "node-bare-patch-author",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-bare-patch-author",
        taskTitle: "Bare patch-author proof",
        exactEditObjective: "Apply a scoped edit from a bare patch-author response after a plan.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-bare-patch-author"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });
      seenTools.push(...result.toolCalls.map((call) => call.toolId));

      expect(result.status).toBe("completed");
      expect(seenTools).toContain("worker.patch.author_edit");
      expect(result.reasonCodes).toContain("worker_patch_author_edit_compiled_to_runtime_patch");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain("'after'");
    } finally {
      await database.close();
    }
  });

  it("applies a model-authored patch body from the accepted single-target plan", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-apply-from-plan-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/apply-from-plan-target.ts";
    const testRef = "extensions/execution-platform/src/codex-bridge/apply-from-plan-target.test.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export const applyFromPlan = 'before';\n",
      "utf8",
    );
    await writeFile(path.join(repoRoot, testRef), "it('has a focused test', () => {});\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-apply-from-plan",
      "job-apply-from-plan",
      "node-apply-from-plan",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn(input) {
            if (input.turn === 1) {
              return {
                modelRunRef: "openrouter://qwen/apply-from-plan-context",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "read-target",
                      toolId: "worker.repo.read_files",
                      reason: "Read target and test.",
                      input: { fileRefs: [fileRef, testRef] },
                    },
                  ],
                }),
                responseHash: "sha256:apply-from-plan-context",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            if (input.turn === 2) {
              return {
                modelRunRef: "openrouter://kimi/apply-from-plan-plan",
                responseText: JSON.stringify({
                  toolCalls: [
                    {
                      callId: "plan-edit",
                      toolId: "worker.edit.plan",
                      reason: "Plan one target file edit.",
                      input: {
                        editPlanSteps: [
                          {
                            stepId: "step-1",
                            objective: "Change the exported label.",
                            targetFileRefs: [fileRef],
                            validationExpectation: "Focused validation passes.",
                            commitmentIdsAdvanced: ["commitment-apply-from-plan"],
                          },
                        ],
                      },
                    },
                  ],
                }),
                responseHash: "sha256:apply-from-plan-plan",
                latencyMs: 5,
                rawPromptStored: false,
                rawResponseStored: false,
              };
            }
            return {
              modelRunRef: "openrouter://kimi/apply-from-plan-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "apply-from-plan",
                    toolId: "worker.patch.author_edit",
                    reason: "Use the accepted plan target and provide only semantic edit content.",
                    input: {
                      path: fileRef,
                      operation: "replace_text",
                      targetText: "'before'",
                      replacement: "'after'",
                      rationale: "Apply the planned change.",
                    },
                  },
                ],
              }),
              responseHash: "sha256:apply-from-plan-edit",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://apply-from-plan/passed",
              status: "passed",
              summary: "apply-from-plan validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-apply-from-plan",
        graphId: "graph-apply-from-plan",
        nodeId: "node-apply-from-plan",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-apply-from-plan",
        taskTitle: "Apply from plan proof",
        exactEditObjective:
          "Apply a scoped edit using the accepted plan target and a small semantic patch body.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-apply-from-plan"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 120_000,
          maxTurns: 3,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.reasonCodes).toContain("worker_patch_author_edit_compiled_to_runtime_patch");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain("'after'");
    } finally {
      await database.close();
    }
  });

  it("runs a compound coding tool as one traced inspect-edit-validate-evidence operation", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-compound-tool-"));
    const fileRef = "extensions/execution-platform/src/codex-bridge/compound-target.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(
      path.join(repoRoot, fileRef),
      "export function compoundLabel() {\n  return 'before';\n}\n",
      "utf8",
    );
    const { database, kernel, traces } = await createRuntime(
      "graph-compound-tool",
      "job-compound-tool",
      "node-compound-tool",
    );
    try {
      const phaseEvents: Array<{ phase: string; compoundToolId?: string | null }> = [];
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        phaseSink(event) {
          phaseEvents.push({ phase: event.phase, compoundToolId: event.compoundToolId });
          expect(event.rawPromptStored).toBe(false);
          expect(event.rawResponseStored).toBe(false);
          expect(event.rawToolLogStored).toBe(false);
        },
        modelClient: {
          async nextTurn(input) {
            expect(input.taskSummary).toContain("Available compound tools");
            return {
              modelRunRef: "openrouter://qwen/compound-tool",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "compound-edit",
                    toolId: "coding.inspect_edit_validate",
                    reason:
                      "Use the compound operation because target, validation, and commitment refs are already bounded.",
                    input: {
                      contextRefs: ["context-synthesis://compound"],
                      targetFileRefs: [fileRef],
                      validationCommandRefs: ["pnpm test:file compound-target.test.ts"],
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_text",
                          oldText: "return 'before';",
                          newText: "return 'after';",
                          rationale: "Apply the scoped implementation change.",
                        },
                      ],
                      evidenceClaims: [
                        {
                          commitmentId: "commitment-compound-tool",
                          claimSummary:
                            "Compound tool applied the source edit and focused validation passed.",
                          changedFileRefs: ["model-authored-file-ref-must-not-win.ts"],
                          validationRefs: ["validation://model-authored-ref-must-not-win"],
                          confidence: "high",
                          rawPromptStored: false,
                          rawResponseStored: false,
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:compound-tool",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run(commandRef) {
            expect(commandRef).toBe("pnpm test:file compound-target.test.ts");
            return {
              validationRef: "validation://compound-tool/passed",
              status: "passed",
              summary: "compound validation passed",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-compound-tool",
        graphId: "graph-compound-tool",
        nodeId: "node-compound-tool",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-compound-tool",
        taskTitle: "Compound tool proof",
        exactEditObjective: "Use a compound coding tool to change the helper return value.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context-synthesis://compound"],
        validationCommandRefs: ["pnpm test:file compound-target.test.ts"],
        acceptanceCriteria: ["source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-compound-tool"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 240_000,
          maxTurns: 1,
          maxAttempts: 1,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toEqual(["validation://compound-tool/passed"]);
      expect(result.evidenceClaims.map((claim) => claim.commitmentId)).toEqual([
        "commitment-compound-tool",
      ]);
      expect(result.evidenceClaims[0]?.changedFileRefs).toEqual([fileRef]);
      expect(result.evidenceClaims[0]?.validationRefs).toEqual([
        "validation://compound-tool/passed",
      ]);
      expect(result.evidenceClaims[0]?.evidenceRef).toMatch(/^worker-evidence:\/\//u);
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual([
        "coding.inspect_edit_validate",
      ]);
      expect(result.toolResults[0]?.reasonCodes).toContain("coding_compound_tool_completed");
      expect(result.editTransactionRefs.length).toBeGreaterThan(0);
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "return 'after';",
      );
      const invocations = await traces.listInvocations({
        runtimeJobId: "job-compound-tool",
        limit: 20,
      });
      expect(invocations.map((invocation) => invocation.toolId)).toContain(
        "coding.inspect_edit_validate",
      );
      expect(invocations.every((invocation) => !invocation.rawPromptStored)).toBe(true);
      expect(
        phaseEvents.some(
          (event) =>
            event.phase === "worker.tool.completed" &&
            event.compoundToolId === "coding.inspect_edit_validate",
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("classifies a compound coding tool without bounded edits instead of faking implementation", async () => {
    const repoRoot = await mkdtemp(
      path.join(tmpdir(), "openclaw-non-codex-compound-missing-edit-"),
    );
    const fileRef = "extensions/execution-platform/src/codex-bridge/compound-missing-edit.ts";
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), "export const missingEdit = 'before';\n", "utf8");
    const { database, kernel } = await createRuntime(
      "graph-compound-missing-edit",
      "job-compound-missing-edit",
      "node-compound-missing-edit",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://qwen/compound-missing-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "compound-no-edits",
                    toolId: "coding.inspect_edit_validate",
                    reason: "Incorrectly choose a compound tool without edits.",
                    input: {
                      targetFileRefs: [fileRef],
                      validationCommandRefs: ["pnpm test:file compound-missing-edit.test.ts"],
                    },
                  },
                ],
              }),
              responseHash: "sha256:compound-missing-edit",
              latencyMs: 5,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_without_file_edits");
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-compound-missing-edit",
        graphId: "graph-compound-missing-edit",
        nodeId: "node-compound-missing-edit",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-compound-missing-edit",
        taskTitle: "Compound missing edit proof",
        exactEditObjective: "Reject compound coding tool calls that do not include bounded edits.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context-synthesis://compound-missing-edit"],
        validationCommandRefs: ["pnpm test:file compound-missing-edit.test.ts"],
        acceptanceCriteria: ["source edit applied", "validation passed"],
        targetCommitmentIds: ["commitment-compound-missing-edit"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        budgetPolicy: {
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          maxOutputTokens: 4_000,
          timeoutMs: 240_000,
          maxTurns: 1,
          maxAttempts: 1,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.changedFileRefs).toEqual([]);
      expect(result.reasonCodes).toContain("coding_compound_file_edits_missing");
      expect(result.toolResults[0]?.reasonCodes).toContain("coding_compound_file_edits_missing");
      expect(result.repairClassificationRefs.length).toBeGreaterThan(0);
    } finally {
      await database.close();
    }
  });

  it("does not call the model when the implementation packet is structurally invalid", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const kernel = new RuntimeToolKernel({ registry, traces });
      let modelCalled = false;
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            modelCalled = true;
            throw new Error("model_should_not_be_called_for_invalid_packet");
          },
        },
        validationRunner: {
          async run() {
            throw new Error("validation_should_not_run_for_invalid_packet");
          },
        },
      });

      const result = await loop.run({
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-invalid-packet",
        taskTitle: "Invalid packet",
        exactEditObjective: "Edit without scope should not run.",
        repoRoot: "/tmp",
        allowedFileRefs: [],
        targetFileRefs: [],
        contextPackRefs: [],
        validationCommandRefs: [],
        acceptanceCriteria: ["scope required"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 1_000,
          timeoutMs: 60_000,
        },
      });

      expect(modelCalled).toBe(false);
      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("implementation_task_packet_target_scope_missing");
    } finally {
      await database.close();
    }
  });

  it("rolls back schema-heavy non-Codex edits when structural validation fails", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "openclaw-non-codex-schema-rollback-"));
    const fileRef = "extensions/execution-platform/src/workflows/schema-contract-target.ts";
    const originalContent = [
      "import { z } from 'zod';",
      "export const ContractTargetSchema = z.object({",
      "  status: z.literal('ok'),",
      "});",
      "",
    ].join("\n");
    await mkdir(path.dirname(path.join(repoRoot, fileRef)), { recursive: true });
    await writeFile(path.join(repoRoot, fileRef), originalContent, "utf8");
    const { database, kernel } = await createRuntime(
      "graph-schema-rollback",
      "job-schema-rollback",
      "node-schema-rollback",
    );
    try {
      const loop = new NonCodexToolUsingWorkerLoop({
        runtimeToolKernel: kernel,
        modelClient: {
          async nextTurn() {
            return {
              modelRunRef: "openrouter://kimi/schema-corrupting-edit",
              responseText: JSON.stringify({
                toolCalls: [
                  {
                    callId: "read-schema",
                    toolId: "worker.repo.read_files",
                    reason: "Read the schema file before editing.",
                    input: { fileRefs: [fileRef] },
                  },
                  {
                    callId: "plan-schema-edit",
                    toolId: "worker.edit.plan",
                    reason: "Plan a schema edit.",
                    input: {
                      editPlanSteps: [
                        {
                          stepId: "step-1",
                          objective: "Add a field to the schema.",
                          targetFileRefs: [fileRef],
                          validationExpectation: "TypeScript parses.",
                          commitmentIdsAdvanced: ["commitment-schema"],
                        },
                      ],
                    },
                  },
                  {
                    callId: "apply-broken-schema-edit",
                    toolId: "worker.edit.apply_patch",
                    reason: "Apply a broken schema edit.",
                    input: {
                      fileEdits: [
                        {
                          path: fileRef,
                          operation: "replace_file",
                          content:
                            "import { z } from 'zod';\nexport const Broken = z.object({\n  status: z.literal('ok'),\n",
                          rationale: "Simulate a malformed non-Codex schema edit.",
                        },
                      ],
                    },
                  },
                ],
              }),
              responseHash: "sha256:schema-corrupting-edit",
              latencyMs: 1,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://schema-rollback/failed",
              status: "failed",
              summary: "Transform failed with PARSE_ERROR: Expected '}' but found EOF.",
            };
          },
        },
      });

      const result = await loop.run({
        runtimeJobId: "job-schema-rollback",
        graphId: "graph-schema-rollback",
        nodeId: "node-schema-rollback",
        workerId: "worker.kimi.file-implementation",
        roleId: "implementation_engineer",
        taskId: "task-schema-rollback",
        taskTitle: "Schema rollback proof",
        exactEditObjective: "Apply a schema-heavy edit with rollback on structural failure.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
        targetFileRefs: [fileRef],
        contextPackRefs: ["context://schema-rollback"],
        validationCommandRefs: ["pnpm test:file schema-contract-target.test.ts"],
        acceptanceCriteria: ["schema parses", "validation passes"],
        targetCommitmentIds: ["commitment-schema"],
        expectedEvidenceClaimKinds: ["source_change", "test_validation"],
        budgetPolicy: {
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          maxOutputTokens: 8_000,
          timeoutMs: 300_000,
          maxTurns: 1,
          maxAttempts: 1,
        },
      });

      expect(result.status).toBe("escalated");
      expect(result.reasonCodes).toContain(
        "non_codex_worker_schema_contract_validation_failure_rollback",
      );
      expect(result.reasonCodes).toContain(
        "non_codex_worker_schema_contract_edit_requires_high_capability_escalation",
      );
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toBe(originalContent);
    } finally {
      await database.close();
    }
  });
});
