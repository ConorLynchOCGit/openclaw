import { describe, expect, it } from "vitest";
import type { ExecutionWorkflowContract } from "../workflows/workflow-contract.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import { compileChildWorkflowHandoff } from "./child-workflow-handoff-compiler.ts";
import type { CanonicalChildWorkflowRequest } from "./router-schema.ts";

const coding = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows.find(
  (workflow) => workflow.workflowId === "agent_team.coding",
)!;
const architecture = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows.find(
  (workflow) => workflow.workflowId === "agent_team.architecture",
)!;
const docs = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows.find(
  (workflow) => workflow.workflowId === "workflow.docs_skills",
)!;
const research = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows.find(
  (workflow) => workflow.workflowId === "single_agent.web_research",
)!;

function childRequest(
  overrides: Partial<CanonicalChildWorkflowRequest> = {},
): CanonicalChildWorkflowRequest {
  return {
    childWorkflowId: "single_agent.web_research",
    requirement: "mandatory",
    reasonCodes: ["current_fact_research_required"],
    requestedAuthority: "outbound_readonly",
    boundedInputSummary: "Research current docs with citations only.",
    rawPromptStored: false,
    rawResponseStored: false,
    ...overrides,
  };
}

describe("Child workflow handoff compiler", () => {
  it("compiles coding and architecture parent research child handoffs when contracts allow", () => {
    for (const parentWorkflow of [coding, architecture]) {
      const result = compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow,
        request: childRequest(),
        parentRuntimeJobId: "runtime-job-parent",
        parentAuthorityProfile: parentWorkflow.defaultAuthorityProfile,
      });

      expect(result).toMatchObject({
        validationStatus: "accepted",
        childWorkflowId: "single_agent.web_research",
        authorityGranted: false,
        runtimeJobCreated: false,
        workQueueLifecycleMutationAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(result.request?.authorityBoundary).toMatchObject({
        authorityEscalationAllowed: false,
      });
    }
  });

  it("compiles docs child when a parent contract explicitly allows that child", () => {
    const parentWithDocsChild: ExecutionWorkflowContract = {
      ...architecture,
      childWorkflowRefs: [
        ...(architecture.childWorkflowRefs ?? []),
        {
          workflowId: "workflow.docs_skills",
          allowed: true,
          requiredByDefault: false,
          requestPolicyRef: "docs-child-handoff.v1",
        },
      ],
    };
    const registry: WorkflowRegistry = {
      artifactKind: "execution_workflow_registry",
      workflows: [parentWithDocsChild, docs, research, coding],
    };

    expect(
      compileChildWorkflowHandoff({
        registry,
        parentWorkflow: parentWithDocsChild,
        request: childRequest({
          childWorkflowId: "workflow.docs_skills",
          requirement: "optional",
          requestedAuthority: "read_only",
          boundedInputSummary: "Prepare bounded docs artifact refs.",
        }),
        parentAuthorityProfile: "read_only",
        optionalFailureAllowed: true,
      }),
    ).toMatchObject({
      validationStatus: "accepted",
      childWorkflowId: "workflow.docs_skills",
      failureBehavior: "continue_if_optional_allowed",
    });
  });

  it("prevents parent from granting child production deploy, outbound write, or model-promotion authority", () => {
    for (const requestedAuthority of [
      "production_deploy",
      "external_outbound_write",
      "production_model_promotion",
    ]) {
      const result = compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: childRequest({ requestedAuthority }),
        parentAuthorityProfile: "local_yolo",
      });
      expect(result.reasonCodes).toContain("parent_cannot_grant_child_high_risk_authority");
      expect(result.validationStatus).toBe("needs_review");
      expect(result.authorityGranted).toBe(false);
    }
  });

  it("blocks or marks needs-review for missing, disabled, or not-allowed child workflows", () => {
    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: childRequest({ childWorkflowId: "workflow.missing" }),
        parentAuthorityProfile: "local_yolo",
      }).validationStatus,
    ).toBe("blocked");

    expect(
      compileChildWorkflowHandoff({
        registry: {
          artifactKind: "execution_workflow_registry",
          workflows: [{ ...research, status: "disabled" }, coding],
        },
        parentWorkflow: coding,
        request: childRequest(),
        parentAuthorityProfile: "local_yolo",
      }).reasonCodes,
    ).toContain("child_workflow_not_enabled:disabled");

    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: research,
        request: childRequest({
          childWorkflowId: "agent_team.coding",
          requestedAuthority: "read_only",
        }),
        parentAuthorityProfile: "outbound_readonly",
      }).reasonCodes,
    ).toContain("child_workflow_not_allowed_by_parent_contract");
  });

  it("sets mandatory and optional failure behavior from contract-safe requirements", () => {
    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: childRequest({ requirement: "mandatory" }),
        parentAuthorityProfile: "local_yolo",
      }).failureBehavior,
    ).toBe("block_parent_success");

    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: childRequest({ requirement: "optional" }),
        parentAuthorityProfile: "local_yolo",
        optionalFailureAllowed: true,
      }).failureBehavior,
    ).toBe("continue_if_optional_allowed");
  });

  it("requires bounded child input summary and blocks raw storage flags", () => {
    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: childRequest({ boundedInputSummary: "" }),
        parentAuthorityProfile: "local_yolo",
      }).reasonCodes,
    ).toContain("bounded_child_input_summary_required");

    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: { ...childRequest(), rawResponseStored: true } as never,
        parentAuthorityProfile: "local_yolo",
      }),
    ).toMatchObject({
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });
});
