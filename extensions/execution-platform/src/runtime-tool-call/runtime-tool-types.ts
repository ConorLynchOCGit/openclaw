import type { JsonValue } from "../runtime-job-repository.ts";

export type RuntimeToolStatus =
  | "planned"
  | "running"
  | "succeeded"
  | "needs_review"
  | "failed"
  | "canceled"
  | "skipped";

export type RuntimeToolFamily =
  | "router.front_door"
  | "scheduler.decompose_graph"
  | "scheduler.select_next_node"
  | "scheduler.evaluate_node_result"
  | "scheduler.repair_decision"
  | "node.resource_materialization"
  | "artifact.payload"
  | "source_prompt.context"
  | "context_scout.tool_loop"
  | "code_intelligence.query"
  | "model.call"
  | "worker.invoke"
  | "coding.compound"
  | "edit_transaction.lifecycle"
  | "file_edit.propose"
  | "file_edit.apply"
  | "validation.plan"
  | "validation.run"
  | "validation.result"
  | "validation.review"
  | "qa.review"
  | "db_operation.execute"
  | "script.execute"
  | "work_queue.project_event"
  | "human_task.request"
  | "human_task.resume"
  | "closeout.generate"
  | "closeout.finalize"
  | "memory.retrieve"
  | "memory.capture"
  | "research.fetch"
  | "product_spec_planning.create_spec"
  | "product_spec_planning.review_spec"
  | "product_spec_planning.validate_spec"
  | "product_spec_planning.generate_spec"
  | "diagnostic.bounded";

export type RuntimeToolAuthorityClass =
  | "read_only"
  | "bounded_runtime_write"
  | "bounded_repo_write"
  | "bounded_db_write"
  | "human_operator"
  | "diagnostic";

