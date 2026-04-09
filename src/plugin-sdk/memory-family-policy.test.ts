import { describe, expect, it } from "vitest";
import {
  buildCanonicalMemoryRecordForFamily,
  getMemoryCorrectionPolicyView,
  getMemoryFamilyDefinition,
  getMemoryFamilyCanonicalProjection,
  getMemoryFamilyIdByWorkflowLessonFamily,
  getMemoryLifecyclePolicyView,
  getMemoryProofDefinition,
  getMemoryRetrievalPolicyView,
  getMemorySemanticRoutingPolicyView,
  getPhrasePatternProofFamilyId,
  listApprovedMemoryRetrievalPolicyViews,
  memoryFamilyProjectsToDerivedView,
  supportsMemoryFamilyReviewedPhrasePatterns,
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
    expect(supportsMemoryFamilyReviewedPhrasePatterns("workflow_improvement")).toBe(true);
    expect(getMemoryProofDefinition("workflow_phrase_pattern")).toMatchObject({
      artifactMode: "phrase_pattern",
      inspectionMode: "workflow_phrase_pattern_lifecycle",
    });
    expect(getMemoryLifecyclePolicyView("project_fact")).toMatchObject({
      pendingCandidateStates: ["pending_confirmation", "hold_for_more_evidence"],
      staleWindowDays: 3,
    });
    expect(getMemoryCorrectionPolicyView("project_fact")).toMatchObject({
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    });
    expect(getMemoryRetrievalPolicyView("project_rule")).toMatchObject({
      directIntentClass: "rule",
      matchedFieldPrefix: "project_rule",
    });
    expect(getMemorySemanticRoutingPolicyView("recurring_procedure")).toEqual({
      mode: "validated_procedure_only",
    });
    expect(listApprovedMemoryRetrievalPolicyViews().map((definition) => definition.id)).toEqual([
      "response_style",
      "project_fact",
      "workflow_improvement",
      "project_rule",
      "unmet_need",
    ]);
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
    const record = buildCanonicalMemoryRecordForFamily({
      familyId: "project_rule",
      subject: "docs wording",
      statement: "keep the wording plugin, not extension",
      projectId: "atlas-forge",
      validationStatus: "approved",
      facets: {
        lessonKey: "plugin_not_extension",
        guidancePattern: "terminology",
      },
    });

    expect(record).toMatchObject({
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
        captureCategory: "project_rule",
        captureSource: "explicit_project_rule",
      },
    });
    expect(record.compatibility).not.toHaveProperty("typedFastPaths");
    expect(record.compatibility).not.toHaveProperty("workflowLessonFamilies");
  });
});
