import { describe, expect, it } from "vitest";
import { AGENT_TEAM_JOB_TYPE } from "../codex-bridge/agent-team-runtime-evidence.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  getWorkflowContract,
} from "../workflows/workflow-registry.ts";
import { buildExecutionPathwayReadinessAudit } from "./execution-pathway-readiness-audit.ts";
import { parseStructuredIntentRouterOutput } from "./intent-router-schema.ts";
import { validateIntentForExecution } from "./intent-validator.ts";
import { ModelAssistedIntentRouter } from "./model-assisted-intent-router.ts";
import { decideProductionDefaultEnablement } from "./production-default-enablement-gate.ts";
import { compileIntentToRuntimeJobRequest } from "./request-compiler.ts";
import { evaluateResearchRoutingPolicy } from "./research-routing-policy.ts";

describe("intent routing", () => {
  it("parses structured coding-team routes and rejects raw storage", () => {
    const parsed = parseStructuredIntentRouterOutput({
      route: "workflow_execution",
      workflowId: "agent_team.coding",
      jobType: AGENT_TEAM_JOB_TYPE,
      confidence: 0.91,
      objectiveSummary: "Add a regression test and close it out.",
      compiledInputs: { requestedChangeClass: "test" },
      requestedAuthority: "local_yolo",
      requiresApproval: false,
      approvalKind: null,
      needsClarification: false,
      clarificationQuestion: null,
      reasonCodes: ["coding_team_requested"],
      riskClass: "medium",
      sideEffectClass: "code_edit",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(parsed.valid).toBe(true);
    expect(
      parseStructuredIntentRouterOutput({
        route: "workflow_execution",
        workflowId: "agent_team.coding",
        jobType: AGENT_TEAM_JOB_TYPE,
        confidence: 0.91,
        objectiveSummary: "Bad raw storage.",
        compiledInputs: {},
        requestedAuthority: "local_yolo",
        requiresApproval: false,
        needsClarification: false,
        reasonCodes: [],
        riskClass: "medium",
        sideEffectClass: "code_edit",
        rawPromptStored: true,
        rawResponseStored: false,
      }).valid,
    ).toBe(false);
  });

  it("routes natural language to agent_team.coding with the provider abstraction", async () => {
    const router = new ModelAssistedIntentRouter();
    const decision = await router.route({
      prompt: "Have the coding team add a small regression test and close it out.",
    });
    expect(decision.routeDecision.route).toBe("workflow_execution");
    expect(decision.routeDecision.workflowId).toBe("agent_team.coding");
    expect(decision.rawPromptStored).toBe(false);
    expect(decision.rawResponseStored).toBe(false);
  });

  it("prioritizes explicit coding-team delegation over research and direct deploy blockers", async () => {
    const router = new ModelAssistedIntentRouter();
    await expect(
      router.route({
        prompt:
          "Have the coding team run a production authority control smoke, verify runtime readback, and close it out.",
      }),
    ).resolves.toMatchObject({
      routeDecision: {
        route: "workflow_execution",
        workflowId: "agent_team.coding",
      },
    });
    await expect(
      router.route({
        prompt:
          "Have the coding team complete a tiny validated fix and deploy it if policy permits.",
      }),
    ).resolves.toMatchObject({
      routeDecision: {
        route: "workflow_execution",
        workflowId: "agent_team.coding",
      },
    });
  });

  it("routes research, architecture, docs, controls, and blocked requests across workflows", async () => {
    const router = new ModelAssistedIntentRouter();
    await expect(
      router.route({ prompt: "Research current OpenAI structured output docs." }),
    ).resolves.toMatchObject({
      routeDecision: {
        route: "workflow_execution",
        workflowId: "single_agent.web_research",
      },
    });
    await expect(
      router.route({
        prompt:
          "Plan the architecture for a new skill execution workflow and research current docs if needed.",
      }),
    ).resolves.toMatchObject({
      routeDecision: {
        route: "workflow_execution",
        workflowId: "agent_team.architecture",
      },
    });
    await expect(
      router.route({ prompt: "Update the execution-platform runbook." }),
    ).resolves.toMatchObject({
      routeDecision: {
        route: "workflow_execution",
        workflowId: "workflow.docs_skills",
      },
    });
    await expect(router.route({ prompt: "Cancel job abc." })).resolves.toMatchObject({
      routeDecision: { route: "work_queue_control" },
    });
    await expect(router.route({ prompt: "Deploy this to production." })).resolves.toMatchObject({
      routeDecision: { route: "blocked" },
    });
  });

  it("validates safe coding-team intent deterministically", async () => {
    const router = new ModelAssistedIntentRouter();
    const decision = await router.route({
      prompt: "Have the coding team add a small regression test and close it out.",
    });
    const validation = validateIntentForExecution({
      routeDecision: decision.routeDecision,
      registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    });
    expect(validation.outcome).toBe("accepted");
    expect(validation.accepted).toBe(true);
  });

  it("applies deterministic research policy and default enablement", () => {
    expect(
      evaluateResearchRoutingPolicy({
        objectiveSummary: "Look up current OpenAI API docs for structured outputs.",
        workflowId: "single_agent.web_research",
        requestedAuthority: "outbound_readonly",
        sideEffectClass: "outbound_readonly",
      }),
    ).toMatchObject({ disposition: "mandatory", childWorkflowId: "single_agent.web_research" });
    expect(
      evaluateResearchRoutingPolicy({
        objectiveSummary: "Plan the architecture for a new workflow.",
        workflowId: "agent_team.architecture",
        requestedAuthority: "read_only",
        sideEffectClass: "read_only",
      }),
    ).toMatchObject({ disposition: "optional" });
    expect(
      evaluateResearchRoutingPolicy({
        objectiveSummary: "Send this researched result to a customer.",
        workflowId: "single_agent.web_research",
        requestedAuthority: "outbound_readonly",
        sideEffectClass: "outbound_readonly",
      }),
    ).toMatchObject({ disposition: "blocked" });
    expect(
      decideProductionDefaultEnablement({
        workflowId: "single_agent.web_research",
        authorityProfile: "outbound_readonly",
      }),
    ).toMatchObject({ status: "default_enabled" });
    expect(
      decideProductionDefaultEnablement({
        workflowId: "agent_team.coding",
        authorityProfile: "production_deploy",
      }),
    ).toMatchObject({ status: "locked" });
  });

  it("accepts bounded web research and compiles child workflow requests", async () => {
    const router = new ModelAssistedIntentRouter();
    const research = await router.route({
      prompt: "Research current OpenAI structured output docs.",
    });
    expect(
      validateIntentForExecution({
        routeDecision: research.routeDecision,
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      }),
    ).toMatchObject({ outcome: "accepted" });

    const architecture = await router.route({
      prompt:
        "Plan the architecture for a new skill execution workflow and research current docs if needed.",
    });
    const validation = validateIntentForExecution({
      routeDecision: architecture.routeDecision,
      registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    });
    const workflow = getWorkflowContract(
      DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      "agent_team.architecture",
    )!;
    const compiled = compileIntentToRuntimeJobRequest({
      requestId: "native-architecture-test",
      routerDecision: architecture,
      validation,
      workflow,
      operator: { actorId: "operator" },
    });
    expect(compiled.runtimeJobCreateRequest.payload).toMatchObject({
      workflowId: "agent_team.architecture",
      childWorkflowRequests: [
        {
          childWorkflowId: "single_agent.web_research",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      ],
    });
  });

  it("blocks production deploy and approval-gates dependency work", async () => {
    const router = new ModelAssistedIntentRouter();
    const deploy = await router.route({ prompt: "Deploy this to production." });
    expect(
      validateIntentForExecution({
        routeDecision: deploy.routeDecision,
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      }).outcome,
    ).toBe("blocked");

    const workflow = getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.coding")!;
    const installDecision = {
      route: "workflow_execution" as const,
      workflowId: workflow.workflowId,
      jobType: workflow.jobType,
      confidence: 0.9,
      objectiveSummary: "Add a dependency.",
      compiledInputs: {},
      requestedAuthority: "install_dependency",
      requiresApproval: true,
      approvalKind: "install_dependency",
      needsClarification: false,
      clarificationQuestion: null,
      reasonCodes: ["install_requested"],
      riskClass: "high" as const,
      sideEffectClass: "install_dependency" as const,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
    };
    expect(
      validateIntentForExecution({
        routeDecision: installDecision,
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      }).outcome,
    ).toBe("approval_required");
  });

  it("compiles accepted intent to a bounded runtime job payload", async () => {
    const router = new ModelAssistedIntentRouter();
    const decision = await router.route({
      prompt: "Have the coding team add a small regression test and close it out.",
    });
    const validation = validateIntentForExecution({
      routeDecision: decision.routeDecision,
      registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    });
    const workflow = getWorkflowContract(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, "agent_team.coding")!;
    const compiled = compileIntentToRuntimeJobRequest({
      requestId: "native-exec-test",
      routerDecision: decision,
      validation,
      workflow,
      operator: { actorId: "operator" },
      workItemId: "work-item-1",
    });
    expect(compiled.jobType).toBe(AGENT_TEAM_JOB_TYPE);
    expect(compiled.runtimeJobCreateRequest.payload).toMatchObject({
      workflowId: "agent_team.coding",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(compiled.promptHash).toHaveLength(64);
  });

  it("audits final execution pathway readiness without claiming blocked gateway state", () => {
    const blocked = buildExecutionPathwayReadinessAudit({
      nativeExecutionRpcsLiveOnGateway: false,
      liveUxExecutionSubmitProven: false,
      workflowContractsRegistered: [
        "agent_team.coding",
        "single_agent.web_research",
        "agent_team.architecture",
        "workflow.docs_skills",
      ],
      childWorkflowHandoffProven: true,
      researchRoutingPolicyProven: true,
      supervisorDispatchProven: true,
      workQueueProjectionProven: true,
      nativeControlsProven: true,
      multiWorkflowUxE2eProven: false,
      liveNativeRpcSoakProven: false,
      docsAndCloseoutComplete: true,
      rawContentStored: false,
      workQueueLifecycleMutated: false,
      productionDeployOccurred: false,
      externalOutboundWriteOrSendOccurred: false,
      productionModelPromotionOccurred: false,
    });
    expect(blocked.coreExecutionCanShiftIntoOpenClaw).toBe(false);
    expect(blocked.hardBlockers).toContain("native_execution_rpcs_not_live_on_gateway");
    const ready = buildExecutionPathwayReadinessAudit({
      ...blocked.evidenceSummary,
      nativeExecutionRpcsLiveOnGateway: true,
      liveUxExecutionSubmitProven: true,
      workflowContractsRegistered: blocked.evidenceSummary.workflowContractsRegistered,
      childWorkflowHandoffProven: true,
      researchRoutingPolicyProven: true,
      supervisorDispatchProven: true,
      workQueueProjectionProven: true,
      nativeControlsProven: true,
      multiWorkflowUxE2eProven: true,
      liveNativeRpcSoakProven: true,
      docsAndCloseoutComplete: true,
      rawContentStored: false,
      workQueueLifecycleMutated: false,
      productionDeployOccurred: false,
      externalOutboundWriteOrSendOccurred: false,
      productionModelPromotionOccurred: false,
    });
    expect(ready.scorePercent).toBe(100);
    expect(ready.milestone4CanResume).toBe(true);
  });
});
