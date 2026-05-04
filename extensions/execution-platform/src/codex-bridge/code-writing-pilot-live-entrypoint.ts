import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type {
  CodeWritingPilotPlan,
  CodeWritingPilotPromptPackage,
  CodeWritingPilotRequestSkeleton,
} from "./code-writing-pilot-plan.ts";
import {
  type CodexJsonlParseResult,
  type CodexProcessDescriptor,
  normalizeParsedCodexJsonlEvent,
  parseCodexJsonlEventLine,
} from "./execution-supervisor.ts";
import {
  LiveCodexRunner,
  validateLiveCodexRunnerDescriptorOnly,
  type LiveCodexRunnerOptions,
  type LiveCodexRunnerResult,
} from "./live-codex-runner.ts";
import { CODEX_BRIDGE_JOB_TYPE, type CodexBridgeNormalizedStreamEvent } from "./types.ts";
import { ExecutionPlatformWorkEpisodeCloseoutRepository } from "./work-episode-closeout.ts";

const CODE_WRITING_PILOT_LIVE_REQUEST_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_live_request";
const CODE_WRITING_PILOT_LIVE_PREFLIGHT_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_live_preflight";
const CODE_WRITING_PILOT_PROCESS_RESULT_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_process_result";
const CODE_WRITING_PILOT_FILE_SCOPE_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_file_scope_report";
const CODE_WRITING_PILOT_VALIDATION_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_validation_report";
const CODE_WRITING_PILOT_LIVE_RESULT_ARTIFACT_TYPE = "codex_bridge.code_writing_pilot_live_result";
const CODE_WRITING_PILOT_STARTED_EVENT_TYPE = "codex_bridge.code_writing_pilot_started";
const CODE_WRITING_PILOT_STREAM_EVENT_TYPE = "codex_bridge.code_writing_pilot_stream_event";
const CODE_WRITING_PILOT_HEARTBEAT_EVENT_TYPE = "codex_bridge.code_writing_pilot_heartbeat";
const CODE_WRITING_PILOT_COMPLETED_EVENT_TYPE = "codex_bridge.code_writing_pilot_completed";
const DEFAULT_MAX_CODE_WRITING_LIVE_METADATA_BYTES = 96 * 1024;
const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_WORKSPACE_DOCS_PATH = "/root/.openclaw/workspace/docs/projects/execution-platform";

export type CodeWritingPilotExecutionApproval = {
  approvedBy: string;
  approvedAt: string;
  approvalScope: "single_code_writing_bridge_pilot";
  runtimeJobId: string;
  pilotPlanId: string;
  requestId: string;
  promptPackageId: string;
  sessionId: string;
  enableLiveCodexPilot: boolean;
  enableCodeWritingBridgePilot: boolean;
  acknowledgeSeparateExecutorSession: true;
  acknowledgeNoSharedManualSession: true;
  acknowledgeCodeWritingRisk: true;
  acknowledgeNoRebuild: true;
  acknowledgeNoAutobailout: true;
  acknowledgeNoSubagents: true;
  acknowledgeNoWorkQueueLifecycleMutation: true;
  enableBoundedValidationRepair?: boolean;
  acknowledgeApprovedValidationCommandAuthority?: true;
  approvedValidationCommands?: string[];
  maxValidationRepairAttempts?: number;
  approvedTargetFiles: string[];
  approvedRepoScopePaths?: string[];
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  reason: string;
};

export type CodeWritingPilotValidationEvidence = {
  command: string;
  status: "passed" | "failed" | "not_run";
  summary: string;
  checkedAt: string;
};

export type CodeWritingPilotFileScopeReport = {
  artifactKind: "codex_bridge_code_writing_pilot_file_scope_report";
  approvedTargetFiles: string[];
  approvedRepoScopePaths: string[];
  actualFilesChanged: string[];
  unexpectedFilesChanged: string[];
  approvedFileHashesBefore: Record<string, string | null>;
  approvedFileHashesAfter: Record<string, string | null>;
  fileScopeSatisfied: boolean;
};

export type CodeWritingPilotLiveRequest = {
  artifactKind: "codex_bridge_code_writing_pilot_live_request";
  liveCodeWritingPilotRunId: string;
  runtimeJobId: string;
  pilotPlanId: string;
  requestId: string;
  promptPackageId: string;
  sessionId: string;
  operatorApproval: CodeWritingPilotExecutionApproval;
  liveExecutionEnabled: true;
  commandExecuted: false;
};

export type CodeWritingPilotLivePreflight = {
  artifactKind: "codex_bridge_code_writing_pilot_live_preflight";
  liveCodeWritingPilotRunId: string;
  runtimeJobId: string;
  allowed: boolean;
  blockingReasons: string[];
  descriptor: CodexProcessDescriptor | null;
  commandAllowlisted: boolean;
  internallyMaterializedDescriptor: boolean;
  targetScopeVerified: boolean;
};

export type CodeWritingPilotLiveSuccessCriteria = {
  preRunGatesPassed: boolean;
  codexInvokedThroughBridgePath: boolean;
  commandExecutionAllowlisted: boolean;
  processResultRecorded: boolean;
  streamOrProcessEvidenceRecorded: boolean;
  fileScopeSatisfied: boolean;
  focusedValidationPassed: boolean;
  workQueueLifecycleNotMutated: true;
  noRebuildAutobailoutSubagentAcpPromotionInstallDeployOutbound: boolean;
  closeoutPackEmitted: boolean;
  validationRecovery: {
    status: "validation_passed" | "validation_failed" | "validation_not_run" | "needs_review";
    reason: string;
    validationEvidence: CodeWritingPilotValidationEvidence | null;
  };
  completedWorkPathSatisfied: boolean;
};

