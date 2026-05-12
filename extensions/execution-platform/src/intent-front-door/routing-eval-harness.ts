import { getWorkflowContract, type WorkflowRegistry } from "../workflows/workflow-registry.ts";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { enforceActionSemantics } from "./action-semantics.ts";
import { compileChildWorkflowHandoff } from "./child-workflow-handoff-compiler.ts";
import { runClarificationGate, type ClarificationGateDecision } from "./clarification-gate.ts";
import {
  buildConversationRoutingContext,
  type ConversationRoutingContext,
} from "./conversation-routing-context.ts";
import {
  validateIntentFrontDoorDecision,
  type IntentValidationDecision,
} from "./intent-validator.ts";
import {
  compileMultiIntentPlan,
  type MultiIntentPlanCompileDecision,
} from "./multi-intent-plan-compiler.ts";
import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import { compileFrontDoorRequest, type FrontDoorCompileResult } from "./request-compiler.ts";
import {
  evaluateRouterEscalationPolicy,
  type RouterEscalationDecision,
} from "./router-escalation-policy.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  parseCanonicalRouterOutput,
  type CanonicalRouterOutput,
} from "./router-schema.ts";
import {
  ROUTING_EVAL_CORPUS,
  ROUTING_EVAL_CORPUS_VERSION,
  type RoutingEvalCase,
} from "./routing-eval-corpus.ts";
import {
  createRoutingTelemetryRecord,
  InMemoryRoutingTelemetryStore,
  type RoutingTelemetryStore,
} from "./routing-telemetry-store.ts";
import {
  buildStructuredModelIntentRouterRequest,
  StructuredModelIntentRouter,
  type StructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterResult,
} from "./structured-model-intent-router.ts";
import {
  buildWorkflowSummaryIndex,
  selectWorkflowSummaryCandidates,
} from "./workflow-summary-index.ts";

export const ROUTING_EVAL_HARNESS_VERSION = "intent-front-door.routing-eval-harness.v1";

export type RoutingEvalHardFailureKind =
  | "high_risk_false_allow"
  | "raw_storage_allow"
  | "work_queue_lifecycle_mutation"
  | "production_side_effect_outside_scope"
  | "unexpected_runtime_job_created"
  | "authority_granted_from_untrusted_text"
  | "slash_command_routed_to_model"
  | "malicious_injection_false_allow";

export type RoutingEvalCaseResult = {
  artifactKind: "intent_front_door_routing_eval_case_result";
  evalCaseId: string;
  category: RoutingEvalCase["category"];
  passed: boolean;
  routeMatched: boolean;
  runtimeJobCreated: boolean;
  expectedRuntimeJobCreated: boolean;
  validatorOutcome: IntentValidationDecision["outcome"] | "protocol_bypass" | "schema_invalid";
  expectedValidatorOutcome: RoutingEvalCase["expected"]["validatorOutcome"];
  clarificationRequired: boolean;
  expectedClarificationRequired: boolean;
  escalationOutcome: RouterEscalationDecision["outcome"] | "protocol_bypass";
  schemaValid: boolean;
  falseAllow: boolean;
  falseBlock: boolean;
  hardFailures: Array<{
    kind: RoutingEvalHardFailureKind;
    reasonCodes: string[];
  }>;
  reasonCodes: string[];
  latencyMs: number;
  rawPromptStored: false;
  rawResponseStored: false;
  providerCallMade: false;
  workQueueLifecycleMutated: false;
};

export type RoutingEvalHarnessRunResult = {
  artifactKind: "intent_front_door_routing_eval_harness_run";
  harnessVersion: typeof ROUTING_EVAL_HARNESS_VERSION;
  evalRunId: string;
  corpusVersion: typeof ROUTING_EVAL_CORPUS_VERSION;
  routerProfileId: string;
  routerSchemaVersion: typeof CANONICAL_ROUTER_SCHEMA_VERSION;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  totalCases: number;
  passedCount: number;
  failedCount: number;
  routeAccuracy: number;
  falseAllows: number;
  falseBlocks: number;
  clarificationRate: number;
  schemaFailures: number;
  escalationCount: number;
  blockedCount: number;
  latencyMs: {
    total: number;
    average: number;
  };
  hardFailures: RoutingEvalCaseResult["hardFailures"];
  caseResults: RoutingEvalCaseResult[];
  artifactRefs: string[];
  status: "passed" | "failed";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  providerCallsMade: false;
  runtimeJobsCreated: false;
  workQueueLifecycleMutated: false;
};

