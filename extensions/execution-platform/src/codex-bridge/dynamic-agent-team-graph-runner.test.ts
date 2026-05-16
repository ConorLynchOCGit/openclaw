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
  it("drives the default production path through scheduler-selected graph decisions", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "scheduler-backed-agent-team-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          teamRunId: "scheduler-backed-agent-team",
          objectiveSummary:
            "Improve scheduler-backed coding-team readback with a bounded source edit and validation.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const decisions = [
        {
          decisionId: "add-context",
          decisionKind: "request_context",
          rationaleForDecision:
            "Context scout should identify the specific runner files before edits.",
          newNodes: [
            {
              nodeId: "context-1",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "moonshotai/kimi-k2.6",
              expectedOutput: "Relevant files, edit points, risks, and implementation handoff.",
              acceptanceCriteria: ["Names concrete target files."],
              downstreamConsumer: "implementation_engineer",
              targetRefs: [
                "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
              ],
            },
          ],
          reasonCodes: ["context_needed"],
        },
        {
          decisionId: "run-context",
          decisionKind: "run_node",
          rationaleForDecision: "Run the selected context scout node.",
          runNodeId: "context-1",
          reasonCodes: ["run_context_scout"],
        },
        {
          decisionId: "add-implementation",
          decisionKind: "escalate_worker",
          rationaleForDecision:
            "Codex implementation is selected for this scheduler integration test.",
          newNodes: [
            {
              nodeId: "implementation-1",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "worker.codex.parity-runtime-adapter",
              expectedOutput:
                "Changed-file refs, validation refs, and implementation artifact refs.",
              acceptanceCriteria: ["Records changed-file evidence."],
              downstreamConsumer: "validation",
              targetRefs: [
                "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
              ],
            },
          ],
          newEdges: [
            {
              fromNodeId: "context-1",
              toNodeId: "implementation-1",
              edgeKind: "handoff",
              reasonCodes: ["context_to_implementation"],
            },
          ],
          reasonCodes: ["implementation_selected"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the selected implementation node.",
          runNodeId: "implementation-1",
          reasonCodes: ["run_implementation"],
        },
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation must run after implementation evidence.",
          newNodes: [
            {
              nodeId: "validation-1",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "script-middleware",
              expectedOutput: "Validation refs and pass/fail state.",
              acceptanceCriteria: ["Validation ref is recorded."],
              downstreamConsumer: "reviewer",
              metadata: {
                validationCommandRefs: [
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                ],
              },
            },
          ],
          newEdges: [
            {
              fromNodeId: "implementation-1",
              toNodeId: "validation-1",
              edgeKind: "depends_on",
              reasonCodes: ["implementation_to_validation"],
            },
          ],
          reasonCodes: ["validation_selected"],
        },
        {
          decisionId: "run-validation",
          decisionKind: "run_node",
          rationaleForDecision: "Run validation selected by the orchestrator.",
          runNodeId: "validation-1",
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "add-review",
          decisionKind: "request_review",
          rationaleForDecision:
            "Reviewer should inspect accepted implementation and validation refs.",
          newNodes: [
            {
              nodeId: "review-1",
              nodeKind: "reviewer",
              assignedRole: "reviewer",
              modelOrWorkerRef: "deepseek/deepseek-v4-pro",
              expectedOutput: "Task-fit and validation-integrity review.",
              acceptanceCriteria: ["Reviews changed files and validation refs."],
              downstreamConsumer: "observability_scribe",
            },
          ],
          reasonCodes: ["review_selected"],
        },
        {
          decisionId: "run-review",
          decisionKind: "run_node",
          rationaleForDecision: "Run reviewer selected by orchestrator.",
          runNodeId: "review-1",
          reasonCodes: ["run_review"],
        },
        {
          decisionId: "add-readback",
          decisionKind: "request_review",
          rationaleForDecision: "Observability readback is needed before closeout.",
          newNodes: [
            {
              nodeId: "readback-1",
              nodeKind: "reviewer",
              assignedRole: "observability_scribe",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Owner-readable graph summary, limitations, and ELI5 progress.",
              acceptanceCriteria: ["Includes runtime graph refs."],
              downstreamConsumer: "closeout",
            },
          ],
          reasonCodes: ["readback_selected"],
        },
        {
          decisionId: "run-readback",
          decisionKind: "run_node",
          rationaleForDecision: "Run observability readback.",
          runNodeId: "readback-1",
          reasonCodes: ["run_readback"],
        },
        {
          decisionId: "add-closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted evidence is ready for final closeout.",
          newNodes: [
            {
              nodeId: "closeout-1",
              nodeKind: "closeout",
              assignedRole: "observability_scribe",
              modelOrWorkerRef: "model://fixture-closeout",
              expectedOutput: "Model-authored Closeout Capsule.",
              acceptanceCriteria: ["Closeout ref is recorded."],
              downstreamConsumer: "runtime_job_completion",
            },
          ],
          reasonCodes: ["closeout_selected"],
        },
      ];

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "scheduler-backed-agent-team-worker",
        queueName: "agent-team",
        dynamicOrchestratorModelClient: {
          async runJson() {
            const decision = decisions.shift();
            return {
              modelRunRef: `codex-app-server://openai-codex/gpt-5.5/${decision?.decisionId ?? "missing"}`,
              responseText: JSON.stringify(
                decision ?? {
                  decisionId: "unexpected-extra-call",
                  decisionKind: "mark_needs_review",
                  rationaleForDecision: "No more fixture decisions.",
                  reasonCodes: ["fixture_decisions_exhausted"],
                },
              ),
              responseHash: `sha256:${decision?.decisionId ?? "missing"}`,
              latencyMs: 10,
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        missionContractModelClient: {
          async runJson(input) {
            const payload =
              input.userPayload &&
              typeof input.userPayload === "object" &&
              !Array.isArray(input.userPayload)
                ? (input.userPayload as Record<string, unknown>)
                : {};
            const missionLedger =
              payload.missionLedger && typeof payload.missionLedger === "object"
                ? (payload.missionLedger as Record<string, unknown>)
                : null;
            return {
              modelRunRef: "codex-app-server://openai-codex/gpt-5.5/mission-contract-fixture",
              responseText: JSON.stringify(
                missionLedger
                  ? {
                      artifactKind: "mission_commitment_evaluation",
                      schemaVersion: "execution-platform.mission-contract-ledger.v1",
                      evaluationId: "fixture-evaluation",
                      missionId: "scheduler-backed-agent-team-mission-contract",
                      commitmentUpdates: [
                        {
                          commitmentId: "scheduler-backed-work",
                          status: "satisfied",
                          acceptedEvidenceRefs: [
                            "runtime-job://scheduler-backed-agent-team-job/fixture",
                          ],
                          rejectedEvidenceRefs: [],
                          rationale:
                            "The fixture accepted bounded scheduler graph evidence for this production-path test.",
                          remainingWork: [],
                        },
                      ],
                      revisionProposals: [],
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                      workQueueLifecycleMutated: false,
                    }
                  : {
                      missionId: "scheduler-backed-agent-team-mission-contract",
                      ownerObjectiveSummary:
                        "Improve scheduler-backed coding-team readback with a bounded source edit and validation.",
                      blockingCommitments: [
                        {
                          commitmentId: "scheduler-backed-work",
                          commitmentText:
                            "Run the scheduler-backed coding-team workflow and produce bounded implementation, validation, review, and closeout evidence.",
                          whyItMatters: "The owner needs production-path graph execution evidence.",
                          expectedEvidenceDescription:
                            "Runtime graph node refs, changed-file refs, validation refs, review refs, and closeout refs.",
                          status: "pending",
                          blocking: true,
                        },
                      ],
                      nonBlockingCommitments: [],
                      explicitNonGoals: [],
                      safetyConstraints: [],
                      prohibitedDirectiveCandidates: [],
                      authorityBoundary: {
                        requestedAuthority: null,
                        maximumAuthority: "workflow_default",
                        requiresApproval: false,
                        approvalRefs: [],
                        authorityRefs: [],
                        rawPromptStored: false,
                        rawResponseStored: false,
                      },
                      storagePolicy: {
                        rawPromptStorageAllowed: false,
                        rawResponseStorageAllowed: false,
                        rawTranscriptStorageAllowed: false,
                        rawProviderLogStorageAllowed: false,
                        rawToolLogStorageAllowed: false,
                        rawDbRowStorageAllowed: false,
                        secretsStorageAllowed: false,
                        boundedRefsOnly: true,
                      },
                      lifecycleBoundary: {
                        workQueueLifecycleMutationAllowed: false,
                        authorityGrantAllowed: false,
                        deployAllowed: false,
                        outboundSendAllowed: false,
                        modelPromotionAllowed: false,
                        runtimeJobLifecycleOwner: "runtime_jobs",
                      },
                      missionGate: "clear_to_execute",
                      missionGateRationale: "The primary mission is local repo work.",
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                      workQueueLifecycleMutated: false,
                    },
              ),
              responseHash: "sha256:mission-contract-fixture",
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
                whatIActuallyDid: `${input.roleId} executed the scheduler-selected node.`,
                evidenceRefs: [`runtime-job://scheduler-backed-agent-team-job/${input.roleId}`],
                filesOrArtifactsTouched: [
                  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
                ],
                validationIPerformed:
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
                whatWorked: ["scheduler-selected node executed"],
                whatWasWeakOrFailed: ["fixture model"],
                recommendedNextStep: "run full live UX proof next",
                confidence: "high",
                limitations: ["fixture model"],
                relevantFiles: [
                  {
                    path: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
                    whyRelevant: "runner wiring target",
                    keySymbolsOrFunctions: ["DynamicAgentTeamGraphRunner"],
                  },
                ],
                recommendedEditPoints: [
                  {
                    path: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
                    symbolOrRegion: "runSchedulerBacked",
                    reason: "scheduler-backed production path",
                  },
                ],
                handoffSummaryForImplementation:
                  "Use the scheduler-backed runner path and validate focused tests.",
              }),
              responseHash: `sha256:${input.roleId}`,
              usage: null,
            };
          },
        },
        dynamicValidationRunner: {
          async run(commandRef) {
            return {
              validationRef: `runtime-job://scheduler-backed-agent-team-job/validation/${commandRef.length}`,
              status: "passed",
              summary: "Fixture validation passed.",
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
              modelRunRef: "codex-parity://scheduler-backed-implementation",
              responseHash: "sha256:scheduler-backed-implementation",
              startedAt: "2026-05-14T00:00:00.000Z",
              completedAt: "2026-05-14T00:00:01.000Z",
              latencyMs: 1_000,
              summary: "Implementation bridge made the scheduler-selected bounded edit.",
              changedFileRefs: [
                "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
              ],
              validationRefs: [
                "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
              ],
              artifactRefs: ["runtime-job://scheduler-backed-agent-team-job/codex-parity/result"],
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

      expect(result.failure).toBeNull();
      expect(result.completed, JSON.stringify(result, null, 2)).toBe(true);
      expect(result.evidence?.modelRoutingEvidence).toMatchObject({
        graphId: "scheduler-backed-agent-team-runtime-work-graph",
        schedulerBackedDynamicRunner: true,
        staticSingleJobSequenceUsed: false,
      });
      const snapshot = await runtimeWorkGraphs.readGraphSnapshot(
        "scheduler-backed-agent-team-runtime-work-graph",
      );
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(
        expect.arrayContaining([
          "context-1",
          "implementation-1",
          "validation-1",
          "review-1",
          "readback-1",
          "closeout-1",
        ]),
      );
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toEqual(
        expect.arrayContaining([
          "orchestrator_decision_request_context",
          "orchestrator_decision_run_node",
          "orchestrator_decision_create_closeout",
          "scheduler_final_closeout_recorded",
        ]),
      );
      expect(result.evidence?.roleExecutionEvidence?.map((role) => role.roleId)).toEqual(
        expect.arrayContaining([
          "context_scout",
          "implementation_engineer",
          "reviewer",
          "observability_scribe",
        ]),
      );
    } finally {
      await database.close();
    }
  });

  it("rejects retired legacy fixed-runner flags instead of entering compatibility execution", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "dynamic-agent-team-retired-legacy-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Attempt to force the retired fixed runner.",
          legacyFixedDynamicRunner: true,
          proofOnlyLegacyFixedDynamicRunner: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "dynamic-agent-team-retired-legacy-runner-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(result.completed).toBe(false);
      expect(result.failure).toMatchObject({
        stage: "agent_team_run_once",
        message: "legacy_fixed_dynamic_runner_retired",
      });
      const events = await runtimeJobs.listEvents("dynamic-agent-team-retired-legacy-runner-job");
      expect(events.map((event) => event.eventType)).toContain(
        "agent_team.legacy_fixed_runner_rejected",
      );
    } finally {
      await database.close();
    }
  });
});
