import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "../runtime-job-repository.ts";

export type EditTransactionStatus =
  | "started"
  | "planned"
  | "applied"
  | "validated"
  | "evidence_emitted"
  | "closed"
  | "rolled_back"
  | "needs_review"
  | "failed";

export type EditTransactionPhase =
  | "start"
  | "read_file"
  | "plan"
  | "apply_patch"
  | "validate"
  | "repair"
  | "emit_evidence"
  | "rollback"
  | "close";

export type EditTransactionOperationKind =
  | "replace_text"
  | "replace_file"
  | "create_file"
  | "replace_range"
  | "patch";

export type EditTransactionOperation = {
  operationId: string;
  path: string;
  operation: EditTransactionOperationKind;
  oldText: string | null;
  newText: string | null;
  content: string | null;
  unifiedDiff: string | null;
  occurrenceIndex: number | null;
  contextBefore: string | null;
  contextAfter: string | null;
  startLine: number | null;
  endLine: number | null;
  rationale: string;
};

export type EditTransactionScope = {
  allowedFileRefs: string[];
  deniedFileRefs: string[];
  targetFileRefs: string[];
  targetCommitmentIds: string[];
};

export type EditTransactionFileSnapshot = {
  fileRef: string;
  snapshotRef: string;
  beforeHash: string;
  contentLength: number;
  existedBefore: boolean;
  rawContentStored: false;
};

export type EditTransactionApplyResult = {
  transactionRef: string;
  status: "succeeded" | "needs_review";
  changedFileRefs: string[];
  beforeAfterHashes: string[];
  rejectedOperations: Array<{
    operationId: string;
    fileRef: string;
    reasonCode: string;
    summary: string;
  }>;
  diffHash: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawToolLogStored: false;
};

export type EditTransactionValidationResult = {
  transactionRef: string;
  validationRefs: string[];
  status: "not_run" | "passed" | "needs_review";
  reasonCodes: string[];
};

