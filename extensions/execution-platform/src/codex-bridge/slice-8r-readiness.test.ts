import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE,
  CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE,
  CodexBridgeCodeWritingPilotReadinessRepository,
  CodexBridgeControlBridgeRepository,
  CodexBridgeControlLoopProofRepository,
  CodexBridgeEmissionGuardrailRepository,
  CodexBridgeRedirectApplicationProofRepository,
  CodexBridgeRepository,
  CodexBridgeSkillAuditLintRepository,
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  applyBridgeSafetySkillCoverage,
  buildSkillAuditLintReport,
  createManualPromptSource,
  evaluateCodexBridgeEmissionGuardrails,
  evaluateCodexBridgeSkillTriggers,
  listRequiredCodexBridgeSkillDocs,
  produceCodexBridgeSkillReadinessReport,
  validateRedirectPromptMetadataSafety,
  writeCodeWritingPilotReadinessArtifact,
  writeCodexBridgeFakeRedirectApplicationProofArtifact,
  writeSkillAuditLintArtifact,
  type CodexBridgeRedirectPromptMetadata,
  type CodexBridgeSkillActivationState,
  type CodexBridgeSkillDocRegistryEntry,
} from "./index.ts";

async function withSlice8RHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    control: CodexBridgeControlBridgeRepository;
    controlLoop: CodexBridgeControlLoopProofRepository;
    redirectProof: CodexBridgeRedirectApplicationProofRepository;
    closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
    skillLint: CodexBridgeSkillAuditLintRepository;
    emission: CodexBridgeEmissionGuardrailRepository;
    readiness: CodexBridgeCodeWritingPilotReadinessRepository;
    workQueue: WorkQueueRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "slice-8r-"));
  let now = new Date("2026-05-03T01:00:00.000Z");
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
    });
    const controlLoop = new CodexBridgeControlLoopProofRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      controlBridge: control,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const redirectProof = new CodexBridgeRedirectApplicationProofRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      controlBridge: control,
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const skillLint = new CodexBridgeSkillAuditLintRepository(runtimeJobs, {
      maxArtifactMetadataBytes: 128 * 1024,
    });
    const emission = new CodexBridgeEmissionGuardrailRepository(runtimeJobs);
    const readiness = new CodexBridgeCodeWritingPilotReadinessRepository(runtimeJobs);
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      control,
      controlLoop,
      redirectProof,
      closeout,
      skillLint,
      emission,
      readiness,
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
    jobId: input.jobId ?? "bridge-slice-8r",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Slice 8R proof",
      promptText: "Fake proof only.",
      createdBy: "operator",
    }),
    workQueueLink: input.workQueueLink,
  });
}

function redirectPrompt(
  overrides: Partial<CodexBridgeRedirectPromptMetadata> = {},
): CodexBridgeRedirectPromptMetadata {
  return {
    objective: "Redirect separate executor session to runtime truth.",
    scope: ["Use runtime job evidence.", "Preserve configured repo/workspace paths."],
    nonGoals: ["Do not rebuild.", "Do not use subagents.", "Do not mutate Work Queue lifecycle."],
    repoPath: "/root/services/openclaw-roles/live",
    workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
    safeUiBridge: { tailscaleRequired: true, descriptor: "Tailscale safe UI bridge" },
    promptText: "Use Supabase resolver evidence instead of local env-var absence.",
    ...overrides,
  };
}

function registryWith(
  activation: Partial<Record<string, CodexBridgeSkillActivationState>>,
): CodexBridgeSkillDocRegistryEntry[] {
  return listRequiredCodexBridgeSkillDocs().map((entry) => ({
    ...entry,
    currentActivationState: activation[entry.skillDocId] ?? entry.currentActivationState,
  }));
}

function activeCoveredRegistry(): CodexBridgeSkillDocRegistryEntry[] {
  return applyBridgeSafetySkillCoverage(
    registryWith({
      "work-queue-ux-review": "active",
      "openclaw-bridge-safety": "active",
    }),
  );
}

