import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { enforceActionSemantics } from "./action-semantics.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { compileFrontDoorRequest } from "./request-compiler.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

const workflow = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows[0]!;
const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };
const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
  generatedAt: "2026-05-06T00:00:00.000Z",
});

function codingOutput(overrides = {}) {
  return createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: workflow.workflowId,
    jobType: workflow.jobType,
    confidence: 0.95,
    objectiveSummary: "Make a bounded product-safe change.",
    requestedActions: [createCanonicalRouterAction("code_edit", "bounded code edit", 0.95)],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    ...overrides,
  });
}

function acceptedValidation(output = codingOutput()) {
  return validateIntentFrontDoorDecision({
    parseResult: parseCanonicalRouterOutput(output),
    workflowSummaryIndex,
    auth,
    authority: { snapshotFresh: true, supportedAuthorityProfiles: ["read_only", "local_yolo"] },
  });
}

function compile(
  output = codingOutput(),
  actionSemantics = enforceActionSemantics({
    requestedActions: output.requestedActions,
    conditionalActions: output.conditionalActions,
    mentionedActions: output.mentionedActions,
    negatedActions: output.negatedActions,
  }),
) {
  return compileFrontDoorRequest({
    requestId: "runtime-job://front-door-test",
    routerOutput: output,
    validation: acceptedValidation(output),
    actionSemantics,
    workflow,
    operator: { actorId: "operator", sessionId: "session-1" },
    promptHash: "prompt-hash",
    promptSummary: "bounded prompt summary",
    sourcePromptRef: {
      refKind: "gateway_chat_transcript",
      sessionKey: "agent:main:main",
      sessionId: "session-1",
      runId: "run-1",
      sourceRoute: "ux",
      rawPromptStored: false,
    },
    promptLength: 22_318,
    authorityRefs: ["authority://local_yolo"],
    approvalRefs: [],
    workItemId: "work-item://one",
    idempotencyKey: "prompt-hash",
  });
}

