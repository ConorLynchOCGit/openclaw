import { describe, expect, it } from "vitest";
import {
  buildHierarchicalRetrievalPlan,
  buildHierarchicalRetrievalShadow,
  mergeHierarchicalRetrievalResults,
  type HierarchicalRetrievalCandidate,
  type HierarchicalRetrievalParentEnvelope,
  type HierarchicalRetrievalSubquery,
} from "./hierarchical-retrieval.ts";

const parent: HierarchicalRetrievalParentEnvelope = {
  parentPlanId: "parent-plan-1",
  parentGoal: "plan bounded project work",
  parentQueryHash: "parent-query-hash",
  parentRedactedLabel: "sha256:parent-query-hash",
  retrievalPlanId: "retrieval-plan-1",
  scopeKey: "project:project-1",
};

function subquery(id: string, priority = 1): HierarchicalRetrievalSubquery {
  return {
    subqueryId: id,
    goal: `goal-${id}`,
    queryHash: `query-hash-${id}`,
    redactedLabel: `sha256:query-hash-${id}`,
    purpose: "project_state",
    desiredResultCount: 2,
    priority,
    corpora: ["project"],
    packTypes: ["project_state_pack"],
    indexes: ["fielded"],
    scopeConstraints: { projectId: "project-1" },
  };
}

function candidate(
  id: string,
  overrides: Partial<HierarchicalRetrievalCandidate> = {},
): HierarchicalRetrievalCandidate {
  return {
    candidateId: id,
    lane: "fielded",
    memoryId: id,
    sourceMemoryIds: [id],
    sourceEventIds: [`event-${id}`],
    sourceRefs: [{ sourceId: `source-${id}`, segmentId: `segment-${id}` }],
    scopeKey: "project:project-1",
    authorityTier: "curated_authoritative",
    sourceProfileId: "curated_corpus",
    status: "active",
    rankBand: "primary",
    score: 10,
    priority: 10,
    estimatedTokens: 10,
    ...overrides,
  };
}

