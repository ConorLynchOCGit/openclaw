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
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../workflows/scheduler-runtime-tools.ts";
import { NonCodexToolUsingWorkerLoop } from "./non-codex-tool-using-worker-loop.ts";

describe("NonCodexToolUsingWorkerLoop", () => {
  it("lets Kimi use repo tools before editing, validating, repairing, and claiming evidence", async () => {
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
      "import { expect, it } from 'vitest';\nimport { toolLoopLabel } from './tool-loop-target.ts';\nit('returns label', () => expect(toolLoopLabel()).toBe('after'));\n",
      "utf8",
    );
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const kernel = new RuntimeToolKernel({ registry, traces });
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      const phaseEvents: string[] = [];
      await runtimeJobs.enqueueJob({
        jobId: "job-tool-worker",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });
      await graphs.createGraph({
        graphId: "graph-tool-worker",
        rootRuntimeJobId: "job-tool-worker",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      await graphs.addNode({
        graphId: "graph-tool-worker",
        nodeId: "node-tool-worker",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        modelOrWorkerRef: "worker.kimi.file-implementation",
        nodeStatus: "running",
      });
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
                    callId: "inspect-tests",
                    toolId: "worker.repo.inspect_tests",
                    reason: "Confirm focused validation test refs.",
                    input: {},
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
        patchModelClient: {
          async proposeFileEdits(input) {
            const firstPatch = input.attempt === 1;
            return {
              modelRunRef: `openrouter://kimi/patch-${input.attempt}`,
              responseText: JSON.stringify({
                schemaVersion: "openclaw.kimi.patch-proposal.v1",
                status: "patch_proposed",
                editSteps: [
                  {
                    stepId: firstPatch ? "step-1" : "step-2",
                    objective: firstPatch
                      ? "Try the first scoped tool-loop edit."
                      : "Repair the scoped tool-loop edit after validation feedback.",
                    targetFileRefs: [fileRef],
                    validationExpectation: "Focused validation passes.",
                    rollbackBoundary: "step",
                    commitmentIdsAdvanced: ["commitment-tool-worker"],
                  },
                ],
                fileEdits: [
                  {
                    path: fileRef,
                    operation: "replace_text",
                    oldText: "return 'before';",
                    newText: firstPatch ? "return 'intermediate';" : "return 'after';",
                    rationale: "Apply the scoped tool-loop implementation edit.",
                  },
                ],
                validationCommandRefs: ["pnpm test:file tool-loop-target.test.ts"],
                limitations: [],
                evidenceClaims: [
                  {
                    commitmentId: "commitment-tool-worker",
                    evidenceRef: "runtime-work-graph://kimi/evidence/tool-worker",
                    claimSummary: "Kimi used tools, edited the helper, and validation passed.",
                    changedFileRefs: [fileRef],
                    validationRefs: ["validation://tool-loop-target"],
                    limitations: [],
                    confidence: "high",
                    rawPromptStored: false,
                    rawResponseStored: false,
                  },
                ],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }),
              responseHash: `sha256:patch-${input.attempt}`,
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
              status: validationCalls === 1 ? "failed" : "passed",
              summary:
                validationCalls === 1
                  ? "bounded first validation failure"
                  : "bounded repaired validation pass",
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
        exactEditObjective: "Use tools to discover, edit, validate, repair, and claim evidence.",
        repoRoot,
        allowedFileRefs: ["extensions/execution-platform/src/codex-bridge/"],
        targetFileRefs: [fileRef, testRef],
        contextPackRefs: [],
        validationCommandRefs: ["pnpm test:file tool-loop-target.test.ts"],
        acceptanceCriteria: ["repo tools used", "source edit applied", "validation repaired"],
        targetCommitmentIds: ["commitment-tool-worker"],
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
      expect(phaseEvents).toEqual(
        expect.arrayContaining([
          "worker.loop.started",
          "worker.plan.started",
          "worker.tool.started",
          "worker.tool.completed",
          "worker.edit.plan_started",
          "worker.edit.plan_completed",
          "worker.loop.completed",
        ]),
      );
      expect(result.toolResults.map((tool) => tool.toolId)).toEqual(
        expect.arrayContaining([
          "worker.repo.search",
          "worker.repo.read_files",
          "worker.repo.inspect_tests",
          "worker.edit.plan",
          "worker.edit.apply_patch",
          "worker.validation.run",
          "worker.validation.explain_failure",
          "worker.evidence.claim",
        ]),
      );
      expect(result.changedFileRefs).toEqual([fileRef]);
      expect(result.validationRefs).toHaveLength(2);
      expect(result.evidenceClaims[0]?.commitmentId).toBe("commitment-tool-worker");
      await expect(readFile(path.join(repoRoot, fileRef), "utf8")).resolves.toContain(
        "return 'after';",
      );
      const traceRows = await traces.listInvocations({ graphId: "graph-tool-worker", limit: 50 });
      expect(traceRows.map((row) => row.toolId)).toEqual(
        expect.arrayContaining(["worker.repo.search", "worker.repo.read_files"]),
      );
      expect(traceRows.every((row) => !row.rawPromptStored)).toBe(true);
    } finally {
      await database.close();
    }
  });
});