export type RuntimeToolStoragePolicy = {
  maxInputSummaryChars: number;
  maxOutputSummaryChars: number;
  maxEventSummaryChars: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type RuntimeToolDefinition = {
  toolId: string;
  toolVersion: string;
  toolFamily: RuntimeToolFamily;
  executorKey: string;
  schemaRef: string;
  authorityClass: RuntimeToolAuthorityClass;
  defaultTimeoutMs?: number | null;
  storagePolicy: RuntimeToolStoragePolicy;
  enabled: boolean;
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolBudget = {
  budgetRef?: string | null;
  timeoutMs?: number | null;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  maxCostUsd?: number | null;
  metadata?: JsonValue;
};

export type RuntimeToolInvocationRef = {
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  parentInvocationId?: string | null;
};

export type RuntimeToolInvocationInput = RuntimeToolInvocationRef & {
  invocationId?: string;
  toolId: string;
  toolVersion?: string;
  roleRef?: string | null;
  modelRef?: string | null;
  providerRef?: string | null;
  idempotencyScope: string;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  /**
   * Volatile executor-only input. This is intentionally not persisted by the
   * trace repository and is for data such as provider prompts that must be
   * available to an executor without becoming stored trace content.
   */
  volatileInput?: unknown;
  budget?: RuntimeToolBudget;
  metadata?: JsonValue;
  abortSignal?: AbortSignal;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored?: false;
  rawProviderLogStored?: false;
  rawToolLogStored?: false;
  rawCommandLogStored?: false;
  rawDbRowsStored?: false;
  secretsStored?: false;
  authorityGranted?: false;
  controlsApplied?: false;
  workQueueLifecycleMutated?: false;
  runtimeLifecycleMutated?: false;
};

export type RuntimeToolEventInput = RuntimeToolInvocationRef & {
  invocationId: string;
  eventId?: string;
  eventType: string;
  phase: string;
  status: RuntimeToolStatus;
  messageSummary: string;
  evidenceRef?: string | null;
  evidenceHash?: string | null;
  reasonCodes?: string[];
  metadata?: JsonValue;
  rawPromptStored?: false;
  rawResponseStored?: false;
  rawTranscriptStored?: false;
  rawProviderLogStored?: false;
  rawToolLogStored?: false;
  rawCommandLogStored?: false;
  rawDbRowsStored?: false;
  secretsStored?: false;
};

export type RuntimeToolCompletionInput = {
  invocationId: string;
  status: Extract<
    RuntimeToolStatus,
    "succeeded" | "needs_review" | "failed" | "canceled" | "skipped"
  >;
  outputRef?: string | null;
  outputHash?: string | null;
  outputSummary?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  reasonCodes?: string[];
  metadata?: JsonValue;
};

export type RuntimeToolCancelInput = {
  invocationId: string;
  canceledByRef?: string | null;
  reasonCodes?: string[];
  cancelSummary?: string | null;
  metadata?: JsonValue;
};

export type RuntimeToolInvocationCursorPage = {
  items: RuntimeToolInvocationRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type RuntimeToolRetentionPolicy = {
  dryRun?: boolean;
  maxAgeDays?: number | null;
  maxCompletedRowsPerRuntimeJob?: number | null;
  maxCompletedRowsPerGraph?: number | null;
  maxDelete?: number | null;
  idempotencyScopePrefix?: string | null;
  toolIdPrefix?: string | null;
  preserveStatuses?: RuntimeToolStatus[];
  pruneStatuses?: RuntimeToolStatus[];
  preserveArtifactBacked?: boolean;
};

export type RuntimeToolRetentionResult = {
  dryRun: boolean;
  inspectedCount: number;
  candidateCount: number;
  prunedCount: number;
  preservedCount: number;
  candidateRefs: string[];
  prunedRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolArtifactInput = {
  artifactId?: string;
  invocationId: string;
  artifactType: string;
  storageKind: "metadata" | "ref" | "hash" | "artifact";
  artifactRef: string;
  contentHash: string;
  boundedSummary: string;
  metadata?: JsonValue;
  rawContentStored?: false;
  rawPromptStored?: false;
  rawResponseStored?: false;
  rawLogsStored?: false;
  secretsStored?: false;
};

export type RuntimeToolInvocationRecord = RuntimeToolInvocationRef & {
  invocationId: string;
  toolId: string;
  toolVersion: string;
  toolFamily: RuntimeToolFamily;
  executorKey: string;
  roleRef: string | null;
  modelRef: string | null;
  providerRef: string | null;
  status: RuntimeToolStatus;
  idempotencyScope: string;
  idempotencyKey: string;
  inputRef: string | null;
  inputHash: string | null;
  inputSummary: string;
  outputRef: string | null;
  outputHash: string | null;
  outputSummary: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  budgetRef: string | null;
  budgetSummary: JsonValue;
  reasonCodes: string[];
  metadata: JsonValue;
  startedAt: string | null;
  completedAt: string | null;
  latencyMs: number | null;
  createdAt: string;
  updatedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  runtimeLifecycleMutated: false;
};

export type RuntimeToolReadbackSummary = {
  invocationCount: number;
  latestInvocation: RuntimeToolInvocationRecord | null;
  activeInvocation: RuntimeToolInvocationRecord | null;
  invocationRefs: string[];
  latestPhase: string | null;
  latestToolId: string | null;
  latestStatus: RuntimeToolStatus | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type RuntimeToolExecutorInput = RuntimeToolInvocationInput & {
  definition: RuntimeToolDefinition;
  abortSignal?: AbortSignal;
};

export type RuntimeToolExecutorResult = {
  status: Extract<RuntimeToolStatus, "succeeded" | "needs_review" | "failed" | "skipped">;
  outputRef?: string | null;
  outputHash?: string | null;
  outputSummary?: string | null;
  reasonCodes?: string[];
  artifacts?: RuntimeToolArtifactInput[];
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored?: false;
  rawToolLogStored?: false;
  rawCommandLogStored?: false;
  rawDbRowsStored?: false;
};

export type RuntimeToolExecutor = {
  execute(input: RuntimeToolExecutorInput): Promise<RuntimeToolExecutorResult>;
};