describe("Slice 8R fake redirect application proof", () => {
  it("applies a recorded redirect command in fake mode without live signal or prompt injection", async () => {
    await withSlice8RHarness(async ({ bridge, control, redirectProof, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await runtimeJobs.attachArtifact({
        jobId: "bridge-slice-8r",
        artifactType: "supervisor_session",
        storageKind: "metadata",
        uri: "runtime-job://bridge-slice-8r/supervisor/session-8r",
        contentType: "application/json",
        metadata: { sessionId: "session-8r" },
      });
      const command = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          actor: "operator",
          reason: "runtime substrate mismatch",
          commandId: "redirect-8r",
          redirectPrompt: redirectPrompt(),
        }),
      });

      const result = await redirectProof.runFakeRedirectApplicationProof({
        proofId: "redirect-proof-8r",
        runtimeJobId: "bridge-slice-8r",
        sessionId: "session-8r",
        sourceControlCommandId: command.commandId,
        createdBy: "operator",
      });

      expect(result).toMatchObject({
        proofMode: "fake_redirect_application",
        commandStatusBefore: "recorded",
        commandStatusAfter: "applied",
        promptInjectedIntoLiveProcess: false,
        liveProcessSignalSent: false,
        workQueueLifecycleMutated: false,
        codexCliInvoked: false,
        codeWritingBridgePilotStillBlocked: true,
      });
      expect(result.streamEvent.eventKind).toBe("redirect_applied");
      expect(result.latestControlState.appliedCommands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            commandId: "redirect-8r",
            actualEffect: "fake_redirect_applied_no_live_prompt_injection",
          }),
        ]),
      );
      await expect(runtimeJobs.listArtifacts("bridge-slice-8r")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactType: CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE,
          }),
        ]),
      );
    });
  });

  it("rejects non-bridge jobs, missing commands, non-redirect commands, unknown sessions, and unsafe metadata", async () => {
    await withSlice8RHarness(async ({ runtimeJobs, bridge, control, redirectProof }) => {
      await runtimeJobs.enqueueJob({ jobId: "plain-job", jobType: "plain.job" });
      await expect(
        redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "plain-job",
          sessionId: "session-8r",
          sourceControlCommandId: "missing",
          createdBy: "operator",
        }),
      ).rejects.toThrow("not a codex bridge job");

      await seedBridgeJob({ bridge });
      await runtimeJobs.attachArtifact({
        jobId: "bridge-slice-8r",
        artifactType: "supervisor_session",
        storageKind: "metadata",
        uri: "runtime-job://bridge-slice-8r/supervisor/session-8r",
        contentType: "application/json",
        metadata: { sessionId: "session-8r" },
      });
      await expect(
        redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          sourceControlCommandId: "missing",
          createdBy: "operator",
        }),
      ).rejects.toThrow("redirect command not found");

      const pause = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "pause-not-redirect",
        }),
      });
      await expect(
        redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          sourceControlCommandId: pause.commandId,
          createdBy: "operator",
        }),
      ).rejects.toThrow("not a redirect command");

      const redirect = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          actor: "operator",
          reason: "runtime substrate mismatch",
          commandId: "redirect-known",
          redirectPrompt: redirectPrompt(),
        }),
      });
      await expect(
        redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "unknown-session",
          sourceControlCommandId: redirect.commandId,
          createdBy: "operator",
        }),
      ).rejects.toThrow("unknown executor session id");

      await runtimeJobs.attachArtifact({
        jobId: "bridge-slice-8r",
        artifactType: "codex_bridge.control_command",
        storageKind: "metadata",
        uri: "runtime-job://bridge-slice-8r/unsafe-redirect",
        contentType: "application/json",
        metadata: {
          ...redirect,
          commandId: "unsafe-redirect",
          redirectPrompt: redirectPrompt({
            promptText: "raw-transcript-marker sk-testsecret123456789",
          }),
        },
      });
      await expect(
        redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          sourceControlCommandId: "unsafe-redirect",
          createdBy: "operator",
        }),
      ).rejects.toThrow("prohibited raw/private content");
    });
  });

  it("preserves Work Queue link without lifecycle mutation", async () => {
    await withSlice8RHarness(async ({ bridge, control, redirectProof, runtimeJobs, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-8r",
        itemType: "build_plan",
        title: "8R proof",
      });
      await seedBridgeJob({
        bridge,
        workQueueLink: { workItemId: "work-item-8r", runId: "run-8r", stepId: "step-8r" },
      });
      await runtimeJobs.attachArtifact({
        jobId: "bridge-slice-8r",
        artifactType: "supervisor_session",
        storageKind: "metadata",
        uri: "runtime-job://bridge-slice-8r/supervisor/session-8r",
        contentType: "application/json",
        metadata: { sessionId: "session-8r" },
      });
      const command = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          actor: "operator",
          reason: "runtime substrate mismatch",
          commandId: "redirect-workqueue",
          redirectPrompt: redirectPrompt(),
        }),
      });
      const result = await redirectProof.runFakeRedirectApplicationProof({
        runtimeJobId: "bridge-slice-8r",
        sessionId: "session-8r",
        sourceControlCommandId: command.commandId,
        createdBy: "operator",
      });

      expect(result.workQueueLink).toEqual({
        workItemId: "work-item-8r",
        runId: "run-8r",
        stepId: "step-8r",
      });
      await expect(workQueue.readWorkItemTruth("work-item-8r")).resolves.toMatchObject({
        item: { lifecycleState: "draft" },
      });
    });
  });
});

