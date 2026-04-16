import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { captureOrdinaryTurnLive } from "./live-ordinary-turn-capture-service.ts";
import { ExecutorBackedSemanticInterpreter } from "./real-semantic-interpreter.ts";

describe("live-ordinary-turn-capture-service", () => {
  it("persists ordinary-turn captures and rebuilds derived runtime state", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new ModelMemoryCanonicalRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const interpreter = new ExecutorBackedSemanticInterpreter({
        async execute(request) {
          const prompt = JSON.parse(request.userPrompt) as {
            sourceWindow: { id: string; headingPath: string[] };
            candidates?: unknown[];
          };
          if (request.contract.contractVersion === "v2-candidate") {
            return {
              outputText: JSON.stringify({
                action: "capture",
                objects: [
                  {
                    candidateType: "preference",
                    claim: "Please keep explanations high level by default.",
                    supportingSpans: [
                      {
                        lineStart: 1,
                        lineEnd: 1,
                        headingPath: prompt.sourceWindow.headingPath,
                      },
                    ],
                    confidence: "strong",
                    shouldStore: true,
                  },
                ],
              }),
            };
          }
          return {
            outputText: JSON.stringify({
              action: "capture",
              objects: [
                {
                  canonicalClass: "user",
                  kind: "preference",
                  payload: {
                    subject: "response detail",
                    instruction: "keep answers high level",
                    operation: "prefer",
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

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText: "Please keep explanations high level by default.",
            sessionId: "session-001",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter,
        },
      });

      expect(result.writeResults).toHaveLength(1);
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
      expect(result.rebuild?.contextArtifacts[0]?.artifactType).toBe("user_memory_pack");
      expect(result.rebuild?.projectionOutputs["user-md"]).toContain("response detail");
    } finally {
      await database.close();
    }
  });
});
