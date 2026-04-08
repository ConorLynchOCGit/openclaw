import { describe, expect, it } from "vitest";
import {
  buildDurableMemoryBehaviorProfile,
  renderDurableMemoryBehaviorProfile,
  resolveDurableMemoryGuidancePlan,
} from "./behavior-profile.js";

describe("behavior profile guidance plan", () => {
  it("derives family guidance groups from the currently available tool surfaces", () => {
    expect(
      resolveDurableMemoryGuidancePlan({
        hasCandidateSubmit: true,
        hasObjectGet: false,
        hasObjectList: false,
        hasObjectSearchBasic: false,
        hasObjectSearchHybrid: true,
        hasSessionGet: false,
        hasSessionUpdate: false,
      }),
    ).toEqual({
      hasObjectSurface: true,
      hasCandidateSurface: true,
      hasSessionSurface: false,
      searchFamilies: [
        "response_style",
        "project_fact",
        "recurring_procedure",
        "workflow_improvement",
        "project_rule",
        "unmet_need",
      ],
      applicationFamilies: ["recurring_procedure", "workflow_improvement"],
      captureFamilies: [
        "response_style",
        "project_fact",
        "recurring_procedure",
        "workflow_improvement",
        "project_rule",
        "unmet_need",
      ],
    });
  });

  it("renders only the guidance groups enabled by the current durable-memory surfaces", () => {
    const profile = buildDurableMemoryBehaviorProfile({
      availableTools: new Set(["memory_object_search_basic", "memory_session_get"]),
    });

    expect(profile).not.toBeNull();
    if (!profile) {
      throw new Error("expected durable memory profile");
    }

    const lines = renderDurableMemoryBehaviorProfile(profile).join("\n");
    expect(lines).not.toContain("memory_candidate_submit");
    expect(lines).not.toContain("memory_object_search_hybrid with kind=project");
    expect(lines).toContain("memory_session_get and memory_session_update");
    expect(lines).toContain("Before claiming durable long-term memory");
  });
});
