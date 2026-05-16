import { describe, expect, it } from "vitest";
import { AGENT_TEAM_JOB_TYPE } from "../codex-bridge/agent-team-runtime-evidence.ts";
import { agentTeamCodingWorkflowContract } from "./agent-team-coding-workflow.ts";
import {
  createChildWorkflowRequest,
  validateChildWorkflowRequest,
} from "./child-workflow-handoff.ts";
import {
  createWorkflowContractRouterSummary,
  validateExecutionWorkflowContract,
} from "./workflow-contract.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
  validateWorkflowRegistry,
} from "./workflow-registry.ts";

describe("workflow registry", () => {
  it("registers agent_team.coding as a generic workflow contract", () => {
    const workflow = getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.coding");
    expect(workflow?.jobType).toBe(AGENT_TEAM_JOB_TYPE);
    expect(workflow?.workQueueProjection.lifecycleMutationAllowed).toBe(false);
    expect(workflow?.roles.some((role) => role.roleId === "test_engineer")).toBe(true);
    expect(workflow?.permissionModel).toMatchObject({
      permissionModelId: "permission-model://agent_team.coding/local-repo-latitude.v1",
    });
    expect(JSON.stringify(workflow)).toContain("deepseek-v4-pro-test-engineer-only");
  });

  it("registers web research, architecture, docs, QA, and Skillifier workflow contracts", () => {
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "single_agent.web_research"),
    ).toMatchObject({
      jobType: "executor.single_agent",
      defaultAuthorityProfile: "outbound_readonly",
      storagePolicy: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
      },
      productionSideEffectPolicy: {
        externalOutboundWriteAllowed: false,
        productionDeployAllowed: false,
        productionModelPromotionAllowed: false,
      },
      workQueueProjection: {
        lifecycleMutationAllowed: false,
      },
    });
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.architecture"),
    ).toMatchObject({
      jobType: AGENT_TEAM_JOB_TYPE,
      defaultAuthorityProfile: "read_only",
    });
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "workflow.docs_skills"),
    ).toMatchObject({
      jobType: "executor.workflow",
    });
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.qa_test"),
    ).toMatchObject({
      jobType: AGENT_TEAM_JOB_TYPE,
      defaultAuthorityProfile: "local_yolo",
      workQueueProjection: {
        lifecycleMutationAllowed: false,
      },
      storagePolicy: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
      },
    });
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "workflow.skillifier"),
    ).toMatchObject({
      jobType: "executor.skillifier",
      defaultAuthorityProfile: "local_yolo",
      workQueueProjection: {
        lifecycleMutationAllowed: false,
      },
      productionSideEffectPolicy: {
        externalOutboundWriteAllowed: false,
        productionDeployAllowed: false,
        productionModelPromotionAllowed: false,
      },
    });
    expect(
      getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.product_spec_planning"),
    ).toMatchObject({
      jobType: "executor.workflow",
      defaultAuthorityProfile: "read_only",
      workQueueProjection: {
        lifecycleMutationAllowed: false,
      },
      productionSideEffectPolicy: {
        externalOutboundWriteAllowed: false,
        productionDeployAllowed: false,
        productionModelPromotionAllowed: false,
      },
    });
    expect(validateWorkflowRegistry(DEFAULT_EXECUTION_WORKFLOW_REGISTRY)).toEqual({
      valid: true,
      reasonCodes: [],
    });
  });

  it("validates child workflow handoffs without authority escalation or raw storage", () => {
    const request = createChildWorkflowRequest({
      parentWorkflowId: "agent_team.coding",
      childWorkflowId: "single_agent.web_research",
      parentRuntimeJobId: "parent-job",
      requestReason: "current docs required before implementation",
      requestedInputs: { querySummary: "current docs" },
      parentAuthorityProfile: "local_yolo",
      childRequestedAuthorityProfile: "outbound_readonly",
      optional: false,
    });
    expect(
      validateChildWorkflowRequest({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        request,
      }),
    ).toMatchObject({
      accepted: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(
      validateChildWorkflowRequest({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        request: {
          ...request,
          authorityBoundary: {
            ...request.authorityBoundary,
            authorityEscalationAllowed: true as false,
          },
        },
      }).accepted,
    ).toBe(false);
  });

  it("validates contract storage and production side-effect boundaries", () => {
    const validation = validateExecutionWorkflowContract(agentTeamCodingWorkflowContract);
    expect(validation).toEqual({ valid: true, reasonCodes: [] });
    expect(agentTeamCodingWorkflowContract.storagePolicy.rawPromptStored).toBe(false);
    expect(agentTeamCodingWorkflowContract.storagePolicy.rawResponseStored).toBe(false);
    expect(agentTeamCodingWorkflowContract.productionSideEffectPolicy.productionDeployAllowed).toBe(
      false,
    );
  });

  it("rejects duplicate workflow ids", () => {
    const validation = validateWorkflowRegistry({
      artifactKind: "execution_workflow_registry",
      workflows: [agentTeamCodingWorkflowContract, agentTeamCodingWorkflowContract],
    });
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("duplicate_workflow_id:agent_team.coding");
  });

  it("exposes bounded router summaries without lifecycle authority", () => {
    const summary = createWorkflowContractRouterSummary(agentTeamCodingWorkflowContract);
    expect(summary.workflowId).toBe("agent_team.coding");
    expect(summary.examples.length).toBeGreaterThan(0);
    expect(summary.permissionModelId).toBe(
      "permission-model://agent_team.coding/local-repo-latitude.v1",
    );
    expect(JSON.stringify(summary)).not.toContain("secret");
  });
});
