import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  NodeResourceDemandBlocker,
  NodeResourceDemandFulfillment,
  NodeResourceDemandRequest,
  NodeResourceDemandSession,
} from "./node-resource-demand-session.ts";
import {
  NodeResourceDemandBlockerSchema,
  NodeResourceDemandFulfillmentSchema,
  NodeResourceDemandRequestSchema,
  NodeResourceDemandSessionSchema,
} from "./node-resource-demand-session.ts";
import type { EvidenceMode } from "./execution-intent.ts";
import { EvidenceModeSchema } from "./execution-intent.ts";
import type {
  NodeResourceLedger,
  NodeResourceLedgerAppendResult,
  NodeResourceLedgerEntry,
  NodeResourceLedgerEntryKind,
  NodeResourceLedgerEntryManifest,
  NodeResourceLedgerManifest,
  NodeContextProviderDiagnosticShape,
} from "./node-resource-ledger.ts";
import {
  NodeResourceLedgerSchema,
  appendNodeResourceLedgerEntry,
  buildNodeResourceLedgerEntryManifest,
  buildNodeResourceLedgerManifest,
  openNodeResourceLedger,
} from "./node-resource-ledger.ts";

export const CONTEXT_SCOUT_SPECIALIST_SUBTURN_REQUEST_ARTIFACT_TYPE =
  "execution_platform.resource.scout.specialist_subturn_request" as const;
export const CONTEXT_SCOUT_SPECIALIST_HANDOFF_ARTIFACT_TYPE =
  "execution_platform.resource.scout.specialist_handoff" as const;
export const CONTEXT_SCOUT_SPECIALIST_RESULT_ARTIFACT_TYPE =
  "execution_platform.resource.scout.specialist_result" as const;
export const CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION =
  "execution-platform.context-scout-specialist-subturn.v1" as const;

export const CONTEXT_SCOUT_SPECIALIST_TOOL_IDS = [
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
] as const;
export type ContextScoutSpecialistToolId = (typeof CONTEXT_SCOUT_SPECIALIST_TOOL_IDS)[number];

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedString = (max: number) =>
  z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const ContextScoutSpecialistTriggerSchema = z.enum([
  "direct_fulfillment_insufficient",
  "cross_file_pattern_mapping",
  "multi_ref_exploration",
  "workflow_defined_specialist",
]);
export type ContextScoutSpecialistTrigger = z.infer<
  typeof ContextScoutSpecialistTriggerSchema
>;

export const ContextScoutSpecialistStatusSchema = z.enum([
  "dispatch_ready",
  "fulfilled",
  "blocked",
]);
export type ContextScoutSpecialistStatus = z.infer<
  typeof ContextScoutSpecialistStatusSchema
>;

