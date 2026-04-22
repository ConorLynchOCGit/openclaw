import { describe, expect, it } from "vitest";
import { compileProjection, compileProjectionCatalogDigests } from "./projection-compiler.ts";
import type { RuntimeMemoryRecord } from "./runtime-read-models.ts";

function memory(
  overrides: Partial<RuntimeMemoryRecord> & Pick<RuntimeMemoryRecord, "id">,
): RuntimeMemoryRecord {
  return {
    id: overrides.id,
    canonicalClass: overrides.canonicalClass ?? "project",
    kind: overrides.kind ?? "fact",
    payload: overrides.payload ?? { subject: "deployment region", value: "region-001" },
    normalizedSubject: overrides.normalizedSubject ?? "deployment region",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText: overrides.normalizedSearchText ?? "deployment region region-001",
    scope: overrides.scope ?? { projectId: "project-001" },
    scopeKey: overrides.scopeKey ?? "project-001",
    provenance: overrides.provenance ?? [
      { sourceId: "source-001", blockId: "segment-001", memoryEventId: "event-001" },
    ],
    lifecycleState: overrides.lifecycleState ?? "active",
    activationBasis: overrides.activationBasis ?? "primary_capture",
    confidence: overrides.confidence ?? "strong",
    durability: overrides.durability ?? "durable",
    suggestedReviewMode: overrides.suggestedReviewMode ?? "auto_accept",
    executedReviewMode: overrides.executedReviewMode ?? "auto_accept",
    rationaleCodes: overrides.rationaleCodes ?? [],
    identityKey: overrides.identityKey ?? overrides.id,
    contractName: overrides.contractName ?? "mmv2_runtime_projection",
    contractVersion: overrides.contractVersion ?? "v1",
    modelId: overrides.modelId ?? "mmv2-storage",
    createdAt: overrides.createdAt ?? new Date(0),
    activatedAt: overrides.activatedAt,
    expiredAt: overrides.expiredAt,
    supersededAt: overrides.supersededAt,
    sourceWindowId: overrides.sourceWindowId,
    slotKey: overrides.slotKey,
  };
}

describe("projection compiler", () => {
  it("emits artifact-only projection digests backed by active MMV2 ids and events", () => {
    const result = compileProjection({
      targetId: "memory-md",
      memoryObjects: [
        memory({ id: "memory-active", slotKey: "slot-active" }),
        memory({
          id: "memory-superseded",
          lifecycleState: "superseded",
          supersededAt: new Date(1),
        }),
      ],
      slots: [
        {
          slotKey: "slot-active",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "project-001",
          subjectKey: "deployment region",
          currentObjectId: "memory-active",
          currentIdentityKey: "memory-active",
          updatedAt: new Date(0),
        },
      ],
      sets: [],
      existingFileContent: "Human-owned root memory.\n",
      builtAt: new Date(0),
    });

    expect(result.digest.projectionType).toBe("projection_digest");
    expect(result.digest.sourceMemoryIds).toEqual(["memory-active"]);
    expect(result.digest.sourceEventIds).toEqual(["event-001"]);
    expect(result.digest.contentHash).toHaveLength(64);
    expect(result.version.sourceEventIds).toEqual(["event-001"]);
    expect(result.version.retrievalDigest?.sourceMemoryIds).toEqual(["memory-active"]);
    expect(result.outputFileContent).toBe("Human-owned root memory.\n");
  });

  it("compiles the registered projection catalog as deterministic views, not truth", () => {
    const digests = compileProjectionCatalogDigests({
      memoryObjects: [
        memory({
          id: "memory-pref",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "concise status first" },
        }),
        memory({
          id: "memory-proc",
          kind: "procedure",
          payload: { title: "release checklist", steps: ["test", "build"] },
        }),
        memory({
          id: "memory-conflict",
          lifecycleState: "conflict_hold",
        }),
      ],
      builtAt: new Date(0),
    });

    expect(digests.map((digest) => digest.projectionType)).toEqual(
      expect.arrayContaining([
        "user_profile_page",
        "project_page",
        "procedure_page",
        "projection_digest",
      ]),
    );
    expect(
      digests.find((digest) => digest.projectionType === "user_profile_page")?.sourceMemoryIds,
    ).toEqual(["memory-pref"]);
    expect(
      digests.find((digest) => digest.projectionType === "procedure_page")?.sourceMemoryIds,
    ).toEqual(["memory-proc"]);
    expect(
      digests.find((digest) => digest.projectionType === "projection_digest")?.conflictMarkers,
    ).toEqual(["conflicted_source_memory"]);
  });
});
