import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  validateOperatorAcceptanceForObserveOnlyLocalCodex,
  type CodexProcessDescriptor,
  type OperatorAcceptanceMetadata,
  type Slice8EPilotAudit,
} from "./execution-supervisor.ts";
import {
  validateLocalCodexSmokeRunRequest,
  type LocalCodexSmokeRequestRepository,
  type LocalCodexSmokeRunAcknowledgements,
  type LocalCodexSmokeRunRequest,
  type LocalCodexSmokeRunRequestResult,
} from "./local-codex-smoke-request.ts";
import {
  type LocalCodexSmokeRunGate,
  type LocalCodexSmokeTestPlan,
  type SmokeRunnerOptionsSnapshot,
} from "./local-codex-smoke-test.ts";
import { CODEX_BRIDGE_JOB_TYPE, isCodexBridgeJobPayload } from "./types.ts";

const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_WORKSPACE_DOCS_PATH = "/root/.openclaw/workspace/docs/projects/execution-platform";
const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;
const MAX_PREFLIGHT_RUNTIME_MS = 30 * 60 * 1000;
const MAX_PREFLIGHT_STDOUT_BYTES = 10 * 1024 * 1024;
const MAX_PREFLIGHT_STDERR_BYTES = 1024 * 1024;

export type LocalCodexSmokePreflightNextAction =
  | "none_blocked"
  | "run_single_observe_only_smoke_test"
  | "create_or_fix_smoke_request"
  | "refresh_operator_acceptance"
  | "review_readiness_docs"
  | "fix_runtime_job_or_prompt_artifact";

export type LocalCodexSmokePreflightCommandDescriptorSummary = {
  command: string | null;
  argsPrefix: string[];
  cwd: string | null;
  repoPath: string | null;
  executionAllowed: boolean;
  sourcePackageId: string | null;
};

export type LocalCodexSmokePreflightReport = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_preflight_report";
  preflightId: string;
  runtimeJobId: string;
  requestId: string | null;
  smokeTestId: string | null;
  sessionId: string | null;
  checkedAt: string;
  checkedBy: string;
  requestedMode: LocalCodexSmokeRunRequest["requestedMode"] | null;
  requestedLiveMode: "live_observe_only";
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  smokeRunRequest: LocalCodexSmokeRunRequest | null;
  smokeTestPlan: LocalCodexSmokeTestPlan | null;
  smokeRunGate: LocalCodexSmokeRunGate | null;
  processDescriptor: CodexProcessDescriptor | null;
  runnerOptionsSnapshot: SmokeRunnerOptionsSnapshot | null;
  repoPath: string | null;
  workspaceDocsPath: string | null;
  safeUiBridgeMetadata: LocalCodexSmokeTestPlan["futureRunPackage"]["safeUiBridgeMetadata"] | null;
  validationCommandMetadata:
    | LocalCodexSmokeTestPlan["futureRunPackage"]["validationCommandMetadata"]
    | null;
  commandDescriptorSummary: LocalCodexSmokePreflightCommandDescriptorSummary;
  expectedOversightStreamChannels: LocalCodexSmokeTestPlan["expectedOversightStreamChannels"];
  expectedArtifacts: LocalCodexSmokeTestPlan["expectedArtifacts"];
  controlReadiness: LocalCodexSmokeTestPlan["controlReadiness"] | null;
  workQueueLink: LocalCodexSmokeTestPlan["futureRunPackage"]["workQueueLink"] | null;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
  liveSmokeTestRunInThisSlice: false;
  allowed: boolean;
  blockingReasons: string[];
  nextOperatorAction: LocalCodexSmokePreflightNextAction;
};

