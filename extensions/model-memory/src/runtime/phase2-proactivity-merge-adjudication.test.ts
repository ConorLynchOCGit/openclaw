import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import {
  adjudicateNewProactivityOpportunityMerge,
  adjudicateProactivityOpportunityMerges,
  buildProactivityMergePromptPacket,
  buildProactivityMergeRecallRows,
} from "./phase2-proactivity-merge-adjudication.ts";
import type { Phase2OpportunityLedgerSource } from "./phase2-proactivity-opportunity-ledger.ts";

type ModelReviewedPlanSource = Extract<
  Phase2OpportunityLedgerSource,
  { sourceFamily: "pattern_or_followup" }
>;

class FakeExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  constructor(private readonly outputText: string) {}

  async execute(request: JsonModelExecutionRequest) {
    this.requests.push(request);
    return {
      outputText: this.outputText,
      resolvedModelId: request.contract.modelId,
    };
  }
}

function modelReviewedPlan(
  overrides: Partial<ModelReviewedPlanSource> = {},
): ModelReviewedPlanSource {
  return {
    sourceFamily: "pattern_or_followup" as const,
    opportunityClass: "proactive_plan" as const,
    opportunityId: "plan-opportunity-1",
    projectId: "openclaw",
    sessionKey: "main",
    title: "Heartbeat fallback release gate",
    whyNow: "Recent heartbeat fallback regressions created false green proof results.",
    proposedNextStep:
      "Add a release gate that proves heartbeat fallback cards survive gateway rebuilds.",
    expectedUserValue: "Prevents false green live UX validation results.",
    evidenceSummary: "Model-reviewed bounded episode proposal.",
    confidence: "high" as const,
    sourceRefs: ["chat://main/assistant_turn/one"],
    sourceProfileIds: ["cited_assistant_answer" as const],
    authorityTiers: ["cited_soft" as const],
    contentHashes: ["content-hash-1"],
    proofHashes: ["proof-hash-1"],
    noDarkDataStatus: "pass" as const,
    blockedReasonCodes: ["model_reviewed_candidate", "high_context_review"],
    workItemKind: "planning_request" as const,
    generatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  } satisfies Phase2OpportunityLedgerSource;
}