describe("Slice 8R skill audit lint and realistic triggers", () => {
  it("reframes the legacy skill audit as rule coverage lint with a qualitative-review boundary", async () => {
    const text = await readFile("/root/.codex/skills/openclaw-bridge-safety/SKILL.md", "utf8");
    const report = buildSkillAuditLintReport({
      auditId: "skill-audit-lint-8r",
      checkedAt: "2026-05-03T01:00:00.000Z",
      targets: [
        {
          targetId: "openclaw-bridge-safety",
          sourcePaths: ["/root/.codex/skills/openclaw-bridge-safety/SKILL.md"],
          purpose: "Bridge safety guardrails",
          skillText: text,
          requiredForBridgeSafety: true,
          activeRuntimeSkill: true,
        },
      ],
    });

    expect(report).toMatchObject({
      ruleCoverageOnly: true,
      qualitativeJudgmentMade: false,
      necessaryButNotSufficient: true,
      requiresSeparateQualitativeReview: true,
      deepCritiqueTermDeprecated: true,
      codeWritingBridgePilotStillBlocked: true,
    });
    expect(report.items[0]?.coverageState).toMatch(/coverage_present|needs_review/u);
    expect(report.items[0]).not.toHaveProperty("verdict");
    expect(report.qualitativeReviewBoundary).toMatchObject({
      judgmentMade: false,
      notDeterministic: true,
      requiredBeforeCodeWritingBridgePilot: true,
    });
  });

  it("persists skill audit lint and writes a bounded artifact", async () => {
    await withSlice8RHarness(async ({ bridge, skillLint, runtimeJobs, artifactRoot }) => {
      await seedBridgeJob({ bridge });
      const report = buildSkillAuditLintReport({
        auditId: "skill-audit-lint-runtime",
        checkedAt: "2026-05-03T01:00:00.000Z",
        targets: [
          {
            targetId: "unsafe",
            sourcePaths: ["/tmp/unsafe/SKILL.md"],
            purpose: "Unsafe",
            skillText: "---\nname: unsafe\ndescription: Helps.\n---\n# Unsafe\nRun what is needed.",
            requiredForBridgeSafety: true,
            activeRuntimeSkill: true,
          },
        ],
      });
      const artifact = await skillLint.persistReport({
        runtimeJobId: "bridge-slice-8r",
        report,
      });
      const artifactPath = path.join(artifactRoot, "skill-audit-lint-8r.json");
      await writeSkillAuditLintArtifact({ artifactPath, report });

      expect(artifact.artifactType).toBe(CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE);
      expect(report.items[0]).toMatchObject({
        coverageState: "coverage_missing",
        qualitativeJudgmentMade: false,
        necessaryButNotSufficient: true,
      });
      await expect(runtimeJobs.listEvents("bridge-slice-8r", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.skill_audit_lint_checked" }),
        ]),
      );
    });
  });

  it("selects expected active skills and guards from realistic prompts", () => {
    const registry = activeCoveredRegistry();
    const fixtures = [
      {
        prompt: "I think Supabase is not configured because env vars are missing here",
        reason: "runtime_substrate_mismatch" as const,
        expected: ["openclaw-bridge-safety", "execution-platform-runtime-truth"],
      },
      {
        prompt: "Did this work emit a completion pack?",
        reason: "missing_closeout_evidence" as const,
        closeout: "missing" as const,
        expected: ["work-episode-outcome-pack-closeout", "pause-redirect-cancel-control-bridge"],
      },
      {
        prompt: "The deterministic critique proves this skill is best-in-class",
        reason: "deterministic_vs_model_judgment_violation" as const,
        expected: ["deterministic-vs-model-judgment-guardrail"],
      },
      {
        prompt: "Move this Work Queue item to running from the UI",
        reason: "unsafe_authority_request" as const,
        workQueue: true,
        expected: ["work-queue-ux-review", "work-queue-lifecycle-semantics"],
      },
      {
        prompt: "Pause that bridge runner and redirect it to check the DB substrate",
        eventKinds: ["pause_requested", "redirect_requested"],
        reason: "runtime_substrate_mismatch" as const,
        expected: ["pause-redirect-cancel-control-bridge", "execution-platform-runtime-truth"],
      },
      {
        prompt: "Use the UI through Tailscale",
        reason: "missing_safe_ui_bridge_context" as const,
        expected: ["tailscale-safe-ui-bridge"],
      },
      {
        prompt: "Let the bridge implement the next patch",
        operation: "code_writing_bridge_pilot" as const,
        expected: ["orchestrator-role-contract", "implementer-role-contract"],
      },
      {
        prompt: "Rebuild and autobail out if it fails",
        eventKinds: ["rebuild_failed"],
        operation: "autobailout" as const,
        expected: ["rebuild-and-container-recovery", "codex-bailout-protocol"],
      },
    ];

    for (const fixture of fixtures) {
      const report = evaluateCodexBridgeSkillTriggers({
        registry,
        triggerInput: {
          userPrompt: fixture.prompt,
          controlReasonCategory: fixture.reason,
          bridgeEventKinds: fixture.eventKinds,
          closeoutGateState: fixture.closeout,
          workQueueLinkPresent: fixture.workQueue,
          requestedOperationType: fixture.operation ?? "fake_control_loop",
        },
      });
      expect(report.triggeredSkillDocIds).toEqual(expect.arrayContaining(fixture.expected));
    }

    const overclaim = evaluateCodexBridgeEmissionGuardrails({
      text: "The deterministic critique proves this skill is best-in-class and rule coverage proves skill quality.",
    });
    expect(overclaim).toMatchObject({
      detected: true,
      severity: "blocking",
      recommendedControlReason: "deterministic_vs_model_judgment_violation",
    });

    const codeWritingReadiness = produceCodexBridgeSkillReadinessReport({
      requestedMode: "code_writing_bridge_pilot",
      registry,
      triggerTestedSkillDocIds: registry.map((entry) => entry.skillDocId),
    });
    expect(codeWritingReadiness.allowed).toBe(true);
    expect(codeWritingReadiness.codeWritingBridgePilotBlocked).toBe(true);
    expect(
      produceCodexBridgeSkillReadinessReport({
        requestedMode: "trusted_yolo_local",
        registry,
        triggerTestedSkillDocIds: registry.map((entry) => entry.skillDocId),
      }).allowed,
    ).toBe(false);
    expect(
      produceCodexBridgeSkillReadinessReport({ requestedMode: "rebuild", registry }).allowed,
    ).toBe(false);
    expect(
      produceCodexBridgeSkillReadinessReport({ requestedMode: "autobailout", registry }).allowed,
    ).toBe(false);
  });
});

