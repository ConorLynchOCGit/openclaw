import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateDerivedSourceMetadata,
  buildDerivedArtifactId,
  buildDerivedConflictMarkers,
  buildDerivedFreshness,
  buildDerivedStaleMarkers,
  cloneJsonLike,
  dedupeDerivedSourceRefs,
  deriveLifecycleExclusion,
  getDerivedArtifactRolePolicy,
  hashDerivedArtifactValue,
  isDerivedArtifactGenerationContextAuthority,
  normalizeDerivedArtifactFileId,
  normalizeDerivedArtifactRelativePath,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
} from "./derived-artifact.ts";

describe("derived-artifact core", () => {
  it("generates deterministic ids and hashes", () => {
    const input = {
      family: "capsule" as const,
      artifactType: "project_state",
      targetId: "project-1",
      seed: { sourceMemoryIds: ["mem-b", "mem-a"] },
    };

    expect(buildDerivedArtifactId(input)).toBe(buildDerivedArtifactId(input));
    expect(hashDerivedArtifactValue({ a: 1, b: ["x"] })).toBe(
      hashDerivedArtifactValue({ a: 1, b: ["x"] }),
    );
    expect(hashDerivedArtifactValue({ a: 1 })).toHaveLength(64);
  });

  it("sorts source memory ids and deduplicates source refs", () => {
    expect(uniqueSortedStrings(["mem-b", undefined, "mem-a", "mem-b"])).toEqual(["mem-a", "mem-b"]);

    expect(
      dedupeDerivedSourceRefs([
        { sourceId: "src-b", segmentId: "seg-2" },
        { sourceId: "src-a", segmentId: "seg-1" },
        { sourceId: "src-a", segmentId: "seg-1" },
      ]),
    ).toEqual([
      { sourceId: "src-a", segmentId: "seg-1" },
      { sourceId: "src-b", segmentId: "seg-2" },
    ]);
  });

  it("aggregates authority tiers and source profile ids", () => {
    expect(
      aggregateDerivedSourceMetadata([
        {
          sourceMemoryIds: ["mem-b", "mem-a"],
          sourceEventIds: ["evt-b"],
          sourceEdgeIds: ["edge-b"],
          sourceRefs: [{ sourceId: "src-a" }],
          authorityTier: "cited_soft",
          sourceProfileId: "cited_assistant_answer",
        },
        {
          sourceMemoryIds: ["mem-a"],
          sourceEventIds: ["evt-a"],
          sourceEdgeIds: ["edge-a"],
          sourceRefs: [{ sourceId: "src-a" }],
          authorityTiers: ["curated_authoritative"],
          sourceProfileIds: ["curated_corpus"],
        },
      ]),
    ).toMatchObject({
      sourceMemoryIds: ["mem-a", "mem-b"],
      sourceEventIds: ["evt-a", "evt-b"],
      sourceEdgeIds: ["edge-a", "edge-b"],
      authorityTiers: ["cited_soft", "curated_authoritative"],
      sourceProfileIds: ["cited_assistant_answer", "curated_corpus"],
      sourceRefs: [{ sourceId: "src-a" }],
    });
  });

  it("derives lifecycle exclusions and freshness markers", () => {
    expect(deriveLifecycleExclusion({ status: "superseded" })).toBe("superseded");
    expect(deriveLifecycleExclusion({ lifecycleState: "conflict_hold" })).toBe("conflict_hold");
    expect(deriveLifecycleExclusion({ authorityTier: "inspection_only" })).toBe("inspection_only");
    expect(
      deriveLifecycleExclusion({
        status: "active",
        invalidAt: "2026-04-24T00:00:00.000Z",
        now: new Date("2026-04-25T00:00:00.000Z"),
      }),
    ).toBe("stale");
    expect(buildDerivedStaleMarkers(["stale:b", "stale:a", "stale:a"])).toEqual([
      "stale:a",
      "stale:b",
    ]);
    expect(buildDerivedConflictMarkers(["mem-b", "mem-a", "mem-a"])).toEqual(["mem-a", "mem-b"]);
    expect(buildDerivedFreshness({ staleMarkers: [] })).toEqual({ status: "fresh" });
    expect(
      buildDerivedFreshness({
        staleMarkers: ["stale:mem-a"],
        reasonWhenStale: "source memory stale",
      }),
    ).toEqual({ status: "stale", reason: "source memory stale" });
  });

  it("normalizes safe artifact ids and rejects unsafe relative paths", () => {
    expect(normalizeDerivedArtifactFileId("project 1/alpha")).toBe("project-1-alpha");
    expect(
      normalizeDerivedArtifactRelativePath({
        relativePath: ".openclaw/model-memory/projections/project/page.md",
        allowedPrefixes: [".openclaw/model-memory/projections/"],
        allowedExtensions: [".md"],
      }),
    ).toBe(".openclaw/model-memory/projections/project/page.md");
    expect(() =>
      normalizeDerivedArtifactRelativePath({
        relativePath: "../MEMORY.md",
        allowedPrefixes: [".openclaw/model-memory/projections/"],
        allowedExtensions: [".md"],
      }),
    ).toThrow("unsafe derived artifact path");
  });

  it("writes bounded derived JSON and rejects prohibited raw-content fields", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "derived-artifact-"));

    const written = await writeBoundedDerivedJsonArtifact({
      artifactDir,
      artifactId: "project 1",
      suffix: "capsule",
      value: {
        schemaVersion: "test.v1",
        source_memory_ids: ["mem-a"],
        content_hash: "hash-a",
      },
    });

    expect(path.basename(written.path)).toBe("project-1.capsule.json");
    expect(written.contentHash).toHaveLength(64);
    expect(JSON.parse(await fs.readFile(written.path, "utf8"))).toMatchObject({
      schemaVersion: "test.v1",
      source_memory_ids: ["mem-a"],
    });
    await expect(
      writeBoundedDerivedJsonArtifact({
        artifactDir,
        artifactId: "unsafe",
        suffix: "capsule",
        value: { raw_prompt: "do not persist" },
      }),
    ).rejects.toThrow("unsafe derived artifact field");
  });

  it("clones JSON-shaped artifacts so snapshots are read-only to callers", () => {
    const original = {
      sourceMemoryIds: ["mem-a"],
      digest: { conflictMarkers: ["mem-b"] },
    };
    const cloned = cloneJsonLike(original);
    cloned.sourceMemoryIds.push("mem-c");
    cloned.digest.conflictMarkers.length = 0;

    expect(original).toEqual({
      sourceMemoryIds: ["mem-a"],
      digest: { conflictMarkers: ["mem-b"] },
    });
  });

  it("keeps project_page out of generation/context authority when project_state exists", () => {
    expect(
      getDerivedArtifactRolePolicy({
        family: "capsule",
        artifactType: "project_state",
      }),
    ).toMatchObject({
      roles: ["generation_context", "operator_report"],
      generationContextAuthority: "primary",
    });
    expect(
      getDerivedArtifactRolePolicy({
        family: "projection",
        artifactType: "project_page",
      }),
    ).toMatchObject({
      roles: ["read_model", "operator_report", "workspace_bootstrap"],
      generationContextAuthority: "thin_renderer_only",
    });
    expect(
      isDerivedArtifactGenerationContextAuthority({
        family: "projection",
        artifactType: "project_page",
        richerCapsuleAvailable: true,
      }),
    ).toBe(false);
  });
});
