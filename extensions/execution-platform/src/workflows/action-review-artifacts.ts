import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-types.ts";

export const ACTION_REVIEW_ARTIFACT_SCHEMA_VERSION =
  "execution-platform.action-review-artifact.v1" as const;
export const WORKER_EDIT_REVIEW_ARTIFACT_SCHEMA_VERSION =
  "execution-platform.worker-edit-review-artifact.v1" as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const nullableString = (max: number) => z.string().trim().max(max).nullable().default(null);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

const RawStorageFlagsSchema = z
  .object({
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false).default(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export const ActionReviewStatusSchema = z.enum([
  "applied",
  "rolled_back",
  "rejected_by_policy",
  "failed_validation",
  "failed_stale_patch",
  "needs_review",
  "compensated",
  "blocked",
]);

export const ActionReviewDecisionSchema = z.enum([
  "pending_model_or_human_review",
  "accepted",
  "needs_repair",
  "rejected",
]);

export const ActionReviewArtifactSchema = z
  .object({
    artifactKind: z.literal("action_review_artifact"),
    schemaVersion: z.literal(ACTION_REVIEW_ARTIFACT_SCHEMA_VERSION),
    artifactRef: boundedString(360),
    artifactHash: boundedString(140),
    runtimeJobId: nullableString(180),
    workflowId: nullableString(180),
    graphId: nullableString(180),
    branchId: nullableString(180),
    nodeId: nullableString(180),
    workerId: nullableString(180),
    roleId: nullableString(180),
    capabilityId: nullableString(180),
    taskId: nullableString(220),
    actionKind: boundedString(160),
    actionStatus: ActionReviewStatusSchema,
    reviewState: ActionReviewDecisionSchema.default("pending_model_or_human_review"),
    authorityScopeRefs: stringList(80),
    nodeExecutionContractRef: nullableString(360),
    nodeExecutionContractHash: nullableString(160),
    sourceMaterialPacketRef: nullableString(360),
    sourceMaterialPacketHash: nullableString(160),
    sourceMaterialSelectionRef: nullableString(360),
    sourceMaterialSelectionHash: nullableString(160),
    validationRefs: stringList(80),
    evidenceClaimRefs: stringList(80),
    rollbackMode: z
      .enum([
        "none",
        "not_applicable",
        "rollback_available",
        "rolled_back",
        "compensation_required",
        "compensated",
      ])
      .default("none"),
    rollbackResultRefs: stringList(40),
    reviewDecisionRefs: stringList(40),
    payloadRefs: stringList(80),
    payloadHashes: stringList(80, 160),
    payloadCounts: z.record(z.string(), z.number().int().min(0).max(1_000_000)).default({}),
    boundedSummary: boundedString(1_500),
    reasonCodes: stringList(80, 220),
    storagePolicy: RawStorageFlagsSchema,
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false).default(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type ActionReviewArtifact = z.infer<typeof ActionReviewArtifactSchema>;
export type ActionReviewStatus = z.infer<typeof ActionReviewStatusSchema>;

const WorkerEditOperationReviewSchema = z
  .object({
    operationId: boundedString(220),
    path: boundedString(420),
    operation: boundedString(80),
    occurrenceIndex: z.number().int().min(0).nullable().default(null),
    startLine: z.number().int().min(1).nullable().default(null),
    endLine: z.number().int().min(1).nullable().default(null),
    rationale: nullableString(500),
    oldTextHash: nullableString(160),
    newTextHash: nullableString(160),
    contentHash: nullableString(160),
    unifiedDiffHash: nullableString(160),
    oldTextPreview: nullableString(900),
    newTextPreview: nullableString(900),
    contentPreview: nullableString(900),
    unifiedDiffPreview: nullableString(1_500),
    contextBeforePreview: nullableString(500),
    contextAfterPreview: nullableString(500),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export const WorkerEditReviewArtifactSchema = ActionReviewArtifactSchema.extend({
  artifactKind: z.literal("worker_edit_review_artifact"),
  schemaVersion: z.literal(WORKER_EDIT_REVIEW_ARTIFACT_SCHEMA_VERSION),
  actionKind: z.literal("coding.worker_edit"),
  changedFileRefs: stringList(80),
  beforeSnapshotRefs: stringList(80),
  afterSnapshotRefs: stringList(80),
  beforeAfterHashes: stringList(80, 180),
  diffHash: nullableString(180),
  boundedUnifiedDiffExcerpt: nullableString(24_000),
  boundedDiffPayloadRef: nullableString(360),
  diffPartPayloadRefs: stringList(80),
  editTransactionRefs: stringList(40),
  rejectedOperationRefs: stringList(80),
  rejectedOperationReasonCodes: stringList(80, 220),
  operations: z.array(WorkerEditOperationReviewSchema).max(80).default([]),
}).strict();

export type WorkerEditReviewArtifact = z.infer<typeof WorkerEditReviewArtifactSchema>;

const FALSE_STORAGE_FLAGS = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function uniqueStrings(values: Array<string | null | undefined>, max = 80): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => value.trim())
    .slice(0, max);
}

function bounded(value: string | null | undefined, max = 1_000): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 16)}\n...[truncated]`;
}

function withHash<T extends { artifactRef?: string; artifactHash?: string }>(
  prefix: string,
  body: Omit<T, "artifactRef" | "artifactHash">,
): T {
  const seedHash = sha256(JSON.stringify(body));
  const artifactRef = `${prefix}://${seedHash.slice(0, 24)}`;
  const artifactHash = `sha256:${sha256(JSON.stringify({ ...body, artifactRef }))}`;
  return { ...body, artifactRef, artifactHash } as T;
}

export function buildActionReviewArtifact(
  input: Omit<
    ActionReviewArtifact,
    | "artifactRef"
    | "artifactHash"
    | "artifactKind"
    | "schemaVersion"
    | "storagePolicy"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawTranscriptStored"
    | "rawProviderLogStored"
    | "rawToolLogStored"
    | "rawCommandLogStored"
    | "rawDbRowsStored"
    | "secretsStored"
  >,
): ActionReviewArtifact {
  return ActionReviewArtifactSchema.parse(
    withHash<ActionReviewArtifact>("action-review", {
      ...input,
      artifactKind: "action_review_artifact",
      schemaVersion: ACTION_REVIEW_ARTIFACT_SCHEMA_VERSION,
      authorityScopeRefs: uniqueStrings(input.authorityScopeRefs),
      validationRefs: uniqueStrings(input.validationRefs),
      evidenceClaimRefs: uniqueStrings(input.evidenceClaimRefs),
      rollbackResultRefs: uniqueStrings(input.rollbackResultRefs),
      reviewDecisionRefs: uniqueStrings(input.reviewDecisionRefs),
      payloadRefs: uniqueStrings(input.payloadRefs),
      payloadHashes: uniqueStrings(input.payloadHashes),
      reasonCodes: uniqueStrings(input.reasonCodes),
      storagePolicy: FALSE_STORAGE_FLAGS,
      ...FALSE_STORAGE_FLAGS,
    }),
  );
}

export function renderWorkerEditDiffExcerpt(input: {
  operations: Array<{
    path: string;
    operation: string;
    oldTextPreview?: string | null;
    newTextPreview?: string | null;
    contentPreview?: string | null;
    unifiedDiffPreview?: string | null;
    startLine?: number | null;
    endLine?: number | null;
  }>;
  changedFileRefs: string[];
  maxChars?: number;
}): string | null {
  const sections = input.operations.slice(0, 24).map((operation) => {
    if (operation.unifiedDiffPreview?.trim()) {
      return operation.unifiedDiffPreview.trim();
    }
    const header = [
      `--- ${operation.path}`,
      `+++ ${operation.path}`,
      `@@ ${operation.operation}${operation.startLine ? `:${operation.startLine}` : ""}${
        operation.endLine ? `-${operation.endLine}` : ""
      } @@`,
    ];
    const before = operation.oldTextPreview ?? "";
    const after = operation.newTextPreview ?? operation.contentPreview ?? "";
    return [
      ...header,
      ...before
        .split("\n")
        .slice(0, 24)
        .map((line) => `- ${line}`),
      ...after
        .split("\n")
        .slice(0, 24)
        .map((line) => `+ ${line}`),
    ].join("\n");
  });
  if (sections.length === 0 && input.changedFileRefs.length === 0) {
    return null;
  }
  const body =
    sections.length > 0
      ? sections.join("\n\n")
      : input.changedFileRefs.map((ref) => `changed-file-ref:${ref}`).join("\n");
  return bounded(body, input.maxChars ?? 24_000);
}

export function buildWorkerEditReviewArtifact(
  input: Omit<
    WorkerEditReviewArtifact,
    | "artifactRef"
    | "artifactHash"
    | "artifactKind"
    | "schemaVersion"
    | "actionKind"
    | "storagePolicy"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawTranscriptStored"
    | "rawProviderLogStored"
    | "rawToolLogStored"
    | "rawCommandLogStored"
    | "rawDbRowsStored"
    | "secretsStored"
  >,
): WorkerEditReviewArtifact {
  const operations = input.operations.slice(0, 80);
  const boundedUnifiedDiffExcerpt =
    input.boundedUnifiedDiffExcerpt ??
    renderWorkerEditDiffExcerpt({
      operations,
      changedFileRefs: input.changedFileRefs,
    });
  const base = {
    ...input,
    artifactKind: "worker_edit_review_artifact" as const,
    schemaVersion: WORKER_EDIT_REVIEW_ARTIFACT_SCHEMA_VERSION,
    actionKind: "coding.worker_edit" as const,
    authorityScopeRefs: uniqueStrings(input.authorityScopeRefs),
    validationRefs: uniqueStrings(input.validationRefs),
    evidenceClaimRefs: uniqueStrings(input.evidenceClaimRefs),
    rollbackResultRefs: uniqueStrings(input.rollbackResultRefs),
    reviewDecisionRefs: uniqueStrings(input.reviewDecisionRefs),
    payloadRefs: uniqueStrings(input.payloadRefs),
    payloadHashes: uniqueStrings(input.payloadHashes),
    reasonCodes: uniqueStrings(input.reasonCodes),
    changedFileRefs: uniqueStrings(input.changedFileRefs),
    beforeSnapshotRefs: uniqueStrings(input.beforeSnapshotRefs),
    afterSnapshotRefs: uniqueStrings(input.afterSnapshotRefs),
    beforeAfterHashes: uniqueStrings(input.beforeAfterHashes),
    diffPartPayloadRefs: uniqueStrings(input.diffPartPayloadRefs),
    editTransactionRefs: uniqueStrings(input.editTransactionRefs),
    rejectedOperationRefs: uniqueStrings(input.rejectedOperationRefs),
    rejectedOperationReasonCodes: uniqueStrings(input.rejectedOperationReasonCodes),
    boundedUnifiedDiffExcerpt,
    boundedDiffPayloadRef:
      input.boundedDiffPayloadRef ??
      (boundedUnifiedDiffExcerpt ? "inline://worker-edit-review/bounded-diff-excerpt" : null),
    storagePolicy: FALSE_STORAGE_FLAGS,
    ...FALSE_STORAGE_FLAGS,
  };
  const artifact = withHash<WorkerEditReviewArtifact>("worker-edit-review", base);
  return WorkerEditReviewArtifactSchema.parse({
    ...artifact,
    boundedDiffPayloadRef:
      artifact.boundedDiffPayloadRef === "inline://worker-edit-review/bounded-diff-excerpt"
        ? `${artifact.artifactRef}#bounded-diff-excerpt`
        : artifact.boundedDiffPayloadRef,
  });
}

export function actionReviewToolMetadata(input: {
  toolId: string;
  artifactRef?: string | null;
  reviewState?: string | null;
  reasonCodes?: string[];
}): Record<string, JsonValue> {
  return {
    actionReviewToolId: input.toolId,
    actionReviewArtifactRef: input.artifactRef ?? null,
    reviewState: input.reviewState ?? "pending_model_or_human_review",
    reasonCodes: uniqueStrings(input.reasonCodes ?? [], 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}
