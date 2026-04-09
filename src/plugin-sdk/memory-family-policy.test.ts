import { describe, expect, it } from "vitest";
import {
  buildCanonicalMemoryRecordForFamily,
  getMemoryFamilyDefinition,
  getMemoryFamilyCanonicalProjection,
  getMemoryFamilyIdByWorkflowLessonFamily,
  getMemoryProofDefinition,
  getPhrasePatternProofFamilyId,
  memoryFamilyProjectsToDerivedView,
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

  it("maps current memory families onto canonical kinds and derived views", () => {
    expect(getMemoryFamilyCanonicalProjection("response_style")).toEqual({
      kind: "user",
      defaultTags: ["response_style", "preference", "user"],
      defaultFacets: {
        response_style: true,
        preference: true,
      },
      derivedViews: ["response_style"],
      compatibilityStatus: "transitional_family_adapter",
    });
    expect(getMemoryFamilyCanonicalProjection("workflow_improvement")).toMatchObject({
      kind: "feedback",
      derivedViews: ["workflow_guidance", "learned_guidance"],
    });
    expect(getMemoryFamilyCanonicalProjection("unmet_need")).toMatchObject({
      kind: "project",
      defaultFacets: {
        open_need: true,
        project_scope: true,
      },
    });
    expect(memoryFamilyProjectsToDerivedView("workflow_improvement", "learned_guidance")).toBe(
      true,
    );
  });

  it("builds canonical records for current family-owned surfaces through the compatibility seam", () => {
    expect(
      buildCanonicalMemoryRecordForFamily({
        familyId: "project_rule",
        subject: "docs wording",
        statement: "keep the wording plugin, not extension",
        projectId: "atlas-forge",
        validationStatus: "approved",
        facets: {
          lessonKey: "plugin_not_extension",
          guidancePattern: "terminology",
        },
      }),
    ).toMatchObject({
      kind: "feedback",
      subject: "docs wording",
      statement: "keep the wording plugin, not extension",
      scope: {
        kind: "project",
        projectId: "atlas-forge",
      },
      validationStatus: "approved",
      tags: expect.arrayContaining(["project_rule", "rule", "feedback"]),
      facets: {
        project_rule: true,
        rule: true,
        lessonKey: "plugin_not_extension",
        guidancePattern: "terminology",
      },
      applicability: {
        promptSections: ["project"],
        directIntentClasses: ["rule"],
      },
      compatibility: {
        transitionalFamilyId: "project_rule",
        captureCategory: "project_rule",
        captureSource: "explicit_project_rule",
      },
    });
  });
});
