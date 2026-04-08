import { describe, expect, it } from "vitest";
import {
  getCaptureMetadataByCaptureClass,
  getCaptureMetadataByWorkflowLessonFamily,
  getMemoryFamilyDefinition,
  getMemoryFamilyDefinitionByCaptureClass,
  getMemoryProofDefinition,
  isMemoryProofFamily,
  isMemoryProofInspectableFamily,
  listMemoryFamilyDefinitions,
} from "./memory-family-registry.js";

describe("memory-family-registry", () => {
  it("lists the six landed family definitions", () => {
    expect(listMemoryFamilyDefinitions().map((definition) => definition.id)).toEqual([
      "response_style",
      "project_fact",
      "recurring_procedure",
      "workflow_improvement",
      "project_rule",
      "unmet_need",
    ]);
  });

  it("exposes proof inspection policy for each landed family", () => {
    expect(getMemoryFamilyDefinition("response_style").proofPolicy.inspectionMode).toBe(
      "response_style_lifecycle",
    );
    expect(getMemoryFamilyDefinition("project_fact").proofPolicy.inspectionMode).toBe(
      "project_fact_lifecycle",
    );
    expect(getMemoryFamilyDefinition("project_rule").proofPolicy.inspectionMode).toBe(
      "workflow_improvement_lifecycle",
    );
  });

  it("maps capture classes onto shared family metadata", () => {
    expect(getMemoryFamilyDefinitionByCaptureClass("project_rule_guidance")?.id).toBe(
      "project_rule",
    );
    expect(getCaptureMetadataByCaptureClass("unmet_need_recommendation")).toEqual({
      category: "unmet_need",
      source: "explicit_unmet_need",
      subjectKeyMetadata: "subject_key",
    });
  });

  it("maps workflow lesson families onto explicit metadata categories", () => {
    expect(getCaptureMetadataByWorkflowLessonFamily("generalized_project_rule")).toEqual({
      category: "project_rule",
      source: "explicit_project_rule",
      subjectKeyMetadata: "subject_key",
    });
    expect(getCaptureMetadataByWorkflowLessonFamily("generalized_unmet_need")).toEqual({
      category: "unmet_need",
      source: "explicit_unmet_need",
      subjectKeyMetadata: "subject_key",
    });
    expect(getCaptureMetadataByWorkflowLessonFamily("generalized_workflow_lesson")).toEqual({
      category: "workflow_improvement",
      source: "explicit_workflow_improvement",
      subjectKeyMetadata: "subject_key",
    });
  });

  it("recognizes proof-inspectable families and excludes phrase artifacts", () => {
    expect(isMemoryProofInspectableFamily("workflow_improvement")).toBe(true);
    expect(isMemoryProofInspectableFamily("workflow_phrase_pattern")).toBe(false);
  });

  it("exposes registry-driven proof definitions for lifecycle and phrase artifacts", () => {
    expect(isMemoryProofFamily("workflow_phrase_pattern")).toBe(true);
    expect(getMemoryProofDefinition("project_rule")).toMatchObject({
      inspectionMode: "workflow_improvement_lifecycle",
      artifactMode: "approved_memory_object",
    });
    expect(getMemoryProofDefinition("workflow_phrase_pattern")).toMatchObject({
      inspectionMode: "workflow_phrase_pattern_lifecycle",
      artifactMode: "phrase_pattern",
    });
    expect(getMemoryProofDefinition("recurring_procedure")).toMatchObject({
      inspectionMode: "recurring_procedure_lifecycle",
      artifactMode: "validated_procedure",
    });
  });

  it("encodes shared retrieval feature policy in the family registry", () => {
    expect(getMemoryFamilyDefinition("project_fact").retrievalPolicy).toMatchObject({
      directIntentClass: "fact",
      matchedFieldPrefix: "project_fact",
      featureWeights: expect.objectContaining({
        family_intent_match: 90,
        project_scope_match: 205,
        subject_match: 180,
      }),
    });
    expect(getMemoryFamilyDefinition("workflow_improvement").retrievalPolicy).toMatchObject({
      matchedFieldPrefix: "generalized",
      featureWeights: expect.objectContaining({
        subject_match: 170,
        recommended_action_match: 95,
        avoid_action_match: 90,
      }),
    });
  });

  it("encodes declarative correction targets in the family registry", () => {
    expect(getMemoryFamilyDefinition("response_style").correctionPolicy).toMatchObject({
      mode: "approved_memory_object_supersede_when_targeted",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    });
    expect(getMemoryFamilyDefinition("recurring_procedure").correctionPolicy).toMatchObject({
      mode: "validated_procedure_supersede_when_targeted",
      targetKind: "validated_procedure",
      requiresExistingTarget: false,
    });
    expect(getMemoryFamilyDefinition("unmet_need").correctionPolicy).toMatchObject({
      mode: "held_correction",
      targetKind: "approved_memory_object",
      requiresExistingTarget: true,
    });
  });
});
