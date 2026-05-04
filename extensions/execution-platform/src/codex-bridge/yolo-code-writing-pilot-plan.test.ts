import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createYoloCodeWritingPilotPlan,
  defaultYoloCodeWritingPilotCandidates,
  evaluateYoloCodeWritingPilotPlanningGate,
  evaluateYoloSupabaseRuntimePersistenceGate,
  selectYoloCodeWritingPilotObjective,
  writeYoloCodeWritingPilotPlanArtifact,
  type YoloCodeWritingPilotCandidate,
} from "./index.ts";

async function withProofRoot<T>(work: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yolo-plan-"));
  await writeProofArtifacts(cwd);
  return work(cwd);
}

async function writeProofArtifacts(cwd: string): Promise<void> {
  const artifactRoot = path.join(cwd, ".artifacts/execution-platform");
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(
    path.join(artifactRoot, "live-supabase-model-memory-persistence-proof-8k.json"),
    JSON.stringify(
      {
        databaseName: "model_memory",
        databaseSource: "config:plugins.entries.model-memory.config.database.url",
        migrationNames: [
          "0001_execution_platform_runtime_jobs.sql",
          "0002_execution_platform_work_queue_truth.sql",
        ],
        codexCliInvoked: false,
        commandExecuted: false,
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    path.join(artifactRoot, "live-smoke-supabase-8k-result.json"),
    JSON.stringify(
      {
        databaseName: "model_memory",
        databaseSource: "config:plugins.entries.model-memory.config.database.url",
        codexCliInvoked: true,
        commandExecuted: true,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function broadCandidate(overrides: Partial<YoloCodeWritingPilotCandidate> = {}) {
  return {
    candidateId: "bad-broad-candidate",
    title: "Bad candidate",
    objective: "Touch unsafe files",
    targetFiles: ["pnpm-lock.yaml", "extensions/execution-platform/migrations/999_bad.sql"],
    expectedTests: ["pnpm test:file extensions/execution-platform"],
    patchType: "source_test" as const,
    riskNotes: ["broad migration lockfile change"],
    ...overrides,
  };
}

describe("YOLO-oriented code-writing pilot planning", () => {
  it("selects a more ambitious safe objective touching related source/test/export files", () => {
    const selection = selectYoloCodeWritingPilotObjective({
      candidates: defaultYoloCodeWritingPilotCandidates(),
      maxFilesAllowed: 3,
    });

    expect(selection.selectedObjective).toMatchObject({
      candidateId: "add-yolo-authority-profile-helper-and-tests",
    });
    expect(selection.selectedObjective?.targetFiles).toHaveLength(3);
    expect(selection.objectiveRiskClass).toBe("ambitious_bounded_source_test_patch");
    expect(selection.blockingReasons).toEqual([]);
  });

  it("rejects broad targets, lockfiles, migrations, and runtime config", () => {
    const selection = selectYoloCodeWritingPilotObjective({
      candidates: [
        broadCandidate({
          targetFiles: ["pnpm-lock.yaml", "config/runtime.ts", "deploy/service.yaml"],
        }),
      ],
      maxFilesAllowed: 3,
    });

    expect(selection.selectedObjective).toBeNull();
    expect(selection.rejectedCandidates[0]?.rejectedReasons).toEqual(
      expect.arrayContaining([
        "target_file_forbidden:package_lockfile",
        "target_file_forbidden:runtime_config",
        "target_file_forbidden:deployment",
      ]),
    );
  });

  it("proves Supabase runtime persistence from existing proof-shaped artifacts", async () => {
    await withProofRoot(async (cwd) => {
      const gate = await evaluateYoloSupabaseRuntimePersistenceGate({ cwd });

      expect(gate.supabaseRuntimePersistenceProven).toBe(true);
      expect(gate.runtimeLogicalDatabase).toBe("model_memory");
      expect(gate.runtimeResolverSource).toBe(
        "config:plugins.entries.model-memory.config.database.url",
      );
      expect(gate.blockingReasons).toEqual([]);
    });
  });

  it("blocks execution-readiness when Supabase proof is missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "yolo-plan-missing-proof-"));
    const gate = await evaluateYoloSupabaseRuntimePersistenceGate({ cwd });

    expect(gate.supabaseRuntimePersistenceProven).toBe(false);
    expect(gate.blockingReasons).toEqual(
      expect.arrayContaining([
        "missing_supabase_persistence_proof_artifact",
        "supabase_logical_database_not_proven",
      ]),
    );
  });

  it("creates a disabled request skeleton and inert prompt package with validation repair loop", async () => {
    await withProofRoot(async (cwd) => {
      const result = await createYoloCodeWritingPilotPlan({
        pilotPlanId: "yolo-plan-8v",
        requestId: "yolo-request-8v",
        promptPackageId: "yolo-prompt-8v",
        runtimeJobId: "bridge-yolo-plan-8v",
        sessionId: "session-yolo-plan-8v",
        createdBy: "operator",
        now: new Date("2026-05-03T04:00:00.000Z"),
        cwd,
      });

      expect(result.plan.allowedToCreateLiveRequest).toBe(true);
      expect(result.plan.allowedToRunLivePilot).toBe(false);
      expect(result.requestSkeleton).toMatchObject({
        enableLiveCodexPilot: false,
        enableYoloOrientedBridgePilot: false,
        enableOperatorEquivalentYolo: false,
        enableBoundedValidationRepair: false,
        commandExecuted: false,
        liveExecutionEnabled: false,
      });
      expect(result.promptPackage).toMatchObject({
        inertMetadataOnly: true,
        processCompletionIsTaskSuccess: false,
        validationPassingRequiredForTaskSuccess: true,
      });
      expect(JSON.stringify(result.promptPackage)).toContain("operator-equivalent local YOLO");
      expect(JSON.stringify(result.promptPackage)).toContain("approved validation commands");
      expect(result.planningGate.allowedToRunLivePilot).toBe(false);
      expect(result.supabaseRuntimePersistenceGate.supabaseRuntimePersistenceProven).toBe(true);
    });
  });

  it("keeps staged authority distinct from the final YOLO target", async () => {
    await withProofRoot(async (cwd) => {
      const result = await createYoloCodeWritingPilotPlan({
        runtimeJobId: "bridge-yolo-plan-8v",
        sessionId: "session-yolo-plan-8v",
        createdBy: "operator",
        cwd,
      });

      expect(result.plan.authorityProfile.profileKind).toBe("staged_bounded");
      expect(result.plan.currentStageAuthority.shellCommand).toBe(
        "approved_validation_commands_only",
      );
      expect(result.plan.targetYoloAuthority.shellCommand).toBe("operator_equivalent");
      expect(result.plan.futureExecutionAuthorityGranted).toBe(false);
      expect(result.plan.workQueueLifecycleMutationAllowed).toBe(false);
      expect(result.plan.noAcp).toBe(true);
      expect(result.plan.noSubagents).toBe(true);
      expect(result.authorityValidation.finalYoloAuthorityCurrentlyGranted).toBe(false);
    });
  });

  it("planning gate rejects underpowered single-shot prompt packages", async () => {
    await withProofRoot(async (cwd) => {
      const result = await createYoloCodeWritingPilotPlan({
        runtimeJobId: "bridge-yolo-plan-8v",
        sessionId: "session-yolo-plan-8v",
        createdBy: "operator",
        cwd,
      });
      const gate = evaluateYoloCodeWritingPilotPlanningGate({
        objectiveSelection: result.objectiveSelection,
        authorityValidation: result.authorityValidation,
        supabaseRuntimePersistenceGate: result.supabaseRuntimePersistenceGate,
        promptPackage: {
          ...result.promptPackage,
          repairLoopInstructions: [],
          finalYoloAuthorityTargetStatement: "single-shot no validation loop",
        },
      });

      expect(gate.allowedToPlanNextPilot).toBe(false);
      expect(gate.blockingReasons).toEqual(
        expect.arrayContaining(["prompt_package_is_underpowered_single_shot"]),
      );
    });
  });

  it("writes a bounded plan artifact without invoking Codex", async () => {
    await withProofRoot(async (cwd) => {
      const result = await createYoloCodeWritingPilotPlan({
        pilotPlanId: "yolo-plan-8v",
        runtimeJobId: "bridge-yolo-plan-8v",
        sessionId: "session-yolo-plan-8v",
        createdBy: "operator",
        cwd,
      });
      const artifact = await writeYoloCodeWritingPilotPlanArtifact({
        result,
        artifactPath: path.join(cwd, ".artifacts/execution-platform/yolo-plan.json"),
      });

      expect(artifact.pilotPlanId).toBe("yolo-plan-8v");
      expect(result.plan.codexCliInvoked).toBe(false);
      expect(result.plan.commandExecuted).toBe(false);
      expect(result.plan.liveExecutionEnabled).toBe(false);
    });
  });
});
