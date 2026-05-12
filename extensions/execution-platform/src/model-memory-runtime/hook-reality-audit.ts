import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeHookAuditFinding,
  type MemoryRuntimeHookClassification,
  type MemoryRuntimeHookClosureEvidence,
  type MemoryRuntimeHookName,
  memoryRuntimeSafetyFlags,
} from "./types.ts";

const DEFAULT_FINDINGS: Array<{
  hookName: MemoryRuntimeHookName;
  pathRefs: string[];
  classification: MemoryRuntimeHookClassification;
  targetClassification: MemoryRuntimeHookClassification;
  boundedSummary: string;
  reasonCodes: string[];
}> = [
  {
    hookName: "assistant_turn_capture",
    pathRefs: [
      "src/auto-reply/reply/agent-runner.ts",
      "src/agents/model-memory/live-runtime/assistant-turn-capture.ts",
    ],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Assistant-turn capture exists but model interpretation is still invoked through the Model Memory live runtime executor path rather than a model-task runtime job.",
    reasonCodes: ["model_interpretation_requires_model_task_middleware"],
  },
  {
    hookName: "tool_result_proof_capture",
    pathRefs: [
      "src/agents/session-tool-result-guard-wrapper.ts",
      "src/agents/pi-embedded-subscribe.handlers.tools.ts",
      "src/agents/model-memory/live-runtime/tool-result-capture.ts",
    ],
    classification: "direct_approved_repository_write",
    targetClassification: "direct_approved_repository_write",
    boundedSummary:
      "Tool-result proof capture stores bounded facts through canonical Model Memory repositories; no model interpretation is required for this bounded proof path.",
    reasonCodes: ["bounded_repository_storage_owner_allowed"],
  },
  {
    hookName: "workflow_closeout_capture",
    pathRefs: [
      "extensions/execution-platform/src/codex-bridge/closeout-capsule.ts",
      "extensions/execution-platform/src/workers/bounded-workflow-worker-adapter.ts",
      "extensions/execution-platform/src/workers/acp-codex-coding-worker-adapter.ts",
    ],
    classification: "middleware_backed_runtime_job",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Workflow closeout capture is anchored to runtime job artifacts and Closeout Capsule refs.",
    reasonCodes: ["runtime_closeout_capsule_refs_present"],
  },
  {
    hookName: "closeout_opportunity_seed_projection",
    pathRefs: ["extensions/execution-platform/src/work-queue/closeout-capsule-opportunities.ts"],
    classification: "direct_db_write",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Closeout Capsule opportunity seed projection exists but should run through DB-operation middleware when it affects Work Queue opportunity items.",
    reasonCodes: ["work_queue_affecting_write_requires_db_operation_middleware"],
  },
  {
    hookName: "retrieval_request_interpretation",
    pathRefs: [
      "src/agents/model-memory/live-runtime/retrieval-context.ts",
      "extensions/model-memory/src/retrieval.ts",
    ],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Retrieval request interpretation is still reached through the Model Memory retrieval executor path and should use retrieval model-task middleware.",
    reasonCodes: ["retrieval_interpretation_requires_model_task_middleware"],
  },
  {
    hookName: "retrieval_final_inclusion_review",
    pathRefs: [
      "src/agents/model-memory/live-runtime/runtime-deps.ts",
      "extensions/model-memory/src/retrieval.ts",
    ],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Retrieval final inclusion review is model-authored and should use model-task middleware before context-pack insertion.",
    reasonCodes: ["retrieval_final_review_requires_model_task_middleware"],
  },
  {
    hookName: "context_pack_assembly",
    pathRefs: ["src/agents/model-memory/live-runtime/retrieval-context.ts"],
    classification: "direct_context_insertion",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Context files are assembled directly from projections, retrieval artifacts, and extra memory packs; a single budget owner is required.",
    reasonCodes: ["context_pack_budget_owner_required"],
  },
  {
    hookName: "context_pack_insertion",
    pathRefs: ["src/agents/model-memory/live-runtime/retrieval-context.ts"],
    classification: "direct_context_insertion",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Context insertion is direct and must be gated by explicit budget, stale-pack, and route-memory policy decisions.",
    reasonCodes: ["context_insertion_requires_route_policy_and_budget"],
  },
  {
    hookName: "skillifier",
    pathRefs: ["src/gateway/server-methods/model-memory-proactivity.ts"],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Skillifier behavior is reachable from proactivity handlers and must use model-task middleware for model-authored drafting.",
    reasonCodes: ["skillifier_model_work_requires_model_task_middleware"],
  },
  {
    hookName: "proactivity_opportunity_extraction",
    pathRefs: ["src/infra/model-memory-proactivity-runtime.ts"],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Proactivity candidate review/extraction can instantiate direct JSON executors and should use proactivity model-task middleware.",
    reasonCodes: ["proactivity_extraction_requires_model_task_middleware"],
  },
  {
    hookName: "proactivity_merge_adjudication",
    pathRefs: ["src/infra/model-memory-proactivity-runtime.ts"],
    classification: "direct_model_call",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Proactivity merge/adjudication is model-authored judgment and should use model-task middleware.",
    reasonCodes: ["proactivity_merge_requires_model_task_middleware"],
  },
  {
    hookName: "heartbeat_proactivity_surfacing",
    pathRefs: ["src/infra/heartbeat-runner.ts", "src/infra/model-memory-proactivity-runtime.ts"],
    classification: "direct_context_insertion",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Heartbeat proactivity surfacing builds prompt context from projected items and must remain bounded and model-authored-source only.",
    reasonCodes: ["heartbeat_context_requires_bounded_projection_refs"],
  },
  {
    hookName: "work_queue_opportunity_creation",
    pathRefs: ["extensions/execution-platform/src/work-queue/closeout-capsule-opportunities.ts"],
    classification: "direct_db_write",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Work Queue opportunity creation is a Work Queue-affecting DB write and should have DB-operation middleware evidence.",
    reasonCodes: ["work_queue_write_requires_db_operation_middleware"],
  },
  {
    hookName: "manual_compact",
    pathRefs: ["src/auto-reply/reply/commands-compact.ts"],
    classification: "direct_context_insertion",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Manual compact is a fallback context-management path and must share the same budget/over-limit evidence as automatic compaction.",
    reasonCodes: ["compact_requires_live_over_limit_proof"],
  },
  {
    hookName: "automatic_compaction",
    pathRefs: ["src/auto-reply/reply/agent-runner-memory.ts"],
    classification: "direct_context_insertion",
    targetClassification: "middleware_backed_runtime_job",
    boundedSummary:
      "Automatic/preflight compaction exists and must be proven against real over-limit session state before default context insertion can be trusted.",
    reasonCodes: ["automatic_compaction_requires_live_session_budget_proof"],
  },
];

