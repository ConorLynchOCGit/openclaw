import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodeWritingPilotLiveEntrypointRepository,
  CodexBridgeRepository,
  LiveCodexRunner,
  createManualPromptSource,
  type CodeWritingPilotExecutionApproval,
  type CodeWritingPilotPlan,
  type CodeWritingPilotPromptPackage,
  type CodeWritingPilotRequestSkeleton,
  type CodexRunnerChildProcess,
  type CodexRunnerSpawn,
  type CodexRunnerSpawnOptions,
} from "./index.ts";

class FakeChildProcess extends EventEmitter implements CodexRunnerChildProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("close", null, typeof signal === "string" ? signal : null));
    return true;
  }

  override on(
    event: "error" | "exit" | "close",
    listener: (codeOrError?: number | Error | null, signal?: NodeJS.Signals | null) => void,
  ): this {
    return super.on(event, listener);
  }
}

function createFakeSpawn(input: {
  stdoutLines?: string[];
  closeCode?: number;
  onSpawn?: (command: string, args: string[], options: CodexRunnerSpawnOptions) => void;
}): CodexRunnerSpawn {
  return (command, args, options) => {
    input.onSpawn?.(command, args, options);
    const child = new FakeChildProcess();
    queueMicrotask(() => {
      for (const line of input.stdoutLines ?? []) {
        child.stdout.write(`${line}\n`);
      }
      child.stdout.end();
      child.stderr.end();
      child.emit("close", input.closeCode ?? 0, null);
    });
    return child;
  };
}

async function withLivePilotHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    entrypoint: CodeWritingPilotLiveEntrypointRepository;
    workQueue: WorkQueueRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "code-writing-live-"));
  let now = new Date("2026-05-03T03:00:00.000Z");
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const entrypoint = new CodeWritingPilotLiveEntrypointRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 160 * 1024,
      closeoutArtifactRoot: artifactRoot,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      entrypoint,
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

async function seedBridgeJob(bridge: CodexBridgeRepository): Promise<void> {
  await bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-live-code-writing",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Live code-writing pilot test",
      promptText: "Plan came from Slice 8S.",
      createdBy: "operator",
    }),
  });
}

function plan(overrides: Partial<CodeWritingPilotPlan> = {}): CodeWritingPilotPlan {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_plan",
    pilotPlanId: "pilot-plan-8s",
    runtimeJobId: "bridge-live-code-writing",
    sessionId: "session-8t",
    createdAt: "2026-05-03T03:00:00.000Z",
    createdBy: "operator",
    pilotKind: "code_writing_bridge_pilot",
    planMode: "plan_only",
    selectedObjective: {
      candidateId: "add-inert-prompt-package-regression-test",
      title: "Add inert prompt-package regression test",
      objective:
        "Add one focused regression assertion that code-writing pilot prompt packages remain inert metadata with no live authority.",
      targetFiles: [
        "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
      ],
      expectedTests: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
      ],
      patchType: "source_test",
    },
    objectiveRiskClass: "tiny_non_critical_patch",
    targetFiles: ["extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts"],
    maxFilesAllowed: 1,
    maxPatchScopeSummary: "single test file",
    expectedTests: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    validationPlan: ["run focused test"],
    rollbackPlan: ["revert single test-file patch"],
    noRebuildRequired: true,
    noDbMigrationRequired: true,
    noDependencyChangeRequired: true,
    noWorkQueueLifecycleMutation: true,
    noAcp: true,
    noSubagents: true,
    noAutobailout: true,
    noTrustedYolo: true,
    noModelPromotion: true,
    noProviderDirectCall: true,
    repoPath: "/root/services/openclaw-roles/live",
    workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
    safeUiBridgeMetadata: { tailscaleRequired: true },
    workQueueLink: null,
    priorCloseoutGateState: {},
    controlReadinessSummary: {},
    fakeControlLoopProofRef: "fake-control-loop",
    fakeRedirectApplicationProofRef: "fake-redirect",
    skillTriggerReport: {},
    skillReadinessReport: {},
    skillAuditLintReport: {},
    qualitativeReviewBoundary: {},
    emissionGuardrailState: {},
    expectedOversightStreamChannels: ["stream_event"],
    expectedControlCommands: ["pause", "redirect", "cancel"],
    expectedCloseoutBehavior: "emit closeout",
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    liveExecutionEnabled: false,
    codexCliInvoked: false,
    commandExecuted: false,
    allowedToCreateLiveRequest: true,
    allowedToRunLivePilot: false,
    blockingReasons: [],
    requiredNextOperatorAction:
      "request_explicit_operator_approval_for_first_code_writing_bridge_pilot",
    ...overrides,
  };
}

