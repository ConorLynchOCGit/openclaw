import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  createOperatorEquivalentYoloTargetAuthorityProfile,
  createStagedYoloBridgeAuthorityProfile,
  validateYoloBridgeAuthorityProfile,
  type YoloBridgeAuthorityProfile,
  type YoloBridgeAuthorityValidationReport,
} from "./yolo-bridge-authority.ts";

export type YoloCodeWritingPilotObjectiveRiskClass =
  | "ambitious_bounded_source_test_patch"
  | "blocked_too_large";

export type YoloCodeWritingPilotCandidate = {
  candidateId: string;
  title: string;
  objective: string;
  targetFiles: string[];
  expectedTests: string[];
  patchType: "source_test" | "source" | "docs";
  riskNotes?: string[];
};

export type YoloCodeWritingPilotObjectiveSelection = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_objective_selection";
  selectedObjective: YoloCodeWritingPilotCandidate | null;
  objectiveRiskClass: YoloCodeWritingPilotObjectiveRiskClass;
  rejectedCandidates: Array<YoloCodeWritingPilotCandidate & { rejectedReasons: string[] }>;
  blockingReasons: string[];
};

export type YoloSupabaseRuntimePersistenceGate = {
  artifactKind: "codex_bridge_yolo_supabase_runtime_persistence_gate";
  requiresSupabaseRuntimePersistence: true;
  supabaseRuntimePersistenceProven: boolean;
  runtimeResolverSource: string | null;
  runtimeLogicalDatabase: string | null;
  proofArtifactRefs: string[];
  blockingReasons: string[];
  warnings: string[];
};

export type YoloCodeWritingPilotRequestSkeleton = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_request_skeleton";
  requestId: string;
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  requestedMode: "yolo_oriented_code_writing_bridge_pilot";
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  operatorApprovalRequired: true;
  operatorApprovalSatisfied: false;
  enableLiveCodexPilot: false;
  enableYoloOrientedBridgePilot: false;
  enableOperatorEquivalentYolo: false;
  enableBoundedValidationRepair: false;
  acknowledgeSeparateExecutorSession: false;
  acknowledgeNoSharedManualSession: false;
  acknowledgeYoloAuthorityTarget: false;
  acknowledgeStagedAuthorityOnly: false;
  acknowledgeNoWorkQueueLifecycleMutation: true;
  acknowledgeNoAcp: true;
  acknowledgeNoSubagents: true;
  acknowledgeNoAutobailout: true;
  acknowledgeNoModelPromotion: true;
  acknowledgeNoInstallDeployOutbound: true;
  targetFiles: string[];
  approvedValidationCommands: string[];
  maxValidationRepairAttempts: number;
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  status: "planned_not_approved";
  commandExecuted: false;
  liveExecutionEnabled: false;
};

export type YoloCodeWritingPilotPromptPackage = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_prompt_package";
  promptPackageId: string;
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  objective: string;
  targetFiles: string[];
  allowedRepoScope: string[];
  stagedAuthorityProfileId: string;
  finalYoloAuthorityTargetStatement: string;
  approvedValidationCommands: string[];
  repairLoopInstructions: string[];
  rollbackInstructions: string[];
  prohibitedActions: string[];
  streamEvidenceExpectations: string[];
  closeoutRequirements: string[];
  processCompletionIsTaskSuccess: false;
  validationPassingRequiredForTaskSuccess: true;
  inertMetadataOnly: true;
};

export type YoloCodeWritingPilotPlanningGate = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_planning_gate";
  allowedToPlanNextPilot: boolean;
  allowedToCreateLiveRequest: boolean;
  allowedToRunLivePilot: false;
  blockingReasons: string[];
  executionBlockingReasons: string[];
  warnings: string[];
  requiredNextOperatorAction:
    | "request_explicit_operator_approval_for_next_yolo_oriented_live_bridge_pilot"
    | "fix_yolo_pilot_plan_blockers"
    | "refresh_supabase_runtime_persistence_proof";
};

