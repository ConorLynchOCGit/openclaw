import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  EvidenceModeSchema,
  type EvidenceMode,
} from "./execution-intent.ts";
import type {
  NodeResourceDemandFulfillment,
  NodeResourceDemandRequest,
  NodeResourceDemandSession,
} from "./node-resource-demand-session.ts";
import {
  NodeResourceDemandFulfillmentSchema,
  NodeResourceDemandRequestSchema,
  NodeResourceDemandSessionSchema,
} from "./node-resource-demand-session.ts";

export const NODE_RESOURCE_LEDGER_ARTIFACT_TYPE =
  "execution_platform.node_resource_ledger" as const;
export const NODE_RESOURCE_LEDGER_ENTRY_ARTIFACT_TYPE =
  "execution_platform.node_resource_ledger.entry" as const;
export const NODE_RESOURCE_LEDGER_SCHEMA_VERSION =
  "execution-platform.node-resource-ledger.v1" as const;
export const NODE_RESOURCE_LEDGER_MANIFEST_MAX_BYTES = 12_000;
export const NODE_RESOURCE_LEDGER_ENTRY_MANIFEST_MAX_BYTES = 4_000;
export const NODE_RESOURCE_LEDGER_METADATA_MAX_BYTES = 18_000;
export const NODE_RESOURCE_LEDGER_PROJECTION_MAX_BYTES = 24_000;
export const NODE_RESOURCE_LEDGER_DEFAULT_PROJECTED_ENTRY_MANIFESTS = 8;
export const NODE_RESOURCE_LEDGER_DEFAULT_HYDRATION_PAYLOAD_REFS = 20;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedString = (max: number) =>
  z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const NodeResourceLedgerStatusSchema = z.enum(["open", "closed", "blocked"]);
export type NodeResourceLedgerStatus = z.infer<typeof NodeResourceLedgerStatusSchema>;

export const NodeResourceLedgerEntryKindSchema = z.enum([
  "resource_ref_opened",
  "relevant_resource_reported",
  "file_window_opened",
  "symbol_inspected",
  "related_test_found",
  "memory_pack_opened",
  "relevant_file_reported",
  "source_prompt_section_opened",
  "owner_constraint_reported",
  "project_fact_reported",
  "research_brief_reported",
  "planning_capsule_reported",
  "planning_action_point_recommended",
  "action_graph_candidate_reported",
  "compile_readiness_recommended",
  "human_decision_reported",
  "closeout_ref_reported",
  "existing_pattern_reported",
  "risk_reported",
  "edit_point_recommended",
  "validation_recommended",
  "domain_validation_recommended",
  "limitation_reported",
  "provider_diagnostic_recorded",
]);
export type NodeResourceLedgerEntryKind = z.infer<typeof NodeResourceLedgerEntryKindSchema>;

export const NodeResourceLedgerTransitionSchema = z.enum([
  "resource.ledger.append_file_window",
  "resource.ledger.append_symbol",
  "resource.ledger.append_related_test",
  "resource.ledger.append_memory_pack",
  "resource.ledger.append_resource_ref",
  "resource.ledger.report_relevant_file",
  "resource.ledger.report_relevant_resource",
  "resource.ledger.append_source_prompt_section",
  "resource.ledger.report_owner_constraint",
  "resource.ledger.report_project_fact",
  "resource.ledger.report_research_brief",
  "resource.ledger.report_planning_capsule",
  "resource.ledger.report_planning_action_point",
  "resource.ledger.report_action_graph_candidate",
  "resource.ledger.recommend_compile_readiness",
  "resource.ledger.report_human_decision",
  "resource.ledger.report_closeout_ref",
  "resource.ledger.report_existing_pattern",
  "resource.ledger.report_risk",
  "resource.ledger.recommend_edit_point",
  "resource.ledger.recommend_validation",
  "resource.ledger.recommend_domain_validation",
  "resource.ledger.report_limitation",
  "resource.ledger.record_provider_diagnostic",
  "resource.ledger.project_manifest",
  "resource.ledger.hydrate_entry",
  "resource.ledger.close",
]);
export type NodeResourceLedgerTransition = z.infer<typeof NodeResourceLedgerTransitionSchema>;

export const NodeResourceLedgerStoragePolicySchema = z
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

