import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import {
  applyAgentTeamHandoffControl,
  recordAgentTeamHandoffControl,
} from "./agent-team-handoff-controls.ts";
import {
  AgentTeamQueuedRunner,
  buildSingleJobQualityRoleReportContractText,
  singleJobQualityRoleMaxTokensForModel,
} from "./agent-team-queued-runner.ts";
import {
  buildAgentTeamHumanCloseoutSummary,
  buildAgentTeamResultReviewArtifact,
  validateAgentTeamResultReviewArtifact,
} from "./agent-team-result-review.ts";
import {
  AGENT_TEAM_JOB_TYPE,
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import {
  compareContextScoutToImplementation,
  createContextScoutArtifact,
  recordContextScoutArtifact,
} from "./context-scout-pilot.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
  validateSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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
      now: () => new Date("2026-05-03T16:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T16:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
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

describe("agent-team runtime evidence", () => {
  it("uses a concrete role-report contract and model-specific budgets for single-job quality proof", () => {
    const contract = buildSingleJobQualityRoleReportContractText();

    expect(contract).toContain('"whatIActuallyDid": "bounded role-specific string"');
    expect(contract).toContain('"evidenceRefs": ["at least one supplied evidence ref"]');
    expect(contract).toContain("Do not restate the role task as the work performed.");
    expect(contract).toContain(
      "do not invent file paths, runtime ids, tests, deploys, sends, authority, or DB writes.",
    );
    expect(singleJobQualityRoleMaxTokensForModel("deepseek/deepseek-v4-pro")).toBeGreaterThan(
      singleJobQualityRoleMaxTokensForModel("deepseek/deepseek-v4-flash"),
    );
    expect(
      singleJobQualityRoleMaxTokensForModel("deepseek/deepseek-v4-pro"),
    ).toBeGreaterThanOrEqual(3_000);
    expect(singleJobQualityRoleMaxTokensForModel("moonshotai/kimi-k2.6")).toBeGreaterThanOrEqual(
      3_000,
    );
  });

  it("persists role assignments, handoffs, validation, review, closeout, and Work Queue projection", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "agent-team-work-item",
        itemType: "agent_team_task",
        title: "Agent-team projection",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "agent-team-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { objective: "agent-team-runtime-read-model-projection" },
      });
      await workQueue.createWorkRun({
        runId: "agent-team-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        metadata: { runKind: "agent_team" },
      });
      const evidence = createAgentTeamRuntimeEvidence({
        teamRunId: "team-run-1",
        runtimeJobId: runtimeJob.jobId,
        workQueueLink: { workItemId: workItem.workItemId, runId: "agent-team-work-run" },
        objective: "agent-team-runtime-read-model-projection",
        roster: [
          { roleId: "implementation_engineer", modelId: "moonshotai/kimi-k2.6", status: "allowed" },
          { roleId: "context_scout", modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
        ],
        roleAssignments: [
          {
            roleId: "implementation_engineer",
            modelId: "moonshotai/kimi-k2.6",
            assignedAt: "2026-05-03T16:00:00.000Z",
            status: "completed",
          },
        ],
        roleEligibility: {
          "moonshotai/kimi-k2.6": "allowed",
          "deepseek/deepseek-v4-pro": "needs_review",
        },
        activeRole: "observability_scribe",
        handoffHistory: [
          {
            handoffId: "handoff-1",
            fromRole: "context_scout",
            toRole: "implementation_engineer",
            status: "completed",
            recordedAt: "2026-05-03T16:00:00.000Z",
            payloadSummary: "bounded scout output",
            evidenceRefs: ["artifact:scout"],
            rawTranscriptAllowed: false,
            rawProviderPromptAllowed: false,
          },
        ],
        reviewState: "reviewed",
        validationState: "passed",
        closeoutState: "present",
        authorityStatus: "allowed",
      });

      await recordAgentTeamRuntimeEvidence({ runtimeJobs, evidence });
      const events = await runtimeJobs.listEvents(runtimeJob.jobId);
      const artifacts = await runtimeJobs.listArtifacts(runtimeJob.jobId);
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
        now: new Date("2026-05-03T16:00:00.000Z"),
      });

      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "agent_team.role_assigned",
          "agent_team.handoff_recorded",
          "agent_team.validation_recorded",
          "agent_team.review_recorded",
          "agent_team.closeout_recorded",
          "agent_team.authority_status_recorded",
          "agent_team.run_completed",
        ]),
      );
      expect(artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "agent_team.runtime_evidence" }),
        ]),
      );
      expect(model.runtimeJobs[0]?.agentTeam).toMatchObject({
        agentTeamRunId: "team-run-1",
        currentTeamState: "completed",
        activeRole: "observability_scribe",
        completedRoles: ["implementation_engineer"],
        needsReviewRoles: ["context_scout"],
        validationState: "passed",
        reviewState: "reviewed",
        closeoutState: "present",
        workQueueLifecycleMutationAllowed: false,
      });
      expect(model.runtimeJobs[0]?.agentTeam.modelReadiness).toEqual(
        expect.arrayContaining([{ modelId: "deepseek/deepseek-v4-pro", status: "needs_review" }]),
      );
    });
  });

  it("records context scout output and compares it to implementation file choice", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "context-scout-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const scout = createContextScoutArtifact({
        scoutId: "scout-1",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        objective: "projection helper",
        relevantFiles: [
          "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
        ],
        existingPatterns: ["runtime artifact projection"],
        knownConstraints: ["no raw prompt storage"],
        risks: ["scope drift"],
        suggestedImplementationPath: ["edit runtime evidence helper"],
        unknowns: ["future live team runner"],
        filesNotToTouch: ["pnpm-lock.yaml"],
      });

      await recordContextScoutArtifact({ runtimeJobs, artifact: scout });
      expect(
        compareContextScoutToImplementation({
          scout,
          actualFilesChanged: [
            "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
          ],
        }),
      ).toMatchObject({
        handoffQuality: "satisfied",
        unexpectedFilesTouched: [],
        filesNotToTouchViolated: [],
      });
      expect(scout).toMatchObject({
        readOnly: true,
        writeAccessGranted: false,
        forbiddenAuthorityRequested: false,
      });
    });
  });

  it("records security/privacy review separately from final acceptance", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "security-review-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const artifact = buildSecurityPrivacyReviewerArtifact({
        reviewId: "security-review-1",
        reviewKind: "model_review_assist",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        objective: "review projection helper",
        filesReviewed: [
          "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
        ],
        evidenceRefs: ["artifact:evidence"],
        findings: [
          { severity: "medium", title: "authority boundary needs evidence", requiredFix: null },
        ],
        exploitabilityNotes: ["no exploit path in test fixture"],
        requiredFixes: [],
        recommendedFixes: ["keep V4 Pro needs_review"],
        residualRisk: ["future live runner not covered"],
        judgmentMade: true,
      });

      expect(validateSecurityPrivacyReviewerArtifact(artifact)).toMatchObject({ valid: true });
      await recordSecurityPrivacyReviewerArtifact({ runtimeJobs, artifact });
      expect(
        (await runtimeJobs.listArtifacts(runtimeJob.jobId)).map((item) => item.artifactType),
      ).toContain("agent_team.security_privacy_review");
      expect(
        validateSecurityPrivacyReviewerArtifact({
          ...artifact,
          findings: [{ severity: "high", title: "high risk", requiredFix: "fix" }],
        }),
      ).toMatchObject({ valid: false, blockingReasons: ["high_risk_finding_blocks_completion"] });
    });
  });

  it("applies pause redirect cancel controls at handoff boundaries", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "handoff-control-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const redirect = applyAgentTeamHandoffControl({
        commandId: "redirect-1",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        commandKind: "redirect",
        targetHandoffId: "handoff-1",
        actor: "operator",
        reason: "send to tester",
        nextRole: "test_engineer",
        redirectPayloadSummary: "rerun validation before review",
      });
      const unsafe = applyAgentTeamHandoffControl({
        commandId: "redirect-unsafe",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        commandKind: "redirect",
        targetHandoffId: "handoff-1",
        actor: "operator",
        reason: "include raw prompt",
        nextRole: "test_engineer",
        redirectPayloadSummary: "raw prompt marker",
      });

      await recordAgentTeamHandoffControl({ runtimeJobs, command: redirect });
      expect(redirect).toMatchObject({
        status: "applied",
        nextRole: "test_engineer",
        liveProcessSignalSent: false,
        promptInjectedIntoLiveProcess: false,
        workQueueLifecycleMutated: false,
      });
      expect(unsafe).toMatchObject({ status: "rejected", nextRole: null });
      expect(
        (await runtimeJobs.listArtifacts(runtimeJob.jobId)).map((item) => item.artifactType),
      ).toContain("agent_team.handoff_control");
    });
  });

  it("requires qualitative result review before completed-work success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "result-review-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const artifact = buildAgentTeamResultReviewArtifact({
        reviewId: "result-review-1",
        teamRunId: "team-run-1",
        runtimeJobId: runtimeJob.jobId,
        objective: "projection helper",
        validationEvidenceRefs: ["validation:passed"],
        closeoutRefs: ["closeout:pack"],
        filesChanged: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        reviewer: "operator",
        reviewKind: "local_codex_review",
        judgmentMade: true,
        notDeterministic: true,
        goalSatisfaction: "satisfied",
        findings: [],
        limitations: [],
        requiredFixes: [],
        humanCloseoutSummary: buildAgentTeamHumanCloseoutSummary({
          whatChanged: "Recorded a bounded result review.",
          whyItChanged: "The operator needs readable closeout.",
          filesTouched: [
            "extensions/execution-platform/src/codex-bridge/agent-team-result-review.ts",
          ],
          testsRun: ["focused result review test"],
          result: "accepted",
          nextStep: "continue",
          eli5Progress: "The review now explains the result in plain language.",
        }),
        accepted: true,
        needsReview: false,
        finalAcceptanceBy: "operator",
      });

      expect(validateAgentTeamResultReviewArtifact(artifact)).toEqual({
        valid: false,
        blockingReasons: ["accepted_result_requires_model_closeout_capsule"],
      });
    });
  });

  it("claims one agent-team job and persists team evidence without daemon behavior", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "agent-team-runner-work-item",
        itemType: "agent_team_task",
        title: "Agent team runner",
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: "agent-team-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: {
          teamRunId: "team-runner-1",
          objective: "agent-team-runtime-read-model-projection",
        },
      });
      await runtimeJobs.enqueueJob({
        jobId: "non-team-job",
        jobType: "executor.codex_bridge",
        queueName: "agent-team",
      });
      await workQueue.createWorkRun({
        runId: "agent-team-runner-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        metadata: { runKind: "agent_team" },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      }).runOnce();
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: true,
        failed: false,
        runtimeJobId: "agent-team-runner-job",
        teamRunId: "team-runner-1",
        daemonStarted: false,
        schedulerStarted: false,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      });
      expect(await runtimeJobs.getJob("non-team-job")).toMatchObject({ state: "pending" });
      expect(model.runtimeJobs[0]?.agentTeam).toMatchObject({
        agentTeamRunId: "team-runner-1",
        currentTeamState: "completed",
        validationState: "passed",
        closeoutState: "present",
        permissionEvidence: {
          localRepoWorkAllowed: true,
          deployRequiresApproval: true,
          outboundRequiresApproval: true,
          modelPromotionBlocked: true,
        },
      });
      expect(result.evidence?.permissionEvidence).toMatchObject({
        localRepoWorkAllowed: true,
        deployRequiresApproval: true,
        outboundRequiresApproval: true,
        secretsBlocked: true,
        destructiveDbMutationBlocked: true,
        modelPromotionBlocked: true,
        workQueueLifecycleMutationBlocked: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      });
      const resultReview = (await runtimeJobs.listArtifacts(job.jobId)).find(
        (artifact) => artifact.artifactType === "agent_team.result_review",
      );
      expect(resultReview?.metadata).toMatchObject({
        accepted: true,
        closeoutCapsuleStoredSeparately: true,
        humanCloseoutSummary: {
          artifactKind: "agent_team_human_closeout_summary",
          eli5Progress: expect.stringContaining("OpenClaw picked up the job, checked the work"),
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawLogsStored: false,
        },
      });
    });
  });

  it("uses front-door objectiveSummary and workflow-specific permission readback", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "architecture-runner-work-item",
        itemType: "agent_team_task",
        title: "Architecture runner",
      });
      const job = await runtimeJobs.enqueueJob({
        jobId: "architecture-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: {
          teamRunId: "architecture-team-runner-1",
          workflowId: "agent_team.architecture",
          objectiveSummary: "Review provider-degradation readback architecture.",
        },
      });
      await workQueue.createWorkRun({
        runId: "architecture-runner-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        metadata: { runKind: "agent_team" },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      }).runOnce();
      const artifacts = await runtimeJobs.listArtifacts(job.jobId);
      const resultReview = artifacts.find(
        (artifact) => artifact.artifactType === "agent_team.result_review",
      );

      expect(result).toMatchObject({
        completed: true,
        failed: false,
        evidence: {
          objective: "Review provider-degradation readback architecture.",
          permissionEvidence: {
            permissionModelId: "permission-model://agent_team.architecture/spec-review-readback.v1",
            decision: "allowed_workflow_scope",
            reasonCodes: ["architecture_workflow_permission_model_attached"],
          },
        },
      });
      expect(JSON.stringify(result.evidence?.permissionEvidence)).not.toContain(
        "coding_team_permission_wrong_workflow",
      );
      expect(resultReview?.metadata).toMatchObject({
        accepted: true,
        closeoutCapsuleStoredSeparately: true,
        humanCloseoutSummary: {
          result: "satisfied",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    });
  });

  it("resolves a long front-door source prompt for worker model input without storing it", async () => {
    const sessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-agent-source-"));
    const sessionId = "long-front-door-session";
    const longPrompt = [
      "Use OpenClaw to complete active-queue-08 with all runtime-backed checkpoints.",
      "Checkpoint details should survive the front-door handoff.",
      "UNIQUE_ACTIVE_QUEUE_08_FULL_PROMPT_TAIL",
    ].join("\n");
    await fs.writeFile(
      path.join(sessionRoot, `${sessionId}.jsonl`),
      `${JSON.stringify({
        type: "message",
        message: { role: "user", content: [{ type: "text", text: longPrompt }] },
      })}\n`,
      "utf8",
    );

    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "long-source-prompt-work-item",
        itemType: "agent_team_task",
        title: "Long source prompt",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "long-source-prompt-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: {
          teamRunId: "long-source-prompt-team",
          workflowId: "agent_team.coding",
          objectiveSummary: "Use OpenClaw to complete active-queue-08.",
          requireSingleJobCodingTeamQualityProof: true,
          sourcePromptRef: {
            refKind: "gateway_chat_transcript",
            promptHash: sha256Text(longPrompt),
            promptLength: longPrompt.length,
            sessionKey: "agent:main:main",
            sessionId,
            runId: "long-source-run",
            sourceRoute: "ux",
            rawPromptStored: false,
          },
        },
      });
      await workQueue.createWorkRun({
        runId: "long-source-prompt-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
      });

      const modelPrompts: string[] = [];
      const implementationObjectives: string[] = [];
      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
        sourcePromptSessionRoots: [sessionRoot],
        closeoutReporter: modelCloseoutReporterFixture(),
        implementationBridge: {
          async run(input) {
            implementationObjectives.push(input.objective);
            return {
              status: "completed" as const,
              transportKind: "codex_app_server" as const,
              modelRef: "openai-codex/gpt-5.5",
              providerPath: "codex_app_server",
              modelRunRef: "codex-app-server://long-source-implementation",
              responseHash: "sha256:implementation",
              startedAt: "2026-05-03T16:00:00.000Z",
              completedAt: "2026-05-03T16:00:01.000Z",
              latencyMs: 1_000,
              summary: "Implementation bridge received the full source prompt as volatile input.",
              changedFileRefs: [
                "extensions/execution-platform/src/codex-bridge/source-prompt-ref.ts",
              ],
              validationRefs: [
                "pnpm test:file extensions/execution-platform/src/codex-bridge/source-prompt-ref.test.ts",
              ],
              artifactRefs: ["runtime-job://long-source-prompt-job/codex-bridge/result"],
              reasonCodes: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        roleModelClient: {
          async callRole(input) {
            modelPrompts.push(input.prompt);
            return {
              status: "succeeded" as const,
              responseText: JSON.stringify({
                whatIWasAskedToDo: `${input.roleId} reviewed the full owner task.`,
                whatIActuallyDid: `${input.roleId} produced task-specific bounded evidence.`,
                evidenceRefs: ["runtime-job://long-source-prompt-job/evidence"],
                filesOrArtifactsTouched: [
                  "extensions/execution-platform/src/codex-bridge/source-prompt-ref.ts",
                ],
                validationIPerformed:
                  "pnpm test:file extensions/execution-platform/src/codex-bridge/source-prompt-ref.test.ts",
                whatWorked: ["source prompt ref resolved"],
                whatWasWeakOrFailed: ["broader live soak remains separate"],
                recommendedNextStep: "rerun active-queue-08 through OpenClaw",
                skillOrProcessOpportunitySeeds: [],
                confidence: "high",
                limitations: ["bounded test fixture"],
              }),
              responseHash: `sha256:${input.roleId}`,
              usage: null,
            };
          },
        },
      }).runOnce();

      expect(result.completed).toBe(true);
      expect(
        modelPrompts.some((prompt) => prompt.includes("UNIQUE_ACTIVE_QUEUE_08_FULL_PROMPT_TAIL")),
      ).toBe(true);
      expect(implementationObjectives).toEqual([
        expect.stringContaining("UNIQUE_ACTIVE_QUEUE_08_FULL_PROMPT_TAIL"),
      ]);
      const artifacts = await runtimeJobs.listArtifacts("long-source-prompt-job");
      const artifactText = JSON.stringify(artifacts.map((artifact) => artifact.metadata));
      expect(artifactText).toContain("source_prompt_ref_resolved_from_transcript");
      expect(artifactText).not.toContain("UNIQUE_ACTIVE_QUEUE_08_FULL_PROMPT_TAIL");
      expect(result.evidence?.objective).toBe("Use OpenClaw to complete active-queue-08.");
      expect(result.evidence?.sourcePromptResolution).toMatchObject({
        status: "resolved",
        rawPromptStored: false,
      });
    });
  });

  it("does not mark succeeded when model-authored closeout is unavailable", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "missing-model-closeout-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          teamRunId: "missing-model-closeout-team-runner-1",
          workflowId: "agent_team.coding",
          objectiveSummary: "Record task-specific evidence but omit model-authored closeout.",
        },
        maxAttempts: 1,
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
      }).runOnce();
      const job = await runtimeJobs.getJob("missing-model-closeout-runner-job");
      const artifacts = await runtimeJobs.listArtifacts("missing-model-closeout-runner-job");
      const resultReview = artifacts.find(
        (artifact) => artifact.artifactType === "agent_team.result_review",
      );

      expect(result).toMatchObject({
        completed: false,
        failed: true,
        failure: { message: "model_authored_closeout_required_before_success" },
      });
      expect(job).toMatchObject({ state: "failed" });
      expect(resultReview?.metadata).toMatchObject({
        accepted: false,
        humanCloseoutSummary: {
          result: "needs_review",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    });
  });

  it("turns closeout model timeout into needs-review evidence without false success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "timeout-model-closeout-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          teamRunId: "timeout-model-closeout-team-runner-1",
          workflowId: "agent_team.coding",
          objectiveSummary: "Record task-specific evidence but time out model closeout.",
        },
        maxAttempts: 1,
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
        closeoutReporter: {
          async createCapsule() {
            throw new Error("closeout_model_timeout");
          },
        },
      }).runOnce();
      const job = await runtimeJobs.getJob("timeout-model-closeout-runner-job");
      const artifacts = await runtimeJobs.listArtifacts("timeout-model-closeout-runner-job");
      const resultReview = artifacts.find(
        (artifact) => artifact.artifactType === "agent_team.result_review",
      );
      const timing = artifacts.find(
        (artifact) => artifact.artifactType === "agent_team.closeout_model_timing",
      );

      expect(result).toMatchObject({
        completed: false,
        failed: true,
        failure: { message: "closeout_model_timeout" },
      });
      expect(job).toMatchObject({ state: "failed" });
      expect(resultReview?.metadata).toMatchObject({
        accepted: false,
        requiredFixes: [
          "closeout model timed out before a model-authored Closeout Capsule could be accepted",
        ],
        closeoutTiming: {
          failureReason: "closeout_model_timeout",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      expect(timing?.metadata).toMatchObject({
        failureReason: "closeout_model_timeout",
        rawPromptStored: false,
        rawResponseStored: false,
      });
    });
  });

  it("does not mark succeeded when task-specific objective evidence is missing", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "missing-objective-runner-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          teamRunId: "missing-objective-team-runner-1",
          workflowId: "agent_team.qa_test",
        },
        maxAttempts: 1,
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "team-worker",
        queueName: "agent-team",
      }).runOnce();
      const job = await runtimeJobs.getJob("missing-objective-runner-job");

      expect(result).toMatchObject({
        completed: false,
        failed: true,
        failure: { message: "task_specific_closeout_evidence_required_before_success" },
      });
      expect(job).toMatchObject({ state: "failed" });
    });
  });
});
