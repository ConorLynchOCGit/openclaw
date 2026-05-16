import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import {
  createAgentTeamFailureRecoveryArtifact,
  recordAgentTeamFailureRecoveryArtifact,
} from "./agent-team-failure-recovery.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import {
  LiveAgentTeamRunner,
  OpenRouterAgentTeamModelClient,
  type AgentTeamModelClient,
} from "./live-agent-team-runner.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

function fakeClient(): AgentTeamModelClient {
  return {
    async callRole(input) {
      const responseText = JSON.stringify({
        summary: `${input.roleId} completed bounded role output`,
        findings: [],
        evidenceRefs: [`artifact://${input.roleId}`],
        risks: [],
        recommendedNextAction: "continue",
        notDeterministic: true,
        relevantFiles: ["extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts"],
        existingPatterns: ["runtime job evidence"],
        knownConstraints: ["no raw prompt storage"],
        suggestedImplementationPath: ["persist evidence before projection"],
        unknowns: [],
        behaviorTestGaps: [],
        brittleSchemaConcerns: [],
        missingNegativeCases: [],
        validationRepairExpectations: ["rerun focused tests"],
        severity: "low",
        exploitabilityNotes: [],
        requiredFixes: [],
        recommendedFixes: [],
        residualRisk: [],
        validationFailed: false,
        diagnosis: "bounded",
        repairPlan: [],
        rerunPlan: [],
        needsReviewIfUnresolved: true,
        boundedPayloadFields: ["summary", "artifactRefs"],
        rejectedContent: ["raw prompts"],
        scopeBoundary: "agent-team runtime",
        artifactRefs: [`artifact://${input.roleId}`],
        workQueueLifecycleMutationAllowed: false,
        validationResult: "passed",
        qualitativeJudgment: "bounded assist only",
        judgmentMade: true,
        limitations: [],
      });
      return {
        status: "succeeded",
        responseText,
        responseHash: `sha256:${input.roleId}`,
        usage: {
          inputTokenCount: 100,
          outputTokenCount: 50,
          totalTokenCount: 150,
          estimatedCostUsd: 0.001,
        },
      } as const;
    },
  };
}

