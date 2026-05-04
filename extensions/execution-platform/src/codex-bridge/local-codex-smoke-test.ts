import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  evaluateObserveOnlyLocalCodexPilotGate,
  normalizeParsedCodexJsonlEvent,
  parseCodexJsonlEventLine,
  validateOperatorAcceptanceForObserveOnlyLocalCodex,
  type CodexProcessDescriptor,
  type ObserveOnlyPilotGateResult,
  type OperatorAcceptanceMetadata,
  type Slice8EPilotAudit,
  type SupervisorProcessResult,
  type SupervisorProcessRunner,
} from "./execution-supervisor.ts";
import type { LiveCodexRunnerOptions } from "./live-codex-runner.ts";
import {
  createCompletedWorkPathContract,
  type CompletedWorkPathContract,
  type FutureRunPackageMetadata,
  type ObserveOnlyReadinessEvaluation,
} from "./supervisor-adapter.ts";
import { SUPERVISOR_NAME } from "./supervisor-dry-run.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  type CodexBridgeJobPayload,
  type CodexBridgeNormalizedStreamEvent,
  isCodexBridgeJobPayload,
} from "./types.ts";

const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_WORKSPACE_DOCS_PATH = "/root/.openclaw/workspace/docs/projects/execution-platform";
const DEFAULT_MAX_RUNTIME_MS = 120_000;
const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 128 * 1024;
const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;

export type SmokeRunnerOptionsSnapshot = {
  enableLiveCodexPilot: boolean;
  allowedCommand: "codex";
  allowedArgsPrefix: ["exec", "--json", "--cd"];
  allowedRepoPath: typeof DEFAULT_REPO_PATH;
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  killSignal: NodeJS.Signals;
};

export type LocalCodexSmokeTestControlReadiness = {
  cancelCommandRecordable: true;
  pauseCommandRecordable: true;
  redirectCommandRecordable: true;
  redirectPromptMetadataRequired: true;
  commandsTargetSeparateExecutorSession: true;
  commandsTargetManualOperatorSession: false;
  liveControlImplemented: false;
};

export type LocalCodexSmokeTestPlan = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_test_plan";
  smokeTestId: string;
  runtimeJobId: string;
  sessionId: string;
  operatorAcceptance: OperatorAcceptanceMetadata;
  futureRunPackage: FutureRunPackageMetadata;
  pilotGate: ObserveOnlyPilotGateResult;
  processDescriptor: CodexProcessDescriptor;
  runnerOptionsSnapshot: SmokeRunnerOptionsSnapshot;
  repoPath: string;
  workspaceDocsPath: string;
  promptObjective: string;
  expectedOversightStreamChannels: Array<
    | "raw_terminal_event_stream"
    | "normalized_execution_event_stream"
    | "heartbeat_stream"
    | "artifact_pointer_stream"
    | "control_command_stream"
  >;
  expectedArtifacts: Array<
    | "final_response"
    | "diff_summary"
    | "validation_report"
    | "rebuild_report"
    | "followup_prompt"
    | "handoff_notes"
  >;
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  allowFileWrites: false;
  allowShellCommands: false;
  allowNetwork: false;
  allowRebuild: false;
  allowAutobailout: false;
  allowSubagents: false;
  workQueueLifecycleMutationAllowed: false;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
  controlReadiness: LocalCodexSmokeTestControlReadiness;
};

export type LocalCodexSmokeEligibility = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_eligibility";
  runtimeJobId: string;
  allowed: boolean;
  blockingReasons: string[];
  plan: LocalCodexSmokeTestPlan | null;
};

export type LocalCodexSmokeRunGate = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_run_gate";
  smokeTestId: string | null;
  allowed: boolean;
  blockingReasons: string[];
  mode: "fake_dry_run" | "real_runner_plan" | "blocked";
  operatorApprovalSatisfied: boolean;
  runnerOptionsSnapshot: SmokeRunnerOptionsSnapshot | null;
};

