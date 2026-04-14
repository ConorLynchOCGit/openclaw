import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "./database-memory-object-store.ts";
import { applyModelMemoryMigrations } from "./migrations.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";

function capturedFact(value: string, sourceWindowId: string) {
  return {
    sourceWindowId,
    contractName: "semantic_extraction" as const,
    contractVersion: "v1",
    modelId: "model-turn-001",
    object: {
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject: "deployment region",
        value,
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: [{ sourceId: sourceWindowId, segmentIndex: 0, headingPath: [] }],
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "auto_accept" as const,
    },
  };
}

describe("canonical-repository", () => {
  it("round-trips sources and source windows through the live schema", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);

      const source = await repository.persistSource({
        id: "2f7f4309-3b8e-5f1e-9a86-4b6aa7f54d62",
        sourceKind: "document",
        externalSourceId: "doc-001",
        sourceFingerprint: "fingerprint-doc-001",
        projectId: "project-001",
        sourceMetadata: { path: "docs/example.md" },
        createdAt: new Date(0),
      });
      const windows = await repository.persistSourceWindows([
        {
          id: "8f300d66-2cff-5b2d-8ccd-3f6c3c2ef816",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "project-001 uses region-001",
          normalizedFingerprint: "window-fingerprint-001",
          tokenEstimate: 4,
          headingPath: ["Project"],
          blockDescriptors: [{ id: "block-001", kind: "paragraph" }],
          lineStart: 1,
          lineEnd: 2,
          createdAt: new Date(0),
        },
      ]);

      const snapshot = await repository.snapshot();

      expect(source.sourceKind).toBe("document");
      expect(windows).toHaveLength(1);
      expect(snapshot.sources).toHaveLength(1);
      expect(snapshot.sourceWindows).toHaveLength(1);
      expect(snapshot.sourceWindows[0]?.normalizedText).toContain("project-001");
    } finally {
      await database.close();
    }
  });

  it("preserves deterministic dedupe and supersession semantics on the database path", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new ModelMemoryCanonicalRepository(database.sql);
      const store = new DatabaseMemoryObjectStore(repository);

      const source = await repository.persistSource({
        id: "e4d5cd36-8af8-5d0e-a3ff-284a26df9b4d",
        sourceKind: "ordinary_turn",
        sourceFingerprint: "turn-source-001",
        sessionId: "session-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      await repository.persistSourceWindows([
        {
          id: "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a8",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "turn one",
          normalizedFingerprint: "turn-window-001",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "cc4ebaf4-1ba0-560a-a0c8-d2b6aa6d1e17",
          sourceId: source.id,
          windowIndex: 1,
          normalizedText: "turn two",
          normalizedFingerprint: "turn-window-002",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
        {
          id: "75663d32-6052-5a98-b8f0-347c6e94f851",
          sourceId: source.id,
          windowIndex: 2,
          normalizedText: "turn three",
          normalizedFingerprint: "turn-window-003",
          tokenEstimate: 2,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
      ]);

      const first = await store.writeCapturedObject(
        capturedFact("region-001", "1cb0de5a-b7b5-5d74-a5a1-eaf0cb4f64a8"),
      );
      const duplicate = await store.writeCapturedObject(
        capturedFact("region-001", "cc4ebaf4-1ba0-560a-a0c8-d2b6aa6d1e17"),
      );
      const correction = await store.writeCapturedObject(
        capturedFact("region-002", "75663d32-6052-5a98-b8f0-347c6e94f851"),
      );
      const snapshot = await store.snapshot();

      expect(first.decision).toBe("write");
      expect(duplicate.decision).toBe("dedupe");
      expect(correction.decision).toBe("supersede");
      expect(snapshot.memoryObjects).toHaveLength(2);
      expect(snapshot.writeEvents).toHaveLength(3);
      expect(snapshot.supersessionLinks).toHaveLength(1);
      expect(snapshot.memoryObjects[0]?.supersededAt).toBeInstanceOf(Date);
    } finally {
      await database.close();
    }
  });
});
