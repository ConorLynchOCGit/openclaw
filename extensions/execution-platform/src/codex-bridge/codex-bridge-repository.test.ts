import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  CodexBridgeRepository,
  createEnvironmentContract,
  createExecutionSupervisorContract,
  createManualPromptSource,
  createShadowEvalFixture,
  createSoakFloodFixtureBatch,
  createTrustPolicy,
  createWorkQueuePromptSource,
  finalizePromptArtifact,
  listFutureSubagentRoleContracts,
  listModelLanePolicies,
  normalizeFakeAcpStreamEvent,
  normalizeFakeCodexCliStreamEvent,
  scoreSuppliedShadowEvalOutput,
  summarizeSoakFloodFixtureBatch,
  validateAlternativeModelCandidateForRole,
  validateTrustProfileId,
  type FakeAcpStreamEvent,
  type FakeCodexCliStreamEvent,
} from "./index.ts";

async function withRepository<T>(
  work: (input: {
    repository: CodexBridgeRepository;
    runtimeJobs: RuntimeJobRepository;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-02T00:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const repository = new CodexBridgeRepository(runtimeJobs, {
      now: () => now,
      maxInlineCompletedWorkBytes: 512,
    });
    return await work({
      repository,
      runtimeJobs,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    await database.close();
  }
}

describe("codex bridge proof harness", () => {
  it("normalizes manual prompt sources into finalized prompt artifact metadata", () => {
    const source = createManualPromptSource({
      promptId: "prompt-manual",
      objective: "Implement a typed proof harness",
      promptText: "Do the work",
      createdBy: "user",
      metadata: { token: "secret-value" },
    });
    const artifact = finalizePromptArtifact(source, "2026-05-02T00:00:00.000Z");

    expect(artifact).toMatchObject({
      artifactKind: "finalized_prompt",
      promptId: "prompt-manual",
      sourceKind: "manual",
      workItemId: null,
      objective: "Implement a typed proof harness",
    });
  });

  it("normalizes Work Queue card prompt sources into finalized prompt artifact metadata", () => {
    const source = createWorkQueuePromptSource({
      promptId: "prompt-work-queue",
      workItemId: "work-item-1",
      versionId: "version-1",
      title: "Card title",
      objective: "Execute approved card",
      promptText: "Codex-ready prompt",
      approvedBy: "user",
    });
    const artifact = finalizePromptArtifact(source, "2026-05-02T00:00:00.000Z");

    expect(artifact).toMatchObject({
      sourceKind: "work_queue_card",
      workItemId: "work-item-1",
      versionId: "version-1",
    });
  });

  it("enqueues a fake bridge job as executor runtime work and respects idempotency", async () => {
    await withRepository(async ({ repository }) => {
      const promptSource = createManualPromptSource({
        promptId: "prompt-1",
        objective: "Prove bridge enqueue",
        promptText: "No live Codex",
        createdBy: "user",
      });
      const first = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-job-1",
        executorKind: "codex_cli",
        promptSource,
        idempotencyKey: "same-bridge",
      });
      const duplicate = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-job-2",
        executorKind: "codex_cli",
        promptSource,
        idempotencyKey: "same-bridge",
      });

      expect(duplicate.jobId).toBe(first.jobId);
      expect(first).toMatchObject({
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
        state: "pending",
        payload: {
          family: "codex_bridge",
          executionMode: "fake_stream_proof",
          executorKind: "codex_cli",
        },
      });
    });
  });

  it("validates known trust profiles and rejects unknown profiles", () => {
    expect(createTrustPolicy("trusted_yolo_autobailout")).toMatchObject({
      allowsLocalYolo: true,
      allowsRebuild: true,
      allowsAutobailout: true,
      livePermissionGrant: false,
    });
    expect(() => validateTrustProfileId("root")).toThrow("unknown trust profile");
  });

  it("requires both trusted profile support and per-job autobailout permission", async () => {
    await withRepository(async ({ repository }) => {
      const promptSource = createManualPromptSource({
        objective: "Repair rebuild failure",
        promptText: "Fix and retry",
        createdBy: "user",
      });
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-no-autobailout",
        executorKind: "codex_cli",
        promptSource,
        trustProfileId: "trusted_yolo_autobailout",
        autobailoutPolicy: { allowAutobailout: false },
      });

      const result = await repository.classifyRebuildFailureAndCreateAutobailoutPlan({
        jobId: job.jobId,
        failureSummary: "rebuild failed",
        failureLogs: ["typescript error"],
        priorStreamEvidenceRefs: ["runtime-event://stream"],
        rebuildEvidenceRefs: ["runtime-event://rebuild"],
      });

      expect(result.classification).toMatchObject({
        eligible: false,
        state: "needs_review",
      });
      expect(result.plan).toBeNull();
      expect(result.classification.reasons).toContain("job_does_not_allow_autobailout");
    });
  });

  it("creates environment and supervisor contracts for external supervision", () => {
    expect(createExecutionSupervisorContract()).toMatchObject({
      supervisorName: "execution-supervisor",
      runsOutsideOpenClawAppContainer: true,
      liveDaemonImplemented: false,
    });
    expect(createEnvironmentContract()).toMatchObject({
      repoPath: "/root/services/openclaw-roles/live",
      workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
      safeUiBridge: { tailscaleRequired: true },
      secretsIncluded: false,
    });
  });

  it("normalizes fake Codex CLI stream events into the common envelope", () => {
    const event: FakeCodexCliStreamEvent = {
      source: "codex_cli",
      type: "assistant_update",
      sequence: 1,
      timestamp: "2026-05-02T00:00:01.000Z",
      message: "Reading files in /root/services/openclaw-roles/live",
      metadata: { api_key: "secret" },
    };

    expect(normalizeFakeCodexCliStreamEvent(event)).toMatchObject({
      eventKind: "assistant_update",
      sourceProtocol: "codex_cli",
      providerCallMade: false,
      liveExecutorCallMade: false,
      data: {
        metadata: {
          api_key: "[redacted]",
        },
      },
    });
  });

  it("normalizes fake ACP JSON-RPC stream events into the common envelope", () => {
    const event: FakeAcpStreamEvent = {
      jsonrpc: "2.0",
      method: "tool/callOutput",
      sequence: 2,
      timestamp: "2026-05-02T00:00:02.000Z",
      params: {
        toolName: "read",
        output: "file content",
      },
    };

    expect(normalizeFakeAcpStreamEvent(event)).toMatchObject({
      eventKind: "tool_call_output",
      sourceProtocol: "acp",
      summary: "file content",
    });
  });

  it("persists normalized stream events as bounded runtime evidence and preserves oversight order", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-stream",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Stream proof",
          promptText: "Capture stream",
          createdBy: "user",
        }),
      });

      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "session_started",
          sequence: 1,
          timestamp: "2026-05-02T00:00:01.000Z",
          message: "session",
        },
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "assistant_update",
          sequence: 2,
          timestamp: "2026-05-02T00:00:02.000Z",
          message: "I am checking the repo path",
        },
      });
      await repository.ingestFakeAcpStreamEvent({
        jobId: job.jobId,
        event: {
          jsonrpc: "2.0",
          method: "tool/callOutput",
          sequence: 3,
          timestamp: "2026-05-02T00:00:03.000Z",
          params: { output: "pwd -> /root/services/openclaw-roles/live" },
        },
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "final_response",
          sequence: 4,
          timestamp: "2026-05-02T00:00:04.000Z",
          message: "Done",
        },
      });

      const status = await repository.readCodexBridgeExecutionStatus(job.jobId);

      expect(status.oversight.streamEvents.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
      expect(status.oversight.assistantUpdates).toEqual(["I am checking the repo path"]);
      expect(status.oversight.toolOutputs).toEqual(["pwd -> /root/services/openclaw-roles/live"]);
      expect(status.oversight.finalResponse).toBe("Done");
      expect(status.oversight.repoPath).toBe("/root/services/openclaw-roles/live");
      expect(status.oversight.safeUiBridgePresent).toBe(true);
      expect(status.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.stream_event" }),
        ]),
      );
    });
  });

  it("keeps rebuild restart evidence recoverable instead of terminal", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-rebuild-started",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Rebuild app",
          promptText: "Rebuild and resume",
          createdBy: "user",
        }),
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "rebuild_started",
          sequence: 1,
          timestamp: "2026-05-02T00:00:01.000Z",
          message: "rebuild started",
        },
      });

      await expect(repository.readCodexBridgeExecutionStatus(job.jobId)).resolves.toMatchObject({
        completionState: "unknown",
      });
    });
  });

  it("creates bailout-required evidence and an autobailout plan when policy permits", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-autobailout",
        executorKind: "codex_cli",
        trustProfileId: "trusted_yolo_autobailout",
        autobailoutPolicy: { allowAutobailout: true, maxBailoutAttempts: 2 },
        promptSource: createManualPromptSource({
          objective: "Fix rebuild failure",
          promptText: "Find and fix the failed rebuild",
          createdBy: "user",
        }),
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "rebuild_failed",
          sequence: 1,
          timestamp: "2026-05-02T00:00:01.000Z",
          error: { code: "rebuild_failed", message: "tsgo failed" },
        },
      });

      const result = await repository.classifyRebuildFailureAndCreateAutobailoutPlan({
        jobId: job.jobId,
        failureSummary: "tsgo failed",
        failureLogs: ["Type error"],
        priorStreamEvidenceRefs: ["runtime-event://stream/1"],
        rebuildEvidenceRefs: ["runtime-event://rebuild/1"],
      });
      const status = await repository.readCodexBridgeExecutionStatus(job.jobId);

      expect(result.classification).toMatchObject({
        eligible: true,
        state: "bailout_required",
      });
      expect(result.plan).toMatchObject({
        liveExecutionStarted: false,
        maxBailoutAttempts: 2,
      });
      expect(status.completionState).toBe("bailout_required");
      expect(status.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.autobailout_plan" }),
        ]),
      );
    });
  });

  it("does not treat process completion as validation success", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-process-complete",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Complete process",
          promptText: "Return",
          createdBy: "user",
        }),
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "session_completed",
          sequence: 1,
          timestamp: "2026-05-02T00:00:01.000Z",
          message: "process exited",
        },
      });

      const status = await repository.readCodexBridgeExecutionStatus(job.jobId);

      expect(status.completionState).toBe("executor_completed");
      expect(status.completionState).not.toBe("validation_passed");
    });
  });

  it("attaches typed completed work artifacts and rejects oversized inline text", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-completed-work",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Produce artifacts",
          promptText: "Return final",
          createdBy: "user",
        }),
      });

      for (const completedWorkKind of [
        "final_response",
        "diff_summary",
        "validation_report",
        "rebuild_report",
        "followup_prompt",
        "handoff_notes",
      ] as const) {
        await repository.attachCompletedWorkArtifact({
          jobId: job.jobId,
          completedWorkKind,
          summary: completedWorkKind,
          inlineText: "small",
        });
      }

      await expect(
        repository.attachCompletedWorkArtifact({
          jobId: job.jobId,
          completedWorkKind: "final_response",
          summary: "too large",
          inlineText: "x".repeat(600),
        }),
      ).rejects.toThrow("completed work inline text exceeds");

      const status = await repository.readCodexBridgeExecutionStatus(job.jobId);
      expect(
        status.artifacts.filter((artifact) =>
          artifact.artifactType.startsWith("codex_bridge.completed_work."),
        ),
      ).toHaveLength(6);
    });
  });

  it("represents pause, redirect, and cancel stream events", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-control-events",
        executorKind: "acp",
        promptSource: createManualPromptSource({
          objective: "Control events",
          promptText: "Pause redirect cancel",
          createdBy: "user",
        }),
      });
      for (const [sequence, method] of [
        [1, "control/pauseRequested"],
        [2, "control/paused"],
        [3, "control/redirectRequested"],
        [4, "control/redirectApplied"],
        [5, "control/cancelRequested"],
        [6, "control/canceled"],
      ] as const) {
        await repository.ingestFakeAcpStreamEvent({
          jobId: job.jobId,
          event: {
            jsonrpc: "2.0",
            method,
            sequence,
            timestamp: `2026-05-02T00:00:0${sequence}.000Z`,
          },
        });
      }

      await expect(repository.readCodexBridgeExecutionStatus(job.jobId)).resolves.toMatchObject({
        completionState: "canceled",
        oversight: {
          streamEvents: [
            expect.objectContaining({ eventKind: "pause_requested" }),
            expect.objectContaining({ eventKind: "paused" }),
            expect.objectContaining({ eventKind: "redirect_requested" }),
            expect.objectContaining({ eventKind: "redirect_applied" }),
            expect.objectContaining({ eventKind: "cancel_requested" }),
            expect.objectContaining({ eventKind: "canceled" }),
          ],
        },
      });
    });
  });

  it("lists future subagent roles as metadata with skill, output, escalation, and prohibition fields", () => {
    const roles = listFutureSubagentRoleContracts();

    expect(roles).toHaveLength(10);
    expect(roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleId: "orchestrator",
          liveAuthorityGranted: false,
          requiredSkills: expect.arrayContaining(["execution-platform-runtime-truth"]),
          outputs: expect.arrayContaining(["execution plan"]),
          escalationTriggers: expect.any(Array),
          prohibitedActions: expect.arrayContaining(["bypassing runtime job truth"]),
        }),
      ]),
    );
  });

  it("keeps frontier orchestration and strong coding lanes on frontier GPT-class models", () => {
    const lanes = listModelLanePolicies();

    expect(lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: "frontier_orchestrator",
          allowedFamilies: ["Frontier GPT"],
          frontierGptRequired: true,
          liveAuthorityAllowed: false,
        }),
        expect.objectContaining({
          laneId: "strong_coding",
          allowedFamilies: ["Frontier GPT"],
          frontierGptRequired: true,
          liveAuthorityAllowed: false,
        }),
      ]),
    );
  });

  it("limits cheaper candidates to shadow or soak qualification unless promoted by role metadata", () => {
    expect(
      validateAlternativeModelCandidateForRole({
        provider: "deepseek",
        model: "deepseek-candidate",
        family: "DeepSeek",
        targetRoleId: "test_engineer",
      }),
    ).toMatchObject({
      eligible: true,
      mode: "shadow_eval_only",
    });
    expect(
      validateAlternativeModelCandidateForRole({
        provider: "deepseek",
        model: "deepseek-candidate",
        family: "DeepSeek",
        targetRoleId: "implementation_engineer",
      }),
    ).toMatchObject({
      eligible: false,
      reasons: expect.arrayContaining(["role_requires_frontier_gpt_lane"]),
    });
  });

  it("creates and summarizes soak-flood fixture batch metadata without provider calls", () => {
    const batch = createSoakFloodFixtureBatch({
      batchId: "soak-1",
      roleId: "test_engineer",
      fixtureCount: 500,
      purpose: "rapidly invalidate weak cheap-model test generation",
      candidateFamilies: ["DeepSeek", "Qwen"],
    });

    expect(summarizeSoakFloodFixtureBatch(batch)).toMatchObject({
      batchId: "soak-1",
      fixtureCount: 500,
      noProviderCallMade: true,
      liveAuthorityGranted: false,
    });
  });

  it("scores supplied shadow-eval outputs only and records no provider call evidence", () => {
    const fixture = createShadowEvalFixture({
      fixtureId: "fixture-1",
      roleId: "test_engineer",
      objective: "Write durable runtime tests",
      input: { spec: "runtime job claim behavior" },
      expectedOutputKinds: ["tests", "validation"],
      frontierBaselineRef: "artifact://frontier-baseline",
    });
    const scorecard = scoreSuppliedShadowEvalOutput(fixture, {
      fixtureId: "fixture-1",
      candidate: {
        provider: "deepseek",
        model: "deepseek-candidate",
        family: "DeepSeek",
        targetRoleId: "test_engineer",
      },
      output: {
        tests: ["claim once"],
        validation: ["vitest"],
      },
      reviewNotes: ["matches fixture", "bounded scope"],
      noProviderCallMade: true,
    });

    expect(scorecard).toMatchObject({
      passed: true,
      noProviderCallMade: true,
      liveAuthorityGranted: false,
      structuralChecks: { expectedOutputKindsPresent: true },
    });
  });

  it("does not invoke live Codex, ACP, shell, provider, rebuild, or scheduler paths", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueFakeCodexBridgeJob({
        jobId: "bridge-no-live-calls",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "No live calls",
          promptText: "Use fake stream only",
          createdBy: "user",
        }),
      });
      await repository.ingestFakeCodexCliStreamEvent({
        jobId: job.jobId,
        event: {
          source: "codex_cli",
          type: "heartbeat",
          sequence: 1,
          timestamp: "2026-05-02T00:00:01.000Z",
          metadata: {
            providerCallMade: false,
            liveExecutorCallMade: false,
            shellExecutionMade: false,
            rebuildMade: false,
            schedulerStarted: false,
          },
        },
      });

      const status = await repository.readCodexBridgeExecutionStatus(job.jobId);

      expect(status.payload).toMatchObject({
        executionMode: "fake_stream_proof",
        supervisor: {
          liveDaemonImplemented: false,
        },
      });
      expect(status.oversight.streamEvents[0]).toMatchObject({
        providerCallMade: false,
        liveExecutorCallMade: false,
      });
    });
  });
});
