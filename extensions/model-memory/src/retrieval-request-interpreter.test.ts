import { describe, expect, it } from "vitest";
import {
  buildRetrievalRequestPrompt,
  harmonizeInterpretedRetrievalRequest,
  interpretRetrievalRequest,
} from "./retrieval-request-interpreter.ts";

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
      expect(result.request.desiredResultCount).toBe(3);
    }
  });

  it("builds a prompt that explicitly asks for JSON output", () => {
    const prompt = buildRetrievalRequestPrompt(
      {
        queryText: "How do I run live tests in OpenClaw?",
        requestPurpose: "operator_help",
      },
      "openrouter/openai/gpt-5.4-nano",
    );

    expect(prompt.systemPrompt.toLowerCase()).toContain("json");
    expect(prompt.systemPrompt).toContain('"action":"retrieve"');
    expect(prompt.systemPrompt).toContain("Do not return fields like intent");
    expect(prompt.systemPrompt).toContain("Use skip only when the query clearly cannot benefit");
    expect(prompt.systemPrompt).toContain("prefer retrieve");
    expect(prompt.systemPrompt).toContain("keep canonicalClasses empty");
    expect(prompt.systemPrompt).toContain(
      "Do not shrink desiredResultCount below the provided maxResults",
    );
  });

  it("widens broad queries back to the deterministic baseline surface", () => {
    const harmonized = harmonizeInterpretedRetrievalRequest({
      envelope: {
        queryText: "What should I read before planning or roadmap work?",
        requestPurpose: "workflow_guidance",
        maxResults: 5,
      },
      request: {
        goal: "Identify recommended reading before roadmap work.",
        canonicalClasses: ["reference", "project"],
        kinds: ["reference", "procedure", "rule"],
        scopeConstraints: {},
        subjectHints: ["planning", "roadmap", "strategy"],
        contentHints: ["reading list", "frameworks", "guides"],
        desiredResultCount: 1,
        requestConfidence: "medium",
      },
    });

    expect(harmonized.request.canonicalClasses).toEqual([]);
    expect(harmonized.request.kinds).toBeUndefined();
    expect(harmonized.request.desiredResultCount).toBe(5);
    expect(harmonized.request.subjectHints).toEqual(["read", "planning", "roadmap", "work"]);
    expect(harmonized.request.contentHints).toEqual(["read", "planning", "roadmap", "work"]);
    expect(harmonized.rationale).toContain("broad_query_cleared_canonical_classes");
    expect(harmonized.rationale).toContain("raised_desired_result_count_to_envelope_max");
  });

  it("uses broad type recall for live context injection while preserving structural project scope", () => {
    const harmonized = harmonizeInterpretedRetrievalRequest({
      envelope: {
        queryText:
          "Find validation marker PHASE2-RUNTIME-SEARCH for model-owned retrieval final inclusion.",
        requestPurpose: "live_context_injection",
        scope: {
          projectId: "model-memory",
          memoryTraceId: "memory_trace_turn_001",
          sessionKey: "agent:main:main",
        },
        maxResults: 8,
      },
      request: {
        goal: "Find a preference marker.",
        canonicalClasses: ["user"],
        kinds: ["preference"],
        scopeConstraints: {
          projectId: "model-memory",
          memoryTraceId: "memory_trace_turn_001",
        },
        subjectHints: ["validation marker PHASE2-RUNTIME-SEARCH"],
        contentHints: ["model-owned retrieval final inclusion"],
        desiredResultCount: 1,
        requestConfidence: "strong",
      },
    });

    expect(harmonized.request.canonicalClasses).toEqual([]);
    expect(harmonized.request.kinds).toBeUndefined();
    expect(harmonized.request.scopeConstraints).toEqual({ projectId: "model-memory" });
    expect(harmonized.request.subjectHints).toEqual(
      expect.arrayContaining(["validation", "marker", "phase2", "runtime", "search"]),
    );
    expect(harmonized.rationale).toContain("broad_query_cleared_canonical_classes");
    expect(harmonized.rationale).toContain("broad_query_cleared_kinds");
  });
});
