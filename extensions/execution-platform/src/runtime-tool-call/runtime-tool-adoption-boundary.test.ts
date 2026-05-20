import { describe, expect, it } from "vitest";
import {
  RUNTIME_TOOL_ADOPTION_BOUNDARY_LEGACY_ALIASES,
  buildRuntimeToolificationTruthRegistry,
  buildRuntimeToolAdoptionBoundaryMapFromRegistry,
  evaluateRuntimeToolificationAdoptionGate,
  summarizeRuntimeToolificationTruthRegistry,
} from "./runtime-tool-adoption-boundary.ts";

describe("runtime toolification truth registry", () => {
  it("tracks production, queued, and compatibility surfaces without overclaiming", () => {
    const surfaces = buildRuntimeToolificationTruthRegistry();
    const summary = summarizeRuntimeToolificationTruthRegistry({ surfaces });

    expect(summary.surfaceCount).toBeGreaterThan(8);
    expect(summary.productionPrimaryCount).toBeGreaterThan(3);
    expect(summary.queuedForToolificationCount).toBeGreaterThanOrEqual(2);
    expect(summary.nextQueueItemIds).not.toContain(
      "openclaw-convergence.toolification-10-closeout-generate-toolification",
    );
    expect(
      surfaces.find((surface) => surface.surfaceId === "closeout-generate-toolification"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      blockerReasonCodes: [],
    });
    expect(
      surfaces.find((surface) => surface.surfaceId === "model-call-toolification"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      blockerReasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(
      surfaces.find((surface) => surface.surfaceId === "script-db-operation-toolification"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      blockerReasonCodes: [],
    });
    expect(
      surfaces.find((surface) => surface.surfaceId === "workflow-evidence-profiles-readback"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      nextQueueItemId: null,
      blockerReasonCodes: [],
    });
    expect(
      surfaces.find(
        (surface) => surface.surfaceId === "canonical-workflow-runtime-engine-definition-registry",
      ),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      nextQueueItemId: null,
      blockerReasonCodes: [],
    });
    expect(
      surfaces.find((surface) => surface.surfaceId === "coding-team-plugin-extraction"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      nextQueueItemId: null,
      blockerReasonCodes: [],
    });
    expect(
      surfaces.find((surface) => surface.surfaceId === "generic-workflow-runner-retirement"),
    ).toMatchObject({
      currentStatus: "production_primary",
      targetStatus: "production_primary",
      nextQueueItemId: null,
      blockerReasonCodes: [],
      gates: {
        compatibilityRetirementRequired: true,
      },
    });
  });

  it("accepts production-primary claims only when required refs exist", () => {
    const surface = buildRuntimeToolificationTruthRegistry().find(
      (item) => item.surfaceId === "scheduler-toolification",
    );
    expect(surface).toBeTruthy();

    const rejected = evaluateRuntimeToolificationAdoptionGate({
      surface: surface!,
      claim: {
        surfaceId: surface!.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: ["artifact://scheduler/evidence"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    expect(rejected.accepted).toBe(false);
    expect(rejected.missingEvidenceKinds).toEqual(
      expect.arrayContaining(["runtime_tool_invocation_ref", "work_queue_readback_ref"]),
    );

    const accepted = evaluateRuntimeToolificationAdoptionGate({
      surface: surface!,
      claim: {
        surfaceId: surface!.surfaceId,
        claimKind: "production_primary",
        claimedStatus: "production_primary",
        evidenceRefs: ["artifact://scheduler/evidence"],
        toolInvocationRefs: ["runtime-tool://scheduler/decompose"],
        workQueueReadbackRefs: ["work-queue-readback://scheduler"],
        closeoutRefs: ["closeout://scheduler"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      },
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.effectiveStatus).toBe("production_primary");
  });

  it("rejects raw-storage claims before they can become Work Queue truth", () => {
    const surface = buildRuntimeToolificationTruthRegistry()[0]!;
    expect(() =>
      evaluateRuntimeToolificationAdoptionGate({
        surface,
        claim: {
          surfaceId: surface.surfaceId,
          claimKind: "registry_entry",
          claimedStatus: "production_primary",
          evidenceRefs: ["artifact://registry"],
          rawPromptStored: true as false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        },
      }),
    ).toThrow("runtime_toolification_claim_raw_prompt_storage_rejected");
  });

  it("derives the legacy adoption boundary map from the canonical registry", () => {
    const surfaces = buildRuntimeToolificationTruthRegistry();
    const boundaryMap = buildRuntimeToolAdoptionBoundaryMapFromRegistry(surfaces);
    const surfacesById = new Map(surfaces.map((surface) => [surface.surfaceId, surface]));

    expect(boundaryMap).toHaveLength(RUNTIME_TOOL_ADOPTION_BOUNDARY_LEGACY_ALIASES.length);
    for (const alias of RUNTIME_TOOL_ADOPTION_BOUNDARY_LEGACY_ALIASES) {
      const legacy = boundaryMap.find((surface) => surface.surfaceId === alias.legacySurfaceId);
      const canonical = surfacesById.get(alias.canonicalSurfaceId);
      expect(legacy).toBeTruthy();
      expect(canonical).toBeTruthy();
      expect(legacy?.nextQueueItem).toBe(canonical?.nextQueueItemId);
      expect(legacy?.reasonCodes).toContain(
        "runtime_tool_adoption_boundary_registry_derived_compat_export",
      );
    }
    expect(
      boundaryMap.find((surface) => surface.surfaceId === "model-task-middleware"),
    ).toMatchObject({
      status: "production_primary",
      nextQueueItem: null,
    });
  });
});