export type LocalCodexSmokeTestReport = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_test_report";
  smokeTestId: string;
  runtimeJobId: string;
  sessionId: string;
  workQueueLink: FutureRunPackageMetadata["workQueueLink"];
  planAllowed: boolean;
  gateAllowed: boolean;
  blockingReasons: string[];
  eventCount: number;
  finalResponseCandidate: string | null;
  finalResponsePresent: boolean;
  validationEvidencePresent: false;
  completedWorkPath: CompletedWorkPathContract;
  processResult: SupervisorProcessResult | null;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
  controlReadiness: LocalCodexSmokeTestControlReadiness;
};

export type LocalCodexSmokeStatus = Slice8EPilotAudit & {
  artifactKind: "local_codex_smoke_status";
  runtimeJobId: string;
  latestReport: LocalCodexSmokeTestReport | null;
  orderedStreamEvents: CodexBridgeNormalizedStreamEvent[];
  finalResponseCandidate: string | null;
  processResult: SupervisorProcessResult | null;
  blockingReasons: string[];
  controlReadiness: LocalCodexSmokeTestControlReadiness;
  manualOperatorSessionSharedWithExecutor: false;
  separateExecutorSessionRequired: true;
};

export type LocalCodexSmokeTestOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

function smokeAudit(): Slice8EPilotAudit {
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

function boundSmokeMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 240,
    maxArrayItems: 140,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function controlReadiness(): LocalCodexSmokeTestControlReadiness {
  return {
    cancelCommandRecordable: true,
    pauseCommandRecordable: true,
    redirectCommandRecordable: true,
    redirectPromptMetadataRequired: true,
    commandsTargetSeparateExecutorSession: true,
    commandsTargetManualOperatorSession: false,
    liveControlImplemented: false,
  };
}

function runnerSnapshot(options: LiveCodexRunnerOptions = {}): SmokeRunnerOptionsSnapshot {
  return {
    enableLiveCodexPilot: options.enableLiveCodexPilot ?? false,
    allowedCommand: "codex",
    allowedArgsPrefix: ["exec", "--json", "--cd"],
    allowedRepoPath: DEFAULT_REPO_PATH,
    maxRuntimeMs: options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES,
    killSignal: options.killSignal ?? "SIGTERM",
  };
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
  if (
    (descriptor as unknown as { envPolicy?: { secretsIncluded?: boolean } }).envPolicy
      ?.secretsIncluded !== false
  ) {
    blockingReasons.push("descriptor_env_secrets_not_allowed");
  }
  if (descriptorHasForbiddenAuthority(descriptor)) {
    blockingReasons.push("descriptor_forbidden_future_authority");
  }
  return blockingReasons;
}

function validateJob(job: RuntimeJob | null): {
  payload: CodexBridgeJobPayload | null;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!job) {
    return { payload: null, reasons: ["runtime_job_required"] };
  }
  if (job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
    return { payload: null, reasons: ["runtime_job_not_codex_bridge"] };
  }
  if (job.payload.executorKind !== "codex_cli") {
    reasons.push("executor_kind_not_codex_cli");
  }
  if (job.payload.executionMode !== "fake_stream_proof") {
    reasons.push("execution_mode_not_observe_only_compatible");
  }
  if (!job.payload.prompt.promptId || !job.payload.prompt.promptText) {
    reasons.push("finalized_prompt_required");
  }
  return { payload: job.payload, reasons };
}

