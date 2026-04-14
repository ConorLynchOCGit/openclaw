import { describe, expect, it } from "vitest";
import { runShadowMode } from "./shadow-mode.ts";

describe("shadow mode", () => {
  it("runs model-memory and legacy observation side by side without backfilling truth", async () => {
    const result = await runShadowMode({
      execution: {
        sourceKind: "ordinary_turn",
        sourceText: "For project-001, the deployment region is region-001.",
        featureFlag: "shadow_only",
      },
      modelMemory: {
        async observe() {
          return {
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
            writeObservations: [{ decision: "write", identityKey: "fact-001" }],
          };
        },
      },
      legacy: {
        async observe() {
          return {
            capturedObjects: [],
            writeObservations: [],
          };
        },
      },
    });

    expect(result.comparison.modelOnlyIdentityKeys).toHaveLength(1);
    expect(result.comparison.legacyOnlyIdentityKeys).toHaveLength(0);
    expect(result.comparison.omissionDivergence).toBe(true);
  });
});
