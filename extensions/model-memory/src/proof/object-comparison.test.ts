import { describe, expect, it } from "vitest";
import { compareCanonicalObjects } from "./object-comparison.ts";

describe("object comparison", () => {
  it("passes on normalized semantic equivalence with structurally valid provenance", () => {
    const result = compareCanonicalObjects(
      [
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
      [
        {
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment   region", value: " REGION-001 " },
          scope: { projectId: "project-001", projectScope: "project-001" },
          provenance: [{ sourceId: "window-placeholder", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    );

    expect(result.pass).toBe(true);
  });

  it("fails on canonical mismatches instead of hiding them behind strings", () => {
    const result = compareCanonicalObjects(
      [
        {
          canonicalClass: "reference",
          kind: "reference",
          payload: { task: "task-001", primaryResource: "resource-001" },
          provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
      [
        {
          canonicalClass: "project",
          kind: "fact",
          payload: { subject: "deployment region", value: "region-001" },
          provenance: [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    );

    expect(result.pass).toBe(false);
    expect(result.reasons.some((reason) => reason.startsWith("missing_object"))).toBe(true);
    expect(result.reasons.some((reason) => reason.startsWith("extra_object"))).toBe(true);
  });
});
