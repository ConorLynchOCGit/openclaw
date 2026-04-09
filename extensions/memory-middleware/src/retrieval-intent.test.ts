import { describe, expect, it } from "vitest";
import {
  buildCanonicalMemoryRetrievalPlan,
  inferGeneralizedWorkflowGuidancePatternHint,
  inferProjectMemoryIntentFamily,
  inferRecurringProcedureQueryHint,
  inferResponseStyleQueryHint,
  inferWorkflowImprovementQueryHint,
  normalizeRetrievalQuery,
  resolveProjectMemoryIntentFamilyFromCanonicalPlan,
  resolveRecurringProcedureQueryHintFromCanonicalPlan,
  resolveWorkflowImprovementQueryHintFromCanonicalPlan,
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
    expect(inferProjectMemoryIntentFamily("What's the docs i18n rule again?")).toBe("project_rule");
    expect(inferProjectMemoryIntentFamily("Where are the OpenClaw docs hosted?")).toBe(
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
    expect(
      inferResponseStyleQueryHint("When you cite files for me, what path style should you use?"),
    ).toEqual({
      template: "response_style_generalized_guidance",
      normalizedSubject: "file references",
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
      captureClass: "workflow_tool_gotcha",
    });
  });

  it("builds canonical retrieval plans from current project lookup hints", () => {
    const plan = buildCanonicalMemoryRetrievalPlan({
      input: {
        query: "What is the Atlas staging branch?",
        kind: "project",
        scope: "approved_only",
      },
    });

    expect(plan).toMatchObject({
      query: {
        normalizedQuery: "what is the atlas staging branch?",
        requestedKinds: ["project", "feedback", "reference"],
        derivedViews: ["project_fact"],
        facetFilters: expect.arrayContaining([
          expect.objectContaining({
            key: "fieldKey",
            operator: "equals",
            value: "staging_branch",
          }),
        ]),
      },
      ranking: {
        preferValidationStatuses: ["validated", "approved"],
      },
    });
  });

  it("derives operative retrieval hints back from canonical plans", () => {
    const workflowPlan = buildCanonicalMemoryRetrievalPlan({
      input: {
        query: "should I use scripts/committer instead of git add here",
        kind: "project",
        scope: "approved_only",
      },
    });
    expect(resolveWorkflowImprovementQueryHintFromCanonicalPlan(workflowPlan)).toEqual({
      captureClass: "workflow_tool_gotcha",
    });

    const procedurePlan = buildCanonicalMemoryRetrievalPlan({
      input: {
        query: "deploy checklist",
        kind: "procedure",
        scope: "include_validated_procedures",
      },
    });
    expect(resolveRecurringProcedureQueryHintFromCanonicalPlan(procedurePlan)).toEqual({
      procedureKey: "deploy_checklist",
    });

    const projectPlan = buildCanonicalMemoryRetrievalPlan({
      input: {
        query: "where are the OpenClaw docs hosted?",
        kind: "project",
        scope: "approved_only",
      },
    });
    expect(resolveProjectMemoryIntentFamilyFromCanonicalPlan(projectPlan)).toBe("project_fact");
  });
});
