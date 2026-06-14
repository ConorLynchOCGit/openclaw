import { describe, expect, it } from "vitest";
import { ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS } from "./router-runtime-tools.ts";
import { createBaseCanonicalRouterOutput, createCanonicalRouterAction } from "./router-schema.ts";
import {
  buildRouterFrontDoorToolProtocolResult,
  assertRouterFrontDoorToolProtocolCanCompile,
  compileRouterSmallVerbToolOutput,
} from "./router-tool-protocol.ts";

const output = createBaseCanonicalRouterOutput({
  route: "workflow_execution",
  responseMode: "create_runtime_job",
  executeNow: true,
  executorWorkflowId: "agent_team.coding",
  workflowId: "agent_team.coding",
  jobType: "executor.agent_team",
  objectiveSummary: "Implement a workflow surface.",
  requestedCapabilities: ["code_edit", "test", "review", "closeout"],
  requestedActions: [createCanonicalRouterAction("code_edit", "bounded source edit", 0.95)],
  constraints: [
    {
      constraintKind: "safety_boundary",
      objectSummary: "Do not deploy or store raw logs.",
      confidence: 0.99,
    },
  ],
  sideEffectClass: "code_edit",
});

describe("router front-door tool protocol", () => {
  it("compiles thin router small verbs into canonical workflow execution output", () => {
    const compiled = compileRouterSmallVerbToolOutput({
      routerActions: [
        { tool: "router.set_route", input: { route: "workflow_execution" } },
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "implement_existing_system",
            requestedWorkKind: "code implementation",
            expectedOutputKind: "changed files and validation evidence",
            confidence: 0.96,
          },
        },
        {
          tool: "router.select_executor_workflow",
          input: { workflowId: "agent_team.coding", jobType: "executor.agent_team" },
        },
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(compiled.valid).toBe(true);
    expect(compiled.output?.route).toBe("workflow_execution");
    expect(compiled.output?.workflowId).toBe("agent_team.coding");
    expect(compiled.output?.jobType).toBe("executor.agent_team");
    expect(compiled.output?.confidence).toBe(0.96);
    expect(compiled.output?.requestedCapabilities).toEqual([]);
    expect(compiled.output?.constraints).toEqual([]);
    expect(compiled.output?.requestedActions).toEqual([]);
    expect(compiled.output?.reasonCodes).toContain(
      "router_primary_outcome:implement_existing_system",
    );
  });

  it("derives response mode and execute-now state from route", () => {
    const compiled = compileRouterSmallVerbToolOutput({
      routerActions: [
        { tool: "router.set_route", input: { value: "workflow_execution" } },
        {
          tool: "router.classify_primary_outcome",
          input: {
            outcomeKind: "implement_existing_system",
            requestedWorkKind: "implementation",
            expectedOutputKind: "changed files and validation evidence",
            confidence: 0.9,
          },
        },
        {
          tool: "router.select_executor_workflow",
          input: { workflowId: "agent_team.coding", jobType: "executor.agent_team" },
        },
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(compiled.valid).toBe(true);
    expect(compiled.output?.route).toBe("workflow_execution");
    expect(compiled.output?.responseMode).toBe("create_runtime_job");
    expect(compiled.output?.executeNow).toBe(true);
    expect(compiled.output?.requestedCapabilities).toEqual([]);
  });

  it("drops retired broad-router tools instead of accepting stale router surfaces", () => {
    const compiled = compileRouterSmallVerbToolOutput({
      routerActions: [
        { tool: "router.submit_decision", input: { route: "workflow_execution" } },
        { tool: "router.set_response_mode", input: { responseMode: "create_runtime_job" } },
        { tool: "router.set_execute_now", input: { executeNow: true } },
        { tool: "router.add_requested_action", input: { action: "code_edit" } },
        { tool: "router.add_constraint", input: { constraintKind: "safety_boundary" } },
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    expect(compiled.valid).toBe(false);
    expect(compiled.reasonCodes).toContain("router_small_verb_tool_calls_missing");
  });

  it("rejects an executor whose manifest cannot perform the model-authored primary outcome", () => {
    const compiled = compileRouterSmallVerbToolOutput(
      {
        routerActions: [
          { tool: "router.set_route", input: { route: "workflow_execution" } },
          {
            tool: "router.classify_primary_outcome",
            input: {
              outcomeKind: "implement_existing_system",
              requestedWorkKind: "code implementation",
              expectedOutputKind: "changed files and validation evidence",
              confidence: 0.88,
            },
          },
          {
            tool: "router.select_executor_workflow",
            input: { workflowId: "workflow.planning", jobType: "executor.workflow" },
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        workflowSummaries: [
          {
            workflowId: "workflow.planning",
            jobType: "executor.workflow",
            executable: true,
            status: "enabled",
            capabilitySummary: {
              executableCapabilities: ["plan", "action_graph_proposal"],
              subjectDomains: ["workflow"],
              targetRefKindsSupported: ["workflow"],
              canImplementCode: false,
              canPlan: true,
              canReview: false,
              canResearch: false,
              canCreateChildProposals: true,
              canCompileRuntimeJobs: false,
              canExecuteRuntimeJobs: true,
              canMutateWorkQueueLifecycle: false,
            },
          },
        ],
      },
    );

    expect(compiled.valid).toBe(false);
    expect(compiled.output).toBeNull();
    expect(compiled.reasonCodes).toContain(
      "router_executor_primary_outcome_capability_mismatch:implement_existing_system:code_edit",
    );
    expect(compiled.schemaIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "router_executor_primary_outcome_capability_mismatch",
          path: "executorWorkflowId",
        }),
      ]),
    );
  });

  it("accepts a planning executor when the primary outcome is planning artifacts", () => {
    const compiled = compileRouterSmallVerbToolOutput(
      {
        routerActions: [
          { tool: "router.set_route", input: { route: "workflow_execution" } },
          {
            tool: "router.classify_primary_outcome",
            input: {
              outcomeKind: "produce_plan",
              requestedWorkKind: "planning",
              expectedOutputKind: "planning artifacts",
              confidence: 0.88,
            },
          },
          {
            tool: "router.select_executor_workflow",
            input: { workflowId: "workflow.planning", jobType: "executor.workflow" },
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        workflowSummaries: [
          {
            workflowId: "workflow.planning",
            jobType: "executor.workflow",
            executable: true,
            status: "enabled",
            capabilitySummary: {
              executableCapabilities: ["plan", "action_graph_proposal"],
              subjectDomains: ["workflow"],
              targetRefKindsSupported: ["workflow"],
              canImplementCode: false,
              canPlan: true,
              canReview: false,
              canResearch: false,
              canCreateChildProposals: true,
              canCompileRuntimeJobs: false,
              canExecuteRuntimeJobs: true,
              canMutateWorkQueueLifecycle: false,
            },
          },
        ],
      },
    );

    expect(compiled.valid).toBe(true);
    expect(compiled.output?.executorWorkflowId).toBe("workflow.planning");
    expect(compiled.output?.requestedCapabilities).toEqual([]);
  });

  it("does not use primary-outcome tool calls as requested-capability evidence", () => {
    const compiled = compileRouterSmallVerbToolOutput(
      {
        routerActions: [
          { tool: "router.set_route", input: { route: "workflow_execution" } },
          {
            tool: "router.classify_primary_outcome",
            input: {
              outcomeKind: "harden_existing_system",
              requestedWorkKind: "implementation proof",
              expectedOutputKind: "changed files and validation evidence",
              confidence: 0.92,
            },
          },
          {
            tool: "router.select_executor_workflow",
            input: { workflowId: "agent_team.coding", jobType: "executor.agent_team" },
          },
        ],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        workflowSummaries: [
          {
            workflowId: "agent_team.coding",
            jobType: "executor.agent_team",
            executable: true,
            status: "enabled",
            capabilitySummary: {
              executableCapabilities: ["code_edit", "test", "review", "closeout"],
              subjectDomains: ["repo", "workflow"],
              targetRefKindsSupported: ["repo", "workflow"],
              canImplementCode: true,
              canPlan: false,
              canReview: true,
              canResearch: false,
              canCreateChildProposals: false,
              canCompileRuntimeJobs: false,
              canExecuteRuntimeJobs: true,
              canMutateWorkQueueLifecycle: false,
            },
          },
        ],
      },
    );

    expect(compiled.valid).toBe(true);
    expect(compiled.output?.route).toBe("workflow_execution");
    expect(compiled.output?.responseMode).toBe("create_runtime_job");
    expect(compiled.output?.executeNow).toBe(true);
    expect(compiled.output?.requestedCapabilities).toEqual([]);
  });

  it("compiles staged router tool traces into bounded router protocol evidence", () => {
    const protocol = buildRouterFrontDoorToolProtocolResult({
      requestId: "native-exec-router-test",
      promptHash: "a".repeat(64),
      routerOutput: output,
      validation: null,
      toolInvocations: ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.map((toolId) => ({
        toolId,
        invocationRef: `runtime-tool://${toolId}`,
        status: "succeeded",
        outputRef: `runtime-tool-output://${toolId}`,
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      })),
    });

    expect(protocol.status).toBe("succeeded");
    expect(protocol.phaseStatuses.map((phase) => phase.toolId)).toEqual([
      ...ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
    ]);
    expect(protocol.constraintSummaries[0]?.constraintKind).toBe("safety_boundary");
    expect(protocol.rawPromptStored).toBe(false);
    expect(() => assertRouterFrontDoorToolProtocolCanCompile(protocol)).not.toThrow();
  });

  it("rejects protocol artifacts that claim raw storage or authority", () => {
    const protocol = buildRouterFrontDoorToolProtocolResult({
      requestId: "native-exec-router-test",
      promptHash: "b".repeat(64),
      routerOutput: output,
      toolInvocations: [],
    });
    expect(() =>
      assertRouterFrontDoorToolProtocolCanCompile({
        ...protocol,
        rawPromptStored: true as false,
      }),
    ).toThrow(/raw storage rejected/u);
    expect(() =>
      assertRouterFrontDoorToolProtocolCanCompile({
        ...protocol,
        authorityGranted: true as false,
      }),
    ).toThrow(/cannot grant authority/u);
  });
});