function modelCloseoutReporterFixture() {
  return {
    async createCapsule(input: {
      factualRefs: {
        runtimeJobId: string;
        teamRunId?: string | null;
        workflowId?: string | null;
      };
    }) {
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: input.factualRefs.runtimeJobId,
        teamRunId: input.factualRefs.teamRunId ?? null,
        workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
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
  };
}

describe("live agent-team runner", () => {
  it("supports a Kimi native JSON request profile without reasoning and honors call token budget", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const bodyText = typeof init?.body === "string" ? init.body : "{}";
      bodies.push(JSON.parse(bodyText));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    whatIWasAskedToDo: "implement",
                    whatIActuallyDid: "implemented bounded change",
                    evidenceRefs: ["artifact://kimi"],
                    filesOrArtifactsTouched: ["file.ts"],
                    validationIPerformed: "test passed",
                    whatWorked: ["json profile worked"],
                    whatWasWeakOrFailed: ["none"],
                    recommendedNextStep: "continue",
                    confidence: "high",
                    limitations: ["bounded test"],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          };
        },
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      requestProfilesByModelId: {
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "implementation_engineer",
      modelId: "moonshotai/kimi-k2.6",
      modelCandidateId: "kimi-2-6-coding-candidate",
      prompt: "Return compact JSON.",
      responseFormat: "json_object",
      maxTokens: 3_000,
    });

    expect(result.status).toBe("succeeded");
    expect(bodies[0]).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 3_000,
      response_format: { type: "json_object" },
    });
    expect(bodies[0]).not.toHaveProperty("reasoning");
  });

  it("honors per-call request profile overrides for Kimi patch calls", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      bodies.push(JSON.parse(body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schemaVersion: "openclaw.kimi.patch-proposal.v1",
                  status: "needs_review",
                  fileEdits: [],
                  validationCommandRefs: [],
                  limitations: ["bounded"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      requestProfilesByModelId: {
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "exclude",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "implementation_engineer",
      modelId: "moonshotai/kimi-k2.6",
      modelCandidateId: "kimi-2-6-coding-candidate",
      prompt: "Return compact JSON.",
      responseFormat: "json_object",
      requestProfileOverride: {
        responseFormatMode: "prompt_only",
        reasoningMode: "omit",
        maxTokens: 3_000,
      },
    });

    expect(result.status).toBe("succeeded");
    expect(bodies[0]).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 3_000,
    });
    expect(bodies[0]).not.toHaveProperty("response_format");
    expect(bodies[0]).not.toHaveProperty("reasoning");
  });

  it("claims one team job, records live-shaped stream/accounting/review evidence, and projects to Work Queue", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "live-team-work-item",
        itemType: "agent_team_task",
        title: "Live team projection",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "live-team-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team-live",
        workItemId: workItem.workItemId,
        payload: {
          teamRunId: "live-team-run",
          objective: "Improve live agent-team runtime projection with bounded role evidence.",
        },
      });
      await workQueue.createWorkRun({
        runId: "live-team-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
      });

      const result = await new LiveAgentTeamRunner({
        runtimeJobs,
        workerId: "live-team-worker",
        queueName: "agent-team-live",
        modelClient: fakeClient(),
        maxV4ProEvalFixtures: 2,
        closeoutReporter: modelCloseoutReporterFixture(),
      }).runOnce();
      const artifacts = await runtimeJobs.listArtifacts(runtimeJob.jobId);
      const events = await runtimeJobs.listEvents(runtimeJob.jobId);
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
        now: new Date("2026-05-03T17:00:00.000Z"),
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: true,
        providerCallMade: true,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
        codexCliInvoked: false,
      });
      expect(result.modelRosterDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            requestedModelId: "deepseek/deepseek-v4-pro",
            allowed: false,
            status: "needs_review",
          }),
        ]),
      );
      expect(events.map((event) => event.eventType)).toContain("agent_team.stream_event");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "agent_team.stream_summary",
          "agent_team.model_run_accounting_summary",
          "agent_team.failure_recovery",
          "agent_team.security_privacy_review",
          "agent_team.result_review",
          "agent_team.runtime_evidence",
        ]),
      );
      expect(model.runtimeJobs[0]?.agentTeam).toMatchObject({
        agentTeamRunId: "live-team-run",
        validationState: "passed",
        reviewState: "reviewed",
        closeoutState: "present",
        securityReviewState: "local_codex_review",
        failureRecoveryState: "repaired",
      });
      expect(model.runtimeJobs[0]?.agentTeam.teamStreamSummary.eventCount).toBeGreaterThan(0);
      expect(model.runtimeJobs[0]?.agentTeam.modelAccountingSummary.runCount).toBeGreaterThan(0);
      expect(model.runtimeJobs[0]?.agentTeam.needsReviewRoles).toContain("context_scout");
    });
  });

  it("records irreparable failure recovery as needs_review without false success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "failure-recovery-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team-live",
      });
      const recovery = createAgentTeamFailureRecoveryArtifact({
        recoveryId: "recovery-needs-review",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run",
        failedRole: "implementation_engineer",
        recoveryRole: "reviewer",
        failureKind: "scope_drift",
        detectedAt: "2026-05-03T17:00:00.000Z",
        failureSummary: "Role attempted to change a file outside the approved module.",
        outcome: "needs_review",
        needsReviewReason: "scope drift requires operator decision",
      });
      await recordAgentTeamFailureRecoveryArtifact({ runtimeJobs, artifact: recovery });

      expect(recovery).toMatchObject({
        outcome: "needs_review",
        falseSuccessClaimed: false,
        scopeDriftDetected: true,
        workQueueLifecycleMutated: false,
      });
    });
  });
});