export type MemoryRuntimeRealityAudit = {
  artifactKind: "model_memory_runtime_hook_reality_audit";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "passed" | "needs_review" | "blocked";
  totalHooks: number;
  unknownHooks: 0;
  migrationRequiredCount: number;
  findings: MemoryRuntimeHookAuditFinding[];
  migrationMap: Array<{
    hookName: MemoryRuntimeHookName;
    from: MemoryRuntimeHookClassification;
    to: MemoryRuntimeHookClassification;
    reasonCodes: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type MemoryRuntimeMaximalityHookGate = {
  artifactKind: "model_memory_runtime_hook_maximality_gate";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "passed" | "failed";
  totalHooks: number;
  passedHooks: number;
  failedHooks: number;
  hookTable: MemoryRuntimeHookClosureEvidence[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  controlsApplied: false;
  deployPerformed: false;
  outboundSendPerformed: false;
  modelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

export function buildModelMemoryRuntimeHookRealityAudit(): MemoryRuntimeRealityAudit {
  const findings: MemoryRuntimeHookAuditFinding[] = DEFAULT_FINDINGS.map((finding) => {
    const migrationRequired = finding.classification !== finding.targetClassification;
    return {
      ...finding,
      migrationRequired,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    };
  });
  const migrationMap = findings
    .filter((finding) => finding.migrationRequired)
    .map((finding) => ({
      hookName: finding.hookName,
      from: finding.classification,
      to: finding.targetClassification,
      reasonCodes: finding.reasonCodes,
    }));
  return {
    artifactKind: "model_memory_runtime_hook_reality_audit",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status: "passed",
    totalHooks: findings.length,
    unknownHooks: 0,
    migrationRequiredCount: migrationMap.length,
    findings,
    migrationMap,
    ...memoryRuntimeSafetyFlags(),
  };
}

const REQUIRED_CLOSURE_HOOKS: MemoryRuntimeHookName[] = DEFAULT_FINDINGS.filter(
  (finding) => finding.classification !== finding.targetClassification,
).map((finding) => finding.hookName);

function hookClosureFailureReasons(evidence: MemoryRuntimeHookClosureEvidence): string[] {
  return [
    ...(evidence.oldPathRefs.length === 0 ? ["old_path_refs_missing"] : []),
    ...(evidence.newProductionPathRefs.length === 0 ? ["new_production_path_refs_missing"] : []),
    ...(evidence.middlewareRuntimeJobEvidenceRefs.length === 0
      ? ["middleware_runtime_job_evidence_missing"]
      : []),
    ...(evidence.liveUxWorkflowEvidenceRefs.length === 0
      ? ["live_ux_workflow_evidence_missing"]
      : []),
    ...(evidence.qualitativeResult.status !== "passed" ? ["qualitative_result_not_passed"] : []),
    ...(evidence.artifactRefs.length === 0 ? ["artifact_refs_missing"] : []),
    ...(evidence.finalStatus !== "passed" ? ["final_status_not_passed"] : []),
    ...(evidence.rawPromptStored ||
    evidence.rawResponseStored ||
    evidence.rawProviderLogStored ||
    evidence.rawToolLogStored ||
    evidence.rawDbRowsStored
      ? ["raw_storage_flag_detected"]
      : []),
    ...(evidence.workQueueLifecycleMutated ? ["work_queue_lifecycle_mutated"] : []),
  ];
}

export function buildModelMemoryRuntimeHookMaximalityGate(input: {
  hookTable: MemoryRuntimeHookClosureEvidence[];
}): MemoryRuntimeMaximalityHookGate {
  const tableByHook = new Map(input.hookTable.map((row) => [row.hookName, row]));
  const hookTable = REQUIRED_CLOSURE_HOOKS.map((hookName) => tableByHook.get(hookName)).filter(
    (row): row is MemoryRuntimeHookClosureEvidence => Boolean(row),
  );
  const missingHooks = REQUIRED_CLOSURE_HOOKS.filter((hookName) => !tableByHook.has(hookName));
  const failedRows = hookTable.flatMap((row) =>
    hookClosureFailureReasons(row).map((reason) => `${row.hookName}:${reason}`),
  );
  const reasonCodes = [
    ...missingHooks.map((hookName) => `${hookName}:hook_closure_evidence_missing`),
    ...failedRows,
  ];
  const passedHooks = hookTable.filter((row) => hookClosureFailureReasons(row).length === 0).length;
  const status =
    missingHooks.length === 0 &&
    hookTable.length === REQUIRED_CLOSURE_HOOKS.length &&
    reasonCodes.length === 0
      ? "passed"
      : "failed";
  return {
    artifactKind: "model_memory_runtime_hook_maximality_gate",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status,
    totalHooks: REQUIRED_CLOSURE_HOOKS.length,
    passedHooks,
    failedHooks: REQUIRED_CLOSURE_HOOKS.length - passedHooks,
    hookTable,
    reasonCodes: status === "passed" ? ["all_required_memory_runtime_hooks_closed"] : reasonCodes,
    ...memoryRuntimeSafetyFlags(),
  };
}
