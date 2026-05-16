import { describe, expect, it } from "vitest";
import {
  evaluateGatewayChatFrontDoorHandoffReadiness,
  buildExecutionChatAssistantText,
  buildFrontDoorHandoffFailureAssistantText,
  buildHumanOperatorDecisionAssistantText,
  isLegacyExecutionChatIntentFallbackEnabled,
  parseHumanOperatorDecisionResume,
  shouldAttemptIntentFrontDoorChatTurn,
  shouldAttemptExecutionWorkflowChatTurn,
  shouldPreserveNormalChatAfterFrontDoorSubmit,
} from "./chat.ts";

describe("chat execution workflow routing", () => {
  it("keeps deterministic English execution routing disabled by default", () => {
    const wrapped =
      'Sender (untrusted metadata):\n```json\n{"label":"openclaw-control-ui"}\n```\n\n' +
      "[Tue 2026-05-05 19:19 UTC] Use the full coding team to improve outbound " +
      "destination authority readback so Telegram, GitHub, intake, and canary destinations each " +
      "show configured, blocked, or needs-review status.";

    expect(isLegacyExecutionChatIntentFallbackEnabled({})).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn(wrapped)).toBe(false);
    expect(
      shouldAttemptExecutionWorkflowChatTurn(
        "Use the full team to improve the production audit cockpit.",
      ),
    ).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn("/compact")).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn("/new")).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn("/reset")).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn("/status")).toBe(false);
    expect(shouldAttemptExecutionWorkflowChatTurn("stop please")).toBe(false);
  });

  it("keeps legacy semantic execution fallback test-only even when the env var is set", () => {
    expect(
      isLegacyExecutionChatIntentFallbackEnabled({
        OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK: "1",
      }),
    ).toBe(false);
    expect(
      isLegacyExecutionChatIntentFallbackEnabled({
        NODE_ENV: "production",
        OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK: "1",
      }),
    ).toBe(false);
    expect(
      isLegacyExecutionChatIntentFallbackEnabled({
        NODE_ENV: "test",
        OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK: "1",
      }),
    ).toBe(true);
  });

  it("allows only low-risk temporary fallback when explicitly enabled", () => {
    expect(
      shouldAttemptExecutionWorkflowChatTurn("Have the coding team add a regression test.", {
        allowTemporaryLegacySemanticFallback: true,
      }),
    ).toBe(true);
    expect(
      shouldAttemptExecutionWorkflowChatTurn("Use the full team to improve outbound readback.", {
        allowTemporaryLegacySemanticFallback: true,
      }),
    ).toBe(false);
    expect(
      shouldAttemptExecutionWorkflowChatTurn("Deploy if policy permits.", {
        allowTemporaryLegacySemanticFallback: true,
      }),
    ).toBe(false);
  });

  it("lets English prompts continue past ProtocolPreGate without executing there", () => {
    for (const prompt of [
      "Use the full team to improve Work Queue readback.",
      "Build this small Work Queue improvement.",
      "Research current docs then implement.",
      "Do not send anything; improve outbound readback.",
      "Deploy if policy permits.",
    ]) {
      expect(shouldAttemptExecutionWorkflowChatTurn(prompt)).toBe(false);
    }
  });

  it("front-door chat attempt uses only protocol state and preserves slash command bypass", () => {
    const ownerDefaultEnv = {
      OPENCLAW_GATEWAY_CHAT_FRONT_DOOR_HANDOFF_ENABLED: "1",
      OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
      OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED: "1",
    };
    expect(shouldAttemptIntentFrontDoorChatTurn("Use the full team to improve readback.")).toBe(
      false,
    );
    expect(
      shouldAttemptIntentFrontDoorChatTurn("Use the full team to improve readback.", {
        env: ownerDefaultEnv,
      }),
    ).toBe(true);
    expect(
      shouldAttemptIntentFrontDoorChatTurn("How would you approach this?", {
        env: ownerDefaultEnv,
      }),
    ).toBe(true);
    expect(
      shouldAttemptIntentFrontDoorChatTurn("Do not send anything; improve readback.", {
        env: ownerDefaultEnv,
      }),
    ).toBe(true);
    expect(shouldAttemptIntentFrontDoorChatTurn("/compact")).toBe(false);
    expect(shouldAttemptIntentFrontDoorChatTurn("/new")).toBe(false);
    expect(shouldAttemptIntentFrontDoorChatTurn("/reset")).toBe(false);
    expect(shouldAttemptIntentFrontDoorChatTurn("stop please")).toBe(false);
  });

  it("does not swallow long planning prompts as human decision resumes", () => {
    const longPlanningPrompt = [
      "You are OpenClaw working in /root/services/openclaw-roles/live.",
      "Implement Product/Spec Planning as a Runtime Work Graph workflow.",
      "The planning mode may be plan-only or child action graph proposals.",
      "This is not a response to a pending human decision.",
    ].join("\n\n");

    expect(parseHumanOperatorDecisionResume(longPlanningPrompt)).toBeNull();
    expect(parseHumanOperatorDecisionResume("child_action_graph_proposal")).toEqual({
      runtimeJobId: null,
      humanTaskId: null,
      decision: "child_action_graph_proposal",
    });
    expect(
      parseHumanOperatorDecisionResume(
        "Decision: plan only for job native-exec-abc123 and human task human-task-def456",
      ),
    ).toEqual({
      runtimeJobId: "native-exec-abc123",
      humanTaskId: "human-task-def456",
      decision: "plan_only",
    });
  });

  it("requires gateway, owner canary, native submit, and inactive kill switch gates", () => {
    expect(evaluateGatewayChatFrontDoorHandoffReadiness({ env: {} }).allowed).toBe(false);
    expect(
      evaluateGatewayChatFrontDoorHandoffReadiness({
        env: {
          OPENCLAW_GATEWAY_CHAT_FRONT_DOOR_HANDOFF_ENABLED: "1",
          OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
          OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED: "1",
        },
      }).allowed,
    ).toBe(true);
    const killSwitched = evaluateGatewayChatFrontDoorHandoffReadiness({
      env: {
        OPENCLAW_GATEWAY_CHAT_FRONT_DOOR_HANDOFF_ENABLED: "1",
        OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
        OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED: "1",
        OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE: "1",
      },
    });
    expect(killSwitched.allowed).toBe(false);
    expect(killSwitched.reasonCodes).toContain("live_router_kill_switch_active");
    expect(killSwitched.rawPromptStored).toBe(false);
    expect(killSwitched.workQueueLifecycleMutated).toBe(false);
  });

  it("preserves normal chat when front-door routing is unavailable or non-execution", () => {
    expect(
      shouldPreserveNormalChatAfterFrontDoorSubmit({
        accepted: false,
        runtimeJobId: null,
        reasonCodes: ["structured_model_intent_router_provider_not_configured"],
      }),
    ).toBe(true);
    expect(
      shouldPreserveNormalChatAfterFrontDoorSubmit({
        accepted: false,
        runtimeJobId: null,
        frontDoorRouterResult: {
          output: { route: "chat_response" },
        },
      }),
    ).toBe(true);
    expect(
      shouldPreserveNormalChatAfterFrontDoorSubmit({
        accepted: false,
        runtimeJobId: null,
        frontDoorCompiledRequest: {
          artifactKind: "front_door_compiled_plan_only",
        },
      }),
    ).toBe(true);
    expect(
      shouldPreserveNormalChatAfterFrontDoorSubmit({
        accepted: true,
        runtimeJobId: "runtime-job-1",
        frontDoorRouterResult: {
          output: { route: "workflow_execution" },
        },
      }),
    ).toBe(false);
  });

  it("synthesizes human-readable workflow closeout details", () => {
    const message = buildExecutionChatAssistantText({
      accepted: true,
      workflowId: "agent_team.qa_test",
      runtimeJobId: "runtime-job-1",
      teamRunId: "team-run-1",
      completed: true,
      failed: false,
      closeoutState: "present",
      reasonCodes: [],
      closeout: {
        closeoutQuality: {
          accepted: true,
          needsReview: false,
          goalSatisfaction: "satisfied",
          limitations: [],
          requiredFixes: [],
        },
        humanCloseoutSummary: {
          whatChanged: "QA reviewed the closeout evidence.",
          result: "accepted",
          filesTouched: [
            "extensions/execution-platform/src/codex-bridge/agent-team-result-review.ts",
          ],
          testsRun: ["focused QA closeout test"],
          limitations: ["bounded fixture"],
          eli5Progress: "The report now says what happened in plain English.",
        },
        agentTeam: {
          roleAssignments: [
            { roleId: "qa_test_reviewer", modelId: "local_codex", status: "completed" },
          ],
          roster: [{ roleId: "qa_test_reviewer", modelId: "local_codex" }],
          permissionEvidence: {
            permissionModelId: "permission-model://agent_team.qa_test/test-review-readback.v1",
            decision: "allowed_workflow_scope",
          },
        },
      },
    });

    expect(message).toContain("Workflow selected: agent_team.qa_test");
    expect(message).toContain("Roles used: qa_test_reviewer");
    expect(message).toContain("Permission model: permission-model://agent_team.qa_test");
    expect(message).toContain("What changed: QA reviewed the closeout evidence.");
    expect(message).toContain("ELI5: The report now says what happened in plain English.");
    expect(message).not.toContain("raw prompt");
  });

  it("reports front-door handoff exceptions without falling back to ordinary chat tools", () => {
    const message = buildFrontDoorHandoffFailureAssistantText({
      reasonCodes: ["front_door_handoff_exception", "ordinary_chat_fallback_suppressed"],
    });

    expect(message).toContain("front-door handoff failed");
    expect(message).toContain("did not fall back to ordinary chat/tool execution");
    expect(message).toContain("ordinary_chat_fallback_suppressed");
    expect(message).not.toContain("raw prompt");
  });

  it("renders owner human decisions as plain-language choices instead of generic needs-review text", () => {
    const message = buildHumanOperatorDecisionAssistantText({
      workflowId: "agent_team.coding",
      runtimeJobId: "native-exec-1",
      metadata: {
        waitingForOwnerPrompt: true,
        decisionTitle: "Product/Spec Planning output mode",
        decisionSummary:
          "Choose whether this run should stop at a written plan or create review-gated child action graph proposals.",
        options: [
          {
            label: "Child action graph proposal",
            recommended: true,
            impact: "Creates proposed child actions for Work Queue review.",
          },
          {
            label: "Plan only",
            recommended: false,
            impact: "Keeps the output as a written plan.",
          },
        ],
        naturalLanguageInstruction:
          "Reply in OpenClaw with your choice in plain language, for example: choose child action graph proposals.",
        technicalResumeRefs: {
          humanTaskId: "human-task-1",
        },
      },
    });

    expect(message).toContain("OpenClaw is paused for your decision.");
    expect(message).toContain("Product/Spec Planning output mode");
    expect(message).toContain("Child action graph proposal (recommended)");
    expect(message).toContain("Reply in OpenClaw with your choice");
    expect(message).toContain("Runtime job: native-exec-1");
    expect(message).toContain("Human task: human-task-1");
    expect(message).not.toContain("Execution Platform needs review");
  });
});