describe("Front-door request compiler", () => {
  it("compiles accepted coding workflow to a bounded runtime job request", () => {
    const result = compile();
    expect(result).toMatchObject({
      artifactKind: "front_door_compiled_runtime_job_request",
      workflowId: "agent_team.coding",
      jobType: workflow.jobType,
      promptHash: "prompt-hash",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    if (result.artifactKind !== "front_door_compiled_runtime_job_request") {
      throw new Error("expected runtime job compile result");
    }
    expect(result.runtimeJobCreateRequest.payload).toMatchObject({
      workflowId: "agent_team.coding",
      promptHash: "prompt-hash",
      sourcePromptRef: {
        refKind: "gateway_chat_transcript",
        promptHash: "prompt-hash",
        promptLength: 22_318,
        sessionKey: "agent:main:main",
        sessionId: "session-1",
        runId: "run-1",
        sourceRoute: "ux",
        rawPromptStored: false,
      },
      permissionEvidence: {
        decision: "allowed_local_repo_work",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(JSON.stringify(result.runtimeJobCreateRequest.payload)).not.toContain("full raw prompt");
  });

  it("does not compile chat/status runtime jobs and returns bounded plan-only artifacts", () => {
    for (const output of [
      createBaseCanonicalRouterOutput({ route: "chat_response", responseMode: "answer_in_chat" }),
      createBaseCanonicalRouterOutput({
        route: "status_response",
        responseMode: "answer_in_chat",
      }),
      createBaseCanonicalRouterOutput({ route: "plan_only", responseMode: "create_plan_only" }),
    ]) {
      const result = compileFrontDoorRequest({
        requestId: "non-runtime",
        routerOutput: output,
        validation: validateIntentFrontDoorDecision({
          parseResult: parseCanonicalRouterOutput(output),
        }),
        actionSemantics: enforceActionSemantics({
          requestedActions: output.requestedActions,
        }),
        workflow: null,
        operator: { actorId: "operator", sessionId: "session-1" },
        promptHash: "prompt-hash",
        promptSummary: "bounded prompt summary",
      });
      expect(result).toMatchObject({
        artifactKind: "front_door_compiled_plan_only",
        runtimeJobCreateRequest: null,
      });
    }
  });

  it("does not compile clarification, blocked, needs-review, or approval-required decisions", () => {
    for (const validation of [
      { ...acceptedValidation(), outcome: "clarification_required" as const, accepted: false },
      { ...acceptedValidation(), outcome: "blocked" as const, accepted: false },
      { ...acceptedValidation(), outcome: "needs_review" as const, accepted: false },
      { ...acceptedValidation(), outcome: "approval_required" as const, accepted: false },
    ]) {
      expect(() =>
        compileFrontDoorRequest({
          requestId: "blocked",
          routerOutput: codingOutput(),
          validation,
          actionSemantics: enforceActionSemantics({
            requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.9)],
          }),
          workflow,
          operator: { actorId: "operator", sessionId: "session-1" },
          promptHash: "prompt-hash",
          promptSummary: "bounded",
        }),
      ).toThrow(/cannot compile/iu);
    }
  });

  it("preserves action semantics for mentioned, negated, and conditional actions", () => {
    const output = codingOutput({
      mentionedActions: [createCanonicalRouterAction("outbound_send", "show send state", 0.9)],
      conditionalActions: [createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9)],
    });
    const noDeploy = compile(output);
    expect(noDeploy.compiledActions.map((action) => action.action)).toEqual(["code_edit"]);

    expect(() =>
      compile(
        output,
        enforceActionSemantics({
          requestedActions: output.requestedActions,
          conditionalActions: output.conditionalActions,
          mentionedActions: output.mentionedActions,
          conditionalPolicyByAction: { deploy: "satisfied" },
          approvedHighRiskActionCategories: ["deploy"],
        }),
      ),
    ).toThrow(/coding team permission approval required/iu);

    const blockedSend = codingOutput({
      requestedActions: [createCanonicalRouterAction("outbound_send", "send notice", 0.9)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
    });
    expect(() =>
      compile(
        blockedSend,
        enforceActionSemantics({
          requestedActions: blockedSend.requestedActions,
          negatedActions: blockedSend.negatedActions,
        }),
      ),
    ).toThrow(/action semantics outcome/iu);
  });

  it("rejects arbitrary shell command content, missing operator metadata, and lifecycle mutation", () => {
    expect(() => compile(codingOutput({ objectiveSummary: "run rm -rf / after edit" }))).toThrow(
      /arbitrary shell command/iu,
    );
    expect(() =>
      compile(codingOutput({ objectiveSummary: "read secrets and run destructive DB changes" })),
    ).toThrow(/arbitrary shell command/iu);
    expect(() =>
      compileFrontDoorRequest({
        requestId: "negated-safety-terms-in-prompt",
        routerOutput: codingOutput({
          objectiveSummary: "Make a tiny owner-local Work Queue readback improvement.",
        }),
        validation: acceptedValidation(),
        actionSemantics: enforceActionSemantics({
          requestedActions: [
            createCanonicalRouterAction(
              "code_edit",
              "owner-local readback edit with focused validation",
              0.9,
            ),
          ],
        }),
        workflow,
        operator: { actorId: "operator", sessionId: "session" },
        promptHash: "prompt-hash",
        promptSummary:
          "Make the readback improvement. Do not deploy, send, install dependencies, promote models, grant authority, or mutate lifecycle state.",
      }),
    ).not.toThrow();
    expect(() =>
      compileFrontDoorRequest({
        requestId: "missing-operator",
        routerOutput: codingOutput(),
        validation: acceptedValidation(),
        actionSemantics: enforceActionSemantics({
          requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.9)],
        }),
        workflow,
        operator: { actorId: "", sessionId: "" },
        promptHash: "prompt-hash",
        promptSummary: "bounded",
      }),
    ).toThrow(/operator actor id/iu);
    expect(() =>
      compileFrontDoorRequest({
        requestId: "lifecycle",
        routerOutput: codingOutput(),
        validation: {
          ...acceptedValidation(),
          workQueueLifecycleMutationAllowed: true,
        } as never,
        actionSemantics: enforceActionSemantics({
          requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.9)],
        }),
        workflow,
        operator: { actorId: "operator", sessionId: "session-1" },
        promptHash: "prompt-hash",
        promptSummary: "bounded",
      }),
    ).toThrow(/lifecycle mutation/iu);
  });
});