type RoutingEvalHarnessInput = {
  evalRunId?: string;
  corpus?: RoutingEvalCase[];
  registry?: WorkflowRegistry;
  routerProfileId?: string;
  telemetryStore?: RoutingTelemetryStore;
};

class EvalFixtureRouterProvider implements StructuredModelIntentRouterProvider {
  constructor(private readonly output: CanonicalRouterOutput) {}

  async route() {
    return {
      output: this.output,
      providerRef: "fixture://routing-eval-harness",
      modelCandidateId: "fixture-router",
      providerCallMade: false,
      reasonCodes: ["routing_eval_fixture_router"],
    };
  }
}

export async function runRoutingEvalHarness(
  input: RoutingEvalHarnessInput = {},
): Promise<RoutingEvalHarnessRunResult> {
  const registry = input.registry ?? DEFAULT_EXECUTION_WORKFLOW_REGISTRY;
  const index = buildWorkflowSummaryIndex(registry);
  const evalRunId = input.evalRunId ?? `routing-eval-${Date.now()}`;
  const telemetryStore = input.telemetryStore ?? new InMemoryRoutingTelemetryStore();
  const corpus = input.corpus ?? ROUTING_EVAL_CORPUS;
  const caseResults: RoutingEvalCaseResult[] = [];
  for (const evalCase of corpus) {
    caseResults.push(
      await runRoutingEvalCase({
        evalRunId,
        evalCase,
        registry,
        workflowRegistryVersion: index.workflowRegistryVersion,
        telemetryStore,
      }),
    );
  }
  const hardFailures = caseResults.flatMap((result) => result.hardFailures);
  const totalLatency = caseResults.reduce((sum, result) => sum + result.latencyMs, 0);
  const passedCount = caseResults.filter((result) => result.passed).length;
  const totalCases = caseResults.length;
  const routeMatches = caseResults.filter((result) => result.routeMatched).length;
  const clarificationCount = caseResults.filter((result) => result.clarificationRequired).length;
  const schemaFailures = caseResults.filter((result) => !result.schemaValid).length;
  const escalationCount = caseResults.filter(
    (result) => !["use_default_router", "protocol_bypass"].includes(result.escalationOutcome),
  ).length;
  const blockedCount = caseResults.filter(
    (result) =>
      result.validatorOutcome === "blocked" || result.validatorOutcome === "schema_invalid",
  ).length;
  return {
    artifactKind: "intent_front_door_routing_eval_harness_run",
    harnessVersion: ROUTING_EVAL_HARNESS_VERSION,
    evalRunId,
    corpusVersion: ROUTING_EVAL_CORPUS_VERSION,
    routerProfileId: input.routerProfileId ?? "fixture-structured-router",
    routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
    workflowRegistryVersion: index.workflowRegistryVersion,
    authoritySnapshotVersion: "authority:v1",
    totalCases,
    passedCount,
    failedCount: totalCases - passedCount,
    routeAccuracy: totalCases === 0 ? 0 : routeMatches / totalCases,
    falseAllows: caseResults.filter((result) => result.falseAllow).length,
    falseBlocks: caseResults.filter((result) => result.falseBlock).length,
    clarificationRate: totalCases === 0 ? 0 : clarificationCount / totalCases,
    schemaFailures,
    escalationCount,
    blockedCount,
    latencyMs: {
      total: totalLatency,
      average: totalCases === 0 ? 0 : totalLatency / totalCases,
    },
    hardFailures,
    caseResults,
    artifactRefs: [],
    status: hardFailures.length === 0 && passedCount === totalCases ? "passed" : "failed",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    providerCallsMade: false,
    runtimeJobsCreated: false,
    workQueueLifecycleMutated: false,
  };
}

