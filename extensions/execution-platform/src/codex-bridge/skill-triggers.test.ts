import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  CodexBridgeSkillTriggerRepository,
  applyBridgeSafetySkillCoverage,
  createManualPromptSource,
  discoverActiveLocalCodexSkills,
  discoverOpenClawClawHubSkill,
  evaluateCodexBridgeSkillTriggers,
  listRequiredCodexBridgeSkillDocs,
  produceCodexBridgeSkillReadinessReport,
  produceFakeControlLoopReadiness,
  type CodexBridgeSkillActivationState,
  type CodexBridgeSkillDocRegistryEntry,
} from "./index.ts";

async function withSkillTriggerHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    skillTriggers: CodexBridgeSkillTriggerRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const now = new Date("2026-05-02T22:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const skillTriggers = new CodexBridgeSkillTriggerRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({ runtimeJobs, bridge, skillTriggers, workQueue });
  } finally {
    await database.close();
  }
}

function registryWith(
  activation: Partial<Record<string, CodexBridgeSkillActivationState>>,
): CodexBridgeSkillDocRegistryEntry[] {
  return listRequiredCodexBridgeSkillDocs().map((entry) => ({
    ...entry,
    currentActivationState: activation[entry.skillDocId] ?? entry.currentActivationState,
  }));
}

function mostlyActiveRegistry(
  activation: Partial<Record<string, CodexBridgeSkillActivationState>> = {},
): CodexBridgeSkillDocRegistryEntry[] {
  return registryWith(
    Object.fromEntries(
      listRequiredCodexBridgeSkillDocs().map((entry) => [entry.skillDocId, "active"]),
    ) as Partial<Record<string, CodexBridgeSkillActivationState>>,
  ).map((entry) => ({
    ...entry,
    currentActivationState: activation[entry.skillDocId] ?? entry.currentActivationState,
  }));
}

async function seedBridgeJob(input: {
  bridge: CodexBridgeRepository;
  jobId?: string;
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}) {
  return input.bridge.enqueueFakeCodexBridgeJob({
    jobId: input.jobId ?? "bridge-skill-triggers",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Skill trigger proof",
      promptText: "Observe only.",
      createdBy: "operator",
    }),
    workQueueLink: input.workQueueLink,
  });
}

