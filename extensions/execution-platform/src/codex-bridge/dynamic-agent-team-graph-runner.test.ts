import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { AgentTeamQueuedRunner } from "./agent-team-queued-runner.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";

describe("dynamic agent-team graph production path", () => {
  it("uses Runtime Work Graph and GPT 5.5 orchestrator instead of static inline role-only execution", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "dynamic-agent-team-graph-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary:
            "Improve agent-team quality proof readback with a bounded source edit and validation.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "dynamic-agent-team-graph-worker",
        queueName: "agent-team",
        dynamicOrchestratorModelClient: {
          async runJson(input) {
            return {
              modelRunRef: "codex-app-server://openai-codex/gpt-5.5/test-orchestrator",
              responseText: JSON.stringify({
                childTasks: [
                  {
                    actionId: "context",
                    actionKind: "coding",
                    title: "Inspect context",
                    assignedRole: "context_scout",
                    assignedWorkflow: "agent_team.coding",
                  },
                  {
                    actionId: "implementation",
                    actionKind: "coding",
                    title: "Implement bounded change",
                    assignedRole: "implementation_engineer",
                    assignedWorkflow: "agent_team.coding",
                    dependencyActionIds: ["context"],
                  },
                  {
                    actionId: "validation",
                    actionKind: "qa_test",
                    title: "Validate change",
                    assignedRole: "test_engineer",
                    assignedWorkflow: "agent_team.qa_test",
                    dependencyActionIds: ["implementation"],
                  },
                ],
                rolePairings: [
                  {
                    roleId: "orchestrator",
                    modelOrWorkerRef: input.modelRef,
                    reasonCodes: ["gpt_5_5_orchestrator_first_called"],
                  },
                ],
                humanTasks: [],
                dependencyGraph: [
                  { fromActionId: "context", toActionId: "implementation", edgeKind: "depends_on" },
                  {
                    fromActionId: "implementation",
                    toActionId: "validation",
                    edgeKind: "depends_on",
                  },
                ],
                validationPlan: [
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
                ],
                contextNeeds: ["agent-team quality proof files"],
                budgetPlan: {
                  maxWallTimeMs: 600000,
                  maxModelCalls: 8,
                  maxRepairAttempts: 1,
                  continuationAllowed: true,
                },
                stopConditions: ["validation accepted", "repair budget exhausted"],
                reasonCodes: ["test_orchestrator_plan"],
              }),
              responseHash: "sha256:test-orchestrator",
              latencyMs: 10,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        roleModelClient: {
          async callRole(input) {
            return {
              status: "succeeded" as const,
              responseText: JSON.stringify({
                whatIActuallyDid: `${input.roleId} completed a concrete graph node invocation.`,
                evidenceRefs: [`runtime-job://dynamic-agent-team-graph-job/${input.roleId}`],
                filesOrArtifactsTouched: [
                  "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
                ],
                validationIPerformed:
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
                whatWorked: ["dynamic graph node executed"],
                whatWasWeakOrFailed: ["fixture uses bounded fake role model"],
                recommendedNextStep: "run long-form UX proof",
                confidence: "high",
                limitations: ["fixture role model"],
              }),
              responseHash: `sha256:${input.roleId}`,
              usage: null,
            };
          },
        },
        dynamicValidationRunner: {
          async run(commandRef) {
            return {
              validationRef: `runtime-job://dynamic-agent-team-graph-job/validation/${commandRef.length}`,
              status: "passed",
              summary: "Fixture validation passed without spawning nested test processes.",
            };
          },
        },
        implementationBridge: {
          async run() {
            return {
              status: "completed" as const,
              transportKind: "codex_parity_runtime_adapter" as const,
              modelRef: "openai-codex/gpt-5.3-codex",
              providerPath: "codex_parity_runtime_adapter",
              modelRunRef: "codex-parity://implementation/test",
              responseHash: "sha256:implementation",
              startedAt: "2026-05-11T00:00:00.000Z",
              completedAt: "2026-05-11T00:00:01.000Z",
              latencyMs: 1_000,
              summary: "Implementation changed a bounded test file through the parity adapter.",
              changedFileRefs: [
                "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
              ],
              validationRefs: [
                "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
              ],
              artifactRefs: ["runtime-job://dynamic-agent-team-graph-job/codex-parity/result"],
              reasonCodes: ["codex_parity_runtime_adapter_completed"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        closeoutReporter: {
          async createCapsule(input) {
            const capsule = createModelAuthoredCloseoutCapsuleFixture({
              runtimeJobId: input.factualRefs.runtimeJobId,
              teamRunId: input.factualRefs.teamRunId ?? null,
              workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
              fileRefs: input.factualRefs.fileRefs,
              artifactRefs: input.factualRefs.artifactRefs,
              validationRefs: input.factualRefs.validationRefs,
            });
            return {
              source: "model" as const,
              capsule,
              legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
              reasonCodes: ["fixture_model_closeout_created"],
              rawPromptStored: false as const,
              rawResponseStored: false as const,
              rawProviderLogStored: false as const,
            };
          },
        },
      }).runOnce();

      expect(result.completed).toBe(true);
      expect(result.evidence?.modelRoutingEvidence).toMatchObject({
        graphId: "team-run-dynamic-agent-team-graph-job-runtime-work-graph",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        staticSingleJobSequenceUsed: false,
        inlineRoleOnlyExecutionAllowed: false,
      });
      expect(result.evidence?.roleExecutionEvidence?.map((role) => role.roleId)).toEqual(
        expect.arrayContaining([
          "context_scout",
          "implementation_engineer",
          "test_engineer",
          "reviewer",
          "observability_scribe",
        ]),
      );
      expect(
        result.evidence?.roleExecutionEvidence?.filter((role) => role.roleId === "context_scout"),
      ).toHaveLength(2);
      const snapshot = await runtimeWorkGraphs.readGraphSnapshot(
        "team-run-dynamic-agent-team-graph-job-runtime-work-graph",
      );
      expect(snapshot).not.toBeNull();
      expect(snapshot!.nodes.map((node) => node.nodeKind)).toEqual(
        expect.arrayContaining([
          "orchestrator_plan",
          "context_scout",
          "implementation",
          "validation",
          "reviewer",
          "closeout",
        ]),
      );
      expect(snapshot!.roleInvocations.map((invocation) => invocation.roleId)).toEqual(
        expect.arrayContaining([
          "orchestrator",
          "context_scout",
          "implementation_engineer",
          "test_engineer",
        ]),
      );
      expect(
        snapshot!.roleInvocations.filter((invocation) => invocation.roleId === "context_scout"),
      ).toHaveLength(2);
      const artifacts = await runtimeJobs.listArtifacts("dynamic-agent-team-graph-job");
      expect(
        artifacts.some(
          (artifact) => artifact.artifactType === "agent_team.coding_real_work_task_graph",
        ),
      ).toBe(false);
      expect(
        artifacts.some((artifact) => artifact.artifactType === "agent_team.runtime_evidence"),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });
});
