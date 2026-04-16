import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { rebuildDerivedRuntimeState } from "./runtime-rebuild-orchestrator.ts";

describe("runtime-rebuild-orchestrator", () => {
  it("rebuilds deterministically and only creates new projection versions when canonical content changes", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new ModelMemoryCanonicalRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);

      const source = await canonicalRepository.persistSource({
        id: "c391bc10-6f30-57ee-b269-eb3bf671b1f1",
        sourceKind: "document",
        sourceFingerprint: "source-fingerprint-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      const [window] = await canonicalRepository.persistSourceWindows([
        {
          id: "3dc6a6d7-d0d5-5fb9-95f5-4704b9bdcf33",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "window-001",
          normalizedFingerprint: "window-fingerprint-001",
          tokenEstimate: 1,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
      ]);
      await canonicalRepository.insertMemoryObject({
        id: "6b02d2df-6fa2-50b0-b8ee-b9c2dc52230a",
        sourceWindowId: window!.id,
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        normalizedSubject: "deployment region",
        normalizedTitle: undefined,
        normalizedSearchText: "deployment region region-001",
        scope: { projectId: "project-001", projectScope: "project-001" },
        scopeKey: "project:project-001",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "project-fact-region-001",
        slotKey: "project:project-001:deployment-region",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(1000),
      });

      const first = await rebuildDerivedRuntimeState({
        canonicalRepository,
        runtimeRepository,
      });
      const second = await rebuildDerivedRuntimeState({
        canonicalRepository,
        runtimeRepository,
      });

      expect(first.projectionVersions).toHaveLength(3);
      expect(second.projectionVersions).toHaveLength(3);

      await canonicalRepository.insertMemoryObject({
        id: "6834cc71-3f62-5755-80bb-c23f09175c67",
        sourceWindowId: window!.id,
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-002" },
        normalizedSubject: "deployment region",
        normalizedTitle: undefined,
        normalizedSearchText: "deployment region region-002",
        scope: { projectId: "project-001", projectScope: "project-001" },
        scopeKey: "project:project-001",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "project-fact-region-002",
        slotKey: "project:project-001:deployment-region",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(2000),
      });
      await canonicalRepository.markMemoryObjectSuperseded(
        "6b02d2df-6fa2-50b0-b8ee-b9c2dc52230a",
        new Date(2000),
      );

      const third = await rebuildDerivedRuntimeState({
        canonicalRepository,
        runtimeRepository,
      });

      expect(third.activeMemorySlots[0]?.currentIdentityKey).toBe("project-fact-region-002");
      expect(third.projectionVersions.length).toBeGreaterThan(second.projectionVersions.length);
    } finally {
      await database.close();
    }
  });
});
