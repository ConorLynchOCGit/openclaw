import { describe, expect, it } from "vitest";
import {
  REQUIRED_ROUTING_EVAL_CATEGORIES,
  ROUTING_EVAL_CORPUS,
  summarizeRoutingEvalCorpus,
  validateRoutingEvalCase,
  validateRoutingEvalCorpus,
} from "./routing-eval-corpus.ts";

describe("Routing eval corpus", () => {
  it("validates every corpus case and required categories", () => {
    const validation = validateRoutingEvalCorpus();
    expect(validation).toEqual({ valid: true, reasonCodes: [] });
    for (const evalCase of ROUTING_EVAL_CORPUS) {
      expect(validateRoutingEvalCase(evalCase)).toEqual({ valid: true, reasonCodes: [] });
      expect(evalCase.promptHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(evalCase.rawPromptStored).toBe(false);
      expect(evalCase.rawResponseStored).toBe(false);
      expect(evalCase.expected.workQueueLifecycleMutated).toBe(false);
    }
    const categories = new Set(ROUTING_EVAL_CORPUS.map((evalCase) => evalCase.category));
    for (const category of REQUIRED_ROUTING_EVAL_CATEGORIES) {
      expect(categories.has(category)).toBe(true);
    }
  });

  it("covers positive, negative, ambiguous, authority, blocked, outage, and injection cases", () => {
    for (const tag of [
      "positive_execution",
      "negative_no_execution",
      "ambiguous_clarification",
      "authority_case",
      "blocked_safety",
      "provider_outage",
      "malicious_injection",
    ] as const) {
      expect(ROUTING_EVAL_CORPUS.some((evalCase) => evalCase.evalTags.includes(tag))).toBe(true);
    }
  });

  it("distinguishes mentioned, requested, negated, and conditional actions", () => {
    const doNotSend = ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "do_not_send");
    expect(doNotSend?.expected.actions.negated).toContain("outbound_send");
    expect(doNotSend?.expected.actions.requested).not.toContain("outbound_send");
    expect(doNotSend?.expected.actions.mentioned).toContain("outbound_send");

    const deployIfPolicy = ROUTING_EVAL_CORPUS.find(
      (evalCase) => evalCase.category === "deploy_if_policy_permits",
    );
    expect(deployIfPolicy?.expected.actions.conditional).toContain("deploy");
    expect(deployIfPolicy?.expected.actions.requested).not.toContain("deploy");
  });

  it("expects malicious injection and stale authority to block before compile", () => {
    const malicious = ROUTING_EVAL_CORPUS.filter((evalCase) =>
      evalCase.evalTags.includes("malicious_injection"),
    );
    expect(malicious.length).toBeGreaterThan(5);
    expect(malicious.every((evalCase) => !evalCase.expected.runtimeJobCreated)).toBe(true);
    expect(
      malicious.every((evalCase) =>
        ["blocked", "clarification_required", "needs_review"].includes(
          evalCase.expected.validatorOutcome,
        ),
      ),
    ).toBe(true);

    const staleAuthority = ROUTING_EVAL_CORPUS.find(
      (evalCase) => evalCase.category === "stale_authority",
    );
    expect(staleAuthority?.authoritySnapshotFresh).toBe(false);
    expect(staleAuthority?.expected.validatorOutcome).toBe("blocked");
  });

  it("summarizes corpus without raw prompt or response storage", () => {
    const summary = summarizeRoutingEvalCorpus();
    expect(summary.totalCases).toBe(ROUTING_EVAL_CORPUS.length);
    expect(summary.rawPromptStored).toBe(false);
    expect(summary.rawResponseStored).toBe(false);
    expect(JSON.stringify(summary)).not.toContain("raw prompt");
  });
});
