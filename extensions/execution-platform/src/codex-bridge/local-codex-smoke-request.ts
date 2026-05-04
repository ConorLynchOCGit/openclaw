import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  DisabledSupervisorProcessRunner,
  validateOperatorAcceptanceForObserveOnlyLocalCodex,
  type CodexProcessDescriptor,
  type OperatorAcceptanceMetadata,
  type Slice8EPilotAudit,
  type SupervisorProcessRunner,
} from "./execution-supervisor.ts";
import {
  evaluateLocalCodexSmokeRunGate,
  type LocalCodexSmokeRunGate,
  type LocalCodexSmokeTestPlan,
  type LocalCodexSmokeTestReport,
  type LocalCodexSmokeTestRepository,
  type SmokeRunnerOptionsSnapshot,
} from "./local-codex-smoke-test.ts";

const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_MAX_RUNTIME_MS = 120_000;
const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 128 * 1024;
const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;
const MAX_REQUEST_RUNTIME_MS = 30 * 60 * 1000;
const MAX_REQUEST_STDOUT_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_STDERR_BYTES = 1024 * 1024;

export type LocalCodexSmokeRequestedMode = "plan_only" | "fake_dry_run" | "live_observe_only";

export type LocalCodexSmokeRunRequestStatus =
  | "requested"
  | "accepted_for_plan"
  | "accepted_for_fake_dry_run"
  | "accepted_for_live_observe_only"
  | "blocked"
  | "expired"
  | "completed"
  | "failed";

export type LocalCodexSmokeRunAcknowledgements = {
  acknowledgeSeparateExecutorSession: boolean;
  acknowledgeNoSharedManualSession: boolean;
  acknowledgeObserveOnlyLimitations: boolean;
  acknowledgeNoRebuild: boolean;
  acknowledgeNoAutobailout: boolean;
  acknowledgeNoSubagents: boolean;
  acknowledgeNoWorkQueueLifecycleMutation: boolean;
};

export type LocalCodexSmokeRunRequest = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_run_request";
  requestId: string;
  runtimeJobId: string;
  smokeTestId: string;
  sessionId: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  reason: string;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  smokeTestPlan: LocalCodexSmokeTestPlan | null;
  smokeRunGate: LocalCodexSmokeRunGate;
  runnerOptionsSnapshot: SmokeRunnerOptionsSnapshot | null;
  requestedMode: LocalCodexSmokeRequestedMode;
  acknowledgements: LocalCodexSmokeRunAcknowledgements;
  enableLiveCodexPilot: boolean;
  enableOperatorApprovedSmokeTest: boolean;
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  status: LocalCodexSmokeRunRequestStatus;
  blockingReasons: string[];
};

export type LocalCodexSmokeRunRequestValidation = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_run_request_validation";
  requestId: string;
  runtimeJobId: string;
  valid: boolean;
  status: LocalCodexSmokeRunRequestStatus;
  blockingReasons: string[];
};

export type LocalCodexSmokeRunSafetySummary = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_run_safety_summary";
  requestId: string;
  runtimeJobId: string;
  repoPath: string | null;
  promptObjective: string | null;
  separateExecutorSessionId: string | null;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
  commandDescriptorSummary: {
    command: string | null;
    argsPrefix: string[];
    cwd: string | null;
    executionAllowed: boolean;
  };
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  disabledAuthorities: Array<
    | "rebuild"
    | "autobailout"
    | "subagents"
    | "acp"
    | "work_queue_lifecycle_mutation"
    | "model_promotion"
  >;
  expectedOversightStreamChannels: LocalCodexSmokeTestPlan["expectedOversightStreamChannels"];
  expectedArtifacts: LocalCodexSmokeTestPlan["expectedArtifacts"];
  processCompletionMeaning: "executor_process_completed_only";
  taskSuccessStillRequires: Array<"validation_evidence" | "needs_review_evidence" | "user_review">;
};

export type LocalCodexSmokeRunRequestResult = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_run_request_result";
  requestId: string;
  runtimeJobId: string;
  smokeTestId: string | null;
  requestedMode: LocalCodexSmokeRequestedMode;
  status: Extract<
    LocalCodexSmokeRunRequestStatus,
    | "accepted_for_plan"
    | "accepted_for_live_observe_only"
    | "blocked"
    | "expired"
    | "completed"
    | "failed"
  >;
  blockingReasons: string[];
  planOnly: boolean;
  fakeDryRunUsed: boolean;
  executablePlanOnly: boolean;
  liveRunnerSupplied: boolean;
  smokeReport: LocalCodexSmokeTestReport | null;
  safetySummary: LocalCodexSmokeRunSafetySummary;
};

export type LocalCodexSmokeRequestRepositoryOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

export type CreateLocalCodexSmokeRunRequestInput = {
  requestId?: string;
  requestedBy: string;
  requestedAt?: string;
  expiresAt: string;
  reason: string;
  requestedMode?: LocalCodexSmokeRequestedMode;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  smokeTestPlan: LocalCodexSmokeTestPlan | null;
  enableLiveCodexPilot?: boolean;
  enableOperatorApprovedSmokeTest?: boolean;
  acknowledgements?: Partial<LocalCodexSmokeRunAcknowledgements>;
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  now?: Date;
};

function smokeRequestAudit(): Slice8EPilotAudit {
  return {
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

function defaultAcknowledgements(
  input: Partial<LocalCodexSmokeRunAcknowledgements> = {},
): LocalCodexSmokeRunAcknowledgements {
  return {
    acknowledgeSeparateExecutorSession: input.acknowledgeSeparateExecutorSession ?? false,
    acknowledgeNoSharedManualSession: input.acknowledgeNoSharedManualSession ?? false,
    acknowledgeObserveOnlyLimitations: input.acknowledgeObserveOnlyLimitations ?? false,
    acknowledgeNoRebuild: input.acknowledgeNoRebuild ?? false,
    acknowledgeNoAutobailout: input.acknowledgeNoAutobailout ?? false,
    acknowledgeNoSubagents: input.acknowledgeNoSubagents ?? false,
    acknowledgeNoWorkQueueLifecycleMutation: input.acknowledgeNoWorkQueueLifecycleMutation ?? false,
  };
}

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function boundRequestMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 260,
    maxArrayItems: 160,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function descriptorHasForbiddenAuthority(descriptor: CodexProcessDescriptor): boolean {
  const record = descriptor as unknown as Record<string, unknown>;
  return (
    record.allowRebuild === true ||
    record.allowAutobailout === true ||
    record.allowSubagents === true
  );
}

function validateDescriptor(descriptor: CodexProcessDescriptor | null): string[] {
  const blockingReasons: string[] = [];
  if (!descriptor) {
    return ["descriptor_required"];
  }
  if (descriptor.command !== "codex") {
    blockingReasons.push("invalid_command");
  }
  if (
    descriptor.args[0] !== "exec" ||
    descriptor.args[1] !== "--json" ||
    descriptor.args[2] !== "--cd"
  ) {
    blockingReasons.push("invalid_args_prefix");
  }
  if (descriptor.cwd !== DEFAULT_REPO_PATH || descriptor.args[3] !== DEFAULT_REPO_PATH) {
    blockingReasons.push("repo_scope_mismatch");
  }
  if (!descriptor.sourcePackageId) {
    blockingReasons.push("descriptor_source_package_id_required");
  }
  if ((descriptor as unknown as { commandExecuted?: boolean }).commandExecuted !== false) {
    blockingReasons.push("descriptor_already_executed");
  }
  if (descriptor.envPolicy.secretsIncluded) {
    blockingReasons.push("descriptor_env_secrets_not_allowed");
  }
  if (!descriptor.executionAllowed) {
    blockingReasons.push("descriptor_execution_not_allowed");
  }
  if (descriptorHasForbiddenAuthority(descriptor)) {
    blockingReasons.push("descriptor_forbidden_future_authority");
  }
  return blockingReasons;
}

function validateBounds(request: LocalCodexSmokeRunRequest): string[] {
  const blockingReasons: string[] = [];
  if (!Number.isInteger(request.maxRuntimeMs) || request.maxRuntimeMs <= 0) {
    blockingReasons.push("max_runtime_ms_required");
  } else if (request.maxRuntimeMs > MAX_REQUEST_RUNTIME_MS) {
    blockingReasons.push("max_runtime_ms_exceeds_bound");
  }
  if (!Number.isInteger(request.maxStdoutBytes) || request.maxStdoutBytes <= 0) {
    blockingReasons.push("max_stdout_bytes_required");
  } else if (request.maxStdoutBytes > MAX_REQUEST_STDOUT_BYTES) {
    blockingReasons.push("max_stdout_bytes_exceeds_bound");
  }
  if (!Number.isInteger(request.maxStderrBytes) || request.maxStderrBytes <= 0) {
    blockingReasons.push("max_stderr_bytes_required");
  } else if (request.maxStderrBytes > MAX_REQUEST_STDERR_BYTES) {
    blockingReasons.push("max_stderr_bytes_exceeds_bound");
  }
  return blockingReasons;
}

function statusForValidRequest(
  requestedMode: LocalCodexSmokeRequestedMode,
): LocalCodexSmokeRunRequestStatus {
  if (requestedMode === "plan_only") {
    return "accepted_for_plan";
  }
  if (requestedMode === "fake_dry_run") {
    return "accepted_for_fake_dry_run";
  }
  return "accepted_for_live_observe_only";
}

function requiresAcknowledgements(mode: LocalCodexSmokeRequestedMode): boolean {
  return mode === "fake_dry_run" || mode === "live_observe_only";
}

function allAcknowledgementsPresent(acknowledgements: LocalCodexSmokeRunAcknowledgements): boolean {
  return Object.values(acknowledgements).every(Boolean);
}

function isExpired(expiresAt: string, now: Date): boolean {
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) || now >= parsed;
}

export function createLocalCodexSmokeRunRequest(
  input: CreateLocalCodexSmokeRunRequestInput,
): LocalCodexSmokeRunRequest {
  const requestedMode = input.requestedMode ?? "plan_only";
  const acknowledgements = defaultAcknowledgements(input.acknowledgements);
  const maxRuntimeMs =
    input.maxRuntimeMs ?? input.smokeTestPlan?.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
  const maxStdoutBytes =
    input.maxStdoutBytes ?? input.smokeTestPlan?.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
  const maxStderrBytes =
    input.maxStderrBytes ?? input.smokeTestPlan?.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
  const dryRunMode = requestedMode !== "live_observe_only";
  const gate = evaluateLocalCodexSmokeRunGate({
    plan: input.smokeTestPlan,
    operatorAcceptance: input.operatorAcceptance,
    enableLiveCodexPilot: input.enableLiveCodexPilot,
    enableOperatorApprovedSmokeTest: input.enableOperatorApprovedSmokeTest,
    acknowledgeSeparateExecutorSession: acknowledgements.acknowledgeSeparateExecutorSession,
    acknowledgeNoSharedManualSession: acknowledgements.acknowledgeNoSharedManualSession,
    acknowledgeObserveOnlyLimitations: acknowledgements.acknowledgeObserveOnlyLimitations,
    maxRuntimeMs,
    maxStdoutBytes,
    maxStderrBytes,
    dryRunMode,
    allowWorkQueueLifecycleMutation: !acknowledgements.acknowledgeNoWorkQueueLifecycleMutation,
    now: input.now,
  });
  return {
    artifactKind: "local_codex_smoke_run_request",
    requestId: input.requestId ?? `codex-smoke-request-${randomUUID()}`,
    runtimeJobId: input.smokeTestPlan?.runtimeJobId ?? input.operatorAcceptance?.runtimeJobId ?? "",
    smokeTestId: input.smokeTestPlan?.smokeTestId ?? "",
    sessionId: input.smokeTestPlan?.sessionId ?? "",
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt ?? (input.now ?? new Date()).toISOString(),
    expiresAt: input.expiresAt,
    reason: input.reason,
    operatorAcceptance: input.operatorAcceptance,
    smokeTestPlan: input.smokeTestPlan,
    smokeRunGate: gate,
    runnerOptionsSnapshot: gate.runnerOptionsSnapshot,
    requestedMode,
    acknowledgements,
    enableLiveCodexPilot: input.enableLiveCodexPilot ?? false,
    enableOperatorApprovedSmokeTest: input.enableOperatorApprovedSmokeTest ?? false,
    maxRuntimeMs,
    maxStdoutBytes,
    maxStderrBytes,
    status: "requested",
    blockingReasons: [],
    ...smokeRequestAudit(),
  };
}

export function validateLocalCodexSmokeRunRequest(input: {
  request: LocalCodexSmokeRunRequest;
  now?: Date;
}): LocalCodexSmokeRunRequestValidation {
  const request = input.request;
  const now = input.now ?? new Date();
  const blockingReasons: string[] = [];
  if (!request.runtimeJobId) {
    blockingReasons.push("runtime_job_id_required");
  }
  if (!request.smokeTestPlan) {
    blockingReasons.push("smoke_test_plan_required");
  }
  if (!request.operatorAcceptance) {
    blockingReasons.push("operator_acceptance_required");
  }
  if (!request.requestedBy) {
    blockingReasons.push("requested_by_required");
  }
  if (!request.expiresAt || Number.isNaN(new Date(request.expiresAt).getTime())) {
    blockingReasons.push("expires_at_required");
  } else if (isExpired(request.expiresAt, now)) {
    blockingReasons.push("request_expired");
  }
  if (request.operatorAcceptance) {
    const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
      acceptance: request.operatorAcceptance,
      runtimeJobId: request.runtimeJobId,
      now,
    });
    blockingReasons.push(...acceptance.blockingReasons);
  }
  if (
    requiresAcknowledgements(request.requestedMode) &&
    !allAcknowledgementsPresent(request.acknowledgements)
  ) {
    blockingReasons.push("all_smoke_request_acknowledgements_required");
  }
  if (request.requestedMode === "live_observe_only") {
    if (!request.enableLiveCodexPilot) {
      blockingReasons.push("enable_live_codex_pilot_required");
    }
    if (!request.enableOperatorApprovedSmokeTest) {
      blockingReasons.push("enable_operator_approved_smoke_test_required");
    }
  }
  if (request.smokeTestPlan) {
    if (request.smokeTestPlan.repoPath !== DEFAULT_REPO_PATH) {
      blockingReasons.push("repo_scope_mismatch");
    }
    if (!request.smokeTestPlan.futureRunPackage.safeUiBridgeMetadata.tailscaleRequired) {
      blockingReasons.push("safe_ui_bridge_metadata_required");
    }
    if (request.smokeTestPlan.futureRunPackage.validationCommandMetadata.length === 0) {
      blockingReasons.push("validation_command_metadata_required");
    }
    if (request.smokeTestPlan.allowRebuild) {
      blockingReasons.push("rebuild_authority_blocked");
    }
    if (request.smokeTestPlan.allowAutobailout) {
      blockingReasons.push("autobailout_authority_blocked");
    }
    if (request.smokeTestPlan.allowSubagents) {
      blockingReasons.push("subagent_authority_blocked");
    }
    if (request.smokeTestPlan.workQueueLifecycleMutationAllowed) {
      blockingReasons.push("work_queue_lifecycle_mutation_blocked");
    }
    blockingReasons.push(...validateDescriptor(request.smokeTestPlan.processDescriptor));
  }
  if (!request.acknowledgements.acknowledgeNoRebuild && request.requestedMode !== "plan_only") {
    blockingReasons.push("no_rebuild_acknowledgement_required");
  }
  if (!request.acknowledgements.acknowledgeNoAutobailout && request.requestedMode !== "plan_only") {
    blockingReasons.push("no_autobailout_acknowledgement_required");
  }
  if (!request.acknowledgements.acknowledgeNoSubagents && request.requestedMode !== "plan_only") {
    blockingReasons.push("no_subagents_acknowledgement_required");
  }
  if (
    !request.acknowledgements.acknowledgeNoWorkQueueLifecycleMutation &&
    request.requestedMode !== "plan_only"
  ) {
    blockingReasons.push("no_work_queue_lifecycle_mutation_acknowledgement_required");
  }
  blockingReasons.push(...validateBounds(request));
  if (request.requestedMode !== "plan_only" && !request.smokeRunGate.allowed) {
    blockingReasons.push("smoke_run_gate_not_allowed", ...request.smokeRunGate.blockingReasons);
  }
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const expired = uniqueBlockingReasons.includes("request_expired");
  return {
    artifactKind: "local_codex_smoke_run_request_validation",
    requestId: request.requestId,
    runtimeJobId: request.runtimeJobId,
    valid: uniqueBlockingReasons.length === 0,
    status: expired
      ? "expired"
      : uniqueBlockingReasons.length === 0
        ? statusForValidRequest(request.requestedMode)
        : "blocked",
    blockingReasons: uniqueBlockingReasons,
    ...smokeRequestAudit(),
  };
}

