import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { ModelMemoryOperatorInspection } from "./operator-inspection.ts";
import { buildContextArtifact } from "./runtime/context-artifacts.ts";

describe("operator-inspection", () => {
  it("exposes recent captures, write decisions, projections, retrievals, and usage observations", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonical = new ModelMemoryCanonicalRepository(database.sql);
      const runtime = new RuntimeContextRepository(database.sql);
      const inspection = new ModelMemoryOperatorInspection(canonical, runtime);

      const source = await canonical.persistSource({
        id: "bf001f68-4a12-5a18-a62f-c891d76ca056",
        sourceKind: "document",
        sourceFingerprint: "source-001",
        sourceMetadata: {},
        createdAt: new Date(0),
      });
      const [window] = await canonical.persistSourceWindows([
        {
          id: "11cb0fe3-89ad-5bde-9721-66dab9ca2c64",
          sourceId: source.id,
          windowIndex: 0,
          normalizedText: "window",
          normalizedFingerprint: "window-001",
          tokenEstimate: 1,
          headingPath: [],
          blockDescriptors: [],
          createdAt: new Date(0),
        },
      ]);
      await canonical.insertMemoryObject({
        id: "83f9606d-f16b-58d6-9d2d-5f05cf079c6c",
        sourceWindowId: window.id,
        canonicalClass: "user",
        kind: "preference",
        payload: { subject: "response detail", instruction: "high level", operation: "prefer" },
        normalizedSubject: "response detail",
        normalizedTitle: undefined,
        normalizedSearchText: "response detail high level",
        scope: {},
        scopeKey: undefined,
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "user-pref-001",
        slotKey: "user:response-detail",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(1000),
      });
      await canonical.insertWriteEvent({
        id: "41cf719a-57d6-5f85-8b32-79082b6cc5a6",
        sourceWindowId: window.id,
        candidateIdentityKey: "user-pref-001",
        decision: "write",
        memoryObjectId: "83f9606d-f16b-58d6-9d2d-5f05cf079c6c",
        decisionCodes: ["write_structural_accept"],
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(1000),
      });
      await runtime.persistContextArtifact(
        buildContextArtifact({
          artifactType: "user_memory_pack",
          renderedText: "User pack body",
          buildPolicyVersion: "v1",
        }),
      );

      const recentCaptures = await inspection.listRecentCaptures();
      const writeDecisions = await inspection.listWriteDecisions();
      const projections = await inspection.listProjectionVersions();
      const usage = await inspection.listUsageObservations();

      expect(recentCaptures).toHaveLength(1);
      expect(writeDecisions).toHaveLength(1);
      expect(projections).toHaveLength(0);
      expect(usage.runs).toHaveLength(0);
    } finally {
      await database.close();
    }
  });
});
