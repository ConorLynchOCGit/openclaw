import { describe, expect, it } from "vitest";
import { materializeActiveMemorySlots } from "./active-memory-slots.ts";

describe("active-memory-slots", () => {
  it("materializes only current slot-backed objects", () => {
    const slots = materializeActiveMemorySlots([
      {
        id: "memory-old",
        sourceWindowId: "window-001",
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-001" },
        normalizedSubject: "deployment region",
        normalizedTitle: undefined,
        normalizedSearchText: "deployment region region-001",
        scope: { projectId: "project-001" },
        scopeKey: "scope-project-001",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "fact-old",
        slotKey: "slot-deployment-region",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(1000),
        supersededAt: new Date(2000),
      },
      {
        id: "memory-current",
        sourceWindowId: "window-002",
        canonicalClass: "project",
        kind: "fact",
        payload: { subject: "deployment region", value: "region-002" },
        normalizedSubject: "deployment region",
        normalizedTitle: undefined,
        normalizedSearchText: "deployment region region-002",
        scope: { projectId: "project-001" },
        scopeKey: "scope-project-001",
        provenance: [],
        confidence: "strong",
        durability: "durable",
        suggestedReviewMode: "auto_accept",
        executedReviewMode: "auto_accept",
        rationaleCodes: [],
        identityKey: "fact-current",
        slotKey: "slot-deployment-region",
        contractName: "semantic_extraction",
        contractVersion: "v1",
        modelId: "model-001",
        createdAt: new Date(3000),
      },
    ]);

    expect(slots).toEqual([
      {
        slotKey: "slot-deployment-region",
        canonicalClass: "project",
        kind: "fact",
        scopeKey: "scope-project-001",
        subjectKey: "deployment region",
        currentObjectId: "memory-current",
        currentIdentityKey: "fact-current",
        updatedAt: new Date(3000),
      },
    ]);
  });
});
