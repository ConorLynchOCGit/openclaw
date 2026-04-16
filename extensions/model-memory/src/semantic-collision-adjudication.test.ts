import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutionResponse } from "./model-execution.ts";
import {
  ExecutorBackedSemanticCollisionAdjudicator,
  type CollisionAdjudicationRequest,
  type BoundedCandidateAdjudicationRequest,
} from "./semantic-collision-adjudication.ts";

function collisionRequest(input: {
  candidateId: string;
  subject: string;
  targetId: string;
}): CollisionAdjudicationRequest {
  return {
    candidateId: input.candidateId,
    sourceKind: "document",
    sourceWindowId: `${input.candidateId}-window`,
    object: {
      canonicalClass: "project",
      kind: "rule",
      payload: {
        subject: input.subject,
        recommendedAction: `do ${input.subject}`,
      },
      provenance: [{ sourceId: `${input.candidateId}-window`, segmentIndex: 0, headingPath: [] }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    },
    candidates: [
      {
        id: input.targetId,
        identityKey: `${input.targetId}-identity`,
        canonicalClass: "project",
        kind: "rule",
        payload: {
          subject: `${input.subject} prior`,
          recommendedAction: `keep ${input.subject}`,
        },
        scope: {},
        normalizedSearchText: `${input.subject} prior keep ${input.subject}`,
        lifecycleState: "active",
        slotKey: undefined,
      },
    ],
  };
}

function boundedCandidateAdjudicationRequest(input: {
  candidateId: string;
  subject: string;
  targetId: string;
}): BoundedCandidateAdjudicationRequest {
  return {
    candidateId: input.candidateId,
    sourceKind: "document",
    sourceWindowId: `${input.candidateId}-window`,
    sourcePath: "AGENTS.md",
    object: {
      canonicalClass: "project",
      kind: "rule",
      payload: {
        subject: input.subject,
        recommendedAction: `do ${input.subject}`,
      },
      provenance: [{ sourceId: `${input.candidateId}-window`, segmentIndex: 0, headingPath: [] }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    },
    candidates: [
      {
        adjudicationCandidateId: "candidate_1",
        id: input.targetId,
        identityKey: `${input.targetId}-identity`,
        canonicalClass: "project",
        kind: "rule",
        payload: {
          subject: `${input.subject} prior`,
          recommendedAction: `do ${input.subject}`,
        },
        scope: {},
        normalizedSearchText: `${input.subject} prior do ${input.subject}`,
        lifecycleState: "active",
        slotKey: undefined,
        candidateSource: "raw_text_fallback",
        similarityScore: 0.82,
        scopeKey: "scope-001",
        sameCanonicalClass: true,
        sameKind: true,
        sameScope: true,
        sourcePath: "AGENTS.md",
      },
    ],
  };
}

describe("semantic-collision-adjudication", () => {
  it("returns validated batched adjudication rows", async () => {
    const requests = [
      collisionRequest({
        candidateId: "candidate-1",
        subject: "lazy loading boundary",
        targetId: "memory-1",
      }),
    ];
    const executor = {
      async execute(_request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                relation: "attach_support",
                targetObjectId: "memory-1",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    const result = await adjudicator.adjudicateBatch({
      requests,
      modelId: "mock-model",
    });

    expect(result).toEqual([
      {
        candidateId: "candidate-1",
        relation: "attach_support",
        targetObjectId: "memory-1",
      },
    ]);
  });

  it("falls back to conflict_hold for malformed or missing batch rows", async () => {
    const requests = [
      collisionRequest({
        candidateId: "candidate-1",
        subject: "prototype mutation alternative",
        targetId: "memory-1",
      }),
      collisionRequest({
        candidateId: "candidate-2",
        subject: "lazy loading boundary",
        targetId: "memory-2",
      }),
    ];
    const executor = {
      async execute(_request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                relation: "attach_support",
                targetObjectId: "missing-target",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    const result = await adjudicator.adjudicateBatch({
      requests,
      modelId: "mock-model",
    });

    expect(result).toEqual([
      {
        candidateId: "candidate-1",
        relation: "conflict_hold",
      },
      {
        candidateId: "candidate-2",
        relation: "conflict_hold",
      },
    ]);
  });

  it("prompts single-candidate near-restatements toward attach_support over conflict_hold", async () => {
    const requests = [
      collisionRequest({
        candidateId: "candidate-1",
        subject: "landing verification",
        targetId: "memory-1",
      }),
    ];
    let seenSystemPrompt = "";
    const executor = {
      async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        seenSystemPrompt = request.systemPrompt;
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                relation: "attach_support",
                targetObjectId: "memory-1",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    await adjudicator.adjudicateBatch({
      requests,
      modelId: "mock-model",
    });

    expect(seenSystemPrompt).toContain(
      "If exactly one candidate remains after deterministic gating and it reads like a near-restatement or paraphrase of the same durable claim, prefer attach_support.",
    );
    expect(seenSystemPrompt).toContain(
      "Do not use conflict_hold as the default answer for a one-candidate paraphrase.",
    );
  });

  it("includes decisive-field summaries and candidate state in the batch payload", async () => {
    const requests = [
      {
        candidateId: "candidate-1",
        sourceKind: "document",
        sourceWindowId: "candidate-1-window",
        object: {
          canonicalClass: "project" as const,
          kind: "fact" as const,
          payload: {
            subject: "config.apply/config.patch restart requests",
            value:
              "Restart requests are coalesced while one is already pending/in-flight, and a 30-second cooldown applies between restart cycles.",
          },
          provenance: [{ sourceId: "candidate-1-window", segmentIndex: 0, headingPath: [] }],
          confidence: "strong" as const,
          durability: "durable" as const,
          reviewMode: "auto_accept" as const,
        },
        candidates: [
          {
            id: "memory-1",
            identityKey: "memory-1-identity",
            canonicalClass: "project",
            kind: "fact",
            payload: {
              subject: "Config.apply/config.patch restart coalescing and cooldown",
              value:
                "Restart requests are coalesced while one is already pending/in-flight, and a 30-second cooldown applies between restart cycles.",
            },
            scope: {},
            normalizedSearchText:
              "config.apply config.patch restart coalescing and cooldown restart requests are coalesced while one is already pending in flight and a 30 second cooldown applies between restart cycles",
            lifecycleState: "conflict_hold",
            slotKey: undefined,
          },
        ],
      } satisfies CollisionAdjudicationRequest,
    ];

    let seenUserPrompt = "";
    let seenSystemPrompt = "";
    const executor = {
      async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        seenUserPrompt = request.userPrompt;
        seenSystemPrompt = request.systemPrompt;
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                relation: "attach_support",
                targetObjectId: "memory-1",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    await adjudicator.adjudicateBatch({
      requests,
      modelId: "mock-model",
    });

    expect(seenUserPrompt).toContain('"candidateState":"contained"');
    expect(seenUserPrompt).toContain('"decisiveFieldAgreement":true');
    expect(seenUserPrompt).toContain('"decisiveFieldSummary":"value=match"');
    expect(seenUserPrompt).toContain('"dominantCoreClaimCandidateIds":["memory-1"]');
    expect(seenUserPrompt).toContain('"dominantCandidateId":"memory-1"');
    expect(seenUserPrompt).toContain('"coreClaimMatch":true');
    expect(seenUserPrompt).toContain('"coreClaimSummary":"value=match"');
    expect(seenUserPrompt).toContain('"blockingFieldSummary":"packaging:subject"');
    expect(seenUserPrompt).toContain('"deltaClass":"packaging_only_drift"');
    expect(seenUserPrompt).toContain('"sameClaimLeaning":true');
    expect(seenUserPrompt).toContain('"candidateRankReason"');
    expect(seenUserPrompt).toContain('"sameClaimRisk":"field_match_wrapper_drift"');
    expect(seenUserPrompt).toContain('"sameClaimConfidence":"high"');
    expect(seenUserPrompt).toContain('"packagingDriftType":"subject_drift"');
    expect(seenUserPrompt).toContain('"familyRecallSummary"');
    expect(seenUserPrompt).toContain('"ruleActionBundleSummary"');
    expect(seenSystemPrompt).toContain("field_packing_drift");
    expect(seenSystemPrompt).toContain("ruleActionBundleStrong");
  });

  it("returns validated bounded-candidate adjudication rows", async () => {
    const requests = [
      boundedCandidateAdjudicationRequest({
        candidateId: "candidate-1",
        subject: "git stash safety",
        targetId: "memory-1",
      }),
    ];
    const executor = {
      async execute(_request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                sameCoreMemory: "yes",
                matchedCandidateId: "candidate_1",
                deltaType: "non_additive",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    const result = await adjudicator.adjudicateBoundedCandidateBatch?.({
      requests,
      modelId: "mock-model",
    });

    expect(result).toEqual([
      {
        candidateId: "candidate-1",
        sameCoreMemory: "yes",
        matchedCandidateId: "candidate_1",
        deltaType: "non_additive",
      },
    ]);
  });

  it("includes advisory structural-match flags in bounded-candidate payloads", async () => {
    const requests = [
      {
        ...boundedCandidateAdjudicationRequest({
          candidateId: "candidate-1",
          subject: "docs path safety",
          targetId: "memory-1",
        }),
        candidates: [
          {
            ...boundedCandidateAdjudicationRequest({
              candidateId: "candidate-1",
              subject: "docs path safety",
              targetId: "memory-1",
            }).candidates[0]!,
            sameCanonicalClass: false,
            sameKind: true,
            sameScope: false,
            scopeKey: "scope-drift",
            similarityScore: 0.91,
          },
        ],
      },
    ];
    let seenUserPrompt = "";
    let seenSystemPrompt = "";
    const executor = {
      async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        seenUserPrompt = request.userPrompt;
        seenSystemPrompt = request.systemPrompt;
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                sameCoreMemory: "ambiguous",
                matchedCandidateId: "none",
                deltaType: "unclear",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    await adjudicator.adjudicateBoundedCandidateBatch({
      requests,
      modelId: "mock-model",
    });

    expect(seenUserPrompt).toContain('"sameCanonicalClass":false');
    expect(seenUserPrompt).toContain('"sameKind":true');
    expect(seenUserPrompt).toContain('"sameScope":false');
    expect(seenUserPrompt).toContain('"candidateScopeKey":"scope-drift"');
    expect(seenSystemPrompt).toContain("Ignore sameCanonicalClass, sameKind, and sameScope");
    expect(seenSystemPrompt).toContain(
      "For bounded adjudication, decide from the memory text and payload content",
    );
  });

  it("falls back to ambiguous rows for malformed bounded-candidate output", async () => {
    const requests = [
      boundedCandidateAdjudicationRequest({
        candidateId: "candidate-1",
        subject: "docs url policy",
        targetId: "memory-1",
      }),
    ];
    const executor = {
      async execute(_request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
        return {
          outputText: JSON.stringify({
            decisions: [
              {
                candidateId: "candidate-1",
                sameCoreMemory: "yes",
                matchedCandidateId: "missing",
                deltaType: "non_additive",
              },
            ],
          }),
          resolvedModelId: "mock-model",
        };
      },
    };

    const adjudicator = new ExecutorBackedSemanticCollisionAdjudicator(executor);
    const result = await adjudicator.adjudicateBoundedCandidateBatch?.({
      requests,
      modelId: "mock-model",
    });

    expect(result).toEqual([
      {
        candidateId: "candidate-1",
        sameCoreMemory: "ambiguous",
        matchedCandidateId: "none",
        deltaType: "unclear",
      },
    ]);
  });
});
