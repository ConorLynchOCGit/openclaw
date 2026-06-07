import type { JsonValue } from "../runtime-job-repository.ts";
import type { ConversationRoutingContext } from "./conversation-routing-context.ts";
import type { IntakeRouteContract } from "./intake-route-contract.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  normalizeCanonicalRouterReasonCodes,
  parseCanonicalRouterOutput,
  type CanonicalRouterOutput,
  type CanonicalRouterParseResult,
} from "./router-schema.ts";
import type {
  WorkflowSummaryCandidateSelection,
  WorkflowSummaryIndex,
  WorkflowSummaryIndexEntry,
} from "./workflow-summary-index.ts";

export const STRUCTURED_MODEL_INTENT_ROUTER_CONFIG_VERSION =
  "intent-front-door.structured-model-router.v1";
export const STRUCTURED_ROUTER_PROMPT_SUMMARY_MAX_CHARS = 500;
export const STRUCTURED_ROUTER_MAX_WORKFLOW_CANDIDATES = 8;
export const STRUCTURED_ROUTER_MAX_WORKFLOW_SUMMARY_CHARS = 12_000;

export type StructuredRouterSourceRoute =
  | "ux"
  | "terminal"
  | "work_queue"
  | "agent_handoff"
  | "api"
  | "service";

