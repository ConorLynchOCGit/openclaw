import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CodexBridgeCodeWritingPilotPlanRepository,
  CodexBridgeCodeWritingPilotReadinessRepository,
  CodexBridgeControlBridgeRepository,
  CodexBridgeControlLoopProofRepository,
  CodexBridgeEmissionGuardrailRepository,
  CodexBridgeRedirectApplicationProofRepository,
  CodexBridgeRepository,
  CodexBridgeSkillAuditLintRepository,
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  buildSkillAuditLintReport,
  createManualPromptSource,
  evaluateCodexBridgeEmissionGuardrails,
  selectCodeWritingPilotObjective,
  writeCodeWritingPilotPlanArtifact,
  type CodeWritingPilotObjectiveCandidate,
} from "./index.ts";

async function withPlanningHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
    control: CodexBridgeControlBridgeRepository;
    controlLoop: CodexBridgeControlLoopProofRepository;
    redirectProof: CodexBridgeRedirectApplicationProofRepository;
    skillLint: CodexBridgeSkillAuditLintRepository;
    emission: CodexBridgeEmissionGuardrailRepository;
    readiness: CodexBridgeCodeWritingPilotReadinessRepository;
    planner: CodexBridgeCodeWritingPilotPlanRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "slice-8s-"));
  let now = new Date("2026-05-03T02:00:00.000Z");
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
    const closeout = new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, {
      now: () => now,
      artifactRoot,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const control = new CodexBridgeControlBridgeRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const controlLoop = new CodexBridgeControlLoopProofRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      controlBridge: control,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const redirectProof = new CodexBridgeRedirectApplicationProofRepository(runtimeJobs, {
      now: () => now,
      closeoutRepository: closeout,
      controlBridge: control,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const skillLint = new CodexBridgeSkillAuditLintRepository(runtimeJobs, {
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const emission = new CodexBridgeEmissionGuardrailRepository(runtimeJobs);
    const readiness = new CodexBridgeCodeWritingPilotReadinessRepository(runtimeJobs);
    const planner = new CodexBridgeCodeWritingPilotPlanRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    return await work({
      runtimeJobs,
      bridge,
      closeout,
      control,
      controlLoop,
      redirectProof,
      skillLint,
      emission,
      readiness,
      planner,
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

async function seedBridgeJob(bridge: CodexBridgeRepository) {
  return bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-slice-8s",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Slice 8S planning proof",
      promptText: "Plan only. Do not execute.",
      createdBy: "operator",
    }),
  });
}

function safeCandidate(): CodeWritingPilotObjectiveCandidate {
  return {
    candidateId: "add-inert-prompt-package-regression-test",
    title: "Add inert prompt-package regression test",
    objective:
      "Add one focused regression assertion that code-writing pilot prompt packages remain inert metadata with no live authority.",
    targetFiles: ["extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts"],
    expectedTests: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
    ],
    patchType: "source_test",
    riskNotes: ["single focused test-file patch; no runtime behavior change"],
  };
}

function defaultValidationPlan(): string[] {
  return [
    "Operator runs the focused code-writing pilot plan test after the future bridge patch.",
    "Operator reruns focused Execution Platform bridge tests if the future patch changes shared planning behavior.",
  ];
}

function defaultRollbackPlan(): string[] {
  return [
    "Revert the single test-file change if the future bridge pilot produces an unexpected patch.",
  ];
}

async function seedSlice8RReadyEvidence(input: {
  runtimeJobs: RuntimeJobRepository;
  closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
  controlLoop: CodexBridgeControlLoopProofRepository;
  redirectProof: CodexBridgeRedirectApplicationProofRepository;
  skillLint: CodexBridgeSkillAuditLintRepository;
  emission: CodexBridgeEmissionGuardrailRepository;
  readiness: CodexBridgeCodeWritingPilotReadinessRepository;
  omit?: Array<
    | "closeout"
    | "control_loop"
    | "redirect"
    | "skill_lint"
    | "skill_readiness"
    | "emission"
    | "readiness"
  >;
}) {
  const omit = new Set(input.omit ?? []);
  if (!omit.has("closeout")) {
    await input.closeout.emitCloseoutForRuntimeJob({
      runtimeJobId: "bridge-slice-8s",
      closeout: {
        runtimeJobId: "bridge-slice-8s",
        completedAt: "2026-05-03T02:00:00.000Z",
        userGoal: "Prepare code-writing pilot planning evidence.",
        workSummary: "Bounded fake control and redirect evidence exists before pilot planning.",
        finalOutcome: "Closeout exists for plan-only pilot readiness.",
        testsRun: [
          {
            command: "fake readiness validation",
            status: "passed",
            summary: "Readiness fixture passed.",
          },
        ],
      },
    });
  }
  let loop: { controlCommandId: string } | null = null;
  if (!omit.has("control_loop")) {
    loop = await input.controlLoop.runFakeControlLoopProof({
      runtimeJobId: "bridge-slice-8s",
      sessionId: "session-8s",
      createdBy: "operator",
      simulatedHazard: "deterministic_vs_model_judgment_violation",
      selectedControlCommandKind: "redirect",
    });
  }
  if (!omit.has("redirect") && loop) {
    await input.redirectProof.runFakeRedirectApplicationProof({
      runtimeJobId: "bridge-slice-8s",
      sessionId: "session-8s",
      sourceControlCommandId: loop.controlCommandId,
      createdBy: "operator",
    });
  }
  if (!omit.has("skill_lint")) {
    const text = await readFile("/root/.codex/skills/openclaw-bridge-safety/SKILL.md", "utf8");
    const lint = buildSkillAuditLintReport({
      auditId: "skill-audit-lint-8s",
      checkedAt: "2026-05-03T02:00:00.000Z",
      targets: [
        {
          targetId: "openclaw-bridge-safety",
          sourcePaths: ["/root/.codex/skills/openclaw-bridge-safety/SKILL.md"],
          purpose: "Bridge safety",
          skillText: text,
          requiredForBridgeSafety: true,
          activeRuntimeSkill: true,
        },
      ],
    });
    await input.skillLint.persistReport({ runtimeJobId: "bridge-slice-8s", report: lint });
  }
  if (!omit.has("emission")) {
    await input.emission.persistEmissionGuardrailReport({
      runtimeJobId: "bridge-slice-8s",
      report: evaluateCodexBridgeEmissionGuardrails({
        guardrailId: "code-writing-plan-overclaim",
        checkedAt: "2026-05-03T02:00:00.000Z",
        text: "deterministic deep critique",
      }),
    });
  }
  if (omit.has("skill_readiness")) {
    const artifacts = await input.runtimeJobs.listArtifacts("bridge-slice-8s");
    for (const artifact of artifacts.filter(
      (candidate) => candidate.artifactType === "codex_bridge.skill_readiness_report",
    )) {
      artifact.artifactType = "codex_bridge.skill_readiness_report_ignored";
    }
  }
  if (!omit.has("readiness")) {
    const report = await input.readiness.produceReadinessReport({
      runtimeJobId: "bridge-slice-8s",
      checkedAt: "2026-05-03T02:00:00.000Z",
      realisticTriggerTestsRepresented: true,
    });
    await input.readiness.persistReadinessReport({ report });
  }
}

describe("code-writing pilot objective selection", () => {
  it("selects exactly one tiny safe objective using deterministic rules", () => {
    const selected = selectCodeWritingPilotObjective({
      candidates: [
        safeCandidate(),
        {
          candidateId: "touch-lockfile",
          title: "Touch lockfile",
          objective: "Update package metadata.",
          targetFiles: ["pnpm-lock.yaml"],
          expectedTests: ["pnpm tsgo:full"],
          patchType: "source",
        },
      ],
    });

    expect(selected).toMatchObject({
      deterministicRulesOnly: true,
      objectiveRiskClass: "tiny_non_critical_patch",
      selectedObjective: { candidateId: "add-inert-prompt-package-regression-test" },
    });
    expect(selected.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "touch-lockfile",
          rejectedReasons: expect.arrayContaining(["target_file_forbidden:package_lockfile"]),
        }),
      ]),
    );
  });

  it("rejects broad or forbidden objectives", () => {
    const targets = [
      "pnpm-lock.yaml",
      "extensions/execution-platform/src/db/migrations/9999_bad.sql",
      "openclaw.json",
      "secrets/example.json",
      "Dockerfile",
      "extensions/execution-platform/src/provider-routing/openai.ts",
      "extensions/execution-platform/src/work-queue/WorkQueueExecutionButton.tsx",
      "extensions/execution-platform/src/codex-bridge/acp-live-executor.ts",
      "extensions/execution-platform/src/codex-bridge/rebuild-autobailout-subagent.ts",
    ];
    const report = selectCodeWritingPilotObjective({
      candidates: targets.map((targetFile, index) => ({
        candidateId: `candidate-${index}`,
        title: `Forbidden ${index}`,
        objective: "Forbidden candidate.",
        targetFiles: [targetFile],
        expectedTests: ["pnpm test:file forbidden"],
        patchType: "source",
      })),
    });

    expect(report.selectedObjective).toBeNull();
    expect(report.blockingReasons).toContain("no_safe_tiny_objective");
    expect(report.rejectedCandidates).toHaveLength(targets.length);
  });
});

