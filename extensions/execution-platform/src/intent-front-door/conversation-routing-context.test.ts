import { describe, expect, it } from "vitest";
import {
  CONVERSATION_CONTEXT_SUMMARY_MAX_CHARS,
  assertJsonSerializableContext,
  buildConversationRoutingContext,
  type ConversationRuntimeJobRef,
  type ConversationWorkQueueSelectionRef,
} from "./conversation-routing-context.ts";

const runtimeJob: ConversationRuntimeJobRef = {
  runtimeJobId: "runtime-1",
  jobType: "executor.agent_team",
  queueName: "agent-team",
  state: "running",
  workItemId: "work-1",
  workflowId: "agent_team.coding",
  updatedAt: "2026-05-05T00:00:00.000Z",
  freshness: "fresh",
};

const selectedWorkQueueItem: ConversationWorkQueueSelectionRef = {
  workItemId: "work-1",
  itemType: "execution_workflow",
  titleSummary: "Selected work",
  lifecycleState: "running",
  runtimeJobIds: ["runtime-1"],
  updatedAt: "2026-05-05T00:00:00.000Z",
  freshness: "fresh",
};

describe("ConversationRoutingContext", () => {
  it("constructs a bounded serializable context", () => {
    const context = buildConversationRoutingContext({
      actorId: " operator ",
      sessionId: " session ",
      sourceRoute: "ux",
      activeRuntimeJobs: [runtimeJob],
      selectedWorkQueueItem,
      pendingClarifications: [
        {
          clarificationId: "clarification-1",
          targetRef: "runtime-job://runtime-1",
          questionSummary: "Pick the target.",
          freshness: "fresh",
        },
      ],
      pendingApprovals: [
        {
          approvalId: "approval-1",
          authorityId: "deploy",
          targetRef: "runtime-job://runtime-1",
          scopeSummary: "deploy dry-run",
          state: "pending",
          freshness: "fresh",
        },
      ],
      recentContextSummary: "bounded summary",
      authoritySnapshots: [
        {
          snapshotId: "authority-snapshot-1",
          version: "authority-version-1",
          authorityStateRefs: ["authority://deploy"],
        },
      ],
      workflowRegistryVersion: "workflow-registry-v1",
    });

    expect(context.actorId).toBe("operator");
    expect(context.sessionId).toBe("session");
    expect(context.activeRuntimeJobs[0]?.runtimeJobId).toBe("runtime-1");
    expect(context.selectedWorkQueueItem?.workItemId).toBe("work-1");
    expect(context.pendingClarifications[0]?.clarificationId).toBe("clarification-1");
    expect(context.pendingApprovals[0]?.approvalId).toBe("approval-1");
    expect(context.rawPromptStored).toBe(false);
    expect(context.rawResponseStored).toBe(false);
    expect(() => assertJsonSerializableContext(context)).not.toThrow();
  });

  it("requires actor and session and rejects raw storage flags", () => {
    expect(() =>
      buildConversationRoutingContext({
        actorId: "",
        sessionId: "session",
        sourceRoute: "ux",
      }),
    ).toThrow("actorId is required");
    expect(() =>
      buildConversationRoutingContext({
        actorId: "operator",
        sessionId: "",
        sourceRoute: "ux",
      }),
    ).toThrow("sessionId is required");
    expect(() =>
      buildConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "ux",
        rawPromptStored: true,
      }),
    ).toThrow("raw prompt/response storage is not allowed");
  });

  it("bounds recent context summary and records reason code", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      recentContextSummary: "x".repeat(CONVERSATION_CONTEXT_SUMMARY_MAX_CHARS + 10),
    });
    expect(context.recentContextSummary).toHaveLength(CONVERSATION_CONTEXT_SUMMARY_MAX_CHARS);
    expect(context.reasonCodes).toContain("recent_context_summary_bounded");
  });

  it("keeps routing, execution, selected item, clarification, and approval state distinct", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "work_queue",
      activeRuntimeJobs: [runtimeJob],
      selectedWorkQueueItem,
      lastRoute: {
        routeDecisionId: "route-1",
        route: "workflow_execution",
        workflowId: "agent_team.coding",
        runtimeJobId: "runtime-1",
        reasonCodes: ["accepted"],
      },
      pendingClarifications: [
        {
          clarificationId: "clarification-1",
          targetRef: "runtime-job://runtime-1",
          questionSummary: "Clarify.",
          freshness: "fresh",
        },
      ],
      pendingApprovals: [
        {
          approvalId: "approval-1",
          authorityId: "deploy",
          targetRef: "runtime-job://runtime-1",
          scopeSummary: "deploy",
          state: "pending",
          freshness: "fresh",
        },
      ],
    });

    expect(context.lastRoute?.route).toBe("workflow_execution");
    expect(context.activeRuntimeJobs).toHaveLength(1);
    expect(context.selectedWorkQueueItem?.runtimeJobIds).toEqual(["runtime-1"]);
    expect(context.pendingClarifications).toHaveLength(1);
    expect(context.pendingApprovals).toHaveLength(1);
  });
});
