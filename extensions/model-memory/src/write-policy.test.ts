import { describe, expect, it } from "vitest";
import { deriveMemoryIdentity } from "./semantic-identity.ts";
import { decideWritePolicy } from "./write-policy.ts";

const testProvenance = [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }];
const secondProvenance = [{ sourceId: "window-002", segmentIndex: 0, headingPath: [] }];

describe("write-policy", () => {
  it("auto-accepts structurally valid captures even when the model suggested review", () => {
    const object = {
      canonicalClass: "user" as const,
      kind: "preference" as const,
      payload: {
        subject: "response detail",
        instruction: "keep explanations high level",
        operation: "prefer",
      },
      provenance: testProvenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "manual_review" as const,
    };

    const decision = decideWritePolicy({
      object,
      identity: deriveMemoryIdentity(object),
    });

    expect(decision.decision).toBe("write");
    expect(decision.executedReviewMode).toBe("auto_accept");
    expect(decision.decisionCodes).toContain("review_mode_overridden");
  });

  it("suppresses exact identity duplicates", () => {
    const object = {
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject: "deployment region",
        value: "region-001",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: testProvenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "auto_accept" as const,
    };

    const identity = deriveMemoryIdentity(object);
    const decision = decideWritePolicy({
      object,
      identity,
      existingByIdentity: {
        id: "memory-001",
        kind: "fact",
        identityKey: identity.identityKey,
        slotKey: identity.slotKey,
      },
    });

    expect(decision.decision).toBe("attach_support");
  });

  it("supersedes same-slot preference and fact corrections only", () => {
    const object = {
      canonicalClass: "project" as const,
      kind: "fact" as const,
      payload: {
        subject: "deployment region",
        value: "region-002",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: secondProvenance,
      confidence: "strong" as const,
      durability: "durable" as const,
      reviewMode: "auto_accept" as const,
    };

    const identity = deriveMemoryIdentity(object);
    const decision = decideWritePolicy({
      object,
      identity,
      existingBySlot: {
        id: "memory-001",
        kind: "fact",
        identityKey: "fact_previous",
        slotKey: identity.slotKey,
      },
    });

    expect(decision.decision).toBe("supersede");
  });

  it("ignores non-durable objects", () => {
    const object = {
      canonicalClass: "feedback" as const,
      kind: "procedure" as const,
      payload: {
        title: "procedure-001",
        steps: ["run check-001"],
      },
      provenance: testProvenance,
      confidence: "strong" as const,
      durability: "ephemeral" as const,
      reviewMode: "auto_accept" as const,
    };

    const decision = decideWritePolicy({
      object,
      identity: deriveMemoryIdentity(object),
    });

    expect(decision.decision).toBe("ignore");
  });
});
