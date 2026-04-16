import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "./db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { ingestDocumentLive } from "./live-document-ingestion-service.ts";
import { ExecutorBackedSemanticInterpreter } from "./real-semantic-interpreter.ts";

describe("live-document-ingestion-service", () => {
  it("persists document captures and rebuilds derived runtime state", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new ModelMemoryCanonicalRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const interpreter = new ExecutorBackedSemanticInterpreter({
        async execute(request) {
          const prompt = JSON.parse(request.userPrompt) as {
            sourceWindow: { id: string; headingPath: string[] };
          };
          if (request.contract.contractVersion === "v2-candidate") {
            return {
              outputText: JSON.stringify({
                action: "capture",
                objects: [
                  {
                    candidateType: "fact",
                    claim: "deployment region: region-001",
                    supportingSpans: [
                      {
                        lineStart: 1,
                        lineEnd: 2,
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
                  canonicalClass: "project",
                  kind: "fact",
                  payload: {
                    subject: "deployment region",
                    value: "region-001",
                  },
                  scope: {
                    projectId: "project-001",
                    projectScope: "project-001",
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

      const result = await ingestDocumentLive({
        canonicalRepository,
        runtimeRepository,
        ingestion: {
          document: {
            externalSourceId: "doc-001",
            text: "# Project\nDeployment region is region-001.",
            projectId: "project-001",
          },
          modelId: "model-doc-001",
          interpreter,
        },
      });

      expect(result.writeResults).toHaveLength(1);
      expect(result.writeResults[0]?.decision).toBe("write");
      expect(result.rebuild?.activeMemorySlots).toHaveLength(1);
      expect(result.rebuild?.contextArtifacts.length).toBeGreaterThan(0);
      expect(result.rebuild?.projectionVersions.length).toBe(3);
      expect(result.rebuild?.projectionOutputs["memory-md"]).toContain("deployment region");
    } finally {
      await database.close();
    }
  });
});
