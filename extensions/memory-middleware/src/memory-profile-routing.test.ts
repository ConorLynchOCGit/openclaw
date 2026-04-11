import { describe, expect, it } from "vitest";
import {
  matchesSubmissionRoutingTarget,
  readSubmissionCaptureCategory,
  readSubmissionProfileId,
  readWorkflowSubmissionCaptureCategory,
  resolveWorkflowCaptureCategoryFromCaptureClass,
  resolveWorkflowReviewModeFromCaptureClass,
} from "./memory-profile-routing.js";

describe("memory-profile-routing", () => {
  it("resolves canonical candidate metadata to the owning profile", () => {
    const metadata = {
      canonicalIngestionCandidate: {
        record: {
          kind: "feedback",
          subject: "docs localization changes",
          statement: "update english docs first",
          tags: ["project_rule", "rule", "feedback"],
          facets: {},
          provenance: {},
          compatibility: {
            captureCategory: "project_rule",
          },
        },
        identity: {
          dedupeKey: "workflow-1",
        },
        capture: {
          mode: "ordinary_turn",
        },
        compatibility: {
          captureClass: "project_rule_guidance",
          metadata: {
            lessonFamily: "generalized_project_rule",
          },
        },
      },
    };

    expect(readSubmissionProfileId(metadata)).toBe("project_rule");
    expect(readSubmissionCaptureCategory(metadata)).toBe("project_rule");
    expect(readWorkflowSubmissionCaptureCategory(metadata)).toBe("project_rule");
    expect(matchesSubmissionRoutingTarget(metadata, "project_rule")).toBe(true);
    expect(matchesSubmissionRoutingTarget(metadata, "workflow_improvement")).toBe(false);
  });

  it("falls back to legacy autoCapture hints when canonical candidate metadata is absent", () => {
    const metadata = {
      autoCapture: {
        captureClass: "workflow_generalized_guidance",
        lessonFamily: "generalized_workflow_lesson",
        template: "workflow_generalized_guidance",
      },
    };

    expect(readSubmissionProfileId(metadata)).toBe("workflow_improvement");
    expect(readSubmissionCaptureCategory(metadata)).toBe("workflow_improvement");
    expect(readWorkflowSubmissionCaptureCategory(metadata)).toBe("workflow_improvement");
  });

  it("keeps response-style legacy hints routed to the user-style profile", () => {
    const metadata = {
      autoCapture: {
        captureClass: "explicit_requirement",
        template: "responses_concise",
      },
    };

    expect(readSubmissionProfileId(metadata)).toBe("response_style");
    expect(matchesSubmissionRoutingTarget(metadata, "response_style")).toBe(true);
  });

  it("derives workflow category and review mode from the capture class once", () => {
    expect(resolveWorkflowCaptureCategoryFromCaptureClass("project_rule_guidance")).toBe(
      "project_rule",
    );
    expect(resolveWorkflowCaptureCategoryFromCaptureClass("unmet_need_recommendation")).toBe(
      "unmet_need",
    );
    expect(resolveWorkflowCaptureCategoryFromCaptureClass("workflow_generalized_guidance")).toBe(
      "workflow_improvement",
    );
    expect(resolveWorkflowReviewModeFromCaptureClass("project_rule_guidance")).toBe(
      "hold_for_more_evidence",
    );
    expect(resolveWorkflowReviewModeFromCaptureClass("workflow_generalized_guidance")).toBe(
      "hold_for_more_evidence",
    );
    expect(resolveWorkflowReviewModeFromCaptureClass("workflow_tool_gotcha")).toBe(
      "pending_confirmation",
    );
  });
});
