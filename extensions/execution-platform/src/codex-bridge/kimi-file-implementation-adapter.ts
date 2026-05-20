import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSON5 from "json5";
import { z } from "zod";
import {
  buildImplementationTaskPacket,
  type ImplementationTaskPacket,
} from "../workflows/mission-work-packets.ts";

const execFileAsync = promisify(execFile);

export type KimiPatchModelClient = {
  proposeFileEdits(input: {
    modelRef: string;
    providerPath: string;
    taskSummary: string;
    implementationTaskPacket?: ImplementationTaskPacket;
    allowedFileRefs: string[];
    fileSnapshots: Array<{
      path: string;
      contentHash: string;
      boundedContent: string;
      truncated: boolean;
    }>;
    contextPackRefs: string[];
    expandedContextRefs: string[];
    validationCommandRefs: string[];
    previousFailureSummary?: string;
    attempt: number;
    maxOutputTokens: number;
    timeoutMs: number;
    maxProviderAttempts?: number;
  }): Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type KimiValidationRunner = {
  run(commandRef: string): Promise<{
    validationRef: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
  }>;
};

export type KimiContextExpansionRequest = {
  requestId: string;
  requestedFileRefs: string[];
  reason: string;
  commitmentIds: string[];
  status: "requested" | "provided" | "denied";
  providedContextRefs: string[];
  deniedReasonCode: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type KimiEditPlanStep = {
  stepId: string;
  objective: string;
  targetFileRefs: string[];
  validationExpectation: string | null;
  rollbackBoundary: "step" | "plan";
  commitmentIdsAdvanced: string[];
};

export type KimiEvidenceClaim = {
  commitmentId: string;
  evidenceRef: string;
  claimSummary: string;
  changedFileRefs: string[];
  validationRefs: string[];
  limitations: string[];
  confidence: "low" | "medium" | "high";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type KimiFileImplementationAdapterInput = {
  microtaskId?: string;
  microtaskTitle?: string;
  exactEditObjective?: string;
  acceptanceCriteria?: string[];
  targetFileRefs?: string[];
  taskSummary: string;
  implementationTaskPacket?: ImplementationTaskPacket;
  repoRoot: string;
  allowedFileRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  targetCommitmentIds?: string[];
  contextExpansion?: {
    maxRequests?: number;
    maxFilesPerRequest?: number;
    provider?: (request: {
      requestId: string;
      requestedFileRefs: string[];
      reason: string;
    }) => Promise<{
      providedContextRefs: string[];
      deniedReasonCode?: string | null;
    }>;
  };
  budgetPolicy: {
    modelRef?: string;
    providerPath?: string;
    maxOutputTokens: number;
    timeoutMs: number;
    maxAttempts?: number;
  };
};

export type KimiPatchRejectionStage =
  | "provider_no_content"
  | "json_parse"
  | "schema_parse"
  | "normalization"
  | "scope_check"
  | "patch_apply"
  | "no_changed_files"
  | "validation";

export type KimiPatchSchemaFailureCategory =
  | "no_response"
  | "no_json_object"
  | "malformed_json"
  | "invalid_schema_version"
  | "invalid_status"
  | "missing_file_edits"
  | "invalid_file_edit"
  | "invalid_validation_refs"
  | "invalid_limitations"
  | "raw_storage_claimed"
  | "storage_flags_absent"
  | "unknown_keys"
  | "needs_review_status"
  | "normalization_no_edits";

export type KimiAttemptDiagnostics = {
  attempt: number;
  modelRef: string;
  providerPath: string;
  modelRunRef: string | null;
  responseHash: string;
  responsePresent: boolean;
  responseLength: number;
  latencyMs: number;
  maxOutputTokens: number;
  timeoutMs: number;
  hadFencedJson: boolean;
  hadJsonObject: boolean;
  topLevelKeys: string[];
  hadFileEditsKey: boolean;
  parsedStatus: string | null;
  parsedNeedsReview: boolean | null;
  parsedFileEditCount: number;
  boundedBlockerSummary: string | null;
  hadPatchLikeContent: boolean;
  hadDiffBlock?: boolean;
  hadSearchReplaceBlock?: boolean;
  parsedContextRequestCount?: number;
  targetRefsPresent?: boolean;
  acceptanceCriteriaPresent?: boolean;
  implementationPacketRef?: string | null;
  schemaParseState: "valid" | "invalid" | "not_attempted";
  schemaFailureCategories: KimiPatchSchemaFailureCategory[];
  normalizedEditCount: number;
  rejectionStage: KimiPatchRejectionStage | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type KimiFileImplementationAdapterResult = {
  artifactKind: "kimi_file_implementation_adapter_result";
  status: "completed" | "needs_review" | "failed";
  modelRef: string;
  providerPath: string;
  modelRunRef: string | null;
  changedFileRefs: string[];
  diffHash: string | null;
  validationRefs: string[];
  artifactRefs: string[];
  limitations: string[];
  contextExpansionRequests: KimiContextExpansionRequest[];
  editPlanSteps: KimiEditPlanStep[];
  evidenceClaims: KimiEvidenceClaim[];
  attemptDiagnostics: KimiAttemptDiagnostics[];
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type KimiPatchAttemptProgressEvent = {
  phase:
    | "kimi.patch.attempt_started"
    | "kimi.patch.response_received"
    | "kimi.patch.response_rejected"
    | "kimi.patch.apply_started"
    | "kimi.patch.validation_started"
    | "kimi.patch.completed"
    | "kimi.patch.needs_review";
  attempt: number;
  modelRef: string;
  providerPath: string;
  modelRunRef?: string | null;
  reasonCodes?: string[];
  changedFileRefs?: string[];
  validationRefs?: string[];
  blockerSummary?: string | null;
  targetRefs?: string[];
  acceptanceCriteria?: string[];
  implementationPacketRef?: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

type ParsedEdit = {
  path: string;
  operation: "replace_file" | "create_file" | "patch" | "replace_text";
  content: string | null;
  unifiedDiff: string | null;
  oldText: string | null;
  newText: string | null;
  rationale: string;
};

const KimiPatchProposalSchema = z
  .object({
    schemaVersion: z.literal("openclaw.kimi.patch-proposal.v1"),
    status: z.enum(["patch_proposed", "needs_review"]),
    contextRequests: z
      .array(
        z
          .object({
            requestId: z.string().min(1).max(160),
            requestedFileRefs: z.array(z.string().min(1).max(220)).max(8),
            reason: z.string().min(1).max(800),
            commitmentIds: z.array(z.string().min(1).max(160)).max(12).optional(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    editSteps: z
      .array(
        z
          .object({
            stepId: z.string().min(1).max(160),
            objective: z.string().min(1).max(800),
            targetFileRefs: z.array(z.string().min(1).max(220)).max(8),
            validationExpectation: z.string().max(800).optional(),
            rollbackBoundary: z.enum(["step", "plan"]).optional(),
            commitmentIdsAdvanced: z.array(z.string().min(1).max(160)).max(12).optional(),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    editPlan: z.string().max(1_500).optional(),
    fileEdits: z
      .array(
        z
          .object({
            path: z.string().min(1).max(220),
            operation: z.enum(["replace_file", "create_file", "patch", "replace_text"]),
            content: z.string().max(80_000).optional(),
            unifiedDiff: z.string().max(80_000).optional(),
            oldText: z.string().max(80_000).optional(),
            newText: z.string().max(80_000).optional(),
            rationale: z.string().min(1).max(800),
          })
          .strict(),
      )
      .max(8),
    validationCommandRefs: z.array(z.string().min(1).max(500)).max(8),
    limitations: z.array(z.string().min(1).max(500)).max(8),
    escalationReason: z.string().max(500).optional(),
    evidenceClaims: z
      .array(
        z
          .object({
            commitmentId: z.string().min(1).max(160),
            evidenceRef: z.string().min(1).max(500),
            claimSummary: z.string().min(1).max(800),
            changedFileRefs: z.array(z.string().min(1).max(220)).max(20).optional(),
            validationRefs: z.array(z.string().min(1).max(500)).max(20).optional(),
            limitations: z.array(z.string().min(1).max(500)).max(8).optional(),
            confidence: z.enum(["low", "medium", "high"]).optional(),
            rawPromptStored: z.literal(false),
            rawResponseStored: z.literal(false),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedText(value: string, max = 12_000): string {
  return value.length > max ? value.slice(0, max) : value;
}

function parseJsonObjectWithDiagnostics(text: string | null): {
  parsed: Record<string, unknown> | null;
  hadFencedJson: boolean;
  hadJsonObject: boolean;
  malformedJson: boolean;
} {
  const source = text?.trim() ?? "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  let malformedJson = false;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          parsed: parsed as Record<string, unknown>,
          hadFencedJson: Boolean(fenced),
          hadJsonObject: true,
          malformedJson,
        };
      }
    } catch {
      try {
        const parsed = JSON5.parse(candidate) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return {
            parsed: parsed as Record<string, unknown>,
            hadFencedJson: Boolean(fenced),
            hadJsonObject: true,
            malformedJson,
          };
        }
      } catch {
        malformedJson = true;
      }
    }
  }
  return {
    parsed: null,
    hadFencedJson: Boolean(fenced),
    hadJsonObject: false,
    malformedJson,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function looksLikeUnifiedDiff(value: string | null): boolean {
  return Boolean(value && /^diff --git |^@@ |--- a\/|\+\+\+ b\//imu.test(value));
}

function looksLikeSearchReplaceBlock(value: string | null): boolean {
  return Boolean(
    value && /<<<<<<<+\s*SEARCH[\s\S]+?=======+[\s\S]+?>>>>>>>+\s*REPLACE/imu.test(value),
  );
}

function extractSearchReplaceBlocks(value: string): Array<{ oldText: string; newText: string }> {
  const blocks: Array<{ oldText: string; newText: string }> = [];
  const pattern =
    /<<<<<<<+\s*SEARCH\s*\n([\s\S]*?)\n?=======+\s*\n([\s\S]*?)\n?>>>>>>>+\s*REPLACE/giu;
  for (const match of value.matchAll(pattern)) {
    const oldText = match[1] ?? "";
    const newText = match[2] ?? "";
    if (oldText.trim().length > 0 && oldText.length <= 80_000 && newText.length <= 80_000) {
      blocks.push({ oldText, newText });
    }
  }
  return blocks.slice(0, 8);
}

function extractSingleTargetSearchReplaceEdits(input: {
  responseText: string | null;
  singleTargetFileRef: string | null;
}): ParsedEdit[] {
  const source = input.responseText?.trim() ?? "";
  const target = input.singleTargetFileRef;
  if (
    !source ||
    !target ||
    target.endsWith("/") ||
    path.isAbsolute(target) ||
    target.includes("..")
  ) {
    return [];
  }
  if (/\braw(?:Prompt|Response|ProviderLog)Stored\b\s*[:=]\s*true/iu.test(source)) {
    return [];
  }
  return extractSearchReplaceBlocks(source).map((block) => ({
    path: target,
    operation: "replace_text",
    content: null,
    unifiedDiff: null,
    oldText: block.oldText,
    newText: block.newText,
    rationale: "single target search/replace block",
  }));
}

function extractSingleTargetFencedCodeEdit(input: {
  responseText: string | null;
  singleTargetFileRef: string | null;
}): ParsedEdit[] {
  const source = input.responseText?.trim() ?? "";
  const target = input.singleTargetFileRef;
  if (
    !source ||
    !target ||
    target.endsWith("/") ||
    path.isAbsolute(target) ||
    target.includes("..")
  ) {
    return [];
  }
  if (/\braw(?:Prompt|Response|ProviderLog)Stored\b\s*[:=]\s*true/iu.test(source)) {
    return [];
  }
  const blocks = [...source.matchAll(/```([a-zA-Z0-9_-]*)[^\n]*\n([\s\S]*?)```/gu)]
    .map((match) => ({
      language: match[1]?.trim().toLowerCase() ?? "",
      content: match[2] ?? "",
    }))
    .filter((block) => {
      if (!block.language || block.content.trim().length === 0) {
        return false;
      }
      if (["json", "json5", "diff", "patch"].includes(block.language)) {
        return false;
      }
      return block.content.length <= 80_000;
    });
  if (blocks.length !== 1) {
    return [];
  }
  const content = blocks[0]!.content.endsWith("\n")
    ? blocks[0]!.content
    : `${blocks[0]!.content}\n`;
  return [
    {
      path: target,
      operation: "replace_file",
      content,
      unifiedDiff: null,
      oldText: null,
      newText: null,
      rationale: "single target fenced file content",
    },
  ];
}

function extractSingleTargetFencedDiffEdit(input: {
  responseText: string | null;
  singleTargetFileRef: string | null;
}): ParsedEdit[] {
  const source = input.responseText?.trim() ?? "";
  const target = input.singleTargetFileRef;
  if (
    !source ||
    !target ||
    target.endsWith("/") ||
    path.isAbsolute(target) ||
    target.includes("..")
  ) {
    return [];
  }
  if (/\braw(?:Prompt|Response|ProviderLog)Stored\b\s*[:=]\s*true/iu.test(source)) {
    return [];
  }
  const blocks = [...source.matchAll(/```([a-zA-Z0-9_-]*)[^\n]*\n([\s\S]*?)```/gu)]
    .map((match) => ({
      language: match[1]?.trim().toLowerCase() ?? "",
      content: match[2] ?? "",
    }))
    .filter((block) => ["diff", "patch"].includes(block.language));
  if (blocks.length !== 1 || !looksLikeUnifiedDiff(blocks[0]!.content)) {
    return [];
  }
  const diff = blocks[0]!.content.endsWith("\n") ? blocks[0]!.content : `${blocks[0]!.content}\n`;
  return [
    {
      path: target,
      operation: "patch",
      content: null,
      unifiedDiff: diff,
      oldText: null,
      newText: null,
      rationale: "single target fenced diff",
    },
  ];
}

function normalizePatchProposal(parsed: Record<string, unknown>): ParsedEdit[] {
  if (
    readBoolean(parsed.rawPromptStored) === true ||
    readBoolean(parsed.rawResponseStored) === true ||
    readBoolean(parsed.rawProviderLogStored) === true
  ) {
    return [];
  }

  const proposal = KimiPatchProposalSchema.safeParse(parsed);
  const rawEdits: unknown[] = proposal.success
    ? proposal.data.status === "patch_proposed"
      ? proposal.data.fileEdits
      : []
    : readArray(parsed.fileEdits ?? parsed.file_edits ?? parsed.edits ?? parsed.files);

  const edits: ParsedEdit[] = [];
  for (const rawEdit of rawEdits) {
    if (!rawEdit || typeof rawEdit !== "object" || Array.isArray(rawEdit)) {
      continue;
    }
    const edit = rawEdit as Record<string, unknown>;
    const editPath = readString(edit.path ?? edit.filePath ?? edit.file_path ?? edit.file);
    const rawOperation = readString(edit.operation ?? edit.op ?? edit.action);
    const content = readString(
      edit.content ?? edit.newContent ?? edit.new_content ?? edit.fileContent ?? edit.file_content,
    );
    const directUnifiedDiff = readString(
      edit.unifiedDiff ?? edit.unified_diff ?? edit.diff ?? edit.patch,
    );
    const oldText = readString(edit.oldText ?? edit.old_text ?? edit.find ?? edit.search);
    const newText = readString(
      edit.newText ?? edit.new_text ?? edit.replace ?? edit.replacement ?? edit.replaceWith,
    );
    const unifiedDiff =
      directUnifiedDiff ??
      (rawOperation === "patch" && looksLikeUnifiedDiff(content) ? content : null);
    const rationale = readString(edit.rationale ?? edit.summary ?? edit.reason) ?? "bounded edit";
    if (!editPath) {
      continue;
    }
    const operation: ParsedEdit["operation"] =
      rawOperation === "create_file" || rawOperation === "create"
        ? "create_file"
        : rawOperation === "replace_text" ||
            rawOperation === "search_replace" ||
            rawOperation === "searchReplace" ||
            (oldText && newText)
          ? "replace_text"
          : rawOperation === "patch" || unifiedDiff || looksLikeUnifiedDiff(content)
            ? "patch"
            : "replace_file";
    if (operation === "replace_text") {
      if (oldText && newText) {
        edits.push({
          path: editPath,
          operation,
          content: null,
          unifiedDiff: null,
          oldText,
          newText,
          rationale,
        });
      }
      continue;
    }
    if (operation === "patch") {
      if (unifiedDiff) {
        edits.push({
          path: editPath,
          operation,
          content: null,
          unifiedDiff,
          oldText: null,
          newText: null,
          rationale,
        });
      }
      continue;
    }
    if (content) {
      edits.push({
        path: editPath,
        operation,
        content,
        unifiedDiff: null,
        oldText: null,
        newText: null,
        rationale,
      });
    }
  }
  return edits.slice(0, 8);
}

function normalizeContextRequests(parsed: Record<string, unknown>): KimiContextExpansionRequest[] {
  const requests = readArray(
    parsed.contextRequests ?? parsed.context_requests ?? parsed.additionalContextRequests,
  );
  return requests
    .filter((request): request is Record<string, unknown> =>
      Boolean(request && typeof request === "object" && !Array.isArray(request)),
    )
    .map((request, index) => {
      const requestedFileRefs = readArray(
        request.requestedFileRefs ?? request.requested_file_refs ?? request.fileRefs,
      )
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 8);
      return {
        requestId:
          readString(request.requestId ?? request.request_id) ?? `context-request-${index + 1}`,
        requestedFileRefs,
        reason:
          readString(request.reason ?? request.rationale) ?? "Kimi requested bounded context.",
        commitmentIds: readArray(request.commitmentIds ?? request.commitment_ids)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 12),
        status: "requested",
        providedContextRefs: [],
        deniedReasonCode: null,
        rawPromptStored: false,
        rawResponseStored: false,
      } satisfies KimiContextExpansionRequest;
    })
    .filter((request) => request.requestedFileRefs.length > 0)
    .slice(0, 4);
}

function normalizeEditPlanSteps(parsed: Record<string, unknown>): KimiEditPlanStep[] {
  const steps = readArray(parsed.editSteps ?? parsed.edit_steps ?? parsed.orderedSteps);
  return steps
    .filter((step): step is Record<string, unknown> =>
      Boolean(step && typeof step === "object" && !Array.isArray(step)),
    )
    .map((step, index): KimiEditPlanStep => {
      const rollbackBoundary: KimiEditPlanStep["rollbackBoundary"] =
        readString(step.rollbackBoundary ?? step.rollback_boundary) === "plan" ? "plan" : "step";
      return {
        stepId: readString(step.stepId ?? step.step_id) ?? `edit-step-${index + 1}`,
        objective:
          readString(step.objective ?? step.expectedChange ?? step.expected_change) ??
          "Apply bounded file edit.",
        targetFileRefs: readArray(step.targetFileRefs ?? step.target_file_refs ?? step.files)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 8),
        validationExpectation:
          readString(step.validationExpectation ?? step.validation_expectation) ?? null,
        rollbackBoundary,
        commitmentIdsAdvanced: readArray(
          step.commitmentIdsAdvanced ?? step.commitment_ids_advanced ?? step.commitmentIds,
        )
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 12),
      };
    })
    .filter((step) => step.targetFileRefs.length > 0)
    .slice(0, 12);
}

function normalizeEvidenceClaims(parsed: Record<string, unknown>): KimiEvidenceClaim[] {
  const claims = readArray(parsed.evidenceClaims ?? parsed.evidence_claims ?? parsed.claims);
  return claims
    .filter((claim): claim is Record<string, unknown> =>
      Boolean(claim && typeof claim === "object" && !Array.isArray(claim)),
    )
    .map((claim) => {
      const confidence = readString(claim.confidence);
      return {
        commitmentId: readString(claim.commitmentId ?? claim.commitment_id) ?? "",
        evidenceRef: readString(claim.evidenceRef ?? claim.evidence_ref) ?? "",
        claimSummary:
          readString(claim.claimSummary ?? claim.claim_summary ?? claim.summary) ??
          "Kimi claims bounded implementation evidence.",
        changedFileRefs: readArray(claim.changedFileRefs ?? claim.changed_file_refs)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 20),
        validationRefs: readArray(claim.validationRefs ?? claim.validation_refs)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 20),
        limitations: readArray(claim.limitations)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim().slice(0, 500))
          .slice(0, 8),
        confidence:
          confidence === "high" || confidence === "low" || confidence === "medium"
            ? confidence
            : "medium",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } satisfies KimiEvidenceClaim;
    })
    .filter((claim) => claim.commitmentId.length > 0 && claim.evidenceRef.length > 0)
    .slice(0, 20);
}

function schemaFailureCategories(
  result: ReturnType<typeof KimiPatchProposalSchema.safeParse>,
): KimiPatchSchemaFailureCategory[] {
  if (result.success) {
    return result.data.status === "needs_review" ? ["needs_review_status"] : [];
  }
  const categories = new Set<KimiPatchSchemaFailureCategory>();
  for (const issue of result.error.issues) {
    const pathKey = issue.path.join(".");
    if (pathKey === "schemaVersion") {
      categories.add("invalid_schema_version");
    } else if (pathKey === "status") {
      categories.add("invalid_status");
    } else if (pathKey === "fileEdits") {
      categories.add("missing_file_edits");
    } else if (pathKey.startsWith("fileEdits.")) {
      categories.add("invalid_file_edit");
    } else if (
      pathKey === "validationCommandRefs" ||
      pathKey.startsWith("validationCommandRefs.")
    ) {
      categories.add("invalid_validation_refs");
    } else if (pathKey === "limitations" || pathKey.startsWith("limitations.")) {
      categories.add("invalid_limitations");
    } else if (issue.code === "unrecognized_keys") {
      categories.add("unknown_keys");
    } else {
      categories.add("malformed_json");
    }
  }
  return [...categories].slice(0, 12);
}

function analyzePatchResponse(input: {
  responseText: string | null;
  responseHash: string;
  modelRunRef: string | null;
  attempt: number;
  modelRef: string;
  providerPath: string;
  latencyMs: number;
  maxOutputTokens: number;
  timeoutMs: number;
  singleTargetFileRef?: string | null;
  targetRefsPresent: boolean;
  acceptanceCriteriaPresent: boolean;
  implementationPacketRef?: string | null;
}): {
  edits: ParsedEdit[];
  contextRequests: KimiContextExpansionRequest[];
  editPlanSteps: KimiEditPlanStep[];
  evidenceClaims: KimiEvidenceClaim[];
  diagnostics: KimiAttemptDiagnostics;
} {
  const responseText = input.responseText ?? "";
  const responsePresent = responseText.trim().length > 0;
  const parsed = parseJsonObjectWithDiagnostics(input.responseText);
  const topLevelKeys = parsed.parsed ? Object.keys(parsed.parsed).toSorted().slice(0, 24) : [];
  const parsedStatus = parsed.parsed
    ? readString(parsed.parsed.status ?? parsed.parsed.review_status)
    : null;
  const parsedNeedsReview = parsed.parsed ? readBoolean(parsed.parsed.needs_review) : null;
  const parsedFileEditCount = parsed.parsed
    ? readArray(parsed.parsed.fileEdits ?? parsed.parsed.file_edits ?? parsed.parsed.edits).length
    : 0;
  const boundedBlockerSummary = parsed.parsed
    ? (readString(
        parsed.parsed.blocker ??
          parsed.parsed.review_reason ??
          parsed.parsed.reason ??
          parsed.parsed.escalationReason ??
          parsed.parsed.escalation_reason,
      )?.slice(0, 500) ?? null)
    : null;
  const rawStorageClaimed =
    parsed.parsed &&
    (readBoolean(parsed.parsed.rawPromptStored) === true ||
      readBoolean(parsed.parsed.raw_prompt_stored) === true ||
      readBoolean(parsed.parsed.rawResponseStored) === true ||
      readBoolean(parsed.parsed.raw_response_stored) === true ||
      readBoolean(parsed.parsed.rawProviderLogStored) === true ||
      readBoolean(parsed.parsed.raw_provider_log_stored) === true);
  const schemaResult = parsed.parsed ? KimiPatchProposalSchema.safeParse(parsed.parsed) : null;
  const schemaState = !parsed.parsed
    ? "not_attempted"
    : schemaResult?.success
      ? "valid"
      : "invalid";
  const edits = parsed.parsed
    ? normalizePatchProposal(parsed.parsed)
    : [
        ...extractSingleTargetFencedDiffEdit({
          responseText: input.responseText,
          singleTargetFileRef: input.singleTargetFileRef ?? null,
        }),
        ...extractSingleTargetSearchReplaceEdits({
          responseText: input.responseText,
          singleTargetFileRef: input.singleTargetFileRef ?? null,
        }),
        ...extractSingleTargetFencedCodeEdit({
          responseText: input.responseText,
          singleTargetFileRef: input.singleTargetFileRef ?? null,
        }),
      ].slice(0, 1);
  const contextRequests = parsed.parsed ? normalizeContextRequests(parsed.parsed) : [];
  const editPlanSteps = parsed.parsed ? normalizeEditPlanSteps(parsed.parsed) : [];
  const evidenceClaims = parsed.parsed ? normalizeEvidenceClaims(parsed.parsed) : [];
  const failureCategories = new Set<KimiPatchSchemaFailureCategory>(
    parsed.parsed && schemaResult ? schemaFailureCategories(schemaResult) : [],
  );
  if (!responsePresent) {
    failureCategories.add("no_response");
  }
  if (!parsed.hadJsonObject) {
    failureCategories.add("no_json_object");
  }
  if (parsed.malformedJson) {
    failureCategories.add("malformed_json");
  }
  if (rawStorageClaimed) {
    failureCategories.add("raw_storage_claimed");
  }
  if (
    parsed.parsed &&
    readBoolean(parsed.parsed.rawPromptStored) !== false &&
    readBoolean(parsed.parsed.raw_prompt_stored) !== false
  ) {
    failureCategories.add("storage_flags_absent");
  }
  if (edits.length === 0 && responsePresent && parsed.hadJsonObject) {
    failureCategories.add("normalization_no_edits");
  }
  const rejectionStage: KimiPatchRejectionStage | null =
    edits.length > 0
      ? null
      : !responsePresent
        ? "provider_no_content"
        : !parsed.hadJsonObject
          ? "json_parse"
          : schemaState === "invalid" || rawStorageClaimed
            ? "schema_parse"
            : "normalization";
  return {
    edits,
    contextRequests,
    editPlanSteps,
    evidenceClaims,
    diagnostics: {
      attempt: input.attempt,
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      modelRunRef: input.modelRunRef,
      responseHash: input.responseHash,
      responsePresent,
      responseLength: Math.min(responseText.length, 1_000_000),
      latencyMs: input.latencyMs,
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      hadFencedJson: parsed.hadFencedJson,
      hadJsonObject: parsed.hadJsonObject,
      topLevelKeys,
      hadFileEditsKey:
        topLevelKeys.includes("fileEdits") ||
        topLevelKeys.includes("file_edits") ||
        topLevelKeys.includes("edits") ||
        topLevelKeys.includes("files"),
      parsedStatus,
      parsedNeedsReview,
      parsedFileEditCount,
      boundedBlockerSummary,
      hadPatchLikeContent:
        looksLikeUnifiedDiff(responseText) || looksLikeSearchReplaceBlock(responseText),
      hadDiffBlock: looksLikeUnifiedDiff(responseText),
      hadSearchReplaceBlock: looksLikeSearchReplaceBlock(responseText),
      parsedContextRequestCount: contextRequests.length,
      targetRefsPresent: input.targetRefsPresent,
      acceptanceCriteriaPresent: input.acceptanceCriteriaPresent,
      implementationPacketRef: input.implementationPacketRef ?? null,
      schemaParseState: schemaState,
      schemaFailureCategories: [...failureCategories].slice(0, 12),
      normalizedEditCount: edits.length,
      rejectionStage,
      reasonCodes: rejectionStage
        ? [`kimi_patch_rejected_at_${rejectionStage}`]
        : ["kimi_patch_response_normalized"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  };
}

function updateAttemptDiagnostics(
  diagnostics: KimiAttemptDiagnostics[],
  stage: KimiPatchRejectionStage,
  reasonCodes: string[],
): void {
  const latest = diagnostics.at(-1);
  if (!latest) {
    return;
  }
  diagnostics[diagnostics.length - 1] = {
    ...latest,
    rejectionStage: stage,
    reasonCodes: [...new Set([...latest.reasonCodes, ...reasonCodes])].slice(0, 12),
  };
}

function assertAllowedFile(repoRoot: string, fileRef: string, allowedFileRefs: string[]): string {
  if (path.isAbsolute(fileRef) || fileRef.includes("..")) {
    throw new Error(`kimi_patch_out_of_scope:${fileRef}`);
  }
  const normalized = fileRef.replace(/\\/gu, "/");
  const allowed = allowedFileRefs.some((allowedRef) => {
    const allowedNormalized = allowedRef.replace(/\\/gu, "/");
    return (
      normalized === allowedNormalized ||
      normalized.startsWith(`${allowedNormalized.replace(/\/$/u, "")}/`)
    );
  });
  if (!allowed) {
    throw new Error(`kimi_patch_out_of_scope:${fileRef}`);
  }
  return path.resolve(repoRoot, normalized);
}

async function defaultApplyFile(repoRoot: string, edit: ParsedEdit, allowedFileRefs: string[]) {
  const absolute = assertAllowedFile(repoRoot, edit.path, allowedFileRefs);
  if (edit.operation === "patch") {
    const diff = edit.unifiedDiff ?? "";
    const touchedFiles = touchedFilesFromUnifiedDiff(diff);
    if (touchedFiles.length === 0) {
      throw new Error(`kimi_patch_diff_no_touched_files:${edit.path}`);
    }
    for (const touchedFile of touchedFiles) {
      assertAllowedFile(repoRoot, touchedFile, allowedFileRefs);
    }
    const beforeHash = hash(await hashTouchedFiles(repoRoot, touchedFiles));
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-kimi-patch-"));
    const patchPath = path.join(tempDir, "kimi.patch");
    try {
      await writeFile(patchPath, diff, "utf8");
      await execFileAsync("git", ["apply", "--check", patchPath], {
        cwd: repoRoot,
        timeout: 30_000,
        maxBuffer: 24 * 1024,
      });
      await execFileAsync("git", ["apply", patchPath], {
        cwd: repoRoot,
        timeout: 30_000,
        maxBuffer: 24 * 1024,
      });
    } catch (error) {
      throw new Error(
        `kimi_patch_apply_failed:${error instanceof Error ? error.message.slice(0, 300) : "unknown"}`,
        { cause: error },
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    const afterHash = hash(await hashTouchedFiles(repoRoot, touchedFiles));
    return { changed: beforeHash !== afterHash, beforeHash, afterHash };
  }
  if (edit.operation === "replace_text") {
    const before = await readFile(absolute, "utf8").catch(() => "");
    const oldText = edit.oldText ?? "";
    const newText = edit.newText ?? "";
    if (!oldText || !before.includes(oldText)) {
      throw new Error(`kimi_patch_replace_text_not_found:${edit.path}`);
    }
    const after = before.replace(oldText, newText);
    if (before === after) {
      return { changed: false, beforeHash: hash(before), afterHash: hash(after) };
    }
    await writeFile(absolute, after, "utf8");
    return { changed: true, beforeHash: hash(before), afterHash: hash(after) };
  }
  await mkdir(path.dirname(absolute), { recursive: true });
  const before = await readFile(absolute, "utf8").catch(() => "");
  const content = edit.content ?? "";
  if (edit.operation === "create_file" && before.length > 0) {
    throw new Error(`kimi_patch_create_file_exists:${edit.path}`);
  }
  if (before === content) {
    return { changed: false, beforeHash: hash(before), afterHash: hash(content) };
  }
  await writeFile(absolute, content, "utf8");
  return { changed: true, beforeHash: hash(before), afterHash: hash(content) };
}

function touchedFilesFromUnifiedDiff(diff: string): string[] {
  const touched = new Set<string>();
  for (const line of diff.split(/\r?\n/u)) {
    const gitDiff = line.match(/^diff --git a\/(.+?) b\/(.+)$/u);
    if (gitDiff) {
      touched.add(gitDiff[1]!.trim());
      touched.add(gitDiff[2]!.trim());
      continue;
    }
    const file = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/u);
    if (file) {
      const candidate = file[1]!.trim();
      if (candidate !== "/dev/null") {
        touched.add(candidate);
      }
    }
  }
  return [...touched].filter(Boolean).slice(0, 40);
}

async function hashTouchedFiles(repoRoot: string, fileRefs: string[]): Promise<string> {
  const parts = await Promise.all(
    fileRefs.toSorted().map(async (fileRef) => {
      const content = await readFile(path.join(repoRoot, fileRef), "utf8").catch(() => "");
      return `${fileRef}:${hash(content)}`;
    }),
  );
  return parts.join("\n");
}

function fileRefsForEdits(edits: ParsedEdit[]): string[] {
  return [
    ...new Set(
      edits.flatMap((edit) =>
        edit.operation === "patch" && edit.unifiedDiff
          ? touchedFilesFromUnifiedDiff(edit.unifiedDiff)
          : [edit.path],
      ),
    ),
  ].slice(0, 40);
}

async function snapshotFiles(
  repoRoot: string,
  fileRefs: string[],
): Promise<Map<string, { existed: boolean; content: string }>> {
  const snapshots = new Map<string, { existed: boolean; content: string }>();
  for (const fileRef of fileRefs) {
    const absolute = path.join(repoRoot, fileRef);
    try {
      snapshots.set(fileRef, { existed: true, content: await readFile(absolute, "utf8") });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        snapshots.set(fileRef, { existed: false, content: "" });
        continue;
      }
      throw error;
    }
  }
  return snapshots;
}

async function restoreSnapshots(
  repoRoot: string,
  snapshots: Map<string, { existed: boolean; content: string }>,
): Promise<void> {
  for (const [fileRef, snapshot] of snapshots) {
    const absolute = path.join(repoRoot, fileRef);
    if (!snapshot.existed) {
      await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
      continue;
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, snapshot.content, "utf8");
  }
}

async function readFileSnapshots(input: {
  repoRoot: string;
  allowedFileRefs: string[];
  scopeFileRefs?: string[];
  maxFiles?: number;
  maxBytesPerFile?: number;
}): Promise<
  Array<{ path: string; contentHash: string; boundedContent: string; truncated: boolean }>
> {
  const maxFiles = Math.max(1, Math.min(8, input.maxFiles ?? 6));
  const maxBytesPerFile = Math.max(1_000, Math.min(24_000, input.maxBytesPerFile ?? 12_000));
  const scopeFileRefs = input.scopeFileRefs ?? input.allowedFileRefs;
  const snapshots = [];
  const concreteFileRefs: string[] = [];
  for (const fileRef of input.allowedFileRefs) {
    if (!fileRef.endsWith("/")) {
      concreteFileRefs.push(fileRef);
      continue;
    }
    try {
      const absoluteDir = assertAllowedFile(input.repoRoot, fileRef, scopeFileRefs);
      const entries = await readdir(absoluteDir, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const parent = "parentPath" in entry ? entry.parentPath : absoluteDir;
        const absolute = path.join(parent, entry.name);
        const relative = path.relative(input.repoRoot, absolute).replace(/\\/gu, "/");
        if (
          /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|md|json)$/iu.test(relative) &&
          !relative.includes("/node_modules/") &&
          !relative.includes("/dist/")
        ) {
          concreteFileRefs.push(relative);
        }
      }
    } catch {
      continue;
    }
  }
  const preferred = concreteFileRefs.toSorted((left, right) => {
    const score = (value: string) =>
      (value.includes("canonical-runtime-queue") ? 100 : 0) +
      (value.includes("execution-read-model") ? 90 : 0) +
      (value.includes("work-queue-repository") ? 80 : 0) +
      (value.includes("work-queue.test") ? 70 : 0) +
      (value.endsWith(".test.ts") ? 20 : 0) -
      value.length / 10_000;
    return score(right) - score(left) || left.localeCompare(right);
  });
  for (const fileRef of preferred.slice(0, maxFiles)) {
    try {
      const absolute = assertAllowedFile(input.repoRoot, fileRef, scopeFileRefs);
      const info = await stat(absolute);
      if (!info.isFile()) {
        continue;
      }
      const content = await readFile(absolute, "utf8");
      snapshots.push({
        path: fileRef,
        contentHash: hash(content),
        boundedContent: boundedText(content, maxBytesPerFile),
        truncated: content.length > maxBytesPerFile,
      });
    } catch {
      snapshots.push({
        path: fileRef,
        contentHash: hash(""),
        boundedContent: "",
        truncated: false,
      });
    }
  }
  return snapshots;
}

function uniqueEditPlanSteps(steps: KimiEditPlanStep[]): KimiEditPlanStep[] {
  const seen = new Set<string>();
  return steps
    .filter((step) => {
      if (seen.has(step.stepId)) {
        return false;
      }
      seen.add(step.stepId);
      return true;
    })
    .slice(0, 12);
}

function normalizeSuccessfulEvidenceClaims(input: {
  claims: KimiEvidenceClaim[];
  commitmentIds: string[];
  changedFileRefs: string[];
  validationRefs: string[];
}): KimiEvidenceClaim[] {
  const existing = input.claims.filter((claim) =>
    input.commitmentIds.length === 0 ? true : input.commitmentIds.includes(claim.commitmentId),
  );
  const generated = input.commitmentIds.map((commitmentId) => ({
    commitmentId,
    evidenceRef: `runtime-work-graph://kimi-file-adapter/evidence/${commitmentId}`,
    claimSummary:
      "Kimi produced bounded source-change and validation evidence for this commitment.",
    changedFileRefs: input.changedFileRefs,
    validationRefs: input.validationRefs,
    limitations: [],
    confidence: "medium" as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
  }));
  const byCommitment = new Map<string, KimiEvidenceClaim>();
  for (const claim of [...existing, ...generated]) {
    byCommitment.set(claim.commitmentId, {
      ...claim,
      changedFileRefs:
        claim.changedFileRefs.length > 0 ? claim.changedFileRefs : input.changedFileRefs,
      validationRefs: claim.validationRefs.length > 0 ? claim.validationRefs : input.validationRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }
  return [...byCommitment.values()].slice(0, 20);
}

export class KimiFileImplementationAdapter {
  constructor(
    private readonly options: {
      modelClient: KimiPatchModelClient;
      validationRunner: KimiValidationRunner;
      applyFile?: (
        repoRoot: string,
        edit: ParsedEdit,
        allowedFileRefs: string[],
      ) => Promise<{ changed: boolean; beforeHash: string; afterHash: string }>;
      progressSink?: (event: KimiPatchAttemptProgressEvent) => void | Promise<void>;
    },
  ) {}

  async run(
    input: KimiFileImplementationAdapterInput,
  ): Promise<KimiFileImplementationAdapterResult> {
    const modelRef = input.budgetPolicy.modelRef ?? "moonshotai/kimi-k2.6";
    const providerPath = input.budgetPolicy.providerPath ?? "openrouter";
    const fileSnapshots = await readFileSnapshots({
      repoRoot: input.repoRoot,
      allowedFileRefs: input.targetFileRefs?.length ? input.targetFileRefs : input.allowedFileRefs,
      scopeFileRefs: input.allowedFileRefs,
    });
    const implementationTaskPacket =
      input.implementationTaskPacket ??
      buildImplementationTaskPacket({
        microtaskId: input.microtaskId,
        microtaskTitle: input.microtaskTitle,
        exactEditObjective: input.exactEditObjective ?? input.taskSummary,
        taskSummary: input.taskSummary,
        targetCommitmentIds: input.targetCommitmentIds ?? [],
        targetFileRefs: input.targetFileRefs ?? [],
        allowedFileRefs: input.allowedFileRefs,
        contextPacketRefs: input.contextPackRefs,
        validationCommandRefs: input.validationCommandRefs,
        acceptanceCriteria: input.acceptanceCriteria ?? [],
        downstreamConsumer: "validation_and_review",
        successEvidenceDescriptions: input.acceptanceCriteria ?? [],
      });
    const taskSummaryForModel = [
      "ImplementationTaskPacket v2:",
      JSON.stringify(implementationTaskPacket, null, 2),
      "",
      "Additional bounded task summary:",
      input.taskSummary,
    ].join("\n");
    const apply = this.options.applyFile ?? defaultApplyFile;
    const maxAttempts = Math.max(1, Math.min(6, input.budgetPolicy.maxAttempts ?? 3));
    let previousFailureSummary: string | undefined;
    let lastFailureReasonCode = "kimi_no_valid_patch_proposal";
    let lastModelRunRef: string | null = null;
    const validationRefs: string[] = [];
    const attemptDiagnostics: KimiAttemptDiagnostics[] = [];
    const contextExpansionRequests: KimiContextExpansionRequest[] = [];
    const editPlanSteps: KimiEditPlanStep[] = [];
    const evidenceClaims: KimiEvidenceClaim[] = [];
    const expandedContextRefs: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.options.progressSink?.({
        phase: "kimi.patch.attempt_started",
        attempt,
        modelRef,
        providerPath,
        targetRefs: implementationTaskPacket.targetFileRefs,
        acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
        implementationPacketRef: implementationTaskPacket.packetRef,
        reasonCodes: ["kimi_patch_attempt_started"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      const response = await this.options.modelClient.proposeFileEdits({
        modelRef,
        providerPath,
        taskSummary: taskSummaryForModel.slice(0, 8_000),
        implementationTaskPacket,
        allowedFileRefs: input.allowedFileRefs,
        fileSnapshots,
        contextPackRefs: input.contextPackRefs,
        expandedContextRefs,
        validationCommandRefs: input.validationCommandRefs,
        previousFailureSummary,
        attempt,
        maxOutputTokens: input.budgetPolicy.maxOutputTokens,
        timeoutMs: input.budgetPolicy.timeoutMs,
        maxProviderAttempts: Math.min(2, input.budgetPolicy.maxAttempts ?? 2),
      });
      lastModelRunRef = response.modelRunRef;
      await this.options.progressSink?.({
        phase: "kimi.patch.response_received",
        attempt,
        modelRef,
        providerPath,
        modelRunRef: response.modelRunRef,
        targetRefs: implementationTaskPacket.targetFileRefs,
        acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
        implementationPacketRef: implementationTaskPacket.packetRef,
        reasonCodes: ["kimi_patch_response_received"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      const analyzed = analyzePatchResponse({
        responseText: response.responseText,
        responseHash: response.responseHash,
        modelRunRef: response.modelRunRef,
        attempt,
        modelRef,
        providerPath,
        latencyMs: response.latencyMs,
        maxOutputTokens: input.budgetPolicy.maxOutputTokens,
        timeoutMs: input.budgetPolicy.timeoutMs,
        singleTargetFileRef:
          implementationTaskPacket.targetFileRefs.length === 1
            ? implementationTaskPacket.targetFileRefs[0]!
            : implementationTaskPacket.allowedFileRefs.length === 1 &&
                !implementationTaskPacket.allowedFileRefs[0]!.endsWith("/")
              ? implementationTaskPacket.allowedFileRefs[0]!
              : null,
        targetRefsPresent: implementationTaskPacket.targetFileRefs.length > 0,
        acceptanceCriteriaPresent: implementationTaskPacket.acceptanceCriteria.length > 0,
        implementationPacketRef: implementationTaskPacket.packetRef,
      });
      attemptDiagnostics.push(analyzed.diagnostics);
      editPlanSteps.push(...analyzed.editPlanSteps);
      evidenceClaims.push(...analyzed.evidenceClaims);
      if (analyzed.contextRequests.length > 0 && input.contextExpansion?.provider) {
        for (const request of analyzed.contextRequests.slice(
          0,
          Math.max(1, Math.min(3, input.contextExpansion.maxRequests ?? 2)),
        )) {
          const scopedFileRefs = request.requestedFileRefs.filter((fileRef) => {
            try {
              assertAllowedFile(input.repoRoot, fileRef, input.allowedFileRefs);
              return true;
            } catch {
              return false;
            }
          });
          if (scopedFileRefs.length === 0) {
            contextExpansionRequests.push({
              ...request,
              status: "denied",
              deniedReasonCode: "kimi_context_request_out_of_scope",
            });
            continue;
          }
          const provided = await input.contextExpansion.provider({
            requestId: request.requestId,
            requestedFileRefs: scopedFileRefs.slice(
              0,
              Math.max(1, Math.min(8, input.contextExpansion.maxFilesPerRequest ?? 4)),
            ),
            reason: request.reason,
          });
          const providedContextRefs = provided.providedContextRefs.slice(0, 12);
          expandedContextRefs.push(...providedContextRefs);
          contextExpansionRequests.push({
            ...request,
            requestedFileRefs: scopedFileRefs,
            status: providedContextRefs.length > 0 ? "provided" : "denied",
            providedContextRefs,
            deniedReasonCode:
              providedContextRefs.length > 0
                ? null
                : (provided.deniedReasonCode ?? "kimi_context_request_denied"),
          });
        }
        previousFailureSummary = `Provided bounded context refs for Kimi context request: ${expandedContextRefs.slice(-12).join(", ")}`;
        continue;
      }
      const edits = analyzed.edits;
      if (edits.length === 0) {
        previousFailureSummary = `Kimi did not return a valid bounded patch proposal. Rejection stage: ${analyzed.diagnostics.rejectionStage ?? "unknown"}. Categories: ${analyzed.diagnostics.schemaFailureCategories.join(", ") || "none"}.`;
        lastFailureReasonCode =
          analyzed.diagnostics.rejectionStage === "provider_no_content"
            ? "kimi_provider_no_content"
            : analyzed.diagnostics.rejectionStage === "json_parse"
              ? "kimi_no_json_object"
              : analyzed.diagnostics.rejectionStage === "schema_parse"
                ? "kimi_patch_schema_invalid"
                : "kimi_no_valid_patch_proposal";
        await this.options.progressSink?.({
          phase: "kimi.patch.response_rejected",
          attempt,
          modelRef,
          providerPath,
          modelRunRef: response.modelRunRef,
          targetRefs: implementationTaskPacket.targetFileRefs,
          acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
          implementationPacketRef: implementationTaskPacket.packetRef,
          reasonCodes: [lastFailureReasonCode, ...analyzed.diagnostics.reasonCodes],
          blockerSummary: previousFailureSummary,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        continue;
      }
      const changedFileRefs: string[] = [];
      const diffParts: string[] = [];
      const attemptSnapshots = await snapshotFiles(input.repoRoot, fileRefsForEdits(edits));
      try {
        await this.options.progressSink?.({
          phase: "kimi.patch.apply_started",
          attempt,
          modelRef,
          providerPath,
          modelRunRef: response.modelRunRef,
          targetRefs: implementationTaskPacket.targetFileRefs,
          acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
          implementationPacketRef: implementationTaskPacket.packetRef,
          reasonCodes: ["kimi_patch_apply_started"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        for (const edit of edits) {
          const applied = await apply(input.repoRoot, edit, input.allowedFileRefs);
          if (applied.changed) {
            changedFileRefs.push(edit.path);
            diffParts.push(`${edit.path}:${applied.beforeHash}->${applied.afterHash}`);
          }
        }
      } catch (error) {
        await restoreSnapshots(input.repoRoot, attemptSnapshots);
        previousFailureSummary = error instanceof Error ? error.message : "kimi_patch_apply_failed";
        lastFailureReasonCode = previousFailureSummary;
        updateAttemptDiagnostics(
          attemptDiagnostics,
          previousFailureSummary.includes("kimi_patch_out_of_scope")
            ? "scope_check"
            : "patch_apply",
          [
            previousFailureSummary.includes("kimi_patch_out_of_scope")
              ? "kimi_patch_out_of_scope"
              : "kimi_patch_apply_failed",
          ],
        );
        continue;
      }
      if (changedFileRefs.length === 0) {
        await restoreSnapshots(input.repoRoot, attemptSnapshots);
        previousFailureSummary = "Kimi proposed edits that did not change approved files.";
        lastFailureReasonCode = "kimi_patch_no_changed_files";
        updateAttemptDiagnostics(attemptDiagnostics, "no_changed_files", [
          "kimi_patch_no_changed_files",
        ]);
        continue;
      }
      await this.options.progressSink?.({
        phase: "kimi.patch.validation_started",
        attempt,
        modelRef,
        providerPath,
        modelRunRef: response.modelRunRef,
        changedFileRefs,
        targetRefs: implementationTaskPacket.targetFileRefs,
        acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
        implementationPacketRef: implementationTaskPacket.packetRef,
        reasonCodes: ["kimi_patch_validation_started"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      const validation = await Promise.all(
        input.validationCommandRefs
          .slice(0, 3)
          .map((commandRef) => this.options.validationRunner.run(commandRef)),
      );
      validationRefs.push(...validation.map((item) => item.validationRef));
      const validationPassed = validation.every((item) => item.status === "passed");
      if (validationPassed) {
        const uniqueChangedFileRefs = [...new Set(changedFileRefs)].slice(0, 40);
        await this.options.progressSink?.({
          phase: "kimi.patch.completed",
          attempt,
          modelRef,
          providerPath,
          modelRunRef: response.modelRunRef,
          changedFileRefs: uniqueChangedFileRefs,
          validationRefs,
          targetRefs: implementationTaskPacket.targetFileRefs,
          acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
          implementationPacketRef: implementationTaskPacket.packetRef,
          reasonCodes: ["kimi_patch_completed"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        return {
          artifactKind: "kimi_file_implementation_adapter_result",
          status: "completed",
          modelRef,
          providerPath,
          modelRunRef: response.modelRunRef,
          changedFileRefs: uniqueChangedFileRefs,
          diffHash: hash(diffParts.join("\n")),
          validationRefs,
          artifactRefs: [
            `runtime-work-graph://kimi-file-adapter/${randomUUID()}`,
            ...uniqueChangedFileRefs.map((file) => `repo://${file}`),
          ],
          limitations: [],
          contextExpansionRequests,
          editPlanSteps: uniqueEditPlanSteps(editPlanSteps),
          evidenceClaims: normalizeSuccessfulEvidenceClaims({
            claims: evidenceClaims,
            commitmentIds: input.targetCommitmentIds ?? [],
            changedFileRefs: uniqueChangedFileRefs,
            validationRefs,
          }),
          attemptDiagnostics,
          reasonCodes: [
            "kimi_patch_applied_and_validated",
            ...(attempt > 1 ? ["kimi_patch_repaired_after_feedback"] : []),
          ],
          escalatedToCodexBridgeRecommended: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      }
      await restoreSnapshots(input.repoRoot, attemptSnapshots);
      previousFailureSummary = validation
        .map((item) => `${item.validationRef}:${item.status}:${item.summary}`)
        .join("\n")
        .slice(0, 2_000);
      lastFailureReasonCode = "kimi_patch_validation_needs_review_after_repair_attempts";
      updateAttemptDiagnostics(attemptDiagnostics, "validation", ["kimi_patch_validation_failed"]);
    }
    await this.options.progressSink?.({
      phase: "kimi.patch.needs_review",
      attempt: maxAttempts,
      modelRef,
      providerPath,
      modelRunRef: lastModelRunRef,
      validationRefs,
      targetRefs: implementationTaskPacket.targetFileRefs,
      acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
      implementationPacketRef: implementationTaskPacket.packetRef,
      reasonCodes: [lastFailureReasonCode],
      blockerSummary:
        previousFailureSummary ??
        "Kimi did not return a valid openclaw.kimi.patch-proposal.v1 create/replace file edit.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    return this.needsReview({
      modelRef,
      providerPath,
      modelRunRef: lastModelRunRef,
      reasonCodes: [
        validationRefs.length > 0
          ? "kimi_patch_validation_needs_review_after_repair_attempts"
          : lastFailureReasonCode,
      ],
      validationRefs,
      limitations: [
        previousFailureSummary ??
          "Kimi did not return a valid openclaw.kimi.patch-proposal.v1 create/replace file edit.",
      ],
      contextExpansionRequests,
      editPlanSteps: uniqueEditPlanSteps(editPlanSteps),
      evidenceClaims,
      attemptDiagnostics,
    });
  }

  private needsReview(input: {
    modelRef: string;
    providerPath: string;
    modelRunRef: string | null;
    reasonCodes: string[];
    validationRefs?: string[];
    limitations: string[];
    contextExpansionRequests?: KimiContextExpansionRequest[];
    editPlanSteps?: KimiEditPlanStep[];
    evidenceClaims?: KimiEvidenceClaim[];
    attemptDiagnostics: KimiAttemptDiagnostics[];
  }): KimiFileImplementationAdapterResult {
    return {
      artifactKind: "kimi_file_implementation_adapter_result",
      status: "needs_review",
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      modelRunRef: input.modelRunRef,
      changedFileRefs: [],
      diffHash: null,
      validationRefs: input.validationRefs ?? [],
      artifactRefs: [],
      limitations: input.limitations,
      contextExpansionRequests: input.contextExpansionRequests ?? [],
      editPlanSteps: input.editPlanSteps ?? [],
      evidenceClaims: input.evidenceClaims ?? [],
      attemptDiagnostics: input.attemptDiagnostics,
      reasonCodes: input.reasonCodes,
      escalatedToCodexBridgeRecommended: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