export type YoloCodeWritingPilotPlan = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_plan";
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  createdAt: string;
  createdBy: string;
  pilotKind: "yolo_oriented_code_writing_bridge_pilot";
  planMode: "plan_only";
  selectedObjective: YoloCodeWritingPilotCandidate | null;
  objectiveRiskClass: YoloCodeWritingPilotObjectiveRiskClass;
  targetFiles: string[];
  maxFilesAllowed: number;
  allowedRepoScope: string[];
  authorityProfile: YoloBridgeAuthorityProfile;
  currentStageAuthority: YoloBridgeAuthorityProfile["currentlyGrantedAuthority"];
  targetYoloAuthority: YoloBridgeAuthorityProfile["targetFinalAuthority"];
  futureExecutionAuthorityRequested: boolean;
  futureExecutionAuthorityGranted: false;
  approvedValidationCommands: string[];
  maxValidationRepairAttempts: number;
  allowedShellCommandPolicy:
    | "approved_validation_commands_only"
    | "approved_repo_scope_with_validation_and_repair";
  validationLoopPlan: string[];
  repairLoopPlan: string[];
  rollbackPlan: string[];
  fileScopePolicy: string[];
  streamOversightPlan: string[];
  controlPlan: string[];
  closeoutPlan: string[];
  supabaseRuntimePersistenceRequirement: YoloSupabaseRuntimePersistenceGate;
  workQueueLink: JsonValue | null;
  workQueueLifecycleMutationAllowed: false;
  noAcp: true;
  noSubagents: true;
  noAutobailout: true;
  noModelPromotion: true;
  noInstallDeployOutbound: true;
  operatorApprovalRequired: true;
  operatorApprovalSatisfied: false;
  liveExecutionEnabled: false;
  codexCliInvoked: false;
  commandExecuted: false;
  allowedToCreateLiveRequest: boolean;
  allowedToRunLivePilot: false;
  blockingReasons: string[];
  requiredNextOperatorAction: YoloCodeWritingPilotPlanningGate["requiredNextOperatorAction"];
};

export type YoloCodeWritingPilotPlanResult = {
  artifactKind: "codex_bridge_yolo_code_writing_pilot_plan_result";
  objectiveSelection: YoloCodeWritingPilotObjectiveSelection;
  authorityValidation: YoloBridgeAuthorityValidationReport;
  supabaseRuntimePersistenceGate: YoloSupabaseRuntimePersistenceGate;
  planningGate: YoloCodeWritingPilotPlanningGate;
  plan: YoloCodeWritingPilotPlan;
  requestSkeleton: YoloCodeWritingPilotRequestSkeleton;
  promptPackage: YoloCodeWritingPilotPromptPackage;
};