export type EditTransactionEvidenceClaim = {
  commitmentId: string;
  evidenceRef: string;
  claimSummary: string;
  changedFileRefs: string[];
  validationRefs: string[];
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type EditTransactionRollbackResult = {
  transactionRef: string;
  status: "rolled_back" | "needs_review";
  restoredFileRefs: string[];
  failedFileRefs: string[];
  reasonCodes: string[];
};

export type EditTransactionCloseResult = {
  transactionRef: string;
  status: "closed" | "needs_review";
  reasonCodes: string[];
};

export type EditTransactionRecord = {
  artifactKind: "edit_transaction";
  transactionId: string;
  transactionRef: string;
  runtimeJobId: string | null;
  workflowId: string | null;
  graphId: string | null;
  nodeId: string | null;
  workerId: string;
  roleId: string;
  capabilityId: string | null;
  status: EditTransactionStatus;
  phase: EditTransactionPhase;
  createdAt: string;
  updatedAt: string;
  scope: EditTransactionScope;
  modelSlotRefs: string[];
  validationCommandRefs: string[];
  snapshots: EditTransactionFileSnapshot[];
  operations: EditTransactionOperation[];
  changedFileRefs: string[];
  rejectedOperationCount: number;
  validationRefs: string[];
  repairAttemptCount: number;
  evidenceClaimRefs: string[];
  rollbackRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type EditTransactionEngineInput = {
  runtimeJobId?: string | null;
  workflowId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  workerId: string;
  roleId: string;
  taskId: string;
  repoRoot: string;
  allowedFileRefs: string[];
  deniedFileRefs?: string[];
  targetFileRefs: string[];
  targetCommitmentIds?: string[];
  validationCommandRefs?: string[];
  capabilityId?: string | null;
  modelSlotRefs?: string[];
  now?: () => Date;
};

type SnapshotState = EditTransactionFileSnapshot & {
  fullPath: string;
  beforeContent: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max = 500): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: string[], max = 40): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function normalizeFileRef(fileRef: string): string {
  return fileRef.replaceAll("\\", "/").replace(/^\.\/+/u, "");
}

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

export class EditTransactionEngine {
  private readonly now: () => Date;
  private readonly snapshots = new Map<string, SnapshotState>();
  private readonly operations: EditTransactionOperation[] = [];
  private readonly changedFileRefs: string[] = [];
  private readonly rejectedOperations: EditTransactionApplyResult["rejectedOperations"] = [];
  private readonly validationRefs: string[] = [];
  private readonly evidenceClaims: EditTransactionEvidenceClaim[] = [];
  private readonly rollbackRefs: string[] = [];
  private readonly reasonCodes: string[] = ["edit_transaction_engine_started"];
  private readonly transactionId: string;
  private status: EditTransactionStatus = "started";
  private phase: EditTransactionPhase = "start";
  private repairAttemptCount = 0;
  private readonly createdAt: string;

  constructor(private readonly input: EditTransactionEngineInput) {
    this.now = input.now ?? (() => new Date());
    this.createdAt = this.now().toISOString();
    this.transactionId = `edit-tx-${sha256(
      [
        input.runtimeJobId ?? "runtime-job-unknown",
        input.graphId ?? "graph-unknown",
        input.nodeId ?? "node-unknown",
        input.taskId,
        input.workerId,
        this.createdAt,
      ].join(":"),
    ).slice(0, 16)}`;
  }

  get transactionRef(): string {
    return `edit-transaction://${this.transactionId}`;
  }

  start(): EditTransactionRecord {
    this.phase = "start";
    this.status = "started";
    return this.snapshotRecord();
  }

  async readFile(fileRef: string): Promise<EditTransactionFileSnapshot> {
    const normalized = normalizeFileRef(fileRef);
    const fullPath = this.assertReadable(normalized);
    const content = await readFile(fullPath, "utf8");
    return this.recordSnapshot({
      fileRef: normalized,
      fullPath,
      beforeContent: content,
      existedBefore: true,
    });
  }

  recordPlan(operations: EditTransactionOperation[]): EditTransactionRecord {
    this.phase = "plan";
    this.status = "planned";
    this.operations.push(...operations);
    this.reasonCodes.push("edit_transaction_plan_recorded");
    return this.snapshotRecord();
  }

  async applyPatch(operations: EditTransactionOperation[]): Promise<EditTransactionApplyResult> {
    this.phase = "apply_patch";
    const rejectedCountBefore = this.rejectedOperations.length;
    const changedCountBefore = this.changedFileRefs.length;
    if (operations.length === 0) {
      this.status = "needs_review";
      this.reasonCodes.push("edit_transaction_apply_no_operations");
      return this.applyResult([], rejectedCountBefore, changedCountBefore);
    }
    this.operations.push(...operations);
    const beforeAfterHashes: string[] = [];
    for (const operation of operations.slice(0, 8)) {
      try {
        const fullPath = this.assertWritable(operation.path);
        if (operation.operation === "replace_text") {
          if (!operation.oldText || operation.newText === null) {
            this.rejectOperation(operation, "replace_text_missing_old_or_new");
            continue;
          }
          const before = await readFile(fullPath, "utf8");
          this.recordSnapshot({
            fileRef: normalizeFileRef(operation.path),
            fullPath,
            beforeContent: before,
            existedBefore: true,
          });
          const replacement = replaceTextWithBoundedDisambiguation({
            content: before,
            oldText: operation.oldText,
            newText: operation.newText,
            occurrenceIndex: operation.occurrenceIndex,
            contextBefore: operation.contextBefore,
            contextAfter: operation.contextAfter,
          });
          if (!replacement.ok) {
            this.rejectOperation(operation, replacement.reasonCode);
            continue;
          }
          await writeFile(fullPath, replacement.content, "utf8");
          this.changedFileRefs.push(normalizeFileRef(operation.path));
          beforeAfterHashes.push(
            `${sha256(before).slice(0, 12)}:${sha256(replacement.content).slice(0, 12)}`,
          );
          continue;
        }
        if (operation.operation === "replace_range") {
          if (
            operation.content === null ||
            operation.startLine === null ||
            operation.endLine === null
          ) {
            this.rejectOperation(operation, "replace_range_missing_lines_or_content");
            continue;
          }
          const before = await readFile(fullPath, "utf8");
          this.recordSnapshot({
            fileRef: normalizeFileRef(operation.path),
            fullPath,
            beforeContent: before,
            existedBefore: true,
          });
          const replacement = replaceLineRange({
            content: before,
            startLine: operation.startLine,
            endLine: operation.endLine,
            replacement: operation.content,
          });
          if (!replacement.ok) {
            this.rejectOperation(operation, replacement.reasonCode);
            continue;
          }
          await writeFile(fullPath, replacement.content, "utf8");
          this.changedFileRefs.push(normalizeFileRef(operation.path));
          beforeAfterHashes.push(
            `${sha256(before).slice(0, 12)}:${sha256(replacement.content).slice(0, 12)}`,
          );
          continue;
        }
        if (operation.operation === "replace_file") {
          if (operation.content === null) {
            this.rejectOperation(operation, "replace_file_missing_content");
            continue;
          }
          const before = await readFile(fullPath, "utf8").catch(() => "");
          this.recordSnapshot({
            fileRef: normalizeFileRef(operation.path),
            fullPath,
            beforeContent: before,
            existedBefore: before.length > 0,
          });
          await mkdir(path.dirname(fullPath), { recursive: true });
          await writeFile(fullPath, operation.content, "utf8");
          this.changedFileRefs.push(normalizeFileRef(operation.path));
          beforeAfterHashes.push(
            `${sha256(before).slice(0, 12)}:${sha256(operation.content).slice(0, 12)}`,
          );
          continue;
        }
        if (operation.operation === "create_file") {
          if (operation.content === null) {
            this.rejectOperation(operation, "create_file_missing_content");
            continue;
          }
          const existed = await stat(fullPath)
            .then(() => true)
            .catch(() => false);
          if (existed) {
            this.rejectOperation(operation, "create_file_already_exists");
            continue;
          }
          await mkdir(path.dirname(fullPath), { recursive: true });
          this.recordSnapshot({
            fileRef: normalizeFileRef(operation.path),
            fullPath,
            beforeContent: "",
            existedBefore: false,
          });
          await writeFile(fullPath, operation.content, "utf8");
          this.changedFileRefs.push(normalizeFileRef(operation.path));
          beforeAfterHashes.push(`new:${sha256(operation.content).slice(0, 12)}`);
          continue;
        }
        this.rejectOperation(operation, "patch_operation_not_runtime_supported");
      } catch (error) {
        this.rejectOperation(
          operation,
          error instanceof Error ? error.message : `edit_transaction_apply_error:${String(error)}`,
        );
      }
    }
    const batchRejectedCount = this.rejectedOperations.length - rejectedCountBefore;
    const batchChangedCount = this.changedFileRefs.length - changedCountBefore;
    this.status = batchChangedCount > 0 && batchRejectedCount === 0 ? "applied" : "needs_review";
    this.reasonCodes.push(
      this.status === "applied"
        ? "edit_transaction_apply_completed"
        : "edit_transaction_apply_needs_review",
    );
    return this.applyResult(beforeAfterHashes, rejectedCountBefore, changedCountBefore);
  }

  recordValidation(validationRefs: string[], passed: boolean): EditTransactionValidationResult {
    this.phase = "validate";
    this.validationRefs.push(...validationRefs);
    this.status = passed ? "validated" : "needs_review";
    this.reasonCodes.push(
      passed ? "edit_transaction_validation_passed" : "edit_transaction_validation_needs_review",
    );
    return {
      transactionRef: this.transactionRef,
      validationRefs: uniqueStrings(this.validationRefs),
      status: passed ? "passed" : "needs_review",
      reasonCodes: this.reasonCodes.slice(-8),
    };
  }

  recordRepairAttempt(): EditTransactionRecord {
    this.phase = "repair";
    this.repairAttemptCount += 1;
    this.reasonCodes.push("edit_transaction_repair_attempt_recorded");
    return this.snapshotRecord();
  }

  emitEvidence(claims: EditTransactionEvidenceClaim[]): EditTransactionRecord {
    this.phase = "emit_evidence";
    this.evidenceClaims.push(...claims);
    this.status = claims.length > 0 ? "evidence_emitted" : "needs_review";
    this.reasonCodes.push(
      claims.length > 0 ? "edit_transaction_evidence_emitted" : "edit_transaction_evidence_missing",
    );
    return this.snapshotRecord();
  }

  async rollback(fileRefs?: string[]): Promise<EditTransactionRollbackResult> {
    this.phase = "rollback";
    const refs = uniqueStrings(fileRefs?.length ? fileRefs : [...this.snapshots.keys()], 40);
    const restoredFileRefs: string[] = [];
    const failedFileRefs: string[] = [];
    for (const fileRef of refs) {
      const snapshot = this.snapshots.get(fileRef);
      if (!snapshot) {
        failedFileRefs.push(fileRef);
        continue;
      }
      try {
        await mkdir(path.dirname(snapshot.fullPath), { recursive: true });
        await writeFile(snapshot.fullPath, snapshot.beforeContent, "utf8");
        restoredFileRefs.push(fileRef);
      } catch {
        failedFileRefs.push(fileRef);
      }
    }
    const rollbackRef = `edit-transaction-rollback://${sha256(
      `${this.transactionRef}:${restoredFileRefs.join(":")}:${failedFileRefs.join(":")}`,
    ).slice(0, 16)}`;
    this.rollbackRefs.push(rollbackRef);
    this.status = failedFileRefs.length > 0 ? "needs_review" : "rolled_back";
    this.reasonCodes.push(
      failedFileRefs.length > 0
        ? "edit_transaction_rollback_needs_review"
        : "edit_transaction_rollback_completed",
    );
    return {
      transactionRef: this.transactionRef,
      status: this.status === "rolled_back" ? "rolled_back" : "needs_review",
      restoredFileRefs,
      failedFileRefs,
      reasonCodes: this.reasonCodes.slice(-8),
    };
  }

  close(): EditTransactionCloseResult {
    this.phase = "close";
    const hasChanges = uniqueStrings(this.changedFileRefs).length > 0;
    const hasEvidence = this.evidenceClaims.length > 0;
    const hasAcceptedNoOpEvidence =
      !hasChanges &&
      hasEvidence &&
      this.validationRefs.length > 0 &&
      this.operations.length > 0 &&
      this.rejectedOperations.some(
        (operation) =>
          operation.reasonCode === "replace_text_occurrence_count_0" ||
          operation.reasonCode === "create_file_already_exists" ||
          operation.reasonCode.startsWith("replace_range_"),
      );
    if ((hasChanges || hasAcceptedNoOpEvidence) && hasEvidence && this.status !== "rolled_back") {
      this.status = "closed";
      this.reasonCodes.push(
        hasChanges ? "edit_transaction_closed" : "edit_transaction_noop_evidence_closed",
      );
      return {
        transactionRef: this.transactionRef,
        status: "closed",
        reasonCodes: this.reasonCodes.slice(-8),
      };
    }
    this.status = "needs_review";
    this.reasonCodes.push("edit_transaction_close_missing_required_evidence");
    return {
      transactionRef: this.transactionRef,
      status: "needs_review",
      reasonCodes: this.reasonCodes.slice(-8),
    };
  }

  snapshotRecord(): EditTransactionRecord {
    return {
      artifactKind: "edit_transaction",
      transactionId: this.transactionId,
      transactionRef: this.transactionRef,
      runtimeJobId: this.input.runtimeJobId ?? null,
      workflowId: this.input.workflowId ?? null,
      graphId: this.input.graphId ?? null,
      nodeId: this.input.nodeId ?? null,
      workerId: this.input.workerId,
      roleId: this.input.roleId,
      capabilityId: this.input.capabilityId ?? null,
      status: this.status,
      phase: this.phase,
      createdAt: this.createdAt,
      updatedAt: this.now().toISOString(),
      scope: {
        allowedFileRefs: uniqueStrings(this.input.allowedFileRefs, 40),
        deniedFileRefs: uniqueStrings(this.input.deniedFileRefs ?? [], 40),
        targetFileRefs: uniqueStrings(this.input.targetFileRefs, 40),
        targetCommitmentIds: uniqueStrings(this.input.targetCommitmentIds ?? [], 40),
      },
      modelSlotRefs: uniqueStrings(this.input.modelSlotRefs ?? [], 20),
      validationCommandRefs: uniqueStrings(this.input.validationCommandRefs ?? [], 20),
      snapshots: [...this.snapshots.values()].map((snapshot) => ({
        fileRef: snapshot.fileRef,
        snapshotRef: snapshot.snapshotRef,
        beforeHash: snapshot.beforeHash,
        contentLength: snapshot.contentLength,
        existedBefore: snapshot.existedBefore,
        rawContentStored: false,
      })),
      operations: this.operations.slice(0, 40),
      changedFileRefs: uniqueStrings(this.changedFileRefs, 40),
      rejectedOperationCount: this.rejectedOperations.length,
      validationRefs: uniqueStrings(this.validationRefs, 40),
      repairAttemptCount: this.repairAttemptCount,
      evidenceClaimRefs: uniqueStrings(
        this.evidenceClaims.map((claim) => claim.evidenceRef),
        40,
      ),
      rollbackRefs: uniqueStrings(this.rollbackRefs, 20),
      reasonCodes: uniqueStrings(this.reasonCodes, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private applyResult(
    beforeAfterHashes: string[],
    rejectedCountBefore: number,
    changedCountBefore: number,
  ): EditTransactionApplyResult {
    const changedFileRefs = uniqueStrings(this.changedFileRefs, 40);
    const batchChangedFileRefs = uniqueStrings(this.changedFileRefs.slice(changedCountBefore), 40);
    const batchRejectedOperations = this.rejectedOperations.slice(
      rejectedCountBefore,
      rejectedCountBefore + 20,
    );
    const diffHash =
      changedFileRefs.length > 0 ? `sha256:${sha256(beforeAfterHashes.join(":"))}` : null;
    return {
      transactionRef: this.transactionRef,
      status:
        batchChangedFileRefs.length > 0 && batchRejectedOperations.length === 0
          ? "succeeded"
          : "needs_review",
      changedFileRefs,
      beforeAfterHashes,
      rejectedOperations: batchRejectedOperations,
      diffHash,
      reasonCodes: this.reasonCodes.slice(-20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    };
  }

  private rejectOperation(operation: EditTransactionOperation, reasonCode: string): void {
    this.rejectedOperations.push({
      operationId: operation.operationId,
      fileRef: normalizeFileRef(operation.path),
      reasonCode: bounded(reasonCode, 160),
      summary: `${bounded(reasonCode, 160)}:${bounded(operation.path, 180)}`,
    });
    this.reasonCodes.push(`edit_transaction_operation_rejected:${bounded(reasonCode, 120)}`);
  }

  private recordSnapshot(input: {
    fileRef: string;
    fullPath: string;
    beforeContent: string;
    existedBefore: boolean;
  }): EditTransactionFileSnapshot {
    const fileRef = normalizeFileRef(input.fileRef);
    const existing = this.snapshots.get(fileRef);
    if (existing) {
      return existing;
    }
    const snapshot: SnapshotState = {
      fileRef,
      fullPath: input.fullPath,
      snapshotRef: `edit-transaction-snapshot://${this.transactionId}/${sha256(
        `${fileRef}:${input.beforeContent.length}:${input.beforeContent}`,
      ).slice(0, 16)}`,
      beforeHash: `sha256:${sha256(input.beforeContent)}`,
      contentLength: input.beforeContent.length,
      existedBefore: input.existedBefore,
      beforeContent: input.beforeContent,
      rawContentStored: false,
    };
    this.snapshots.set(fileRef, snapshot);
    this.reasonCodes.push("edit_transaction_snapshot_recorded");
    return snapshot;
  }

  private assertReadable(fileRef: string): string {
    return assertFileRef({
      repoRoot: this.input.repoRoot,
      fileRef,
      allowedFileRefs: this.input.allowedFileRefs,
      deniedFileRefs: [],
    });
  }

  private assertWritable(fileRef: string): string {
    return assertFileRef({
      repoRoot: this.input.repoRoot,
      fileRef,
      allowedFileRefs: this.input.allowedFileRefs,
      deniedFileRefs: this.input.deniedFileRefs ?? [],
    });
  }
}

export function editTransactionRecordForMetadata(record: EditTransactionRecord): JsonValue {
  return jsonRecord({
    artifactKind: record.artifactKind,
    transactionId: record.transactionId,
    transactionRef: record.transactionRef,
    runtimeJobId: record.runtimeJobId,
    workflowId: record.workflowId,
    graphId: record.graphId,
    nodeId: record.nodeId,
    workerId: record.workerId,
    roleId: record.roleId,
    capabilityId: record.capabilityId,
    status: record.status,
    phase: record.phase,
    scope: record.scope as unknown as JsonValue,
    modelSlotRefs: record.modelSlotRefs,
    validationCommandRefs: record.validationCommandRefs,
    snapshotRefs: record.snapshots.map((snapshot) => snapshot.snapshotRef),
    changedFileRefs: record.changedFileRefs,
    validationRefs: record.validationRefs,
    repairAttemptCount: record.repairAttemptCount,
    evidenceClaimRefs: record.evidenceClaimRefs,
    rollbackRefs: record.rollbackRefs,
    reasonCodes: record.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });
}

function assertFileRef(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
  deniedFileRefs: string[];
}): string {
  const normalized = normalizeFileRef(input.fileRef);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`edit_transaction_file_ref_invalid:${bounded(input.fileRef, 160)}`);
  }
  const denied = input.deniedFileRefs.some(
    (deniedRef) =>
      normalized === deniedRef || (deniedRef.endsWith("/") && normalized.startsWith(deniedRef)),
  );
  if (denied) {
    throw new Error(`edit_transaction_file_ref_denied:${bounded(normalized, 160)}`);
  }
  const allowed = input.allowedFileRefs.some(
    (allowedRef) =>
      normalized === allowedRef || (allowedRef.endsWith("/") && normalized.startsWith(allowedRef)),
  );
  if (!allowed) {
    throw new Error(`edit_transaction_file_ref_out_of_scope:${bounded(normalized, 160)}`);
  }
  return path.join(input.repoRoot, normalized);
}

function replaceTextWithBoundedDisambiguation(input: {
  content: string;
  oldText: string;
  newText: string;
  occurrenceIndex: number | null;
  contextBefore: string | null;
  contextAfter: string | null;
}): { ok: true; content: string } | { ok: false; reasonCode: string } {
  const matches: number[] = [];
  let cursor = 0;
  while (cursor <= input.content.length) {
    const index = input.content.indexOf(input.oldText, cursor);
    if (index < 0) {
      break;
    }
    matches.push(index);
    cursor = index + Math.max(1, input.oldText.length);
  }
  if (matches.length === 0) {
    return { ok: false, reasonCode: "replace_text_occurrence_count_0" };
  }
  let candidates = matches;
  if (input.contextBefore?.trim()) {
    candidates = candidates.filter((index) =>
      input.content
        .slice(Math.max(0, index - input.contextBefore!.length - 2_000), index)
        .includes(input.contextBefore!),
    );
  }
  if (input.contextAfter?.trim()) {
    candidates = candidates.filter((index) =>
      input.content
        .slice(
          index + input.oldText.length,
          index + input.oldText.length + input.contextAfter!.length + 2_000,
        )
        .includes(input.contextAfter!),
    );
  }
  if (input.occurrenceIndex !== null) {
    if (input.occurrenceIndex < 0 || input.occurrenceIndex >= matches.length) {
      return {
        ok: false,
        reasonCode: `replace_text_occurrence_index_out_of_range_${matches.length}`,
      };
    }
    candidates = [matches[input.occurrenceIndex]!];
  }
  if (candidates.length !== 1) {
    return {
      ok: false,
      reasonCode: `replace_text_ambiguous_occurrences_${matches.length}_requires_occurrence_index_or_context`,
    };
  }
  const index = candidates[0]!;
  return {
    ok: true,
    content: `${input.content.slice(0, index)}${input.newText}${input.content.slice(index + input.oldText.length)}`,
  };
}

function replaceLineRange(input: {
  content: string;
  startLine: number;
  endLine: number;
  replacement: string;
}): { ok: true; content: string } | { ok: false; reasonCode: string } {
  const lines = input.content.split("\n");
  if (input.startLine < 1 || input.endLine < input.startLine || input.endLine > lines.length) {
    return {
      ok: false,
      reasonCode: `replace_range_invalid_line_bounds_${input.startLine}_${input.endLine}`,
    };
  }
  const replacementLines = input.replacement.endsWith("\n")
    ? input.replacement.slice(0, -1).split("\n")
    : input.replacement.split("\n");
  return {
    ok: true,
    content: [
      ...lines.slice(0, input.startLine - 1),
      ...replacementLines,
      ...lines.slice(input.endLine),
    ].join("\n"),
  };
}
