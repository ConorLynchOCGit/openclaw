import { describe, expect, it } from "vitest";
import { deriveMemoryIdentity, isDeterministicSameSlotSupersession } from "./semantic-identity.ts";

const testProvenance = [{ sourceId: "window-001", segmentIndex: 0, headingPath: [] }];
const secondProvenance = [{ sourceId: "window-002", segmentIndex: 0, headingPath: [] }];

describe("semantic-identity", () => {
  it("normalizes exact duplicates to the same identity key", () => {
    const first = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "Deployment Region",
        value: " REGION-001 ",
      },
      scope: {
        projectId: "PROJECT-001",
        projectScope: "project-001",
      },
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const second = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment   region",
        value: "region-001",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(first.identityKey).toBe(second.identityKey);
    expect(first.slotKey).toBe(second.slotKey);
  });

  it("treats same-slot fact corrections as supersession candidates", () => {
    const prior = deriveMemoryIdentity({
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
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const replacement = deriveMemoryIdentity({
      canonicalClass: "project",
      kind: "fact",
      payload: {
        subject: "deployment region",
        value: "region-002",
      },
      scope: {
        projectId: "project-001",
        projectScope: "project-001",
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(prior.identityKey).not.toBe(replacement.identityKey);
    expect(
      isDeterministicSameSlotSupersession(
        { kind: "fact", identityKey: prior.identityKey, slotKey: prior.slotKey },
        { kind: "fact", identityKey: replacement.identityKey, slotKey: replacement.slotKey },
      ),
    ).toBe(true);
  });

  it("keeps ordered procedure steps inside identity construction", () => {
    const first = deriveMemoryIdentity({
      canonicalClass: "feedback",
      kind: "procedure",
      payload: {
        title: "procedure-001",
        steps: ["run check-001", "record artifact-001"],
      },
      provenance: testProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });
    const second = deriveMemoryIdentity({
      canonicalClass: "feedback",
      kind: "procedure",
      payload: {
        title: "procedure-001",
        steps: ["record artifact-001", "run check-001"],
      },
      provenance: secondProvenance,
      confidence: "strong",
      durability: "durable",
      reviewMode: "auto_accept",
    });

    expect(first.identityKey).not.toBe(second.identityKey);
    expect(first.slotKey).toBeUndefined();
  });
});
