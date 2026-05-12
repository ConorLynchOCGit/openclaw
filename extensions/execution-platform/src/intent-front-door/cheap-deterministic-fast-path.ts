import type {
  ConversationReferenceResolution,
  ConversationRoutingContext,
} from "./conversation-routing-context.ts";
import type { ProtocolPreGateResult } from "./protocol-pre-gate.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  type CanonicalIntentRoute,
  type CanonicalRiskClass,
  type CanonicalSideEffectClass,
} from "./router-schema.ts";

export const CHEAP_DETERMINISTIC_FAST_PATH_VERSION =
  "intent-front-door.cheap-deterministic-fast-path.v1";

export type CheapDeterministicFastPathOutcome =
  | "protocol_command"
  | "ui_control"
  | "deterministic_reject"
  | "status_readback"
  | "cached_low_risk_route"
  | "continue_to_model_router";

export type CheapDeterministicFastPathRoute =
  | "chat_response"
  | "status_response"
  | "plan_only"
  | "work_queue_control"
  | "continue_to_model_router"
  | null;

export type CheapDeterministicFastPathVersionRefs = {
  promptHash: string;
  routerSchemaVersion: string;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  authSessionVersion: string;
  contextVersion: string;
};

export type CheapDeterministicCachedRouteCandidate = {
  route: CanonicalIntentRoute;
  promptHash: string;
  routerSchemaVersion: string;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  authSessionVersion: string;
  contextVersion: string;
  riskClass: CanonicalRiskClass;
  sideEffectClass: CanonicalSideEffectClass;
  requestedAuthority: string | null;
  reasonCodes?: string[];
};

export type CheapDeterministicFastPathExplicitUiAction =
  | {
      action: "status_readback";
      targetRef?: string | null;
    }
  | {
      action: "work_queue_control";
      control: string;
      targetRef: string;
    };

export type CheapDeterministicFastPathInput = {
  protocolPreGateResult?: ProtocolPreGateResult | null;
  conversationContext?: ConversationRoutingContext | null;
  referenceResolution?: ConversationReferenceResolution | null;
  explicitUiAction?: CheapDeterministicFastPathExplicitUiAction | null;
  cachedRouteCandidate?: CheapDeterministicCachedRouteCandidate | null;
  versionRefs?: CheapDeterministicFastPathVersionRefs | null;
  sourceRoute?: string | null;
  promptSummary?: string | null;
};