async function runRoutingEvalCase(input: {
  evalRunId: string;
  evalCase: RoutingEvalCase;
  registry: WorkflowRegistry;
  workflowRegistryVersion: string;
  telemetryStore: RoutingTelemetryStore;
}): Promise<RoutingEvalCaseResult> {
  const started = Date.now();
  const evalCase = input.evalCase;
  if (evalCase.category === "slash_protocol") {
    const preGate = runProtocolPreGate({
      text: "/compact",
      sourceRoute: evalCase.sourceRoute,
      auth: { authenticated: true, actorId: "operator", sessionId: "routing-eval" },
      requireAuthentication: true,
      contentMetadata: { hasText: true, inputByteLength: 8 },
    });
    const routedToModel = preGate.kind === "continue_to_intent_routing";
    return caseResult({
      evalCase,
      started,
      routeMatched: !routedToModel,
      runtimeJobCreated: false,
      validatorOutcome: "protocol_bypass",
      clarificationRequired: false,
      escalationOutcome: "protocol_bypass",
      schemaValid: true,
      reasonCodes: preGate.reasonCodes,
      hardFailures: routedToModel
        ? [{ kind: "slash_command_routed_to_model", reasonCodes: ["slash_command_not_bypassed"] }]
        : [],
    });
  }

  const context = contextForEvalCase(evalCase, input.workflowRegistryVersion);
  const index = buildWorkflowSummaryIndex(input.registry);
  const candidates = selectWorkflowSummaryCandidates({ index, context, maxCandidates: 8 });
  const router = new StructuredModelIntentRouter(
    new EvalFixtureRouterProvider(evalCase.routerOutput),
  );
  const routerRequest = buildStructuredModelIntentRouterRequest({
    promptHash: evalCase.promptHash,
    promptSummary: evalCase.boundedPromptSummary,
    conversationContext: context,
    workflowSummaryIndex: index,
    workflowCandidateSelection: candidates,
    routerModelPolicyRef: "router-model-policy://routing-eval/fixture",
    sourceRoute: evalCase.sourceRoute,
    requestId: `${input.evalRunId}:${evalCase.evalCaseId}`,
    sessionId: "routing-eval",
    reasonCodes: ["routing_eval_harness_request"],
  });
  const routed = await router.route(routerRequest);
  const parseResult = parseCanonicalRouterOutput(routed.output);
  const escalation = evaluateRouterEscalationPolicy({
    routerOutput: routed.output,
    schemaValid: routed.valid,
    schemaReasonCodes: routed.parseResult.reasonCodes,
    providerState: evalCase.providerState,
    authoritySnapshotFresh: evalCase.authoritySnapshotFresh,
    workflowRegistryVersionMatches: true,
    maliciousToolOutputSignal: evalCase.maliciousToolOutputSignal,
  });
  const validation = validateIntentFrontDoorDecision({
    parseResult,
    conversationContext: context,
    workflowSummaryIndex: index,
    auth: { authenticated: true, actorId: "operator", sessionId: "routing-eval" },
    authority: {
      snapshotFresh: evalCase.authoritySnapshotFresh,
      supportedAuthorityProfiles: [
        "local_yolo",
        "read_only",
        "work_queue_control",
        "production_deploy",
        "production_model_promotion",
      ],
      defaultEnabledAuthorityProfiles: ["local_yolo", "read_only", "work_queue_control"],
      approvalRequiredAuthorityProfiles: ["production_deploy", "production_model_promotion"],
    },
    escalationDecision: escalation,
    strongerRouterResultPresent: true,
  });
  const actionSemantics = enforceActionSemantics({
    mentionedActions: evalCase.routerOutput.mentionedActions,
    requestedActions: evalCase.routerOutput.requestedActions,
    negatedActions: evalCase.routerOutput.negatedActions,
    conditionalActions: evalCase.routerOutput.conditionalActions,
  });
  const clarification = runClarificationGate({
    routerOutput: evalCase.routerOutput,
    validation,
    escalationDecision: escalation,
    conversationContext: context,
    actionSemantics,
    requestId: `${input.evalRunId}:${evalCase.evalCaseId}`,
    sessionId: "routing-eval",
    actorId: "operator",
    promptHash: evalCase.promptHash,
    promptSummary: evalCase.boundedPromptSummary,
    now: new Date("2026-05-06T00:00:00.000Z"),
  });
  const compiled = compileIfAllowed({
    evalCase,
    registry: input.registry,
    validation,
    actionSemantics,
    clarification,
  });
  const runtimeJobCreated =
    compiled?.artifactKind === "front_door_compiled_runtime_job_request" &&
    evalCase.routerOutput.route !== "work_queue_control";
  await recordEvalTelemetry({
    evalRunId: input.evalRunId,
    evalCase,
    routed,
    validation,
    clarification,
    telemetryStore: input.telemetryStore,
  });
  return caseResult({
    evalCase,
    started,
    routeMatched: evalCase.expected.route === evalCase.routerOutput.route,
    runtimeJobCreated,
    validatorOutcome: validation.outcome,
    clarificationRequired: clarification.outcome === "clarification_required",
    escalationOutcome: escalation.outcome,
    schemaValid: routed.valid,
    reasonCodes: [
      ...routed.metadata.reasonCodes,
      ...escalation.reasonCodes,
      ...validation.reasonCodes,
      ...actionSemantics.reasonCodes,
      ...clarification.reasonCodes,
    ],
    hardFailures: hardFailuresForCase({
      evalCase,
      runtimeJobCreated,
      validation,
      routed,
    }),
  });
}