function request(
  overrides: Partial<CodeWritingPilotRequestSkeleton> = {},
): CodeWritingPilotRequestSkeleton {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_request_skeleton",
    requestId: "request-8s",
    pilotPlanId: "pilot-plan-8s",
    runtimeJobId: "bridge-live-code-writing",
    sessionId: "session-8t",
    requestedMode: "code_writing_bridge_pilot",
    requestedBy: "operator",
    requestedAt: "2026-05-03T03:00:00.000Z",
    expiresAt: "2026-05-03T04:00:00.000Z",
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    enableLiveCodexPilot: false,
    enableCodeWritingBridgePilot: false,
    acknowledgeSeparateExecutorSession: false,
    acknowledgeNoSharedManualSession: false,
    acknowledgeCodeWritingRisk: false,
    acknowledgeNoRebuild: true,
    acknowledgeNoAutobailout: true,
    acknowledgeNoSubagents: true,
    acknowledgeNoWorkQueueLifecycleMutation: true,
    maxRuntimeMs: 120_000,
    maxStdoutBytes: 256 * 1024,
    maxStderrBytes: 64 * 1024,
    maxFilesTouched: 1,
    targetFiles: ["extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts"],
    expectedTests: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    status: "planned_not_approved",
    commandExecuted: false,
    liveExecutionEnabled: false,
    ...overrides,
  };
}

function promptPackage(
  overrides: Partial<CodeWritingPilotPromptPackage> = {},
): CodeWritingPilotPromptPackage {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_prompt_package",
    promptPackageId: "prompt-package-8s",
    pilotPlanId: "pilot-plan-8s",
    runtimeJobId: "bridge-live-code-writing",
    sessionId: "session-8t",
    objective:
      "Add one focused regression assertion that code-writing pilot prompt packages remain inert metadata with no live authority.",
    allowedFiles: [
      "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    prohibitedActions: ["Do not rebuild.", "Do not use subagents."],
    validationPlan: ["run focused test"],
    rollbackExpectations: ["revert single test-file patch"],
    closeoutRequirement: "emit closeout",
    controlBridgeExpectations: ["durable controls"],
    processCompletionIsTaskSuccess: false,
    rawTranscriptIncluded: false,
    hiddenReasoningRequested: false,
    shellCommandRequestedFromRuntimePayload: false,
    rebuildAuthorityGranted: false,
    autobailoutAuthorityGranted: false,
    subagentAuthorityGranted: false,
    acpAuthorityGranted: false,
    providerDirectCallAuthorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    inertMetadataOnly: true,
    ...overrides,
  };
}

