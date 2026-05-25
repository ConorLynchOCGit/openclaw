import type { ImplementationTaskPacket } from "../workflows/mission-work-packets.ts";

export type FileEditPatchModelClient = {
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

export type FileEditValidationRunner = {
  run(commandRef: string): Promise<{
    validationRef: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
    commandRef?: string;
    durationMs?: number;
    exitCode?: number | null;
    signal?: string | null;
    failureKind?: string | null;
    stderr?: string;
    stdout?: string;
    rawCommandLogStored?: false;
  }>;
};

export type FileEditContextExpansionRequest = {
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

export type FileEditPlanStep = {
  stepId: string;
  objective: string;
  targetFileRefs: string[];
  targetRegions?: Array<{
    startLine: number;
    endLine: number;
  }>;
  targetRegion?: {
    startLine: number;
    endLine: number;
  } | null;
  validationExpectation: string | null;
  rollbackBoundary: "step" | "plan";
  commitmentIdsAdvanced: string[];
};

export type FileEditEvidenceClaim = {
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

export type FileEditPatchRejectionStage =
  | "provider_no_content"
  | "json_parse"
  | "schema_parse"
  | "normalization"
  | "scope_check"
  | "patch_apply"
  | "no_changed_files"
  | "validation";

export type FileEditPatchSchemaFailureCategory =
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

export type FileEditAttemptDiagnostics = {
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
  schemaFailureCategories: FileEditPatchSchemaFailureCategory[];
  normalizedEditCount: number;
  rejectionStage: FileEditPatchRejectionStage | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type FileEditLegacyAdapterInput = {
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

export type FileEditLegacyAdapterResult = {
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
  contextExpansionRequests: FileEditContextExpansionRequest[];
  editPlanSteps: FileEditPlanStep[];
  evidenceClaims: FileEditEvidenceClaim[];
  attemptDiagnostics: FileEditAttemptDiagnostics[];
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};