describe("Codex bridge skill trigger readiness", () => {
  it("discovers the active local Work Queue UX Review skill and required closeout guidance", async () => {
    const discoveries = await discoverActiveLocalCodexSkills();
    const discovery = discoveries.find((item) => item.skillId === "work-queue-ux-review");

    expect(discovery).toMatchObject({
      skillId: "work-queue-ux-review",
      exists: true,
      activationState: "active",
      missingGuidance: [],
    });
    expect(discovery?.requiredGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: "global_outcome_pack_closeout_protocol",
          present: true,
        }),
        expect.objectContaining({
          requirement: "process_completion_distinct_from_task_success",
          present: true,
        }),
      ]),
    );
  });

  it("discovers the active local OpenClaw Bridge Safety skill and required coverage", async () => {
    const discoveries = await discoverActiveLocalCodexSkills();
    const discovery = discoveries.find((item) => item.skillId === "openclaw-bridge-safety");

    expect(discovery).toMatchObject({
      skillId: "openclaw-bridge-safety",
      exists: true,
      activationState: "active",
      missingGuidance: [],
    });
    expect(discovery?.requiredGuidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirement: "runtime_truth_execution_platform_not_skill_text",
          present: true,
        }),
        expect.objectContaining({
          requirement: "same_exact_session_unsupported",
          present: true,
        }),
      ]),
    );
  });

  it("discovers the OpenClaw ClawHub skill without treating it as active in this Codex session", async () => {
    const discovery = await discoverOpenClawClawHubSkill({
      codexSessionSkillIds: ["work-queue-ux-review", "skill-vetter"],
    });

    expect(discovery).toMatchObject({
      skillId: "clawhub",
      openClawRepoSkillInstalled: true,
      codexSessionSkillActive: false,
      searchGuidancePresent: true,
      quarantineGuidancePresent: true,
      installWithoutReviewProhibited: true,
      activationStateForBridgeHarness: "available_as_openclaw_skill",
    });
  });

  it("represents all required bridge safety skills and role docs in the registry", () => {
    const ids = listRequiredCodexBridgeSkillDocs().map((entry) => entry.skillDocId);

    expect(ids).toEqual(
      expect.arrayContaining([
        "openclaw-engineering-standards",
        "repo-boundary-and-path-awareness",
        "tailscale-safe-ui-bridge",
        "deterministic-vs-model-judgment-guardrail",
        "prohibited-semantic-drift-guardrail",
        "execution-platform-runtime-truth",
        "work-queue-lifecycle-semantics",
        "rebuild-and-container-recovery",
        "codex-bailout-protocol",
        "validation-and-proof-policy",
        "artifact-and-stream-capture-policy",
        "work-episode-outcome-pack-closeout",
        "pause-redirect-cancel-control-bridge",
        "orchestrator-role-contract",
        "implementer-role-contract",
        "tester-role-contract",
        "reviewer-role-contract",
        "bailout-role-contract",
        "docs-skills-writer-role-contract",
      ]),
    );
  });

  it("reports missing required skill docs as blockers for code-writing bridge pilots", () => {
    const registry = mostlyActiveRegistry({ "implementer-role-contract": "missing" });
    const testedIds = registry.map((entry) => entry.skillDocId);

    const report = produceCodexBridgeSkillReadinessReport({
      requestedMode: "code_writing_bridge_pilot",
      registry,
      triggerTestedSkillDocIds: testedIds,
    });

    expect(report.allowed).toBe(false);
    expect(report.blockingReasons).toContain("skill_or_doc_missing:implementer-role-contract");
    expect(report.codeWritingBridgePilotBlocked).toBe(true);
    expect(report.liveAuthorityGranted).toBe(false);
  });

  it("allows draft-only docs for fake control loop but blocks code-writing bridge pilots", () => {
    const registry = registryWith({
      "work-queue-ux-review": "active",
      "openclaw-bridge-safety": "active",
    });

    const fakeControl = produceCodexBridgeSkillReadinessReport({
      requestedMode: "fake_control_loop",
      registry,
      liveAuthorityRequested: false,
    });
    expect(fakeControl.allowed).toBe(true);

    const codeWriting = produceCodexBridgeSkillReadinessReport({
      requestedMode: "code_writing_bridge_pilot",
      registry,
      triggerTestedSkillDocIds: [],
    });
    expect(codeWriting.allowed).toBe(false);
    expect(codeWriting.blockingReasons).toEqual(
      expect.arrayContaining([
        "skill_not_active:orchestrator-role-contract",
        "skill_not_trigger_tested:reviewer-role-contract",
        "skill_not_trigger_tested:work-episode-outcome-pack-closeout",
      ]),
    );
  });

  it("marks code-writing bridge skill layer ready when active bridge safety covers required docs", () => {
    const base = registryWith({
      "work-queue-ux-review": "active",
      "openclaw-bridge-safety": "active",
    });
    const registry = applyBridgeSafetySkillCoverage(base);
    const testedIds = registry.map((entry) => entry.skillDocId);

    const report = produceCodexBridgeSkillReadinessReport({
      requestedMode: "code_writing_bridge_pilot",
      registry,
      triggerTestedSkillDocIds: testedIds,
    });

    expect(report.skillLayerReady).toBe(true);
    expect(report.allowed).toBe(true);
    expect(report.codeWritingBridgePilotBlocked).toBe(true);
    expect(report.coveredByBridgeSafetySkillDocIds).toEqual(
      expect.arrayContaining([
        "repo-boundary-and-path-awareness",
        "execution-platform-runtime-truth",
        "orchestrator-role-contract",
        "reviewer-role-contract",
      ]),
    );
  });

  it("selects Work Queue UX review for Work Queue, proactivity, skills, artifact, and agent-work UX prompts", () => {
    const registry = mostlyActiveRegistry();
    const report = evaluateCodexBridgeSkillTriggers({
      registry,
      triggerInput: {
        userPrompt: "Review the Work Queue proactivity skills artifact and agent-work UX.",
        requestedOperationType: "work_queue_review",
      },
    });

    expect(report.triggeredSkillDocIds).toContain("work-queue-ux-review");
    expect(report.activeTriggeredIds).toContain("work-queue-ux-review");
    expect(report.noModelJudgmentUsed).toBe(true);
  });

  it("selects runtime truth and repo boundary guards for runtime substrate mismatch", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        controlReasonCategory: "runtime_substrate_mismatch",
        observedHazards: ["pg-mem was mistaken for Supabase runtime"],
      },
    });

    expect(report.triggeredSkillDocIds).toEqual(
      expect.arrayContaining([
        "repo-boundary-and-path-awareness",
        "execution-platform-runtime-truth",
      ]),
    );
  });

  it("selects Tailscale safe UI bridge guidance for safe UI context gaps", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        controlReasonCategory: "missing_safe_ui_bridge_context",
      },
    });

    expect(report.triggeredSkillDocIds).toContain("tailscale-safe-ui-bridge");
  });

  it("selects deterministic guardrail for deterministic versus model judgment concerns", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        controlReasonCategory: "deterministic_vs_model_judgment_violation",
        userPrompt: "This must be deterministic, not model judgment.",
      },
    });

    expect(report.triggeredSkillDocIds).toContain("deterministic-vs-model-judgment-guardrail");
  });

  it("selects closeout and control bridge guards for missing closeout evidence", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        closeoutGateState: "missing",
        controlReasonCategory: "missing_closeout_evidence",
      },
    });

    expect(report.triggeredSkillDocIds).toEqual(
      expect.arrayContaining([
        "work-episode-outcome-pack-closeout",
        "pause-redirect-cancel-control-bridge",
      ]),
    );
  });

  it("selects rebuild recovery and bailout protocol for rebuild failure", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        bridgeEventKinds: ["rebuild_started", "rebuild_failed"],
      },
    });

    expect(report.triggeredSkillDocIds).toEqual(
      expect.arrayContaining(["rebuild-and-container-recovery", "codex-bailout-protocol"]),
    );
  });

  it("selects role contracts and proof guards for code-writing bridge pilots", () => {
    const report = evaluateCodexBridgeSkillTriggers({
      registry: mostlyActiveRegistry(),
      triggerInput: {
        requestedOperationType: "code_writing_bridge_pilot",
      },
    });

    expect(report.triggeredSkillDocIds).toEqual(
      expect.arrayContaining([
        "orchestrator-role-contract",
        "implementer-role-contract",
        "tester-role-contract",
        "reviewer-role-contract",
        "validation-and-proof-policy",
        "artifact-and-stream-capture-policy",
        "repo-boundary-and-path-awareness",
        "execution-platform-runtime-truth",
        "work-episode-outcome-pack-closeout",
        "work-queue-lifecycle-semantics",
      ]),
    );
  });

  it("allows observe-only smoke only under existing observe-only assumptions", () => {
    const registry = registryWith({});

    const blocked = produceCodexBridgeSkillReadinessReport({
      requestedMode: "observe_only_smoke",
      registry,
      observeOnlyAssumptionsSatisfied: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockingReasons).toContain("observe_only_assumptions_required");

    const allowed = produceCodexBridgeSkillReadinessReport({
      requestedMode: "observe_only_smoke",
      registry,
      observeOnlyAssumptionsSatisfied: true,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.liveAuthorityGranted).toBe(false);
  });

  it("allows fake control loop when live authority remains false", () => {
    const readiness = produceCodexBridgeSkillReadinessReport({
      requestedMode: "fake_control_loop",
      registry: registryWith({
        "work-queue-ux-review": "active",
        "openclaw-bridge-safety": "active",
      }),
      liveAuthorityRequested: false,
    });
    const fakeControl = produceFakeControlLoopReadiness({
      controlBridgeReady: true,
      closeoutGateSatisfied: true,
      skillReadiness: readiness,
    });

    expect(fakeControl).toMatchObject({
      allowed: true,
      liveAuthorityGranted: false,
      codexCliInvoked: false,
      acpSessionStarted: false,
      providerCallMade: false,
      rebuildPerformed: false,
      schedulerStarted: false,
      daemonStarted: false,
      subagentStarted: false,
      workQueueLifecycleMutated: false,
    });
  });

  it("blocks trusted YOLO, rebuild, and autobailout readiness", () => {
    const registry = mostlyActiveRegistry();
    const testedIds = registry.map((entry) => entry.skillDocId);

    for (const requestedMode of ["trusted_yolo_local", "rebuild", "autobailout"] as const) {
      const report = produceCodexBridgeSkillReadinessReport({
        requestedMode,
        registry,
        triggerTestedSkillDocIds: testedIds,
      });
      expect(report.allowed).toBe(false);
      expect(report.trustedYoloBlocked).toBe(true);
      expect(report.rebuildBlocked).toBe(true);
      expect(report.autobailoutBlocked).toBe(true);
      expect(report.liveAuthorityGranted).toBe(false);
    }
  });

  it("persists skill trigger and readiness reports as runtime job evidence", async () => {
    await withSkillTriggerHarness(async ({ bridge, skillTriggers, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      const triggerReport = evaluateCodexBridgeSkillTriggers({
        registry: mostlyActiveRegistry(),
        triggerInput: {
          userPrompt: "Pause for missing closeout evidence.",
          closeoutGateState: "missing",
        },
      });
      const readinessReport = produceCodexBridgeSkillReadinessReport({
        requestedMode: "fake_control_loop",
        registry: registryWith({ "work-queue-ux-review": "active" }),
      });

      await skillTriggers.persistSkillTriggerReport({
        runtimeJobId: "bridge-skill-triggers",
        report: triggerReport,
      });
      await skillTriggers.persistSkillReadinessReport({
        runtimeJobId: "bridge-skill-triggers",
        report: readinessReport,
      });

      await expect(runtimeJobs.listArtifacts("bridge-skill-triggers")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.skill_trigger_report" }),
          expect.objectContaining({ artifactType: "codex_bridge.skill_readiness_report" }),
        ]),
      );
      await expect(runtimeJobs.listEvents("bridge-skill-triggers", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.skill_trigger_checked" }),
        ]),
      );
    });
  });

  it("does not mutate Work Queue lifecycle when evaluating skill triggers", async () => {
    await withSkillTriggerHarness(async ({ bridge, runtimeJobs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "skill-trigger-work-item",
        itemType: "task",
        title: "Skill trigger Work Queue item",
        metadata: {},
      });
      await seedBridgeJob({
        bridge,
        workQueueLink: { workItemId: item.workItemId },
      });

      evaluateCodexBridgeSkillTriggers({
        registry: mostlyActiveRegistry(),
        triggerInput: {
          workQueueLinkPresent: true,
          requestedOperationType: "fake_control_loop",
        },
      });

      const truth = await workQueue.readWorkItemTruth("skill-trigger-work-item");
      expect(truth?.item.lifecycleState).toBe("draft");
      await expect(runtimeJobs.getJob("bridge-skill-triggers")).resolves.toMatchObject({
        state: "pending",
      });
    });
  });
});