export type CodeWritingPilotLiveResult = {
  artifactKind: "codex_bridge_code_writing_pilot_live_result";
  liveCodeWritingPilotRunId: string;
  runtimeJobId: string;
  pilotPlanId: string;
  requestId: string;
  promptPackageId: string;
  sessionId: string;
  startedAt: string;
  completedAt: string;
  operatorApprovedBy: string;
  executorSessionIsSeparate: true;
  manualOperatorSessionSharedWithExecutor: false;
  selectedObjectiveId: string | null;
  approvedTargetFiles: string[];
  actualFilesChanged: string[];
  fileScopeSatisfied: boolean;
  codexCliInvoked: boolean;
  commandExecuted: boolean;
  liveExecutionEnabled: boolean;
  processResult: LiveCodexRunnerResult | null;
  eventCount: number;
  finalResponsePresent: boolean;
  finalResponseCandidate: string | null;
  executorValidationCommandAllowed: boolean;
  approvedValidationCommands: string[];
  validationRepairMaxAttempts: number;
  diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only";
  shellCommandAuthorityScope:
    | "none"
    | "approved_validation_commands_only"
    | "operator_equivalent_yolo_future";
  validationEvidence: CodeWritingPilotValidationEvidence | null;
  validationRecovery: {
    status: "validation_passed" | "validation_failed" | "validation_not_run" | "needs_review";
    reason: string;
    validationEvidence: CodeWritingPilotValidationEvidence | null;
  };
  completedWorkPathSatisfied: boolean;
  completedWorkPathReason: string;
  workEpisodeCloseout: {
    emitted: boolean;
    packPath: string | null;
    packHash: string | null;
    eligibilityStatus: string | null;
  };
  workQueueLifecycleMutated: false;
  rebuildPerformed: false;
  autobailoutPerformed: false;
  subagentStarted: false;
  acpSessionStarted: false;
  providerCallMadeDirectly: false;
  modelPromotionPerformed: false;
  installDeployOutboundPerformed: false;
  blockingReasons: string[];
  successCriteria: CodeWritingPilotLiveSuccessCriteria;
};

export type RunCodeWritingPilotLiveInput = {
  liveCodeWritingPilotRunId?: string;
  plan: CodeWritingPilotPlan;
  requestSkeleton: CodeWritingPilotRequestSkeleton;
  promptPackage: CodeWritingPilotPromptPackage;
  approval: CodeWritingPilotExecutionApproval;
  runner?: LiveCodexRunner;
  liveRunnerOptions?: LiveCodexRunnerOptions;
  changedFilesAfterRun?: string[];
  changedFilesProvider?: () => Promise<string[]>;
};

export type FinalizeCodeWritingPilotLiveInput = {
  runtimeJobId: string;
  liveCodeWritingPilotRunId: string;
  validationEvidence: CodeWritingPilotValidationEvidence;
  changedFilesAfterValidation?: string[];
};

export type CodeWritingPilotLiveEntrypointOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
  repoPath?: string;
  workspaceDocsPath?: string;
  closeoutRepository?: ExecutionPlatformWorkEpisodeCloseoutRepository;
  closeoutArtifactRoot?: string;
};

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function boundApprovedValidationCommandMetadata(commands: readonly string[]): string[] {
  const bounded = boundLivePilotMetadata([...commands] as unknown as JsonValue);
  return Array.isArray(bounded)
    ? bounded.filter((item): item is string => typeof item === "string")
    : [];
}

function boundLivePilotMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 360,
    maxArrayItems: 220,
    maxDepth: 12,
    maxStringLength: 2_000,
  });
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

async function fileHash(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

function relativeTargetPath(repoPath: string, targetFile: string): string {
  return path.isAbsolute(targetFile) ? path.relative(repoPath, targetFile) : targetFile;
}

function targetAbsolutePath(repoPath: string, targetFile: string): string {
  return path.isAbsolute(targetFile) ? targetFile : path.resolve(repoPath, targetFile);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].toSorted();
}