function approval(
  overrides: Partial<CodeWritingPilotExecutionApproval> = {},
): CodeWritingPilotExecutionApproval {
  return {
    approvedBy: "operator",
    approvedAt: "2026-05-03T03:00:00.000Z",
    approvalScope: "single_code_writing_bridge_pilot",
    runtimeJobId: "bridge-live-code-writing",
    pilotPlanId: "pilot-plan-8s",
    requestId: "request-8s",
    promptPackageId: "prompt-package-8s",
    sessionId: "session-8t",
    enableLiveCodexPilot: true,
    enableCodeWritingBridgePilot: true,
    acknowledgeSeparateExecutorSession: true,
    acknowledgeNoSharedManualSession: true,
    acknowledgeCodeWritingRisk: true,
    acknowledgeNoRebuild: true,
    acknowledgeNoAutobailout: true,
    acknowledgeNoSubagents: true,
    acknowledgeNoWorkQueueLifecycleMutation: true,
    enableBoundedValidationRepair: true,
    acknowledgeApprovedValidationCommandAuthority: true,
    approvedValidationCommands: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    maxValidationRepairAttempts: 2,
    approvedTargetFiles: [
      "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    maxRuntimeMs: 60_000,
    maxStdoutBytes: 128 * 1024,
    maxStderrBytes: 32 * 1024,
    reason: "operator-approved test",
    ...overrides,
  };
}

describe("code-writing pilot live entrypoint", () => {
  it("refuses without explicit approval and live flags", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      const result = await entrypoint.runApprovedLivePilot({
        plan: plan(),
        requestSkeleton: request(),
        promptPackage: promptPackage(),
        approval: approval({
          approvedBy: "",
          enableLiveCodexPilot: false,
          enableCodeWritingBridgePilot: false,
        }),
        runner: new LiveCodexRunner({ spawn: createFakeSpawn({}) }),
      });

      expect(result.commandExecuted).toBe(false);
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          "operator_approval_required",
          "enable_live_codex_pilot_required",
          "enable_code_writing_bridge_pilot_required",
          "live_codex_pilot_not_enabled",
        ]),
      );
    });
  });

  it("refuses target mismatches and unsafe future authority", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      const result = await entrypoint.runApprovedLivePilot({
        plan: plan({
          targetFiles: ["extensions/execution-platform/src/codex-bridge/other.test.ts"],
        }),
        requestSkeleton: { ...request(), commandExecuted: true as unknown as false },
        promptPackage: promptPackage(),
        approval: approval(),
        runner: new LiveCodexRunner({ spawn: createFakeSpawn({}) }),
      });

      expect(result.commandExecuted).toBe(false);
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          "slice_8s_request_already_executed",
          "approved_target_files_mismatch",
        ]),
      );
    });
  });

  it("records live-shaped evidence with fake spawn without invoking real Codex", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint, runtimeJobs }) => {
      await seedBridgeJob(bridge);
      let spawned: { command: string; args: string[] } | null = null;
      const runner = new LiveCodexRunner({
        enableLiveCodexPilot: true,
        spawn: createFakeSpawn({
          stdoutLines: [
            JSON.stringify({ type: "thread.started", thread_id: "fake-thread" }),
            JSON.stringify({
              type: "item.completed",
              item: { type: "agent_message", text: "Added the inert prompt package assertion." },
            }),
            JSON.stringify({ type: "turn.completed" }),
          ],
          onSpawn: (command, args) => {
            spawned = { command, args };
          },
        }),
      });
      const result = await entrypoint.runApprovedLivePilot({
        liveCodeWritingPilotRunId: "live-code-writing-8t",
        plan: plan(),
        requestSkeleton: request(),
        promptPackage: promptPackage(),
        approval: approval(),
        runner,
        changedFilesAfterRun: [
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
        ],
      });

      expect(spawned).toMatchObject({
        command: "codex",
        args: expect.arrayContaining([
          "exec",
          "--json",
          "--cd",
          "/root/services/openclaw-roles/live",
        ]),
      });
      expect(result).toMatchObject({
        liveCodeWritingPilotRunId: "live-code-writing-8t",
        commandExecuted: true,
        codexCliInvoked: false,
        fileScopeSatisfied: true,
        finalResponsePresent: true,
        finalResponseCandidate: "Added the inert prompt package assertion.",
        executorValidationCommandAllowed: true,
        approvedValidationCommands: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
        ],
        validationRepairMaxAttempts: 2,
        shellCommandAuthorityScope: "approved_validation_commands_only",
        diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only",
        completedWorkPathSatisfied: false,
      });
      await expect(runtimeJobs.listArtifacts("bridge-live-code-writing")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.code_writing_pilot_live_result" }),
          expect.objectContaining({
            artifactType: "codex_bridge.code_writing_pilot_file_scope_report",
          }),
        ]),
      );
    });
  });

  it("materializes bounded validation commands as a list without broad shell authority", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      let prompt = "";
      const approvedValidationCommands = [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
        "pnpm tsgo:full",
      ];
      const runner = new LiveCodexRunner({
        enableLiveCodexPilot: true,
        spawn: createFakeSpawn({
          stdoutLines: [JSON.stringify({ type: "turn.completed" })],
          onSpawn: (_command, args) => {
            prompt = args.at(-1) ?? "";
          },
        }),
      });
      const scopedPlan = plan({
        targetFiles: ["extensions/execution-platform/src/codex-bridge/"],
        maxFilesAllowed: 8,
        expectedTests: approvedValidationCommands,
      });

      const result = await entrypoint.runApprovedLivePilot({
        liveCodeWritingPilotRunId: "live-code-writing-validation-repair",
        plan: scopedPlan,
        requestSkeleton: request({
          targetFiles: scopedPlan.targetFiles,
          maxFilesTouched: 8,
          expectedTests: scopedPlan.expectedTests,
        }),
        promptPackage: promptPackage({
          allowedFiles: scopedPlan.targetFiles,
          validationPlan: scopedPlan.expectedTests,
        }),
        approval: approval({
          approvedTargetFiles: [],
          approvedValidationCommands,
          approvedRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
        }),
        runner,
      });

      expect(result.executorValidationCommandAllowed).toBe(true);
      expect(prompt).toContain(
        "This bridge is designed to evolve toward operator-equivalent YOLO execution",
      );
      expect(prompt).toContain("Approved repo scope paths:");
      expect(prompt).toContain("extensions/execution-platform/src/codex-bridge/");
      expect(prompt).toContain("Approved validation commands:");
      expect(prompt).toContain(`- ${approvedValidationCommands[0]}`);
      expect(prompt).toContain(`- ${approvedValidationCommands[1]}`);
      expect(prompt).not.toContain(approvedValidationCommands.join(" && "));
      expect(prompt).toContain("Maximum validation/repair attempts: 2");
      expect(prompt).toContain("Do not run commands outside the approved validation command list.");
      expect(prompt).toContain("Do not run any other shell command.");
      expect(prompt).toContain(
        "Return a short final response summarizing the source/test patch and the approved validation command results.",
      );
      expect(prompt).not.toContain("Do not run shell commands.\n");
      expect(prompt).not.toMatch(/broad shell authority/i);
    });
  });

  it("allows bounded repo-scope pilots to choose files inside the approved module", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      let prompt = "";
      const runner = new LiveCodexRunner({
        enableLiveCodexPilot: true,
        spawn: createFakeSpawn({
          stdoutLines: [JSON.stringify({ type: "turn.completed" })],
          onSpawn: (_command, args) => {
            prompt = args.at(-1) ?? "";
          },
        }),
      });
      const scopedPlan = plan({
        targetFiles: ["extensions/execution-platform/src/codex-bridge/"],
        maxFilesAllowed: 8,
        expectedTests: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
          "pnpm tsgo:full",
        ],
      });
      const result = await entrypoint.runApprovedLivePilot({
        liveCodeWritingPilotRunId: "live-code-writing-module-scope",
        plan: scopedPlan,
        requestSkeleton: request({
          targetFiles: ["extensions/execution-platform/src/codex-bridge/"],
          maxFilesTouched: 8,
          expectedTests: scopedPlan.expectedTests,
        }),
        promptPackage: promptPackage({
          allowedFiles: ["extensions/execution-platform/src/codex-bridge/"],
          validationPlan: scopedPlan.expectedTests,
        }),
        approval: approval({
          approvedTargetFiles: [],
          approvedRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
          approvedValidationCommands: scopedPlan.expectedTests,
          maxValidationRepairAttempts: 3,
        }),
        runner,
        changedFilesAfterRun: [
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.ts",
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
        ],
      });

      expect(prompt).toContain("Approved repo scope paths:");
      expect(prompt).toContain("pnpm tsgo:full");
      expect(result.fileScopeSatisfied).toBe(true);
      expect(result.approvedTargetFiles).toEqual([]);
      expect(result.actualFilesChanged).toEqual(
        expect.arrayContaining([
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.ts",
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
        ]),
      );
    });
  });

  it("rejects bounded repo-scope pilots when changed files leave the approved module", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      const scopedPlan = plan({
        targetFiles: ["extensions/execution-platform/src/codex-bridge/"],
        expectedTests: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
        ],
      });
      const result = await entrypoint.runApprovedLivePilot({
        plan: scopedPlan,
        requestSkeleton: request({
          targetFiles: ["extensions/execution-platform/src/codex-bridge/"],
          expectedTests: scopedPlan.expectedTests,
        }),
        promptPackage: promptPackage({
          allowedFiles: ["extensions/execution-platform/src/codex-bridge/"],
        }),
        approval: approval({
          approvedTargetFiles: [],
          approvedRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
          approvedValidationCommands: scopedPlan.expectedTests,
        }),
        runner: new LiveCodexRunner({
          enableLiveCodexPilot: true,
          spawn: createFakeSpawn({ stdoutLines: [JSON.stringify({ type: "turn.completed" })] }),
        }),
        changedFilesAfterRun: ["extensions/execution-platform/src/runtime-job-repository.ts"],
      });

      expect(result.fileScopeSatisfied).toBe(false);
      expect(result.completedWorkPathSatisfied).toBe(false);
      expect(result.validationRecovery.status).not.toBe("validation_passed");
      expect(result.validationRecovery.reason).toContain("validation");
    });
  });

  it("detects unexpected changed files and keeps Work Queue lifecycle unchanged", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-live-code-writing",
        itemType: "build_plan",
        title: "Live code-writing pilot",
      });
      await seedBridgeJob(bridge);
      const result = await entrypoint.runApprovedLivePilot({
        plan: plan(),
        requestSkeleton: request(),
        promptPackage: promptPackage(),
        approval: approval(),
        runner: new LiveCodexRunner({
          enableLiveCodexPilot: true,
          spawn: createFakeSpawn({ stdoutLines: [JSON.stringify({ type: "turn.completed" })] }),
        }),
        changedFilesAfterRun: ["unexpected.ts"],
      });

      expect(result.fileScopeSatisfied).toBe(false);
      expect(result.completedWorkPathSatisfied).toBe(false);
      await expect(
        workQueue.readWorkItemTruth("work-item-live-code-writing"),
      ).resolves.toMatchObject({
        item: { lifecycleState: "draft" },
      });
    });
  });

  it("records validation and closeout before completed-work success is satisfied", async () => {
    await withLivePilotHarness(async ({ bridge, entrypoint }) => {
      await seedBridgeJob(bridge);
      const result = await entrypoint.runApprovedLivePilot({
        liveCodeWritingPilotRunId: "live-code-writing-validated",
        plan: plan(),
        requestSkeleton: request(),
        promptPackage: promptPackage(),
        approval: approval(),
        runner: new LiveCodexRunner({
          enableLiveCodexPilot: true,
          spawn: createFakeSpawn({ stdoutLines: [JSON.stringify({ type: "turn.completed" })] }),
        }),
        changedFilesAfterRun: [
          "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
        ],
      });
      expect(result.completedWorkPathSatisfied).toBe(false);

      const finalized = await entrypoint.recordValidationEvidence({
        runtimeJobId: "bridge-live-code-writing",
        liveCodeWritingPilotRunId: "live-code-writing-validated",
        validationEvidence: {
          command:
            "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
          status: "passed",
          summary: "Focused test passed.",
          checkedAt: "2026-05-03T03:01:00.000Z",
        },
      });

      expect(finalized).toMatchObject({
        validationEvidence: { status: "passed" },
        validationRecovery: { status: "validation_passed" },
        completedWorkPathSatisfied: true,
        workEpisodeCloseout: { emitted: true, eligibilityStatus: "eligible" },
        workQueueLifecycleMutated: false,
        rebuildPerformed: false,
        subagentStarted: false,
        acpSessionStarted: false,
        modelPromotionPerformed: false,
      });
    });
  });
});
import { readFileSync as __readAuthorityRegressionFile } from "node:fs";
import {
  dirname as __authorityRegressionDirname,
  resolve as __resolveAuthorityRegressionPath,
} from "node:path";
import { fileURLToPath as __authorityRegressionFileUrlToPath } from "node:url";
import { expect as __authorityRegressionExpect, it as __authorityRegressionIt } from "vitest";

