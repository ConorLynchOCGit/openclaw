import { describe, expect, it } from "vitest";
import { validateMemoryObject } from "./semantic-validator.ts";

describe("semantic-validator", () => {
  it("accepts a valid canonical object", () => {
    const result = validateMemoryObject(
      {
        canonicalClass: "project",
        kind: "fact",
        payload: {
          subject: "deployment region",
          value: "region-001",
        },
        scope: {
          projectId: "project-001",
          projectScope: "project-001",
        },
        provenance: [{ sourceId: "window-001", blockId: "block-001", lineStart: 1, lineEnd: 1 }],
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
      {
        availableBlockIds: ["block-001"],
        lineStart: 1,
        lineEnd: 3,
        headingPaths: [[]],
      },
    );

    expect(result.status).toBe("accept");
  });

  it("rejects excluded legacy fields from runtime truth", () => {
    const result = validateMemoryObject({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-001",
        factFieldKey: "deployment_region",
      },
      provenance: [{ sourceId: "window-001", segmentIndex: 0 }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(result.status).toBe("reject");
  });

  it("marks malformed but repairable outputs as repairable rejects", () => {
    const result = validateMemoryObject({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
      },
      provenance: [{ sourceId: "window-001", segmentIndex: 0 }],
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(result.status).toBe("reject_repairable");
  });

  it("rejects provenance spans that fall outside the source window", () => {
    const result = validateMemoryObject(
      {
        canonicalClass: "project",
        kind: "fact",
        payload: {
          subject: "deployment region",
          value: "region-001",
        },
        provenance: [{ sourceId: "window-001", blockId: "block-999", lineStart: 10, lineEnd: 10 }],
        confidence: "strong",
        durability: "durable",
        reviewMode: "auto_accept",
      },
      {
        availableBlockIds: ["block-001"],
        lineStart: 1,
        lineEnd: 3,
      },
    );

    expect(result.status).toBe("reject");
  });
});
