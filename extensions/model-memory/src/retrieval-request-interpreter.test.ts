import { describe, expect, it } from "vitest";
import { interpretRetrievalRequest } from "./retrieval-request-interpreter.ts";

describe("retrieval request interpreter", () => {
  it("records a structural retrieval request without fixed-memory routing", async () => {
    const result = await interpretRetrievalRequest({
      envelope: {
        queryText: "What is the deployment region for project-001?",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        maxResults: 3,
      },
      modelId: "retrieval-model-001",
      interpreter: {
        async interpret() {
          return {
            action: "retrieve",
            request: {
              goal: "find current project facts",
              canonicalClasses: ["project"],
              kinds: ["fact"],
              scopeConstraints: { projectId: "project-001" },
              subjectHints: ["deployment region"],
              contentHints: ["region"],
              desiredResultCount: 2,
              requestConfidence: "strong",
            },
          };
        },
      },
    });

    expect(result.action).toBe("retrieve");
    if (result.action === "retrieve") {
      expect(result.request.canonicalClasses).toEqual(["project"]);
      expect(result.request.kinds).toEqual(["fact"]);
      expect(result.request.desiredResultCount).toBe(2);
    }
  });
});
