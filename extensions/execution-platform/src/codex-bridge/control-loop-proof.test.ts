import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLatestWorkEpisodeOutcomePack } from "../../../../src/infra/model-memory-proactivity-runtime.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  CodexBridgeControlLoopProofRepository,
  CodexBridgeRepository,
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  createManualPromptSource,
  evaluateCodexBridgeEmissionGuardrails,
  writeCodexBridgeFakeControlLoopProofArtifact,
} from "./index.ts";

async function withProofHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    control: CodexBridgeControlBridgeRepository;
    closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
    proof: CodexBridgeControlLoopProofRepository;
    workQueue: WorkQueueRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "control-loop-proof-"));
  let now = new Date("2026-05-02T23:00:00.000Z");
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const closeout = new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, {
      now: () => now,
      artifactRoot,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const control = new CodexBridgeControlBridgeRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      maxArtifactMetadataBytes: 128 * 1024,
      staleHeartbeatMs: 30_000,
    });
    const proof = new CodexBridgeControlLoopProofRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      controlBridge: control,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      control,
      closeout,
      proof,
      workQueue,
      artifactRoot,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    if (previousPackRoot === undefined) {
      delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    } else {
      process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousPackRoot;
    }
    await database.close();
  }
}

async function seedBridgeJob(input: {
  bridge: CodexBridgeRepository;
  jobId?: string;
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}) {
  return input.bridge.enqueueFakeCodexBridgeJob({
    jobId: input.jobId ?? "bridge-control-loop",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Fake control-loop proof",
      promptText: "Observe only.",
      createdBy: "operator",
    }),
    workQueueLink: input.workQueueLink,
  });
}