export function evaluateLocalCodexSmokeRunGate(input: {
  plan: LocalCodexSmokeTestPlan | null;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  enableLiveCodexPilot?: boolean;
  enableOperatorApprovedSmokeTest?: boolean;
  acknowledgeSeparateExecutorSession?: boolean;
  acknowledgeNoSharedManualSession?: boolean;
  acknowledgeObserveOnlyLimitations?: boolean;
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  dryRunMode?: boolean;
  allowWorkQueueLifecycleMutation?: boolean;
  now?: Date;
}): LocalCodexSmokeRunGate {
  const blockingReasons: string[] = [];
  const dryRunMode = input.dryRunMode ?? true;
  if (!input.plan) {
    blockingReasons.push("smoke_test_plan_required");
  }
  if (input.enableLiveCodexPilot !== true) {
    blockingReasons.push("enable_live_codex_pilot_required");
  }
  if (input.enableOperatorApprovedSmokeTest !== true) {
    blockingReasons.push("enable_operator_approved_smoke_test_required");
  }
  if (input.acknowledgeSeparateExecutorSession !== true) {
    blockingReasons.push("separate_executor_session_acknowledgement_required");
  }
  if (input.acknowledgeNoSharedManualSession !== true) {
    blockingReasons.push("no_shared_manual_session_acknowledgement_required");
  }
  if (input.acknowledgeObserveOnlyLimitations !== true) {
    blockingReasons.push("observe_only_limitations_acknowledgement_required");
  }
  if (input.allowWorkQueueLifecycleMutation === true) {
    blockingReasons.push("work_queue_lifecycle_mutation_blocked");
  }
  if (!Number.isInteger(input.maxRuntimeMs) || (input.maxRuntimeMs ?? 0) <= 0) {
    blockingReasons.push("max_runtime_ms_required");
  }
  if (!Number.isInteger(input.maxStdoutBytes) || (input.maxStdoutBytes ?? 0) <= 0) {
    blockingReasons.push("max_stdout_bytes_required");
  }
  if (!Number.isInteger(input.maxStderrBytes) || (input.maxStderrBytes ?? 0) <= 0) {
    blockingReasons.push("max_stderr_bytes_required");
  }
  if (input.plan?.operatorAcceptance.trustProfileId !== "observe_only") {
    blockingReasons.push("trusted_yolo_profiles_blocked_in_slice_8g");
  }
  const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
    acceptance: input.operatorAcceptance,
    runtimeJobId: input.plan?.runtimeJobId ?? "",
    now: input.now,
  });
  blockingReasons.push(...acceptance.blockingReasons);
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  return {
    artifactKind: "local_codex_smoke_run_gate",
    smokeTestId: input.plan?.smokeTestId ?? null,
    allowed: uniqueBlockingReasons.length === 0,
    blockingReasons: uniqueBlockingReasons,
    mode:
      uniqueBlockingReasons.length > 0
        ? "blocked"
        : dryRunMode
          ? "fake_dry_run"
          : "real_runner_plan",
    operatorApprovalSatisfied: acceptance.valid,
    runnerOptionsSnapshot: input.plan
      ? runnerSnapshot({
          enableLiveCodexPilot: input.enableLiveCodexPilot,
          maxRuntimeMs: input.maxRuntimeMs,
          maxStdoutBytes: input.maxStdoutBytes,
          maxStderrBytes: input.maxStderrBytes,
        })
      : null,
    ...smokeAudit(),
  };
}

export class LocalCodexSmokeTestRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: LocalCodexSmokeTestOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async evaluateEligibility(input: {
    runtimeJobId: string;
    runPackage: FutureRunPackageMetadata | null;
    eligibilityReport: ObserveOnlyReadinessEvaluation | null;
    operatorAcceptance: OperatorAcceptanceMetadata | null;
    pilotGate?: ObserveOnlyPilotGateResult | null;
    runnerOptions?: LiveCodexRunnerOptions;
    smokeTestId?: string;
    sessionId?: string;
    requestWorkQueueLifecycleMutation?: boolean;
  }): Promise<LocalCodexSmokeEligibility> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    const jobValidation = validateJob(job);
    const blockingReasons = [...jobValidation.reasons];
    if (!input.runPackage) {
      blockingReasons.push("future_run_package_required");
    }
    if (!input.eligibilityReport) {
      blockingReasons.push("eligibility_report_required");
    }
    if (input.runPackage?.readinessReportSnapshot.allRequiredGateEvidencePresent !== true) {
      blockingReasons.push("readiness_report_required");
    }
    if (input.runPackage?.expectedRepoPath !== DEFAULT_REPO_PATH) {
      blockingReasons.push("repo_scope_mismatch");
    }
    if (input.runPackage?.expectedWorkspaceDocsPath !== DEFAULT_WORKSPACE_DOCS_PATH) {
      blockingReasons.push("workspace_docs_path_mismatch");
    }
    if (input.runPackage?.safeUiBridgeMetadata.tailscaleRequired !== true) {
      blockingReasons.push("safe_ui_bridge_metadata_required");
    }
    if ((input.runPackage?.validationCommandMetadata.length ?? 0) === 0) {
      blockingReasons.push("validation_command_metadata_required");
    }
    if (input.requestWorkQueueLifecycleMutation === true) {
      blockingReasons.push("work_queue_lifecycle_mutation_blocked");
    }
    const pilotGate =
      input.pilotGate ??
      evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: input.runtimeJobId,
        runPackage: input.runPackage,
        eligibilityReport: input.eligibilityReport,
        operatorAcceptance: input.operatorAcceptance,
        now: this.now(),
      });
    if (!pilotGate.allowed) {
      blockingReasons.push("pilot_gate_not_allowed", ...pilotGate.blockingReasons);
    }
    blockingReasons.push(...validateDescriptor(pilotGate.expectedProcessDescriptor));
    const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
      acceptance: input.operatorAcceptance,
      runtimeJobId: input.runtimeJobId,
      now: this.now(),
    });
    blockingReasons.push(...acceptance.blockingReasons);
    const uniqueBlockingReasons = [...new Set(blockingReasons)];
    const plan =
      uniqueBlockingReasons.length === 0 &&
      input.runPackage &&
      input.operatorAcceptance &&
      pilotGate.expectedProcessDescriptor
        ? this.createPlan({
            smokeTestId: input.smokeTestId ?? `codex-smoke-${input.runtimeJobId}`,
            sessionId: input.sessionId ?? `smoke-${randomUUID()}`,
            runtimeJobId: input.runtimeJobId,
            operatorAcceptance: input.operatorAcceptance,
            runPackage: input.runPackage,
            pilotGate,
            processDescriptor: pilotGate.expectedProcessDescriptor,
            runnerOptions: input.runnerOptions,
          })
        : null;
    return {
      artifactKind: "local_codex_smoke_eligibility",
      runtimeJobId: input.runtimeJobId,
      allowed: uniqueBlockingReasons.length === 0,
      blockingReasons: uniqueBlockingReasons,
      plan,
      ...smokeAudit(),
    };
  }

  async runSmokeTest(input: {
    plan: LocalCodexSmokeTestPlan | null;
    gate: LocalCodexSmokeRunGate;
    runner: SupervisorProcessRunner;
  }): Promise<LocalCodexSmokeTestReport> {
    if (!input.plan) {
      throw new Error("smoke test plan is required");
    }
    const plan = input.plan;
    await this.requireBridgeJob(plan.runtimeJobId);
    await this.recordArtifact(plan.runtimeJobId, "codex_bridge.smoke_test_plan", plan);
    await this.runtimeJobs.recordEvent({
      jobId: plan.runtimeJobId,
      eventType: "codex_bridge.smoke_test_planned",
      data: plan as unknown as JsonValue,
    });
    await this.recordArtifact(plan.runtimeJobId, "codex_bridge.smoke_test_gate", input.gate);
    await this.runtimeJobs.recordEvent({
      jobId: plan.runtimeJobId,
      eventType: "codex_bridge.smoke_test_gate_evaluated",
      data: input.gate as unknown as JsonValue,
    });
    let eventCount = 0;
    let finalResponse: string | null = null;
    let processResult: SupervisorProcessResult | null = null;
    if (input.gate.allowed) {
      const handshake = {
        supervisorName: SUPERVISOR_NAME,
        smokeTestId: plan.smokeTestId,
        sessionId: plan.sessionId,
        runtimeJobId: plan.runtimeJobId,
        manualOperatorSessionSharedWithExecutor: false,
        separateExecutorSessionRequired: true,
        ...smokeAudit(),
      };
      await this.recordArtifact(plan.runtimeJobId, "codex_bridge.smoke_test_session", handshake);
      await this.runtimeJobs.recordEvent({
        jobId: plan.runtimeJobId,
        eventType: "codex_bridge.smoke_test_handshake",
        data: handshake as unknown as JsonValue,
      });
      processResult = await input.runner.run(plan.processDescriptor, {
        onJsonlLine: async (line) => {
          const parsed = parseCodexJsonlEventLine(line);
          const normalized = parsed.ok
            ? normalizeParsedCodexJsonlEvent({
                event: parsed.event,
                sequence: eventCount + 1,
                now: this.now(),
              })
            : ({
                eventKind: "error",
                sourceProtocol: "codex_cli",
                sequence: eventCount + 1,
                occurredAt: this.now().toISOString(),
                summary: parsed.error.message,
                data: boundSmokeMetadata(parsed as unknown as JsonValue),
                providerCallMade: false,
                liveExecutorCallMade: false,
              } satisfies CodexBridgeNormalizedStreamEvent);
          eventCount += 1;
          if (normalized.eventKind === "final_response") {
            finalResponse = normalized.summary;
          }
          await this.runtimeJobs.recordEvent({
            jobId: plan.runtimeJobId,
            eventType: "codex_bridge.smoke_test_stream_event",
            data: {
              raw: boundSmokeMetadata(line),
              normalized: boundSmokeMetadata(normalized as unknown as JsonValue),
              smokeTestId: plan.smokeTestId,
              ...smokeAudit(),
            },
          });
        },
        onHeartbeat: async () => {
          await this.runtimeJobs.recordEvent({
            jobId: plan.runtimeJobId,
            eventType: "codex_bridge.smoke_test_heartbeat",
            data: {
              smokeTestId: plan.smokeTestId,
              sessionId: plan.sessionId,
              heartbeatAt: this.now().toISOString(),
              ...smokeAudit(),
            },
          });
        },
      });
      if (finalResponse) {
        await this.recordArtifact(plan.runtimeJobId, "codex_bridge.completed_work.final_response", {
          artifactKind: "completed_work",
          completedWorkKind: "final_response",
          summary: finalResponse,
          inlineText: finalResponse,
          metadata: {
            smokeTestId: plan.smokeTestId,
            sessionId: plan.sessionId,
            source: "local_codex_smoke_test_runner",
            ...smokeAudit(),
          },
        });
      }
      await this.runtimeJobs.recordEvent({
        jobId: plan.runtimeJobId,
        eventType: "codex_bridge.smoke_test_process_completed",
        data: {
          smokeTestId: plan.smokeTestId,
          sessionId: plan.sessionId,
          processResult: processResult as unknown as JsonValue,
          processCompletionIsTaskSuccess: false,
          ...smokeAudit(),
        },
      });
    }
    const completedWorkPath = createCompletedWorkPathContract({
      executorProcessCompleted: processResult?.status === "completed",
      assistantFinalResponseReceived: finalResponse !== null,
      validationPassed: false,
    });
    const report: LocalCodexSmokeTestReport = {
      artifactKind: "local_codex_smoke_test_report",
      smokeTestId: plan.smokeTestId,
      runtimeJobId: plan.runtimeJobId,
      sessionId: plan.sessionId,
      workQueueLink: plan.futureRunPackage.workQueueLink,
      planAllowed: true,
      gateAllowed: input.gate.allowed,
      blockingReasons: input.gate.blockingReasons,
      eventCount,
      finalResponseCandidate: finalResponse,
      finalResponsePresent: finalResponse !== null,
      validationEvidencePresent: false,
      completedWorkPath,
      processResult,
      manualOperatorSessionSharedWithExecutor: false,
      separateExecutorSessionRequired: true,
      controlReadiness: plan.controlReadiness,
      ...smokeAudit(),
    };
    await this.recordArtifact(plan.runtimeJobId, "codex_bridge.smoke_test_report", report);
    return report;
  }

  async readSmokeTestReports(runtimeJobId: string): Promise<LocalCodexSmokeTestReport[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.smoke_test_report")
      .map((artifact) => artifact.metadata as unknown as LocalCodexSmokeTestReport);
  }

  async readOrderedSmokeTestStreamEvents(
    runtimeJobId: string,
  ): Promise<CodexBridgeNormalizedStreamEvent[]> {
    const events = await this.runtimeJobs.listEvents(runtimeJobId, 500);
    return events
      .filter((event) => event.eventType === "codex_bridge.smoke_test_stream_event")
      .map((event) => {
        const data = event.data as Record<string, unknown>;
        return data.normalized as CodexBridgeNormalizedStreamEvent | undefined;
      })
      .filter((event): event is CodexBridgeNormalizedStreamEvent => Boolean(event))
      .toSorted((left, right) => left.sequence - right.sequence);
  }

  async readSmokeTestStatus(runtimeJobId: string): Promise<LocalCodexSmokeStatus> {
    const reports = await this.readSmokeTestReports(runtimeJobId);
    const latestReport = reports.at(-1) ?? null;
    const orderedStreamEvents = await this.readOrderedSmokeTestStreamEvents(runtimeJobId);
    const finalResponseCandidate =
      latestReport?.finalResponseCandidate ??
      orderedStreamEvents.findLast((event) => event.eventKind === "final_response")?.summary ??
      null;
    return {
      artifactKind: "local_codex_smoke_status",
      runtimeJobId,
      latestReport,
      orderedStreamEvents,
      finalResponseCandidate,
      processResult: latestReport?.processResult ?? null,
      blockingReasons: latestReport?.blockingReasons ?? [],
      controlReadiness: latestReport?.controlReadiness ?? controlReadiness(),
      manualOperatorSessionSharedWithExecutor: false,
      separateExecutorSessionRequired: true,
      ...smokeAudit(),
    };
  }

  private createPlan(input: {
    smokeTestId: string;
    sessionId: string;
    runtimeJobId: string;
    operatorAcceptance: OperatorAcceptanceMetadata;
    runPackage: FutureRunPackageMetadata;
    pilotGate: ObserveOnlyPilotGateResult;
    processDescriptor: CodexProcessDescriptor;
    runnerOptions?: LiveCodexRunnerOptions;
  }): LocalCodexSmokeTestPlan {
    const snapshot = runnerSnapshot(input.runnerOptions);
    return {
      artifactKind: "local_codex_smoke_test_plan",
      smokeTestId: input.smokeTestId,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      operatorAcceptance: input.operatorAcceptance,
      futureRunPackage: input.runPackage,
      pilotGate: input.pilotGate,
      processDescriptor: input.processDescriptor,
      runnerOptionsSnapshot: snapshot,
      repoPath: input.runPackage.expectedRepoPath,
      workspaceDocsPath: input.runPackage.expectedWorkspaceDocsPath,
      promptObjective: input.runPackage.finalizedPromptArtifact.objective,
      expectedOversightStreamChannels: [
        "raw_terminal_event_stream",
        "normalized_execution_event_stream",
        "heartbeat_stream",
        "artifact_pointer_stream",
        "control_command_stream",
      ],
      expectedArtifacts: [
        "final_response",
        "diff_summary",
        "validation_report",
        "rebuild_report",
        "followup_prompt",
        "handoff_notes",
      ],
      maxRuntimeMs: snapshot.maxRuntimeMs,
      maxStdoutBytes: snapshot.maxStdoutBytes,
      maxStderrBytes: snapshot.maxStderrBytes,
      allowFileWrites: false,
      allowShellCommands: false,
      allowNetwork: false,
      allowRebuild: false,
      allowAutobailout: false,
      allowSubagents: false,
      workQueueLifecycleMutationAllowed: false,
      manualOperatorSessionSharedWithExecutor: false,
      separateExecutorSessionRequired: true,
      controlReadiness: controlReadiness(),
      ...smokeAudit(),
    };
  }

  private async requireBridgeJob(runtimeJobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${runtimeJobId}`);
    }
    return job;
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundSmokeMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "smoke test metadata");
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
