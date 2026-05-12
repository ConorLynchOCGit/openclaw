import { describe, expect, it } from "vitest";
import {
  completeMemoryMiddlewareEvidence,
  evaluateContextBudget,
  evaluateModelMemoryMiddlewareAdoption,
} from "./middleware-adoption.ts";

describe("model-memory middleware adoption", () => {
  it("passes memory capture when model-task and DB middleware evidence are present", () => {
    const result = evaluateModelMemoryMiddlewareAdoption(
      completeMemoryMiddlewareEvidence("capture"),
    );

    expect(result).toMatchObject({
      accepted: true,
      status: "passed",
      requiredMiddlewareKinds: ["model_task", "db_operation"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    });
  });

  it("marks retrieval/context needs_review when DB middleware is missing", () => {
    const evidence = completeMemoryMiddlewareEvidence("retrieval_context");
    evidence.dbOperationRefs = [];

    const result = evaluateModelMemoryMiddlewareAdoption(evidence);

    expect(result).toMatchObject({
      accepted: false,
      status: "needs_review",
    });
    expect(result.reasonCodes).toContain("required_middleware_missing:db_operation");
  });

  it("blocks unapproved direct model, DB, or script bypasses", () => {
    const evidence = completeMemoryMiddlewareEvidence("skillifier");
    evidence.unapprovedDirectModelRefs = ["repo://legacy-skillifier-model-call"];

    const result = evaluateModelMemoryMiddlewareAdoption(evidence);

    expect(result).toMatchObject({
      accepted: false,
      status: "blocked",
    });
    expect(result.reasonCodes).toContain("unapproved_direct_model_path_detected");
  });

  it("keeps context budget bounded and catches compaction failure", () => {
    expect(
      evaluateContextBudget({
        sessionId: "agent:main:main",
        agentId: "main",
        maxTokens: 200_000,
        estimatedTokens: 120_000,
        retrievalPackTokens: 5_000,
        stableMemoryTokens: 20_000,
        volatileTurnTokens: 10_000,
        toolResultTokens: 2_000,
        automaticTrimOrCompactionApplied: false,
        compactCommandBlockedByOverLimit: false,
        rawTranscriptStored: false,
      }),
    ).toMatchObject({ accepted: true, status: "passed" });

    const failed = evaluateContextBudget({
      sessionId: "agent:main:main",
      agentId: "main",
      maxTokens: 200_000,
      estimatedTokens: 229_300,
      retrievalPackTokens: 60_000,
      stableMemoryTokens: 80_000,
      volatileTurnTokens: 70_000,
      toolResultTokens: 10_000,
      automaticTrimOrCompactionApplied: false,
      compactCommandBlockedByOverLimit: true,
      rawTranscriptStored: false,
    });

    expect(failed).toMatchObject({ accepted: false, status: "needs_review" });
    expect(failed.reasonCodes).toEqual(
      expect.arrayContaining([
        "context_budget_exceeded",
        "automatic_trim_or_compaction_missing",
        "compact_command_blocked_by_over_limit",
      ]),
    );
  });

  it("passes skillifier, proactivity, and opportunity seed middleware evidence", () => {
    for (const feature of ["skillifier", "proactivity", "opportunity_seed_consumption"] as const) {
      expect(
        evaluateModelMemoryMiddlewareAdoption(completeMemoryMiddlewareEvidence(feature)),
      ).toMatchObject({
        accepted: true,
        status: "passed",
      });
    }
  });
});