function contextForEvalCase(
  evalCase: RoutingEvalCase,
  workflowRegistryVersion: string,
): ConversationRoutingContext {
  return buildConversationRoutingContext({
    actorId: "operator",
    sessionId: "routing-eval",
    sourceRoute: evalCase.sourceRoute,
    recentContextSummary: evalCase.boundedContextSummary,
    selectedWorkQueueItem: evalCase.selectedWorkQueueItemRef
      ? {
          workItemId: evalCase.selectedWorkQueueItemRef.replace("work-item://", ""),
          itemType: "execution_workflow",
          titleSummary: "Selected Work Queue item",
          lifecycleState: "running",
          runtimeJobIds: evalCase.activeRuntimeJobRefs.map((job) => job.runtimeJobId),
          updatedAt: "2026-05-06T00:00:00.000Z",
          freshness: evalCase.selectedWorkQueueItemFreshness ?? "unknown",
        }
      : null,
    activeRuntimeJobs: evalCase.activeRuntimeJobRefs.map((job) => ({
      runtimeJobId: job.runtimeJobId,
      jobType: job.jobType,
      queueName: "routing-eval",
      state: job.state,
      workItemId: evalCase.selectedWorkQueueItemRef?.replace("work-item://", "") ?? null,
      workflowId: job.workflowId,
      updatedAt: "2026-05-06T00:00:00.000Z",
      freshness: job.freshness,
    })),
    authoritySnapshots: [
      {
        snapshotId: evalCase.authoritySnapshotRef,
        version: evalCase.authoritySnapshotVersion,
        authorityStateRefs: ["authority://local_yolo", "authority://read_only"],
        createdAt: "2026-05-06T00:00:00.000Z",
      },
    ],
    workflowRegistryVersion,
    reasonCodes: ["routing_eval_context"],
  });
}

