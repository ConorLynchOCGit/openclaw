import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileProjection } from "../../projection-compiler.ts";
import type { RuntimeMemoryRecord } from "../../runtime-read-models.ts";
import {
  buildActiveProjectionSourceIdSet,
  materializeProjectionArtifacts,
} from "./materializer.ts";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function memory(
  overrides: Partial<RuntimeMemoryRecord> & Pick<RuntimeMemoryRecord, "id">,
): RuntimeMemoryRecord {
  return {
    id: overrides.id,
    canonicalClass: overrides.canonicalClass ?? "project",
    kind: overrides.kind ?? "fact",
    payload: overrides.payload ?? { subject: "projection materialization", value: "artifact-only" },
    normalizedSubject: overrides.normalizedSubject ?? "projection materialization",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText:
      overrides.normalizedSearchText ?? "projection materialization artifact-only",
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

describe("projection artifact materializer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "projection-materializer-"));
    await writeFile(path.join(tempDir, "USER.md"), "human user file\n", "utf8");
    await writeFile(path.join(tempDir, "MEMORY.md"), "human memory file\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("materializes markdown, digest JSON, and index without root write-back", async () => {
    const active = memory({ id: "memory-active", slotKey: "slot-active" });
    const compiled = compileProjection({
      targetId: "memory-md",
      memoryObjects: [active],
      slots: [
        {
          slotKey: "slot-active",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "project-001",
          subjectKey: "projection materialization",
          currentObjectId: "memory-active",
          currentIdentityKey: "memory-active",
          updatedAt: new Date(0),
        },
      ],
      sets: [],
      builtAt: new Date(0),
    });
    const userBefore = sha256(await readFile(path.join(tempDir, "USER.md"), "utf8"));
    const memoryBefore = sha256(await readFile(path.join(tempDir, "MEMORY.md"), "utf8"));

    const result = await materializeProjectionArtifacts({
      workspaceRoot: tempDir,
      entries: [
        {
          targetId: compiled.target.targetId,
          renderedText: compiled.renderedText,
          version: compiled.version,
          digest: compiled.digest,
        },
      ],
      activeMemoryIds: buildActiveProjectionSourceIdSet([active]),
      generatedAt: new Date(0),
    });

    const entry = result.artifact_entries[0];
    const markdown = await readFile(path.join(tempDir, entry.markdown_path), "utf8");
    const json = JSON.parse(await readFile(path.join(tempDir, entry.json_path), "utf8")) as Record<
      string,
      unknown
    >;
    const index = JSON.parse(
      await readFile(path.join(tempDir, ".openclaw/model-memory/projections/index.json"), "utf8"),
    ) as typeof result;

    expect(markdown).toContain("projection materialization");
    expect(json.content_hash).toBe(compiled.version.contentHash);
    expect(json.source_memory_ids).toEqual(["memory-active"]);
    expect(json.source_event_ids).toEqual(["event-001"]);
    expect(index.root_write_back_status).toBe("disabled");
    expect(index.artifact_entries[0]?.content_hash).toBe(compiled.version.contentHash);
    expect(await readdir(path.join(tempDir, ".openclaw/model-memory/projections"))).toEqual(
      expect.arrayContaining([
        path.basename(entry.markdown_path),
        path.basename(entry.json_path),
        "index.json",
      ]),
    );
    expect(sha256(await readFile(path.join(tempDir, "USER.md"), "utf8"))).toBe(userBefore);
    expect(sha256(await readFile(path.join(tempDir, "MEMORY.md"), "utf8"))).toBe(memoryBefore);
  });

  it("rejects projections that reference inactive source memory ids", async () => {
    const superseded = memory({
      id: "memory-superseded",
      slotKey: "slot-superseded",
      lifecycleState: "superseded",
      supersededAt: new Date(1),
    });
    const compiled = compileProjection({
      targetId: "memory-md",
      memoryObjects: [superseded],
      slots: [
        {
          slotKey: "slot-superseded",
          canonicalClass: "project",
          kind: "fact",
          scopeKey: "project-001",
          subjectKey: "projection materialization",
          currentObjectId: "memory-superseded",
          currentIdentityKey: "memory-superseded",
          updatedAt: new Date(0),
        },
      ],
      sets: [],
      builtAt: new Date(0),
    });

    await expect(
      materializeProjectionArtifacts({
        workspaceRoot: tempDir,
        entries: [
          {
            targetId: compiled.target.targetId,
            renderedText: compiled.renderedText,
            version: compiled.version,
            digest: compiled.digest,
          },
        ],
        activeMemoryIds: buildActiveProjectionSourceIdSet([superseded]),
      }),
    ).rejects.toThrow("inactive source memory ids");
  });
});
