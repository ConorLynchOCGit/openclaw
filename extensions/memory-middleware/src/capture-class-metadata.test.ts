import { describe, expect, it } from "vitest";
import { getCanonicalCaptureMetadataByCaptureClass } from "./capture-class-metadata.js";

describe("capture-class metadata", () => {
  it("returns the internal canonical capture metadata for active workflow capture classes", () => {
    expect(getCanonicalCaptureMetadataByCaptureClass("workflow_generalized_guidance")).toEqual({
      category: "workflow_improvement",
      source: "explicit_workflow_improvement",
      subjectKeyMetadata: "subject_key",
    });
    expect(getCanonicalCaptureMetadataByCaptureClass("project_rule_guidance")).toEqual({
      category: "project_rule",
      source: "explicit_project_rule",
      subjectKeyMetadata: "subject_key",
    });
  });

  it("returns null for unsupported capture classes", () => {
    expect(getCanonicalCaptureMetadataByCaptureClass("explicit_requirement")).toBeNull();
  });
});
