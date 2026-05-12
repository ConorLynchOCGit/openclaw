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
});