export const NodeResourceLedgerPayloadRefSchema = z
  .object({
    artifactType: boundedString(180),
    artifactRef: boundedString(520),
    payloadRef: boundedString(620),
    contentHash: boundedString(140),
    byteCount: z.number().int().min(0).max(10 * 1024 * 1024),
    partCount: z.number().int().min(0).max(10_000).default(0),
    hydrateToolId: z.literal("artifact.payload.get_json"),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();
export type NodeResourceLedgerPayloadRef = z.infer<typeof NodeResourceLedgerPayloadRefSchema>;

export const NodeContextProviderDiagnosticShapeSchema = z
  .object({
    modelRef: nullableBoundedString(220),
    providerId: nullableBoundedString(180),
    providerPath: nullableBoundedString(220),
    requestByteCount: z.number().int().min(0).max(10 * 1024 * 1024).nullable().default(null),
    timeoutMs: z.number().int().min(0).max(3_600_000).nullable().default(null),
    timeoutState: z
      .enum(["not_timed_out", "timed_out", "timeout_unknown"])
      .default("timeout_unknown"),
    nativeFinishReason: nullableBoundedString(160),
    choiceCount: z.number().int().min(0).max(1_000).nullable().default(null),
    contentLengths: z.array(z.number().int().min(0).max(10 * 1024 * 1024)).max(32).default([]),
    parsedContentLength: z.number().int().min(0).max(10 * 1024 * 1024).nullable().default(null),
    retryNumber: z.number().int().min(0).max(100).nullable().default(null),
    concurrencySlot: nullableBoundedString(120),
    inputBundleRef: nullableBoundedString(620),
    inputBundleHash: nullableBoundedString(140),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();
export type NodeContextProviderDiagnosticShape = z.infer<
  typeof NodeContextProviderDiagnosticShapeSchema
>;

export const NodeResourceLedgerSchema = z
  .object({
    artifactKind: z.literal("node_resource_ledger"),
    schemaVersion: z.literal(NODE_RESOURCE_LEDGER_SCHEMA_VERSION),
    ledgerId: boundedString(180),
    ledgerRef: boundedString(520),
    ledgerHash: boundedString(140),
    ledgerPayloadRef: NodeResourceLedgerPayloadRefSchema,
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    consumerBranchId: nullableBoundedString(180),
    workIntentRef: nullableBoundedString(520),
    nodeExecutionContractRef: nullableBoundedString(520),
    nodeExecutionPacketRef: nullableBoundedString(520),
    nodeResourceDemandSessionRef: nullableBoundedString(520),
    capabilityId: boundedString(180),
    evidenceMode: z.array(EvidenceModeSchema).min(1).max(12),
    targetCommitmentIds: stringList(80, 180),
    authorityScope: stringList(160, 520),
    entryRefs: stringList(500, 620),
    entryPayloadRefs: stringList(500, 620),
    entryKindCounts: z.record(z.string(), z.number().int().min(0)).default({}),
    limitationRefs: stringList(120, 620),
    providerDiagnosticRefs: stringList(120, 620),
    status: NodeResourceLedgerStatusSchema,
    nextLegalTransitions: z.array(NodeResourceLedgerTransitionSchema).max(40),
    reasonCodes: stringList(160, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    storagePolicy: NodeResourceLedgerStoragePolicySchema,
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
export type NodeResourceLedger = z.infer<typeof NodeResourceLedgerSchema>;

export const NodeResourceLedgerEntrySchema = z
  .object({
    artifactKind: z.literal("node_resource_ledger_entry"),
    schemaVersion: z.literal(NODE_RESOURCE_LEDGER_SCHEMA_VERSION),
    entryId: boundedString(180),
    entryRef: boundedString(620),
    entryHash: boundedString(140),
    entryPayloadRef: NodeResourceLedgerPayloadRefSchema,
    ledgerRef: boundedString(520),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    consumerNodeId: boundedString(180),
    workIntentRef: nullableBoundedString(520),
    nodeExecutionContractRef: nullableBoundedString(520),
    nodeExecutionPacketRef: nullableBoundedString(520),
    nodeResourceDemandSessionRef: nullableBoundedString(520),
    sourceRequestRef: nullableBoundedString(620),
    sourceFulfillmentRef: nullableBoundedString(620),
    entryKind: NodeResourceLedgerEntryKindSchema,
    contentRefs: stringList(160, 620),
    fileRef: nullableBoundedString(620),
    symbolRef: nullableBoundedString(620),
    testRef: nullableBoundedString(620),
    memoryPackRef: nullableBoundedString(620),
    lineStart: z.number().int().min(1).nullable().default(null),
    lineEnd: z.number().int().min(1).nullable().default(null),
    summary: boundedString(1_200),
    details: z.string().trim().max(8_000).default(""),
    expectedUse: z.string().trim().max(1_200).default(""),
    limitationSeverity: z.enum(["low", "medium", "high", "blocking"]).nullable().default(null),
    providerDiagnostic: NodeContextProviderDiagnosticShapeSchema.nullable().default(null),
    reasonCodes: stringList(160, 220),
    semanticJudgmentOwner: z.literal("model_or_human"),
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
export type NodeResourceLedgerEntry = z.infer<typeof NodeResourceLedgerEntrySchema>;

export type NodeResourceLedgerManifest = {
  artifactKind: "node_resource_ledger_manifest";
  schemaVersion: typeof NODE_RESOURCE_LEDGER_SCHEMA_VERSION;
  ledgerRef: string;
  ledgerHash: string;
  ledgerPayloadRef: NodeResourceLedgerPayloadRef;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  consumerNodeId: string;
  workIntentRef: string | null;
  nodeExecutionContractRef: string | null;
  nodeExecutionPacketRef: string | null;
  nodeResourceDemandSessionRef: string | null;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  targetCommitmentCount: number;
  authorityScopeCount: number;
  entryCount: number;
  entryKindCounts: Partial<Record<NodeResourceLedgerEntryKind, number>>;
  entryPayloadRefCount: number;
  limitationCount: number;
  providerDiagnosticCount: number;
  status: NodeResourceLedgerStatus;
  nextLegalTransitions: NodeResourceLedgerTransition[];
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceLedgerEntryManifest = {
  artifactKind: "node_resource_ledger_entry_manifest";
  schemaVersion: typeof NODE_RESOURCE_LEDGER_SCHEMA_VERSION;
  entryRef: string;
  entryHash: string;
  entryPayloadRef: NodeResourceLedgerPayloadRef;
  ledgerRef: string;
  consumerNodeId: string;
  entryKind: NodeResourceLedgerEntryKind;
  contentRefCount: number;
  fileRef: string | null;
  symbolRef: string | null;
  testRef: string | null;
  memoryPackRef: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  summaryPreview: string;
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceLedgerAppendResult = {
  status: "succeeded" | "needs_review";
  ledger: NodeResourceLedger | null;
  entry: NodeResourceLedgerEntry | null;
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

export type NodeResourceLedgerHydrationRequest = {
  ledgerRef: string;
  entryRef?: string | null;
  payloadRefs: string[];
};

export type NodeResourceLedgerProjection = {
  artifactKind: "node_resource_ledger_projection";
  schemaVersion: typeof NODE_RESOURCE_LEDGER_SCHEMA_VERSION;
  ledgerManifest: NodeResourceLedgerManifest | null;
  entryManifests: NodeResourceLedgerEntryManifest[];
  totalEntryManifestCount: number;
  projectedEntryManifestCount: number;
  omittedEntryManifestCount: number;
  projectionTruncated: boolean;
  hydrationRequest: NodeResourceLedgerHydrationRequest | null;
  allPayloadRefCount: number;
  projectedPayloadRefCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceLedgerPayloadAttachment = {
  artifactType: string;
  uri: string;
  payloadRef: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  manifestByteCount: number;
};

export type NodeResourceLedgerPayloadPersistenceResult = {
  artifactKind: "node_resource_ledger_payload_persistence";
  schemaVersion: typeof NODE_RESOURCE_LEDGER_SCHEMA_VERSION;
  status: "succeeded";
  ledgerArtifact: NodeResourceLedgerPayloadAttachment | null;
  entryArtifact: NodeResourceLedgerPayloadAttachment | null;
  payloadRefs: string[];
  payloadCount: number;
  largestPayloadBytes: number;
  largestMetadataBytes: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type NodeResourceLedgerArtifactRepository = {
  attachRuntimeArtifactByContract(input: {
    jobId: string;
    artifactType: string;
    uri: string;
    payloadRef?: string;
    contentType?: string;
    body: JsonValue;
    boundedSummary?: string | null;
    targetCommitmentIds?: string[];
    targetNodeIds?: string[];
    resourcePacketKind?: string | null;
    readinessStatus?: string | null;
    reasonCodes?: string[];
    inputCounts?: JsonValue;
    outputCounts?: JsonValue;
    maxBounds?: JsonValue;
    createdBy?: string | null;
    metadata?: Record<string, JsonValue>;
  }): Promise<{
    artifactType: string;
    uri: string;
    sizeBytes: number | null;
    sha256: string | null;
    metadata: JsonValue;
  }>;
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

function jsonByteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const FORBIDDEN_MANIFEST_BODY_KEYS = new Set([
  "nodeResourceLedger",
  "nodeResourceLedgerEntry",
  "ledgerEntries",
  "ledgerEntryBodies",
  "entryBodies",
  "fileWindowBodies",
  "contextBodies",
  "providerResponseBodies",
  "providerDiagnosticBodies",
  "details",
  "expectedUse",
  "providerDiagnostic",
  "rawPrompt",
  "rawResponse",
  "rawTranscript",
  "rawProviderLog",
  "rawToolLog",
  "rawCommandLog",
  "rawDbRows",
  "lineNumberedContent",
  "boundedContent",
  "fileContent",
  "fullContent",
  "snapshotBody",
  "contextBody",
  "body",
  "payloadBody",
]);

function assertNoManifestBodyKeys(value: unknown, path = "$"): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoManifestBodyKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (FORBIDDEN_MANIFEST_BODY_KEYS.has(key)) {
      throw new Error(`node_resource_ledger_manifest_contains_body_field:${nestedPath}`);
    }
    assertNoManifestBodyKeys(nested, nestedPath);
  }
}

function assertByteBudget(input: { label: string; value: unknown; maxBytes: number }): number {
  const byteCount = jsonByteCount(input.value);
  if (byteCount > input.maxBytes) {
    throw new Error(`node_resource_ledger_${input.label}_overflow:${byteCount}:${input.maxBytes}`);
  }
  return byteCount;
}

export function assertNodeResourceLedgerManifestMetadata(
  metadata: JsonValue,
  input?: { maxBytes?: number },
): void {
  assertByteBudget({
    label: "metadata_manifest",
    value: metadata,
    maxBytes: input?.maxBytes ?? NODE_RESOURCE_LEDGER_METADATA_MAX_BYTES,
  });
  assertNoManifestBodyKeys(metadata);
}

export function assertNodeResourceLedgerManifest(manifest: NodeResourceLedgerManifest): void {
  assertByteBudget({
    label: "ledger_manifest",
    value: manifest,
    maxBytes: NODE_RESOURCE_LEDGER_MANIFEST_MAX_BYTES,
  });
  assertNoManifestBodyKeys(manifest);
}

export function assertNodeResourceLedgerEntryManifest(
  manifest: NodeResourceLedgerEntryManifest,
): void {
  assertByteBudget({
    label: "entry_manifest",
    value: manifest,
    maxBytes: NODE_RESOURCE_LEDGER_ENTRY_MANIFEST_MAX_BYTES,
  });
  assertNoManifestBodyKeys(manifest);
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

function payloadRefFor(input: {
  runtimeJobId: string;
  artifactType: string;
  artifactRef: string;
  contentHash: string;
  byteCount: number;
}): NodeResourceLedgerPayloadRef {
  const payloadRef = `runtime-artifact-payload://${bounded(input.runtimeJobId, 180)}/${bounded(
    input.artifactType,
    180,
  )}/${bounded(input.contentHash, 96)}`;
  return NodeResourceLedgerPayloadRefSchema.parse({
    artifactType: input.artifactType,
    artifactRef: input.artifactRef,
    payloadRef,
    contentHash: input.contentHash,
    byteCount: input.byteCount,
    partCount: 0,
    hydrateToolId: "artifact.payload.get_json",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
}

function withHashAndPayload<T extends Record<string, unknown>, K extends string>(
  body: T,
  hashKey: K,
  artifactType: string,
  payloadKey: "ledgerPayloadRef" | "entryPayloadRef",
): T & Record<K, string> & Record<typeof payloadKey, NodeResourceLedgerPayloadRef> {
  const hashed = {
    ...body,
    [hashKey]: hashValue({ ...body, [hashKey]: "pending", [payloadKey]: "pending" }),
  } as T & Record<K, string>;
  const byteCount = Buffer.byteLength(JSON.stringify(hashed), "utf8");
  return {
    ...hashed,
    [payloadKey]: payloadRefFor({
      runtimeJobId: String(hashed.runtimeJobId),
      artifactType,
      artifactRef:
        typeof hashed.ledgerRef === "string"
          ? hashed.ledgerRef
          : typeof hashed.entryRef === "string"
            ? hashed.entryRef
            : `${artifactType}:${hashed[hashKey]}`,
      contentHash: hashed[hashKey],
      byteCount,
    }),
  } as T & Record<K, string> & Record<typeof payloadKey, NodeResourceLedgerPayloadRef>;
}

function missingLedgerFields(input: {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  consumerNodeId?: string | null;
  capabilityId?: string | null;
  evidenceMode?: EvidenceMode[];
  authorityScope?: string[];
}): string[] {
  return [
    input.runtimeJobId ? null : "runtimeJobId",
    input.workflowId ? null : "workflowId",
    input.graphId ? null : "graphId",
    input.consumerNodeId ? null : "consumerNodeId",
    input.capabilityId ? null : "capabilityId",
    (input.evidenceMode ?? []).length > 0 ? null : "evidenceMode",
    (input.authorityScope ?? []).length > 0 ? null : "authorityScope",
  ].filter((field): field is string => Boolean(field));
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

function nextAppendTransitions(): NodeResourceLedgerTransition[] {
  return [
    "resource.ledger.append_file_window",
    "resource.ledger.append_symbol",
    "resource.ledger.append_related_test",
    "resource.ledger.append_memory_pack",
    "resource.ledger.append_resource_ref",
    "resource.ledger.report_relevant_file",
    "resource.ledger.report_relevant_resource",
    "resource.ledger.append_source_prompt_section",
    "resource.ledger.report_owner_constraint",
    "resource.ledger.report_project_fact",
    "resource.ledger.report_research_brief",
    "resource.ledger.report_planning_capsule",
    "resource.ledger.report_planning_action_point",
    "resource.ledger.report_action_graph_candidate",
    "resource.ledger.recommend_compile_readiness",
    "resource.ledger.report_human_decision",
    "resource.ledger.report_closeout_ref",
    "resource.ledger.report_existing_pattern",
    "resource.ledger.report_risk",
    "resource.ledger.recommend_edit_point",
    "resource.ledger.recommend_validation",
    "resource.ledger.recommend_domain_validation",
    "resource.ledger.report_limitation",
    "resource.ledger.record_provider_diagnostic",
    "resource.ledger.project_manifest",
    "resource.ledger.close",
  ];
}

function entryKindCountsWith(
  ledger: NodeResourceLedger,
  entryKind: NodeResourceLedgerEntryKind,
): Partial<Record<NodeResourceLedgerEntryKind, number>> {
  return {
    ...ledger.entryKindCounts,
    [entryKind]: (ledger.entryKindCounts[entryKind] ?? 0) + 1,
  };
}

export function buildNodeResourceLedgerManifest(
  ledger: NodeResourceLedger,
): NodeResourceLedgerManifest {
  const manifest = {
    artifactKind: "node_resource_ledger_manifest" as const,
    schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
    ledgerRef: ledger.ledgerRef,
    ledgerHash: ledger.ledgerHash,
    ledgerPayloadRef: ledger.ledgerPayloadRef,
    runtimeJobId: ledger.runtimeJobId,
    workflowId: ledger.workflowId,
    graphId: ledger.graphId,
    consumerNodeId: ledger.consumerNodeId,
    workIntentRef: ledger.workIntentRef,
    nodeExecutionContractRef: ledger.nodeExecutionContractRef,
    nodeExecutionPacketRef: ledger.nodeExecutionPacketRef,
    nodeResourceDemandSessionRef: ledger.nodeResourceDemandSessionRef,
    capabilityId: ledger.capabilityId,
    evidenceMode: ledger.evidenceMode,
    targetCommitmentCount: ledger.targetCommitmentIds.length,
    authorityScopeCount: ledger.authorityScope.length,
    entryCount: ledger.entryRefs.length,
    entryKindCounts: ledger.entryKindCounts,
    entryPayloadRefCount: ledger.entryPayloadRefs.length,
    limitationCount: ledger.limitationRefs.length,
    providerDiagnosticCount: ledger.providerDiagnosticRefs.length,
    status: ledger.status,
    nextLegalTransitions: ledger.nextLegalTransitions,
    reasonCodes: ledger.reasonCodes.slice(0, 40),
    byteCount: jsonByteCount(ledger),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  } satisfies NodeResourceLedgerManifest;
  assertNodeResourceLedgerManifest(manifest);
  return manifest;
}

export function buildNodeResourceLedgerEntryManifest(
  entry: NodeResourceLedgerEntry,
): NodeResourceLedgerEntryManifest {
  const manifest = {
    artifactKind: "node_resource_ledger_entry_manifest" as const,
    schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
    entryRef: entry.entryRef,
    entryHash: entry.entryHash,
    entryPayloadRef: entry.entryPayloadRef,
    ledgerRef: entry.ledgerRef,
    consumerNodeId: entry.consumerNodeId,
    entryKind: entry.entryKind,
    contentRefCount: entry.contentRefs.length,
    fileRef: entry.fileRef,
    symbolRef: entry.symbolRef,
    testRef: entry.testRef,
    memoryPackRef: entry.memoryPackRef,
    lineStart: entry.lineStart,
    lineEnd: entry.lineEnd,
    summaryPreview: bounded(entry.summary, 220),
    reasonCodes: entry.reasonCodes.slice(0, 40),
    byteCount: jsonByteCount(entry),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  } satisfies NodeResourceLedgerEntryManifest;
  assertNodeResourceLedgerEntryManifest(manifest);
  return manifest;
}

export function projectNodeResourceLedger(input: {
  ledger?: NodeResourceLedger | null;
  entries?: NodeResourceLedgerEntry[];
  maxEntryManifests?: number;
  maxHydrationPayloadRefs?: number;
}): NodeResourceLedgerProjection {
  const ledger = input.ledger ? NodeResourceLedgerSchema.parse(input.ledger) : null;
  const entries = (input.entries ?? []).map((entry) => NodeResourceLedgerEntrySchema.parse(entry));
  const allPayloadRefs = ledger
    ? [ledger.ledgerPayloadRef.payloadRef, ...entries.map((entry) => entry.entryPayloadRef.payloadRef)]
    : [];
  let projectedEntryLimit = Math.max(
    0,
    input.maxEntryManifests ?? NODE_RESOURCE_LEDGER_DEFAULT_PROJECTED_ENTRY_MANIFESTS,
  );
  let projectedPayloadLimit = Math.max(
    0,
    input.maxHydrationPayloadRefs ?? NODE_RESOURCE_LEDGER_DEFAULT_HYDRATION_PAYLOAD_REFS,
  );
  const buildProjection = (): NodeResourceLedgerProjection => {
    const projectedEntries = entries.slice(0, projectedEntryLimit);
    const projectedPayloadRefs = allPayloadRefs.slice(0, projectedPayloadLimit);
    return {
      artifactKind: "node_resource_ledger_projection" as const,
      schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
      ledgerManifest: ledger ? buildNodeResourceLedgerManifest(ledger) : null,
      entryManifests: projectedEntries.map(buildNodeResourceLedgerEntryManifest),
      totalEntryManifestCount: entries.length,
      projectedEntryManifestCount: projectedEntries.length,
      omittedEntryManifestCount: Math.max(0, entries.length - projectedEntries.length),
      projectionTruncated:
        projectedEntries.length < entries.length ||
        projectedPayloadRefs.length < allPayloadRefs.length,
      hydrationRequest: ledger
        ? {
            ledgerRef: ledger.ledgerRef,
            entryRef: null,
            payloadRefs: projectedPayloadRefs,
          }
        : null,
      allPayloadRefCount: allPayloadRefs.length,
      projectedPayloadRefCount: projectedPayloadRefs.length,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
    };
  };
  let projection = buildProjection();
  while (
    jsonByteCount(projection) > NODE_RESOURCE_LEDGER_PROJECTION_MAX_BYTES &&
    (projectedEntryLimit > 0 || projectedPayloadLimit > (ledger ? 1 : 0))
  ) {
    if (projectedEntryLimit > 0) {
      projectedEntryLimit -= 1;
    } else {
      projectedPayloadLimit -= 1;
    }
    projection = buildProjection();
  }
  assertByteBudget({
    label: "projection",
    value: projection,
    maxBytes: NODE_RESOURCE_LEDGER_PROJECTION_MAX_BYTES,
  });
  assertNoManifestBodyKeys(projection);
  return projection;
}

function boundedMetadata(input: {
  ledger?: NodeResourceLedger | null;
  entry?: NodeResourceLedgerEntry | null;
}): JsonValue {
  const ledgerManifest = input.ledger ? buildNodeResourceLedgerManifest(input.ledger) : null;
  const entryManifest = input.entry ? buildNodeResourceLedgerEntryManifest(input.entry) : null;
  const metadata = {
    nodeResourceLedgerManifest: ledgerManifest,
    nodeResourceLedgerEntryManifest: entryManifest,
    nodeResourceLedgerRef: input.ledger?.ledgerRef ?? input.entry?.ledgerRef ?? null,
    nodeResourceLedgerPayloadRef: input.ledger?.ledgerPayloadRef.payloadRef ?? null,
    nodeResourceLedgerEntryRef: input.entry?.entryRef ?? null,
    nodeResourceLedgerEntryPayloadRef: input.entry?.entryPayloadRef.payloadRef ?? null,
    nodeResourceLedgerEntryCount: ledgerManifest?.entryCount ?? null,
    nodeResourceLedgerEntryKindCounts: ledgerManifest?.entryKindCounts ?? null,
    nodeResourceLedgerStatus: input.ledger?.status ?? null,
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
  assertNodeResourceLedgerManifestMetadata(metadata);
  return metadata;
}

export function openNodeResourceLedger(input: {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  consumerNodeId?: string | null;
  consumerBranchId?: string | null;
  workIntentRef?: string | null;
  nodeExecutionContractRef?: string | null;
  nodeExecutionPacketRef?: string | null;
  nodeResourceDemandSessionRef?: string | null;
  capabilityId?: string | null;
  evidenceMode?: string[] | EvidenceMode[];
  targetCommitmentIds?: string[];
  authorityScope?: string[];
}): NodeResourceLedgerAppendResult {
  const evidenceMode = parseEvidenceMode(input.evidenceMode);
  const authorityScope = strings(input.authorityScope, 160, 520);
  const missingFields = missingLedgerFields({
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    capabilityId: bounded(input.capabilityId, 180),
    evidenceMode,
    authorityScope,
  });
  if (missingFields.length > 0) {
    return {
      status: "needs_review",
      ledger: null,
      entry: null,
      outputRef: `node-resource-ledger://blocked/${hashValue(missingFields).slice(0, 16)}`,
      outputHash: hashValue(missingFields),
      outputSummary: `Node context ledger is missing required structural fields: ${missingFields.join(
        ", ",
      )}.`,
      reasonCodes: missingFields.map((field) => `node_resource_ledger_${field}_missing`),
      metadata: {
        nodeResourceLedgerManifest: null,
        missingFieldCount: missingFields.length,
        reasonCodes: missingFields.map((field) => `node_resource_ledger_${field}_missing`),
        semanticQualityJudgedByDeterministicCode: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as JsonValue,
    };
  }
  const ledgerId = `node-resource-ledger:${hashValue({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    consumerNodeId: input.consumerNodeId,
    nodeResourceDemandSessionRef: input.nodeResourceDemandSessionRef,
  }).slice(0, 18)}`;
  const ledgerRef = `runtime-job://${bounded(input.runtimeJobId, 180)}/node-resource-ledger/${bounded(
    input.graphId,
    140,
  )}/${bounded(input.consumerNodeId, 140)}/${ledgerId}`;
  const body = {
    artifactKind: "node_resource_ledger" as const,
    schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
    ledgerId,
    ledgerRef,
    ledgerHash: "pending",
    ledgerPayloadRef: null,
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    consumerNodeId: bounded(input.consumerNodeId, 180),
    consumerBranchId: bounded(input.consumerBranchId, 180) || null,
    workIntentRef: bounded(input.workIntentRef, 520) || null,
    nodeExecutionContractRef: bounded(input.nodeExecutionContractRef, 520) || null,
    nodeExecutionPacketRef: bounded(input.nodeExecutionPacketRef, 520) || null,
    nodeResourceDemandSessionRef: bounded(input.nodeResourceDemandSessionRef, 520) || null,
    capabilityId: bounded(input.capabilityId, 180),
    evidenceMode,
    targetCommitmentIds: strings(input.targetCommitmentIds, 80, 180),
    authorityScope,
    entryRefs: [],
    entryPayloadRefs: [],
    entryKindCounts: {},
    limitationRefs: [],
    providerDiagnosticRefs: [],
    status: "open" as const,
    nextLegalTransitions: nextAppendTransitions(),
    reasonCodes: ["node_resource_ledger_opened"],
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
  const ledger = NodeResourceLedgerSchema.parse(
    withHashAndPayload(
      body,
      "ledgerHash",
      NODE_RESOURCE_LEDGER_ARTIFACT_TYPE,
      "ledgerPayloadRef",
    ),
  );
  return {
    status: "succeeded",
    ledger,
    entry: null,
    outputRef: ledger.ledgerRef,
    outputHash: ledger.ledgerHash,
    outputSummary: `Opened node resource ledger for ${ledger.consumerNodeId}.`,
    reasonCodes: ledger.reasonCodes,
    metadata: boundedMetadata({ ledger }),
  };
}

function ensureOpenLedger(ledger: NodeResourceLedger): NodeResourceLedgerAppendResult | null {
  if (ledger.status === "open") {
    return null;
  }
  return {
    status: "needs_review",
    ledger,
    entry: null,
    outputRef: ledger.ledgerRef,
    outputHash: ledger.ledgerHash,
    outputSummary: `Node context ledger is ${ledger.status}; appends require an open ledger.`,
    reasonCodes: ["node_resource_ledger_not_open"],
    metadata: boundedMetadata({ ledger }),
  };
}

export function appendNodeResourceLedgerEntry(input: {
  ledger: NodeResourceLedger;
  entryKind: NodeResourceLedgerEntryKind;
  sourceRequestRef?: string | null;
  sourceFulfillmentRef?: string | null;
  contentRefs?: string[];
  fileRef?: string | null;
  symbolRef?: string | null;
  testRef?: string | null;
  memoryPackRef?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  summary?: string | null;
  details?: string | null;
  expectedUse?: string | null;
  limitationSeverity?: "low" | "medium" | "high" | "blocking" | null;
  providerDiagnostic?: Partial<NodeContextProviderDiagnosticShape> | null;
  reasonCodes?: string[];
}): NodeResourceLedgerAppendResult {
  const ledger = NodeResourceLedgerSchema.parse(input.ledger);
  const lifecycleBlocker = ensureOpenLedger(ledger);
  if (lifecycleBlocker) {
    return lifecycleBlocker;
  }
  const refsToAuthorize = strings(
    [
      ...(input.contentRefs ?? []),
      input.fileRef ?? "",
      input.symbolRef ?? "",
      input.testRef ?? "",
      input.memoryPackRef ?? "",
    ],
    200,
    620,
  ).filter((ref) => !ref.startsWith("provider-diagnostic://"));
  const deniedRefs = refsToAuthorize.filter(
    (ref) => !authorityAllowsRef({ authorityScope: ledger.authorityScope, ref }),
  );
  if (deniedRefs.length > 0) {
    return {
      status: "needs_review",
      ledger,
      entry: null,
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary:
        "Node context ledger append included refs outside the consumer authority scope.",
      reasonCodes: ["node_resource_ledger_authority_scope_violation"],
      metadata: {
        ...asRecord(boundedMetadata({ ledger })),
        deniedRefCount: deniedRefs.length,
        reasonCodes: ["node_resource_ledger_authority_scope_violation"],
      } as JsonValue,
    };
  }
  const summary = bounded(input.summary, 1_200);
  if (!summary) {
    return {
      status: "needs_review",
      ledger,
      entry: null,
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary: "Node context ledger entry is missing a model-authored summary.",
      reasonCodes: ["node_resource_ledger_entry_summary_missing"],
      metadata: boundedMetadata({ ledger }),
    };
  }
  const entryId = `node-context-entry:${hashValue({
    ledgerRef: ledger.ledgerRef,
    entryKind: input.entryKind,
    contentRefs: input.contentRefs,
    summary,
    details: input.details,
  }).slice(0, 18)}`;
  const entryRef = `${ledger.ledgerRef}/entry/${entryId}`;
  const providerDiagnostic = input.providerDiagnostic
    ? NodeContextProviderDiagnosticShapeSchema.parse({
        modelRef: input.providerDiagnostic.modelRef ?? null,
        providerId: input.providerDiagnostic.providerId ?? null,
        providerPath: input.providerDiagnostic.providerPath ?? null,
        requestByteCount: input.providerDiagnostic.requestByteCount ?? null,
        timeoutMs: input.providerDiagnostic.timeoutMs ?? null,
        timeoutState: input.providerDiagnostic.timeoutState ?? "timeout_unknown",
        nativeFinishReason: input.providerDiagnostic.nativeFinishReason ?? null,
        choiceCount: input.providerDiagnostic.choiceCount ?? null,
        contentLengths: input.providerDiagnostic.contentLengths ?? [],
        parsedContentLength: input.providerDiagnostic.parsedContentLength ?? null,
        retryNumber: input.providerDiagnostic.retryNumber ?? null,
        concurrencySlot: input.providerDiagnostic.concurrencySlot ?? null,
        inputBundleRef: input.providerDiagnostic.inputBundleRef ?? null,
        inputBundleHash: input.providerDiagnostic.inputBundleHash ?? null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      })
    : null;
  const entryBody = {
    artifactKind: "node_resource_ledger_entry" as const,
    schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
    entryId,
    entryRef,
    entryHash: "pending",
    entryPayloadRef: null,
    ledgerRef: ledger.ledgerRef,
    runtimeJobId: ledger.runtimeJobId,
    workflowId: ledger.workflowId,
    graphId: ledger.graphId,
    consumerNodeId: ledger.consumerNodeId,
    workIntentRef: ledger.workIntentRef,
    nodeExecutionContractRef: ledger.nodeExecutionContractRef,
    nodeExecutionPacketRef: ledger.nodeExecutionPacketRef,
    nodeResourceDemandSessionRef: ledger.nodeResourceDemandSessionRef,
    sourceRequestRef: bounded(input.sourceRequestRef, 620) || null,
    sourceFulfillmentRef: bounded(input.sourceFulfillmentRef, 620) || null,
    entryKind: input.entryKind,
    contentRefs: strings(input.contentRefs, 160, 620),
    fileRef: bounded(input.fileRef, 620) || null,
    symbolRef: bounded(input.symbolRef, 620) || null,
    testRef: bounded(input.testRef, 620) || null,
    memoryPackRef: bounded(input.memoryPackRef, 620) || null,
    lineStart: input.lineStart ?? null,
    lineEnd: input.lineEnd ?? null,
    summary,
    details: bounded(input.details, 8_000),
    expectedUse: bounded(input.expectedUse, 1_200),
    limitationSeverity: input.limitationSeverity ?? null,
    providerDiagnostic,
    reasonCodes: strings(
      input.reasonCodes ?? [`node_resource_ledger_${input.entryKind}_appended`],
      160,
      220,
    ),
    semanticJudgmentOwner: "model_or_human" as const,
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
  const entry = NodeResourceLedgerEntrySchema.parse(
    withHashAndPayload(
      entryBody,
      "entryHash",
      NODE_RESOURCE_LEDGER_ENTRY_ARTIFACT_TYPE,
      "entryPayloadRef",
    ),
  );
  const nextLedgerBody = {
    ...ledger,
    ledgerHash: "pending",
    ledgerPayloadRef: null,
    entryRefs: [...ledger.entryRefs, entry.entryRef],
    entryPayloadRefs: [...ledger.entryPayloadRefs, entry.entryPayloadRef.payloadRef],
    entryKindCounts: entryKindCountsWith(ledger, entry.entryKind),
    limitationRefs:
      entry.entryKind === "limitation_reported"
        ? [...ledger.limitationRefs, entry.entryRef]
        : ledger.limitationRefs,
    providerDiagnosticRefs:
      entry.entryKind === "provider_diagnostic_recorded"
        ? [...ledger.providerDiagnosticRefs, entry.entryRef]
        : ledger.providerDiagnosticRefs,
    reasonCodes: [...ledger.reasonCodes, ...entry.reasonCodes],
  };
  const updatedLedger = NodeResourceLedgerSchema.parse(
    withHashAndPayload(
      nextLedgerBody,
      "ledgerHash",
      NODE_RESOURCE_LEDGER_ARTIFACT_TYPE,
      "ledgerPayloadRef",
    ),
  );
  return {
    status: "succeeded",
    ledger: updatedLedger,
    entry,
    outputRef: entry.entryRef,
    outputHash: entry.entryHash,
    outputSummary: `Appended ${entry.entryKind} to node resource ledger for ${ledger.consumerNodeId}.`,
    reasonCodes: entry.reasonCodes,
    metadata: boundedMetadata({ ledger: updatedLedger, entry }),
  };
}

export function closeNodeResourceLedger(input: {
  ledger: NodeResourceLedger;
  closeReason?: string | null;
}): NodeResourceLedgerAppendResult {
  const ledger = NodeResourceLedgerSchema.parse(input.ledger);
  const updatedLedger = NodeResourceLedgerSchema.parse(
    withHashAndPayload(
      {
        ...ledger,
        ledgerHash: "pending",
        ledgerPayloadRef: null,
        status: ledger.status === "blocked" ? ("blocked" as const) : ("closed" as const),
        nextLegalTransitions: [],
        reasonCodes: [...ledger.reasonCodes, "node_resource_ledger_closed"],
      },
      "ledgerHash",
      NODE_RESOURCE_LEDGER_ARTIFACT_TYPE,
      "ledgerPayloadRef",
    ),
  );
  return {
    status: "succeeded",
    ledger: updatedLedger,
    entry: null,
    outputRef: updatedLedger.ledgerRef,
    outputHash: updatedLedger.ledgerHash,
    outputSummary: bounded(input.closeReason, 1_200) || "Node context ledger closed.",
    reasonCodes: ["node_resource_ledger_closed"],
    metadata: boundedMetadata({ ledger: updatedLedger }),
  };
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

function mergedRecord(input: { volatileInput?: unknown; metadata?: unknown }): Record<
  string,
  unknown
> {
  return {
    ...asRecord(input.volatileInput),
    ...asRecord(input.metadata),
    ...asRecord(asRecord(input.volatileInput).resourceLedger),
    ...asRecord(asRecord(input.metadata).resourceLedger),
  };
}

function entryKindForTool(toolId: string): NodeResourceLedgerEntryKind | null {
  const mapping: Record<string, NodeResourceLedgerEntryKind> = {
    "resource.ledger.append_file_window": "file_window_opened",
    "resource.ledger.append_symbol": "symbol_inspected",
    "resource.ledger.append_related_test": "related_test_found",
    "resource.ledger.append_memory_pack": "memory_pack_opened",
    "resource.ledger.append_resource_ref": "resource_ref_opened",
    "resource.ledger.report_relevant_file": "relevant_file_reported",
    "resource.ledger.report_relevant_resource": "relevant_resource_reported",
    "resource.ledger.append_source_prompt_section": "source_prompt_section_opened",
    "resource.ledger.report_owner_constraint": "owner_constraint_reported",
    "resource.ledger.report_project_fact": "project_fact_reported",
    "resource.ledger.report_research_brief": "research_brief_reported",
    "resource.ledger.report_planning_capsule": "planning_capsule_reported",
    "resource.ledger.report_planning_action_point": "planning_action_point_recommended",
    "resource.ledger.report_action_graph_candidate": "action_graph_candidate_reported",
    "resource.ledger.recommend_compile_readiness": "compile_readiness_recommended",
    "resource.ledger.report_human_decision": "human_decision_reported",
    "resource.ledger.report_closeout_ref": "closeout_ref_reported",
    "resource.ledger.report_existing_pattern": "existing_pattern_reported",
    "resource.ledger.report_risk": "risk_reported",
    "resource.ledger.recommend_edit_point": "edit_point_recommended",
    "resource.ledger.recommend_validation": "validation_recommended",
    "resource.ledger.recommend_domain_validation": "domain_validation_recommended",
    "resource.ledger.report_limitation": "limitation_reported",
    "resource.ledger.record_provider_diagnostic": "provider_diagnostic_recorded",
  };
  return mapping[toolId] ?? null;
}

export function compileNodeResourceLedgerToolOutput(input: {
  toolId: string;
  volatileInput?: unknown;
  metadata?: unknown;
}): NodeResourceLedgerAppendResult {
  const data = mergedRecord(input);
  if (input.toolId === "resource.ledger.open") {
    return openNodeResourceLedger({
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
      nodeResourceDemandSessionRef:
        typeof data.nodeResourceDemandSessionRef === "string" ? data.nodeResourceDemandSessionRef : null,
      capabilityId: typeof data.capabilityId === "string" ? data.capabilityId : null,
      evidenceMode: strings(data.evidenceMode, 12, 120),
      targetCommitmentIds: strings(data.targetCommitmentIds, 80, 180),
      authorityScope: strings(data.authorityScope, 160, 520),
    });
  }
  const ledger = ledgerFromSources(input);
  if (!ledger) {
    return openNodeResourceLedger({
      runtimeJobId: typeof data.runtimeJobId === "string" ? data.runtimeJobId : null,
      workflowId: typeof data.workflowId === "string" ? data.workflowId : null,
      graphId: typeof data.graphId === "string" ? data.graphId : null,
      consumerNodeId: typeof data.consumerNodeId === "string" ? data.consumerNodeId : null,
      capabilityId: typeof data.capabilityId === "string" ? data.capabilityId : null,
      evidenceMode: strings(data.evidenceMode, 12, 120),
      authorityScope: strings(data.authorityScope, 160, 520),
    });
  }
  if (input.toolId === "resource.ledger.project_manifest") {
    return {
      status: "succeeded",
      ledger,
      entry: null,
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary: `Projected node resource ledger manifest for ${ledger.consumerNodeId}.`,
      reasonCodes: ["node_resource_ledger_manifest_projected"],
      metadata: {
        ...asRecord(boundedMetadata({ ledger })),
        nodeResourceLedgerProjection: projectNodeResourceLedger({ ledger }),
      } as JsonValue,
    };
  }
  if (input.toolId === "resource.ledger.hydrate_entry") {
    return {
      status: "succeeded",
      ledger,
      entry: null,
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary:
        "Prepared node resource ledger hydration request from manifest refs; runtime must hydrate payload bodies by ref.",
      reasonCodes: ["node_resource_ledger_hydration_request_projected"],
      metadata: {
        ...asRecord(boundedMetadata({ ledger })),
        nodeResourceLedgerHydrationRequest: projectNodeResourceLedger({ ledger }).hydrationRequest,
      } as JsonValue,
    };
  }
  if (input.toolId === "resource.ledger.close") {
    return closeNodeResourceLedger({
      ledger,
      closeReason: typeof data.closeReason === "string" ? data.closeReason : null,
    });
  }
  const entryKind = entryKindForTool(input.toolId);
  if (!entryKind) {
    return {
      status: "needs_review",
      ledger,
      entry: null,
      outputRef: ledger.ledgerRef,
      outputHash: ledger.ledgerHash,
      outputSummary: `Unsupported node resource ledger tool: ${bounded(input.toolId, 180)}.`,
      reasonCodes: ["node_resource_ledger_unsupported_tool"],
      metadata: boundedMetadata({ ledger }),
    };
  }
  const providerDiagnosticRecord = asRecord(data.providerDiagnostic);
  return appendNodeResourceLedgerEntry({
    ledger,
    entryKind,
    sourceRequestRef: typeof data.sourceRequestRef === "string" ? data.sourceRequestRef : null,
    sourceFulfillmentRef:
      typeof data.sourceFulfillmentRef === "string" ? data.sourceFulfillmentRef : null,
    contentRefs: strings(data.contentRefs ?? data.refs ?? data.providedContextRefs, 160, 620),
    fileRef: typeof data.fileRef === "string" ? data.fileRef : null,
    symbolRef: typeof data.symbolRef === "string" ? data.symbolRef : null,
    testRef: typeof data.testRef === "string" ? data.testRef : null,
    memoryPackRef: typeof data.memoryPackRef === "string" ? data.memoryPackRef : null,
    lineStart: typeof data.lineStart === "number" ? data.lineStart : null,
    lineEnd: typeof data.lineEnd === "number" ? data.lineEnd : null,
    summary: typeof data.summary === "string" ? data.summary : null,
    details: typeof data.details === "string" ? data.details : null,
    expectedUse: typeof data.expectedUse === "string" ? data.expectedUse : null,
    limitationSeverity:
      data.limitationSeverity === "low" ||
      data.limitationSeverity === "medium" ||
      data.limitationSeverity === "high" ||
      data.limitationSeverity === "blocking"
        ? data.limitationSeverity
        : null,
    providerDiagnostic:
      Object.keys(providerDiagnosticRecord).length > 0
        ? (providerDiagnosticRecord as Partial<NodeContextProviderDiagnosticShape>)
        : null,
    reasonCodes: strings(data.reasonCodes, 160, 220),
  });
}

export function appendNodeResourceDemandFulfillmentToLedger(input: {
  ledger: NodeResourceLedger;
  session?: NodeResourceDemandSession | null;
  request?: NodeResourceDemandRequest | null;
  fulfillment: NodeResourceDemandFulfillment;
  summary?: string | null;
  details?: string | null;
  expectedUse?: string | null;
}): NodeResourceLedgerAppendResult {
  const fulfillment = NodeResourceDemandFulfillmentSchema.parse(input.fulfillment);
  const request = input.request ? NodeResourceDemandRequestSchema.parse(input.request) : null;
  const session = input.session ? NodeResourceDemandSessionSchema.parse(input.session) : null;
  const kindByRequest: Record<string, NodeResourceLedgerEntryKind> = {
    file_window: "file_window_opened",
    symbol: "symbol_inspected",
    related_tests: "related_test_found",
    memory_pack: "memory_pack_opened",
    resource_ref: "resource_ref_opened",
    source_prompt_section: "source_prompt_section_opened",
    owner_constraint: "owner_constraint_reported",
    project_fact: "project_fact_reported",
    research_brief: "research_brief_reported",
    planning_capsule: "planning_capsule_reported",
    action_graph_candidate: "action_graph_candidate_reported",
    compile_readiness_input: "compile_readiness_recommended",
    human_decision_ref: "human_decision_reported",
    workflow_manifest_ref: "relevant_resource_reported",
    proof_artifact_ref: "relevant_resource_reported",
    closeout_ref: "closeout_ref_reported",
  };
  return appendNodeResourceLedgerEntry({
    ledger: input.ledger,
    entryKind: kindByRequest[fulfillment.requestKind] ?? "resource_ref_opened",
    sourceRequestRef: request?.requestRef ?? fulfillment.requestRef,
    sourceFulfillmentRef: fulfillment.fulfillmentRef,
    contentRefs: [...fulfillment.providedRefs, ...fulfillment.boundedSnapshotRefs],
    fileRef:
      fulfillment.requestKind === "file_window"
        ? request?.fileRef ?? fulfillment.providedRefs[0] ?? null
        : null,
    symbolRef: fulfillment.requestKind === "symbol" ? request?.symbolRef ?? null : null,
    testRef:
      fulfillment.requestKind === "related_tests" ? fulfillment.providedRefs[0] ?? null : null,
    memoryPackRef:
      fulfillment.requestKind === "memory_pack" ? fulfillment.providedRefs[0] ?? null : null,
    summary:
      input.summary ??
      `Context demand ${fulfillment.requestKind} fulfilled for ${session?.consumerNodeId ?? fulfillment.consumerNodeId}.`,
    details: input.details ?? "",
    expectedUse: input.expectedUse ?? request?.expectedUse ?? "",
    reasonCodes: [
      "node_resource_ledger_appended_from_node_resource_demand_fulfillment",
      `node_resource_ledger_${fulfillment.requestKind}_entry`,
    ],
  });
}

function payloadAttachmentSummary(input: {
  artifactType: string;
  uri: string;
  artifact: Awaited<ReturnType<NodeResourceLedgerArtifactRepository["attachRuntimeArtifactByContract"]>>;
}): NodeResourceLedgerPayloadAttachment {
  const metadata = asRecord(input.artifact.metadata);
  return {
    artifactType: input.artifactType,
    uri: input.uri,
    payloadRef: typeof metadata.payloadRef === "string" ? metadata.payloadRef : null,
    sha256: input.artifact.sha256,
    sizeBytes: input.artifact.sizeBytes,
    manifestByteCount: jsonByteCount(input.artifact.metadata),
  };
}

export async function persistNodeResourceLedgerPayloadArtifacts(input: {
  repository: NodeResourceLedgerArtifactRepository;
  ledger?: NodeResourceLedger | null;
  entry?: NodeResourceLedgerEntry | null;
  createdBy?: string | null;
}): Promise<NodeResourceLedgerPayloadPersistenceResult> {
  const ledger = input.ledger ? NodeResourceLedgerSchema.parse(input.ledger) : null;
  const entry = input.entry ? NodeResourceLedgerEntrySchema.parse(input.entry) : null;
  const attachments: NodeResourceLedgerPayloadAttachment[] = [];
  let ledgerArtifact: NodeResourceLedgerPayloadAttachment | null = null;
  let entryArtifact: NodeResourceLedgerPayloadAttachment | null = null;
  if (ledger) {
    const ledgerManifest = buildNodeResourceLedgerManifest(ledger);
    const artifact = await input.repository.attachRuntimeArtifactByContract({
      jobId: ledger.runtimeJobId,
      artifactType: NODE_RESOURCE_LEDGER_ARTIFACT_TYPE,
      uri: ledger.ledgerRef,
      payloadRef: ledger.ledgerPayloadRef.payloadRef,
      body: ledger as unknown as JsonValue,
      boundedSummary: `Node context ledger for ${ledger.consumerNodeId}.`,
      targetCommitmentIds: ledger.targetCommitmentIds,
      targetNodeIds: [ledger.consumerNodeId],
      resourcePacketKind: "node_resource_ledger",
      readinessStatus: ledger.status,
      reasonCodes: ledger.reasonCodes,
      inputCounts: {
        targetCommitmentIds: ledger.targetCommitmentIds.length,
        authorityScope: ledger.authorityScope.length,
      } as JsonValue,
      outputCounts: {
        entryRefs: ledger.entryRefs.length,
        limitationRefs: ledger.limitationRefs.length,
        providerDiagnosticRefs: ledger.providerDiagnosticRefs.length,
      } as JsonValue,
      maxBounds: {
        manifestBytes: NODE_RESOURCE_LEDGER_MANIFEST_MAX_BYTES,
        metadataBytes: NODE_RESOURCE_LEDGER_METADATA_MAX_BYTES,
      } as JsonValue,
      createdBy: input.createdBy ?? "node_resource_ledger_payload_persistence",
      metadata: {
        nodeResourceLedgerManifest: ledgerManifest as unknown as JsonValue,
        nodeResourceLedgerManifestByteCount: jsonByteCount(ledgerManifest),
        semanticQualityJudgedByDeterministicCode: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    ledgerArtifact = payloadAttachmentSummary({
      artifactType: NODE_RESOURCE_LEDGER_ARTIFACT_TYPE,
      uri: ledger.ledgerRef,
      artifact,
    });
    attachments.push(ledgerArtifact);
  }
  if (entry) {
    const entryManifest = buildNodeResourceLedgerEntryManifest(entry);
    const artifact = await input.repository.attachRuntimeArtifactByContract({
      jobId: entry.runtimeJobId,
      artifactType: NODE_RESOURCE_LEDGER_ENTRY_ARTIFACT_TYPE,
      uri: entry.entryRef,
      payloadRef: entry.entryPayloadRef.payloadRef,
      body: entry as unknown as JsonValue,
      boundedSummary: entry.summary,
      targetNodeIds: [entry.consumerNodeId],
      resourcePacketKind: "node_resource_ledger_entry",
      readinessStatus: entry.entryKind,
      reasonCodes: entry.reasonCodes,
      inputCounts: {
        contentRefs: entry.contentRefs.length,
      } as JsonValue,
      outputCounts: {
        entryManifestCount: 1,
      } as JsonValue,
      maxBounds: {
        manifestBytes: NODE_RESOURCE_LEDGER_ENTRY_MANIFEST_MAX_BYTES,
        metadataBytes: NODE_RESOURCE_LEDGER_METADATA_MAX_BYTES,
      } as JsonValue,
      createdBy: input.createdBy ?? "node_resource_ledger_payload_persistence",
      metadata: {
        nodeResourceLedgerEntryManifest: entryManifest as unknown as JsonValue,
        nodeResourceLedgerEntryManifestByteCount: jsonByteCount(entryManifest),
        semanticQualityJudgedByDeterministicCode: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
    entryArtifact = payloadAttachmentSummary({
      artifactType: NODE_RESOURCE_LEDGER_ENTRY_ARTIFACT_TYPE,
      uri: entry.entryRef,
      artifact,
    });
    attachments.push(entryArtifact);
  }
  return {
    artifactKind: "node_resource_ledger_payload_persistence",
    schemaVersion: NODE_RESOURCE_LEDGER_SCHEMA_VERSION,
    status: "succeeded",
    ledgerArtifact,
    entryArtifact,
    payloadRefs: attachments
      .map((attachment) => attachment.payloadRef)
      .filter((payloadRef): payloadRef is string => Boolean(payloadRef)),
    payloadCount: attachments.length,
    largestPayloadBytes: Math.max(0, ...attachments.map((attachment) => attachment.sizeBytes ?? 0)),
    largestMetadataBytes: Math.max(
      0,
      ...attachments.map((attachment) => attachment.manifestByteCount),
    ),
    reasonCodes: ["node_resource_ledger_payload_artifacts_persisted"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
