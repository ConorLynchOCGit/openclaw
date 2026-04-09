import { describe, expect, it } from "vitest";
import { resolveMainMemoryRoutingDecision } from "./main-memory-routing.js";

describe("resolveMainMemoryRoutingDecision", () => {
  it("builds a canonical workflow-preflight plan before selecting learned guidance", () => {
    const decision = resolveMainMemoryRoutingDecision({
      agentId: "main",
      provider: "openai-codex",
      model: { api: "openai-codex-responses" },
      context: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "I changed a generated config-help surface. Before I wrap up, what repo-specific follow-through should I not forget?",
              },
            ],
          },
        ],
        tools: [{ name: "memory_learned_guidance_plan" }, { name: "memory_object_search_hybrid" }],
      },
    });

    expect(decision.promptClass).toBe("workflow_preflight");
    expect(decision.canonicalPlan).toMatchObject({
      requestedKinds: expect.arrayContaining(["feedback", "project", "reference"]),
      derivedViews: expect.arrayContaining(["workflow_guidance", "project_rule", "project_fact"]),
      matchedSignals: expect.arrayContaining(["before_action", "repo_follow_through"]),
    });
    expect(decision.selectedTarget).toBe("memory_learned_guidance_plan");
  });

  it("builds a canonical direct-lookup plan for repo-structure questions", () => {
    const decision = resolveMainMemoryRoutingDecision({
      agentId: "main",
      provider: "openai-codex",
      model: { api: "openai-codex-responses" },
      context: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Where should plugin-only runtime dependencies live here?",
              },
            ],
          },
        ],
        tools: [{ name: "memory_object_search_hybrid" }],
      },
    });

    expect(decision.promptClass).toBe("direct_lookup");
    expect(decision.canonicalPlan).toMatchObject({
      requestedKinds: expect.arrayContaining(["project", "reference", "feedback"]),
      derivedViews: expect.arrayContaining(["project_fact", "project_rule", "reference_lookup"]),
      matchedSignals: ["artifact_lookup"],
    });
    expect(decision.selectedTarget).toBe("memory_object_search_hybrid");
  });

  it("keeps the canonical plan empty when no Main routing signal matches", () => {
    const decision = resolveMainMemoryRoutingDecision({
      agentId: "main",
      provider: "openai-codex",
      model: { api: "openai-codex-responses" },
      context: {
        messages: [{ role: "user", content: [{ type: "text", text: "hello there" }] }],
        tools: [{ name: "memory_object_search_hybrid" }],
      },
    });

    expect(decision.promptClass).toBe("none");
    expect(decision.canonicalPlan).toEqual({
      requestedKinds: [],
      derivedViews: [],
      facetFilters: [],
      matchedSignals: [],
    });
    expect(decision.selectedTarget).toBe("none");
  });
});
