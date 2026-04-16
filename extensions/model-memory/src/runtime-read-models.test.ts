import { describe, expect, it } from "vitest";
import { getCurrentMemoryObjects } from "./runtime-read-models.ts";
import type { ModelMemoryObjectRecord } from "./storage-database-contract.ts";

function buildMemoryObjectRecord(
  overrides: Partial<ModelMemoryObjectRecord>,
): ModelMemoryObjectRecord {
  return {
    id: overrides.id ?? "memory-001",
    canonicalClass: overrides.canonicalClass ?? "project",
    kind: overrides.kind ?? "fact",
    payload: overrides.payload ?? { subject: "deployment region", value: "region-001" },
    normalizedSubject: overrides.normalizedSubject ?? "deployment region",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText: overrides.normalizedSearchText ?? "deployment region region-001",
    scope: overrides.scope ?? { projectId: "project-001" },
    scopeKey: overrides.scopeKey ?? "scope-project-001",
    confidence: overrides.confidence ?? "strong",
    durability: overrides.durability ?? "durable",
    suggestedReviewMode: overrides.suggestedReviewMode ?? "auto_accept",
    executedReviewMode: overrides.executedReviewMode ?? "auto_accept",
    rationaleCodes: overrides.rationaleCodes ?? [],
    identityKey: overrides.identityKey ?? `identity-${overrides.id ?? "memory-001"}`,
    slotKey: overrides.slotKey ?? `slot-${overrides.id ?? "memory-001"}`,
    contractName: overrides.contractName ?? "semantic_extraction",
    contractVersion: overrides.contractVersion ?? "v1",
    modelId: overrides.modelId ?? "model-001",
    createdAt: overrides.createdAt ?? new Date(0),
    supersededAt: overrides.supersededAt,
    lifecycleState: overrides.lifecycleState,
    activationBasis: overrides.activationBasis,
    activatedAt: overrides.activatedAt,
    expiredAt: overrides.expiredAt,
  };
}

describe("runtime-read-models", () => {
  it("returns active objects only by default", () => {
    const records = [
      buildMemoryObjectRecord({ id: "active-explicit", lifecycleState: "active" }),
      buildMemoryObjectRecord({ id: "active-legacy" }),
      buildMemoryObjectRecord({
        id: "provisional-001",
        lifecycleState: "provisional",
      }),
      buildMemoryObjectRecord({
        id: "expired-001",
        lifecycleState: "expired",
        expiredAt: new Date(1_000),
      }),
      buildMemoryObjectRecord({
        id: "superseded-001",
        lifecycleState: "superseded",
        supersededAt: new Date(2_000),
      }),
      buildMemoryObjectRecord({
        id: "conflict-001",
        lifecycleState: "conflict_hold",
      }),
    ];

    expect(getCurrentMemoryObjects(records).map((record) => record.id)).toEqual([
      "active-explicit",
      "active-legacy",
    ]);
  });
});
