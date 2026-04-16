import { describe, expect, it } from "vitest";
import { JsonModelOutputError } from "./model-execution.ts";
import { ExecutorBackedRetrievalRequestInterpreter } from "./real-retrieval-request-interpreter.ts";
import { buildRetrievalRequestPrompt } from "./retrieval-request-interpreter.ts";

describe("real-retrieval-request-interpreter", () => {
  it("executes structural retrieval interpretation through the model boundary", async () => {
    const requests: Array<{ contractVersion: string; userPrompt: string }> = [];
    const interpreter = new ExecutorBackedRetrievalRequestInterpreter({
      async execute(request) {
        requests.push({
          contractVersion: request.contract.contractVersion,
          userPrompt: request.userPrompt,
        });
        return {
          outputText: JSON.stringify({
            action: "retrieve",
            request: {
              goal: "find current project facts",
              canonicalClasses: ["project"],
              kinds: ["fact"],
              scopeConstraints: { projectId: "project-001" },
              subjectHints: ["deployment region"],
              contentHints: ["region-001"],
              desiredResultCount: 2,
              requestConfidence: "strong",
            },
          }),
        };
      },
    });

    const prompt = buildRetrievalRequestPrompt(
      {
        queryText: "What is the deployment region for project-001?",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        maxResults: 2,
      },
      "retrieval-model-001",
      "v2",
    );
    const result = await interpreter.interpret({
      envelope: {
        queryText: "What is the deployment region for project-001?",
        requestPurpose: "context_injection",
        scope: { projectId: "project-001" },
        maxResults: 2,
      },
      prompt,
    });

    expect(result.action).toBe("retrieve");
    expect(requests[0]?.contractVersion).toBe("v2");
    expect(requests[0]?.userPrompt).not.toContain("atlas forge");
  });

  it("rejects malformed retrieval output instead of backfilling intent", async () => {
    const interpreter = new ExecutorBackedRetrievalRequestInterpreter({
      async execute() {
        return {
          outputText: '{"action":"retrieve","request":{"goal":"x"}}',
        };
      },
    });

    await expect(
      interpreter.interpret({
        envelope: {
          queryText: "Find project facts",
          requestPurpose: "context_injection",
        },
        prompt: buildRetrievalRequestPrompt(
          {
            queryText: "Find project facts",
            requestPurpose: "context_injection",
          },
          "retrieval-model-001",
        ),
      }),
    ).rejects.toBeInstanceOf(JsonModelOutputError);
  });
});