describe("Slice 8R code-writing pilot planning readiness", () => {
  it("blocks when redirect application, skill lint, qualitative boundary, or trigger evidence is missing", async () => {
    await withSlice8RHarness(async ({ bridge, controlLoop, readiness }) => {
      await seedBridgeJob({ bridge });
      await controlLoop.runFakeControlLoopProof({
        runtimeJobId: "bridge-slice-8r",
        sessionId: "session-8r",
        createdBy: "operator",
        simulatedHazard: "runtime_substrate_mismatch",
        selectedControlCommandKind: "redirect",
      });

      const report = await readiness.produceReadinessReport({
        runtimeJobId: "bridge-slice-8r",
        checkedAt: "2026-05-03T01:00:00.000Z",
      });

      expect(report.allowedToPlanCodeWritingPilot).toBe(false);
      expect(report.allowedToRunCodeWritingPilot).toBe(false);
      expect(report.blockingReasons).toEqual(
        expect.arrayContaining([
          "missing_or_failed:fake_redirect_application_proof_present",
          "missing_or_failed:skill_audit_lint_reframed",
          "missing_or_failed:qualitative_review_boundary_present",
          "missing_or_failed:realistic_trigger_tests_represented",
        ]),
      );
    });
  });

  it("passes planning readiness after redirect, closeout, lint, trigger, and guardrail evidence exist while run remains blocked", async () => {
    await withSlice8RHarness(
      async ({
        bridge,
        controlLoop,
        redirectProof,
        closeout,
        skillLint,
        emission,
        readiness,
        artifactRoot,
      }) => {
        await seedBridgeJob({ bridge });
        await closeout.emitCloseoutForRuntimeJob({
          runtimeJobId: "bridge-slice-8r",
          closeout: {
            runtimeJobId: "bridge-slice-8r",
            completedAt: "2026-05-03T01:00:00.000Z",
            userGoal: "Prepare code-writing pilot planning evidence.",
            workSummary: "Bounded fake proof evidence exists before pilot planning.",
            finalOutcome: "Closeout exists for readiness planning.",
            testsRun: [
              {
                command: "fake readiness validation",
                status: "passed",
                summary: "Readiness fixture passed.",
              },
            ],
          },
        });
        const loop = await controlLoop.runFakeControlLoopProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          createdBy: "operator",
          simulatedHazard: "deterministic_vs_model_judgment_violation",
          selectedControlCommandKind: "redirect",
        });
        await redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          sourceControlCommandId: loop.controlCommandId,
          createdBy: "operator",
        });
        const lint = buildSkillAuditLintReport({
          auditId: "skill-audit-lint-readiness",
          checkedAt: "2026-05-03T01:00:00.000Z",
          targets: [
            {
              targetId: "openclaw-bridge-safety",
              sourcePaths: ["/root/.codex/skills/openclaw-bridge-safety/SKILL.md"],
              purpose: "Bridge safety",
              skillText: await readFile(
                "/root/.codex/skills/openclaw-bridge-safety/SKILL.md",
                "utf8",
              ),
              requiredForBridgeSafety: true,
              activeRuntimeSkill: true,
            },
          ],
        });
        await skillLint.persistReport({ runtimeJobId: "bridge-slice-8r", report: lint });
        await emission.persistEmissionGuardrailReport({
          runtimeJobId: "bridge-slice-8r",
          report: evaluateCodexBridgeEmissionGuardrails({
            guardrailId: "readiness-overclaim",
            checkedAt: "2026-05-03T01:00:00.000Z",
            text: "deterministic deep critique",
          }),
        });

        const report = await readiness.produceReadinessReport({
          runtimeJobId: "bridge-slice-8r",
          checkedAt: "2026-05-03T01:00:00.000Z",
          realisticTriggerTestsRepresented: true,
        });
        await readiness.persistReadinessReport({ report });
        const artifact = await writeCodeWritingPilotReadinessArtifact({
          report,
          artifactPath: path.join(artifactRoot, "code-writing-pilot-readiness-8r.json"),
        });

        expect(artifact.artifactPath).toContain("code-writing-pilot-readiness-8r.json");
        expect(report).toMatchObject({
          allowedToPlanCodeWritingPilot: true,
          allowedToRunCodeWritingPilot: false,
          requiredNextOperatorAction: "plan_operator_approved_code_writing_pilot",
          liveCodeWritingRequiresFutureExplicitApproval: true,
        });
        expect(report.clearedBlockers).toEqual(
          expect.arrayContaining([
            "fake_redirect_application_proof_present",
            "skill_audit_lint_reframed",
            "qualitative_review_boundary_present",
            "emission_overclaim_guardrails_present",
            "realistic_trigger_tests_represented",
          ]),
        );
      },
    );
  });
});