function compileIfAllowed(input: {
  evalCase: RoutingEvalCase;
  registry: WorkflowRegistry;
  validation: IntentValidationDecision;
  actionSemantics: ReturnType<typeof enforceActionSemantics>;
  clarification: ClarificationGateDecision;
}): FrontDoorCompileResult | MultiIntentPlanCompileDecision | null {
  if (input.clarification.outcome === "clarification_required") {
    return null;
  }
  if (
    input.validation.outcome === "blocked" ||
    input.validation.outcome === "needs_review" ||
    input.validation.outcome === "approval_required"
  ) {
    return null;
  }
  if (input.evalCase.routerOutput.route === "work_queue_control") {
    return null;
  }
  if (input.evalCase.routerOutput.route === "multi_workflow_plan") {
    compileMultiIntentPlan({
      routerOutput: input.evalCase.routerOutput,
      validation: input.validation,
      workflowContracts: input.registry.workflows,
      authorityProofRefsByStep: Object.fromEntries(
        input.evalCase.routerOutput.multiIntentPlan
          .filter((step) => step.authorityProfile)
          .map((step) => [step.order, [`authority://${step.authorityProfile}`]]),
      ),
    });
  }
  const workflow = getWorkflowContract(input.registry, input.evalCase.routerOutput.workflowId);
  if (!workflow && input.evalCase.routerOutput.route !== "plan_only") {
    return null;
  }
  const compiled = compileFrontDoorRequest({
    requestId: `routing-eval:${input.evalCase.evalCaseId}`,
    routerOutput: input.evalCase.routerOutput,
    validation: input.validation,
    actionSemantics: input.actionSemantics,
    workflow,
    operator: { actorId: "operator", sessionId: "routing-eval" },
    promptHash: input.evalCase.promptHash,
    promptSummary: input.evalCase.boundedPromptSummary,
    authorityRefs: ["authority://local_yolo", "authority://read_only"],
  });
  if (input.evalCase.routerOutput.childWorkflowRequests.length > 0 && workflow) {
    input.evalCase.routerOutput.childWorkflowRequests.map((request) =>
      compileChildWorkflowHandoff({
        registry: input.registry,
        parentWorkflow: workflow,
        request,
        parentRuntimeJobId: `routing-eval:${input.evalCase.evalCaseId}`,
        parentAuthorityProfile:
          input.evalCase.routerOutput.requestedAuthority ?? workflow.defaultAuthorityProfile,
      }),
    );
  }
  return compiled;
}

