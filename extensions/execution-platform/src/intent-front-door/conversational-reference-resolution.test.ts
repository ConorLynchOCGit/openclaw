import { describe, expect, it } from "vitest";
import {
  buildConversationRoutingContext,
  type ConversationRuntimeJobRef,
  type ConversationWorkQueueSelectionRef,
} from "./conversation-routing-context.ts";
import {
  isConversationalReferenceText,
  resolveConversationalReference,
} from "./conversational-reference-resolution.ts";

const activeJob: ConversationRuntimeJobRef = {
  runtimeJobId: "runtime-1",
  jobType: "executor.agent_team",
  queueName: "agent-team",
  state: "running",
  workItemId: "work-1",
  workflowId: "agent_team.coding",
  updatedAt: "2026-05-05T00:00:00.000Z",
  freshness: "fresh",
};

function selected(freshness: "fresh" | "stale"): ConversationWorkQueueSelectionRef {
  return {
    workItemId: "work-selected",
    itemType: "execution_workflow",
    titleSummary: "Selected",
    lifecycleState: "running",
    runtimeJobIds: ["runtime-selected"],
    updatedAt: "2026-05-05T00:00:00.000Z",
    freshness,
  };
}

describe("Conversational reference resolution", () => {
  it("treats build and research prompts as not-reference", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
    });
    expect(isConversationalReferenceText("Build this small improvement.")).toBe(false);
    expect(
      resolveConversationalReference({ text: "Build this small improvement.", context }),
    ).toMatchObject({
      outcome: "not_reference",
      targetRef: null,
    });
  });

  it("selected Work Queue item wins over active jobs when fresh", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      selectedWorkQueueItem: selected("fresh"),
      activeRuntimeJobs: [activeJob],
    });
    expect(resolveConversationalReference({ text: "continue", context })).toMatchObject({
      outcome: "resolved",
      targetRef: "work-item://work-selected",
      targetSource: "selected_work_queue_item",
    });
  });

  it("exactly one active runtime job resolves when no selected item exists", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      activeRuntimeJobs: [activeJob],
    });
    expect(resolveConversationalReference({ text: "cancel it", context })).toMatchObject({
      outcome: "resolved",
      targetRef: "runtime-job://runtime-1",
      targetSource: "single_active_runtime_job",
      reasonCodes: expect.arrayContaining(["target_resolution_only_validator_required"]),
    });
  });

  it("multiple active jobs require clarification", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      activeRuntimeJobs: [
        activeJob,
        {
          ...activeJob,
          runtimeJobId: "runtime-2",
        },
      ],
    });
    expect(resolveConversationalReference({ text: "continue", context })).toMatchObject({
      outcome: "ambiguous",
      clarificationQuestion: "Which active job should this refer to?",
    });
  });

  it("stale selected item requires clarification", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      selectedWorkQueueItem: selected("stale"),
    });
    expect(resolveConversationalReference({ text: "ship it", context })).toMatchObject({
      outcome: "stale",
      targetRef: "work-item://work-selected",
      clarificationQuestion: "Which current item should this refer to?",
    });
  });

  it("uses pending clarification or approval targets when no active target exists", () => {
    const clarificationContext = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      pendingClarifications: [
        {
          clarificationId: "clarification-1",
          targetRef: "clarification://target",
          questionSummary: "Pick target",
          freshness: "fresh",
        },
      ],
    });
    expect(
      resolveConversationalReference({ text: "do it", context: clarificationContext }),
    ).toMatchObject({
      outcome: "resolved",
      targetRef: "clarification://target",
      targetSource: "pending_clarification",
    });

    const approvalContext = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      pendingApprovals: [
        {
          approvalId: "approval-1",
          authorityId: "deploy",
          targetRef: "approval://target",
          scopeSummary: "deploy",
          state: "pending",
          freshness: "fresh",
        },
      ],
    });
    expect(
      resolveConversationalReference({ text: "approve it", context: approvalContext }),
    ).toMatchObject({
      outcome: "resolved",
      targetRef: "approval://target",
      targetSource: "pending_approval",
      reasonCodes: expect.arrayContaining(["target_resolution_only_validator_required"]),
    });
  });

  it("asks clarification when a reference has no fresh target", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
    });
    expect(resolveConversationalReference({ text: "continue", context })).toMatchObject({
      outcome: "missing_target",
      clarificationQuestion: "What should this refer to?",
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });
});