describe("Slice 8R safety helpers", () => {
  it("rejects redirect prompt metadata that requests prohibited authority", () => {
    expect(() =>
      validateRedirectPromptMetadataSafety(
        redirectPrompt({ promptText: "Please run shell command pnpm build and use subagents." }),
      ),
    ).toThrow("outside Slice 8N bounds");
  });

  it("writes a bounded fake redirect proof artifact", async () => {
    await withSlice8RHarness(
      async ({ bridge, control, redirectProof, runtimeJobs, artifactRoot }) => {
        await seedBridgeJob({ bridge });
        await runtimeJobs.attachArtifact({
          jobId: "bridge-slice-8r",
          artifactType: "supervisor_session",
          storageKind: "metadata",
          uri: "runtime-job://bridge-slice-8r/supervisor/session-8r",
          contentType: "application/json",
          metadata: { sessionId: "session-8r" },
        });
        const command = await control.recordControlCommand({
          command: await control.createRedirectCommand({
            runtimeJobId: "bridge-slice-8r",
            sessionId: "session-8r",
            actor: "operator",
            reason: "runtime substrate mismatch",
            commandId: "redirect-artifact",
            redirectPrompt: redirectPrompt(),
          }),
        });
        const result = await redirectProof.runFakeRedirectApplicationProof({
          runtimeJobId: "bridge-slice-8r",
          sessionId: "session-8r",
          sourceControlCommandId: command.commandId,
          createdBy: "operator",
        });
        const artifact = await writeCodexBridgeFakeRedirectApplicationProofArtifact({
          proof: result,
          artifactPath: path.join(artifactRoot, "fake-redirect-application-proof-8r.json"),
        });
        expect(artifact.proofId).toBe(result.proofId);
        expect(JSON.stringify(result).toLowerCase()).not.toContain("raw full transcript");
        expect(JSON.stringify(result).toLowerCase()).not.toContain("secret-marker");
      },
    );
  });
});
