import { describe, expect, it } from "vitest";
import {
  inferGeneralizedWorkflowGuidancePatternHint,
  inferProjectMemoryIntentFamily,
  inferRecurringProcedureQueryHint,
  inferResponseStyleQueryHint,
  inferWorkflowImprovementQueryHint,
  normalizeRetrievalQuery,
} from "./retrieval-intent.js";

describe("retrieval intent helpers", () => {
  it("normalizes retrieval query text for downstream hinting", () => {
    expect(normalizeRetrievalQuery("  What   should   I   trust here?  ")).toBe(
      "what should i trust here?",
    );
  });

  it("classifies direct project intent families from the query", () => {
    expect(inferProjectMemoryIntentFamily("What are we still missing for Atlas rollout?")).toBe(
      "unmet_need",
    );
    expect(inferProjectMemoryIntentFamily("Which source should we trust for Atlas deploys?")).toBe(
      "project_rule",
    );
    expect(inferProjectMemoryIntentFamily("What is the Atlas staging branch?")).toBe(
      "project_fact",
    );
  });

  it("recognizes response-style retrieval hints", () => {
    expect(inferResponseStyleQueryHint("Please use plain English")).toEqual({
      template: "responses_plain_english",
    });
    expect(inferResponseStyleQueryHint("keep it concise")).toEqual({
      template: "responses_concise",
    });
  });

  it("extracts recurring procedure hints for both supported keys and generic subjects", () => {
    expect(inferRecurringProcedureQueryHint("deploy checklist")).toEqual({
      procedureKey: "deploy_checklist",
    });
    expect(inferRecurringProcedureQueryHint("our release manager handoff playbook")).toEqual({
      normalizedSubject: "release manager handoff playbook",
    });
  });

  it("classifies generalized workflow guidance patterns and lesson keys", () => {
    expect(
      inferGeneralizedWorkflowGuidancePatternHint("Which signal should I trust for releases?"),
    ).toBe("trust_for_scope");
    expect(
      inferWorkflowImprovementQueryHint("Should I use scripts/committer instead of git add?"),
    ).toEqual({
      lessonKey: "scripts_committer_required",
    });
  });
});