describe("Codex bridge fake control-loop proof", () => {
  it("creates a fake control-loop proof for a bridge job and records durable redirect", async () => {
    await withProofHarness(async ({ bridge, proof, runtimeJobs }) => {
      await seedBridgeJob({ bridge });

      const result = await proof.runFakeControlLoopProof({
        proofId: "proof-runtime-substrate",
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "runtime_substrate_mismatch",
        selectedControlCommandKind: "redirect",
        acknowledgeCommand: true,
        markApplied: true,
      });

      expect(result).toMatchObject({
        proofMode: "fake_control_loop",
        simulatedHazard: "runtime_substrate_mismatch",
        selectedControlCommandKind: "redirect",
        controlCommandStatus: "applied",
        controlsTargetSeparateExecutorSession: true,
        manualOperatorSessionSharedWithExecutor: false,
        liveProcessSignalSent: false,
        promptInjectedIntoLiveProcess: false,
        noLiveExecutionAudit: {
          codexCliInvoked: false,
          commandExecuted: false,
          workQueueLifecycleMutated: false,
        },
      });
      expect(result.commandHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            commandKind: "redirect",
            status: "applied",
            liveProcessSignalSent: false,
          }),
        ]),
      );
      await expect(runtimeJobs.listArtifacts("bridge-control-loop")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactType: "codex_bridge.fake_control_loop_proof",
          }),
          expect.objectContaining({
            artifactType: "codex_bridge.fake_control_loop_stream_snapshot",
          }),
          expect.objectContaining({
            artifactType: "codex_bridge.fake_control_loop_readiness_report",
          }),
          expect.objectContaining({ artifactType: "codex_bridge.control_command" }),
        ]),
      );
      await expect(runtimeJobs.listEvents("bridge-control-loop", 200)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.fake_control_loop_completed" }),
          expect.objectContaining({ eventType: "codex_bridge.control_command_applied" }),
        ]),
      );
    });
  });

  it("rejects non-bridge runtime jobs", async () => {
    await withProofHarness(async ({ runtimeJobs, proof }) => {
      await runtimeJobs.enqueueJob({ jobId: "plain-job", jobType: "plain.job" });

      await expect(
        proof.runFakeControlLoopProof({
          runtimeJobId: "plain-job",
          createdBy: "operator",
          simulatedHazard: "runtime_substrate_mismatch",
        }),
      ).rejects.toThrow("not a codex bridge job");
    });
  });

  it("surfaces missing closeout evidence as pause-worthy runtime control intent", async () => {
    await withProofHarness(async ({ bridge, proof }) => {
      await seedBridgeJob({ bridge });

      const result = await proof.runFakeControlLoopProof({
        proofId: "proof-missing-closeout",
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "missing_closeout_evidence",
        selectedControlCommandKind: "pause",
      });

      expect(result.controlReasonCategory).toBe("missing_closeout_evidence");
      expect(result.closeoutGateState).toMatchObject({
        allowed: false,
        pauseOrRedirectWorthy: true,
        blockingReasons: expect.arrayContaining(["work_episode_closeout_missing"]),
      });
      expect(result.fakeControlLoopReadiness).toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["closeout_gate_not_satisfied"]),
      });
      expect(result.commandHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            commandKind: "pause",
            reasonCategory: "missing_closeout_evidence",
          }),
        ]),
      );
    });
  });

  it("passes closeout gate when previous meaningful job has a discoverable pack", async () => {
    await withProofHarness(async ({ bridge, proof, closeout }) => {
      await seedBridgeJob({ bridge, jobId: "previous-bridge-job" });
      await closeout.emitCloseoutForRuntimeJob({
        runtimeJobId: "previous-bridge-job",
        closeout: {
          runtimeJobId: "previous-bridge-job",
          completedAt: "2026-05-02T23:00:00.000Z",
          userGoal: "Prepare prior bridge work evidence.",
          workSummary: "Prior meaningful bridge work produced bounded evidence for closeout.",
          finalOutcome: "Closeout pack exists before the next fake control-loop proof.",
          filesTouched: [],
          testsRun: [
            {
              command: "fake prior validation",
              status: "passed",
              summary: "Prior closeout proof validation passed.",
            },
          ],
        },
      });
      await seedBridgeJob({ bridge });

      const result = await proof.runFakeControlLoopProof({
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "runtime_substrate_mismatch",
        previousRuntimeJobId: "previous-bridge-job",
      });

      expect(result.closeoutGateState).toMatchObject({
        previousRuntimeJobId: "previous-bridge-job",
        nextExecutionAllowed: true,
      });
      expect(result.fakeControlLoopReadiness.allowed).toBe(true);
      await expect(loadLatestWorkEpisodeOutcomePack()).resolves.toMatchObject({
        projectId: "execution-platform",
      });
    });
  });

  it("detects deterministic-vs-model-judgment overclaim and records emission guardrail evidence", async () => {
    await withProofHarness(async ({ bridge, proof, runtimeJobs }) => {
      await seedBridgeJob({ bridge });

      const result = await proof.runFakeControlLoopProof({
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "deterministic_vs_model_judgment_violation",
        selectedControlCommandKind: "redirect",
      });

      expect(result.emissionGuardrailReport).toMatchObject({
        detected: true,
        severity: "blocking",
        recommendedControlReason: "deterministic_vs_model_judgment_violation",
        matchedPhrases: expect.arrayContaining(["deterministic deep critique"]),
        stringPatternOnly: true,
        noSemanticUnderstandingClaimed: true,
      });
      expect(result.controlReasonCategory).toBe("deterministic_vs_model_judgment_violation");
      await expect(runtimeJobs.listArtifacts("bridge-control-loop")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.emission_guardrail_report" }),
        ]),
      );
    });
  });

  it("preserves Work Queue link metadata without lifecycle mutation", async () => {
    await withProofHarness(async ({ bridge, proof, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-control-loop",
        itemType: "build_plan",
        title: "Control loop proof",
      });
      await seedBridgeJob({
        bridge,
        workQueueLink: { workItemId: "work-item-control-loop", runId: "run-1", stepId: "step-1" },
      });

      const result = await proof.runFakeControlLoopProof({
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "runtime_substrate_mismatch",
      });

      expect(result.workQueueLink).toEqual({
        workItemId: "work-item-control-loop",
        runId: "run-1",
        stepId: "step-1",
      });
      expect(result.noLiveExecutionAudit.workQueueLifecycleMutated).toBe(false);
      await expect(workQueue.readWorkItemTruth("work-item-control-loop")).resolves.toMatchObject({
        item: { lifecycleState: "draft" },
      });
    });
  });

  it("writes a bounded fake control-loop proof artifact without raw private content", async () => {
    await withProofHarness(async ({ bridge, proof, artifactRoot }) => {
      await seedBridgeJob({ bridge });
      const result = await proof.runFakeControlLoopProof({
        runtimeJobId: "bridge-control-loop",
        sessionId: "session-control-loop",
        createdBy: "operator",
        simulatedHazard: "runtime_substrate_mismatch",
      });

      const artifact = await writeCodexBridgeFakeControlLoopProofArtifact({
        proof: result,
        artifactPath: path.join(artifactRoot, "fake-control-loop-proof-8q.json"),
      });

      expect(artifact).toMatchObject({ proofId: result.proofId });
      expect(JSON.stringify(result).toLowerCase()).not.toContain("raw full transcript");
      expect(JSON.stringify(result).toLowerCase()).not.toContain("secret-marker");
    });
  });

  it("emission guardrail uses deterministic string patterns only", () => {
    const report = evaluateCodexBridgeEmissionGuardrails({
      checkedAt: "2026-05-02T23:00:00.000Z",
      text: "This deterministic deep critique proves best-in-class robustness.",
    });

    expect(report).toMatchObject({
      detected: true,
      severity: "blocking",
      recommendedControlReason: "deterministic_vs_model_judgment_violation",
      stringPatternOnly: true,
      noSemanticUnderstandingClaimed: true,
    });
  });
});
