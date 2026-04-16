import { describe, expect, it } from "vitest";
import { buildContextArtifact } from "./context-artifacts.ts";

describe("context-artifacts", () => {
  it("builds deterministic auditable artifacts from source ids and slot keys", () => {
    const first = buildContextArtifact({
      artifactType: "user_memory_pack",
      scopeKey: "scope-user-001",
      sourceObjectIds: ["memory-002", "memory-001"],
      sourceSlotKeys: ["slot-response-detail"],
      renderedText: "Keep explanations high level.",
      buildPolicyVersion: "v1",
    });
    const second = buildContextArtifact({
      artifactType: "user_memory_pack",
      scopeKey: "scope-user-001",
      sourceObjectIds: ["memory-001", "memory-002"],
      sourceSlotKeys: ["slot-response-detail"],
      renderedText: "Keep explanations high level.",
      buildPolicyVersion: "v1",
    });

    expect(first.id).toBe(second.id);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.sourceObjectIds).toEqual(["memory-001", "memory-002"]);
  });

  it("requires artifact content and does not reinterpret semantic meaning", () => {
    expect(() =>
      buildContextArtifact({
        artifactType: "project_memory_pack",
        buildPolicyVersion: "v1",
      }),
    ).toThrow("context artifact requires structuredPayload or renderedText");
  });
});
