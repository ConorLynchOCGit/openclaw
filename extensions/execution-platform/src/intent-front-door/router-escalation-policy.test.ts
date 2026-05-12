import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTER_ESCALATION_POLICY,
  evaluateRouterEscalationPolicy,
} from "./router-escalation-policy.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
} from "./router-schema.ts";

describe("Router escalation policy", () => {
  it("accepts high-confidence chat through the default router", () => {
    const decision = evaluateRouterEscalationPolicy({
      schemaValid: true,
      routerOutput: createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
      }),
    });

    expect(decision).toMatchObject({
      outcome: "use_default_router",
      providerCallMade: false,
      runtimeJobCreated: false,
      authorityGranted: false,
    });
  });

  it("escalates low-confidence execution, multi-intent, and child workflow routes", () => {
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.5,
          sideEffectClass: "code_edit",
        }),
      }).outcome,
    ).toBe("escalate_to_stronger_router");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        routerOutput: createBaseCanonicalRouterOutput({
          route: "multi_workflow_plan",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.9,
          multiIntentPlan: [
            {
              order: 1,
              route: "workflow_execution",
              workflowId: "agent_team.coding",
              objectiveSummary: "bounded work",
              dependsOnStep: null,
              authorityProfile: "local_yolo",
            },
          ],
        }),
      }).reasonCodes,
    ).toContain("multi_intent_plan_requires_escalation");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.9,
          childWorkflowRequests: [
            {
              childWorkflowId: "single_agent.web_research",
              requirement: "optional",
              reasonCodes: ["needs_research"],
              requestedAuthority: "outbound_readonly",
              boundedInputSummary: "bounded research",
              rawPromptStored: false,
              rawResponseStored: false,
            },
          ],
        }),
      }).reasonCodes,
    ).toContain("child_workflow_request_requires_escalation");
  });

  it("asks clarification for ambiguous execution and ambiguous controls", () => {
    const ambiguous = evaluateRouterEscalationPolicy({
      schemaValid: true,
      routerOutput: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["target"],
          conflictingInstructions: [],
          clarificationQuestion: "Which target?",
        },
      }),
    });
    const control = evaluateRouterEscalationPolicy({
      schemaValid: true,
      workQueueControlTargetAmbiguous: true,
      routerOutput: createBaseCanonicalRouterOutput({
        route: "work_queue_control",
        responseMode: "apply_control",
        requestedActions: [createCanonicalRouterAction("work_queue_control", "cancel target", 0.9)],
      }),
    });

    expect(ambiguous.outcome).toBe("ask_clarification");
    expect(control.outcome).toBe("ask_clarification");
  });

  it("escalates or fails closed for production side effects", () => {
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        escalationRouterAvailable: true,
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "workflow.deploy",
          jobType: "executor.workflow",
          riskClass: "critical",
          sideEffectClass: "production_side_effect",
        }),
      }).outcome,
    ).toBe("escalate_to_stronger_router");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "workflow.deploy",
          jobType: "executor.workflow",
          riskClass: "critical",
          sideEffectClass: "production_side_effect",
        }),
      }).outcome,
    ).toBe("fail_closed");
  });

  it("fails closed for stale authority, registry mismatch, schema failure, and injection signals", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
    });

    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        authoritySnapshotFresh: false,
        routerOutput: output,
      }).outcome,
    ).toBe("fail_closed");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        workflowRegistryVersionMatches: false,
        routerOutput: output,
      }).outcome,
    ).toBe("fail_closed");
    expect(evaluateRouterEscalationPolicy({ schemaValid: false }).outcome).toBe("fail_closed");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        maliciousToolOutputSignal: true,
        routerOutput: output,
      }).outcome,
    ).toBe("fail_closed");
  });

  it("allows chat fallback but blocks execution during provider outage", () => {
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        routerOutput: createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
      }).outcome,
    ).toBe("use_default_router");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
        }),
      }).outcome,
    ).toBe("fail_closed");
  });

  it("uses cached low-risk route only when versions match", () => {
    const versions = {
      workflowRegistryVersion: "registry-v1",
      authoritySnapshotVersion: "authority-v1",
      contextVersion: "context-v1",
      authSessionVersion: "auth-v1",
      routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
    };
    const candidate = {
      route: "chat_response" as const,
      workflowRegistryVersion: "registry-v1",
      authoritySnapshotVersion: "authority-v1",
      contextVersion: "context-v1",
      authSessionVersion: "auth-v1",
      routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
      riskClass: "low" as const,
      sideEffectClass: "none" as const,
    };

    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        cachedRouteCandidate: candidate,
        currentVersions: versions,
      }).outcome,
    ).toBe("use_cached_low_risk_route");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        cachedRouteCandidate: { ...candidate, workflowRegistryVersion: "registry-v2" },
        currentVersions: versions,
        routerOutput: createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
        }),
      }).outcome,
    ).toBe("fail_closed");
  });

  it("escalates router disagreement and never mutates lifecycle", () => {
    const decision = evaluateRouterEscalationPolicy({
      schemaValid: true,
      routerDisagreement: true,
      routerOutput: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
      }),
    });

    expect(decision.outcome).toBe("escalate_to_stronger_router");
    expect(decision.providerCallMade).toBe(false);
    expect(decision.runtimeJobCreated).toBe(false);
    expect(decision.authorityGranted).toBe(false);
    expect(decision.workQueueLifecycleMutationAllowed).toBe(false);
    expect(JSON.stringify(DEFAULT_ROUTER_ESCALATION_POLICY)).not.toContain("build|fix");
  });
});