function isWithinScope(file: string, scopePath: string): boolean {
  const repoRootScopePath = scopePath.replaceAll("\\", "/").replace(/\/+$/, "");
  if (repoRootScopePath === ".") {
    const repoRootScopeFile = file.replaceAll("\\", "/").replace(/^\.\//, "");
    return repoRootScopeFile !== ".." && !repoRootScopeFile.startsWith("../");
  }
  const normalizedFile = file.replaceAll("\\", "/").replace(/^\/+/, "");
  const normalizedScopePath = scopePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (normalizedScopePath === "" || normalizedScopePath === ".") {
    return true;
  }
  const normalizedScope = normalizedScopePath.replace(/\/?$/, "/");
  return (
    normalizedFile === normalizedScope.slice(0, -1) || normalizedFile.startsWith(normalizedScope)
  );
}

function validationRepairAuthority(input: { approval: CodeWritingPilotExecutionApproval }): {
  enabled: boolean;
  commands: string[];
  maxAttempts: number;
} {
  const commands = input.approval.approvedValidationCommands ?? [];
  return {
    enabled:
      input.approval.enableBoundedValidationRepair === true &&
      input.approval.acknowledgeApprovedValidationCommandAuthority === true &&
      commands.length > 0,
    commands,
    maxAttempts: input.approval.maxValidationRepairAttempts ?? 1,
  };
}

function promptText(input: {
  objective: string;
  approvedTargetFiles: string[];
  approvedRepoScopePaths: string[];
  validationRepair: ReturnType<typeof validationRepairAuthority>;
}): string {
  const validationRepair = input.validationRepair.enabled
    ? [
        "You may run only the approved validation commands listed below, and only to validate this patch.",
        "Approved validation commands:",
        ...input.validationRepair.commands.map((command) => `- ${command}`),
        `Maximum validation/repair attempts: ${input.validationRepair.maxAttempts}`,
        "If validation fails, inspect the bounded failure output, repair only the approved file, and rerun only approved validation commands within the attempt limit.",
        "Do not run commands outside the approved validation command list.",
        "Do not run any other shell command.",
      ]
    : ["Do not run shell commands."];
  const scopeLines =
    input.approvedRepoScopePaths.length > 0
      ? [
          "Modify only files under the approved repo scope paths listed below.",
          `Approved repo scope paths: ${input.approvedRepoScopePaths.join(", ")}`,
        ]
      : [
          "Modify only the approved file listed below.",
          `Approved file: ${input.approvedTargetFiles.join(", ")}`,
        ];
  return [
    "You are a separate bridge-launched Codex executor session.",
    "This bridge is designed to evolve toward operator-equivalent YOLO execution, so solve the task like a real implementation loop within the explicit authority bounds below.",
    ...scopeLines,
    `Objective: ${input.objective}`,
    "Do not modify any other file.",
    ...validationRepair,
    "Do not rebuild.",
    "Do not install dependencies.",
    "Do not use subagents.",
    "Do not start ACP.",
    "Do not mutate Work Queue lifecycle.",
    "Do not promote models.",
    "Do not deploy or send outbound data.",
    "Do not store raw transcripts, hidden reasoning, secrets, or raw logs.",
    "Keep the patch minimal.",
    "Return a short final response summarizing the source/test patch and the approved validation command results.",
  ].join("\n");
}

function materializeDescriptor(input: {
  runtimeJobId: string;
  promptPackageId: string;
  repoPath: string;
  prompt: string;
  maxRuntimeMs: number;
}): CodexProcessDescriptor {
  return {
    artifactKind: "codex_process_descriptor",
    descriptorId: `codex-process-${input.runtimeJobId}`,
    command: "codex",
    args: ["exec", "--json", "--cd", input.repoPath, input.prompt],
    cwd: input.repoPath,
    envPolicy: {
      secretsIncluded: false,
      inheritedEnvAllowed: false,
    },
    promptStrategy: "inline_finalized_prompt_text",
    expectedStdout: "jsonl_events",
    expectedStderr: "progress_events",
    expectedStream: "codex_exec_jsonl",
    maxRuntimeMs: input.maxRuntimeMs,
    executionAllowed: true,
    sourcePackageId: input.promptPackageId,
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
    commandExecuted: false,
  };
}

function approvalBlockingReasons(input: {
  plan: CodeWritingPilotPlan;
  requestSkeleton: CodeWritingPilotRequestSkeleton;
  promptPackage: CodeWritingPilotPromptPackage;
  approval: CodeWritingPilotExecutionApproval;
  repoPath: string;
  workspaceDocsPath: string;
}): string[] {
  const reasons: string[] = [];
  if (!input.approval.approvedBy) {
    reasons.push("operator_approval_required");
  }
  if (!input.approval.enableLiveCodexPilot) {
    reasons.push("enable_live_codex_pilot_required");
  }
  if (!input.approval.enableCodeWritingBridgePilot) {
    reasons.push("enable_code_writing_bridge_pilot_required");
  }
  if (!input.plan.allowedToCreateLiveRequest) {
    reasons.push("slice_8s_plan_not_allowed_to_create_live_request");
  }
  if (input.plan.allowedToRunLivePilot) {
    reasons.push("slice_8s_plan_must_not_be_preapproved_to_run");
  }
  if (
    input.plan.pilotPlanId !== input.approval.pilotPlanId ||
    input.requestSkeleton.requestId !== input.approval.requestId ||
    input.promptPackage.promptPackageId !== input.approval.promptPackageId ||
    input.plan.runtimeJobId !== input.approval.runtimeJobId ||
    input.plan.sessionId !== input.approval.sessionId
  ) {
    reasons.push("approval_scope_mismatch");
  }
  if (input.plan.repoPath !== input.repoPath) {
    reasons.push("repo_scope_mismatch");
  }
  if (input.plan.workspaceDocsPath !== input.workspaceDocsPath) {
    reasons.push("workspace_docs_path_mismatch");
  }
  if (
    input.requestSkeleton.enableLiveCodexPilot ||
    input.requestSkeleton.enableCodeWritingBridgePilot
  ) {
    reasons.push("slice_8s_request_skeleton_must_remain_disabled");
  }
  if (input.requestSkeleton.commandExecuted || input.requestSkeleton.liveExecutionEnabled) {
    reasons.push("slice_8s_request_already_executed");
  }
  const approvedTargets = unique(input.approval.approvedTargetFiles);
  const approvedRepoScopePaths = unique(input.approval.approvedRepoScopePaths ?? []);
  const planTargets = unique(input.plan.targetFiles);
  if (
    approvedRepoScopePaths.length === 0 &&
    JSON.stringify(approvedTargets) !== JSON.stringify(planTargets)
  ) {
    reasons.push("approved_target_files_mismatch");
  }
  if (
    approvedRepoScopePaths.length > 0 &&
    planTargets.some(
      (targetFile) =>
        !approvedRepoScopePaths.some((scopePath) => isWithinScope(targetFile, scopePath)),
    )
  ) {
    reasons.push("plan_target_files_outside_approved_repo_scope");
  }
  if (
    !input.approval.acknowledgeSeparateExecutorSession ||
    !input.approval.acknowledgeNoSharedManualSession ||
    !input.approval.acknowledgeCodeWritingRisk
  ) {
    reasons.push("operator_acknowledgements_required");
  }
  if (
    !input.approval.acknowledgeNoRebuild ||
    !input.approval.acknowledgeNoAutobailout ||
    !input.approval.acknowledgeNoSubagents ||
    !input.approval.acknowledgeNoWorkQueueLifecycleMutation
  ) {
    reasons.push("no_authority_acknowledgements_required");
  }
  const validationRepair = validationRepairAuthority({ approval: input.approval });
  if (input.approval.enableBoundedValidationRepair) {
    if (!input.approval.acknowledgeApprovedValidationCommandAuthority) {
      reasons.push("approved_validation_command_acknowledgement_required");
    }
    if (validationRepair.commands.length === 0) {
      reasons.push("approved_validation_command_required");
    }
    if (validationRepair.commands.some((command) => !input.plan.expectedTests.includes(command))) {
      reasons.push("approved_validation_command_must_match_plan_expected_tests");
    }
    if (!Number.isInteger(validationRepair.maxAttempts) || validationRepair.maxAttempts <= 0) {
      reasons.push("invalid_validation_repair_attempt_limit");
    }
    if (validationRepair.maxAttempts > 3) {
      reasons.push("validation_repair_attempt_limit_too_high");
    }
  }
  return [...new Set(reasons)];
}

function successCriteria(input: {
  preflightAllowed: boolean;
  processResult: LiveCodexRunnerResult | null;
  eventCount: number;
  fileScopeSatisfied: boolean;
  validationEvidence: CodeWritingPilotValidationEvidence | null;
  closeoutEmitted: boolean;
}): CodeWritingPilotLiveSuccessCriteria {
  const process = input.processResult;
  const focusedValidationPassed = input.validationEvidence?.status === "passed";
  const validationRecovery = (() => {
    if (input.validationEvidence === null) {
      return {
        status: "validation_not_run" as const,
        reason: "approved validation was not run",
        validationEvidence: input.validationEvidence,
      };
    }

    if (input.validationEvidence.status === "passed") {
      return {
        status: "validation_passed" as const,
        reason: "approved validation passed",
        validationEvidence: input.validationEvidence,
      };
    }

    const validationSummary = input.validationEvidence.summary.toLowerCase();
    const repairExhausted =
      validationSummary.includes("repair exhaustion") ||
      validationSummary.includes("repair attempts were exhausted") ||
      validationSummary.includes("needs_review");

    return {
      status: repairExhausted ? ("needs_review" as const) : ("validation_failed" as const),
      reason: repairExhausted
        ? "approved validation failed after bridge repair exhaustion; completed work needs review"
        : "approved validation failed; completed work remains unsatisfied",
      validationEvidence: input.validationEvidence,
    };
  })();
  const noForbidden =
    !process?.rebuildPerformed && !process?.subagentStarted && !process?.acpSessionStarted;
  const completedWorkPathSatisfied =
    input.preflightAllowed &&
    process?.commandExecuted === true &&
    process.status === "completed" &&
    input.fileScopeSatisfied &&
    focusedValidationPassed &&
    noForbidden &&
    input.closeoutEmitted;
  return {
    preRunGatesPassed: input.preflightAllowed,
    codexInvokedThroughBridgePath: process?.codexCliInvoked === true,
    commandExecutionAllowlisted: process?.commandExecuted === true,
    processResultRecorded: process !== null,
    streamOrProcessEvidenceRecorded: input.eventCount > 0 || process !== null,
    fileScopeSatisfied: input.fileScopeSatisfied,
    focusedValidationPassed,
    workQueueLifecycleNotMutated: true,
    noRebuildAutobailoutSubagentAcpPromotionInstallDeployOutbound: noForbidden,
    closeoutPackEmitted: input.closeoutEmitted,
    validationRecovery,
    completedWorkPathSatisfied,
  };
}

export class CodeWritingPilotLiveEntrypointRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;
  private readonly repoPath: string;
  private readonly workspaceDocsPath: string;
  private readonly closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodeWritingPilotLiveEntrypointOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_CODE_WRITING_LIVE_METADATA_BYTES;
    this.repoPath = options.repoPath ?? DEFAULT_REPO_PATH;
    this.workspaceDocsPath = options.workspaceDocsPath ?? DEFAULT_WORKSPACE_DOCS_PATH;
    this.closeout =
      options.closeoutRepository ??
      new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, {
        now: this.now,
        artifactRoot: options.closeoutArtifactRoot,
      });
  }

  async runApprovedLivePilot(
    input: RunCodeWritingPilotLiveInput,
  ): Promise<CodeWritingPilotLiveResult> {
    const job = await this.runtimeJobs.getJob(input.plan.runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE) {
      throw new Error(`runtime job is not a codex bridge job: ${input.plan.runtimeJobId}`);
    }
    const startedAt = this.now().toISOString();
    const liveCodeWritingPilotRunId =
      input.liveCodeWritingPilotRunId ?? `code-writing-pilot-${randomUUID()}`;
    const approvedTargetFiles = unique(input.approval.approvedTargetFiles);
    const approvedRepoScopePaths = unique(input.approval.approvedRepoScopePaths ?? []);
    const beforeHashes = await this.hashTargets(approvedTargetFiles);
    const validationRepair = validationRepairAuthority({ approval: input.approval });
    const prompt = promptText({
      objective: input.plan.selectedObjective?.objective ?? input.promptPackage.objective,
      approvedTargetFiles,
      approvedRepoScopePaths,
      validationRepair,
    });
    const descriptor = materializeDescriptor({
      runtimeJobId: input.plan.runtimeJobId,
      promptPackageId: input.promptPackage.promptPackageId,
      repoPath: this.repoPath,
      prompt,
      maxRuntimeMs: input.approval.maxRuntimeMs,
    });
    const descriptorValidation = validateLiveCodexRunnerDescriptorOnly({
      descriptor,
      options: {
        enableLiveCodexPilot: input.approval.enableLiveCodexPilot,
        maxRuntimeMs: input.approval.maxRuntimeMs,
        maxStdoutBytes: input.approval.maxStdoutBytes,
        maxStderrBytes: input.approval.maxStderrBytes,
      },
    });
    const blockingReasons = [
      ...approvalBlockingReasons({
        plan: input.plan,
        requestSkeleton: input.requestSkeleton,
        promptPackage: input.promptPackage,
        approval: input.approval,
        repoPath: this.repoPath,
        workspaceDocsPath: this.workspaceDocsPath,
      }),
      ...descriptorValidation.blockingReasons,
    ];
    const preflight: CodeWritingPilotLivePreflight = {
      artifactKind: "codex_bridge_code_writing_pilot_live_preflight",
      liveCodeWritingPilotRunId,
      runtimeJobId: input.plan.runtimeJobId,
      allowed: blockingReasons.length === 0,
      blockingReasons,
      descriptor: blockingReasons.length === 0 ? descriptor : null,
      commandAllowlisted:
        descriptor.command === "codex" &&
        descriptor.args[0] === "exec" &&
        descriptor.args[1] === "--json" &&
        descriptor.args[2] === "--cd" &&
        descriptor.args[3] === this.repoPath,
      internallyMaterializedDescriptor:
        descriptor.sourcePackageId === input.promptPackage.promptPackageId,
      targetScopeVerified:
        approvedRepoScopePaths.length > 0
          ? input.plan.targetFiles.every((targetFile) =>
              approvedRepoScopePaths.some((scopePath) => isWithinScope(targetFile, scopePath)),
            )
          : JSON.stringify(approvedTargetFiles) === JSON.stringify(input.plan.targetFiles),
    };
    await this.persistArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_LIVE_REQUEST_ARTIFACT_TYPE,
      liveCodeWritingPilotRunId,
      {
        artifactKind: "codex_bridge_code_writing_pilot_live_request",
        liveCodeWritingPilotRunId,
        runtimeJobId: input.plan.runtimeJobId,
        pilotPlanId: input.plan.pilotPlanId,
        requestId: input.requestSkeleton.requestId,
        promptPackageId: input.promptPackage.promptPackageId,
        sessionId: input.plan.sessionId,
        operatorApproval: input.approval,
        liveExecutionEnabled: true,
        commandExecuted: false,
      } satisfies CodeWritingPilotLiveRequest,
    );
    await this.persistArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_LIVE_PREFLIGHT_ARTIFACT_TYPE,
      liveCodeWritingPilotRunId,
      preflight as unknown as JsonValue,
    );
    await this.runtimeJobs.recordEvent({
      jobId: input.plan.runtimeJobId,
      eventType: CODE_WRITING_PILOT_STARTED_EVENT_TYPE,
      data: {
        liveCodeWritingPilotRunId,
        sessionId: input.plan.sessionId,
        preflightAllowed: preflight.allowed,
        liveExecutionEnabled: preflight.allowed,
      },
    });
    let eventCount = 0;
    let finalResponseCandidate: string | null = null;
    let processResult: LiveCodexRunnerResult | null = null;
    if (preflight.allowed) {
      const runner =
        input.runner ??
        new LiveCodexRunner({
          ...input.liveRunnerOptions,
          enableLiveCodexPilot: true,
          maxRuntimeMs: input.approval.maxRuntimeMs,
          maxStdoutBytes: input.approval.maxStdoutBytes,
          maxStderrBytes: input.approval.maxStderrBytes,
        });
      await this.runtimeJobs.recordEvent({
        jobId: input.plan.runtimeJobId,
        eventType: CODE_WRITING_PILOT_HEARTBEAT_EVENT_TYPE,
        data: {
          liveCodeWritingPilotRunId,
          sessionId: input.plan.sessionId,
          heartbeatAt: this.now().toISOString(),
        },
      });
      processResult = await runner.runPrevalidatedDescriptor(
        {
          descriptor,
          validation: descriptorValidation,
        },
        {
          onJsonlLine: async (line) => {
            eventCount += 1;
            const normalized = this.normalizeJsonlLine(line, eventCount);
            if (normalized.eventKind === "final_response") {
              finalResponseCandidate = normalized.summary;
            }
            await this.runtimeJobs.recordEvent({
              jobId: input.plan.runtimeJobId,
              eventType: CODE_WRITING_PILOT_STREAM_EVENT_TYPE,
              data: {
                liveCodeWritingPilotRunId,
                raw: boundLivePilotMetadata(line),
                normalized: boundLivePilotMetadata(normalized as unknown as JsonValue),
              },
            });
          },
        },
      );
    }
    const afterHashes = await this.hashTargets(approvedTargetFiles);
    const changedFilesAfterRun =
      input.changedFilesAfterRun ?? (await input.changedFilesProvider?.());
    const fileScopeReport = this.fileScopeReport({
      approvedTargetFiles,
      approvedRepoScopePaths,
      beforeHashes,
      afterHashes,
      changedFilesAfterRun,
    });
    await this.persistArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_PROCESS_RESULT_ARTIFACT_TYPE,
      liveCodeWritingPilotRunId,
      (processResult ?? { status: "refused", blockingReasons }) as unknown as JsonValue,
    );
    await this.persistArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_FILE_SCOPE_ARTIFACT_TYPE,
      liveCodeWritingPilotRunId,
      fileScopeReport as unknown as JsonValue,
    );
    const result = this.createResult({
      input,
      liveCodeWritingPilotRunId,
      startedAt,
      processResult,
      eventCount,
      finalResponseCandidate,
      fileScopeReport,
      validationEvidence: null,
      closeout: null,
      blockingReasons: preflight.allowed ? [] : blockingReasons,
    });
    await this.persistLiveResult(result);
    return result;
  }

  async recordValidationEvidence(
    input: FinalizeCodeWritingPilotLiveInput,
  ): Promise<CodeWritingPilotLiveResult> {
    const latest = await this.readLatestLivePilotResult(input.runtimeJobId);
    if (!latest || latest.liveCodeWritingPilotRunId !== input.liveCodeWritingPilotRunId) {
      throw new Error(
        `live code-writing pilot result not found: ${input.liveCodeWritingPilotRunId}`,
      );
    }
    await this.persistArtifact(
      input.runtimeJobId,
      CODE_WRITING_PILOT_VALIDATION_ARTIFACT_TYPE,
      input.liveCodeWritingPilotRunId,
      input.validationEvidence as unknown as JsonValue,
    );
    const closeout = await this.closeout.emitCloseoutForRuntimeJob({
      runtimeJobId: input.runtimeJobId,
      closeout: {
        runtimeJobId: input.runtimeJobId,
        completedAt: this.now().toISOString(),
        userGoal: "Run the first approved live code-writing bridge pilot.",
        completedObjective: latest.selectedObjectiveId ?? "code-writing bridge pilot",
        workSummary: `Live code-writing bridge pilot completed with process status ${latest.processResult?.status ?? "unknown"}.`,
        finalOutcome:
          input.validationEvidence.status === "passed"
            ? "Focused validation passed after the bridge pilot."
            : "Bridge pilot requires review because focused validation did not pass.",
        filesTouched: latest.actualFilesChanged.map((file) => ({
          path: file,
          changeKind: "modified",
          summary: "Changed by approved code-writing bridge pilot.",
        })),
        testsRun: [
          {
            command: input.validationEvidence.command,
            status: input.validationEvidence.status === "passed" ? "passed" : "failed",
            summary: input.validationEvidence.summary,
          },
        ],
        artifactRefs: [
          `.artifacts/execution-platform/code-writing-pilot-live-result-8t.json`,
          `runtime-job://${input.runtimeJobId}/codex-bridge/code-writing-pilot-live/${input.liveCodeWritingPilotRunId}`,
        ],
      },
    });
    const updated: CodeWritingPilotLiveResult = {
      ...latest,
      validationEvidence: input.validationEvidence,
      workEpisodeCloseout: {
        emitted: true,
        packPath: closeout.metadata.packPath,
        packHash: closeout.metadata.packHash,
        eligibilityStatus: closeout.eligibility.status,
      },
      validationRecovery: (() => {
        if (input.validationEvidence.status === "passed") {
          return {
            status: "validation_passed" as const,
            reason: "approved validation passed",
            validationEvidence: input.validationEvidence,
          };
        }

        const validationSummary = input.validationEvidence.summary.toLowerCase();
        const repairExhausted =
          validationSummary.includes("repair exhaustion") ||
          validationSummary.includes("repair attempts were exhausted") ||
          validationSummary.includes("needs_review");

        return {
          status: repairExhausted ? ("needs_review" as const) : ("validation_failed" as const),
          reason: repairExhausted
            ? "approved validation failed after bridge repair exhaustion; completed work needs review"
            : "approved validation failed; completed work remains unsatisfied",
          validationEvidence: input.validationEvidence,
        };
      })(),
      completedWorkPathSatisfied:
        latest.processResult?.status === "completed" &&
        latest.fileScopeSatisfied &&
        input.validationEvidence.status === "passed",
      completedWorkPathReason:
        latest.processResult?.status === "completed" &&
        latest.fileScopeSatisfied &&
        input.validationEvidence.status === "passed"
          ? "process_completed_file_scope_satisfied_and_focused_validation_passed"
          : "validation_or_file_scope_evidence_missing_or_failed",
      successCriteria: successCriteria({
        preflightAllowed: latest.blockingReasons.length === 0,
        processResult: latest.processResult,
        eventCount: latest.eventCount,
        fileScopeSatisfied: latest.fileScopeSatisfied,
        validationEvidence: input.validationEvidence,
        closeoutEmitted: true,
      }),
    };
    await this.persistLiveResult(updated);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: CODE_WRITING_PILOT_COMPLETED_EVENT_TYPE,
      data: {
        liveCodeWritingPilotRunId: input.liveCodeWritingPilotRunId,
        validationStatus: input.validationEvidence.status,
        completedWorkPathSatisfied: updated.completedWorkPathSatisfied,
        closeoutPackHash: closeout.metadata.packHash,
      },
    });
    return updated;
  }

  async readLivePilotResults(runtimeJobId: string): Promise<CodeWritingPilotLiveResult[]> {
    return (await this.runtimeJobs.listArtifacts(runtimeJobId))
      .filter((artifact) => artifact.artifactType === CODE_WRITING_PILOT_LIVE_RESULT_ARTIFACT_TYPE)
      .map((artifact) => artifact.metadata as unknown as CodeWritingPilotLiveResult);
  }

  async readLatestLivePilotResult(
    runtimeJobId: string,
  ): Promise<CodeWritingPilotLiveResult | null> {
    return (await this.readLivePilotResults(runtimeJobId)).at(-1) ?? null;
  }

  private async hashTargets(targetFiles: string[]): Promise<Record<string, string | null>> {
    const entries = await Promise.all(
      targetFiles.map(
        async (targetFile) =>
          [
            relativeTargetPath(this.repoPath, targetFile),
            await fileHash(targetAbsolutePath(this.repoPath, targetFile)),
          ] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  private fileScopeReport(input: {
    approvedTargetFiles: string[];
    approvedRepoScopePaths: string[];
    beforeHashes: Record<string, string | null>;
    afterHashes: Record<string, string | null>;
    changedFilesAfterRun?: string[];
  }): CodeWritingPilotFileScopeReport {
    const approved = unique(
      input.approvedTargetFiles.map((file) => relativeTargetPath(this.repoPath, file)),
    );
    const approvedRepoScopePaths = unique(
      input.approvedRepoScopePaths.map((file) => relativeTargetPath(this.repoPath, file)),
    );
    const hashChangedFiles = approved.filter(
      (file) => input.beforeHashes[file] !== input.afterHashes[file],
    );
    const actualFilesChanged = unique([...(input.changedFilesAfterRun ?? []), ...hashChangedFiles]);
    const unexpectedFilesChanged = actualFilesChanged.filter(
      (file) =>
        !approved.includes(file) &&
        !approvedRepoScopePaths.some((scopePath) => isWithinScope(file, scopePath)),
    );
    return {
      artifactKind: "codex_bridge_code_writing_pilot_file_scope_report",
      approvedTargetFiles: approved,
      approvedRepoScopePaths,
      actualFilesChanged,
      unexpectedFilesChanged,
      approvedFileHashesBefore: input.beforeHashes,
      approvedFileHashesAfter: input.afterHashes,
      fileScopeSatisfied: unexpectedFilesChanged.length === 0,
    };
  }

  private normalizeJsonlLine(line: string, sequence: number): CodexBridgeNormalizedStreamEvent {
    const parsed: CodexJsonlParseResult = parseCodexJsonlEventLine(line);
    if (!parsed.ok) {
      return {
        eventKind: "error",
        sourceProtocol: "codex_cli",
        sequence,
        occurredAt: this.now().toISOString(),
        summary: parsed.error.message,
        data: boundLivePilotMetadata(parsed as unknown as JsonValue),
        providerCallMade: false,
        liveExecutorCallMade: false,
      };
    }
    return normalizeParsedCodexJsonlEvent({
      event: parsed.event,
      sequence,
      now: this.now(),
    });
  }

  private createResult(input: {
    input: RunCodeWritingPilotLiveInput;
    liveCodeWritingPilotRunId: string;
    startedAt: string;
    processResult: LiveCodexRunnerResult | null;
    eventCount: number;
    finalResponseCandidate: string | null;
    fileScopeReport: CodeWritingPilotFileScopeReport;
    validationEvidence: CodeWritingPilotValidationEvidence | null;
    closeout: CodeWritingPilotLiveResult["workEpisodeCloseout"] | null;
    blockingReasons: string[];
  }): CodeWritingPilotLiveResult {
    const completedAt = this.now().toISOString();
    const closeout = input.closeout ?? {
      emitted: false,
      packPath: null,
      packHash: null,
      eligibilityStatus: null,
    };
    const criteria = successCriteria({
      preflightAllowed: input.blockingReasons.length === 0,
      processResult: input.processResult,
      eventCount: input.eventCount,
      fileScopeSatisfied: input.fileScopeReport.fileScopeSatisfied,
      validationEvidence: input.validationEvidence,
      closeoutEmitted: closeout.emitted,
    });
    return {
      artifactKind: "codex_bridge_code_writing_pilot_live_result",
      liveCodeWritingPilotRunId: input.liveCodeWritingPilotRunId,
      runtimeJobId: input.input.plan.runtimeJobId,
      pilotPlanId: input.input.plan.pilotPlanId,
      requestId: input.input.requestSkeleton.requestId,
      promptPackageId: input.input.promptPackage.promptPackageId,
      sessionId: input.input.plan.sessionId,
      startedAt: input.startedAt,
      completedAt,
      operatorApprovedBy: input.input.approval.approvedBy,
      executorSessionIsSeparate: true,
      manualOperatorSessionSharedWithExecutor: false,
      selectedObjectiveId: input.input.plan.selectedObjective?.candidateId ?? null,
      approvedTargetFiles: input.fileScopeReport.approvedTargetFiles,
      actualFilesChanged: input.fileScopeReport.actualFilesChanged,
      fileScopeSatisfied: input.fileScopeReport.fileScopeSatisfied,
      codexCliInvoked: input.processResult?.codexCliInvoked ?? false,
      commandExecuted: input.processResult?.commandExecuted ?? false,
      liveExecutionEnabled: input.processResult?.liveExecutionEnabled ?? false,
      processResult: input.processResult,
      eventCount: input.eventCount,
      finalResponsePresent: input.finalResponseCandidate !== null,
      finalResponseCandidate: input.finalResponseCandidate,
      executorValidationCommandAllowed: input.input.approval.enableBoundedValidationRepair === true,
      approvedValidationCommands: boundApprovedValidationCommandMetadata(
        input.input.approval.approvedValidationCommands ?? [],
      ),
      validationRepairMaxAttempts: input.input.approval.maxValidationRepairAttempts ?? 0,
      diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only",
      shellCommandAuthorityScope:
        input.input.approval.enableBoundedValidationRepair === true
          ? "approved_validation_commands_only"
          : "none",
      validationEvidence: input.validationEvidence,
      validationRecovery: (() => {
        if (input.validationEvidence === null) {
          return {
            status: "validation_not_run" as const,
            reason: "approved validation was not run",
            validationEvidence: input.validationEvidence,
          };
        }

        if (input.validationEvidence.status === "passed") {
          return {
            status: "validation_passed" as const,
            reason: "approved validation passed",
            validationEvidence: input.validationEvidence,
          };
        }

        const validationSummary = input.validationEvidence.summary.toLowerCase();
        const repairExhausted =
          validationSummary.includes("repair exhaustion") ||
          validationSummary.includes("repair attempts were exhausted") ||
          validationSummary.includes("needs_review");

        return {
          status: repairExhausted ? ("needs_review" as const) : ("validation_failed" as const),
          reason: repairExhausted
            ? "approved validation failed after bridge repair exhaustion; completed work needs review"
            : "approved validation failed; completed work remains unsatisfied",
          validationEvidence: input.validationEvidence,
        };
      })(),
      completedWorkPathSatisfied: criteria.completedWorkPathSatisfied,
      completedWorkPathReason: criteria.completedWorkPathSatisfied
        ? "process_completed_file_scope_satisfied_validation_passed_and_closeout_emitted"
        : "process_completion_is_not_task_success_without_scope_validation_and_closeout",
      workEpisodeCloseout: closeout,
      workQueueLifecycleMutated: false,
      rebuildPerformed: false,
      autobailoutPerformed: false,
      subagentStarted: false,
      acpSessionStarted: false,
      providerCallMadeDirectly: false,
      modelPromotionPerformed: false,
      installDeployOutboundPerformed: false,
      blockingReasons: input.blockingReasons,
      successCriteria: criteria,
    };
  }

  private async persistLiveResult(result: CodeWritingPilotLiveResult): Promise<RuntimeJobArtifact> {
    return this.persistArtifact(
      result.runtimeJobId,
      CODE_WRITING_PILOT_LIVE_RESULT_ARTIFACT_TYPE,
      result.liveCodeWritingPilotRunId,
      result as unknown as JsonValue,
    );
  }

  private async persistArtifact(
    runtimeJobId: string,
    artifactType: string,
    runId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundLivePilotMetadata(metadata);
    assertJsonByteLength(
      bounded,
      this.maxArtifactMetadataBytes,
      "code-writing live pilot metadata",
    );
    return this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/codex-bridge/code-writing-pilot-live/${runId}/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

export async function writeCodeWritingPilotLiveResultArtifact(input: {
  result: CodeWritingPilotLiveResult;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string; liveCodeWritingPilotRunId: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/code-writing-pilot-live-result-8t.json",
    );
  const bounded = boundLivePilotMetadata(input.result as unknown as JsonValue);
  await writeFile(artifactPath, `${JSON.stringify(bounded, null, 2)}\n`);
  return { artifactPath, liveCodeWritingPilotRunId: input.result.liveCodeWritingPilotRunId };
}

export const CODEX_BRIDGE_CODE_WRITING_PILOT_LIVE_REQUEST_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_LIVE_REQUEST_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_LIVE_PREFLIGHT_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_LIVE_PREFLIGHT_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_PROCESS_RESULT_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_PROCESS_RESULT_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_FILE_SCOPE_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_FILE_SCOPE_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_VALIDATION_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_VALIDATION_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_LIVE_RESULT_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_LIVE_RESULT_ARTIFACT_TYPE;
