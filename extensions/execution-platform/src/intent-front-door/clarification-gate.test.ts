import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { enforceActionSemantics } from "./action-semantics.ts";
import { runClarificationGate } from "./clarification-gate.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { evaluateRouterEscalationPolicy } from "./router-escalation-policy.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
  generatedAt: "2026-05-06T00:00:00.000Z",
});
const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };
const authority = { snapshotFresh: true, supportedAuthorityProfiles: ["read_only", "local_yolo"] };

function baseInput() {
  return {
    requestId: "request-1",
    actorId: "operator",
    sessionId: "session-1",
    promptHash: "prompt-hash",
    promptSummary: "bounded prompt summary",
    now: new Date("2026-05-06T00:00:00.000Z"),
  };
}

describe("ClarificationGate", () => {
  it("creates bounded clarification for ambiguous router output", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "clarification_required",
      responseMode: "ask_clarification",
      confidence: 0.3,
      objectiveSummary: "Target is ambiguous.",
      ambiguity: {
        ambiguous: true,
        missingInputs: ["target"],
        conflictingInstructions: [],
        clarificationQuestion: "Which target should I use?",
      },
      reasonCodes: ["fixture_ambiguous"],
    });
    const validation = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex,
      auth,
      authority,
    });
    const gate = runClarificationGate({
      ...baseInput(),
      routerOutput: output,
      validation,
    });

    expect(gate.outcome).toBe("clarification_required");
    expect(gate.clarification).toMatchObject({
      questionSummary: "Which target should I use?",
      promptHash: "prompt-hash",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(gate.runtimeJobCreated).toBe(false);
  });

  it("asks clarification for stale selected Work Queue item and multiple active jobs", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session-1",
      sourceRoute: "ux",
      selectedWorkQueueItem: {
        workItemId: "work-1",
        itemType: "execution_workflow",
        titleSummary: "Old item",
        lifecycleState: "running",
        runtimeJobIds: ["job-1"],
        updatedAt: "2026-05-05T00:00:00.000Z",
        freshness: "stale",
      },
      activeRuntimeJobs: [
        {
          runtimeJobId: "job-1",
          jobType: "executor.agent_team",
          queueName: "agent-team",
          state: "running",
          workItemId: "work-1",
          workflowId: "agent_team.coding",
          updatedAt: "2026-05-06T00:00:00.000Z",
          freshness: "fresh",
        },
        {
          runtimeJobId: "job-2",
          jobType: "executor.agent_team",
          queueName: "agent-team",
          state: "running",
          workItemId: "work-2",
          workflowId: "agent_team.coding",
          updatedAt: "2026-05-06T00:00:00.000Z",
          freshness: "fresh",
        },
      ],
    });
    const output = createBaseCanonicalRouterOutput({
      route: "work_queue_control",
      responseMode: "apply_control",
      confidence: 0.9,
      objectiveSummary: "Apply runtime control.",
      requestedActions: [createCanonicalRouterAction("work_queue_control", "control", 0.9)],
    });
    const gate = runClarificationGate({
      ...baseInput(),
      routerOutput: output,
      conversationContext: context,
    });

    expect(gate.outcome).toBe("clarification_required");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining(["selected_work_queue_item_stale", "multiple_active_runtime_jobs"]),
    );
    expect(gate.clarification?.allowedAnswerShape).toBe("select_target");
  });

  it("converts low-confidence execution and escalation ask_clarification into clarification", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.2,
      objectiveSummary: "Maybe start coding workflow.",
      requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.2)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const validation = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex,
      auth,
      authority,
    });
    const escalationDecision = evaluateRouterEscalationPolicy({
      routerOutput: output,
      schemaValid: true,
      workQueueControlTargetAmbiguous: true,
    });
    const gate = runClarificationGate({
      ...baseInput(),
      routerOutput: output,
      validation,
      escalationDecision,
    });

    expect(gate.outcome).toBe("clarification_required");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining(["low_confidence_execution", "escalation_asked_clarification"]),
    );
    expect(gate.clarification?.questionSummary).toBe(
      "Should I answer in chat or start a workflow?",
    );
  });

  it("does not require router-authored actions for executable workflow routing", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      executorWorkflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Run the coding workflow from a prompt.",
      requestedCapabilities: ["code_edit", "test", "review", "closeout"],
      requestedActions: [],
      conditionalActions: [],
      reasonCodes: ["router_primary_outcome:implement_existing_system"],
    });
    const validation = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex,
      auth,
      authority,
    });
    const gate = runClarificationGate({ ...baseInput(), routerOutput: output, validation });

    expect(validation.outcome).toBe("accepted");
    expect(gate.outcome).toBe("pass_through");
    expect(gate.reasonCodes).not.toContain("broad_execution_request_missing_scope");
  });

  it("clarifies conflicting requested and negated actions without creating work", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Improve outbound readback without sending.",
      requestedActions: [createCanonicalRouterAction("outbound_send", "send notice", 0.8)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 1)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const gate = runClarificationGate({
      ...baseInput(),
      routerOutput: output,
      actionSemantics: enforceActionSemantics({
        requestedActions: output.requestedActions,
        negatedActions: output.negatedActions,
      }),
    });

    expect(gate.outcome).toBe("clarification_required");
    expect(gate.reasonCodes).toContain("requested_and_negated_action_conflict");
    expect(gate.workQueueLifecycleMutationAllowed).toBe(false);
  });

  it("allows chat, status, and plan-only without runtime jobs", () => {
    for (const output of [
      createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Answer directly.",
      }),
      createBaseCanonicalRouterOutput({
        route: "status_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Return status.",
      }),
      createBaseCanonicalRouterOutput({
        route: "plan_only",
        responseMode: "create_plan_only",
        confidence: 0.99,
        objectiveSummary: "Create plan only.",
      }),
    ]) {
      const validation = validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(output),
        workflowSummaryIndex,
        auth,
        authority,
      });
      const gate = runClarificationGate({ ...baseInput(), routerOutput: output, validation });
      expect(gate.runtimeJobCreated).toBe(false);
      expect(gate.workQueueLifecycleMutationAllowed).toBe(false);
      expect(["chat_or_status_allowed", "plan_only_allowed"]).toContain(gate.outcome);
    }
  });
});
