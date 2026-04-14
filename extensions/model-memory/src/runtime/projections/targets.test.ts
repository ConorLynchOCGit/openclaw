import { describe, expect, it } from "vitest";
import {
  buildWorkspaceProjectionVersion,
  DEFAULT_WORKSPACE_PROJECTION_TARGETS,
} from "./targets.ts";

describe("projection targets", () => {
  it("defines the allowed v1 bootstrap targets in deterministic order", () => {
    expect(DEFAULT_WORKSPACE_PROJECTION_TARGETS.map((target) => target.targetId)).toEqual([
      "memory-md",
      "user-md",
      "agents-md",
    ]);
  });

  it("builds stable projection version records", () => {
    const first = buildWorkspaceProjectionVersion({
      targetId: "memory-md",
      renderedText: "# MEMORY.md\n\n- item",
      sourceObjectIds: ["memory-002", "memory-001"],
      sourceSlotKeys: ["slot-001"],
      sourceSetKeys: ["feedback:procedure:scope-001"],
    });
    const second = buildWorkspaceProjectionVersion({
      targetId: "memory-md",
      renderedText: "# MEMORY.md\n\n- item",
      sourceObjectIds: ["memory-001", "memory-002"],
      sourceSlotKeys: ["slot-001"],
      sourceSetKeys: ["feedback:procedure:scope-001"],
    });

    expect(first.id).toBe(second.id);
    expect(first.canonicalArtifactPath).toContain(".openclaw/model-memory/projections/");
  });
});