export function createLocalCodexSmokeRunSafetySummary(
  request: LocalCodexSmokeRunRequest,
): LocalCodexSmokeRunSafetySummary {
  const descriptor = request.smokeTestPlan?.processDescriptor ?? null;
  return {
    artifactKind: "local_codex_smoke_run_safety_summary",
    requestId: request.requestId,
    runtimeJobId: request.runtimeJobId,
    repoPath: request.smokeTestPlan?.repoPath ?? null,
    promptObjective: request.smokeTestPlan?.promptObjective ?? null,
    separateExecutorSessionId: request.sessionId || null,
    manualOperatorSessionSharedWithExecutor: false,
    separateExecutorSessionRequired: true,
    commandDescriptorSummary: {
      command: descriptor?.command ?? null,
      argsPrefix: descriptor?.args.slice(0, 3) ?? [],
      cwd: descriptor?.cwd ?? null,
      executionAllowed: descriptor?.executionAllowed ?? false,
    },
    maxRuntimeMs: request.maxRuntimeMs,
    maxStdoutBytes: request.maxStdoutBytes,
    maxStderrBytes: request.maxStderrBytes,
    disabledAuthorities: [
      "rebuild",
      "autobailout",
      "subagents",
      "acp",
      "work_queue_lifecycle_mutation",
      "model_promotion",
    ],
    expectedOversightStreamChannels: request.smokeTestPlan?.expectedOversightStreamChannels ?? [],
    expectedArtifacts: request.smokeTestPlan?.expectedArtifacts ?? [],
    processCompletionMeaning: "executor_process_completed_only",
    taskSuccessStillRequires: ["validation_evidence", "needs_review_evidence", "user_review"],
    ...smokeRequestAudit(),
  };
}

export class LocalCodexSmokeRequestRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly smokeTests: LocalCodexSmokeTestRepository,
    options: LocalCodexSmokeRequestRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async persistSmokeRunRequest(
    request: LocalCodexSmokeRunRequest,
  ): Promise<LocalCodexSmokeRunRequest> {
    await this.recordArtifact(request.runtimeJobId, "codex_bridge.smoke_run_request", request);
    await this.runtimeJobs.recordEvent({
      jobId: request.runtimeJobId,
      eventType: "codex_bridge.smoke_run_request_persisted",
      data: request as unknown as JsonValue,
    });
    return request;
  }

  async readSmokeRunRequests(runtimeJobId: string): Promise<LocalCodexSmokeRunRequest[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.smoke_run_request")
      .map((artifact) => artifact.metadata as unknown as LocalCodexSmokeRunRequest);
  }

  async readLatestSmokeRunRequest(runtimeJobId: string): Promise<LocalCodexSmokeRunRequest | null> {
    const requests = await this.readSmokeRunRequests(runtimeJobId);
    return requests.at(-1) ?? null;
  }

  convertAcceptedRequestToSmokeRunGate(request: LocalCodexSmokeRunRequest): LocalCodexSmokeRunGate {
    return evaluateLocalCodexSmokeRunGate({
      plan: request.smokeTestPlan,
      operatorAcceptance: request.operatorAcceptance,
      enableLiveCodexPilot: request.enableLiveCodexPilot,
      enableOperatorApprovedSmokeTest: request.enableOperatorApprovedSmokeTest,
      acknowledgeSeparateExecutorSession:
        request.acknowledgements.acknowledgeSeparateExecutorSession,
      acknowledgeNoSharedManualSession: request.acknowledgements.acknowledgeNoSharedManualSession,
      acknowledgeObserveOnlyLimitations: request.acknowledgements.acknowledgeObserveOnlyLimitations,
      maxRuntimeMs: request.maxRuntimeMs,
      maxStdoutBytes: request.maxStdoutBytes,
      maxStderrBytes: request.maxStderrBytes,
      dryRunMode: request.requestedMode !== "live_observe_only",
      allowWorkQueueLifecycleMutation:
        !request.acknowledgements.acknowledgeNoWorkQueueLifecycleMutation,
      now: this.now(),
    });
  }

  async executeAcceptedRequest(input: {
    request: LocalCodexSmokeRunRequest;
    runner?: SupervisorProcessRunner;
  }): Promise<LocalCodexSmokeRunRequestResult> {
    const validation = validateLocalCodexSmokeRunRequest({
      request: input.request,
      now: this.now(),
    });
    const request: LocalCodexSmokeRunRequest = {
      ...input.request,
      status: validation.status,
      blockingReasons: validation.blockingReasons,
    };
    await this.persistSmokeRunRequest(request);
    const safetySummary = createLocalCodexSmokeRunSafetySummary(request);
    let result: LocalCodexSmokeRunRequestResult;
    if (!validation.valid || !request.smokeTestPlan) {
      result = {
        artifactKind: "local_codex_smoke_run_request_result",
        requestId: request.requestId,
        runtimeJobId: request.runtimeJobId,
        smokeTestId: request.smokeTestId || null,
        requestedMode: request.requestedMode,
        status: validation.status === "expired" ? "expired" : "blocked",
        blockingReasons: validation.blockingReasons,
        planOnly: false,
        fakeDryRunUsed: false,
        executablePlanOnly: false,
        liveRunnerSupplied: false,
        smokeReport: null,
        safetySummary,
        ...smokeRequestAudit(),
      };
      await this.persistResult(result);
      return result;
    }
    if (request.requestedMode === "plan_only") {
      result = {
        artifactKind: "local_codex_smoke_run_request_result",
        requestId: request.requestId,
        runtimeJobId: request.runtimeJobId,
        smokeTestId: request.smokeTestId,
        requestedMode: request.requestedMode,
        status: "accepted_for_plan",
        blockingReasons: [],
        planOnly: true,
        fakeDryRunUsed: false,
        executablePlanOnly: true,
        liveRunnerSupplied: false,
        smokeReport: null,
        safetySummary,
        ...smokeRequestAudit(),
      };
      await this.persistResult(result);
      return result;
    }
    if (request.requestedMode === "live_observe_only" && !input.runner) {
      result = {
        artifactKind: "local_codex_smoke_run_request_result",
        requestId: request.requestId,
        runtimeJobId: request.runtimeJobId,
        smokeTestId: request.smokeTestId,
        requestedMode: request.requestedMode,
        status: "accepted_for_live_observe_only",
        blockingReasons: [],
        planOnly: false,
        fakeDryRunUsed: false,
        executablePlanOnly: true,
        liveRunnerSupplied: false,
        smokeReport: null,
        safetySummary,
        ...smokeRequestAudit(),
      };
      await this.persistResult(result);
      return result;
    }
    const gate = this.convertAcceptedRequestToSmokeRunGate(request);
    const runner = input.runner ?? new DisabledSupervisorProcessRunner();
    const report = await this.smokeTests.runSmokeTest({
      plan: request.smokeTestPlan,
      gate,
      runner,
    });
    result = {
      artifactKind: "local_codex_smoke_run_request_result",
      requestId: request.requestId,
      runtimeJobId: request.runtimeJobId,
      smokeTestId: request.smokeTestId,
      requestedMode: request.requestedMode,
      status: report.processResult?.status === "completed" ? "completed" : "failed",
      blockingReasons: report.blockingReasons,
      planOnly: false,
      fakeDryRunUsed: request.requestedMode === "fake_dry_run",
      executablePlanOnly: false,
      liveRunnerSupplied: request.requestedMode === "live_observe_only" && Boolean(input.runner),
      smokeReport: report,
      safetySummary,
      ...smokeRequestAudit(),
    };
    await this.persistResult(result);
    return result;
  }

  async readSmokeRunResults(runtimeJobId: string): Promise<LocalCodexSmokeRunRequestResult[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.smoke_run_request_result")
      .map((artifact) => artifact.metadata as unknown as LocalCodexSmokeRunRequestResult);
  }

  async readLatestSmokeRunResult(
    runtimeJobId: string,
  ): Promise<LocalCodexSmokeRunRequestResult | null> {
    const results = await this.readSmokeRunResults(runtimeJobId);
    return results.at(-1) ?? null;
  }

  private async persistResult(result: LocalCodexSmokeRunRequestResult): Promise<void> {
    await this.recordArtifact(result.runtimeJobId, "codex_bridge.smoke_run_request_result", result);
    await this.runtimeJobs.recordEvent({
      jobId: result.runtimeJobId,
      eventType: "codex_bridge.smoke_run_request_result_recorded",
      data: result as unknown as JsonValue,
    });
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundRequestMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "smoke request metadata");
    return this.runtimeJobs.attachArtifact({
      jobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/codex-bridge/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}