export type StructuredModelIntentRouterRequest = {
  promptHash: string;
  volatilePromptText?: string;
  promptSummary: string;
  conversationContext: ConversationRoutingContext;
  workflowRegistryVersion: string;
  workflowSummaries: WorkflowSummaryIndexEntry[];
  authoritySnapshotRefs: string[];
  authoritySnapshotVersion: string | null;
  routerModelPolicyRef: string;
  routerConfigVersion: typeof STRUCTURED_MODEL_INTENT_ROUTER_CONFIG_VERSION | string;
  sourceRoute: StructuredRouterSourceRoute;
  requestId: string;
  sessionId: string;
  intakeRouteContract: IntakeRouteContract | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type StructuredModelIntentRouterProviderResponse = {
  output: unknown;
  providerRef?: string | null;
  modelCandidateId?: string | null;
  routerModelPolicyRef?: string | null;
  providerCallMade?: boolean;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  retryCount?: number | null;
  degradationState?:
    | "healthy"
    | "degraded"
    | "rate_limited"
    | "schema_failure"
    | "blocked"
    | "fallback_only";
  reasonCodes?: string[];
};

export interface StructuredModelIntentRouterProvider {
  route(
    request: StructuredModelIntentRouterRequest,
  ): Promise<StructuredModelIntentRouterProviderResponse>;
}

export type StructuredModelIntentRouterResult = {
  artifactKind: "structured_model_intent_router_result";
  schemaVersion: typeof CANONICAL_ROUTER_SCHEMA_VERSION;
  routerConfigVersion: string;
  valid: boolean;
  output: CanonicalRouterOutput | null;
  parseResult: CanonicalRouterParseResult;
  metadata: {
    promptHash: string;
    promptSummary: string;
    workflowRegistryVersion: string;
    routerModelPolicyRef: string;
    providerRef: string | null;
    modelCandidateId: string | null;
    latencyMs: number | null;
    estimatedCostUsd: number | null;
    retryCount: number;
    degradationState:
      | "healthy"
      | "degraded"
      | "rate_limited"
      | "schema_failure"
      | "blocked"
      | "fallback_only";
    reasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    providerCallMade: boolean;
    runtimeJobCreated: false;
    authorityGranted: false;
    workQueueLifecycleMutationAllowed: false;
  };
};

function boundedText(value: string, maxLength: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function boundWorkflowSummaries(
  summaries: WorkflowSummaryIndexEntry[],
  maxCandidates = STRUCTURED_ROUTER_MAX_WORKFLOW_CANDIDATES,
  maxTotalChars = STRUCTURED_ROUTER_MAX_WORKFLOW_SUMMARY_CHARS,
): WorkflowSummaryIndexEntry[] {
  const selected: WorkflowSummaryIndexEntry[] = [];
  let totalChars = 0;
  for (const summary of summaries.slice(0, maxCandidates)) {
    const nextChars = JSON.stringify(summary).length;
    if (totalChars + nextChars > maxTotalChars) {
      break;
    }
    selected.push(summary);
    totalChars += nextChars;
  }
  return selected;
}

export function buildStructuredModelIntentRouterRequest(input: {
  promptHash: string;
  volatilePromptText?: string;
  promptSummary: string;
  conversationContext: ConversationRoutingContext;
  workflowSummaryIndex?: WorkflowSummaryIndex;
  workflowCandidateSelection?: WorkflowSummaryCandidateSelection;
  authoritySnapshotRefs?: string[];
  authoritySnapshotVersion?: string | null;
  routerModelPolicyRef: string;
  routerConfigVersion?: string;
  sourceRoute: StructuredRouterSourceRoute;
  requestId: string;
  sessionId?: string;
  intakeRouteContract?: IntakeRouteContract | null;
  reasonCodes?: string[];
  maxWorkflowCandidates?: number;
  maxWorkflowSummaryChars?: number;
}): StructuredModelIntentRouterRequest {
  const workflowRegistryVersion =
    input.workflowCandidateSelection?.workflowRegistryVersion ??
    input.workflowSummaryIndex?.workflowRegistryVersion ??
    input.conversationContext.workflowRegistryVersion ??
    "workflow-registry:unknown";
  const workflowSummaries = boundWorkflowSummaries(
    input.workflowCandidateSelection?.candidates ?? input.workflowSummaryIndex?.summaries ?? [],
    input.maxWorkflowCandidates,
    input.maxWorkflowSummaryChars,
  );
  const authoritySnapshotRefs =
    input.authoritySnapshotRefs ??
    input.conversationContext.authoritySnapshots.flatMap((snapshot) => snapshot.authorityStateRefs);
  const authoritySnapshotVersion =
    input.authoritySnapshotVersion ??
    input.conversationContext.authoritySnapshots[0]?.version ??
    null;

  return {
    promptHash: input.promptHash,
    volatilePromptText: input.volatilePromptText,
    promptSummary: boundedText(input.promptSummary, STRUCTURED_ROUTER_PROMPT_SUMMARY_MAX_CHARS),
    conversationContext: input.conversationContext,
    workflowRegistryVersion,
    workflowSummaries,
    authoritySnapshotRefs: authoritySnapshotRefs.slice(0, 20),
    authoritySnapshotVersion,
    routerModelPolicyRef: input.routerModelPolicyRef,
    routerConfigVersion: input.routerConfigVersion ?? STRUCTURED_MODEL_INTENT_ROUTER_CONFIG_VERSION,
    sourceRoute: input.sourceRoute,
    requestId: input.requestId,
    sessionId: input.sessionId ?? input.conversationContext.sessionId,
    intakeRouteContract: input.intakeRouteContract ?? null,
    reasonCodes: [
      "structured_model_router_request_bounded",
      ...(input.intakeRouteContract ? ["intake_route_contract_attached"] : []),
      ...(input.reasonCodes ?? []),
      ...(workflowSummaries.length === 0 ? ["workflow_summary_candidates_missing"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export class StructuredModelIntentRouter {
  constructor(private readonly provider: StructuredModelIntentRouterProvider) {}

  async route(
    request: StructuredModelIntentRouterRequest,
  ): Promise<StructuredModelIntentRouterResult> {
    const response = await this.provider.route(request);
    const parseResult = parseCanonicalRouterOutput(response.output);
    const providerReasonCodes = normalizeCanonicalRouterReasonCodes(
      response.reasonCodes ?? [],
      80,
    ).value;
    const reasonCodes = normalizeCanonicalRouterReasonCodes(
      [
        ...request.reasonCodes,
        ...providerReasonCodes,
        ...(parseResult.valid ? ["canonical_router_schema_valid"] : parseResult.reasonCodes),
      ],
      40,
    ).value;

    return {
      artifactKind: "structured_model_intent_router_result",
      schemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
      routerConfigVersion: request.routerConfigVersion,
      valid: parseResult.valid,
      output: parseResult.output,
      parseResult,
      metadata: {
        promptHash: request.promptHash,
        promptSummary: request.promptSummary,
        workflowRegistryVersion: request.workflowRegistryVersion,
        routerModelPolicyRef: response.routerModelPolicyRef ?? request.routerModelPolicyRef,
        providerRef: response.providerRef ?? null,
        modelCandidateId: response.modelCandidateId ?? null,
        latencyMs: response.latencyMs ?? null,
        estimatedCostUsd: response.estimatedCostUsd ?? null,
        retryCount: response.retryCount ?? 0,
        degradationState: parseResult.valid
          ? (response.degradationState ?? "healthy")
          : "schema_failure",
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        providerCallMade: response.providerCallMade ?? false,
        runtimeJobCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutationAllowed: false,
      },
    };
  }
}

export class FixtureStructuredModelIntentRouterProvider implements StructuredModelIntentRouterProvider {
  constructor(private readonly response: StructuredModelIntentRouterProviderResponse) {}

  async route(
    _request: StructuredModelIntentRouterRequest,
  ): Promise<StructuredModelIntentRouterProviderResponse> {
    return this.response;
  }
}

export function structuredRouterResultToJsonEvidence(
  result: StructuredModelIntentRouterResult,
): JsonValue {
  return {
    artifactKind: result.artifactKind,
    schemaVersion: result.schemaVersion,
    routerConfigVersion: result.routerConfigVersion,
    valid: result.valid,
    route: result.output?.route ?? null,
    workflowId: result.output?.workflowId ?? null,
    intakeRouteContractId: result.metadata.reasonCodes.includes("intake_route_contract_attached")
      ? "intake_route_contract_attached"
      : null,
    metadata: result.metadata,
  };
}
