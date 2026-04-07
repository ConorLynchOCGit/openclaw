import { describe, expect, it } from "vitest";
import {
  getCaptureMetadataByCaptureClass,
  getCaptureMetadataByWorkflowLessonFamily,
  getMemoryFamilyDefinition,
  getMemoryFamilyDefinitionByCaptureClass,
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
});