describe("code-writing pilot planning", () => {
  it("blocks planning when Slice 8R readiness evidence is missing", async () => {
    await withPlanningHarness(async ({ bridge, planner }) => {
      await seedBridgeJob(bridge);
      const result = await planner.createPilotPlan({
        pilotPlanId: "pilot-plan-missing-readiness",
        requestId: "request-missing-readiness",
        promptPackageId: "prompt-missing-readiness",
        runtimeJobId: "bridge-slice-8s",
        sessionId: "session-8s",
        createdBy: "operator",
        candidates: [safeCandidate()],
        validationPlan: defaultValidationPlan(),
        rollbackPlan: defaultRollbackPlan(),
      });

      expect(result.plan.allowedToCreateLiveRequest).toBe(false);
      expect(result.plan.allowedToRunLivePilot).toBe(false);
      expect(result.plan.blockingReasons).toEqual(
        expect.arrayContaining([
          "missing_or_blocked_slice_8r_readiness",
          "missing_fake_control_loop_proof",
          "missing_fake_redirect_application_proof",
          "missing_closeout_gate_evidence",
          "missing_or_blocked_skill_readiness",
          "missing_or_overclaiming_skill_audit_lint",
          "missing_emission_guardrail_evidence",
        ]),
      );
    });
  });

  it("blocks planning when specific redirect, closeout, skill, or guardrail evidence is absent", async () => {
    await withPlanningHarness(async (harness) => {
      await seedBridgeJob(harness.bridge);
      await seedSlice8RReadyEvidence({
        ...harness,
        omit: ["redirect", "closeout", "skill_lint", "emission", "readiness"],
      });
      const result = await harness.planner.createPilotPlan({
        runtimeJobId: "bridge-slice-8s",
        sessionId: "session-8s",
        createdBy: "operator",
        candidates: [safeCandidate()],
        validationPlan: defaultValidationPlan(),
        rollbackPlan: defaultRollbackPlan(),
      });

      expect(result.plan.blockingReasons).toEqual(
        expect.arrayContaining([
          "missing_or_blocked_slice_8r_readiness",
          "missing_fake_redirect_application_proof",
          "missing_closeout_gate_evidence",
          "missing_or_overclaiming_skill_audit_lint",
        ]),
      );
    });
  });

  it("blocks planning when skill audit lint claims qualitative proof", async () => {
    await withPlanningHarness(async (harness) => {
      await seedBridgeJob(harness.bridge);
      await seedSlice8RReadyEvidence({ ...harness, omit: ["skill_lint", "readiness"] });
      await harness.runtimeJobs.attachArtifact({
        jobId: "bridge-slice-8s",
        artifactType: "codex_bridge.skill_audit_lint_report",
        storageKind: "metadata",
        uri: "runtime-job://bridge-slice-8s/bad-skill-lint",
        contentType: "application/json",
        metadata: {
          ruleCoverageOnly: false,
          qualitativeJudgmentMade: true,
          requiresSeparateQualitativeReview: false,
        },
      });
      const result = await harness.planner.createPilotPlan({
        runtimeJobId: "bridge-slice-8s",
        sessionId: "session-8s",
        createdBy: "operator",
        candidates: [safeCandidate()],
        validationPlan: defaultValidationPlan(),
        rollbackPlan: defaultRollbackPlan(),
      });

      expect(result.plan.blockingReasons).toEqual(
        expect.arrayContaining([
          "missing_or_blocked_slice_8r_readiness",
          "missing_or_overclaiming_skill_audit_lint",
          "skill_audit_lint_claims_qualitative_proof",
        ]),
      );
    });
  });

  it("creates a plan, future request skeleton, and inert prompt package without live execution", async () => {
    await withPlanningHarness(async (harness) => {
      await seedBridgeJob(harness.bridge);
      await seedSlice8RReadyEvidence(harness);
      const result = await harness.planner.createPilotPlan({
        pilotPlanId: "pilot-plan-8s",
        requestId: "request-8s",
        promptPackageId: "prompt-package-8s",
        runtimeJobId: "bridge-slice-8s",
        sessionId: "session-8s",
        createdBy: "operator",
        candidates: [safeCandidate()],
        validationPlan: defaultValidationPlan(),
        rollbackPlan: defaultRollbackPlan(),
      });

      expect(result.plan).toMatchObject({
        pilotPlanId: "pilot-plan-8s",
        planMode: "plan_only",
        allowedToCreateLiveRequest: true,
        allowedToRunLivePilot: false,
        liveExecutionEnabled: false,
        codexCliInvoked: false,
        commandExecuted: false,
        operatorApprovalRequired: true,
        operatorApprovalSatisfied: false,
      });
      expect(result.requestSkeleton).toMatchObject({
        requestId: "request-8s",
        status: "planned_not_approved",
        enableLiveCodexPilot: false,
        enableCodeWritingBridgePilot: false,
        commandExecuted: false,
        liveExecutionEnabled: false,
      });
      expect(result.promptPackage).toMatchObject({
        promptPackageId: "prompt-package-8s",
        inertMetadataOnly: true,
        processCompletionIsTaskSuccess: false,
        rawTranscriptIncluded: false,
        hiddenReasoningRequested: false,
        shellCommandRequestedFromRuntimePayload: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect({
        rebuildAuthorityGranted: result.promptPackage.rebuildAuthorityGranted,
        autobailoutAuthorityGranted: result.promptPackage.autobailoutAuthorityGranted,
        subagentAuthorityGranted: result.promptPackage.subagentAuthorityGranted,
        acpAuthorityGranted: result.promptPackage.acpAuthorityGranted,
        providerDirectCallAuthorityGranted: result.promptPackage.providerDirectCallAuthorityGranted,
        workQueueLifecycleMutationAllowed: result.promptPackage.workQueueLifecycleMutationAllowed,
        inertMetadataOnly: result.promptPackage.inertMetadataOnly,
      }).toEqual({
        rebuildAuthorityGranted: false,
        autobailoutAuthorityGranted: false,
        subagentAuthorityGranted: false,
        acpAuthorityGranted: false,
        providerDirectCallAuthorityGranted: false,
        workQueueLifecycleMutationAllowed: false,
        inertMetadataOnly: true,
      });
      expect(result.promptPackage.allowedFiles).toEqual([
        "extensions/execution-platform/src/codex-bridge/code-writing-pilot-plan.test.ts",
      ]);
      expect(JSON.stringify(result.promptPackage).toLowerCase()).not.toContain(
        "raw-transcript-marker",
      );

      await expect(harness.planner.readLatestPilotPlan("bridge-slice-8s")).resolves.toMatchObject({
        pilotPlanId: "pilot-plan-8s",
      });
      await expect(harness.planner.readRequestSkeleton("bridge-slice-8s")).resolves.toMatchObject({
        requestId: "request-8s",
      });
      await expect(harness.planner.readPromptPackage("bridge-slice-8s")).resolves.toMatchObject({
        promptPackageId: "prompt-package-8s",
      });
      await expect(harness.planner.readBlockers("bridge-slice-8s")).resolves.toEqual([]);
      await expect(harness.planner.readRequiredNextOperatorAction("bridge-slice-8s")).resolves.toBe(
        "request_explicit_operator_approval_for_first_code_writing_bridge_pilot",
      );
      await expect(harness.runtimeJobs.listEvents("bridge-slice-8s", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.code_writing_pilot_plan_created" }),
          expect.objectContaining({
            eventType: "codex_bridge.code_writing_pilot_planning_completed",
          }),
        ]),
      );
    });
  });

  it("writes a bounded plan artifact and preserves no-live/no-authority flags", async () => {
    await withPlanningHarness(async (harness) => {
      await seedBridgeJob(harness.bridge);
      await seedSlice8RReadyEvidence(harness);
      const result = await harness.planner.createPilotPlan({
        runtimeJobId: "bridge-slice-8s",
        sessionId: "session-8s",
        createdBy: "operator",
        candidates: [safeCandidate()],
        validationPlan: defaultValidationPlan(),
        rollbackPlan: defaultRollbackPlan(),
      });
      const artifact = await writeCodeWritingPilotPlanArtifact({
        result,
        artifactPath: path.join(harness.artifactRoot, "code-writing-pilot-plan-8s.json"),
      });

      expect(artifact.pilotPlanId).toBe(result.plan.pilotPlanId);
      expect(result.plan.allowedToRunLivePilot).toBe(false);
      expect(result.requestSkeleton.enableLiveCodexPilot).toBe(false);
      expect(result.promptPackage.rebuildAuthorityGranted).toBe(false);
      expect(result.promptPackage.subagentAuthorityGranted).toBe(false);
      expect(result.promptPackage.providerDirectCallAuthorityGranted).toBe(false);
    });
  });
});