describe("phase2 proactivity merge adjudication", () => {
  it("accepts a new candidate without a model call when no neighbors are recalled", async () => {
    const executor = new FakeExecutor(
      JSON.stringify({
        schemaVersion: "phase2_proactivity_merge_adjudication.v1",
        decisions: [],
      }),
    );

    const report = await adjudicateNewProactivityOpportunityMerge(
      modelReviewedPlan({ opportunityId: "plan-new" }),
      [],
      { enabled: true, executor },
    );

    expect(executor.requests).toHaveLength(0);
    expect(report.acceptedForSurfacing).toBe(true);
    expect(report.newCandidateDecision).toBe("distinct");
    expect(report.reasonCodes).toEqual(["no_recalled_neighbors"]);
  });

  it("adjudicates only the new candidate against recalled neighbors", async () => {
    const executor = new FakeExecutor(
      JSON.stringify({
        schemaVersion: "phase2_proactivity_merge_adjudication.v1",
        decisions: [
          {
            candidateOpportunityId: "plan-new",
            decision: "merge_into_existing",
            targetOpportunityId: "plan-old",
            rationale: "Both cards ask for the same heartbeat fallback release gate.",
            confidence: "high",
          },
        ],
      }),
    );

    const report = await adjudicateNewProactivityOpportunityMerge(
      modelReviewedPlan({
        opportunityId: "plan-new",
        title: "Add a heartbeat fallback release gate",
        generatedAt: "2026-05-01T00:01:00.000Z",
      }),
      [modelReviewedPlan({ opportunityId: "plan-old" })],
      { enabled: true, executor },
    );

    expect(executor.requests).toHaveLength(1);
    expect(executor.requests[0]?.userPrompt).toContain('"candidateOpportunityId":"plan-new"');
    expect(report.newCandidateDecision).toBe("merge_into_existing");
    expect(report.acceptedForSurfacing).toBe(false);
    expect(report.lifecycleOverrides).toEqual([
      expect.objectContaining({
        opportunityId: "plan-new",
        status: "superseded",
        supersededByOpportunityId: "plan-old",
      }),
    ]);
  });

  it("fails a new candidate closed when merge adjudication is unavailable", async () => {
    const report = await adjudicateNewProactivityOpportunityMerge(
      modelReviewedPlan({
        opportunityId: "plan-new",
        title: "Add a heartbeat fallback release gate",
        generatedAt: "2026-05-01T00:01:00.000Z",
      }),
      [modelReviewedPlan({ opportunityId: "plan-old" })],
      { enabled: true, executor: null },
    );

    expect(report.acceptedForSurfacing).toBe(false);
    expect(report.newCandidateDecision).toBe("quarantine");
    expect(report.reasonCodes).toEqual(["model_merge_adjudication_disabled_or_unavailable"]);
  });

  it("uses deterministic recall only to supply possible neighbors", () => {
    const rows = buildProactivityMergeRecallRows([
      modelReviewedPlan({ opportunityId: "plan-old" }),
      modelReviewedPlan({
        opportunityId: "plan-new",
        title: "Add a heartbeat fallback release gate",
        generatedAt: "2026-05-01T00:01:00.000Z",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.candidate.opportunityId).toBe("plan-new");
    expect(rows[0]?.neighbors.map((neighbor) => neighbor.opportunityId)).toEqual(["plan-old"]);
  });

  it("compacts the model prompt structurally without dropping recalled relationships", () => {
    const sources = [
      modelReviewedPlan({
        opportunityId: "plan-old",
        sourceRefs: Array.from(
          { length: 12 },
          (_, index) =>
            `candidate-review-packet://very-long-source-reference-${index.toString().padStart(2, "0")}-${"x".repeat(80)}`,
        ),
        contentHashes: Array.from({ length: 12 }, (_, index) => `${index}`.padEnd(64, "a")),
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        modelReviewedPlan({
          opportunityId: `plan-new-${index}`,
          title: `Add a heartbeat fallback release gate ${index}`,
          generatedAt: `2026-05-01T00:0${index + 1}:00.000Z`,
          sourceRefs: Array.from(
            { length: 12 },
            (_, refIndex) =>
              `candidate-review-packet://very-long-source-reference-${index}-${refIndex}-${"y".repeat(80)}`,
          ),
          contentHashes: Array.from({ length: 12 }, (_, hashIndex) =>
            `${index}${hashIndex}`.padEnd(64, "b"),
          ),
        }),
      ),
    ];
    const rows = buildProactivityMergeRecallRows(sources);
    const legacyPayload = JSON.stringify({ rows }, null, 2);
    const packet = buildProactivityMergePromptPacket(rows);
    const compactPayload = JSON.stringify(packet);

    expect(packet.rows).toHaveLength(rows.length);
    expect(packet.rows[0]?.neighborOpportunityIds).toEqual(
      rows[0]?.neighbors.map((neighbor) => neighbor.opportunityId),
    );
    expect(packet.candidates.map((candidate) => candidate.opportunityId)).toEqual(
      [
        ...new Set(
          rows
            .flatMap((row) => [row.candidate, ...row.neighbors])
            .map((candidate) => candidate.opportunityId),
        ),
      ].toSorted((left, right) => {
        const leftGeneratedAt =
          rows
            .flatMap((row) => [row.candidate, ...row.neighbors])
            .find((candidate) => candidate.opportunityId === left)?.generatedAt ?? "";
        const rightGeneratedAt =
          rows
            .flatMap((row) => [row.candidate, ...row.neighbors])
            .find((candidate) => candidate.opportunityId === right)?.generatedAt ?? "";
        return leftGeneratedAt.localeCompare(rightGeneratedAt);
      }),
    );
    expect(compactPayload.length).toBeLessThan(legacyPayload.length / 2);
    expect(
      packet.candidates.every((candidate) =>
        candidate.sourceRefKeys.every((key) => key.length === 12),
      ),
    ).toBe(true);
  });

  it("does not merge recalled near candidates when the model says distinct", async () => {
    const report = await adjudicateProactivityOpportunityMerges(
      [
        modelReviewedPlan({ opportunityId: "plan-old" }),
        modelReviewedPlan({
          opportunityId: "plan-new",
          title: "Add a heartbeat fallback release gate",
          generatedAt: "2026-05-01T00:01:00.000Z",
        }),
      ],
      {
        enabled: true,
        executor: new FakeExecutor(
          JSON.stringify({
            schemaVersion: "phase2_proactivity_merge_adjudication.v1",
            decisions: [
              {
                candidateOpportunityId: "plan-new",
                decision: "distinct",
                targetOpportunityId: null,
                rationale: "The new card drives a different release decision.",
                confidence: "high",
              },
            ],
          }),
        ),
      },
    );

    expect(report.decision).toBe("model_adjudicated");
    expect(report.lifecycleOverrides).toEqual([]);
  });

  it("creates a supersession override only for model-adjudicated duplicate plans", async () => {
    const report = await adjudicateProactivityOpportunityMerges(
      [
        modelReviewedPlan({ opportunityId: "plan-old" }),
        modelReviewedPlan({
          opportunityId: "plan-new",
          title: "Add a heartbeat fallback release gate",
          generatedAt: "2026-05-01T00:01:00.000Z",
        }),
      ],
      {
        enabled: true,
        now: new Date("2026-05-01T00:02:00.000Z"),
        executor: new FakeExecutor(
          JSON.stringify({
            schemaVersion: "phase2_proactivity_merge_adjudication.v1",
            decisions: [
              {
                candidateOpportunityId: "plan-new",
                decision: "merge_into_existing",
                targetOpportunityId: "plan-old",
                rationale: "Both cards ask for the same heartbeat fallback release gate.",
                confidence: "high",
              },
            ],
          }),
        ),
      },
    );

    expect(report.lifecycleOverrides).toEqual([
      expect.objectContaining({
        opportunityId: "plan-new",
        status: "superseded",
        supersededByOpportunityId: "plan-old",
      }),
    ]);
  });

  it("uses cached model adjudication when the compact recall input is unchanged", async () => {
    const sources = [
      modelReviewedPlan({ opportunityId: "plan-old" }),
      modelReviewedPlan({
        opportunityId: "plan-new",
        title: "Add a heartbeat fallback release gate",
        generatedAt: "2026-05-01T00:01:00.000Z",
      }),
    ];
    const firstExecutor = new FakeExecutor(
      JSON.stringify({
        schemaVersion: "phase2_proactivity_merge_adjudication.v1",
        decisions: [
          {
            candidateOpportunityId: "plan-new",
            decision: "merge_into_existing",
            targetOpportunityId: "plan-old",
            rationale: "Both cards ask for the same heartbeat fallback release gate.",
            confidence: "high",
          },
        ],
      }),
    );
    const first = await adjudicateProactivityOpportunityMerges(sources, {
      enabled: true,
      now: new Date("2026-05-01T00:02:00.000Z"),
      modelId: "openai-codex/gpt-5.4",
      executor: firstExecutor,
    });
    const secondExecutor = new FakeExecutor(
      JSON.stringify({
        schemaVersion: "phase2_proactivity_merge_adjudication.v1",
        decisions: [],
      }),
    );
    const second = await adjudicateProactivityOpportunityMerges(sources, {
      enabled: true,
      now: new Date("2026-05-01T00:03:00.000Z"),
      modelId: "openai-codex/gpt-5.4",
      executor: secondExecutor,
      cachedReport: {
        schemaVersion: first.schemaVersion,
        inputHash: first.inputHash,
        modelId: first.modelId ?? "openai-codex/gpt-5.4",
        generatedAt: first.generatedAt,
        decisions: first.decisions,
        lifecycleOverrides: first.lifecycleOverrides,
      },
    });

    expect(secondExecutor.requests).toHaveLength(0);
    expect(second.reasonCodes).toEqual(["cached_model_merge_adjudication"]);
    expect(second.lifecycleOverrides).toEqual(first.lifecycleOverrides);
  });

  it("fails closed when the model merge target was not in deterministic recall", async () => {
    const report = await adjudicateProactivityOpportunityMerges(
      [
        modelReviewedPlan({ opportunityId: "plan-old" }),
        modelReviewedPlan({
          opportunityId: "plan-new",
          generatedAt: "2026-05-01T00:01:00.000Z",
        }),
      ],
      {
        enabled: true,
        executor: new FakeExecutor(
          JSON.stringify({
            schemaVersion: "phase2_proactivity_merge_adjudication.v1",
            decisions: [
              {
                candidateOpportunityId: "plan-new",
                decision: "merge_into_existing",
                targetOpportunityId: "not-recalled",
                rationale: "Invalid target should be dropped by structural validation.",
                confidence: "high",
              },
            ],
          }),
        ),
      },
    );

    expect(report.decisions).toEqual([]);
    expect(report.lifecycleOverrides).toEqual([]);
    expect(report.reasonCodes).toContain("invalid_model_decisions_dropped");
  });
});