export const ContextScoutSpecialistStoragePolicySchema = z
  .object({
    payloadBackedBodies: z.literal(true),
    manifestMetadataOnly: z.literal(true),
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

export const ContextScoutSpecialistProviderProfileSchema = z
  .object({
    modelRef: nullableBoundedString(220),
    providerId: nullableBoundedString(180),
    providerProfileRef: nullableBoundedString(420),
    maxInputBytes: z.number().int().min(1).max(10 * 1024 * 1024).default(32_000),
    maxOutputTokens: z.number().int().min(1).max(128_000).default(4_000),
    timeoutMs: z.number().int().min(1).max(3_600_000).default(90_000),
    reasoningMode: z.enum(["none", "exclude", "omit"]).default("none"),
    responseFormatMode: z.enum(["native", "prompt_only", "auto"]).default("prompt_only"),
  })
  .strict();
export type ContextScoutSpecialistProviderProfile = z.infer<
  typeof ContextScoutSpecialistProviderProfileSchema
>;

export const ContextScoutSpecialistSubturnRequestSchema = z
  .object({
    artifactKind: z.literal("resource_scout_specialist_subturn_request"),
    schemaVersion: z.literal(CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION),
    requestId: boundedString(180),
    requestRef: boundedString(620),
    requestHash: boundedString(140),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    consumerBranchId: nullableBoundedString(180),
    workIntentRef: nullableBoundedString(620),
    nodeExecutionContractRef: nullableBoundedString(620),
    nodeExecutionPacketRef: nullableBoundedString(620),
    nodeResourceDemandSessionRef: boundedString(620),
    resourceObjectiveFocusRef: nullableBoundedString(620),
    legalRefUniverseRef: nullableBoundedString(620),
    selectedFocusRefHandles: stringList(40, 420),
    selectedFocusRefs: stringList(120, 620),
    nodeResourceDemandRequestRefs: stringList(80, 620),
    nodeResourceDemandFulfillmentRefs: stringList(80, 620),
    nodeResourceDemandBlockerRefs: stringList(80, 620),
    nodeResourceLedgerRef: boundedString(620),
    capabilityId: boundedString(180),
    evidenceMode: z.array(EvidenceModeSchema).min(1).max(12),
    targetCommitmentIds: stringList(80, 180),
    authorityScope: stringList(160, 620),
    specialistTrigger: ContextScoutSpecialistTriggerSchema,
    directFulfillmentAttempted: z.literal(true),
    directFulfillmentResultRefs: stringList(120, 620),
    workflowSpecialistGrantRef: nullableBoundedString(620),
    requestedContextKinds: stringList(40, 120),
    candidateRefs: stringList(200, 620),
    knownContextRefs: stringList(200, 620),
    scoutReason: boundedString(1_200),
    expectedUse: boundedString(1_200),
    providerProfile: ContextScoutSpecialistProviderProfileSchema,
    status: z.literal("dispatch_ready"),
    nextLegalTransitions: z
      .array(
        z.enum([
          "resource.scout.submit_exact_handles",
          "resource.scout.submit_specialist_handoff",
          "resource.scout.mark_narrowing_blocked",
          "resource.scout.mark_specialist_blocked",
        ]),
      )
      .min(1)
      .max(4),
    reasonCodes: stringList(160, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: ContextScoutSpecialistStoragePolicySchema,
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
export type ContextScoutSpecialistSubturnRequest = z.infer<
  typeof ContextScoutSpecialistSubturnRequestSchema
>;

export const ContextScoutSpecialistHandoffSchema = z
  .object({
    artifactKind: z.literal("resource_scout_specialist_handoff"),
    schemaVersion: z.literal(CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION),
    handoffId: boundedString(180),
    handoffRef: boundedString(720),
    handoffHash: boundedString(140),
    requestRef: boundedString(620),
    nodeResourceDemandSessionRef: boundedString(620),
    nodeResourceLedgerRef: boundedString(620),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    status: z.enum(["fulfilled", "blocked"]),
    relevantFileRefs: stringList(120, 620),
    existingPatternRefs: stringList(120, 620),
    riskRefs: stringList(120, 620),
    editPointRefs: stringList(120, 620),
    validationSuggestionRefs: stringList(120, 620),
    limitationRefs: stringList(120, 620),
    providerDiagnosticRefs: stringList(80, 620),
    ledgerEntryRefs: stringList(500, 620),
    ledgerEntryPayloadRefs: stringList(500, 620),
    ledgerManifest: z.custom<NodeResourceLedgerManifest>(),
    entryManifests: z.array(z.custom<NodeResourceLedgerEntryManifest>()).max(500),
    handoffSummary: boundedString(1_200),
    limitationSummary: z.string().trim().max(1_200).default(""),
    nextLegalTransitions: z.array(z.string().trim().min(1).max(180)).max(8),
    reasonCodes: stringList(160, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: ContextScoutSpecialistStoragePolicySchema,
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
export type ContextScoutSpecialistHandoff = z.infer<
  typeof ContextScoutSpecialistHandoffSchema
>;

export type ContextScoutSpecialistSubturnRequestManifest = {
  artifactKind: "resource_scout_specialist_subturn_request_manifest";
  schemaVersion: typeof CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION;
  requestRef: string;
  requestHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  nodeResourceDemandSessionRef: string;
  resourceObjectiveFocusRef: string | null;
  legalRefUniverseRef: string | null;
  selectedFocusRefHandleCount: number;
  selectedFocusRefCount: number;
  nodeResourceLedgerRef: string;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  specialistTrigger: ContextScoutSpecialistTrigger;
  directFulfillmentAttempted: true;
  directFulfillmentResultCount: number;
  targetCommitmentCount: number;
  authorityScopeCount: number;
  candidateRefCount: number;
  candidateRefHash: string | null;
  knownContextRefCount: number;
  providerProfileRef: string | null;
  modelRef: string | null;
  providerId: string | null;
  maxInputBytes: number;
  timeoutMs: number;
  nextLegalTransitions: string[];
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScoutSpecialistHandoffManifest = {
  artifactKind: "resource_scout_specialist_handoff_manifest";
  schemaVersion: typeof CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION;
  handoffRef: string;
  handoffHash: string;
  requestRef: string;
  nodeResourceDemandSessionRef: string;
  nodeResourceLedgerRef: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  status: "fulfilled" | "blocked";
  relevantFileCount: number;
  existingPatternCount: number;
  riskCount: number;
  editPointCount: number;
  validationSuggestionCount: number;
  limitationCount: number;
  providerDiagnosticCount: number;
  ledgerEntryCount: number;
  ledgerEntryPayloadRefCount: number;
  ledgerEntryRefPreview: string[];
  nextLegalTransitions: string[];
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextScoutSpecialistCompileResult = {
  status: "succeeded" | "needs_review";
  request: ContextScoutSpecialistSubturnRequest | null;
  handoff: ContextScoutSpecialistHandoff | null;
  ledger: NodeResourceLedger | null;
  entries: NodeResourceLedgerEntry[];
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

type SpecialistFinding = {
  ref?: string | null;
  fileRef?: string | null;
  symbolRef?: string | null;
  testRef?: string | null;
  memoryPackRef?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  summary?: string | null;
  details?: string | null;
  expectedUse?: string | null;
  severity?: "low" | "medium" | "high" | "blocking" | null;
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
    payloadBackedBodies: true as const,
    manifestMetadataOnly: true as const,
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

function normalizedAuthorityRef(value: string): string {
  const withoutProtocol = value.startsWith("file-window://")
    ? value.slice("file-window://".length)
    : value;
  const hashIndex = withoutProtocol.indexOf("#");
  return hashIndex === -1 ? withoutProtocol : withoutProtocol.slice(0, hashIndex);
}

function authorityAllowsRef(input: { authorityScope: string[]; ref: string }): boolean {
  const requested = bounded(input.ref, 620);
  const normalized = normalizedAuthorityRef(requested);
  return input.authorityScope.some((authority) => {
    const current = bounded(authority, 620);
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

function isStructuralAuthorityRef(ref: string): boolean {
  const normalized = normalizedAuthorityRef(ref);
  if (
    normalized.startsWith("runtime-job://") ||
    normalized.startsWith("artifact://") ||
    normalized.startsWith("memory://") ||
    normalized.startsWith("memory-pack://") ||
    normalized.startsWith("source-prompt://") ||
    normalized.startsWith("validation://") ||
    normalized.startsWith("validation-command://")
  ) {
    return false;
  }
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.includes("/") ||
    /\.[A-Za-z0-9]{1,12}$/u.test(normalized)
  );
}

function withHash<T extends Record<string, unknown>, K extends string>(
  body: T,
  hashKey: K,
): T & Record<K, string> {
  return { ...body, [hashKey]: hashValue({ ...body, [hashKey]: "pending" }) } as T &
    Record<K, string>;
}

function sourceDemandRefs(input: {
  session: NodeResourceDemandSession;
  nodeResourceDemandRequest?: NodeResourceDemandRequest | null;
  nodeResourceDemandFulfillment?: NodeResourceDemandFulfillment | null;
  nodeResourceDemandBlocker?: NodeResourceDemandBlocker | null;
}): {
  requestRefs: string[];
  fulfillmentRefs: string[];
  blockerRefs: string[];
  directFulfillmentResultRefs: string[];
} {
  const requestRefs = [
    ...input.session.requestRefs,
    ...(input.nodeResourceDemandRequest ? [input.nodeResourceDemandRequest.requestRef] : []),
  ];
  const fulfillmentRefs = [
    ...input.session.fulfillmentRefs,
    ...(input.nodeResourceDemandFulfillment ? [input.nodeResourceDemandFulfillment.fulfillmentRef] : []),
  ];
  const blockerRefs = [
    ...input.session.blockerRefs,
    ...(input.nodeResourceDemandBlocker ? [input.nodeResourceDemandBlocker.blockerRef] : []),
  ];
  return {
    requestRefs: strings(requestRefs, 80, 620),
    fulfillmentRefs: strings(fulfillmentRefs, 80, 620),
    blockerRefs: strings(blockerRefs, 80, 620),
    directFulfillmentResultRefs: strings(
      [
        ...fulfillmentRefs,
        ...(input.nodeResourceDemandFulfillment?.providedRefs ?? []),
        ...(input.nodeResourceDemandFulfillment?.boundedSnapshotRefs ?? []),
      ],
      120,
      620,
    ),
  };
}

function requestManifest(
  request: ContextScoutSpecialistSubturnRequest,
): ContextScoutSpecialistSubturnRequestManifest {
  return {
    artifactKind: "resource_scout_specialist_subturn_request_manifest",
    schemaVersion: CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION,
    requestRef: request.requestRef,
    requestHash: request.requestHash,
    runtimeJobId: request.runtimeJobId,
    workflowId: request.workflowId,
    graphId: request.graphId,
    consumerNodeId: request.consumerNodeId,
    nodeResourceDemandSessionRef: request.nodeResourceDemandSessionRef,
    resourceObjectiveFocusRef: request.resourceObjectiveFocusRef,
    legalRefUniverseRef: request.legalRefUniverseRef,
    selectedFocusRefHandleCount: request.selectedFocusRefHandles.length,
    selectedFocusRefCount: request.selectedFocusRefs.length,
    nodeResourceLedgerRef: request.nodeResourceLedgerRef,
    capabilityId: request.capabilityId,
    evidenceMode: request.evidenceMode,
    specialistTrigger: request.specialistTrigger,
    directFulfillmentAttempted: true,
    directFulfillmentResultCount: request.directFulfillmentResultRefs.length,
    targetCommitmentCount: request.targetCommitmentIds.length,
    authorityScopeCount: request.authorityScope.length,
    candidateRefCount: request.candidateRefs.length,
    candidateRefHash:
      request.candidateRefs.length > 0 ? `sha256:${hashValue(request.candidateRefs)}` : null,
    knownContextRefCount: request.knownContextRefs.length,
    providerProfileRef: request.providerProfile.providerProfileRef,
    modelRef: request.providerProfile.modelRef,
    providerId: request.providerProfile.providerId,
    maxInputBytes: request.providerProfile.maxInputBytes,
    timeoutMs: request.providerProfile.timeoutMs,
    nextLegalTransitions: request.nextLegalTransitions,
    reasonCodes: request.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(request), "utf8"),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function handoffManifest(
  handoff: ContextScoutSpecialistHandoff,
): ContextScoutSpecialistHandoffManifest {
  return {
    artifactKind: "resource_scout_specialist_handoff_manifest",
    schemaVersion: CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION,
    handoffRef: handoff.handoffRef,
    handoffHash: handoff.handoffHash,
    requestRef: handoff.requestRef,
    nodeResourceDemandSessionRef: handoff.nodeResourceDemandSessionRef,
    nodeResourceLedgerRef: handoff.nodeResourceLedgerRef,
    runtimeJobId: handoff.runtimeJobId,
    workflowId: handoff.workflowId,
    graphId: handoff.graphId,
    consumerNodeId: handoff.consumerNodeId,
    status: handoff.status,
    relevantFileCount: handoff.relevantFileRefs.length,
    existingPatternCount: handoff.existingPatternRefs.length,
    riskCount: handoff.riskRefs.length,
    editPointCount: handoff.editPointRefs.length,
    validationSuggestionCount: handoff.validationSuggestionRefs.length,
    limitationCount: handoff.limitationRefs.length,
    providerDiagnosticCount: handoff.providerDiagnosticRefs.length,
    ledgerEntryCount: handoff.ledgerEntryRefs.length,
    ledgerEntryPayloadRefCount: handoff.ledgerEntryPayloadRefs.length,
    ledgerEntryRefPreview: handoff.ledgerEntryRefs.slice(0, 8),
    nextLegalTransitions: handoff.nextLegalTransitions,
    reasonCodes: handoff.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(handoff), "utf8"),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function boundedMetadata(input: {
  request?: ContextScoutSpecialistSubturnRequest | null;
  handoff?: ContextScoutSpecialistHandoff | null;
  ledger?: NodeResourceLedger | null;
  entries?: NodeResourceLedgerEntry[];
  status?: ContextScoutSpecialistStatus | null;
  reasonCodes?: string[];
}): JsonValue {
  const requestMeta = input.request ? requestManifest(input.request) : null;
  const handoffMeta = input.handoff ? handoffManifest(input.handoff) : null;
  const ledgerManifest = input.ledger ? buildNodeResourceLedgerManifest(input.ledger) : null;
  const entryManifests = (input.entries ?? []).map(buildNodeResourceLedgerEntryManifest);
  const metadata = {
    contextScoutSpecialistRequestManifest: requestMeta,
    contextScoutSpecialistHandoffManifest: handoffMeta,
    nodeResourceLedgerManifest: ledgerManifest,
    nodeResourceLedgerEntryManifestCount: entryManifests.length,
    contextScoutSpecialistRequestRef: input.request?.requestRef ?? input.handoff?.requestRef ?? null,
    contextScoutSpecialistHandoffRef: input.handoff?.handoffRef ?? null,
    nodeResourceDemandSessionRef:
      input.request?.nodeResourceDemandSessionRef ?? input.handoff?.nodeResourceDemandSessionRef ?? null,
    nodeResourceLedgerRef:
      input.ledger?.ledgerRef ??
      input.request?.nodeResourceLedgerRef ??
      input.handoff?.nodeResourceLedgerRef ??
      null,
    contextScoutSpecialistStatus:
      input.status ?? input.handoff?.status ?? input.request?.status ?? null,
    reasonCodes: strings(input.reasonCodes ?? input.handoff?.reasonCodes ?? input.request?.reasonCodes, 80, 220),
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
  assertContextScoutSpecialistManifestMetadata(metadata);
  return metadata;
}

const BODY_KEY_PATTERN =
  /(^|\.)(body|payloadBody|packetBody|prompt|rawPrompt|responseText|rawResponse|rawProviderLog|rawToolLog|rawCommandLog|fileBody|fileContent|fullContent|snapshotBody|contextBody|handoffBody|ledgerEntryBody|providerResponseBody)$/iu;

export function assertContextScoutSpecialistManifestMetadata(
  metadata: JsonValue,
  input?: { maxBytes?: number },
): void {
  const serialized = JSON.stringify(metadata);
  const maxBytes = input?.maxBytes ?? 24_000;
  const byteCount = Buffer.byteLength(serialized, "utf8");
  if (byteCount > maxBytes) {
    throw new Error(
      `resource scout specialist metadata manifest overflow: ${byteCount} bytes exceeds ${maxBytes}`,
    );
  }
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (BODY_KEY_PATTERN.test(childPath)) {
        throw new Error(`resource scout specialist metadata manifest body field: ${childPath}`);
      }
      visit(child, childPath);
    }
  };
  visit(metadata, "");
}

function needsReview(input: {
  outputRef: string;
  outputHash?: string | null;
  outputSummary: string;
  reasonCodes: string[];
  request?: ContextScoutSpecialistSubturnRequest | null;
  ledger?: NodeResourceLedger | null;
}): ContextScoutSpecialistCompileResult {
  return {
    status: "needs_review",
    request: input.request ?? null,
    handoff: null,
    ledger: input.ledger ?? null,
    entries: [],
    outputRef: input.outputRef,
    outputHash: input.outputHash ?? hashValue(input.reasonCodes),
    outputSummary: bounded(input.outputSummary, 1_200),
    reasonCodes: strings(input.reasonCodes, 160, 220),
    metadata: boundedMetadata({
      request: input.request,
      ledger: input.ledger,
      status: "blocked",
      reasonCodes: input.reasonCodes,
    }),
  };
}

export function dispatchContextScoutSpecialistSubturn(input: {
  nodeResourceDemandSession?: NodeResourceDemandSession | null;
  nodeResourceDemandRequest?: NodeResourceDemandRequest | null;
  nodeResourceDemandFulfillment?: NodeResourceDemandFulfillment | null;
  nodeResourceDemandBlocker?: NodeResourceDemandBlocker | null;
  nodeResourceLedger?: NodeResourceLedger | null;
  specialistTrigger?: ContextScoutSpecialistTrigger | string | null;
  directFulfillmentAttempted?: boolean;
  workflowSpecialistGrantRef?: string | null;
  requestedContextKinds?: string[];
  candidateRefs?: string[];
  knownContextRefs?: string[];
  scoutReason?: string | null;
  expectedUse?: string | null;
  providerProfile?: Partial<ContextScoutSpecialistProviderProfile> | null;
}): ContextScoutSpecialistCompileResult {
  const sessionParsed = NodeResourceDemandSessionSchema.safeParse(input.nodeResourceDemandSession);
  if (!sessionParsed.success) {
    return needsReview({
      outputRef: `context-scout-specialist://blocked/${hashValue("missing-session").slice(0, 16)}`,
      outputSummary:
        "resource scout specialist dispatch requires a valid consumer-bound NodeResourceDemandSession.",
      reasonCodes: ["resource_scout_specialist_node_resource_demand_session_missing"],
    });
  }
  const session = sessionParsed.data;
  const request = input.nodeResourceDemandRequest
    ? NodeResourceDemandRequestSchema.parse(input.nodeResourceDemandRequest)
    : null;
  const fulfillment = input.nodeResourceDemandFulfillment
    ? NodeResourceDemandFulfillmentSchema.parse(input.nodeResourceDemandFulfillment)
    : null;
  const blocker = input.nodeResourceDemandBlocker
    ? NodeResourceDemandBlockerSchema.parse(input.nodeResourceDemandBlocker)
    : null;
  const trigger = ContextScoutSpecialistTriggerSchema.safeParse(input.specialistTrigger).success
    ? (input.specialistTrigger as ContextScoutSpecialistTrigger)
    : "direct_fulfillment_insufficient";
  const directFulfillmentAttempted =
    input.directFulfillmentAttempted === true ||
    session.fulfillmentRefs.length > 0 ||
    Boolean(fulfillment) ||
    session.blockerRefs.length > 0 ||
    Boolean(blocker);
  const hasWorkflowGrant =
    trigger === "workflow_defined_specialist" && bounded(input.workflowSpecialistGrantRef, 620);
  if (!directFulfillmentAttempted && !hasWorkflowGrant) {
    return needsReview({
      outputRef: `${session.sessionRef}/specialist-blocked/direct-first`,
      outputSummary:
        "Specialist scout dispatch is blocked until direct context fulfillment is attempted or an explicit workflow specialist grant is present.",
      reasonCodes: [
        "resource_scout_specialist_requires_direct_fulfillment_first",
        "resource_scout_specialist_no_default_graph_glue",
      ],
    });
  }
  const ledger =
    input.nodeResourceLedger && NodeResourceLedgerSchema.safeParse(input.nodeResourceLedger).success
      ? NodeResourceLedgerSchema.parse(input.nodeResourceLedger)
      : openNodeResourceLedger({
          runtimeJobId: session.runtimeJobId,
          workflowId: session.workflowId,
          graphId: session.graphId,
          consumerNodeId: session.consumerNodeId,
          consumerBranchId: session.consumerBranchId,
          workIntentRef: session.workIntentRef,
          nodeExecutionContractRef: session.nodeExecutionContractRef,
          nodeExecutionPacketRef: session.nodeExecutionPacketRef,
          nodeResourceDemandSessionRef: session.sessionRef,
          capabilityId: session.capabilityId,
          evidenceMode: session.evidenceMode,
          targetCommitmentIds: session.targetCommitmentIds,
          authorityScope: session.authorityScope,
        }).ledger;
  if (!ledger) {
    return needsReview({
      outputRef: `${session.sessionRef}/specialist-blocked/ledger`,
      outputSummary: "Specialist scout dispatch could not open a consumer node resource ledger.",
      reasonCodes: ["resource_scout_specialist_node_resource_ledger_missing"],
    });
  }
  if (ledger.consumerNodeId !== session.consumerNodeId) {
    return needsReview({
      outputRef: `${session.sessionRef}/specialist-blocked/ledger-consumer`,
      outputSummary: "Specialist scout ledger consumer does not match the demand session consumer.",
      reasonCodes: ["resource_scout_specialist_ledger_consumer_mismatch"],
      ledger,
    });
  }
  const candidateRefs = strings(input.candidateRefs, 200, 620);
  const knownContextRefs = strings(input.knownContextRefs, 200, 620);
  const selectedFocusRefs = strings(session.selectedFocusRefs, 120, 620);
  const selectedFocusRefSet = new Set(selectedFocusRefs);
  const deniedRefs = [...candidateRefs, ...knownContextRefs].filter(
    (ref) =>
      !selectedFocusRefSet.has(ref) &&
      isStructuralAuthorityRef(ref) &&
      !authorityAllowsRef({ authorityScope: session.authorityScope, ref }),
  );
  if (deniedRefs.length > 0) {
    return needsReview({
      outputRef: `${session.sessionRef}/specialist-blocked/authority`,
      outputSummary: "Specialist scout dispatch included refs outside the consumer authority.",
      reasonCodes: ["resource_scout_specialist_authority_scope_violation"],
      ledger,
    });
  }
  const demandRefs = sourceDemandRefs({
    session,
    nodeResourceDemandRequest: request,
    nodeResourceDemandFulfillment: fulfillment,
    nodeResourceDemandBlocker: blocker,
  });
  const providerProfile = ContextScoutSpecialistProviderProfileSchema.parse({
    modelRef: input.providerProfile?.modelRef ?? null,
    providerId: input.providerProfile?.providerId ?? null,
    providerProfileRef: input.providerProfile?.providerProfileRef ?? null,
    maxInputBytes: input.providerProfile?.maxInputBytes ?? 32_000,
    maxOutputTokens: input.providerProfile?.maxOutputTokens ?? 4_000,
    timeoutMs: input.providerProfile?.timeoutMs ?? 90_000,
    reasoningMode: input.providerProfile?.reasoningMode ?? "none",
    responseFormatMode: input.providerProfile?.responseFormatMode ?? "prompt_only",
  });
  const missingFields = [
    bounded(input.scoutReason, 1_200) ? null : "scoutReason",
    bounded(input.expectedUse, 1_200) ? null : "expectedUse",
    candidateRefs.length > 0 || knownContextRefs.length > 0 ? null : "candidateRefs",
  ].filter((field): field is string => Boolean(field));
  if (missingFields.length > 0) {
    return needsReview({
      outputRef: `${session.sessionRef}/specialist-blocked/missing-fields`,
      outputSummary: `Specialist scout dispatch is missing required structural fields: ${missingFields.join(", ")}.`,
      reasonCodes: missingFields.map((field) => `resource_scout_specialist_${field}_missing`),
      ledger,
    });
  }
  const requestId = `context-scout-specialist:${hashValue({
    sessionRef: session.sessionRef,
    ledgerRef: ledger.ledgerRef,
    trigger,
    candidateRefs,
    knownContextRefs,
    scoutReason: input.scoutReason,
  }).slice(0, 18)}`;
  const body = {
    artifactKind: "resource_scout_specialist_subturn_request" as const,
    schemaVersion: CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION,
    requestId,
    requestRef: `${session.sessionRef}/specialist-scout/${requestId}`,
    requestHash: "pending",
    runtimeJobId: session.runtimeJobId,
    workflowId: session.workflowId,
    graphId: session.graphId,
    consumerNodeId: session.consumerNodeId,
    consumerBranchId: session.consumerBranchId,
    workIntentRef: session.workIntentRef,
    nodeExecutionContractRef: session.nodeExecutionContractRef,
    nodeExecutionPacketRef: session.nodeExecutionPacketRef,
    nodeResourceDemandSessionRef: session.sessionRef,
    resourceObjectiveFocusRef: session.resourceObjectiveFocusRef,
    legalRefUniverseRef: session.legalRefUniverseRef,
    selectedFocusRefHandles: session.selectedFocusRefHandles,
    selectedFocusRefs,
    nodeResourceDemandRequestRefs: demandRefs.requestRefs,
    nodeResourceDemandFulfillmentRefs: demandRefs.fulfillmentRefs,
    nodeResourceDemandBlockerRefs: demandRefs.blockerRefs,
    nodeResourceLedgerRef: ledger.ledgerRef,
    capabilityId: session.capabilityId,
    evidenceMode: session.evidenceMode,
    targetCommitmentIds: session.targetCommitmentIds,
    authorityScope: session.authorityScope,
    specialistTrigger: trigger,
    directFulfillmentAttempted: true as const,
    directFulfillmentResultRefs:
      demandRefs.directFulfillmentResultRefs.length > 0
        ? demandRefs.directFulfillmentResultRefs
        : ["direct-fulfillment-attempt://none"],
    workflowSpecialistGrantRef: bounded(input.workflowSpecialistGrantRef, 620) || null,
    requestedContextKinds: strings(input.requestedContextKinds, 40, 120),
    candidateRefs,
    knownContextRefs,
    scoutReason: bounded(input.scoutReason, 1_200),
    expectedUse: bounded(input.expectedUse, 1_200),
    providerProfile,
    status: "dispatch_ready" as const,
    nextLegalTransitions: [
      "resource.scout.submit_exact_handles" as const,
      "resource.scout.submit_specialist_handoff" as const,
      "resource.scout.mark_narrowing_blocked" as const,
      "resource.scout.mark_specialist_blocked" as const,
    ],
    reasonCodes: [
      "resource_scout_specialist_subturn_dispatch_ready",
      "resource_scout_specialist_consumer_bound",
      "resource_scout_specialist_direct_fulfillment_attempted",
      "resource_scout_specialist_no_default_graph_glue",
      session.resourceObjectiveFocusRef
        ? "resource_scout_specialist_focus_backed_session"
        : "resource_scout_specialist_worker_context_request_session",
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
  const specialistRequest = ContextScoutSpecialistSubturnRequestSchema.parse(
    withHash(body, "requestHash"),
  );
  return {
    status: "succeeded",
    request: specialistRequest,
    handoff: null,
    ledger,
    entries: [],
    outputRef: specialistRequest.requestRef,
    outputHash: specialistRequest.requestHash,
    outputSummary: `Specialist resource scout dispatch is ready for ${specialistRequest.consumerNodeId}.`,
    reasonCodes: specialistRequest.reasonCodes,
    metadata: boundedMetadata({ request: specialistRequest, ledger }),
  };
}

function findingArray(value: unknown): SpecialistFinding[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => asRecord(item))
    .map((item): SpecialistFinding => ({
      ref: typeof item.ref === "string" ? item.ref : null,
      fileRef: typeof item.fileRef === "string" ? item.fileRef : null,
      symbolRef: typeof item.symbolRef === "string" ? item.symbolRef : null,
      testRef: typeof item.testRef === "string" ? item.testRef : null,
      memoryPackRef: typeof item.memoryPackRef === "string" ? item.memoryPackRef : null,
      lineStart: typeof item.lineStart === "number" ? item.lineStart : null,
      lineEnd: typeof item.lineEnd === "number" ? item.lineEnd : null,
      summary: typeof item.summary === "string" ? item.summary : null,
      details: typeof item.details === "string" ? item.details : null,
      expectedUse: typeof item.expectedUse === "string" ? item.expectedUse : null,
      severity:
        item.severity === "low" ||
        item.severity === "medium" ||
        item.severity === "high" ||
        item.severity === "blocking"
          ? item.severity
          : null,
    }))
    .filter((item) => bounded(item.summary, 1_200))
    .slice(0, 80);
}

function appendFinding(input: {
  ledger: NodeResourceLedger;
  entryKind: NodeResourceLedgerEntryKind;
  finding: SpecialistFinding;
  request: ContextScoutSpecialistSubturnRequest;
  defaultSummary: string;
  providerDiagnostic?: Partial<NodeContextProviderDiagnosticShape> | null;
}): NodeResourceLedgerAppendResult {
  const contentRefs = strings(
    [
      input.finding.ref,
      input.finding.fileRef,
      input.finding.symbolRef,
      input.finding.testRef,
      input.finding.memoryPackRef,
    ],
    20,
    620,
  );
  return appendNodeResourceLedgerEntry({
    ledger: input.ledger,
    entryKind: input.entryKind,
    sourceRequestRef: input.request.requestRef,
    contentRefs,
    fileRef: input.finding.fileRef,
    symbolRef: input.finding.symbolRef,
    testRef: input.finding.testRef,
    memoryPackRef: input.finding.memoryPackRef,
    lineStart: input.finding.lineStart,
    lineEnd: input.finding.lineEnd,
    summary: input.finding.summary ?? input.defaultSummary,
    details: input.finding.details,
    expectedUse: input.finding.expectedUse ?? input.request.expectedUse,
    limitationSeverity: input.finding.severity ?? null,
    providerDiagnostic: input.providerDiagnostic ?? null,
    reasonCodes: [
      "node_resource_ledger_appended_from_specialist_scout",
      `node_resource_ledger_${input.entryKind}_from_specialist_scout`,
    ],
  });
}

export function submitContextScoutSpecialistHandoff(input: {
  request: ContextScoutSpecialistSubturnRequest;
  nodeResourceLedger: NodeResourceLedger;
  handoffSummary?: string | null;
  relevantFiles?: SpecialistFinding[];
  existingPatterns?: SpecialistFinding[];
  risks?: SpecialistFinding[];
  editPoints?: SpecialistFinding[];
  validationSuggestions?: SpecialistFinding[];
  limitations?: SpecialistFinding[];
  providerDiagnostics?: Array<Partial<NodeContextProviderDiagnosticShape>>;
  markBlocked?: boolean;
}): ContextScoutSpecialistCompileResult {
  const request = ContextScoutSpecialistSubturnRequestSchema.parse(input.request);
  let ledger = NodeResourceLedgerSchema.parse(input.nodeResourceLedger);
  if (ledger.ledgerRef !== request.nodeResourceLedgerRef) {
    return needsReview({
      outputRef: `${request.requestRef}/handoff-blocked/ledger-ref`,
      outputSummary: "Specialist scout handoff ledger ref does not match its request.",
      reasonCodes: ["resource_scout_specialist_handoff_ledger_ref_mismatch"],
      request,
      ledger,
    });
  }
  const batches: Array<{
    entryKind: NodeResourceLedgerEntryKind;
    findings: SpecialistFinding[];
    defaultSummary: string;
  }> = [
    {
      entryKind: "relevant_file_reported",
      findings: input.relevantFiles ?? [],
      defaultSummary: "Specialist scout reported a relevant file.",
    },
    {
      entryKind: "existing_pattern_reported",
      findings: input.existingPatterns ?? [],
      defaultSummary: "Specialist scout reported an existing implementation pattern.",
    },
    {
      entryKind: "risk_reported",
      findings: input.risks ?? [],
      defaultSummary: "Specialist scout reported a context or implementation risk.",
    },
    {
      entryKind: "edit_point_recommended",
      findings: input.editPoints ?? [],
      defaultSummary: "Specialist scout recommended an edit or inspection point.",
    },
    {
      entryKind: "validation_recommended",
      findings: input.validationSuggestions ?? [],
      defaultSummary: "Specialist scout recommended validation.",
    },
    {
      entryKind: "limitation_reported",
      findings: input.limitations ?? [],
      defaultSummary: "Specialist scout reported a limitation.",
    },
  ];
  const entries: NodeResourceLedgerEntry[] = [];
  const providerDiagnosticEntries: NodeResourceLedgerEntry[] = [];
  for (const batch of batches) {
    for (const finding of batch.findings.slice(0, 80)) {
      const appended = appendFinding({
        ledger,
        entryKind: batch.entryKind,
        finding,
        request,
        defaultSummary: batch.defaultSummary,
      });
      if (appended.status !== "succeeded" || !appended.ledger || !appended.entry) {
        return needsReview({
          outputRef: appended.outputRef,
          outputHash: appended.outputHash,
          outputSummary: appended.outputSummary,
          reasonCodes: appended.reasonCodes,
          request,
          ledger: appended.ledger ?? ledger,
        });
      }
      ledger = appended.ledger;
      entries.push(appended.entry);
    }
  }
  for (const [index, providerDiagnostic] of (input.providerDiagnostics ?? []).slice(0, 24).entries()) {
    const appended = appendFinding({
      ledger,
      entryKind: "provider_diagnostic_recorded",
      finding: {
        ref: `provider-diagnostic://${request.consumerNodeId}/specialist-scout/${index + 1}`,
        summary: `Specialist scout provider diagnostic ${index + 1}.`,
      },
      request,
      defaultSummary: `Specialist scout provider diagnostic ${index + 1}.`,
      providerDiagnostic,
    });
    if (appended.status !== "succeeded" || !appended.ledger || !appended.entry) {
      return needsReview({
        outputRef: appended.outputRef,
        outputHash: appended.outputHash,
        outputSummary: appended.outputSummary,
        reasonCodes: appended.reasonCodes,
        request,
        ledger: appended.ledger ?? ledger,
      });
    }
    ledger = appended.ledger;
    entries.push(appended.entry);
    providerDiagnosticEntries.push(appended.entry);
  }
  const substantiveEntryCount = entries.filter(
    (entry) => entry.entryKind !== "provider_diagnostic_recorded",
  ).length;
  if (substantiveEntryCount === 0) {
    return needsReview({
      outputRef: `${request.requestRef}/handoff-blocked/no-substance`,
      outputSummary:
        "Specialist scout handoff did not include any model-authored context substance.",
      reasonCodes: ["resource_scout_specialist_handoff_substance_missing"],
      request,
      ledger,
    });
  }
  const status = input.markBlocked === true ? "blocked" : "fulfilled";
  const handoffId = `context-scout-specialist-handoff:${hashValue({
    requestRef: request.requestRef,
    ledgerRef: ledger.ledgerRef,
    entryRefs: entries.map((entry) => entry.entryRef),
    status,
  }).slice(0, 18)}`;
  const entryRefsByKind = (kind: NodeResourceLedgerEntryKind): string[] =>
    entries.filter((entry) => entry.entryKind === kind).map((entry) => entry.entryRef);
  const body = {
    artifactKind: "resource_scout_specialist_handoff" as const,
    schemaVersion: CONTEXT_SCOUT_SPECIALIST_SCHEMA_VERSION,
    handoffId,
    handoffRef: `${request.requestRef}/handoff/${handoffId}`,
    handoffHash: "pending",
    requestRef: request.requestRef,
    nodeResourceDemandSessionRef: request.nodeResourceDemandSessionRef,
    nodeResourceLedgerRef: ledger.ledgerRef,
    runtimeJobId: request.runtimeJobId,
    workflowId: request.workflowId,
    graphId: request.graphId,
    consumerNodeId: request.consumerNodeId,
    status,
    relevantFileRefs: entryRefsByKind("relevant_file_reported"),
    existingPatternRefs: entryRefsByKind("existing_pattern_reported"),
    riskRefs: entryRefsByKind("risk_reported"),
    editPointRefs: entryRefsByKind("edit_point_recommended"),
    validationSuggestionRefs: entryRefsByKind("validation_recommended"),
    limitationRefs: entryRefsByKind("limitation_reported"),
    providerDiagnosticRefs: providerDiagnosticEntries.map((entry) => entry.entryRef),
    ledgerEntryRefs: entries.map((entry) => entry.entryRef),
    ledgerEntryPayloadRefs: entries.map((entry) => entry.entryPayloadRef.payloadRef),
    ledgerManifest: buildNodeResourceLedgerManifest(ledger),
    entryManifests: entries.map(buildNodeResourceLedgerEntryManifest),
    handoffSummary:
      bounded(input.handoffSummary, 1_200) ||
      `Specialist scout produced ${substantiveEntryCount} context ledger entr${
        substantiveEntryCount === 1 ? "y" : "ies"
      } for ${request.consumerNodeId}.`,
    limitationSummary: bounded(
      (input.limitations ?? []).map((limitation) => limitation.summary).join(" "),
      1_200,
    ),
    nextLegalTransitions:
      status === "fulfilled"
        ? [
            "resource.scout.project_specialist_result" as const,
            "resource.demand.close" as const,
            "scheduler.accept_resource_for_consumer" as const,
          ]
        : [
            "resource.scout.project_specialist_result" as const,
            "resource.demand.close" as const,
          ],
    reasonCodes: [
      status === "fulfilled"
        ? "resource_scout_specialist_handoff_fulfilled"
        : "resource_scout_specialist_handoff_blocked",
      "resource_scout_specialist_handoff_appended_to_node_resource_ledger",
      `resource_scout_specialist_ledger_entry_count:${entries.length}`,
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
  const handoff = ContextScoutSpecialistHandoffSchema.parse(withHash(body, "handoffHash"));
  return {
    status: status === "fulfilled" ? "succeeded" : "needs_review",
    request,
    handoff,
    ledger,
    entries,
    outputRef: handoff.handoffRef,
    outputHash: handoff.handoffHash,
    outputSummary: handoff.handoffSummary,
    reasonCodes: handoff.reasonCodes,
    metadata: boundedMetadata({ request, handoff, ledger, entries, status, reasonCodes: handoff.reasonCodes }),
  };
}

function requestFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): ContextScoutSpecialistSubturnRequest | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const request =
      record.contextScoutSpecialistRequest ??
      record.contextScoutSpecialistSubturnRequest ??
      asRecord(record.contextScoutSpecialist).request;
    const parsed = ContextScoutSpecialistSubturnRequestSchema.safeParse(request);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
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

function ledgerFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceLedger | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const ledger = record.nodeResourceLedger ?? asRecord(record.resourceLedger).ledger;
    const parsed = NodeResourceLedgerSchema.safeParse(ledger);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function demandRequestFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceDemandRequest | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const request = record.nodeResourceDemandRequest ?? asRecord(record.nodeResourceDemand).request;
    const parsed = NodeResourceDemandRequestSchema.safeParse(request);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function demandFulfillmentFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceDemandFulfillment | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const fulfillment =
      record.nodeResourceDemandFulfillment ?? asRecord(record.nodeResourceDemand).fulfillment;
    const parsed = NodeResourceDemandFulfillmentSchema.safeParse(fulfillment);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function demandBlockerFromSources(input: {
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceDemandBlocker | null {
  for (const source of [input.metadata, input.volatileInput]) {
    const record = asRecord(source);
    const blocker = record.nodeResourceDemandBlocker ?? asRecord(record.nodeResourceDemand).blocker;
    const parsed = NodeResourceDemandBlockerSchema.safeParse(blocker);
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
    ...asRecord(asRecord(input.volatileInput).contextScoutSpecialist),
    ...asRecord(asRecord(input.metadata).contextScoutSpecialist),
  };
}

export function compileContextScoutSpecialistToolOutput(input: {
  toolId: string;
  volatileInput?: unknown;
  metadata?: unknown;
}): ContextScoutSpecialistCompileResult {
  const data = mergedRecord(input);
  if (
    input.toolId === "resource.scout.dispatch_specialist_subturn" ||
    input.toolId === "resource.scout.narrow_scope"
  ) {
    const providerProfileRecord = asRecord(data.providerProfile);
    return dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: sessionFromSources(input),
      nodeResourceDemandRequest: demandRequestFromSources(input),
      nodeResourceDemandFulfillment: demandFulfillmentFromSources(input),
      nodeResourceDemandBlocker: demandBlockerFromSources(input),
      nodeResourceLedger: ledgerFromSources(input),
      specialistTrigger:
        typeof data.specialistTrigger === "string"
          ? data.specialistTrigger
          : input.toolId === "resource.scout.narrow_scope"
            ? "direct_fulfillment_insufficient"
            : null,
      directFulfillmentAttempted: data.directFulfillmentAttempted === true,
      workflowSpecialistGrantRef:
        typeof data.workflowSpecialistGrantRef === "string"
          ? data.workflowSpecialistGrantRef
          : null,
      requestedContextKinds: strings(data.requestedContextKinds, 40, 120),
      candidateRefs: strings(data.candidateRefs ?? data.refs, 200, 620),
      knownContextRefs: strings(data.knownContextRefs, 200, 620),
      scoutReason: typeof data.scoutReason === "string" ? data.scoutReason : null,
      expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
      providerProfile: providerProfileRecord,
    });
  }
  const request = requestFromSources(input);
  const ledger = ledgerFromSources(input);
  if (!request || !ledger) {
    return needsReview({
      outputRef: `context-scout-specialist://blocked/${hashValue(input.toolId).slice(0, 16)}`,
      outputSummary: `${input.toolId} requires a specialist request and node resource ledger.`,
      reasonCodes: ["resource_scout_specialist_request_or_ledger_missing"],
      request,
      ledger,
    });
  }
  if (
    input.toolId === "resource.scout.submit_specialist_handoff" ||
    input.toolId === "resource.scout.submit_exact_handles" ||
    input.toolId === "resource.scout.append_handoff_to_ledger"
  ) {
    return submitContextScoutSpecialistHandoff({
      request,
      nodeResourceLedger: ledger,
      handoffSummary: typeof data.handoffSummary === "string" ? data.handoffSummary : null,
      relevantFiles: findingArray(data.relevantFiles ?? data.relevantFileReports),
      existingPatterns: findingArray(data.existingPatterns ?? data.patterns),
      risks: findingArray(data.risks),
      editPoints: findingArray(data.editPoints ?? data.recommendedEditPoints),
      validationSuggestions: findingArray(data.validationSuggestions ?? data.validations),
      limitations: findingArray(data.limitations),
      providerDiagnostics: Array.isArray(data.providerDiagnostics)
        ? (data.providerDiagnostics as Array<Partial<NodeContextProviderDiagnosticShape>>)
        : [],
    });
  }
  if (
    input.toolId === "resource.scout.mark_specialist_blocked" ||
    input.toolId === "resource.scout.mark_narrowing_blocked"
  ) {
    return submitContextScoutSpecialistHandoff({
      request,
      nodeResourceLedger: ledger,
      handoffSummary:
        typeof data.blockerSummary === "string"
          ? data.blockerSummary
          : "Specialist scout marked this node resource demand blocked.",
      limitations:
        findingArray(data.limitations).length > 0
          ? findingArray(data.limitations)
          : [
              {
                summary:
                  typeof data.blockerSummary === "string"
                    ? data.blockerSummary
                    : "Specialist scout could not satisfy this demand.",
                severity: "blocking",
              },
            ],
      providerDiagnostics: Array.isArray(data.providerDiagnostics)
        ? (data.providerDiagnostics as Array<Partial<NodeContextProviderDiagnosticShape>>)
        : [],
      markBlocked: true,
    });
  }
  if (input.toolId === "resource.scout.project_specialist_result") {
    return {
      status: "succeeded",
      request,
      handoff: null,
      ledger,
      entries: [],
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary: `Projected specialist scout result for ${request.consumerNodeId}.`,
      reasonCodes: ["resource_scout_specialist_result_projected"],
      metadata: boundedMetadata({
        request,
        ledger,
        status: "fulfilled",
        reasonCodes: ["resource_scout_specialist_result_projected"],
      }),
    };
  }
  return needsReview({
    outputRef: `context-scout-specialist://blocked/${hashValue(input.toolId).slice(0, 16)}`,
    outputSummary: `Unsupported resource scout specialist tool: ${bounded(input.toolId, 180)}.`,
    reasonCodes: ["resource_scout_specialist_unsupported_tool"],
    request,
    ledger,
  });
}
