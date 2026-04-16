import { describe, expect, it } from "vitest";
import { compareRuntimeObservations } from "./runtime-comparison.ts";

describe("runtime comparison", () => {
  it("classifies divergence, duplicate deltas, and supersession deltas object-natively", () => {
    const comparison = compareRuntimeObservations(
      {
        capturedObjects: [
          {
            canonicalClass: "project",
            kind: "fact",
            payload: { subject: "deployment region", value: "region-002" },
            scope: { projectId: "project-001", projectScope: "project-001" },
            provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
            confidence: "strong",
            durability: "durable",
            reviewMode: "auto_accept",
          },
        ],
        writeObservations: [{ decision: "supersede", identityKey: "fact-002" }],
      },
      {
        capturedObjects: [
          {
            canonicalClass: "project",
            kind: "fact",
            payload: { subject: "deployment region", value: "region-001" },
            scope: { projectId: "project-001", projectScope: "project-001" },
            provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
            confidence: "strong",
            durability: "durable",
            reviewMode: "auto_accept",
          },
        ],
        writeObservations: [{ decision: "attach_support", identityKey: "fact-001" }],
      },
    );

    expect(comparison.matchedIdentityKeys).toHaveLength(0);
    expect(comparison.modelOnlyIdentityKeys).toHaveLength(1);
    expect(comparison.legacyOnlyIdentityKeys).toHaveLength(1);
    expect(comparison.duplicateDecisionDelta).toBe(-1);
    expect(comparison.supersessionDecisionDelta).toBe(1);
  });
});
