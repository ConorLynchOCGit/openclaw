import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { enforceActionSemantics } from "./action-semantics.ts";
import { compileChildWorkflowHandoff } from "./child-workflow-handoff-compiler.ts";
import { createFixtureRouterWithDefaultCases } from "./fake-structured-router.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { compileMultiIntentPlan } from "./multi-intent-plan-compiler.ts";
import { compileFrontDoorRequest } from "./request-compiler.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
  generatedAt: "2026-05-06T00:00:00.000Z",
});
const coding = DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows.find(
  (workflow) => workflow.workflowId === "agent_team.coding",
)!;
const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };
const authority = { snapshotFresh: true, supportedAuthorityProfiles: ["read_only", "local_yolo"] };

describe("Intent Front Door Slices 15-17 integration", () => {
  it("routes fake coding output through validator, action semantics, and request compiler", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const routed = await router.route({ fixtureId: "coding", promptHash: "prompt-hash" });
    const validation = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(routed.output),
      workflowSummaryIndex,
      auth,
      authority,
    });
    const actionSemantics = enforceActionSemantics({
      requestedActions: routed.output.requestedActions,
      conditionalActions: routed.output.conditionalActions,
      mentionedActions: routed.output.mentionedActions,
      negatedActions: routed.output.negatedActions,
    });
    const compiled = compileFrontDoorRequest({
      requestId: "runtime-job://integration",
      routerOutput: routed.output,
      validation,
      actionSemantics,
      workflow: coding,
      operator: { actorId: "operator", sessionId: "session-1" },
      promptHash: routed.metadata.promptHash,
      promptSummary: "bounded coding prompt summary",
    });

    expect(compiled).toMatchObject({
      artifactKind: "front_door_compiled_runtime_job_request",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    if (compiled.artifactKind !== "front_door_compiled_runtime_job_request") {
      throw new Error("expected runtime job compile result");
    }
    expect(compiled.runtimeJobCreateRequest.payload).toMatchObject({
      promptHash: "prompt-hash",
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("prevents negated send and held conditional deploy from compiling side effects", () => {
    const blockedSend = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: coding.jobType,
      confidence: 0.95,
      requestedActions: [createCanonicalRouterAction("outbound_send", "send notice", 0.9)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    expect(() =>
      compileFrontDoorRequest({
        requestId: "blocked-send",
        routerOutput: blockedSend,
        validation: validateIntentFrontDoorDecision({
          parseResult: parseCanonicalRouterOutput(blockedSend),
          workflowSummaryIndex,
          auth,
          authority,
        }),
        actionSemantics: enforceActionSemantics({
          requestedActions: blockedSend.requestedActions,
          negatedActions: blockedSend.negatedActions,
        }),
        workflow: coding,
        operator: { actorId: "operator", sessionId: "session-1" },
        promptHash: "prompt-hash",
        promptSummary: "bounded",
      }),
    ).toThrow(/action semantics outcome/iu);

    const deployHeld = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: coding.jobType,
      confidence: 0.95,
      requestedActions: [createCanonicalRouterAction("code_edit", "edit", 0.9)],
      conditionalActions: [createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const compiled = compileFrontDoorRequest({
      requestId: "deploy-held",
      routerOutput: deployHeld,
      validation: validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(deployHeld),
        workflowSummaryIndex,
        auth,
        authority,
      }),
      actionSemantics: enforceActionSemantics({
        requestedActions: deployHeld.requestedActions,
        conditionalActions: deployHeld.conditionalActions,
      }),
      workflow: coding,
      operator: { actorId: "operator", sessionId: "session-1" },
      promptHash: "prompt-hash",
      promptSummary: "bounded",
    });
    expect(compiled.compiledActions.map((action) => action.action)).toEqual(["code_edit"]);
  });

  it("compiles research-then-implement multi-intent plan and child handoff", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const routed = await router.route({ fixtureId: "multi_research_then_code" });
    const validation = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(routed.output),
      workflowSummaryIndex,
      auth,
      authority,
      strongerRouterResultPresent: true,
    });
    const plan = compileMultiIntentPlan({
      routerOutput: routed.output,
      validation,
      workflowContracts: DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows,
      authorityProofRefsByStep: {
        1: ["authority://outbound_readonly"],
        2: ["authority://local_yolo"],
      },
    });
    expect(plan.outcome).toBe("compiled");

    const child = compileChildWorkflowHandoff({
      registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
      parentWorkflow: coding,
      request: routed.output.childWorkflowRequests[0]!,
      parentRuntimeJobId: "runtime-job://parent",
      parentAuthorityProfile: "local_yolo",
    });
    expect(child).toMatchObject({
      validationStatus: "accepted",
      childWorkflowId: "single_agent.web_research",
      authorityGranted: false,
      runtimeJobCreated: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("blocks mandatory child failure while optional child failure only continues when allowed", () => {
    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: {
          childWorkflowId: "workflow.missing",
          requirement: "mandatory",
          reasonCodes: ["missing_child"],
          requestedAuthority: "read_only",
          boundedInputSummary: "Missing mandatory child.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        parentAuthorityProfile: "local_yolo",
      }).failureBehavior,
    ).toBe("block_parent_success");
    expect(
      compileChildWorkflowHandoff({
        registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
        parentWorkflow: coding,
        request: {
          childWorkflowId: "workflow.missing",
          requirement: "optional",
          reasonCodes: ["missing_child"],
          requestedAuthority: "read_only",
          boundedInputSummary: "Missing optional child.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        parentAuthorityProfile: "local_yolo",
        optionalFailureAllowed: true,
      }).failureBehavior,
    ).toBe("continue_if_optional_allowed");
  });
});
