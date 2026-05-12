import { describe, expect, it } from "vitest";
import { decidePromptRouterMemoryPolicy } from "./prompt-router-memory-policy.ts";

const base = {
  promptHash: "sha256:test",
  boundedPromptSummary: "bounded summary",
  contextBudgetRemainingTokens: 10_000,
};

describe("prompt router memory policy", () => {
  it("keeps protocol and triage away from retrieval packs", () => {
    expect(decidePromptRouterMemoryPolicy({ ...base, routeKind: "protocol" })).toMatchObject({
      decision: "no_memory",
      maxRetrievalPackTokens: 0,
    });
    expect(decidePromptRouterMemoryPolicy({ ...base, routeKind: "triage" })).toMatchObject({
      decision: "triage_state_facts_only",
      maxRetrievalPackTokens: 0,
    });
  });

  it("allows bounded chat and advanced retrieval refs without authority trust", () => {
    const chat = decidePromptRouterMemoryPolicy({ ...base, routeKind: "chat_send" });
    const advanced = decidePromptRouterMemoryPolicy({
      ...base,
      routeKind: "advanced_intent_front_door",
    });

    expect(chat.decision).toBe("bounded_chat_retrieval");
    expect(chat.maxRetrievalPackTokens).toBeLessThanOrEqual(2_000);
    expect(advanced.decision).toBe("bounded_advanced_retrieval");
    expect(advanced.maxRetrievalPackTokens).toBeGreaterThan(chat.maxRetrievalPackTokens);
    expect(advanced.retrievedMemoryTrustedForAuthority).toBe(false);
  });

  it("passes workflow memory as refs only", () => {
    const decision = decidePromptRouterMemoryPolicy({
      ...base,
      routeKind: "workflow_execution",
      activeWorkflowRuntimeJobId: "job-1",
    });

    expect(decision.decision).toBe("runtime_context_refs_only");
    expect(decision.memoryContextRefs[0]?.ref).toBe("runtime-job://job-1/memory-context");
  });

  it("skips untrusted or stale memory context", () => {
    const decision = decidePromptRouterMemoryPolicy({
      ...base,
      routeKind: "chat_send",
      untrustedExternalContentPresent: true,
    });

    expect(decision.decision).toBe("skip_untrusted_or_stale");
    expect(decision.reasonCodes).toContain("memory_cannot_grant_authority");
  });
});