export type LocalCodexSmokeOperatorRunbook = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_operator_runbook";
  runbookId: string;
  runtimeJobId: string;
  requestId: string | null;
  smokeTestId: string | null;
  sessionId: string | null;
  createdAt: string;
  createdBy: string;
  allowedToRun: boolean;
  nextOperatorAction: LocalCodexSmokePreflightNextAction;
  runScope: {
    oneRuntimeJob: true;
    oneRequest: true;
    oneSeparateExecutorSession: true;
    executionMode: "observe_only_local_codex";
    repoPath: string | null;
    maxRuntimeMs: number | null;
    maxStdoutBytes: number | null;
    maxStderrBytes: number | null;
  };
  requiredAcknowledgementsSatisfied: boolean;
  commandDescriptorSummary: LocalCodexSmokePreflightCommandDescriptorSummary;
  expectedOversightStreamChannels: LocalCodexSmokePreflightReport["expectedOversightStreamChannels"];
  expectedArtifacts: LocalCodexSmokePreflightReport["expectedArtifacts"];
  verificationAfterRun: Array<
    | "stream_events_recorded"
    | "heartbeat_recorded"
    | "final_response_candidate_if_present"
    | "process_completion_evidence_recorded"
    | "completed_work_path_not_task_success_without_validation_or_needs_review"
  >;
  explicitProhibitions: Array<
    | "no_rebuild"
    | "no_autobailout"
    | "no_subagents"
    | "no_acp"
    | "no_work_queue_lifecycle_mutation"
    | "no_model_promotion"
    | "no_arbitrary_payload_commands"
  >;
  rollbackAbortConditions: Array<
    | "request_expired"
    | "repo_path_mismatch"
    | "descriptor_mismatch"
    | "unsafe_authority_detected"
    | "missing_safe_ui_bridge_metadata"
    | "missing_validation_metadata"
    | "duplicate_command_execution_evidence"
  >;
  actualCommandExecutionPerformedByThisSlice: false;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
  processCompletionIsTaskSuccess: false;
};

export type LocalCodexSmokePreflightOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

