import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolStatus } from "../runtime-tool-call/runtime-tool-types.ts";
import type { IntentValidationDecision } from "./intent-validator.ts";
import type { RouterFrontDoorToolInvocationSummary } from "./router-runtime-tools.ts";
import {
  ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
  type RouterFrontDoorRuntimeToolId,
} from "./router-runtime-tools.ts";
import type { CanonicalRouterOutput } from "./router-schema.ts";

export const ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION = "intent-front-door.router-tool-protocol.v1";

export type RouterFrontDoorToolPhaseStatus = {
  toolId: RouterFrontDoorRuntimeToolId;
  status: RuntimeToolStatus | "not_invoked";
  summary: string;
  invocationRef: string | null;
  reasonCodes: string[];
};

export type RouterFrontDoorToolProtocolResult = {
  artifactKind: "router_front_door_tool_protocol_result";
  protocolVersion: typeof ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION;
  requestId: string;
  promptHash: string;
  status: "succeeded" | "needs_review" | "failed";
  phaseStatuses: RouterFrontDoorToolPhaseStatus[];
  toolInvocationRefs: string[];
  executorWorkflowId: string | null;
  subjectWorkflowIds: string[];
  targetSubjectRefs: Array<{ targetKind: string; targetRef: string; confidence: number | null }>;
  requestedCapabilities: string[];
  constraintSummaries: Array<{ constraintKind: string; objectSummary: string; confidence: number }>;
  missionLedgerHandoffRef: string;
  validationOutcome: IntentValidationDecision["outcome"] | null;
  validationReasonCodes: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
  authorityGranted: false;
};

function phaseSummary(toolId: RouterFrontDoorRuntimeToolId, output: CanonicalRouterOutput): string {
  switch (toolId) {
    case "router.classify_owner_turn_intent":
      return `Classified route ${output.route} with response mode ${output.responseMode}.`;
    case "router.extract_constraints":
      return `Extracted ${output.constraints.length} bounded constraints for downstream Mission Ledger/compile boundaries.`;
    case "router.select_executor_workflow":
      return `Selected executor workflow ${output.executorWorkflowId ?? output.workflowId ?? "none"}.`;
    case "router.identify_subject_refs":
      return `Identified ${output.subjectWorkflowIds.length} subject workflows and ${output.targetSubjectRefs.length} target refs.`;
    case "router.compile_execution_request":
      return `Compiled requested capabilities: ${output.requestedCapabilities.slice(0, 8).join(", ") || "none"}.`;
    case "router.validate_route_contract":
      return "Validated route contract shape, authority handoff, and bounded-storage flags.";
  }
  return "Recorded bounded router front-door protocol evidence.";
}

export function buildRouterFrontDoorToolProtocolResult(input: {
  requestId: string;
  promptHash: string;
  routerOutput: CanonicalRouterOutput;
  validation?: IntentValidationDecision | null;
  toolInvocations?: RouterFrontDoorToolInvocationSummary[];
}): RouterFrontDoorToolProtocolResult {
  const invocationByTool = new Map(
    (input.toolInvocations ?? []).map((invocation) => [invocation.toolId, invocation]),
  );
  const phaseStatuses: RouterFrontDoorToolPhaseStatus[] = ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.map(
    (toolId) => {
      const invocation = invocationByTool.get(toolId);
      return {
        toolId,
        status: invocation?.status ?? ("not_invoked" as const),
        summary: phaseSummary(toolId, input.routerOutput),
        invocationRef: invocation?.invocationRef ?? null,
        reasonCodes: invocation?.reasonCodes ?? [`${toolId.replaceAll(".", "_")}_compiled`],
      };
    },
  );
  const notInvoked = phaseStatuses.filter((phase) => phase.status === "not_invoked");
  const failed = phaseStatuses.filter((phase) => phase.status === "failed");
  const status =
    failed.length > 0 ? "failed" : notInvoked.length > 0 ? "needs_review" : "succeeded";
  return {
    artifactKind: "router_front_door_tool_protocol_result",
    protocolVersion: ROUTER_FRONT_DOOR_TOOL_PROTOCOL_VERSION,
    requestId: input.requestId,
    promptHash: input.promptHash,
    status,
    phaseStatuses,
    toolInvocationRefs: phaseStatuses.flatMap((phase) =>
      phase.invocationRef ? [phase.invocationRef] : [],
    ),
    executorWorkflowId: input.routerOutput.executorWorkflowId ?? input.routerOutput.workflowId,
    subjectWorkflowIds: input.routerOutput.subjectWorkflowIds,
    targetSubjectRefs: input.routerOutput.targetSubjectRefs.map((ref) => ({
      targetKind: ref.targetKind,
      targetRef: ref.targetRef,
      confidence: ref.confidence ?? null,
    })),
    requestedCapabilities: input.routerOutput.requestedCapabilities,
    constraintSummaries: input.routerOutput.constraints,
    missionLedgerHandoffRef: `mission-ledger-handoff://${input.requestId}#${input.promptHash.slice(
      0,
      16,
    )}`,
    validationOutcome: input.validation?.outcome ?? null,
    validationReasonCodes: input.validation?.reasonCodes.slice(0, 30) ?? [],
    reasonCodes: [
      "router_front_door_tool_protocol_compiled",
      ...(status === "succeeded" ? ["router_front_door_tool_protocol_traced"] : []),
      ...(notInvoked.length > 0 ? ["router_front_door_tool_protocol_missing_trace"] : []),
      ...(failed.length > 0 ? ["router_front_door_tool_protocol_failed_trace"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
    authorityGranted: false,
  };
}

export function assertRouterFrontDoorToolProtocolCanCompile(
  protocol: RouterFrontDoorToolProtocolResult | null | undefined,
): void {
  if (!protocol) {
    return;
  }
  if (
    protocol.rawPromptStored ||
    protocol.rawResponseStored ||
    protocol.rawTranscriptStored ||
    protocol.rawProviderLogStored ||
    protocol.rawToolLogStored ||
    protocol.rawDbRowsStored ||
    protocol.secretsStored
  ) {
    throw new Error("router front-door tool protocol raw storage rejected");
  }
  if (protocol.workQueueLifecycleMutated || protocol.authorityGranted) {
    throw new Error("router front-door tool protocol cannot grant authority or mutate lifecycle");
  }
  const seen = new Set(protocol.phaseStatuses.map((phase) => phase.toolId));
  const missing = ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS.filter((toolId) => !seen.has(toolId));
  if (missing.length > 0) {
    throw new Error(`router front-door tool protocol missing phases: ${missing.join(",")}`);
  }
}

export function routerFrontDoorToolProtocolMetadata(
  protocol: RouterFrontDoorToolProtocolResult,
): JsonValue {
  return {
    artifactKind: protocol.artifactKind,
    protocolVersion: protocol.protocolVersion,
    status: protocol.status,
    missionLedgerHandoffRef: protocol.missionLedgerHandoffRef,
    toolInvocationRefs: protocol.toolInvocationRefs,
    phaseStatuses: protocol.phaseStatuses,
    rawPromptStored: false,
    rawResponseStored: false,
  } satisfies JsonValue;
}