const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_WORKSPACE_DOCS_PATH = "/root/.openclaw/workspace/docs/projects/execution-platform";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function forbiddenTargetReason(targetFile: string): string | null {
  const normalized = targetFile.replace(/\\/gu, "/");
  if (normalized.startsWith("../") || normalized.includes("/../")) {
    return "target_file_outside_allowed_paths";
  }
  const lower = normalized.toLowerCase();
  const forbidden = [
    ["package_lockfile", /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/u],
    ["migration", /(^|\/)(migrations|db\/migrations)\//u],
    ["runtime_config", /(^|\/)(\.env|openclaw\.json|config\/|src\/config\/)/u],
    ["secret", /(^|\/)(secrets?|credentials?)(\/|\.|$)/u],
    ["deployment", /(^|\/)(dockerfile|docker-compose|deploy|deployment|k8s|helm)(\/|\.|$)/u],
    ["provider_sdk_wiring", /provider|openrouter|deepseek|minimax|qwen|anthropic|openai/u],
    ["work_queue_lifecycle_ui", /work[-_]?queue.*(ui|component|page|button)|ui.*work[-_]?queue/u],
    ["acp_live_execution", /acp.*(live|runner|executor)|live.*acp/u],
    ["rebuild_autobailout_subagent", /rebuild|autobailout|subagent/u],
  ] as const;
  const match = forbidden.find(([, pattern]) => pattern.test(lower));
  return match ? `target_file_forbidden:${match[0]}` : null;
}

function targetRejectedReasons(input: {
  candidate: YoloCodeWritingPilotCandidate;
  repoPath: string;
  workspaceDocsPath: string;
  maxFilesAllowed: number;
}): string[] {
  const reasons: string[] = [];
  if (!input.candidate.candidateId.trim()) {
    reasons.push("missing_candidate_id");
  }
  if (!input.candidate.objective.trim()) {
    reasons.push("missing_objective");
  }
  if (input.candidate.targetFiles.length < 2) {
    reasons.push("objective_not_more_ambitious_than_slice_8u");
  }
  if (input.candidate.targetFiles.length > input.maxFilesAllowed) {
    reasons.push("too_many_target_files");
  }
  if (input.candidate.expectedTests.length === 0) {
    reasons.push("missing_expected_tests");
  }
  for (const targetFile of input.candidate.targetFiles) {
    const forbiddenReason = forbiddenTargetReason(targetFile);
    if (forbiddenReason) {
      reasons.push(forbiddenReason);
    }
    const absolute = path.isAbsolute(targetFile)
      ? path.normalize(targetFile)
      : path.resolve(input.repoPath, targetFile);
    const allowedRepo =
      absolute === input.repoPath || absolute.startsWith(`${input.repoPath}${path.sep}`);
    const allowedDocs =
      absolute === input.workspaceDocsPath ||
      absolute.startsWith(`${input.workspaceDocsPath}${path.sep}`);
    if (!allowedRepo && !allowedDocs) {
      reasons.push("target_file_outside_allowed_paths");
    }
  }
  if (input.candidate.patchType === "source" && input.candidate.targetFiles.length > 2) {
    reasons.push("source_patch_too_many_files_without_test");
  }
  if (
    input.candidate.riskNotes?.some((note) =>
      /broad|large|migration|rebuild|deploy|dependency|lockfile/iu.test(note),
    )
  ) {
    reasons.push("risk_notes_indicate_broad_or_blocked_work");
  }
  return [...new Set(reasons)];
}

export function defaultYoloCodeWritingPilotCandidates(): YoloCodeWritingPilotCandidate[] {
  return [
    {
      candidateId: "add-yolo-authority-profile-helper-and-tests",
      title: "Add YOLO authority profile helper and tests",
      objective:
        "Add a source helper and tests that model staged bridge authority separately from the final operator-equivalent YOLO target authority.",
      targetFiles: [
        "extensions/execution-platform/src/codex-bridge/yolo-bridge-authority.ts",
        "extensions/execution-platform/src/codex-bridge/yolo-bridge-authority.test.ts",
        "extensions/execution-platform/src/codex-bridge/index.ts",
      ],
      expectedTests: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/yolo-bridge-authority.test.ts",
      ],
      patchType: "source_test",
      riskNotes: ["three tightly related source/test/export files; no runtime behavior change"],
    },
    {
      candidateId: "extend-live-entrypoint-authority-scope",
      title: "Extend live entrypoint authority scope",
      objective:
        "Make staged authority scope explicit in the live code-writing request and preflight evidence.",
      targetFiles: [
        "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.ts",
        "extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
      ],
      expectedTests: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/code-writing-pilot-live-entrypoint.test.ts",
      ],
      patchType: "source_test",
      riskNotes: ["two related live-entrypoint files; no new live execution"],
    },
  ];
}

export function selectYoloCodeWritingPilotObjective(input: {
  candidates: YoloCodeWritingPilotCandidate[];
  repoPath?: string;
  workspaceDocsPath?: string;
  maxFilesAllowed?: number;
}): YoloCodeWritingPilotObjectiveSelection {
  const repoPath = path.resolve(input.repoPath ?? DEFAULT_REPO_PATH);
  const workspaceDocsPath = path.resolve(input.workspaceDocsPath ?? DEFAULT_WORKSPACE_DOCS_PATH);
  const maxFilesAllowed = input.maxFilesAllowed ?? 3;
  const scored = input.candidates.map((candidate) => ({
    ...candidate,
    rejectedReasons: targetRejectedReasons({
      candidate,
      repoPath,
      workspaceDocsPath,
      maxFilesAllowed,
    }),
  }));
  const safe = scored.filter((candidate) => candidate.rejectedReasons.length === 0);
  const selectedObjective =
    safe.find(
      (candidate) => candidate.candidateId === "add-yolo-authority-profile-helper-and-tests",
    ) ??
    safe[0] ??
    null;
  const blockingReasons = selectedObjective ? [] : ["no_safe_yolo_oriented_objective"];
  return {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_objective_selection",
    selectedObjective,
    objectiveRiskClass: selectedObjective
      ? "ambitious_bounded_source_test_patch"
      : "blocked_too_large",
    rejectedCandidates: scored.filter((candidate) => candidate.rejectedReasons.length > 0),
    blockingReasons,
  };
}

