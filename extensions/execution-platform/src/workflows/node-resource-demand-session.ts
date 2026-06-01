import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  ResourceObjectiveFocusLegalRefUniverseSchema,
  ResourceObjectiveFocusSchema,
  selectedRefsFromResourceObjectiveFocus,
  type ResourceObjectiveFocus,
  type ResourceObjectiveFocusLegalRefHandle,
  type ResourceObjectiveFocusLegalRefUniverse,
} from "./resource-objective-focus.ts";
import {
  EvidenceModeSchema,
  type EvidenceMode,
} from "./execution-intent.ts";

export const NODE_RESOURCE_DEMAND_SESSION_ARTIFACT_TYPE =
  "execution_platform.node_resource_demand.session" as const;
export const NODE_RESOURCE_DEMAND_REQUEST_ARTIFACT_TYPE =
  "execution_platform.node_resource_demand.request" as const;
export const NODE_RESOURCE_DEMAND_FULFILLMENT_ARTIFACT_TYPE =
  "execution_platform.node_resource_demand.fulfillment" as const;
export const NODE_RESOURCE_DEMAND_BLOCKER_ARTIFACT_TYPE =
  "execution_platform.node_resource_demand.blocker" as const;

export const NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION =
  "execution-platform.node-resource-demand-session.v1" as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedString = (max: number) => z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const NodeResourceDemandStatusSchema = z.enum([
  "open",
  "fulfilled",
  "blocked",
  "closed",
]);
export type NodeResourceDemandStatus = z.infer<typeof NodeResourceDemandStatusSchema>;

export const NodeResourceDemandRequestKindSchema = z.enum([
  "file_window",
  "symbol",
  "related_tests",
  "memory_pack",
  "resource_ref",
  "source_prompt_section",
  "owner_constraint",
  "project_fact",
  "research_brief",
  "planning_capsule",
  "action_graph_candidate",
  "compile_readiness_input",
  "human_decision_ref",
  "workflow_manifest_ref",
  "proof_artifact_ref",
  "closeout_ref",
]);
export type NodeResourceDemandRequestKind = z.infer<typeof NodeResourceDemandRequestKindSchema>;

export const NodeResourceDemandTransitionSchema = z.enum([
  "resource.demand.fulfill_exact_handles",
  "resource.demand.request_file_window",
  "resource.demand.request_symbol",
  "resource.demand.request_related_tests",
  "resource.demand.request_memory_pack",
  "resource.demand.request_resource_ref",
  "resource.demand.request_source_prompt_section",
  "resource.demand.request_owner_constraint",
  "resource.demand.request_project_fact",
  "resource.demand.request_research_brief",
  "resource.demand.request_planning_capsule",
  "resource.demand.request_action_graph_candidate",
  "resource.demand.request_compile_readiness_input",
  "resource.demand.request_human_decision_ref",
  "resource.demand.request_workflow_manifest_ref",
  "resource.demand.request_proof_artifact_ref",
  "resource.demand.request_closeout_ref",
  "resource.demand.recompile_from_scope_revision",
  "resource.demand.execute_recompiled_packet",
  "resource.demand.mark_blocked",
  "resource.demand.close",
  "resource.scout.narrow_scope",
  "resource.scout.dispatch_specialist_subturn",
  "resource.scout.choose_file_from_listing",
  "resource.scout.choose_search_query",
  "resource.scout.choose_window_from_matches",
  "resource.scout.submit_exact_handles",
  "resource.scout.submit_specialist_handoff",
  "resource.scout.mark_narrowing_blocked",
  "resource.scout.mark_specialist_blocked",
  "resource.scout.append_handoff_to_ledger",
  "resource.scout.project_specialist_result",
  "worker.context.request_more",
  "worker.context.provide_bounded_snapshot",
  "worker.context.deny_request",
]);
export type NodeResourceDemandTransition = z.infer<typeof NodeResourceDemandTransitionSchema>;

