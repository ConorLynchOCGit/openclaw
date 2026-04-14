import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { runLiveDocumentShadow, runLiveOrdinaryTurnShadow } from "./live-shadow-adapters.ts";
import { ExecutorBackedSemanticInterpreter } from "./real-semantic-interpreter.ts";

describe("live-shadow-adapters", () => {
  it("runs observational document shadow capture without legacy backfill", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const result = await runLiveDocumentShadow({
        enabled: true,
        document: {
          externalSourceId: "doc-001",
          text: "Deployment region is region-001.",
          projectId: "project-001",
        },
        modelId: "model-doc-001",
        interpreter: new ExecutorBackedSemanticInterpreter({
          async execute(request) {
            const prompt = JSON.parse(request.userPrompt) as {
              sourceWindow: { id: string; headingPath: string[] };
            };
            return {
              outputText: JSON.stringify({
                action: "capture",
                objects: [
                  {
                    canonicalClass: "project",
                    kind: "fact",
                    payload: { subject: "deployment region", value: "region-001" },
                    scope: { projectId: "project-001", projectScope: "project-001" },
                    provenance: [
                      {
                        sourceId: prompt.sourceWindow.id,
                        segmentIndex: 0,
                        headingPath: prompt.sourceWindow.headingPath,
                      },
                    ],
                    confidence: "strong",
                    durability: "durable",
                    reviewMode: "auto_accept",
                  },
                ],
              }),
            };
          },
        }),
        canonicalRepository: new ModelMemoryCanonicalRepository(database.sql),
        runtimeRepository: new RuntimeContextRepository(database.sql),
        legacy: {
          async observe() {
            return {
              capturedObjects: [],
            };
          },
        },
      });

      expect(result.skipped).toBe(false);
      if (!result.skipped) {
        expect(result.comparison.modelOnlyIdentityKeys.length).toBe(1);
        expect(result.comparison.omissionDivergence).toBe(true);
      }
    } finally {
      await database.close();
    }
  });

  it("respects the feature flag on ordinary-turn shadow execution", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const result = await runLiveOrdinaryTurnShadow({
        enabled: false,
        turn: {
          currentTurnText: "Keep answers short.",
        },
        modelId: "model-turn-001",
        interpreter: new ExecutorBackedSemanticInterpreter({
          async execute() {
            return { outputText: '{"action":"ignore"}' };
          },
        }),
        canonicalRepository: new ModelMemoryCanonicalRepository(database.sql),
        runtimeRepository: new RuntimeContextRepository(database.sql),
        legacy: {
          async observe() {
            return { capturedObjects: [] };
          },
        },
      });

      expect(result).toEqual({
        skipped: true,
        reason: "feature_flag_disabled",
      });
    } finally {
      await database.close();
    }
  });
});
