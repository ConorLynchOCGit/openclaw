import { describe, expect, it } from "vitest";
import {
  getMemoryFamilyDefinition,
  getMemoryFamilyIdByWorkflowLessonFamily,
  getMemoryProofDefinition,
  getPhrasePatternProofFamilyId,
} from "./memory-family-policy.js";

describe("memory-family-policy", () => {
  it("exposes shared family policy directly from the plugin SDK surface", () => {
    expect(getMemoryFamilyDefinition("project_fact")).toMatchObject({
      applicationPolicy: {
        mode: "direct_answer",
        promptSection: "project",
      },
      retrievalPolicy: {
        mode: "approved_hybrid",
        matchedFieldPrefix: "project_fact",
      },
    });
    expect(getMemoryFamilyIdByWorkflowLessonFamily("generalized_unmet_need")).toBe("unmet_need");
    expect(getPhrasePatternProofFamilyId("response_style")).toBe("response_style_phrase_pattern");
    expect(getMemoryProofDefinition("workflow_phrase_pattern")).toMatchObject({
      artifactMode: "phrase_pattern",
      inspectionMode: "workflow_phrase_pattern_lifecycle",
    });
  });
});