export const NodeResourceDemandStoragePolicySchema = z
  .object({
    boundedRefsOnly: z.literal(true),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();

export const NodeResourceDemandBudgetSchema = z
  .object({
    budgetRef: nullableBoundedString(320),
    maxToolCalls: z.number().int().min(0).max(1_000).default(8),
    maxRequestRefs: z.number().int().min(1).max(500).default(24),
    maxWindowLines: z.number().int().min(1).max(10_000).default(600),
    maxPayloadBytes: z.number().int().min(1).max(10 * 1024 * 1024).default(96_000),
    rawPromptStored: z.literal(false),
  })
  .strict();
export type NodeResourceDemandBudget = z.infer<typeof NodeResourceDemandBudgetSchema>;

export const NodeResourceDemandSessionSchema = z
  .object({
    artifactKind: z.literal("node_resource_demand_session"),
    schemaVersion: z.literal(NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION),
    sessionId: boundedString(180),
    sessionRef: boundedString(420),
    sessionHash: boundedString(140),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    consumerBranchId: nullableBoundedString(180),
    workIntentRef: nullableBoundedString(420),
    nodeExecutionContractRef: nullableBoundedString(420),
    nodeExecutionPacketRef: nullableBoundedString(420),
    resourceObjectiveFocusRef: nullableBoundedString(520),
    legalRefUniverseRef: nullableBoundedString(520),
    selectedFocusRefHandles: stringList(40, 420),
    selectedFocusRefs: stringList(120, 620),
    capabilityId: boundedString(180),
    evidenceMode: z.array(EvidenceModeSchema).min(1).max(12),
    targetCommitmentIds: stringList(40, 180),
    authorityScope: stringList(120, 420),
    demandReason: boundedString(1_200),
    expectedUse: boundedString(1_200),
    requestRefs: stringList(80, 420),
    fulfillmentRefs: stringList(80, 420),
    blockerRefs: stringList(80, 420),
    deniedRefs: stringList(80, 420),
    status: NodeResourceDemandStatusSchema,
    nextLegalTransitions: z.array(NodeResourceDemandTransitionSchema).max(32),
    budget: NodeResourceDemandBudgetSchema,
    reasonCodes: stringList(120, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: NodeResourceDemandStoragePolicySchema,
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type NodeResourceDemandSession = z.infer<typeof NodeResourceDemandSessionSchema>;

export const NodeResourceDemandRequestSchema = z
  .object({
    artifactKind: z.literal("node_resource_demand_request"),
    schemaVersion: z.literal(NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION),
    requestId: boundedString(180),
    requestRef: boundedString(420),
    requestHash: boundedString(140),
    sessionRef: boundedString(420),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    requestKind: NodeResourceDemandRequestKindSchema,
    requestedRefs: stringList(120, 420),
    fileRef: nullableBoundedString(420),
    symbolRef: nullableBoundedString(420),
    lineStart: z.number().int().min(1).nullable().default(null),
    lineEnd: z.number().int().min(1).nullable().default(null),
    reason: boundedString(1_200),
    expectedUse: boundedString(1_200),
    authorityScope: stringList(120, 420),
    status: z.enum(["accepted", "blocked"]),
    nextLegalTransitions: z.array(NodeResourceDemandTransitionSchema).max(32),
    reasonCodes: stringList(120, 220),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type NodeResourceDemandRequest = z.infer<typeof NodeResourceDemandRequestSchema>;

export const NodeResourceDemandFulfillmentSchema = z
  .object({
    artifactKind: z.literal("node_resource_demand_fulfillment"),
    schemaVersion: z.literal(NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION),
    fulfillmentId: boundedString(180),
    fulfillmentRef: boundedString(420),
    fulfillmentHash: boundedString(140),
    sessionRef: boundedString(420),
    requestRef: boundedString(420),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    requestKind: NodeResourceDemandRequestKindSchema,
    providedRefs: stringList(120, 420),
    boundedSnapshotRefs: stringList(120, 420),
    deniedRefs: stringList(80, 420),
    status: z.enum(["fulfilled", "blocked"]),
    reasonCodes: stringList(120, 220),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type NodeResourceDemandFulfillment = z.infer<typeof NodeResourceDemandFulfillmentSchema>;

export const NodeResourceDemandBlockerSchema = z
  .object({
    artifactKind: z.literal("node_resource_demand_blocker"),
    schemaVersion: z.literal(NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION),
    blockerId: boundedString(180),
    blockerRef: boundedString(420),
    blockerHash: boundedString(140),
    sessionRef: nullableBoundedString(420),
    requestRef: nullableBoundedString(420),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    blockerKind: z.enum([
      "missing_required_field",
      "authority_scope_violation",
      "budget_exceeded",
      "unsupported_request_kind",
      "lifecycle_violation",
      "no_direct_fulfillment",
      "needs_specialist_scout",
    ]),
    missingFields: stringList(40, 220),
    deniedRefs: stringList(80, 420),
    blockerSummary: boundedString(1_200),
    nextLegalTransitions: z.array(NodeResourceDemandTransitionSchema).max(32),
    reasonCodes: stringList(120, 220),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
    hiddenReasoningStored: z.literal(false),
  })
  .strict();
export type NodeResourceDemandBlocker = z.infer<typeof NodeResourceDemandBlockerSchema>;

export type NodeResourceDemandSessionManifest = {
  artifactKind: "node_resource_demand_session_manifest";
  schemaVersion: typeof NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION;
  sessionRef: string;
  sessionHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  workIntentRef: string | null;
  nodeExecutionContractRef: string | null;
  nodeExecutionPacketRef: string | null;
  resourceObjectiveFocusRef: string | null;
  legalRefUniverseRef: string | null;
  selectedFocusRefHandleCount: number;
  selectedFocusRefCount: number;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  targetCommitmentCount: number;
  authorityScopeCount: number;
  requestCount: number;
  fulfillmentCount: number;
  blockerCount: number;
  deniedRefCount: number;
  status: NodeResourceDemandStatus;
  nextLegalTransitions: NodeResourceDemandTransition[];
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceDemandRequestManifest = {
  artifactKind: "node_resource_demand_request_manifest";
  schemaVersion: typeof NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION;
  requestRef: string;
  requestHash: string;
  sessionRef: string;
  consumerNodeId: string;
  requestKind: NodeResourceDemandRequestKind;
  requestedRefCount: number;
  status: "accepted" | "blocked";
  reasonCodes: string[];
  byteCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceDemandFulfillmentManifest = {
  artifactKind: "node_resource_demand_fulfillment_manifest";
  schemaVersion: typeof NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION;
  fulfillmentRef: string;
  fulfillmentHash: string;
  sessionRef: string;
  requestRef: string;
  consumerNodeId: string;
  requestKind: NodeResourceDemandRequestKind;
  providedRefCount: number;
  boundedSnapshotRefCount: number;
  deniedRefCount: number;
  status: "fulfilled" | "blocked";
  reasonCodes: string[];
  byteCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceDemandBlockerManifest = {
  artifactKind: "node_resource_demand_blocker_manifest";
  schemaVersion: typeof NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION;
  blockerRef: string;
  blockerHash: string;
  sessionRef: string | null;
  requestRef: string | null;
  consumerNodeId: string;
  blockerKind: NodeResourceDemandBlocker["blockerKind"];
  missingFieldCount: number;
  deniedRefCount: number;
  nextLegalTransitions: NodeResourceDemandTransition[];
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceDemandCompileResult = {
  status: "succeeded" | "needs_review";
  session: NodeResourceDemandSession | null;
  request: NodeResourceDemandRequest | null;
  fulfillment: NodeResourceDemandFulfillment | null;
  blocker: NodeResourceDemandBlocker | null;
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

export type NodeResourceDemandExactFulfillmentHandle = {
  handle: string;
  ref: string;
  kind: ResourceObjectiveFocusLegalRefHandle["kind"];
  requestKind: NodeResourceDemandRequestKind;
  fileRef: string | null;
  lineStart: number | null;
  lineEnd: number | null;
};

export type NodeResourceDemandNarrowingHandle = {
  handle: string;
  ref: string;
  kind: ResourceObjectiveFocusLegalRefHandle["kind"];
  reasonCodes: string[];
};

export type NodeResourceDemandExactFulfillmentClassification = {
  exactHandles: NodeResourceDemandExactFulfillmentHandle[];
  narrowingRequiredHandles: NodeResourceDemandNarrowingHandle[];
  reasonCodes: string[];
  canFulfillDirectly: boolean;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown, max = 80, maxChars = 320): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = bounded(item, maxChars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function parseEvidenceMode(value: unknown): EvidenceMode[] {
  return strings(value, 12, 120)
    .map((entry) => EvidenceModeSchema.safeParse(entry))
    .filter((entry): entry is { success: true; data: EvidenceMode } => entry.success)
    .map((entry) => entry.data);
}

function storagePolicy() {
  return {
    boundedRefsOnly: true as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
}

function sessionRefFor(input: {
  runtimeJobId: string;
  graphId: string;
  consumerNodeId: string;
  sessionId: string;
}): string {
  return `runtime-job://${bounded(input.runtimeJobId, 180)}/node-resource-demand/${bounded(
    input.graphId,
    140,
  )}/${bounded(input.consumerNodeId, 140)}/${bounded(input.sessionId, 120)}`;
}

function withHash<T extends Record<string, unknown>, K extends string>(
  body: T,
  hashKey: K,
): T & Record<K, string> {
  return { ...body, [hashKey]: hashValue({ ...body, [hashKey]: "pending" }) } as T &
    Record<K, string>;
}

function missingSessionFields(input: {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  consumerNodeId?: string | null;
  capabilityId?: string | null;
  evidenceMode?: EvidenceMode[];
  authorityScope?: string[];
  demandReason?: string | null;
  expectedUse?: string | null;
}): string[] {
  return [
    input.runtimeJobId ? null : "runtimeJobId",
    input.workflowId ? null : "workflowId",
    input.graphId ? null : "graphId",
    input.consumerNodeId ? null : "consumerNodeId",
    input.capabilityId ? null : "capabilityId",
    (input.evidenceMode ?? []).length > 0 ? null : "evidenceMode",
    (input.authorityScope ?? []).length > 0 ? null : "authorityScope",
    input.demandReason ? null : "demandReason",
    input.expectedUse ? null : "expectedUse",
  ].filter((field): field is string => Boolean(field));
}

function acceptedResourceObjectiveFocus(input: {
  resourceObjectiveFocus?: ResourceObjectiveFocus | null;
  legalRefUniverse?: ResourceObjectiveFocusLegalRefUniverse | null;
}):
  | {
      focus: ResourceObjectiveFocus;
      legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
      selectedFocusRefs: string[];
      reasonCodes: string[];
    }
  | {
      focus: null;
      legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse | null;
      selectedFocusRefs: [];
      reasonCodes: string[];
    } {
  const parsedFocus = ResourceObjectiveFocusSchema.safeParse(input.resourceObjectiveFocus);
  const parsedUniverse = ResourceObjectiveFocusLegalRefUniverseSchema.safeParse(
    input.legalRefUniverse,
  );
  const focus = parsedFocus.success ? parsedFocus.data : null;
  const legalRefUniverse = parsedUniverse.success ? parsedUniverse.data : null;
  if (!focus || !legalRefUniverse) {
    return {
      focus: null,
      legalRefUniverse,
      selectedFocusRefs: [],
      reasonCodes: [
        focus
          ? "node_resource_demand_resource_objective_focus_present"
          : "node_resource_demand_resource_objective_focus_missing",
        legalRefUniverse
          ? "node_resource_demand_legal_ref_universe_present"
          : "node_resource_demand_legal_ref_universe_missing",
      ],
    };
  }
  if (focus.status !== "accepted") {
    return {
      focus: null,
      legalRefUniverse,
      selectedFocusRefs: [],
      reasonCodes: ["node_resource_demand_resource_objective_focus_not_accepted"],
    };
  }
  if (focus.legalRefUniverseRef !== legalRefUniverse.legalRefUniverseRef) {
    return {
      focus: null,
      legalRefUniverse,
      selectedFocusRefs: [],
      reasonCodes: ["node_resource_demand_resource_objective_focus_universe_mismatch"],
    };
  }
  const selectedFocusRefs = selectedRefsFromResourceObjectiveFocus({ focus, legalRefUniverse });
  if (selectedFocusRefs.length === 0) {
    return {
      focus: null,
      legalRefUniverse,
      selectedFocusRefs: [],
      reasonCodes: ["node_resource_demand_resource_objective_focus_selected_refs_missing"],
    };
  }
  return {
    focus,
    legalRefUniverse,
    selectedFocusRefs,
    reasonCodes: [
      "node_resource_demand_resource_objective_focus_accepted",
      "node_resource_demand_focus_handles_runtime_validated",
    ],
  };
}

function normalizedAuthorityRef(value: string): string {
  const withoutFileWindow = value.startsWith("file-window://")
    ? value.slice("file-window://".length)
    : value;
  const hashIndex = withoutFileWindow.indexOf("#");
  return hashIndex === -1 ? withoutFileWindow : withoutFileWindow.slice(0, hashIndex);
}

function authorityAllowsRef(input: { authorityScope: string[]; ref: string }): boolean {
  const requested = bounded(input.ref, 420);
  const normalized = normalizedAuthorityRef(requested);
  return input.authorityScope.some((authority) => {
    const current = bounded(authority, 420);
    const currentNormalized = normalizedAuthorityRef(current);
    const structuralDirectoryScope =
      currentNormalized.endsWith("/") && normalized.startsWith(currentNormalized);
    const structuralGlobPrefix = currentNormalized.endsWith("/**")
      ? currentNormalized.slice(0, -2)
      : null;
    const structuralGlobScope =
      structuralGlobPrefix !== null && normalized.startsWith(structuralGlobPrefix);
    return (
      current === requested ||
      current === normalized ||
      currentNormalized === normalized ||
      structuralDirectoryScope ||
      structuralGlobScope ||
      current === "*" ||
      current === "authority://all"
    );
  });
}

function requestRefsFor(input: {
  requestKind: NodeResourceDemandRequestKind;
  requestedRefs?: string[];
  fileRef?: string | null;
  symbolRef?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
}): string[] {
  const explicit = strings(input.requestedRefs, 120, 420);
  if (explicit.length > 0) {
    return explicit;
  }
  if (input.requestKind === "file_window" && input.fileRef) {
    const suffix =
      input.lineStart && input.lineEnd ? `#L${input.lineStart}-L${input.lineEnd}` : "";
    return [`${bounded(input.fileRef, 360)}${suffix}`];
  }
  if (input.requestKind === "symbol" && input.symbolRef) {
    return [bounded(input.symbolRef, 420)];
  }
  if (input.requestKind !== "file_window" && input.requestKind !== "symbol") {
    return explicit;
  }
  return [];
}

const EXACT_FOCUS_KIND_TO_REQUEST_KIND: Partial<
  Record<ResourceObjectiveFocusLegalRefHandle["kind"], NodeResourceDemandRequestKind>
> = {
  source_prompt_section: "source_prompt_section",
  owner_constraint: "owner_constraint",
  project_fact: "project_fact",
  research_brief: "research_brief",
  planning_capsule: "planning_capsule",
  action_graph_candidate: "action_graph_candidate",
  compile_readiness_input: "compile_readiness_input",
  human_decision_ref: "human_decision_ref",
  workflow_manifest_ref: "workflow_manifest_ref",
  proof_artifact_ref: "proof_artifact_ref",
  closeout_ref: "closeout_ref",
  candidate_resource_ref: "resource_ref",
};

function parseFileWindowRef(ref: string): {
  fileRef: string;
  lineStart: number;
  lineEnd: number;
} | null {
  const normalized = ref.startsWith("file-window://") ? ref.slice("file-window://".length) : ref;
  const match = /^(?<fileRef>.+)#L(?<lineStart>[1-9]\d*)-L(?<lineEnd>[1-9]\d*)$/u.exec(
    normalized,
  );
  if (!match?.groups) {
    return null;
  }
  const lineStart = Number.parseInt(match.groups.lineStart, 10);
  const lineEnd = Number.parseInt(match.groups.lineEnd, 10);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd) || lineEnd < lineStart) {
    return null;
  }
  return {
    fileRef: bounded(match.groups.fileRef, 420),
    lineStart,
    lineEnd,
  };
}

function exactHandleFor(input: {
  handle: ResourceObjectiveFocusLegalRefHandle;
  session: NodeResourceDemandSession;
}): NodeResourceDemandExactFulfillmentHandle | NodeResourceDemandNarrowingHandle {
  const { handle, session } = input;
  const base = {
    handle: handle.handle,
    ref: handle.ref,
    kind: handle.kind,
  };
  if (handle.byteEstimate > 0 && handle.byteEstimate > session.budget.maxPayloadBytes) {
    return {
      ...base,
      reasonCodes: ["node_resource_demand_selected_ref_over_payload_budget"],
    };
  }
  const fileWindow = parseFileWindowRef(handle.ref);
  if (fileWindow) {
    return {
      ...base,
      requestKind: "file_window",
      fileRef: fileWindow.fileRef,
      lineStart: fileWindow.lineStart,
      lineEnd: fileWindow.lineEnd,
    };
  }
  if (handle.kind === "symbol") {
    return {
      ...base,
      requestKind: "symbol",
      fileRef: null,
      lineStart: null,
      lineEnd: null,
    };
  }
  if (handle.kind === "validation_ref") {
    return {
      ...base,
      requestKind: "related_tests",
      fileRef: null,
      lineStart: null,
      lineEnd: null,
    };
  }
  if (handle.kind === "memory_pack") {
    return {
      ...base,
      requestKind: "memory_pack",
      fileRef: null,
      lineStart: null,
      lineEnd: null,
    };
  }
  const domainRequestKind = EXACT_FOCUS_KIND_TO_REQUEST_KIND[handle.kind];
  if (domainRequestKind) {
    return {
      ...base,
      requestKind: domainRequestKind,
      fileRef: null,
      lineStart: null,
      lineEnd: null,
    };
  }
  return {
    ...base,
    reasonCodes: [
      "node_resource_demand_selected_ref_not_exactly_fulfillable",
      `node_resource_demand_selected_ref_kind_requires_specialist:${handle.kind}`,
    ],
  };
}

export function classifyNodeResourceDemandSelectedRefsForExactFulfillment(input: {
  session: NodeResourceDemandSession;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
}): NodeResourceDemandExactFulfillmentClassification {
  const session = NodeResourceDemandSessionSchema.parse(input.session);
  const legalRefUniverse = ResourceObjectiveFocusLegalRefUniverseSchema.parse(
    input.legalRefUniverse,
  );
  const selectedHandles = new Set(session.selectedFocusRefHandles);
  const selected = legalRefUniverse.handles.filter((handle) => selectedHandles.has(handle.handle));
  const reasonCodes: string[] = [];
  if (selected.length === 0) {
    return {
      exactHandles: [],
      narrowingRequiredHandles: session.selectedFocusRefs.map((ref): NodeResourceDemandNarrowingHandle => ({
        handle: ref,
        ref,
        kind: "other",
        reasonCodes: ["node_resource_demand_selected_handle_missing_from_legal_universe"],
      })),
      reasonCodes: ["node_resource_demand_selected_handle_missing_from_legal_universe"],
      canFulfillDirectly: false,
    };
  }
  const exactHandles: NodeResourceDemandExactFulfillmentHandle[] = [];
  const narrowingRequiredHandles: NodeResourceDemandNarrowingHandle[] = [];
  for (const handle of selected) {
    const classified = exactHandleFor({ handle, session });
    if ("requestKind" in classified) {
      exactHandles.push(classified);
      reasonCodes.push(`node_resource_demand_exact_${classified.requestKind}_handle_selected`);
    } else {
      narrowingRequiredHandles.push(classified);
      reasonCodes.push(...classified.reasonCodes);
    }
  }
  const requestKinds = new Set(exactHandles.map((handle) => handle.requestKind));
  if (requestKinds.size > 1) {
    const allGenericDomainResources = exactHandles.every(
      (handle) =>
        !["file_window", "symbol", "related_tests"].includes(handle.requestKind),
    );
    if (allGenericDomainResources) {
      for (const handle of exactHandles) {
        handle.requestKind = "resource_ref";
      }
      reasonCodes.push("node_resource_demand_mixed_exact_domain_resources_as_resource_refs");
    } else {
      for (const handle of exactHandles) {
        narrowingRequiredHandles.push({
          handle: handle.handle,
          ref: handle.ref,
          kind: handle.kind,
          reasonCodes: ["node_resource_demand_mixed_exact_handle_kinds_require_specialist_narrowing"],
        });
      }
      exactHandles.splice(0, exactHandles.length);
      reasonCodes.push("node_resource_demand_mixed_exact_handle_kinds_require_specialist_narrowing");
    }
  }
  return {
    exactHandles,
    narrowingRequiredHandles,
    reasonCodes: strings(reasonCodes, 120, 220),
    canFulfillDirectly: exactHandles.length > 0 && narrowingRequiredHandles.length === 0,
  };
}

function buildBlocker(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  sessionRef?: string | null;
  requestRef?: string | null;
  blockerKind: NodeResourceDemandBlocker["blockerKind"];
  missingFields?: string[];
  deniedRefs?: string[];
  blockerSummary: string;
  nextLegalTransitions?: NodeResourceDemandTransition[];
  reasonCodes: string[];
}): NodeResourceDemandBlocker {
  const blockerId = `node-resource-demand-blocker:${hashValue({
    sessionRef: input.sessionRef ?? null,
    requestRef: input.requestRef ?? null,
    blockerKind: input.blockerKind,
    missingFields: input.missingFields ?? [],
    deniedRefs: input.deniedRefs ?? [],
    reasonCodes: input.reasonCodes,
  }).slice(0, 16)}`;
  const body = {
    artifactKind: "node_resource_demand_blocker" as const,
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    blockerId,
    blockerRef: `runtime-job://${bounded(input.runtimeJobId, 180)}/node-resource-demand-blocker/${bounded(
      input.consumerNodeId,
      140,
    )}/${blockerId}`,
    blockerHash: "pending",
    sessionRef: input.sessionRef ?? null,
    requestRef: input.requestRef ?? null,
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    blockerKind: input.blockerKind,
    missingFields: strings(input.missingFields, 40, 220),
    deniedRefs: strings(input.deniedRefs, 80, 420),
    blockerSummary: bounded(input.blockerSummary, 1_200),
    nextLegalTransitions: input.nextLegalTransitions ?? ["resource.demand.mark_blocked"],
    reasonCodes: strings(input.reasonCodes, 120, 220),
    semanticQualityJudgedByDeterministicCode: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  return NodeResourceDemandBlockerSchema.parse(withHash(body, "blockerHash"));
}

export function buildNodeResourceDemandSessionManifest(
  session: NodeResourceDemandSession,
): NodeResourceDemandSessionManifest {
  return {
    artifactKind: "node_resource_demand_session_manifest",
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    sessionRef: session.sessionRef,
    sessionHash: session.sessionHash,
    runtimeJobId: session.runtimeJobId,
    workflowId: session.workflowId,
    graphId: session.graphId,
    consumerNodeId: session.consumerNodeId,
    workIntentRef: session.workIntentRef,
    nodeExecutionContractRef: session.nodeExecutionContractRef,
    nodeExecutionPacketRef: session.nodeExecutionPacketRef,
    resourceObjectiveFocusRef: session.resourceObjectiveFocusRef,
    legalRefUniverseRef: session.legalRefUniverseRef,
    selectedFocusRefHandleCount: session.selectedFocusRefHandles.length,
    selectedFocusRefCount: session.selectedFocusRefs.length,
    capabilityId: session.capabilityId,
    evidenceMode: session.evidenceMode,
    targetCommitmentCount: session.targetCommitmentIds.length,
    authorityScopeCount: session.authorityScope.length,
    requestCount: session.requestRefs.length,
    fulfillmentCount: session.fulfillmentRefs.length,
    blockerCount: session.blockerRefs.length,
    deniedRefCount: session.deniedRefs.length,
    status: session.status,
    nextLegalTransitions: session.nextLegalTransitions,
    reasonCodes: session.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(session), "utf8"),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildNodeResourceDemandRequestManifest(
  request: NodeResourceDemandRequest,
): NodeResourceDemandRequestManifest {
  return {
    artifactKind: "node_resource_demand_request_manifest",
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    requestRef: request.requestRef,
    requestHash: request.requestHash,
    sessionRef: request.sessionRef,
    consumerNodeId: request.consumerNodeId,
    requestKind: request.requestKind,
    requestedRefCount: request.requestedRefs.length,
    status: request.status,
    reasonCodes: request.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(request), "utf8"),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildNodeResourceDemandFulfillmentManifest(
  fulfillment: NodeResourceDemandFulfillment,
): NodeResourceDemandFulfillmentManifest {
  return {
    artifactKind: "node_resource_demand_fulfillment_manifest",
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    fulfillmentRef: fulfillment.fulfillmentRef,
    fulfillmentHash: fulfillment.fulfillmentHash,
    sessionRef: fulfillment.sessionRef,
    requestRef: fulfillment.requestRef,
    consumerNodeId: fulfillment.consumerNodeId,
    requestKind: fulfillment.requestKind,
    providedRefCount: fulfillment.providedRefs.length,
    boundedSnapshotRefCount: fulfillment.boundedSnapshotRefs.length,
    deniedRefCount: fulfillment.deniedRefs.length,
    status: fulfillment.status,
    reasonCodes: fulfillment.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(fulfillment), "utf8"),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildNodeResourceDemandBlockerManifest(
  blocker: NodeResourceDemandBlocker,
): NodeResourceDemandBlockerManifest {
  return {
    artifactKind: "node_resource_demand_blocker_manifest",
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    blockerRef: blocker.blockerRef,
    blockerHash: blocker.blockerHash,
    sessionRef: blocker.sessionRef,
    requestRef: blocker.requestRef,
    consumerNodeId: blocker.consumerNodeId,
    blockerKind: blocker.blockerKind,
    missingFieldCount: blocker.missingFields.length,
    deniedRefCount: blocker.deniedRefs.length,
    nextLegalTransitions: blocker.nextLegalTransitions,
    reasonCodes: blocker.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(blocker), "utf8"),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function boundedMetadata(input: {
  session?: NodeResourceDemandSession | null;
  request?: NodeResourceDemandRequest | null;
  fulfillment?: NodeResourceDemandFulfillment | null;
  blocker?: NodeResourceDemandBlocker | null;
}): JsonValue {
  return {
    nodeResourceDemandSessionManifest: input.session
      ? buildNodeResourceDemandSessionManifest(input.session)
      : null,
    nodeResourceDemandRequestManifest: input.request
      ? buildNodeResourceDemandRequestManifest(input.request)
      : null,
    nodeResourceDemandFulfillmentManifest: input.fulfillment
      ? buildNodeResourceDemandFulfillmentManifest(input.fulfillment)
      : null,
    nodeResourceDemandBlockerManifest: input.blocker
      ? buildNodeResourceDemandBlockerManifest(input.blocker)
      : null,
    nodeResourceDemandSessionRef: input.session?.sessionRef ?? input.blocker?.sessionRef ?? null,
    nodeResourceDemandRequestRef: input.request?.requestRef ?? input.blocker?.requestRef ?? null,
    nodeResourceDemandFulfillmentRef: input.fulfillment?.fulfillmentRef ?? null,
    nodeResourceDemandBlockerRef: input.blocker?.blockerRef ?? null,
    nodeResourceDemandStatus: input.session?.status ?? (input.blocker ? "blocked" : null),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    hiddenReasoningStored: false,
  } as JsonValue;
}

export function assertNodeResourceDemandManifestMetadata(value: JsonValue): void {
  const encoded = JSON.stringify(value);
  const metadataBytes = Buffer.byteLength(encoded, "utf8");
  const bodyKeyPattern =
    /"(demandReason|expectedUse|authorityScope|requestRefs|fulfillmentRefs|blockerSummary|requestedRefs|providedRefs|boundedSnapshotRefs|rawPrompt|rawResponse|lineNumberedContent|boundedContent|fullBody|fileContent)"\s*:/u;
  if (metadataBytes > 12_000) {
    throw new Error(`node_resource_demand_manifest_metadata_overflow:${metadataBytes}`);
  }
  if (bodyKeyPattern.test(encoded)) {
    throw new Error("node_resource_demand_manifest_contains_body_fields");
  }
}

export function openNodeResourceDemandSession(input: {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  consumerNodeId?: string | null;
  consumerBranchId?: string | null;
  workIntentRef?: string | null;
  nodeExecutionContractRef?: string | null;
  nodeExecutionPacketRef?: string | null;
  capabilityId?: string | null;
  evidenceMode?: string[] | EvidenceMode[];
  targetCommitmentIds?: string[];
  authorityScope?: string[];
  demandReason?: string | null;
  expectedUse?: string | null;
  resourceObjectiveFocus?: ResourceObjectiveFocus | null;
  legalRefUniverse?: ResourceObjectiveFocusLegalRefUniverse | null;
  budget?: Partial<NodeResourceDemandBudget>;
}): NodeResourceDemandCompileResult {
  const evidenceMode = parseEvidenceMode(input.evidenceMode);
  const authorityScope = strings(input.authorityScope, 120, 420);
  const focusState = acceptedResourceObjectiveFocus({
    resourceObjectiveFocus: input.resourceObjectiveFocus,
    legalRefUniverse: input.legalRefUniverse,
  });
  const missingFields = missingSessionFields({
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    capabilityId: bounded(input.capabilityId, 180),
    evidenceMode,
    authorityScope,
    demandReason: bounded(input.demandReason, 1_200),
    expectedUse: bounded(input.expectedUse, 1_200),
  });
  if (missingFields.length > 0) {
    const runtimeJobId = bounded(input.runtimeJobId, 180) || "missing-runtime-job";
    const workflowId = bounded(input.workflowId, 180) || "missing-workflow";
    const graphId = bounded(input.graphId, 180) || "missing-graph";
    const consumerNodeId = bounded(input.consumerNodeId, 180) || "missing-consumer-node";
    const blocker = buildBlocker({
      runtimeJobId,
      workflowId,
      graphId,
      consumerNodeId,
      blockerKind: "missing_required_field",
      missingFields,
      blockerSummary: `Context demand session is missing required structural fields: ${missingFields.join(", ")}.`,
      reasonCodes: [
        ...missingFields.map((field) => `node_resource_demand_${field}_missing`),
        ...focusState.reasonCodes,
      ],
    });
    return {
      status: "needs_review",
      session: null,
      request: null,
      fulfillment: null,
      blocker,
      outputRef: blocker.blockerRef,
      outputHash: blocker.blockerHash,
      outputSummary: blocker.blockerSummary,
      reasonCodes: blocker.reasonCodes,
      metadata: boundedMetadata({ blocker }),
    };
  }
  const sessionId = `node-resource-demand:${hashValue({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    consumerNodeId: input.consumerNodeId,
    reason: input.demandReason,
    expectedUse: input.expectedUse,
  }).slice(0, 18)}`;
  const sessionRef = sessionRefFor({
    runtimeJobId: bounded(input.runtimeJobId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    sessionId,
  });
  const body = {
    artifactKind: "node_resource_demand_session" as const,
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    sessionId,
    sessionRef,
    sessionHash: "pending",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    consumerBranchId: bounded(input.consumerBranchId, 180) || null,
    workIntentRef: bounded(input.workIntentRef, 420) || null,
    nodeExecutionContractRef: bounded(input.nodeExecutionContractRef, 420) || null,
    nodeExecutionPacketRef: bounded(input.nodeExecutionPacketRef, 420) || null,
    resourceObjectiveFocusRef: focusState.focus?.focusRef ?? null,
    legalRefUniverseRef: focusState.legalRefUniverse?.legalRefUniverseRef ?? null,
    selectedFocusRefHandles: focusState.focus?.selectedRefHandles ?? [],
    selectedFocusRefs: strings(focusState.selectedFocusRefs, 120, 620),
    capabilityId: bounded(input.capabilityId, 180),
    evidenceMode,
    targetCommitmentIds: strings(input.targetCommitmentIds, 40, 180),
    authorityScope,
    demandReason: bounded(input.demandReason, 1_200),
    expectedUse: bounded(input.expectedUse, 1_200),
    requestRefs: [],
    fulfillmentRefs: [],
    blockerRefs: [],
    deniedRefs: [],
    status: "open" as const,
    nextLegalTransitions: [
      "resource.demand.fulfill_exact_handles" as const,
      "resource.demand.request_file_window" as const,
      "resource.demand.request_symbol" as const,
      "resource.demand.request_related_tests" as const,
      "resource.demand.request_memory_pack" as const,
      "resource.demand.request_resource_ref" as const,
      "resource.demand.request_source_prompt_section" as const,
      "resource.demand.request_owner_constraint" as const,
      "resource.demand.request_project_fact" as const,
      "resource.demand.request_research_brief" as const,
      "resource.demand.request_planning_capsule" as const,
      "resource.demand.request_action_graph_candidate" as const,
      "resource.demand.request_compile_readiness_input" as const,
      "resource.demand.request_human_decision_ref" as const,
      "resource.demand.request_workflow_manifest_ref" as const,
      "resource.demand.request_proof_artifact_ref" as const,
      "resource.demand.request_closeout_ref" as const,
      "resource.scout.narrow_scope" as const,
      "resource.demand.mark_blocked" as const,
      "resource.demand.close" as const,
    ],
    budget: NodeResourceDemandBudgetSchema.parse({
      budgetRef: input.budget?.budgetRef ?? null,
      maxToolCalls: input.budget?.maxToolCalls ?? 8,
      maxRequestRefs: input.budget?.maxRequestRefs ?? 24,
      maxWindowLines: input.budget?.maxWindowLines ?? 600,
      maxPayloadBytes: input.budget?.maxPayloadBytes ?? 96_000,
      rawPromptStored: false,
    }),
    reasonCodes: [
      "node_resource_demand_session_opened",
      focusState.focus
        ? "node_resource_demand_opened_from_resource_objective_focus"
        : "node_resource_demand_opened_from_worker_context_request",
      ...focusState.reasonCodes,
    ],
    semanticJudgmentOwner: "model_or_human" as const,
    semanticQualityJudgedByDeterministicCode: false as const,
    storagePolicy: storagePolicy(),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  const session = NodeResourceDemandSessionSchema.parse(withHash(body, "sessionHash"));
  return {
    status: "succeeded",
    session,
    request: null,
    fulfillment: null,
    blocker: null,
    outputRef: session.sessionRef,
    outputHash: session.sessionHash,
    outputSummary: `Opened node resource demand session for ${session.consumerNodeId}.`,
    reasonCodes: session.reasonCodes,
    metadata: boundedMetadata({ session }),
  };
}

export function requestNodeResourceDemand(input: {
  session: NodeResourceDemandSession;
  requestKind: NodeResourceDemandRequestKind;
  requestedRefs?: string[];
  fileRef?: string | null;
  symbolRef?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  reason?: string | null;
  expectedUse?: string | null;
  providedRefs?: string[];
  boundedSnapshotRefs?: string[];
}): NodeResourceDemandCompileResult {
  const session = NodeResourceDemandSessionSchema.parse(input.session);
  if (session.status !== "open") {
    const blocker = buildBlocker({
      runtimeJobId: session.runtimeJobId,
      workflowId: session.workflowId,
      graphId: session.graphId,
      consumerNodeId: session.consumerNodeId,
      sessionRef: session.sessionRef,
      blockerKind: "lifecycle_violation",
      blockerSummary: `Context demand session is ${session.status}; new requests require an open session.`,
      nextLegalTransitions: ["resource.demand.close"],
      reasonCodes: ["node_resource_demand_session_not_open"],
    });
    return demandBlockedResult(blocker);
  }
  const requestedRefs = requestRefsFor(input);
  const missingFields = [
    requestedRefs.length > 0 ? null : "requestedRefs",
    bounded(input.reason, 1_200) ? null : "reason",
    bounded(input.expectedUse, 1_200) ? null : "expectedUse",
  ].filter((field): field is string => Boolean(field));
  if (missingFields.length > 0) {
    const blocker = buildBlocker({
      runtimeJobId: session.runtimeJobId,
      workflowId: session.workflowId,
      graphId: session.graphId,
      consumerNodeId: session.consumerNodeId,
      sessionRef: session.sessionRef,
      blockerKind: "missing_required_field",
      missingFields,
      blockerSummary: `Context demand request is missing required structural fields: ${missingFields.join(", ")}.`,
      reasonCodes: missingFields.map((field) => `node_resource_demand_request_${field}_missing`),
    });
    return demandBlockedResult(blocker);
  }
  if (requestedRefs.length > session.budget.maxRequestRefs) {
    const blocker = buildBlocker({
      runtimeJobId: session.runtimeJobId,
      workflowId: session.workflowId,
      graphId: session.graphId,
      consumerNodeId: session.consumerNodeId,
      sessionRef: session.sessionRef,
      blockerKind: "budget_exceeded",
      blockerSummary: `Context demand requested ${requestedRefs.length} refs above maxRequestRefs ${session.budget.maxRequestRefs}.`,
      reasonCodes: ["node_resource_demand_request_ref_budget_exceeded"],
    });
    return demandBlockedResult(blocker);
  }
  const deniedRefs = requestedRefs.filter(
    (ref) => !authorityAllowsRef({ authorityScope: session.authorityScope, ref }),
  );
  if (deniedRefs.length > 0) {
    const blocker = buildBlocker({
      runtimeJobId: session.runtimeJobId,
      workflowId: session.workflowId,
      graphId: session.graphId,
      consumerNodeId: session.consumerNodeId,
      sessionRef: session.sessionRef,
      blockerKind: "authority_scope_violation",
      deniedRefs,
      blockerSummary: "Context demand request included refs outside the consumer authority scope.",
      reasonCodes: ["node_resource_demand_authority_scope_violation"],
    });
    return demandBlockedResult(blocker);
  }
  const requestId = `node-resource-demand-request:${hashValue({
    sessionRef: session.sessionRef,
    requestKind: input.requestKind,
    requestedRefs,
    reason: input.reason,
    expectedUse: input.expectedUse,
  }).slice(0, 18)}`;
  const requestBody = {
    artifactKind: "node_resource_demand_request" as const,
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    requestId,
    requestRef: `${session.sessionRef}/request/${requestId}`,
    requestHash: "pending",
    sessionRef: session.sessionRef,
    runtimeJobId: session.runtimeJobId,
    workflowId: session.workflowId,
    graphId: session.graphId,
    consumerNodeId: session.consumerNodeId,
    requestKind: input.requestKind,
    requestedRefs,
    fileRef: bounded(input.fileRef, 420) || null,
    symbolRef: bounded(input.symbolRef, 420) || null,
    lineStart: input.lineStart ?? null,
    lineEnd: input.lineEnd ?? null,
    reason: bounded(input.reason, 1_200),
    expectedUse: bounded(input.expectedUse, 1_200),
    authorityScope: session.authorityScope,
    status: "accepted" as const,
    nextLegalTransitions: ["resource.demand.close" as const, "resource.demand.mark_blocked" as const],
    reasonCodes: [`node_resource_demand_${input.requestKind}_request_accepted`],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  const request = NodeResourceDemandRequestSchema.parse(withHash(requestBody, "requestHash"));
  const providedRefs = strings(input.providedRefs, 120, 420);
  const boundedSnapshotRefs = strings(input.boundedSnapshotRefs, 120, 420);
  const fulfillmentRefs = providedRefs.length > 0 ? providedRefs : requestedRefs;
  const fulfillmentId = `node-resource-demand-fulfillment:${hashValue({
    sessionRef: session.sessionRef,
    requestRef: request.requestRef,
    fulfillmentRefs,
    boundedSnapshotRefs,
  }).slice(0, 18)}`;
  const fulfillmentBody = {
    artifactKind: "node_resource_demand_fulfillment" as const,
    schemaVersion: NODE_RESOURCE_DEMAND_SESSION_SCHEMA_VERSION,
    fulfillmentId,
    fulfillmentRef: `${session.sessionRef}/fulfillment/${fulfillmentId}`,
    fulfillmentHash: "pending",
    sessionRef: session.sessionRef,
    requestRef: request.requestRef,
    runtimeJobId: session.runtimeJobId,
    workflowId: session.workflowId,
    graphId: session.graphId,
    consumerNodeId: session.consumerNodeId,
    requestKind: input.requestKind,
    providedRefs: fulfillmentRefs,
    boundedSnapshotRefs,
    deniedRefs: [],
    status: "fulfilled" as const,
    reasonCodes: [`node_resource_demand_${input.requestKind}_fulfilled_by_authorized_ref`],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  const fulfillment = NodeResourceDemandFulfillmentSchema.parse(
    withHash(fulfillmentBody, "fulfillmentHash"),
  );
  const updatedSession = NodeResourceDemandSessionSchema.parse(
    withHash(
      {
        ...session,
        sessionHash: "pending",
        requestRefs: [...session.requestRefs, request.requestRef],
        fulfillmentRefs: [...session.fulfillmentRefs, fulfillment.fulfillmentRef],
        status: "fulfilled" as const,
        nextLegalTransitions: [
          "resource.demand.fulfill_exact_handles" as const,
          "resource.demand.request_file_window" as const,
          "resource.demand.request_symbol" as const,
          "resource.demand.request_related_tests" as const,
          "resource.demand.request_memory_pack" as const,
          "resource.demand.request_resource_ref" as const,
          "resource.demand.request_source_prompt_section" as const,
          "resource.demand.request_owner_constraint" as const,
          "resource.demand.request_project_fact" as const,
          "resource.demand.request_research_brief" as const,
          "resource.demand.request_planning_capsule" as const,
          "resource.demand.request_action_graph_candidate" as const,
          "resource.demand.request_compile_readiness_input" as const,
          "resource.demand.request_human_decision_ref" as const,
          "resource.demand.request_workflow_manifest_ref" as const,
          "resource.demand.request_proof_artifact_ref" as const,
          "resource.demand.request_closeout_ref" as const,
          "resource.demand.close" as const,
        ],
        reasonCodes: [...session.reasonCodes, ...request.reasonCodes, ...fulfillment.reasonCodes],
      },
      "sessionHash",
    ),
  );
  return {
    status: "succeeded",
    session: updatedSession,
    request,
    fulfillment,
    blocker: null,
    outputRef: fulfillment.fulfillmentRef,
    outputHash: fulfillment.fulfillmentHash,
    outputSummary: `Context demand fulfilled ${fulfillment.providedRefs.length} authorized ${input.requestKind} ref(s) for ${session.consumerNodeId}.`,
    reasonCodes: [...request.reasonCodes, ...fulfillment.reasonCodes],
    metadata: boundedMetadata({ session: updatedSession, request, fulfillment }),
  };
}

export function fulfillExactNodeResourceDemandHandles(input: {
  session: NodeResourceDemandSession;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse;
  reason?: string | null;
  expectedUse?: string | null;
  providedRefs?: string[];
  boundedSnapshotRefs?: string[];
}): NodeResourceDemandCompileResult {
  const session = NodeResourceDemandSessionSchema.parse(input.session);
  const legalRefUniverse = ResourceObjectiveFocusLegalRefUniverseSchema.parse(
    input.legalRefUniverse,
  );
  const classification = classifyNodeResourceDemandSelectedRefsForExactFulfillment({
    session,
    legalRefUniverse,
  });
  if (!classification.canFulfillDirectly || classification.exactHandles.length === 0) {
    return markNodeResourceDemandBlocked({
      session,
      blockerSummary:
        "Context demand selected broad, oversized, mixed-kind, or otherwise non-exact handles. Runtime must not choose lines or semantic sub-scope; a specialist narrowing subturn is required.",
      reasonCodes: strings(
        [
          "node_resource_demand_exact_fulfillment_not_available",
          "node_resource_demand_specialist_narrowing_required",
          ...classification.reasonCodes,
          ...classification.narrowingRequiredHandles.flatMap((handle) => handle.reasonCodes),
        ],
        120,
        220,
      ),
      deniedRefs: classification.narrowingRequiredHandles.map((handle) => handle.ref),
    });
  }
  const requestKind = classification.exactHandles[0]!.requestKind;
  const firstFileWindow = classification.exactHandles.find(
    (handle) => handle.requestKind === "file_window",
  );
  const fulfilled = requestNodeResourceDemand({
    session,
    requestKind,
    requestedRefs: classification.exactHandles.map((handle) => handle.ref),
    fileRef: firstFileWindow?.fileRef ?? null,
    lineStart: firstFileWindow?.lineStart ?? null,
    lineEnd: firstFileWindow?.lineEnd ?? null,
    reason:
      input.reason ??
      "Fulfill node resource demand from model-selected exact handles without runtime semantic narrowing.",
    expectedUse: input.expectedUse ?? session.expectedUse,
    providedRefs:
      input.providedRefs && input.providedRefs.length > 0
        ? input.providedRefs
        : classification.exactHandles.map((handle) => handle.ref),
    boundedSnapshotRefs: input.boundedSnapshotRefs,
  });
  return {
    ...fulfilled,
    reasonCodes: strings(
      [
        "node_resource_demand_exact_handles_fulfilled",
        ...classification.reasonCodes,
        ...fulfilled.reasonCodes,
      ],
      120,
      220,
    ),
  };
}

function demandBlockedResult(blocker: NodeResourceDemandBlocker): NodeResourceDemandCompileResult {
  return {
    status: "needs_review",
    session: null,
    request: null,
    fulfillment: null,
    blocker,
    outputRef: blocker.blockerRef,
    outputHash: blocker.blockerHash,
    outputSummary: blocker.blockerSummary,
    reasonCodes: blocker.reasonCodes,
    metadata: boundedMetadata({ blocker }),
  };
}

export function markNodeResourceDemandBlocked(input: {
  session: NodeResourceDemandSession;
  blockerSummary: string;
  reasonCodes?: string[];
  deniedRefs?: string[];
}): NodeResourceDemandCompileResult {
  const session = NodeResourceDemandSessionSchema.parse(input.session);
  const blocker = buildBlocker({
    runtimeJobId: session.runtimeJobId,
    workflowId: session.workflowId,
    graphId: session.graphId,
    consumerNodeId: session.consumerNodeId,
    sessionRef: session.sessionRef,
    blockerKind: "no_direct_fulfillment",
    deniedRefs: input.deniedRefs,
    blockerSummary: input.blockerSummary,
    nextLegalTransitions: ["resource.scout.narrow_scope", "resource.scout.dispatch_specialist_subturn"],
    reasonCodes: input.reasonCodes ?? ["resource_demand_blocked_needs_specialist_or_revision"],
  });
  const updatedSession = NodeResourceDemandSessionSchema.parse(
    withHash(
      {
        ...session,
        sessionHash: "pending",
        status: "blocked" as const,
        blockerRefs: [...session.blockerRefs, blocker.blockerRef],
        deniedRefs: [...session.deniedRefs, ...blocker.deniedRefs],
        nextLegalTransitions: [
          "resource.scout.narrow_scope" as const,
          "resource.scout.dispatch_specialist_subturn" as const,
        ],
        reasonCodes: [...session.reasonCodes, ...blocker.reasonCodes],
      },
      "sessionHash",
    ),
  );
  return {
    status: "needs_review",
    session: updatedSession,
    request: null,
    fulfillment: null,
    blocker,
    outputRef: blocker.blockerRef,
    outputHash: blocker.blockerHash,
    outputSummary: blocker.blockerSummary,
    reasonCodes: blocker.reasonCodes,
    metadata: boundedMetadata({ session: updatedSession, blocker }),
  };
}

export function closeNodeResourceDemandSession(input: {
  session: NodeResourceDemandSession;
  closeReason?: string | null;
}): NodeResourceDemandCompileResult {
  const session = NodeResourceDemandSessionSchema.parse(input.session);
  const blocked = session.blockerRefs.length > 0 && session.fulfillmentRefs.length === 0;
  const updatedSession = NodeResourceDemandSessionSchema.parse(
    withHash(
      {
        ...session,
        sessionHash: "pending",
        status: blocked ? ("blocked" as const) : ("closed" as const),
        nextLegalTransitions: blocked
          ? ["resource.scout.dispatch_specialist_subturn" as const]
          : [],
        reasonCodes: [
          ...session.reasonCodes,
          blocked ? "node_resource_demand_close_blocked" : "node_resource_demand_session_closed",
        ],
      },
      "sessionHash",
    ),
  );
  return {
    status: blocked ? "needs_review" : "succeeded",
    session: updatedSession,
    request: null,
    fulfillment: null,
    blocker: null,
    outputRef: updatedSession.sessionRef,
    outputHash: updatedSession.sessionHash,
    outputSummary: bounded(
      input.closeReason ??
        (blocked
          ? "Context demand session closed with blockers."
          : "Context demand session closed."),
      1_200,
    ),
    reasonCodes: updatedSession.reasonCodes.slice(-20),
    metadata: boundedMetadata({ session: updatedSession }),
  };
}

function sessionFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceDemandSession | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const session = record.nodeResourceDemandSession ?? asRecord(record.nodeResourceDemand).session;
    const parsed = NodeResourceDemandSessionSchema.safeParse(session);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function mergedRecord(input: { volatileInput?: unknown; metadata?: unknown }): Record<
  string,
  unknown
> {
  return {
    ...asRecord(input.volatileInput),
    ...asRecord(input.metadata),
    ...asRecord(asRecord(input.volatileInput).nodeResourceDemand),
    ...asRecord(asRecord(input.metadata).nodeResourceDemand),
  };
}

export function compileNodeResourceDemandToolOutput(input: {
  toolId: string;
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceDemandCompileResult {
  const data = mergedRecord(input);
  const session = sessionFromSources(input);
  if (input.toolId === "resource.demand.open") {
    return openNodeResourceDemandSession({
      runtimeJobId: typeof data.runtimeJobId === "string" ? data.runtimeJobId : null,
      workflowId: typeof data.workflowId === "string" ? data.workflowId : null,
      graphId: typeof data.graphId === "string" ? data.graphId : null,
      consumerNodeId: typeof data.consumerNodeId === "string" ? data.consumerNodeId : null,
      consumerBranchId: typeof data.consumerBranchId === "string" ? data.consumerBranchId : null,
      workIntentRef: typeof data.workIntentRef === "string" ? data.workIntentRef : null,
      nodeExecutionContractRef:
        typeof data.nodeExecutionContractRef === "string" ? data.nodeExecutionContractRef : null,
      nodeExecutionPacketRef:
        typeof data.nodeExecutionPacketRef === "string" ? data.nodeExecutionPacketRef : null,
      capabilityId: typeof data.capabilityId === "string" ? data.capabilityId : null,
      evidenceMode: strings(data.evidenceMode, 12, 120),
      targetCommitmentIds: strings(data.targetCommitmentIds, 40, 180),
      authorityScope: strings(data.authorityScope, 120, 420),
      demandReason: typeof data.demandReason === "string" ? data.demandReason : null,
      expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
      resourceObjectiveFocus: ResourceObjectiveFocusSchema.safeParse(data.resourceObjectiveFocus).success
        ? ResourceObjectiveFocusSchema.parse(data.resourceObjectiveFocus)
        : null,
      legalRefUniverse: ResourceObjectiveFocusLegalRefUniverseSchema.safeParse(data.legalRefUniverse)
        .success
        ? ResourceObjectiveFocusLegalRefUniverseSchema.parse(data.legalRefUniverse)
        : null,
      budget: asRecord(data.budget) as Partial<NodeResourceDemandBudget>,
    });
  }
  if (
    (input.toolId === "resource.demand.recompile_from_scope_revision" ||
      input.toolId === "resource.demand.execute_recompiled_packet") &&
    !session
  ) {
    const outputRef =
      typeof data.recompiledPacketRef === "string"
        ? bounded(data.recompiledPacketRef, 700)
        : typeof data.newPacketCompileInputRef === "string"
          ? bounded(data.newPacketCompileInputRef, 700)
          : typeof data.scopeRevisionDecisionRef === "string"
            ? bounded(data.scopeRevisionDecisionRef, 700)
            : "node-resource-demand://scope-revision/recompiled";
    const metadata = {
      scopeRevisionRequestRef:
        typeof data.scopeRevisionRequestRef === "string"
          ? bounded(data.scopeRevisionRequestRef, 700)
          : null,
      scopeRevisionDecisionRef:
        typeof data.scopeRevisionDecisionRef === "string"
          ? bounded(data.scopeRevisionDecisionRef, 700)
          : null,
      recompiledPacketRef: outputRef,
      estimatedProviderInputBytes:
        typeof data.estimatedProviderInputBytes === "number"
          ? data.estimatedProviderInputBytes
          : null,
      maxInputBytes: typeof data.maxInputBytes === "number" ? data.maxInputBytes : null,
      reasonCodes: strings(data.reasonCodes, 40, 220),
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    } satisfies JsonValue;
    return {
      status: "succeeded",
      session: null,
      request: null,
      fulfillment: null,
      blocker: null,
      outputRef,
      outputHash: hashValue(metadata),
      outputSummary:
        input.toolId === "resource.demand.execute_recompiled_packet"
          ? "Executed context packet recompiled from model-authored scope revision."
          : "Recompiled node resource demand from model-authored scope revision.",
      reasonCodes: [
        input.toolId === "resource.demand.execute_recompiled_packet"
          ? "node_resource_demand_executed_recompiled_scope_revision_packet"
          : "node_resource_demand_recompiled_from_scope_revision",
        ...strings(data.reasonCodes, 40, 220),
      ],
      metadata,
    };
  }
  if (!session) {
    return openNodeResourceDemandSession({
      runtimeJobId: typeof data.runtimeJobId === "string" ? data.runtimeJobId : null,
      workflowId: typeof data.workflowId === "string" ? data.workflowId : null,
      graphId: typeof data.graphId === "string" ? data.graphId : null,
      consumerNodeId: typeof data.consumerNodeId === "string" ? data.consumerNodeId : null,
      capabilityId: typeof data.capabilityId === "string" ? data.capabilityId : null,
      evidenceMode: strings(data.evidenceMode, 12, 120),
      authorityScope: strings(data.authorityScope, 120, 420),
      demandReason: typeof data.demandReason === "string" ? data.demandReason : null,
      expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
      resourceObjectiveFocus: ResourceObjectiveFocusSchema.safeParse(data.resourceObjectiveFocus).success
        ? ResourceObjectiveFocusSchema.parse(data.resourceObjectiveFocus)
        : null,
      legalRefUniverse: ResourceObjectiveFocusLegalRefUniverseSchema.safeParse(data.legalRefUniverse)
        .success
        ? ResourceObjectiveFocusLegalRefUniverseSchema.parse(data.legalRefUniverse)
        : null,
    });
  }
  if (input.toolId === "resource.demand.fulfill_exact_handles") {
    const parsedUniverse = ResourceObjectiveFocusLegalRefUniverseSchema.safeParse(
      data.legalRefUniverse,
    );
    if (!parsedUniverse.success) {
      return markNodeResourceDemandBlocked({
        session,
        blockerSummary:
          "Exact node resource demand fulfillment requires the accepted legal ref universe by ref/body; runtime cannot infer exact handles from session refs alone.",
        reasonCodes: [
          "node_resource_demand_exact_fulfillment_legal_ref_universe_missing",
          "node_resource_demand_specialist_narrowing_required",
        ],
      });
    }
    return fulfillExactNodeResourceDemandHandles({
      session,
      legalRefUniverse: parsedUniverse.data,
      reason: typeof data.reason === "string" ? data.reason : null,
      expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
      providedRefs: strings(data.providedRefs ?? data.providedContextRefs, 120, 420),
      boundedSnapshotRefs: strings(data.boundedSnapshotRefs ?? data.snapshotRefs, 120, 420),
    });
  }
  if (input.toolId === "resource.demand.mark_blocked") {
    return markNodeResourceDemandBlocked({
      session,
      blockerSummary:
        typeof data.blockerSummary === "string"
          ? data.blockerSummary
          : "Context demand could not be fulfilled directly.",
      reasonCodes: strings(data.reasonCodes, 40, 220),
      deniedRefs: strings(data.deniedRefs, 80, 420),
    });
  }
  if (input.toolId === "resource.demand.close") {
    return closeNodeResourceDemandSession({
      session,
      closeReason: typeof data.closeReason === "string" ? data.closeReason : null,
    });
  }
  if (
    input.toolId === "resource.demand.recompile_from_scope_revision" ||
    input.toolId === "resource.demand.execute_recompiled_packet"
  ) {
    const outputRef =
      typeof data.recompiledPacketRef === "string"
        ? bounded(data.recompiledPacketRef, 700)
        : typeof data.newPacketCompileInputRef === "string"
          ? bounded(data.newPacketCompileInputRef, 700)
          : typeof data.scopeRevisionDecisionRef === "string"
            ? bounded(data.scopeRevisionDecisionRef, 700)
            : `${session.sessionRef}/scope-revision/recompiled`;
    const metadata = {
      nodeResourceDemandSessionRef: session.sessionRef,
      nodeResourceDemandStatus: session.status,
      scopeRevisionRequestRef:
        typeof data.scopeRevisionRequestRef === "string"
          ? bounded(data.scopeRevisionRequestRef, 700)
          : null,
      scopeRevisionDecisionRef:
        typeof data.scopeRevisionDecisionRef === "string"
          ? bounded(data.scopeRevisionDecisionRef, 700)
          : null,
      recompiledPacketRef: outputRef,
      estimatedProviderInputBytes:
        typeof data.estimatedProviderInputBytes === "number"
          ? data.estimatedProviderInputBytes
          : null,
      maxInputBytes: typeof data.maxInputBytes === "number" ? data.maxInputBytes : null,
      reasonCodes: strings(data.reasonCodes, 40, 220),
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    } satisfies JsonValue;
    return {
      status: "succeeded",
      session,
      request: null,
      fulfillment: null,
      blocker: null,
      outputRef,
      outputHash: hashValue(metadata),
      outputSummary:
        input.toolId === "resource.demand.execute_recompiled_packet"
          ? `Executed context packet recompiled from model-authored scope revision for ${session.consumerNodeId}.`
          : `Recompiled node resource demand from model-authored scope revision for ${session.consumerNodeId}.`,
      reasonCodes: [
        input.toolId === "resource.demand.execute_recompiled_packet"
          ? "node_resource_demand_executed_recompiled_scope_revision_packet"
          : "node_resource_demand_recompiled_from_scope_revision",
        ...strings(data.reasonCodes, 40, 220),
      ],
      metadata,
    };
  }
  const requestKindByTool: Record<string, NodeResourceDemandRequestKind> = {
    "resource.demand.request_file_window": "file_window",
    "resource.demand.request_symbol": "symbol",
    "resource.demand.request_related_tests": "related_tests",
    "resource.demand.request_memory_pack": "memory_pack",
    "resource.demand.request_resource_ref": "resource_ref",
    "resource.demand.request_source_prompt_section": "source_prompt_section",
    "resource.demand.request_owner_constraint": "owner_constraint",
    "resource.demand.request_project_fact": "project_fact",
    "resource.demand.request_research_brief": "research_brief",
    "resource.demand.request_planning_capsule": "planning_capsule",
    "resource.demand.request_action_graph_candidate": "action_graph_candidate",
    "resource.demand.request_compile_readiness_input": "compile_readiness_input",
    "resource.demand.request_human_decision_ref": "human_decision_ref",
    "resource.demand.request_workflow_manifest_ref": "workflow_manifest_ref",
    "resource.demand.request_proof_artifact_ref": "proof_artifact_ref",
    "resource.demand.request_closeout_ref": "closeout_ref",
  };
  const requestKind = requestKindByTool[input.toolId];
  if (!requestKind) {
    const blocker = buildBlocker({
      runtimeJobId: session.runtimeJobId,
      workflowId: session.workflowId,
      graphId: session.graphId,
      consumerNodeId: session.consumerNodeId,
      sessionRef: session.sessionRef,
      blockerKind: "unsupported_request_kind",
      blockerSummary: `Unsupported node resource demand tool: ${bounded(input.toolId, 160)}.`,
      reasonCodes: ["node_resource_demand_unsupported_tool"],
    });
    return demandBlockedResult(blocker);
  }
  return requestNodeResourceDemand({
    session,
    requestKind,
    requestedRefs: strings(data.requestedRefs ?? data.fileRefs ?? data.contextRefs, 120, 420),
    fileRef: typeof data.fileRef === "string" ? data.fileRef : null,
    symbolRef: typeof data.symbolRef === "string" ? data.symbolRef : null,
    lineStart: typeof data.lineStart === "number" ? data.lineStart : null,
    lineEnd: typeof data.lineEnd === "number" ? data.lineEnd : null,
    reason: typeof data.reason === "string" ? data.reason : null,
    expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
    providedRefs: strings(data.providedRefs ?? data.providedContextRefs, 120, 420),
    boundedSnapshotRefs: strings(data.boundedSnapshotRefs ?? data.snapshotRefs, 120, 420),
  });
}

export function compileWorkerContextRequestDemand(input: {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  consumerNodeId?: string | null;
  workIntentRef?: string | null;
  nodeExecutionContractRef?: string | null;
  nodeExecutionPacketRef?: string | null;
  capabilityId?: string | null;
  evidenceMode?: string[] | EvidenceMode[];
  targetCommitmentIds?: string[];
  authorityScope?: string[];
  demandReason?: string | null;
  expectedUse?: string | null;
  resourceObjectiveFocus?: ResourceObjectiveFocus | null;
  legalRefUniverse?: ResourceObjectiveFocusLegalRefUniverse | null;
  requestedFileRefs?: string[];
  providedRefs?: string[];
  boundedSnapshotRefs?: string[];
}): NodeResourceDemandCompileResult {
  const opened = openNodeResourceDemandSession({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    consumerNodeId: input.consumerNodeId,
    workIntentRef: input.workIntentRef,
    nodeExecutionContractRef: input.nodeExecutionContractRef,
    nodeExecutionPacketRef: input.nodeExecutionPacketRef,
    capabilityId: input.capabilityId,
    evidenceMode: input.evidenceMode,
    targetCommitmentIds: input.targetCommitmentIds,
    authorityScope: input.authorityScope,
    demandReason: input.demandReason,
    expectedUse: input.expectedUse,
    resourceObjectiveFocus: input.resourceObjectiveFocus,
    legalRefUniverse: input.legalRefUniverse,
  });
  if (!opened.session) {
    return opened;
  }
  return requestNodeResourceDemand({
    session: opened.session,
    requestKind: "file_window",
    requestedRefs: input.requestedFileRefs,
    reason: input.demandReason,
    expectedUse: input.expectedUse,
    providedRefs: input.providedRefs,
    boundedSnapshotRefs: input.boundedSnapshotRefs,
  });
}