export type CheapDeterministicFastPathResult = {
  artifactKind: "cheap_deterministic_fast_path_result";
  version: typeof CHEAP_DETERMINISTIC_FAST_PATH_VERSION;
  outcome: CheapDeterministicFastPathOutcome;
  route: CheapDeterministicFastPathRoute;
  reasonCodes: string[];
  finalRouteDecisionMade: boolean;
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  englishSemanticRoutingUsed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

const LOW_RISK_CACHE_ROUTES = new Set<CanonicalIntentRoute>([
  "chat_response",
  "status_response",
  "plan_only",
]);

const DISALLOWED_CACHE_ROUTES = new Set<CanonicalIntentRoute>([
  "workflow_execution",
  "multi_workflow_plan",
  "research_only",
  "work_queue_control",
  "clarification_required",
  "blocked",
  "needs_review",
]);

const LOW_RISK_CACHE_SIDE_EFFECTS = new Set<CanonicalSideEffectClass>(["none", "read_only"]);

export function runCheapDeterministicFastPath(
  input: CheapDeterministicFastPathInput,
): CheapDeterministicFastPathResult {
  const protocol = input.protocolPreGateResult ?? null;
  if (protocol) {
    if (protocol.kind === "protocol_command") {
      return result("protocol_command", null, true, [
        "protocol_command_fast_path",
        ...protocol.reasonCodes,
      ]);
    }
    if (protocol.kind === "ui_control") {
      return result("ui_control", "work_queue_control", true, [
        "ui_control_fast_path_requires_later_control_validation",
        ...protocol.reasonCodes,
      ]);
    }
    if (protocol.kind === "reject") {
      return result("deterministic_reject", null, true, [
        "deterministic_reject_fast_path",
        ...protocol.reasonCodes,
      ]);
    }
  }

  if (input.explicitUiAction?.action === "status_readback") {
    return result("status_readback", "status_response", true, [
      "explicit_status_readback_ui_action",
    ]);
  }

  if (input.explicitUiAction?.action === "work_queue_control") {
    return result("ui_control", "work_queue_control", true, [
      "explicit_work_queue_control_ui_action",
      "control_requires_later_runtime_validation",
    ]);
  }

  const reference = input.referenceResolution ?? null;
  if (reference?.outcome === "resolved") {
    return result("continue_to_model_router", "continue_to_model_router", false, [
      "resolved_reference_is_target_only",
      "reference_requires_model_router_and_validator",
      ...reference.reasonCodes,
    ]);
  }

  const cacheDecision = evaluateCachedRouteCandidate(
    input.cachedRouteCandidate ?? null,
    input.versionRefs ?? null,
  );
  if (cacheDecision.allowed) {
    return result("cached_low_risk_route", cacheDecision.route, true, cacheDecision.reasonCodes);
  }
  if (cacheDecision.reasonCodes.length > 0) {
    return result("continue_to_model_router", "continue_to_model_router", false, [
      "cache_fast_path_unavailable",
      ...cacheDecision.reasonCodes,
    ]);
  }

  return result("continue_to_model_router", "continue_to_model_router", false, [
    "free_form_input_requires_structured_model_router",
    "english_semantic_fast_path_not_allowed",
  ]);
}

function evaluateCachedRouteCandidate(
  candidate: CheapDeterministicCachedRouteCandidate | null,
  versions: CheapDeterministicFastPathVersionRefs | null,
):
  | {
      allowed: true;
      route: "chat_response" | "status_response" | "plan_only";
      reasonCodes: string[];
    }
  | { allowed: false; reasonCodes: string[] } {
  if (!candidate) {
    return { allowed: false, reasonCodes: [] };
  }
  const reasonCodes = [...(candidate.reasonCodes ?? [])];
  if (DISALLOWED_CACHE_ROUTES.has(candidate.route)) {
    reasonCodes.push("cached_route_not_low_risk");
  }
  if (!LOW_RISK_CACHE_ROUTES.has(candidate.route)) {
    reasonCodes.push("cached_route_not_cacheable");
  }
  if (!LOW_RISK_CACHE_SIDE_EFFECTS.has(candidate.sideEffectClass)) {
    reasonCodes.push("cached_route_side_effect_not_cacheable");
  }
  if (candidate.requestedAuthority) {
    reasonCodes.push("cached_route_requested_authority_not_cacheable");
  }
  if (!versions) {
    reasonCodes.push("cached_route_version_refs_missing");
  } else {
    if (candidate.promptHash !== versions.promptHash) {
      reasonCodes.push("cached_route_prompt_hash_mismatch");
    }
    if (candidate.routerSchemaVersion !== versions.routerSchemaVersion) {
      reasonCodes.push("cached_route_schema_version_mismatch");
    }
    if (candidate.workflowRegistryVersion !== versions.workflowRegistryVersion) {
      reasonCodes.push("cached_route_workflow_registry_version_mismatch");
    }
    if (candidate.authoritySnapshotVersion !== versions.authoritySnapshotVersion) {
      reasonCodes.push("cached_route_authority_snapshot_version_mismatch");
    }
    if (candidate.authSessionVersion !== versions.authSessionVersion) {
      reasonCodes.push("cached_route_auth_session_version_mismatch");
    }
    if (candidate.contextVersion !== versions.contextVersion) {
      reasonCodes.push("cached_route_context_version_mismatch");
    }
  }
  if (reasonCodes.length > 0) {
    return { allowed: false, reasonCodes: [...new Set(reasonCodes)] };
  }
  if (
    candidate.route === "chat_response" ||
    candidate.route === "status_response" ||
    candidate.route === "plan_only"
  ) {
    return {
      allowed: true,
      route: candidate.route,
      reasonCodes: ["cached_low_risk_route_versions_match"],
    };
  }
  return { allowed: false, reasonCodes: ["cached_route_unreachable_route_shape"] };
}

export function createCheapDeterministicVersionRefs(
  input: Omit<CheapDeterministicFastPathVersionRefs, "routerSchemaVersion"> & {
    routerSchemaVersion?: string;
  },
): CheapDeterministicFastPathVersionRefs {
  return {
    ...input,
    routerSchemaVersion: input.routerSchemaVersion ?? CANONICAL_ROUTER_SCHEMA_VERSION,
  };
}

function result(
  outcome: CheapDeterministicFastPathOutcome,
  route: CheapDeterministicFastPathRoute,
  finalRouteDecisionMade: boolean,
  reasonCodes: string[],
): CheapDeterministicFastPathResult {
  return {
    artifactKind: "cheap_deterministic_fast_path_result",
    version: CHEAP_DETERMINISTIC_FAST_PATH_VERSION,
    outcome,
    route,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 30),
    finalRouteDecisionMade,
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    englishSemanticRoutingUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
