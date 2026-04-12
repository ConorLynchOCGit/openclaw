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
    expect(decision.sourceResolution).toMatchObject({
      questionKind: "continuity",
      authoritativeSource: "workspace_continuity",
    });
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
    expect(decision.sourceResolution).toMatchObject({
      questionKind: "unclassified",
      authoritativeSource: "workspace_project",
    });
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
    expect(decision.sourceResolution).toMatchObject({
      questionKind: "unclassified",
      authoritativeSource: "workspace_project",
    });
    expect(decision.canonicalPlan).toEqual({
      requestedKinds: [],
      derivedViews: [],
      facetFilters: [],
      matchedSignals: [],
    });
    expect(decision.selectedTarget).toBe("none");
  });

  it("classifies mounted canonical-doc questions as source-truth lookups without pinning memory tools", () => {
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
                text: "If you look at the mounted memory project files, you will see there is a different set of 4 canonical memory classes. Search for that and confirm.",
              },
            ],
          },
        ],
        tools: [{ name: "memory_object_search_hybrid" }, { name: "memory_search" }],
      },
    });

    expect(decision.promptClass).toBe("source_truth_lookup");
    expect(decision.sourceResolution).toMatchObject({
      questionKind: "implementation",
      domain: "memory_system",
      authoritativeSource: "repo_canonical_doc",
      coverageRequirement: "verify_before_exact_answer",
      coverageState: "unread",
    });
    expect(decision.canonicalPlan).toMatchObject({
      requestedKinds: expect.arrayContaining(["reference", "project"]),
      derivedViews: expect.arrayContaining(["reference_lookup", "project_rule"]),
      matchedSignals: ["source_truth_lookup"],
    });
    expect(decision.selectedTarget).toBe("none");
    expect(decision.reasonCode).toBe("source_truth_lookup_no_memory_pin");
    expect(decision.skillSuppressionRequested).toBe(false);
  });

  it("treats mixed mounted-plus-continuity prompts as canonical authority with workspace support", () => {
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
                text: "Read the mounted memory-system roadmap, then relate it to what we were doing yesterday.",
              },
            ],
          },
        ],
        tools: [{ name: "memory_object_search_hybrid" }, { name: "memory_search" }],
      },
      sourceContext: {
        bootstrapTruncated: true,
        workspaceContextMissing: true,
      },
    });

    expect(decision.promptClass).toBe("source_truth_lookup");
    expect(decision.sourceResolution).toMatchObject({
      questionKind: "mixed",
      domain: "memory_system",
      authoritativeSource: "repo_canonical_doc",
      supportingSources: expect.arrayContaining([
        "workspace_continuity",
        "workspace_project",
        "mounted_curated_import",
      ]),
      escalationReasons: expect.arrayContaining([
        "bootstrap_truncated",
        "workspace_context_missing",
      ]),
    });
    expect(decision.selectedTarget).toBe("none");
  });
});
