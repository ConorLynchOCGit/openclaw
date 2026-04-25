import { describe, expect, it } from "vitest";
import {
  compileProjection,
  compileProjectionCatalogDigests,
  compileProjectionCatalogPages,
} from "./projection-compiler.ts";
import type { RuntimeMemoryRecord } from "./runtime-read-models.ts";
import { PROJECTION_REGISTRY } from "./runtime/projections/registry.ts";

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
          id: "memory-source",
          canonicalClass: "reference",
          kind: "reference",
          payload: { path: "docs/projects/model-memory/STATUS.md" },
          normalizedSearchText: "source reference docs projects model memory status",
        }),
        memory({
          id: "memory-decision",
          kind: "fact",
          payload: { subject: "architecture decision", value: "MMV2 SQL is truth" },
          normalizedSubject: "architecture decision",
          normalizedSearchText: "architecture decision MMV2 SQL is truth",
        }),
        memory({
          id: "memory-episode",
          kind: "fact",
          activationBasis: "daily_recovery_candidate",
          payload: { subject: "timeline event", value: "runtime hardening landed" },
        }),
        memory({
          id: "memory-conflict",
          lifecycleState: "conflict_hold",
        }),
      ],
      builtAt: new Date(0),
    });

    expect(digests.map((digest) => digest.projectionType)).toEqual(
      PROJECTION_REGISTRY.map((entry) => entry.projectionType),
    );
    expect(digests).toHaveLength(10);
    for (const digest of digests) {
      expect(digest.schemaVersion).toBe("memory_projection.v1");
      expect(digest.projectionId).toContain(`projection:${digest.projectionType}:`);
      expect(digest.contentHash).toHaveLength(64);
      expect(digest.compiledAt).toBe("1970-01-01T00:00:00.000Z");
      expect(digest.artifactPaths.digestPath).toContain(".openclaw/model-memory/projections/");
      expect(digest.retrievalDigest.contentHash).toBe(digest.contentHash);
    }
    expect(
      digests.find((digest) => digest.projectionType === "user_profile_page")?.sourceMemoryIds,
    ).toEqual(["memory-pref"]);
    expect(
      digests.find((digest) => digest.projectionType === "procedure_page")?.sourceMemoryIds,
    ).toEqual(["memory-proc"]);
    expect(
      digests.find((digest) => digest.projectionType === "source_page")?.sourceMemoryIds,
    ).toEqual(["memory-source"]);
    expect(
      digests.find((digest) => digest.projectionType === "decision_log")?.sourceMemoryIds,
    ).toEqual(["memory-decision"]);
    expect(
      digests.find((digest) => digest.projectionType === "projection_digest")?.conflictMarkers,
    ).toEqual(["conflicted_source_memory"]);
  });

  it("compiles rich materialized catalog pages for every projection type", () => {
    const pages = compileProjectionCatalogPages({
      memoryObjects: [
        memory({
          id: "memory-pref",
          canonicalClass: "user",
          kind: "preference",
          payload: { subject: "validation reports", instruction: "concise status first" },
        }),
        memory({
          id: "memory-project",
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "model-memory status", value: "runtime hardening landed" },
        }),
        memory({
          id: "memory-proc",
          kind: "procedure",
          payload: { title: "release checklist", steps: ["test", "build"] },
        }),
        memory({
          id: "memory-source",
          canonicalClass: "reference",
          kind: "reference",
          payload: { path: "docs/projects/model-memory/STATUS.md" },
          normalizedSearchText: "source reference docs projects model memory status",
        }),
        memory({
          id: "memory-decision",
          kind: "fact",
          payload: { subject: "architecture decision", value: "MMV2 SQL is truth" },
          normalizedSubject: "architecture decision",
          normalizedSearchText: "architecture decision MMV2 SQL is truth",
        }),
        memory({
          id: "memory-conflict",
          lifecycleState: "conflict_hold",
        }),
      ],
      builtAt: new Date(0),
    });

    expect(pages.map((page) => page.digest.projectionType)).toEqual(
      PROJECTION_REGISTRY.map((entry) => entry.projectionType),
    );
    expect(pages).toHaveLength(10);
    for (const page of pages) {
      expect(page.targetId).toBe(`catalog-${page.digest.projectionType}`);
      expect(page.version.projectionType).toBe(page.digest.projectionType);
      expect(page.version.canonicalArtifactPath).toBe(
        `${page.registryEntry.artifactPathPrefix}/page.md`,
      );
      expect(page.renderedText).toContain("This projection is a compiled MMV2 view");
      expect(page.renderedText).toContain("## Rich Runtime Page");
      expect(page.renderedText).toContain(`- projection_id: ${page.digest.projectionId}`);
      expect(page.renderedText).toContain(`- projection_type: ${page.digest.projectionType}`);
      expect(page.renderedText).toContain(`- content_hash: ${page.digest.contentHash}`);
      expect(page.renderedText).toContain(`- artifact_path: ${page.version.canonicalArtifactPath}`);
      expect(page.version.sourceObjectIds).toEqual(page.digest.sourceMemoryIds);
      expect(page.version.sourceEventIds).toEqual(page.digest.sourceEventIds);
      expect(page.version.sourceEdgeIds).toEqual(page.digest.sourceEdgeIds);
      expect(page.version.retrievalDigest?.contentHash).toBe(page.digest.contentHash);
    }
    expect(
      pages.find((page) => page.digest.projectionType === "user_profile_page")?.digest
        .sourceMemoryIds,
    ).toEqual(["memory-pref"]);
    expect(
      pages.find((page) => page.digest.projectionType === "project_page")?.digest.sourceMemoryIds,
    ).toEqual(["memory-decision", "memory-proc", "memory-project"]);
    expect(
      pages.find((page) => page.digest.projectionType === "project_page")?.renderedText,
    ).toContain("## Operator Project Read Model");
    expect(
      pages.find((page) => page.digest.projectionType === "project_page")?.renderedText,
    ).toContain("generation_context_authority: thin_renderer_only");
    expect(
      pages.find((page) => page.digest.projectionType === "procedure_page")?.renderedText,
    ).toContain("## Operational Runbooks And Checklists");
    expect(
      pages.find((page) => page.digest.projectionType === "decision_log")?.renderedText,
    ).toContain("## Prior Decisions");
    expect(
      pages.find((page) => page.digest.projectionType === "source_page")?.renderedText,
    ).toContain("## Canonical Source Evidence");
    expect(
      pages.find((page) => page.digest.projectionType === "user_profile_page")?.renderedText,
    ).toContain("## Stable Task-Relevant Preferences");
    expect(
      pages.find((page) => page.digest.projectionType === "entity_page")?.renderedText,
    ).toContain("## Entity Knowledge");
    expect(
      pages.find((page) => page.digest.projectionType === "timeline_page")?.renderedText,
    ).toContain("## Change Timeline");
    expect(
      pages.find((page) => page.digest.projectionType === "dashboard")?.renderedText,
    ).toContain("## Memory Health Dashboard");
    expect(
      pages.find((page) => page.digest.projectionType === "agent_digest")?.renderedText,
    ).toContain("## Compact Agent Context");
    expect(
      pages.find((page) => page.digest.projectionType === "projection_digest")?.renderedText,
    ).toContain("## Projection Retrieval Index");
    expect(
      pages.find((page) => page.digest.projectionType === "projection_digest")?.digest
        .conflictMarkers,
    ).toEqual(["conflicted_source_memory"]);
  });
});