describe("hierarchical retrieval shadow substrate", () => {
  it("returns no sub-query output in disabled mode and preserves default retrieval behavior", () => {
    const result = buildHierarchicalRetrievalShadow({
      mode: "disabled",
      subqueries: [subquery("sq-1")],
    });

    expect(result.plan).toBeUndefined();
    expect(result.subqueryResults).toEqual([]);
    expect(result.mergedCandidates).toEqual([]);
    expect(result.telemetry).toMatchObject({
      mode: "disabled",
      defaultRetrievalChanged: false,
      subqueryCount: 0,
      exclusionReasons: expect.objectContaining({ hierarchical_disabled: 1 }),
    });
  });

  it("validates and records bounded shadow sub-query plans", () => {
    const result = buildHierarchicalRetrievalShadow({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1", 3), subquery("sq-2", 2)],
    });

    expect(result.plan).toEqual(
      expect.objectContaining({
        mode: "shadow_report_only",
        maxSubqueries: 3,
        decompositionMode: "bounded_multi_pass",
      }),
    );
    expect(result.telemetry).toMatchObject({
      subqueryIds: ["sq-1", "sq-2"],
      subqueryCount: 2,
      defaultRetrievalChanged: false,
    });
  });

  it("caps shadow mode at three subqueries and explicit eval mode at five", () => {
    const many = [
      subquery("sq-1", 6),
      subquery("sq-2", 5),
      subquery("sq-3", 4),
      subquery("sq-4", 3),
      subquery("sq-5", 2),
      subquery("sq-6", 1),
    ];

    const shadow = buildHierarchicalRetrievalPlan({
      mode: "shadow_report_only",
      parent,
      subqueries: many,
    });
    const evalMode = buildHierarchicalRetrievalPlan({
      mode: "explicit_eval",
      parent,
      subqueries: many,
    });

    expect(shadow.plan.subqueries.map((entry) => entry.subqueryId)).toEqual([
      "sq-1",
      "sq-2",
      "sq-3",
    ]);
    expect(shadow.exclusions).toHaveLength(3);
    expect(evalMode.plan.subqueries.map((entry) => entry.subqueryId)).toEqual([
      "sq-1",
      "sq-2",
      "sq-3",
      "sq-4",
      "sq-5",
    ]);
    expect(evalMode.exclusions).toHaveLength(1);
  });

  it("rejects invalid plans with missing query hashes, bad labels, or prohibited raw fields", () => {
    expect(() =>
      buildHierarchicalRetrievalShadow({
        mode: "shadow_report_only",
        parent,
        subqueries: [{ ...subquery("sq-1"), queryHash: "" }],
      }),
    ).toThrow(/invalid hierarchical retrieval subquery/u);
    expect(() =>
      buildHierarchicalRetrievalShadow({
        mode: "shadow_report_only",
        parent: { ...parent, parentRedactedLabel: "not-redacted" },
        subqueries: [subquery("sq-1")],
      }),
    ).toThrow(/parent envelope/u);
    expect(() =>
      buildHierarchicalRetrievalShadow({
        mode: "shadow_report_only",
        parent,
        subqueries: [{ ...subquery("sq-1"), rawPrompt: "blocked" } as any],
      }),
    ).toThrow(/prohibited field/u);
  });

  it("deterministically merges by memory, projection, capsule, pack, source, and scope keys", () => {
    const { plan } = buildHierarchicalRetrievalPlan({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1"), subquery("sq-2")],
      maxMergedResults: 20,
    });
    const input = {
      plan,
      subqueryResults: [
        {
          subqueryId: "sq-1",
          candidates: [
            candidate("cand-memory-a", { memoryId: "memory-a", candidateId: "cand-memory-a1" }),
            candidate("cand-projection-a", {
              memoryId: undefined,
              projectionId: "projection-a",
              candidateId: "cand-projection-a1",
            }),
            candidate("cand-capsule-a", {
              memoryId: undefined,
              capsuleId: "capsule-a",
              packId: "pack-a",
              candidateId: "cand-capsule-a1",
              lane: "capsule",
            }),
            candidate("cand-source-a", {
              memoryId: undefined,
              candidateId: "cand-source-a1",
              sourceMemoryIds: ["source-memory-a"],
            }),
            candidate("cand-ref-a", {
              memoryId: undefined,
              candidateId: "cand-ref-a1",
              sourceMemoryIds: [],
              sourceEventIds: [],
              sourceRefs: [{ sourceId: "source-ref-a", segmentId: "segment-a" }],
            }),
            candidate("cand-scope-a", {
              memoryId: undefined,
              candidateId: "cand-scope-a1",
              sourceMemoryIds: [],
              sourceEventIds: [],
              sourceRefs: [],
              scopeKey: "scope-only-a",
            }),
          ],
        },
        {
          subqueryId: "sq-2",
          candidates: [
            candidate("cand-memory-a", { memoryId: "memory-a", candidateId: "cand-memory-a2" }),
            candidate("cand-projection-a", {
              memoryId: undefined,
              projectionId: "projection-a",
              candidateId: "cand-projection-a2",
            }),
            candidate("cand-capsule-a", {
              memoryId: undefined,
              capsuleId: "capsule-a",
              packId: "pack-a",
              candidateId: "cand-capsule-a2",
              lane: "capsule",
            }),
            candidate("cand-source-a", {
              memoryId: undefined,
              candidateId: "cand-source-a2",
              sourceMemoryIds: ["source-memory-a"],
            }),
            candidate("cand-ref-a", {
              memoryId: undefined,
              candidateId: "cand-ref-a2",
              sourceMemoryIds: [],
              sourceEventIds: [],
              sourceRefs: [{ sourceId: "source-ref-a", segmentId: "segment-a" }],
            }),
            candidate("cand-scope-a", {
              memoryId: undefined,
              candidateId: "cand-scope-a2",
              sourceMemoryIds: [],
              sourceEventIds: [],
              sourceRefs: [],
              scopeKey: "scope-only-a",
            }),
          ],
        },
      ],
    };

    const first = mergeHierarchicalRetrievalResults(input);
    const second = mergeHierarchicalRetrievalResults(input);

    expect(first).toEqual(second);
    expect(first.mergedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memoryIds: ["memory-a"],
          sourceSubqueryIds: ["sq-1", "sq-2"],
          mergeReasonCodes: expect.arrayContaining(["memory_id_match"]),
        }),
        expect.objectContaining({
          projectionIds: ["projection-a"],
          mergeReasonCodes: expect.arrayContaining(["projection_id_match"]),
        }),
        expect.objectContaining({
          capsuleIds: ["capsule-a"],
          packIds: ["pack-a"],
          lanes: ["capsule"],
          mergeReasonCodes: expect.arrayContaining(["capsule_id_match", "pack_id_match"]),
        }),
        expect.objectContaining({
          sourceMemoryIds: ["source-memory-a"],
          mergeReasonCodes: expect.arrayContaining(["source_memory_id_match"]),
        }),
        expect.objectContaining({
          sourceRefs: [expect.objectContaining({ sourceId: "source-ref-a" })],
          mergeReasonCodes: expect.arrayContaining(["source_ref_match"]),
        }),
        expect.objectContaining({
          scopeKeys: ["scope-only-a"],
          mergeReasonCodes: expect.arrayContaining(["scope_key_match"]),
        }),
      ]),
    );
  });

  it("preserves authority/profile metadata and keeps lower authority from overriding higher authority", () => {
    const result = buildHierarchicalRetrievalShadow({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1"), subquery("sq-2")],
      subqueryResults: [
        {
          subqueryId: "sq-1",
          candidates: [
            candidate("cand-high", {
              memoryId: "memory-a",
              authorityTier: "user_authoritative",
              sourceProfileId: "explicit_user_turn",
              score: 5,
            }),
          ],
        },
        {
          subqueryId: "sq-2",
          candidates: [
            candidate("cand-low", {
              memoryId: "memory-a",
              authorityTier: "cited_soft",
              sourceProfileId: "researcher_report_artifact",
              score: 50,
            }),
          ],
        },
      ],
    });

    expect(result.mergedCandidates[0]).toEqual(
      expect.objectContaining({
        authorityTiers: ["cited_soft", "user_authoritative"],
        sourceProfileIds: ["explicit_user_turn", "researcher_report_artifact"],
        mergeReasonCodes: expect.arrayContaining([
          "higher_authority_retained",
          "lower_authority_retained",
        ]),
      }),
    );
    expect(result.telemetry.authorityTiers).toEqual(["cited_soft", "user_authoritative"]);
  });

  it("keeps stale, conflicted, and inspection-only candidates excluded and visible", () => {
    const result = buildHierarchicalRetrievalShadow({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1")],
      subqueryResults: [
        {
          subqueryId: "sq-1",
          candidates: [
            candidate("cand-stale", { status: "stale" }),
            candidate("cand-conflicted", { status: "conflicted" }),
            candidate("cand-inspection", { authorityTier: "inspection_only" }),
          ],
        },
      ],
    });

    expect(result.mergedCandidates).toEqual([]);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cand-stale", reason: "stale" }),
        expect.objectContaining({ id: "cand-conflicted", reason: "conflicted" }),
        expect.objectContaining({ id: "cand-inspection", reason: "inspection_only" }),
      ]),
    );
  });

  it("applies deterministic result and token budgets with overflow exclusions", () => {
    const result = buildHierarchicalRetrievalShadow({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1")],
      maxMergedResults: 1,
      maxEstimatedTokens: 15,
      subqueryResults: [
        {
          subqueryId: "sq-1",
          candidates: [
            candidate("cand-a", { priority: 10, estimatedTokens: 10 }),
            candidate("cand-b", { priority: 9, estimatedTokens: 10 }),
            candidate("cand-c", { priority: 8, estimatedTokens: 20 }),
          ],
        },
      ],
    });

    expect(result.mergedCandidates.filter((entry) => entry.selected)).toHaveLength(1);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "budget_overflow" }),
        expect.objectContaining({ reason: "budget_overflow" }),
      ]),
    );
    expect(result.telemetry.estimatedTokens).toBeLessThanOrEqual(15);
  });

  it("does not mutate input candidates or subquery results", () => {
    const source = {
      subqueryId: "sq-1",
      candidates: [candidate("cand-a", { sourceMemoryIds: ["source-memory-a"] })],
    };
    const result = buildHierarchicalRetrievalShadow({
      mode: "shadow_report_only",
      parent,
      subqueries: [subquery("sq-1")],
      subqueryResults: [source],
    });

    result.mergedCandidates[0]!.sourceMemoryIds.length = 0;
    expect(source.candidates[0]!.sourceMemoryIds).toEqual(["source-memory-a"]);
  });
});
