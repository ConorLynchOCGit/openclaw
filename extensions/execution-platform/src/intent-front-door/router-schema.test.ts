import { describe, expect, it } from "vitest";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";

describe("CanonicalRouterSchema", () => {
  it("parses valid chat, status, coding, research, control, clarification, blocked, and multi routes", () => {
    const outputs = [
      createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
      }),
      createBaseCanonicalRouterOutput({
        route: "status_response",
        responseMode: "answer_in_chat",
        requestedActions: [createCanonicalRouterAction("status", "read status", 0.98)],
      }),
      createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        requestedActions: [createCanonicalRouterAction("code_edit", "edit code", 0.9)],
        sideEffectClass: "code_edit",
      }),
      createBaseCanonicalRouterOutput({
        route: "research_only",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "single_agent.web_research",
        jobType: "executor.single_agent",
        requestedActions: [createCanonicalRouterAction("research", "bounded research", 0.9)],
        sideEffectClass: "outbound_readonly",
      }),
      createBaseCanonicalRouterOutput({
        route: "work_queue_control",
        responseMode: "apply_control",
        requestedActions: [createCanonicalRouterAction("work_queue_control", "cancel target", 0.9)],
      }),
      createBaseCanonicalRouterOutput({
        route: "clarification_required",
        responseMode: "ask_clarification",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["target"],
          conflictingInstructions: [],
          clarificationQuestion: "Which target should be used?",
        },
      }),
      createBaseCanonicalRouterOutput({
        route: "blocked",
        responseMode: "block",
        riskClass: "critical",
        reasonCodes: ["blocked_by_policy"],
      }),
      createBaseCanonicalRouterOutput({
        route: "multi_workflow_plan",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        multiIntentPlan: [
          {
            order: 1,
            route: "research_only",
            workflowId: "single_agent.web_research",
            objectiveSummary: "Research bounded facts.",
            dependsOnStep: null,
            authorityProfile: "outbound_readonly",
          },
        ],
      }),
    ];

    for (const output of outputs) {
      expect(parseCanonicalRouterOutput(output), output.route).toMatchObject({ valid: true });
    }
  });

  it("rejects invalid or unbounded router output", () => {
    const validChat = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
    });
    expect(
      parseCanonicalRouterOutput({
        ...validChat,
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: null,
        jobType: null,
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        rawPromptStored: true,
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        rawResponseStored: true,
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        objectiveSummary: "x".repeat(1_001),
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        reasonCodes: Array.from({ length: 31 }, (_, index) => `reason_${index}`),
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        requestedActions: Array.from({ length: 21 }, () =>
          createCanonicalRouterAction("chat", "answer", 0.5),
        ),
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        confidence: 2,
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        route: "unknown",
      }).valid,
    ).toBe(false);
    expect(
      parseCanonicalRouterOutput({
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
        }),
        unexpected: true,
      }).valid,
    ).toBe(false);
  });

  it("keeps mentioned, requested, negated, and conditional actions distinct", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      mentionedActions: [createCanonicalRouterAction("outbound_send", "show send status", 0.9)],
      requestedActions: [createCanonicalRouterAction("code_edit", "improve readback", 0.9)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
      conditionalActions: [
        createCanonicalRouterAction("deploy", "deploy only when policy permits", 0.86),
      ],
      sideEffectClass: "code_edit",
    });

    const parsed = parseCanonicalRouterOutput(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.output?.mentionedActions[0]?.action).toBe("outbound_send");
    expect(parsed.output?.requestedActions[0]?.action).toBe("code_edit");
    expect(parsed.output?.negatedActions[0]?.action).toBe("outbound_send");
    expect(parsed.output?.conditionalActions[0]?.action).toBe("deploy");
  });

  it("bounds model-authored action and constraint summaries instead of blocking routing", () => {
    const longModelAuthoredSummary = Array.from(
      { length: 20 },
      (_, index) => `bounded runtime action detail ${index + 1}`,
    ).join("; ");
    const parsed = parseCanonicalRouterOutput({
      ...createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        sideEffectClass: "code_edit",
      }),
      requestedActions: [
        {
          action: "code_edit",
          objectSummary: longModelAuthoredSummary,
          confidence: 0.95,
        },
      ],
      constraints: [
        {
          constraintKind: "safety_boundary",
          objectSummary: longModelAuthoredSummary,
          confidence: 0.99,
        },
      ],
    });

    expect(parsed.valid).toBe(true);
    expect(parsed.reasonCodes).toContain("canonical_router_output_bounds_repaired");
    expect(parsed.output?.requestedActions[0]?.objectSummary.length).toBeLessThanOrEqual(300);
    expect(parsed.output?.constraints[0]?.objectSummary.length).toBeLessThanOrEqual(300);
  });

  it("separates executor workflow from target workflow subjects", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      executorWorkflowId: "agent_team.coding",
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      subjectWorkflowIds: ["agent_team.product_spec_planning"],
      targetSubjectRefs: [
        {
          targetKind: "workflow",
          targetRef: "workflow://agent_team.product_spec_planning",
          confidence: 0.95,
        },
      ],
      requestedCapabilities: ["code_edit", "test", "docs_update", "review", "closeout"],
      constraints: [{ constraintKind: "deploy", objectSummary: "do not deploy", confidence: 0.99 }],
      selectedExecutionReason:
        "The primary outcome requires source edits, validation, docs, review, and closeout.",
      targetSubjectReason:
        "Product/Spec Planning is the workflow being upgraded, not the executor.",
      requestedActions: [
        createCanonicalRouterAction("code_edit", "implement workflow upgrade", 0.95),
        createCanonicalRouterAction("test", "validate workflow upgrade", 0.9),
      ],
      sideEffectClass: "code_edit",
    });

    const parsed = parseCanonicalRouterOutput(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.output?.executorWorkflowId).toBe("agent_team.coding");
    expect(parsed.output?.workflowId).toBe("agent_team.coding");
    expect(parsed.output?.subjectWorkflowIds).toContain("agent_team.product_spec_planning");
    expect(parsed.output?.targetSubjectRefs[0]?.targetRef).toBe(
      "workflow://agent_team.product_spec_planning",
    );
  });

  it("rejects workflow execution when legacy workflowId conflicts with executorWorkflowId", () => {
    const parsed = parseCanonicalRouterOutput({
      ...createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        executorWorkflowId: "agent_team.coding",
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        requestedActions: [createCanonicalRouterAction("code_edit", "edit code", 0.9)],
        sideEffectClass: "code_edit",
      }),
      workflowId: "agent_team.product_spec_planning",
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.reasonCodes).toContain(
      "canonical_router_schema_workflow_id_must_match_executor_workflow_id",
    );
  });
});