__authorityRegressionIt(
  "exposes bounded validation-and-repair authority without broad shell authority",
  () => {
    const entrypointSource = __readAuthorityRegressionFile(
      __resolveAuthorityRegressionPath(
        __authorityRegressionDirname(__authorityRegressionFileUrlToPath(import.meta.url)),
        "code-writing-pilot-live-entrypoint.ts",
      ),
      "utf8",
    );

    __authorityRegressionExpect(entrypointSource).toContain(
      "You may run only the approved validation commands listed below, and only to validate this patch.",
    );
    __authorityRegressionExpect(entrypointSource).toContain("Approved validation commands:");
    __authorityRegressionExpect(entrypointSource).toContain(
      "Do not run commands outside the approved validation command list.",
    );
    __authorityRegressionExpect(entrypointSource).toContain("Do not run any other shell command.");
    __authorityRegressionExpect(entrypointSource).toContain("executorValidationCommandAllowed");
    __authorityRegressionExpect(entrypointSource).toContain("approvedValidationCommands");
    __authorityRegressionExpect(entrypointSource).toContain("diagnosticShellAuthorityScope");
    __authorityRegressionExpect(entrypointSource).toContain(
      'diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only"',
    );
    expect(entrypointSource).not.toContain(
      'diagnosticShellAuthorityScope: "arbitrary_shell_commands"',
    );
    __authorityRegressionExpect(entrypointSource).toContain(
      "boundApprovedValidationCommandMetadata",
    );
    __authorityRegressionExpect(entrypointSource).toContain(
      "approvedValidationCommands: boundApprovedValidationCommandMetadata",
    );
    __authorityRegressionExpect(entrypointSource).toContain("validationRepairMaxAttempts");
    __authorityRegressionExpect(entrypointSource).toContain("approved_validation_commands_only");
    __authorityRegressionExpect(entrypointSource).toContain('"none"');
    __authorityRegressionExpect(entrypointSource).not.toMatch(/broad shell authority/i);
  },
);
await import("vitest").then(({ describe, expect, it }) => {
  describe("live entrypoint bridge authority regressions", () => {
    it("preserves module-scope pilots and multi-command validation authority", async () => {
      const [{ readFile }, { dirname, join }, { fileURLToPath }] = await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
        import("node:url"),
      ]);
      const source = await readFile(
        join(dirname(fileURLToPath(import.meta.url)), "code-writing-pilot-live-entrypoint.ts"),
        "utf8",
      );

      expect(source).not.toMatch(/approvedRepoScopePaths\s*:\s*\[\s*["'`]\.["'`]\s*\]/);
      expect(source).not.toMatch(/\.split\(\s*["'`]&&["'`]\s*\)/);
    });
  });
});
it("explicitly treats approved repo-root scope as bounded local authority", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("./code-writing-pilot-live-entrypoint.ts", import.meta.url),
    "utf8",
  );

  expect(source).toContain('repoRootScopePath === "."');
  expect(source).toContain('!repoRootScopeFile.startsWith("../")');
  expect(source).toContain("Approved repo scope paths:");
});