function preflightAudit(): Slice8EPilotAudit {
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

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function boundPreflightMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 280,
    maxArrayItems: 180,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function descriptorSummary(
  descriptor: CodexProcessDescriptor | null,
): LocalCodexSmokePreflightCommandDescriptorSummary {
  return {
    command: descriptor?.command ?? null,
    argsPrefix: descriptor?.args.slice(0, 3) ?? [],
    cwd: descriptor?.cwd ?? null,
    repoPath: descriptor?.args[3] ?? null,
    executionAllowed: descriptor?.executionAllowed ?? false,
    sourcePackageId: descriptor?.sourcePackageId ?? null,
  };
}

function hasForbiddenDescriptorAuthority(descriptor: CodexProcessDescriptor | null): boolean {
  if (!descriptor) {
    return false;
  }
  const record = descriptor as unknown as Record<string, unknown>;
  return (
    record.allowRebuild === true ||
    record.allowAutobailout === true ||
    record.allowSubagents === true ||
    record.allowNetwork === true ||
    record.allowFileWrites === true ||
    record.allowShellCommands === true ||
    record.allowWorkQueueLifecycleMutation === true ||
    record.allowAcp === true ||
    record.allowModelPromotion === true ||
    record.schedulerStarted === true ||
    record.daemonStarted === true
  );
}

function validateRuntimeJob(job: RuntimeJob | null): string[] {
  if (!job) {
    return ["runtime_job_required"];
  }
  const blockingReasons: string[] = [];
  if (job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
    blockingReasons.push("runtime_job_not_codex_bridge");
    return blockingReasons;
  }
  if (job.payload.executorKind !== "codex_cli") {
    blockingReasons.push("executor_kind_not_codex_cli");
  }
  if (job.payload.executionMode !== "fake_stream_proof") {
    blockingReasons.push("execution_mode_not_observe_only_compatible");
  }
  if (!job.payload.prompt.promptId || !job.payload.prompt.promptText) {
    blockingReasons.push("finalized_prompt_required");
  }
  return blockingReasons;
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
  if (hasForbiddenDescriptorAuthority(descriptor)) {
    blockingReasons.push("descriptor_forbidden_future_authority");
  }
  return blockingReasons;
}

function validateLimits(request: LocalCodexSmokeRunRequest | null): string[] {
  if (!request) {
    return [];
  }
  const blockingReasons: string[] = [];
  if (!Number.isInteger(request.maxRuntimeMs) || request.maxRuntimeMs <= 0) {
    blockingReasons.push("max_runtime_ms_required");
  } else if (request.maxRuntimeMs > MAX_PREFLIGHT_RUNTIME_MS) {
    blockingReasons.push("max_runtime_ms_exceeds_bound");
  }
  if (!Number.isInteger(request.maxStdoutBytes) || request.maxStdoutBytes <= 0) {
    blockingReasons.push("max_stdout_bytes_required");
  } else if (request.maxStdoutBytes > MAX_PREFLIGHT_STDOUT_BYTES) {
    blockingReasons.push("max_stdout_bytes_exceeds_bound");
  }
  if (!Number.isInteger(request.maxStderrBytes) || request.maxStderrBytes <= 0) {
    blockingReasons.push("max_stderr_bytes_required");
  } else if (request.maxStderrBytes > MAX_PREFLIGHT_STDERR_BYTES) {
    blockingReasons.push("max_stderr_bytes_exceeds_bound");
  }
  return blockingReasons;
}

function allAcknowledgementsPresent(
  acknowledgements: LocalCodexSmokeRunAcknowledgements | null,
): boolean {
  return acknowledgements ? Object.values(acknowledgements).every(Boolean) : false;
}

function requestResultHasCommandExecution(result: LocalCodexSmokeRunRequestResult): boolean {
  const record = result as unknown as Record<string, unknown>;
  const processResult = result.smokeReport?.processResult as unknown as
    | Record<string, unknown>
    | null
    | undefined;
  return (
    record.commandExecuted === true ||
    result.liveRunnerSupplied ||
    processResult?.commandExecuted === true ||
    processResult?.codexCliInvoked === true ||
    processResult?.liveExecutionEnabled === true
  );
}

function actionForBlockingReasons(blockingReasons: string[]): LocalCodexSmokePreflightNextAction {
  if (blockingReasons.length === 0) {
    return "run_single_observe_only_smoke_test";
  }
  if (
    blockingReasons.some((reason) =>
      [
        "operator_acceptance_required",
        "operator_acceptance_expired",
        "accepted_by_required",
        "request_expired",
      ].includes(reason),
    )
  ) {
    return "refresh_operator_acceptance";
  }
  if (
    blockingReasons.some((reason) =>
      ["readiness_report_required", "pilot_gate_not_allowed"].includes(reason),
    )
  ) {
    return "review_readiness_docs";
  }
  if (
    blockingReasons.some((reason) =>
      [
        "runtime_job_required",
        "runtime_job_not_codex_bridge",
        "executor_kind_not_codex_cli",
        "finalized_prompt_required",
      ].includes(reason),
    )
  ) {
    return "fix_runtime_job_or_prompt_artifact";
  }
  if (
    blockingReasons.some((reason) =>
      [
        "smoke_run_request_required",
        "smoke_test_plan_required",
        "request_mode_not_live_observe_only",
        "request_not_accepted_for_live_observe_only",
      ].includes(reason),
    )
  ) {
    return "create_or_fix_smoke_request";
  }
  return "none_blocked";
}

function validatePreflightInput(input: {
  job: RuntimeJob | null;
  request: LocalCodexSmokeRunRequest | null;
  requestResults: LocalCodexSmokeRunRequestResult[];
  now: Date;
}): string[] {
  const blockingReasons: string[] = [];
  blockingReasons.push(...validateRuntimeJob(input.job));
  const request = input.request;
  if (!request) {
    return [...new Set([...blockingReasons, "smoke_run_request_required"])];
  }
  if (request.requestedMode !== "live_observe_only") {
    blockingReasons.push("request_mode_not_live_observe_only");
  }
  if (request.status !== "accepted_for_live_observe_only") {
    blockingReasons.push("request_not_accepted_for_live_observe_only");
  }
  const requestValidation = validateLocalCodexSmokeRunRequest({
    request,
    now: input.now,
  });
  blockingReasons.push(...requestValidation.blockingReasons);
  if (requestValidation.status !== "accepted_for_live_observe_only") {
    blockingReasons.push("request_not_accepted_for_live_observe_only");
  }
  const plan = request.smokeTestPlan;
  if (!plan) {
    blockingReasons.push("smoke_test_plan_required");
  }
  if (!request.smokeRunGate.allowed) {
    blockingReasons.push("smoke_run_gate_not_allowed", ...request.smokeRunGate.blockingReasons);
  }
  if (!request.runnerOptionsSnapshot?.enableLiveCodexPilot) {
    blockingReasons.push("runner_options_live_pilot_required");
  }
  if (!allAcknowledgementsPresent(request.acknowledgements)) {
    blockingReasons.push("all_smoke_request_acknowledgements_required");
  }
  if (request.operatorAcceptance) {
    const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
      acceptance: request.operatorAcceptance,
      runtimeJobId: request.runtimeJobId,
      now: input.now,
    });
    blockingReasons.push(...acceptance.blockingReasons);
    if (request.operatorAcceptance.allowNetwork) {
      blockingReasons.push("observe_only_network_blocked");
    }
  }
  if (plan) {
    if (plan.repoPath !== DEFAULT_REPO_PATH) {
      blockingReasons.push("repo_scope_mismatch");
    }
    if (plan.workspaceDocsPath !== DEFAULT_WORKSPACE_DOCS_PATH) {
      blockingReasons.push("workspace_docs_path_mismatch");
    }
    if (!plan.futureRunPackage.safeUiBridgeMetadata.tailscaleRequired) {
      blockingReasons.push("safe_ui_bridge_metadata_required");
    }
    if (plan.futureRunPackage.validationCommandMetadata.length === 0) {
      blockingReasons.push("validation_command_metadata_required");
    }
    if (plan.allowFileWrites) {
      blockingReasons.push("file_write_authority_blocked");
    }
    if (plan.allowShellCommands) {
      blockingReasons.push("shell_authority_blocked");
    }
    if (plan.allowNetwork) {
      blockingReasons.push("network_authority_blocked");
    }
    if (plan.allowRebuild) {
      blockingReasons.push("rebuild_authority_blocked");
    }
    if (plan.allowAutobailout) {
      blockingReasons.push("autobailout_authority_blocked");
    }
    if (plan.allowSubagents) {
      blockingReasons.push("subagent_authority_blocked");
    }
    if (plan.workQueueLifecycleMutationAllowed) {
      blockingReasons.push("work_queue_lifecycle_mutation_blocked");
    }
    blockingReasons.push(...validateDescriptor(plan.processDescriptor));
  }
  blockingReasons.push(...validateLimits(request));
  if (
    input.requestResults
      .filter((result) => result.requestId === request.requestId)
      .some(requestResultHasCommandExecution)
  ) {
    blockingReasons.push("prior_command_execution_evidence_found");
  }
  return [...new Set(blockingReasons)];
}

export class LocalCodexSmokePreflightRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly smokeRequests: LocalCodexSmokeRequestRepository,
    options: LocalCodexSmokePreflightOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async createPreflightReport(input: {
    runtimeJobId: string;
    checkedBy: string;
    preflightId?: string;
  }): Promise<LocalCodexSmokePreflightReport> {
    const now = this.now();
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    const request = await this.smokeRequests.readLatestSmokeRunRequest(input.runtimeJobId);
    const requestResults = await this.smokeRequests.readSmokeRunResults(input.runtimeJobId);
    const plan = request?.smokeTestPlan ?? null;
    const descriptor = plan?.processDescriptor ?? null;
    const blockingReasons = validatePreflightInput({
      job,
      request,
      requestResults,
      now,
    });
    const allowed = blockingReasons.length === 0;
    return {
      artifactKind: "local_codex_smoke_preflight_report",
      preflightId: input.preflightId ?? `codex-smoke-preflight-${randomUUID()}`,
      runtimeJobId: input.runtimeJobId,
      requestId: request?.requestId ?? null,
      smokeTestId: request?.smokeTestId || null,
      sessionId: request?.sessionId || null,
      checkedAt: now.toISOString(),
      checkedBy: input.checkedBy,
      requestedMode: request?.requestedMode ?? null,
      requestedLiveMode: "live_observe_only",
      operatorAcceptance: request?.operatorAcceptance ?? null,
      smokeRunRequest: request,
      smokeTestPlan: plan,
      smokeRunGate: request?.smokeRunGate ?? null,
      processDescriptor: descriptor,
      runnerOptionsSnapshot: request?.runnerOptionsSnapshot ?? null,
      repoPath: plan?.repoPath ?? null,
      workspaceDocsPath: plan?.workspaceDocsPath ?? null,
      safeUiBridgeMetadata: plan?.futureRunPackage.safeUiBridgeMetadata ?? null,
      validationCommandMetadata: plan?.futureRunPackage.validationCommandMetadata ?? null,
      commandDescriptorSummary: descriptorSummary(descriptor),
      expectedOversightStreamChannels: plan?.expectedOversightStreamChannels ?? [],
      expectedArtifacts: plan?.expectedArtifacts ?? [],
      controlReadiness: plan?.controlReadiness ?? null,
      workQueueLink: plan?.futureRunPackage.workQueueLink ?? null,
      manualOperatorSessionSharedWithExecutor: false,
      separateExecutorSessionRequired: true,
      liveSmokeTestRunInThisSlice: false,
      allowed,
      blockingReasons,
      nextOperatorAction: actionForBlockingReasons(blockingReasons),
      ...preflightAudit(),
    };
  }

  async persistPreflightReport(
    report: LocalCodexSmokePreflightReport,
  ): Promise<LocalCodexSmokePreflightReport> {
    await this.recordArtifact(report.runtimeJobId, "codex_bridge.smoke_preflight_report", report);
    await this.runtimeJobs.recordEvent({
      jobId: report.runtimeJobId,
      eventType: "codex_bridge.smoke_preflight_checked",
      data: report as unknown as JsonValue,
    });
    return report;
  }

  async checkAndPersistPreflight(input: {
    runtimeJobId: string;
    checkedBy: string;
    preflightId?: string;
  }): Promise<LocalCodexSmokePreflightReport> {
    const report = await this.createPreflightReport(input);
    return this.persistPreflightReport(report);
  }

  async readPreflightReports(runtimeJobId: string): Promise<LocalCodexSmokePreflightReport[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.smoke_preflight_report")
      .map((artifact) => artifact.metadata as unknown as LocalCodexSmokePreflightReport);
  }

  async readLatestPreflightReport(
    runtimeJobId: string,
  ): Promise<LocalCodexSmokePreflightReport | null> {
    const reports = await this.readPreflightReports(runtimeJobId);
    return reports.at(-1) ?? null;
  }

  async requestAlreadyHasPreflight(runtimeJobId: string, requestId: string): Promise<boolean> {
    const reports = await this.readPreflightReports(runtimeJobId);
    return reports.some((report) => report.requestId === requestId);
  }

  createOperatorRunbook(input: {
    report: LocalCodexSmokePreflightReport;
    createdBy: string;
    runbookId?: string;
  }): LocalCodexSmokeOperatorRunbook {
    const report = input.report;
    const request = report.smokeRunRequest;
    return {
      artifactKind: "local_codex_smoke_operator_runbook",
      runbookId: input.runbookId ?? `codex-smoke-runbook-${randomUUID()}`,
      runtimeJobId: report.runtimeJobId,
      requestId: report.requestId,
      smokeTestId: report.smokeTestId,
      sessionId: report.sessionId,
      createdAt: this.now().toISOString(),
      createdBy: input.createdBy,
      allowedToRun: report.allowed,
      nextOperatorAction: report.nextOperatorAction,
      runScope: {
        oneRuntimeJob: true,
        oneRequest: true,
        oneSeparateExecutorSession: true,
        executionMode: "observe_only_local_codex",
        repoPath: report.repoPath,
        maxRuntimeMs: request?.maxRuntimeMs ?? null,
        maxStdoutBytes: request?.maxStdoutBytes ?? null,
        maxStderrBytes: request?.maxStderrBytes ?? null,
      },
      requiredAcknowledgementsSatisfied: allAcknowledgementsPresent(
        request?.acknowledgements ?? null,
      ),
      commandDescriptorSummary: report.commandDescriptorSummary,
      expectedOversightStreamChannels: report.expectedOversightStreamChannels,
      expectedArtifacts: report.expectedArtifacts,
      verificationAfterRun: [
        "stream_events_recorded",
        "heartbeat_recorded",
        "final_response_candidate_if_present",
        "process_completion_evidence_recorded",
        "completed_work_path_not_task_success_without_validation_or_needs_review",
      ],
      explicitProhibitions: [
        "no_rebuild",
        "no_autobailout",
        "no_subagents",
        "no_acp",
        "no_work_queue_lifecycle_mutation",
        "no_model_promotion",
        "no_arbitrary_payload_commands",
      ],
      rollbackAbortConditions: [
        "request_expired",
        "repo_path_mismatch",
        "descriptor_mismatch",
        "unsafe_authority_detected",
        "missing_safe_ui_bridge_metadata",
        "missing_validation_metadata",
        "duplicate_command_execution_evidence",
      ],
      actualCommandExecutionPerformedByThisSlice: false,
      manualOperatorSessionSharedWithExecutor: false,
      separateExecutorSessionRequired: true,
      processCompletionIsTaskSuccess: false,
      ...preflightAudit(),
    };
  }

  async createAndPersistOperatorRunbook(input: {
    report?: LocalCodexSmokePreflightReport;
    runtimeJobId?: string;
    createdBy: string;
    runbookId?: string;
  }): Promise<LocalCodexSmokeOperatorRunbook> {
    const report =
      input.report ??
      (input.runtimeJobId ? await this.readLatestPreflightReport(input.runtimeJobId) : null);
    if (!report) {
      throw new Error("preflight report is required to create an operator runbook");
    }
    const runbook = this.createOperatorRunbook({
      report,
      createdBy: input.createdBy,
      runbookId: input.runbookId,
    });
    await this.recordArtifact(runbook.runtimeJobId, "codex_bridge.smoke_operator_runbook", runbook);
    await this.runtimeJobs.recordEvent({
      jobId: runbook.runtimeJobId,
      eventType: "codex_bridge.smoke_operator_runbook_created",
      data: runbook as unknown as JsonValue,
    });
    return runbook;
  }

  async readOperatorRunbooks(runtimeJobId: string): Promise<LocalCodexSmokeOperatorRunbook[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.smoke_operator_runbook")
      .map((artifact) => artifact.metadata as unknown as LocalCodexSmokeOperatorRunbook);
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundPreflightMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "smoke preflight metadata");
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