async function recordEvalTelemetry(input: {
  evalRunId: string;
  evalCase: RoutingEvalCase;
  routed: StructuredModelIntentRouterResult;
  validation: IntentValidationDecision;
  clarification: ClarificationGateDecision;
  telemetryStore: RoutingTelemetryStore;
}): Promise<void> {
  await input.telemetryStore.write(
    createRoutingTelemetryRecord({
      artifactKind: "intent_front_door_routing_telemetry_record",
      routeDecisionId: `${input.evalRunId}:${input.evalCase.evalCaseId}`,
      promptHash: input.evalCase.promptHash,
      promptSummary: input.evalCase.boundedPromptSummary,
      route: input.routed.output?.route ?? null,
      workflowId: input.routed.output?.workflowId ?? null,
      jobType: input.routed.output?.jobType ?? null,
      responseMode: input.routed.output?.responseMode ?? null,
      executeNow: input.routed.output?.executeNow ?? null,
      confidence: input.routed.output?.confidence ?? null,
      modelCandidateRef: input.routed.metadata.modelCandidateId,
      routerConfigVersion: input.routed.routerConfigVersion,
      routerSchemaVersion: input.routed.schemaVersion,
      workflowRegistryVersion: input.routed.metadata.workflowRegistryVersion,
      authoritySnapshotVersion: input.evalCase.authoritySnapshotVersion,
      authSessionVersion: "auth:routing-eval",
      conversationContextVersion: "context:routing-eval",
      validatorOutcome: input.validation.outcome,
      escalationOutcome: null,
      clarificationOutcome: input.clarification.outcome,
      actionSemanticsOutcome: null,
      compilerOutcome: null,
      outcome:
        input.validation.outcome === "accepted"
          ? "accepted"
          : input.validation.outcome === "approval_required"
            ? "approval_required"
            : input.validation.outcome === "clarification_required"
              ? "clarification_required"
              : input.validation.outcome === "needs_review"
                ? "needs_review"
                : input.validation.outcome === "blocked"
                  ? "blocked"
                  : "chat_status_plan_only",
      correctionSignal: null,
      reasonCodes: input.validation.reasonCodes,
      artifactRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  );
}

function hardFailuresForCase(input: {
  evalCase: RoutingEvalCase;
  runtimeJobCreated: boolean;
  validation: IntentValidationDecision;
  routed: StructuredModelIntentRouterResult;
}): RoutingEvalCaseResult["hardFailures"] {
  const failures: RoutingEvalCaseResult["hardFailures"] = [];
  const output = input.routed.output;
  if (input.runtimeJobCreated && !input.evalCase.expected.runtimeJobCreated) {
    failures.push({
      kind: "unexpected_runtime_job_created",
      reasonCodes: ["runtime_job_created_when_expected_false"],
    });
  }
  if (
    input.validation.rawPromptStored ||
    input.validation.rawResponseStored ||
    input.evalCase.routerOutput.rawPromptStored ||
    input.evalCase.routerOutput.rawResponseStored
  ) {
    failures.push({ kind: "raw_storage_allow", reasonCodes: ["raw_storage_flags_true"] });
  }
  if (input.validation.workQueueLifecycleMutationAllowed) {
    failures.push({
      kind: "work_queue_lifecycle_mutation",
      reasonCodes: ["work_queue_lifecycle_mutation_allowed"],
    });
  }
  if (
    output &&
    ["production_side_effect", "production_model_promotion", "external_outbound_write"].includes(
      output.sideEffectClass,
    ) &&
    input.runtimeJobCreated
  ) {
    failures.push({
      kind: "production_side_effect_outside_scope",
      reasonCodes: ["production_or_external_side_effect_allowed"],
    });
  }
  if (
    output &&
    ["high", "critical"].includes(output.riskClass) &&
    input.runtimeJobCreated &&
    !input.evalCase.expected.runtimeJobCreated
  ) {
    failures.push({ kind: "high_risk_false_allow", reasonCodes: ["high_risk_false_allow"] });
  }
  if (
    input.evalCase.evalTags.includes("malicious_injection") &&
    (input.runtimeJobCreated || input.validation.authorityGranted)
  ) {
    failures.push({
      kind: "malicious_injection_false_allow",
      reasonCodes: ["malicious_injection_created_job_or_authority"],
    });
  }
  if (input.validation.authorityGranted) {
    failures.push({
      kind: "authority_granted_from_untrusted_text",
      reasonCodes: ["authority_granted_by_routing"],
    });
  }
  return failures;
}

function caseResult(input: {
  evalCase: RoutingEvalCase;
  started: number;
  routeMatched: boolean;
  runtimeJobCreated: boolean;
  validatorOutcome: RoutingEvalCaseResult["validatorOutcome"];
  clarificationRequired: boolean;
  escalationOutcome: RoutingEvalCaseResult["escalationOutcome"];
  schemaValid: boolean;
  reasonCodes: string[];
  hardFailures: RoutingEvalCaseResult["hardFailures"];
}): RoutingEvalCaseResult {
  const falseAllow = input.runtimeJobCreated && !input.evalCase.expected.runtimeJobCreated;
  const falseBlock =
    !input.runtimeJobCreated &&
    input.evalCase.expected.runtimeJobCreated &&
    !["work_queue_control", "clarification_required"].includes(input.evalCase.expected.route);
  const validatorMatched =
    input.validatorOutcome === "protocol_bypass" ||
    input.validatorOutcome === input.evalCase.expected.validatorOutcome;
  const passed =
    input.routeMatched &&
    input.runtimeJobCreated === input.evalCase.expected.runtimeJobCreated &&
    validatorMatched &&
    input.clarificationRequired === input.evalCase.expected.clarificationRequired &&
    input.hardFailures.length === 0;
  return {
    artifactKind: "intent_front_door_routing_eval_case_result",
    evalCaseId: input.evalCase.evalCaseId,
    category: input.evalCase.category,
    passed,
    routeMatched: input.routeMatched,
    runtimeJobCreated: input.runtimeJobCreated,
    expectedRuntimeJobCreated: input.evalCase.expected.runtimeJobCreated,
    validatorOutcome: input.validatorOutcome,
    expectedValidatorOutcome: input.evalCase.expected.validatorOutcome,
    clarificationRequired: input.clarificationRequired,
    expectedClarificationRequired: input.evalCase.expected.clarificationRequired,
    escalationOutcome: input.escalationOutcome,
    schemaValid: input.schemaValid,
    falseAllow,
    falseBlock,
    hardFailures: input.hardFailures,
    reasonCodes: [...new Set(input.reasonCodes)].slice(0, 50),
    latencyMs: Date.now() - input.started,
    rawPromptStored: false,
    rawResponseStored: false,
    providerCallMade: false,
    workQueueLifecycleMutated: false,
  };
}