async function readJsonArtifact(pathname: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(pathname, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function evaluateYoloSupabaseRuntimePersistenceGate(
  input: {
    cwd?: string;
    persistenceProofPath?: string;
    smokeProofPath?: string;
  } = {},
): Promise<YoloSupabaseRuntimePersistenceGate> {
  const cwd = input.cwd ?? process.cwd();
  const persistencePath =
    input.persistenceProofPath ??
    path.resolve(
      cwd,
      ".artifacts/execution-platform/live-supabase-model-memory-persistence-proof-8k.json",
    );
  const smokePath =
    input.smokeProofPath ??
    path.resolve(cwd, ".artifacts/execution-platform/live-smoke-supabase-8k-result.json");
  const persistence = await readJsonArtifact(persistencePath);
  const smoke = await readJsonArtifact(smokePath);
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (!persistence) {
    blockingReasons.push("missing_supabase_persistence_proof_artifact");
  }
  if (!smoke) {
    warnings.push("missing_supabase_live_smoke_artifact");
  }
  const databaseName =
    typeof persistence?.databaseName === "string"
      ? persistence.databaseName
      : typeof smoke?.databaseName === "string"
        ? smoke.databaseName
        : null;
  const databaseSource =
    typeof persistence?.databaseSource === "string"
      ? persistence.databaseSource
      : typeof smoke?.databaseSource === "string"
        ? smoke.databaseSource
        : null;
  if (databaseName !== "model_memory") {
    blockingReasons.push("supabase_logical_database_not_proven");
  }
  if (!databaseSource?.includes("model-memory")) {
    blockingReasons.push("supabase_runtime_resolver_source_not_proven");
  }
  if (persistence?.codexCliInvoked !== false || persistence?.commandExecuted !== false) {
    blockingReasons.push("supabase_persistence_proof_must_be_non_codex");
  }
  if (
    !Array.isArray(persistence?.migrationNames) ||
    !persistence.migrationNames.includes("0001_execution_platform_runtime_jobs.sql") ||
    !persistence.migrationNames.includes("0002_execution_platform_work_queue_truth.sql")
  ) {
    blockingReasons.push("execution_platform_migrations_not_proven");
  }
  if (smoke && smoke.codexCliInvoked !== true) {
    warnings.push("supabase_smoke_did_not_record_codex_invocation");
  }
  return {
    artifactKind: "codex_bridge_yolo_supabase_runtime_persistence_gate",
    requiresSupabaseRuntimePersistence: true,
    supabaseRuntimePersistenceProven: blockingReasons.length === 0,
    runtimeResolverSource: databaseSource,
    runtimeLogicalDatabase: databaseName,
    proofArtifactRefs: [persistencePath, smokePath],
    blockingReasons,
    warnings,
  };
}

function validatePromptPackage(promptPackage: YoloCodeWritingPilotPromptPackage): string[] {
  const serialized = JSON.stringify(promptPackage).toLowerCase();
  const reasons: string[] = [];
  if (!serialized.includes("validation") || !serialized.includes("repair")) {
    reasons.push("prompt_package_missing_validation_repair_loop");
  }
  if (serialized.includes("single-shot") || serialized.includes("no validation loop")) {
    reasons.push("prompt_package_is_underpowered_single_shot");
  }
  if (promptPackage.processCompletionIsTaskSuccess) {
    reasons.push("prompt_package_treats_process_completion_as_task_success");
  }
  if (!promptPackage.validationPassingRequiredForTaskSuccess) {
    reasons.push("prompt_package_missing_validation_success_requirement");
  }
  return reasons;
}

function unsafeContentReasons(value: unknown): string[] {
  const serialized = JSON.stringify(value).toLowerCase();
  const patterns = [
    ["raw_prompt", /raw-prompt-marker/u],
    ["raw_transcript", /raw-transcript-marker/u],
    ["raw_tool_log", /raw-tool-log-marker/u],
    ["secret", /\bsk-[a-z0-9_-]{12,}|secret-marker/u],
    ["hidden_reasoning", /hidden-reasoning-marker/u],
    ["provider_prompt", /provider-prompt-marker/u],
  ] as const;
  return patterns
    .filter(([, pattern]) => pattern.test(serialized))
    .map(([reason]) => `prohibited_${reason}_content`);
}

export function evaluateYoloCodeWritingPilotPlanningGate(input: {
  objectiveSelection: YoloCodeWritingPilotObjectiveSelection;
  authorityValidation: YoloBridgeAuthorityValidationReport;
  supabaseRuntimePersistenceGate: YoloSupabaseRuntimePersistenceGate;
  promptPackage: YoloCodeWritingPilotPromptPackage;
  liveExecutionEnabled?: boolean;
  workQueueLifecycleMutationAllowed?: boolean;
  forbiddenFutureAuthorityRequested?: boolean;
}): YoloCodeWritingPilotPlanningGate {
  const blockingReasons = [
    ...input.objectiveSelection.blockingReasons,
    ...input.authorityValidation.blockingReasons,
    ...validatePromptPackage(input.promptPackage),
    ...unsafeContentReasons(input.promptPackage),
  ];
  const executionBlockingReasons: string[] = [];
  const warnings = [
    ...input.authorityValidation.warnings,
    ...input.supabaseRuntimePersistenceGate.warnings,
  ];
  if (!input.supabaseRuntimePersistenceGate.supabaseRuntimePersistenceProven) {
    executionBlockingReasons.push(...input.supabaseRuntimePersistenceGate.blockingReasons);
  }
  if (input.liveExecutionEnabled === true) {
    blockingReasons.push("live_execution_enabled_in_planning_slice");
  }
  if (input.workQueueLifecycleMutationAllowed === true) {
    blockingReasons.push("work_queue_lifecycle_mutation_not_allowed");
  }
  if (input.forbiddenFutureAuthorityRequested === true) {
    blockingReasons.push("forbidden_future_authority_requested");
  }
  const allowedToPlanNextPilot = blockingReasons.length === 0;
  const allowedToCreateLiveRequest = allowedToPlanNextPilot;
  const requiredNextOperatorAction = !allowedToPlanNextPilot
    ? "fix_yolo_pilot_plan_blockers"
    : executionBlockingReasons.length > 0
      ? "refresh_supabase_runtime_persistence_proof"
      : "request_explicit_operator_approval_for_next_yolo_oriented_live_bridge_pilot";
  return {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_planning_gate",
    allowedToPlanNextPilot,
    allowedToCreateLiveRequest,
    allowedToRunLivePilot: false,
    blockingReasons: [...new Set(blockingReasons)],
    executionBlockingReasons: [...new Set(executionBlockingReasons)],
    warnings: [...new Set(warnings)],
    requiredNextOperatorAction,
  };
}

function requestExpiry(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

export async function createYoloCodeWritingPilotPlan(input: {
  pilotPlanId?: string;
  requestId?: string;
  promptPackageId?: string;
  runtimeJobId: string;
  sessionId: string;
  createdBy: string;
  now?: Date;
  candidates?: YoloCodeWritingPilotCandidate[];
  repoPath?: string;
  workspaceDocsPath?: string;
  maxFilesAllowed?: number;
  maxValidationRepairAttempts?: number;
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  cwd?: string;
  workQueueLink?: JsonValue | null;
}): Promise<YoloCodeWritingPilotPlanResult> {
  const now = input.now ?? new Date();
  const repoPath = path.resolve(input.repoPath ?? DEFAULT_REPO_PATH);
  const workspaceDocsPath = path.resolve(input.workspaceDocsPath ?? DEFAULT_WORKSPACE_DOCS_PATH);
  const pilotPlanId = input.pilotPlanId ?? "yolo-code-writing-pilot-plan";
  const requestId = input.requestId ?? "yolo-code-writing-pilot-request";
  const promptPackageId = input.promptPackageId ?? "yolo-code-writing-pilot-prompt-package";
  const maxValidationRepairAttempts = input.maxValidationRepairAttempts ?? 3;
  const objectiveSelection = selectYoloCodeWritingPilotObjective({
    candidates: input.candidates ?? defaultYoloCodeWritingPilotCandidates(),
    repoPath,
    workspaceDocsPath,
    maxFilesAllowed: input.maxFilesAllowed ?? 3,
  });
  const selected = objectiveSelection.selectedObjective;
  const authorityProfile = createStagedYoloBridgeAuthorityProfile({
    authorityProfileId: `${pilotPlanId}-staged-authority`,
    currentStage: "approved_repo_files_and_validation_commands",
    metadata: {
      finalTargetProfile: createOperatorEquivalentYoloTargetAuthorityProfile({
        authorityProfileId: `${pilotPlanId}-target-yolo-authority`,
      }) as unknown as JsonValue,
    },
  });
  const authorityValidation = validateYoloBridgeAuthorityProfile(authorityProfile);
  const supabaseRuntimePersistenceGate = await evaluateYoloSupabaseRuntimePersistenceGate({
    cwd: input.cwd ?? process.cwd(),
  });
  const requestSkeleton: YoloCodeWritingPilotRequestSkeleton = {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_request_skeleton",
    requestId,
    pilotPlanId,
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    requestedMode: "yolo_oriented_code_writing_bridge_pilot",
    requestedBy: input.createdBy,
    requestedAt: now.toISOString(),
    expiresAt: requestExpiry(now, 24 * 60 * 60 * 1000),
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    enableLiveCodexPilot: false,
    enableYoloOrientedBridgePilot: false,
    enableOperatorEquivalentYolo: false,
    enableBoundedValidationRepair: false,
    acknowledgeSeparateExecutorSession: false,
    acknowledgeNoSharedManualSession: false,
    acknowledgeYoloAuthorityTarget: false,
    acknowledgeStagedAuthorityOnly: false,
    acknowledgeNoWorkQueueLifecycleMutation: true,
    acknowledgeNoAcp: true,
    acknowledgeNoSubagents: true,
    acknowledgeNoAutobailout: true,
    acknowledgeNoModelPromotion: true,
    acknowledgeNoInstallDeployOutbound: true,
    targetFiles: selected?.targetFiles ?? [],
    approvedValidationCommands: selected?.expectedTests ?? [],
    maxValidationRepairAttempts,
    maxRuntimeMs: input.maxRuntimeMs ?? 240_000,
    maxStdoutBytes: input.maxStdoutBytes ?? 768 * 1024,
    maxStderrBytes: input.maxStderrBytes ?? 128 * 1024,
    status: "planned_not_approved",
    commandExecuted: false,
    liveExecutionEnabled: false,
  };
  const promptPackage: YoloCodeWritingPilotPromptPackage = {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_prompt_package",
    promptPackageId,
    pilotPlanId,
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    objective: selected?.objective ?? "No safe YOLO-oriented objective selected.",
    targetFiles: selected?.targetFiles ?? [],
    allowedRepoScope: [repoPath],
    stagedAuthorityProfileId: authorityProfile.authorityProfileId,
    finalYoloAuthorityTargetStatement:
      "Final bridge target is operator-equivalent local YOLO authority with runtime oversight; this planned request grants no authority until explicit approval.",
    approvedValidationCommands: selected?.expectedTests ?? [],
    repairLoopInstructions: [
      "Use model reasoning to solve implementation and test failures inside the approved scope.",
      "Run only approved validation commands in the staged pilot.",
      "Repair within the target file list and validation attempt limit.",
      "Stop on file scope expansion, unsafe authority, or unresolved validation failure.",
    ],
    rollbackInstructions: [
      "Keep the patch reversible.",
      "If validation cannot pass, report needs-review and do not claim task success.",
    ],
    prohibitedActions: [
      "Do not mutate Work Queue lifecycle.",
      "Do not start ACP.",
      "Do not use subagents.",
      "Do not autobailout.",
      "Do not promote models.",
      "Do not install, deploy, or send outbound data.",
      "Do not accept shell command strings from runtime payloads.",
      "Do not store raw transcripts, provider prompts, hidden reasoning, secrets, or raw logs.",
    ],
    streamEvidenceExpectations: [
      "Emit stream events, heartbeat, process result, file scope report, validation report, and closeout pointer.",
      "Controls remain durable runtime truth via pause redirect cancel commands.",
    ],
    closeoutRequirements: [
      "Auto-emit Work Episode Outcome Pack after real bridge work.",
      "Manual full-slice closeout remains required for this planning turn.",
    ],
    processCompletionIsTaskSuccess: false,
    validationPassingRequiredForTaskSuccess: true,
    inertMetadataOnly: true,
  };
  const planningGate = evaluateYoloCodeWritingPilotPlanningGate({
    objectiveSelection,
    authorityValidation,
    supabaseRuntimePersistenceGate,
    promptPackage,
    liveExecutionEnabled: false,
    workQueueLifecycleMutationAllowed: false,
    forbiddenFutureAuthorityRequested: false,
  });
  const plan: YoloCodeWritingPilotPlan = {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_plan",
    pilotPlanId,
    runtimeJobId: input.runtimeJobId,
    sessionId: input.sessionId,
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    pilotKind: "yolo_oriented_code_writing_bridge_pilot",
    planMode: "plan_only",
    selectedObjective: selected,
    objectiveRiskClass: objectiveSelection.objectiveRiskClass,
    targetFiles: selected?.targetFiles ?? [],
    maxFilesAllowed: input.maxFilesAllowed ?? 3,
    allowedRepoScope: [repoPath],
    authorityProfile,
    currentStageAuthority: authorityProfile.currentlyGrantedAuthority,
    targetYoloAuthority: authorityProfile.targetFinalAuthority,
    futureExecutionAuthorityRequested: true,
    futureExecutionAuthorityGranted: false,
    approvedValidationCommands: selected?.expectedTests ?? [],
    maxValidationRepairAttempts,
    allowedShellCommandPolicy: "approved_validation_commands_only",
    validationLoopPlan: [
      "Future executor owns the approved validation command and bounded repair loop.",
      "Validation passing is required before task success.",
    ],
    repairLoopPlan: promptPackage.repairLoopInstructions,
    rollbackPlan: promptPackage.rollbackInstructions,
    fileScopePolicy: [
      "Future pilot may touch only selected target files.",
      "Unexpected file changes block task success.",
    ],
    streamOversightPlan: promptPackage.streamEvidenceExpectations,
    controlPlan: [
      "Durable pause redirect cancel controls remain runtime truth.",
      "No live Work Queue lifecycle mutation is implied by controls.",
    ],
    closeoutPlan: promptPackage.closeoutRequirements,
    supabaseRuntimePersistenceRequirement: supabaseRuntimePersistenceGate,
    workQueueLink: input.workQueueLink ?? null,
    workQueueLifecycleMutationAllowed: false,
    noAcp: true,
    noSubagents: true,
    noAutobailout: true,
    noModelPromotion: true,
    noInstallDeployOutbound: true,
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: false,
    liveExecutionEnabled: false,
    codexCliInvoked: false,
    commandExecuted: false,
    allowedToCreateLiveRequest: planningGate.allowedToCreateLiveRequest,
    allowedToRunLivePilot: false,
    blockingReasons: planningGate.blockingReasons,
    requiredNextOperatorAction: planningGate.requiredNextOperatorAction,
  };
  return {
    artifactKind: "codex_bridge_yolo_code_writing_pilot_plan_result",
    objectiveSelection,
    authorityValidation,
    supabaseRuntimePersistenceGate,
    planningGate,
    plan,
    requestSkeleton,
    promptPackage,
  };
}

export async function writeYoloCodeWritingPilotPlanArtifact(input: {
  result: YoloCodeWritingPilotPlanResult;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string; pilotPlanId: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/yolo-code-writing-pilot-plan-8v.json",
    );
  const bounded = boundDiagnosticJson(input.result as unknown as JsonValue, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 440,
    maxArrayItems: 260,
    maxDepth: 14,
    maxStringLength: 2_400,
  });
  await writeFile(artifactPath, `${JSON.stringify(bounded, null, 2)}\n`, "utf8");
  return { artifactPath, pilotPlanId: input.result.plan.pilotPlanId };
}
