import { describe, expect, it } from "vitest";
import {
  buildDurableMemoryApplicationSelection,
  buildDurableMemoryBehaviorProfile,
  buildDurableMemoryApplicationSelectionFromProfile,
  renderDurableMemoryApplicationSelection,
  resolveDurableMemoryGuidancePlan,
} from "./behavior-profile.js";

describe("behavior profile guidance plan", () => {
  it("derives family guidance groups from the currently available tool surfaces", () => {
    expect(
      resolveDurableMemoryGuidancePlan({
        hasCandidateSubmit: true,
        hasLearnedGuidancePlan: false,
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
      hasLearnedGuidanceSurface: false,
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

    const lines = renderDurableMemoryApplicationSelection(
      buildDurableMemoryApplicationSelectionFromProfile(profile),
    ).join("\n");
    expect(lines).not.toContain("memory_candidate_submit");
    expect(lines).not.toContain("Workflow guidance:");
    expect(lines).toContain("memory_session_get and memory_session_update");
    expect(lines).toContain(
      "Use approved durable memory only when it can materially change the answer.",
    );
  });

  it("builds a structured application selection with selected and suppressed guidance kinds", () => {
    const selection = buildDurableMemoryApplicationSelection({
      availableTools: new Set(["memory_object_search_basic", "memory_session_get"]),
    });

    expect(selection).not.toBeNull();
    if (!selection) {
      throw new Error("expected durable memory application selection");
    }

    expect(selection.queryIntent).toEqual({
      kind: "tool_surface_guidance",
      hasObjectSurface: true,
      hasCandidateSurface: false,
      hasLearnedGuidanceSurface: false,
      hasSessionSurface: true,
    });
    expect(selection.selectedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          familyId: "workflow_improvement",
          applicationMode: "guidance_only",
          selectedGuidanceKinds: ["application"],
        }),
        expect.objectContaining({
          familyId: "recurring_procedure",
          applicationMode: "suggestion_first",
          selectedGuidanceKinds: ["application"],
          directUseOnlyOnClearAsk: true,
        }),
      ]),
    );
    expect(selection.suppressedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          familyId: "response_style",
          suppressedGuidanceKinds: expect.arrayContaining(["search", "application", "capture"]),
        }),
        expect.objectContaining({
          familyId: "project_fact",
          suppressedGuidanceKinds: expect.arrayContaining(["search", "application", "capture"]),
        }),
      ]),
    );
  });

  it("renders durable-memory guidance from the structured application selection", () => {
    const profile = buildDurableMemoryBehaviorProfile({
      availableTools: new Set([
        "memory_candidate_submit",
        "memory_learned_guidance_plan",
        "memory_object_search_hybrid",
        "memory_session_update",
      ]),
    });

    expect(profile).not.toBeNull();
    if (!profile) {
      throw new Error("expected durable memory profile");
    }

    const selection = buildDurableMemoryApplicationSelectionFromProfile(profile);
    const lines = renderDurableMemoryApplicationSelection(selection).join("\n");
    expect(lines).toContain("Behavior memory:");
    expect(lines).toContain("Project memory:");
    expect(lines).toContain("Workflow guidance:");
    expect(lines).toContain("memory_learned_guidance_plan");
    expect(lines).toContain("Procedure memory:");
    expect(lines).toContain("Use memory_candidate_submit for bounded durable items");
    expect(lines).toContain("memory_session_get and memory_session_update");
    expect(lines.split("\n").length).toBeLessThan(13);
  });
});
