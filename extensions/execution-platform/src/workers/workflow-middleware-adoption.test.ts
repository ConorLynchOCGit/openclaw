import { describe, expect, it } from "vitest";
import {
  CURRENT_WORKFLOW_MIDDLEWARE_REQUIREMENTS,
  evaluateCurrentWorkflowMiddlewareAdoption,
  evaluateWorkflowMiddlewareAdoption,
  type WorkflowMiddlewareAdoptionInput,
} from "./workflow-middleware-adoption.ts";

function evidence(
  overrides: Partial<WorkflowMiddlewareAdoptionInput> = {},
): WorkflowMiddlewareAdoptionInput {
  return {
    workflowId: "agent_team.coding",
    runtimeJobId: "runtime-job-1",
    runtimeState: "succeeded",
    modelTaskRefs: ["runtime-job://runtime-job-1/model-task/validation"],
    scriptJobRefs: ["runtime-job://runtime-job-1/script-job/proof"],
    dbOperationRefs: [],
    artifactRefs: ["runtime-job://runtime-job-1/artifact"],
    reasonCodes: [],
    directModelCallRefs: [],
    directScriptCallRefs: [],
    directDbCallRefs: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}

describe("workflow middleware adoption", () => {
  it("passes when required middleware evidence is present", () => {
    const result = evaluateWorkflowMiddlewareAdoption({
      requirement: {
        workflowId: "agent_team.coding",
        requiredMiddlewareKinds: ["model_task", "script_job"],
      },
      evidence: evidence(),
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "passed",
      observedMiddlewareKinds: ["model_task", "script_job"],
      missingMiddlewareKinds: [],
    });
  });

  it("requires missing middleware evidence to become needs_review, not success", () => {
    const result = evaluateWorkflowMiddlewareAdoption({
      requirement: {
        workflowId: "agent_team.qa_test",
        requiredMiddlewareKinds: ["model_task", "script_job"],
      },
      evidence: evidence({ workflowId: "agent_team.qa_test", scriptJobRefs: [] }),
    });

    expect(result).toMatchObject({
      accepted: false,
      status: "needs_review",
      missingMiddlewareKinds: ["script_job"],
    });
    expect(result.reasonCodes).toContain("required_middleware_missing:script_job");
  });

  it("blocks unapproved direct model/script/DB bypass evidence", () => {
    const result = evaluateWorkflowMiddlewareAdoption({
      requirement: {
        workflowId: "single_agent.web_research",
        requiredMiddlewareKinds: ["model_task"],
      },
      evidence: evidence({
        workflowId: "single_agent.web_research",
        scriptJobRefs: [],
        directModelCallRefs: ["direct://legacy-model-run"],
      }),
    });

    expect(result).toMatchObject({
      accepted: false,
      status: "blocked",
      directBypassDetected: true,
    });
    expect(result.reasonCodes).toContain("unapproved_direct_middleware_bypass_detected");
  });

  it("accepts research-to-coding handoff when middleware evidence is validation-only model-task proof", () => {
    const validationEvidenceRef =
      "runtime-job://slice-26-workflow-research-to-coding-handoff-model-fda5bc9554/model-task/validation";
    const result = evaluateWorkflowMiddlewareAdoption({
      requirement: {
        workflowId: "workflow.research_to_coding_handoff",
        requiredMiddlewareKinds: ["model_task"],
      },
      evidence: evidence({
        workflowId: "workflow.research_to_coding_handoff",
        scriptJobRefs: [],
        artifactRefs: [],
        modelTaskRefs: [validationEvidenceRef],
      }),
    });

    expect(result).toMatchObject({
      accepted: true,
      status: "passed",
      observedMiddlewareKinds: ["model_task"],
      missingMiddlewareKinds: [],
      runtimeJobId: "runtime-job-1",
    });
    expect(result.reasonCodes).toEqual(["workflow_middleware_adoption_passed"]);
    expect(result.runtimeJobId).toBe("runtime-job-1");
  });

  it("evaluates the current workflow surface", () => {
    const allEvidence = CURRENT_WORKFLOW_MIDDLEWARE_REQUIREMENTS.map((requirement) =>
      evidence({
        workflowId: requirement.workflowId,
        modelTaskRefs: requirement.requiredMiddlewareKinds.includes("model_task")
          ? [`runtime-job://${requirement.workflowId}/model-task`]
          : [],
        scriptJobRefs: requirement.requiredMiddlewareKinds.includes("script_job")
          ? [`runtime-job://${requirement.workflowId}/script-job`]
          : [],
        dbOperationRefs: requirement.requiredMiddlewareKinds.includes("db_operation")
          ? [`runtime-job://${requirement.workflowId}/db-operation`]
          : [],
      }),
    );

    expect(evaluateCurrentWorkflowMiddlewareAdoption(allEvidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workflowId: "agent_team.coding", accepted: true }),
        expect.objectContaining({ workflowId: "single_agent.web_research", accepted: true }),
        expect.objectContaining({
          workflowId: "workflow.research_to_coding_handoff",
          accepted: true,
        }),
        expect.objectContaining({ workflowId: "workflow.docs_skills", accepted: true }),
        expect.objectContaining({ workflowId: "agent_team.qa_test", accepted: true }),
        expect.objectContaining({ workflowId: "agent_team.architecture", accepted: true }),
      ]),
    );
  });
});
