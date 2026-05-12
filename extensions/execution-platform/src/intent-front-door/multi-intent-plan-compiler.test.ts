import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { compileMultiIntentPlan } from "./multi-intent-plan-compiler.ts";
import { createBaseCanonicalRouterOutput, parseCanonicalRouterOutput } from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
  generatedAt: "2026-05-06T00:00:00.000Z",
});
const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };
const authority = {
  snapshotFresh: true,
  supportedAuthorityProfiles: ["read_only", "local_yolo", "outbound_readonly"],
};

function multiOutput(overrides = {}) {
  return createBaseCanonicalRouterOutput({
    route: "multi_workflow_plan",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    confidence: 0.95,
    objectiveSummary: "Coordinate multiple bounded workflow steps.",
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    multiIntentPlan: [
      {
        order: 1,
        route: "research_only",
        workflowId: "single_agent.web_research",
        objectiveSummary: "Research bounded facts.",
        dependsOnStep: null,
        authorityProfile: "outbound_readonly",
      },
      {
        order: 2,
        route: "workflow_execution",
        workflowId: "agent_team.coding",
        objectiveSummary: "Implement after research.",
        dependsOnStep: 1,
        authorityProfile: "local_yolo",
      },
    ],
    ...overrides,
  });
}

function validation(output = multiOutput()) {
  return validateIntentFrontDoorDecision({
    parseResult: parseCanonicalRouterOutput(output),
    workflowSummaryIndex,
    auth,
    authority,
    strongerRouterResultPresent: true,
  });
}

describe("Multi-intent plan compiler", () => {
  it("compiles ordered research -> coding plan with separate validation requirements", () => {
    const output = multiOutput();
    const result = compileMultiIntentPlan({
      routerOutput: output,
      validation: validation(output),
      workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      authorityProofRefsByStep: {
        1: ["authority://outbound_readonly"],
        2: ["authority://local_yolo"],
      },
    });

    expect(result).toMatchObject({
      outcome: "compiled",
      runtimeJobCreated: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(result.steps.map((step) => step.route)).toEqual(["research_only", "workflow_execution"]);
    expect(result.steps.every((step) => step.separateValidationRequired)).toBe(true);
  });

  it("holds conditional deploy until policy proof exists", () => {
    const output = multiOutput({
      multiIntentPlan: [
        {
          order: 1,
          route: "plan_only",
          workflowId: null,
          objectiveSummary: "Plan the change.",
          dependsOnStep: null,
          authorityProfile: null,
        },
        {
          order: 2,
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          objectiveSummary: "Code and test the change.",
          dependsOnStep: 1,
          authorityProfile: "local_yolo",
        },
        {
          order: 3,
          route: "approval_required",
          workflowId: null,
          objectiveSummary: "Deploy only if policy permits.",
          dependsOnStep: 2,
          authorityProfile: "deploy_dry_run",
        },
      ],
    });
    const result = compileMultiIntentPlan({
      routerOutput: output,
      validation: validation(output),
      workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      authorityProofRefsByStep: { 2: ["authority://local_yolo"] },
    });

    expect(result.outcome).toBe("compiled");
    expect(result.steps[2]).toMatchObject({
      route: "approval_required",
      status: "held_for_policy_proof",
      conditionalPolicyProofRequired: true,
    });
  });

  it("keeps outbound notification separate from coding work", () => {
    const output = multiOutput({
      multiIntentPlan: [
        {
          order: 1,
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          objectiveSummary: "Fix the issue.",
          dependsOnStep: null,
          authorityProfile: "local_yolo",
        },
        {
          order: 2,
          route: "approval_required",
          workflowId: null,
          objectiveSummary: "Notify only through outbound policy.",
          dependsOnStep: 1,
          authorityProfile: "external_outbound_write",
        },
      ],
    });
    const result = compileMultiIntentPlan({
      routerOutput: output,
      validation: validation(output),
      workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      authorityProofRefsByStep: { 1: ["authority://local_yolo"] },
    });

    expect(result.steps.map((step) => step.authorityProfile)).toEqual([
      "local_yolo",
      "external_outbound_write",
    ]);
    expect(result.steps[1]?.status).toBe("held_for_policy_proof");
  });

  it("blocks invalid dependencies, cycles, unknown workflows, and missing authority", () => {
    const invalidDependency = multiOutput({
      multiIntentPlan: [
        {
          order: 1,
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          objectiveSummary: "Invalid dependency.",
          dependsOnStep: 99,
          authorityProfile: "local_yolo",
        },
      ],
    });
    expect(
      compileMultiIntentPlan({
        routerOutput: invalidDependency,
        validation: validation(invalidDependency),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
        authorityProofRefsByStep: { 1: ["authority://local_yolo"] },
      }).outcome,
    ).toBe("blocked");

    const cycle = multiOutput({
      multiIntentPlan: [
        {
          order: 1,
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          objectiveSummary: "Cycle one.",
          dependsOnStep: 2,
          authorityProfile: "local_yolo",
        },
        {
          order: 2,
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          objectiveSummary: "Cycle two.",
          dependsOnStep: 1,
          authorityProfile: "local_yolo",
        },
      ],
    });
    expect(
      compileMultiIntentPlan({
        routerOutput: cycle,
        validation: validation(cycle),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
        authorityProofRefsByStep: { 1: ["authority://local_yolo"], 2: ["authority://local_yolo"] },
      }).reasonCodes,
    ).toContain("cyclic_dependency_graph");

    const unknownWorkflow = multiOutput({
      multiIntentPlan: [
        {
          order: 1,
          route: "workflow_execution",
          workflowId: "workflow.unknown",
          objectiveSummary: "Unknown workflow.",
          dependsOnStep: null,
          authorityProfile: "local_yolo",
        },
      ],
    });
    expect(
      compileMultiIntentPlan({
        routerOutput: unknownWorkflow,
        validation: validation(unknownWorkflow),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
        authorityProofRefsByStep: { 1: ["authority://local_yolo"] },
      }).reasonCodes,
    ).toContain("workflow_step_not_registered");

    const missingAuthority = multiOutput();
    expect(
      compileMultiIntentPlan({
        routerOutput: missingAuthority,
        validation: validation(missingAuthority),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      }).steps[0]?.status,
    ).toBe("needs_review");
  });

  it("rejects raw storage flags and Work Queue lifecycle mutation", () => {
    expect(
      compileMultiIntentPlan({
        routerOutput: multiOutput(),
        validation: validation(),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
        workQueueLifecycleMutationRequested: true,
      }),
    ).toMatchObject({
      outcome: "blocked",
      workQueueLifecycleMutationAllowed: false,
    });
    expect(
      compileMultiIntentPlan({
        routerOutput: { ...multiOutput(), rawPromptStored: true } as never,
        validation: validation(),
        workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      }).reasonCodes,
    ).toContain("raw_storage_flags_rejected");
  });
});
