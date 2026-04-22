import { describe, expect, it } from "vitest";
import { applyModelMemoryMigrations } from "./migrations.ts";
import { MmV2DatabaseMemoryObjectStore } from "./mmv2-memory-object-store.ts";
import { MmV2NativeRepository } from "./mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";

describe("MmV2DatabaseMemoryObjectStore", () => {
  it("adapts legacy captured objects into MMV2 durable truth and records supersession edges", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);
      const store = new MmV2DatabaseMemoryObjectStore(repository);

      const seedResults = await store.writeCapturedObjects([
        {
          sourceWindowId: "source-window-001",
          sourceKind: "ordinary_turn",
          contractName: "semantic_extraction",
          contractVersion: "legacy-test",
          modelId: "model-001",
          object: {
            canonicalClass: "project",
            kind: "fact",
            payload: {
              subject: "deployment region",
              value: "us-east-1",
            },
            scope: {
              projectId: "project-001",
              projectScope: "project-001",
            },
            provenance: [
              {
                sourceId: "turn-001",
                segmentIndex: 0,
                headingPath: [],
              },
            ],
            confidence: "strong",
            durability: "durable",
            reviewMode: "auto_accept",
          },
        },
      ]);

      const supersedeResults = await store.writeCapturedObjects([
        {
          sourceWindowId: "source-window-002",
          sourceKind: "ordinary_turn",
          contractName: "semantic_extraction",
          contractVersion: "legacy-test",
          modelId: "model-001",
          object: {
            canonicalClass: "project",
            kind: "fact",
            payload: {
              subject: "deployment region",
              value: "us-west-2",
            },
            scope: {
              projectId: "project-001",
              projectScope: "project-001",
            },
            provenance: [
              {
                sourceId: "turn-002",
                segmentIndex: 0,
                headingPath: [],
              },
            ],
            confidence: "strong",
            durability: "durable",
            reviewMode: "auto_accept",
          },
        },
      ]);

      const durable = await repository.listDurableMemories();
      const edges = await repository.listMemoryEdges();

      expect(seedResults[0]?.decision).toBe("write");
      expect(supersedeResults[0]?.decision).toBe("supersede");
      expect(durable.filter((entry) => entry.status === "active")).toHaveLength(1);
      expect(durable.filter((entry) => entry.status === "superseded")).toHaveLength(1);
      expect(edges.some((edge) => edge.edge_type === "supersedes")).toBe(true);
    } finally {
      await database.close();
    }
  });
});
