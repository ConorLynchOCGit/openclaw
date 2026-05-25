import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue, RuntimeJobArtifact } from "../runtime-job-repository.ts";
import type {
  CodingResourcePacket,
  NodeExecutionPacket,
  NodeReadinessState,
} from "./node-resource-materialization.ts";

export const CONTEXT_BROKER_REQUEST_ARTIFACT_TYPE =
  "execution_platform.context_broker.request" as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 300) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const ContextBrokerRequestStatusSchema = z.enum([
  "satisfied_from_inherited_context",
  "satisfied_from_cache",
  "context_scout_required",
  "blocked_needs_review",
]);

export type ContextBrokerRequestStatus = z.infer<typeof ContextBrokerRequestStatusSchema>;

export const ContextBrokerRequestSchema = z
  .object({
    artifactKind: z.literal("context_broker_request"),
    schemaVersion: z.literal("execution-platform.context-broker-request.v1"),
    requestId: boundedString(180),
    requestRef: boundedString(420),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    requestingNodeId: boundedString(180),
    consumerNodeId: boundedString(180),
    targetCommitmentIds: stringList(40, 180),
    requiredResourceKind: boundedString(120),
    neededByPhase: boundedString(120),
    semanticQuestion: boundedString(1_200),
    candidateResourceRefs: stringList(80, 320),
    inheritedContextRefs: stringList(80, 320),
    knownContextRefs: stringList(100, 320),
    outputContextRefs: stringList(80, 320),
    missingContextReasonCodes: stringList(80, 180),
    blockingLimitations: stringList(40, 700),
    nonblockingLimitations: stringList(40, 700),
    consumerWaiverRefs: stringList(40, 320),
    blockingIfMissing: z.boolean(),
    inheritedContextUsable: z.boolean(),
    contextScoutRequired: z.boolean(),
    budgetClass: z.enum(["cheap", "standard", "premium", "unknown"]).default("unknown"),
    deadlineMs: z.number().int().min(0).nullable().default(null),
    dedupeKey: boundedString(220),
    status: ContextBrokerRequestStatusSchema,
    nextTransition: z.enum([
      "none",
      "use_inherited_context",
      "dispatch_context_scout",
      "needs_review",
    ]),
    reasonCodes: stringList(100, 180),
    createdAt: optionalBoundedString(80),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type ContextBrokerRequest = z.infer<typeof ContextBrokerRequestSchema>;

export type ContextBrokerRequestSummary = {
  requestRef: string;
  status: ContextBrokerRequestStatus;
  requestingNodeId: string;
  consumerNodeId: string;
  targetCommitmentIds: string[];
  requiredResourceKind: string;
  neededByPhase: string;
  inheritedContextUsable: boolean;
  contextScoutRequired: boolean;
  dedupeKey: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string | null | undefined, max: number): string {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function unique(values: Array<string | null | undefined>, max = 24, maxChars = 300): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = bounded(value, maxChars);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 80, maxChars = 300): string[] {
  return Array.isArray(value)
    ? unique(
        value.filter((entry): entry is string => typeof entry === "string"),
        max,
        maxChars,
      )
    : [];
}

function contextRelatedReasonCodes(readiness: NodeReadinessState): string[] {
  return unique(
    readiness.blockingReasonCodes.filter((reason) =>
      /context|freshness|handoff|snapshot|target_ref|target_refs|validation_plan/u.test(reason),
    ),
    80,
    180,
  );
}

function defaultSemanticQuestion(readiness: NodeReadinessState): string {
  const blocker = readiness.blockingLimitations.at(0) ?? readiness.blockers.at(0);
  const reason = contextRelatedReasonCodes(readiness).at(0) ?? readiness.repairAction;
  return bounded(
    [
      `Resolve the branch-local context gap for node ${readiness.nodeId}.`,
      reason ? `Reason: ${reason}.` : null,
      blocker ? `Blocking detail: ${blocker}` : null,
      readiness.targetCommitmentIds.length
        ? `Commitments: ${readiness.targetCommitmentIds.join(", ")}.`
        : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" "),
    1_200,
  );
}

export function buildContextBrokerRequestRef(input: {
  runtimeJobId: string;
  graphId: string;
  consumerNodeId: string;
  dedupeKey: string;
}): string {
  return `runtime-job://${bounded(input.runtimeJobId, 180)}/context-broker/${bounded(
    input.graphId,
    120,
  )}/${bounded(input.consumerNodeId, 120)}/${input.dedupeKey}`;
}

export function buildContextBrokerDedupeKey(input: {
  workflowId: string;
  graphId: string;
  requestingNodeId: string;
  consumerNodeId: string;
  targetCommitmentIds: string[];
  requiredResourceKind: string;
  semanticQuestion: string;
  missingContextReasonCodes: string[];
}): string {
  const hash = hashValue({
    workflowId: input.workflowId,
    graphId: input.graphId,
    requestingNodeId: input.requestingNodeId,
    consumerNodeId: input.consumerNodeId,
    targetCommitmentIds: unique(input.targetCommitmentIds, 40, 180).toSorted(),
    requiredResourceKind: input.requiredResourceKind,
    semanticQuestion: bounded(input.semanticQuestion, 1_200),
    missingContextReasonCodes: unique(input.missingContextReasonCodes, 80, 180).toSorted(),
  }).slice(0, 24);
  return `context-broker:${hash}`;
}

export function buildContextBrokerRequest(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  requestingNodeId: string;
  consumerNodeId: string;
  targetCommitmentIds?: string[];
  requiredResourceKind?: string | null;
  neededByPhase?: string | null;
  semanticQuestion: string;
  candidateResourceRefs?: string[];
  inheritedContextRefs?: string[];
  knownContextRefs?: string[];
  outputContextRefs?: string[];
  missingContextReasonCodes?: string[];
  blockingLimitations?: string[];
  nonblockingLimitations?: string[];
  consumerWaiverRefs?: string[];
  blockingIfMissing?: boolean;
  inheritedContextUsable?: boolean;
  budgetClass?: "cheap" | "standard" | "premium" | "unknown";
  deadlineMs?: number | null;
  createdAt?: string | null;
}): ContextBrokerRequest {
  const missingContextReasonCodes = unique(input.missingContextReasonCodes ?? [], 80, 180);
  const inheritedContextRefs = unique(input.inheritedContextRefs ?? [], 80, 320);
  const knownContextRefs = unique(
    [...(input.knownContextRefs ?? []), ...inheritedContextRefs],
    100,
    320,
  );
  const blockingLimitations = unique(input.blockingLimitations ?? [], 40, 700);
  const inheritedContextUsable =
    input.inheritedContextUsable === true &&
    inheritedContextRefs.length > 0 &&
    blockingLimitations.length === 0;
  const status: ContextBrokerRequestStatus = inheritedContextUsable
    ? "satisfied_from_inherited_context"
    : missingContextReasonCodes.length > 0 || blockingLimitations.length > 0
      ? "context_scout_required"
      : knownContextRefs.length > 0
        ? "satisfied_from_cache"
        : "blocked_needs_review";
  const dedupeKey = buildContextBrokerDedupeKey({
    workflowId: input.workflowId,
    graphId: input.graphId,
    requestingNodeId: input.requestingNodeId,
    consumerNodeId: input.consumerNodeId,
    targetCommitmentIds: input.targetCommitmentIds ?? [],
    requiredResourceKind: input.requiredResourceKind ?? "context",
    semanticQuestion: input.semanticQuestion,
    missingContextReasonCodes,
  });
  const requestRef = buildContextBrokerRequestRef({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    consumerNodeId: input.consumerNodeId,
    dedupeKey,
  });
  const reasonCodes = unique(
    [
      "context_broker_request_compiled",
      `context_broker_status:${status}`,
      ...(inheritedContextUsable ? ["context_broker_inherited_context_usable"] : []),
      ...(status === "context_scout_required" ? ["context_broker_context_scout_required"] : []),
      ...missingContextReasonCodes,
    ],
    100,
    180,
  );
  return ContextBrokerRequestSchema.parse({
    artifactKind: "context_broker_request",
    schemaVersion: "execution-platform.context-broker-request.v1",
    requestId: `${bounded(input.consumerNodeId, 120)}:${dedupeKey}`,
    requestRef,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    requestingNodeId: input.requestingNodeId,
    consumerNodeId: input.consumerNodeId,
    targetCommitmentIds: unique(input.targetCommitmentIds ?? [], 40, 180),
    requiredResourceKind: bounded(input.requiredResourceKind ?? "context", 120),
    neededByPhase: bounded(input.neededByPhase ?? "implementation_ready", 120),
    semanticQuestion: bounded(input.semanticQuestion, 1_200),
    candidateResourceRefs: unique(input.candidateResourceRefs ?? [], 80, 320),
    inheritedContextRefs,
    knownContextRefs,
    outputContextRefs: unique(input.outputContextRefs ?? [], 80, 320),
    missingContextReasonCodes,
    blockingLimitations,
    nonblockingLimitations: unique(input.nonblockingLimitations ?? [], 40, 700),
    consumerWaiverRefs: unique(input.consumerWaiverRefs ?? [], 40, 320),
    blockingIfMissing: input.blockingIfMissing ?? true,
    inheritedContextUsable,
    contextScoutRequired: status === "context_scout_required",
    budgetClass: input.budgetClass ?? "unknown",
    deadlineMs: input.deadlineMs ?? null,
    dedupeKey,
    status,
    nextTransition:
      status === "satisfied_from_inherited_context" || status === "satisfied_from_cache"
        ? "use_inherited_context"
        : status === "context_scout_required"
          ? "dispatch_context_scout"
          : "needs_review",
    reasonCodes,
    createdAt: input.createdAt ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });
}

export function buildContextBrokerRequestFromReadiness(input: {
  readinessState: NodeReadinessState;
  nodeExecutionPacket?: NodeExecutionPacket | null;
  resourcePacket?: CodingResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  requestingNodeId?: string | null;
  semanticQuestion?: string | null;
  budgetClass?: "cheap" | "standard" | "premium" | "unknown";
  deadlineMs?: number | null;
  createdAt?: string | null;
}): ContextBrokerRequest {
  const readiness = input.readinessState;
  const resource = asRecord(input.resourcePacket ?? null);
  const implementationContext = asRecord(input.implementationContextPacket ?? null);
  const nodePacket = input.nodeExecutionPacket;
  const inheritedContextRefs = unique(
    [
      ...readiness.contextSnapshotRefs,
      ...(nodePacket?.sourceContextRefs ?? []),
      ...stringArray(resource.acceptedContextHandoffRefs, 80, 320),
      ...stringArray(resource.contextPacketRefs, 80, 320),
      ...stringArray(implementationContext.acceptedContextHandoffRefs, 80, 320),
      ...stringArray(implementationContext.contextHandoffPacketRefs, 80, 320),
      ...stringArray(implementationContext.contextSynthesisRefs, 80, 320),
    ],
    80,
    320,
  );
  const candidateResourceRefs = unique(
    [
      ...stringArray(resource.targetFileRefs, 80, 320),
      ...stringArray(resource.mustReadRefs, 80, 320),
      ...stringArray(resource.likelyModifyRefs, 80, 320),
      ...stringArray(implementationContext.candidateConcreteFileRefs, 80, 320),
      ...stringArray(implementationContext.missingTargetRefs, 80, 320),
      ...stringArray(implementationContext.unreadableTargetRefs, 80, 320),
    ],
    80,
    320,
  );
  const acceptedWithLimitationsWithoutWaiver =
    readiness.contextStatus === "accepted_with_limitations" &&
    readiness.contextLimitationWaiverRefs.length === 0;
  const missingContextReasonCodes = unique(
    [
      ...contextRelatedReasonCodes(readiness),
      ...(acceptedWithLimitationsWithoutWaiver
        ? ["context_broker_accepted_with_limitations_consumer_waiver_required"]
        : []),
    ],
    80,
    180,
  );
  const blockingLimitations = unique(
    [
      ...readiness.blockingLimitations,
      ...(acceptedWithLimitationsWithoutWaiver
        ? [
            "Accepted-with-limitations context cannot unlock this consumer without a consumer-specific waiver ref.",
          ]
        : []),
    ],
    40,
    700,
  );
  const inheritedContextUsable =
    !acceptedWithLimitationsWithoutWaiver &&
    (readiness.contextStatus === "accepted" ||
      readiness.contextStatus === "accepted_with_limitations" ||
      readiness.freshnessStatus === "fresh") &&
    readiness.contextLimitationStatus !== "blocked" &&
    blockingLimitations.length === 0 &&
    inheritedContextRefs.length > 0;
  return buildContextBrokerRequest({
    runtimeJobId: readiness.runtimeJobId,
    workflowId: readiness.workflowId,
    graphId: readiness.graphId,
    requestingNodeId: input.requestingNodeId ?? readiness.nodeId,
    consumerNodeId: readiness.nodeId,
    targetCommitmentIds: readiness.targetCommitmentIds,
    requiredResourceKind: readiness.resourcePacketRef ? "context_repair" : "context_and_resource",
    neededByPhase: readiness.phase,
    semanticQuestion: input.semanticQuestion ?? defaultSemanticQuestion(readiness),
    candidateResourceRefs,
    inheritedContextRefs,
    knownContextRefs: unique(
      [
        ...readiness.contextSnapshotRefs,
        ...readiness.payloadRefs,
        ...readiness.manifestRefs,
        ...inheritedContextRefs,
      ],
      100,
      320,
    ),
    outputContextRefs: inheritedContextUsable ? inheritedContextRefs : [],
    missingContextReasonCodes,
    blockingLimitations,
    nonblockingLimitations: readiness.nonblockingLimitations,
    consumerWaiverRefs: readiness.contextLimitationWaiverRefs,
    blockingIfMissing: readiness.repairAction === "request_context_repair",
    inheritedContextUsable,
    budgetClass: input.budgetClass ?? "cheap",
    deadlineMs: input.deadlineMs ?? null,
    createdAt: input.createdAt ?? null,
  });
}

export function summarizeContextBrokerRequest(
  request: ContextBrokerRequest,
): ContextBrokerRequestSummary {
  return {
    requestRef: request.requestRef,
    status: request.status,
    requestingNodeId: request.requestingNodeId,
    consumerNodeId: request.consumerNodeId,
    targetCommitmentIds: request.targetCommitmentIds.slice(0, 20),
    requiredResourceKind: request.requiredResourceKind,
    neededByPhase: request.neededByPhase,
    inheritedContextUsable: request.inheritedContextUsable,
    contextScoutRequired: request.contextScoutRequired,
    dedupeKey: request.dedupeKey,
    reasonCodes: request.reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function summarizeContextBrokerRequestArtifact(input: {
  artifact: RuntimeJobArtifact;
  body: ContextBrokerRequest;
}): ContextBrokerRequestSummary & {
  artifactRef: string;
  payloadRef: string | null;
  byteCount: number | null;
  hash: string | null;
} {
  const metadata = asRecord(input.artifact.metadata);
  return {
    ...summarizeContextBrokerRequest(input.body),
    artifactRef: input.artifact.uri,
    payloadRef: typeof metadata.payloadRef === "string" ? metadata.payloadRef : null,
    byteCount: typeof metadata.byteCount === "number" ? metadata.byteCount : null,
    hash: typeof metadata.sha256 === "string" ? metadata.sha256 : null,
  };
}

export function dedupeContextBrokerRequests(
  requests: ContextBrokerRequest[],
): ContextBrokerRequest[] {
  const seen = new Set<string>();
  const output: ContextBrokerRequest[] = [];
  for (const request of requests) {
    if (seen.has(request.dedupeKey)) {
      continue;
    }
    seen.add(request.dedupeKey);
    output.push(request);
  }
  return output;
}
