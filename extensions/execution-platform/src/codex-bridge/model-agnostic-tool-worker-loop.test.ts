import { describe, expect, it } from "vitest";
import {
  buildModelAgnosticWorkerPhaseEvent,
  modelAgnosticWorkerSpecializationFor,
  modelAgnosticWorkerSpecializationManifest,
} from "./model-agnostic-tool-worker-loop.ts";

describe("model-agnostic tool worker loop contract", () => {
  it("declares production runnable specializations without raw storage authority", () => {
    const manifest = modelAgnosticWorkerSpecializationManifest();

    expect(manifest.productionRunnableCount).toBeGreaterThanOrEqual(5);
    expect(modelAgnosticWorkerSpecializationFor("kimi_implementation")).toMatchObject({
      runnableState: "production",
      workerRef: "worker.kimi.file-implementation",
      qualificationProfileIds: ["openrouter.moonshotai.kimi-k2.6"],
      toolPermissionIds: expect.arrayContaining([
        "worker.repo.search",
        "worker.edit.apply_patch",
        "worker.validation.run",
        "worker.evidence.claim",
      ]),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(modelAgnosticWorkerSpecializationFor("non_codex_frontend_editor")).toMatchObject({
      runnableState: "contract_only",
      authorityBoundaries: expect.arrayContaining(["not_selectable_in_production"]),
    });
    expect(
      manifest.specializations.every(
        (profile) =>
          !profile.rawPromptStored && !profile.rawResponseStored && !profile.rawProviderLogStored,
      ),
    ).toBe(true);
  });

  it("bounds worker phase events for owner-visible readback", () => {
    const event = buildModelAgnosticWorkerPhaseEvent({
      phase: "worker.tool.completed",
      runtimeJobId: "job-1",
      graphId: "graph-1",
      nodeId: "node-1",
      workerSpecializationId: "kimi_implementation",
      workerId: "worker.kimi.file-implementation",
      roleId: "implementation_engineer",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      objectiveSummary: "  Add a small helper.  ".repeat(100),
      targetRefs: ["src/a.ts", "src/a.ts"],
      toolId: "worker.repo.read_files",
      toolInvocationRef: "runtime-tool://read-1",
      commitmentIdsAdvanced: ["commitment-1"],
      eli5Progress: "The worker read the files it needs before editing.",
      reasonCodes: ["worker_repo_read_files_completed"],
    });

    expect(event.objectiveSummary.length).toBeLessThanOrEqual(1_000);
    expect(event.targetRefs).toEqual(["src/a.ts"]);
    expect(event).toMatchObject({
      artifactKind: "model_agnostic_worker_phase_event",
      phase: "worker.tool.completed",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });
});
