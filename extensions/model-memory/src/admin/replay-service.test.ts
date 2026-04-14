import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "../db/migrations.ts";
import { createPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import { ExecutorBackedSemanticInterpreter } from "../real-semantic-interpreter.ts";
import { ModelMemoryReplayService } from "./replay-service.ts";

describe("replay-service", () => {
  it("replays controlled captures through the database-backed service path", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const replay = new ModelMemoryReplayService({
        canonicalRepository: new ModelMemoryCanonicalRepository(database.sql),
        runtimeRepository: new RuntimeContextRepository(database.sql),
      });
      const interpreter = new ExecutorBackedSemanticInterpreter({
        async execute(request) {
          const prompt = JSON.parse(request.userPrompt) as {
            sourceWindow: { id: string; headingPath: string[] };
          };
          return {
            outputText: JSON.stringify({
              action: "capture",
              objects: [
                {
                  canonicalClass: "feedback",
                  kind: "procedure",
                  payload: {
                    title: "procedure-001",
                    steps: ["step-001", "step-002"],
                  },
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
      });

      const result = await replay.replayDocument({
        document: {
          externalSourceId: "doc-001",
          text: "Procedure-001: step-001, then step-002.",
        },
        modelId: "model-doc-001",
        interpreter,
      });

      expect(result.writeResults[0]?.decision).toBe("write");
      const rebuild = await replay.rebuildDerivedRuntime();
      expect(
        rebuild.contextArtifacts.some(
          (artifact) => artifact.artifactType === "procedure_memory_pack",
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });
});
