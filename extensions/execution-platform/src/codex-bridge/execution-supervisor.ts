import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  createCompletedWorkPathContract,
  type CompletedWorkPathContract,
  type FutureRunPackageMetadata,
  type FutureSupervisorExecutionMode,
  type NoLiveExecutionAudit,
  type ObserveOnlyReadinessEvaluation,
} from "./supervisor-adapter.ts";
import { SUPERVISOR_NAME } from "./supervisor-dry-run.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  type CodexBridgeNormalizedStreamEvent,
  type TrustProfileId,
  isCodexBridgeJobPayload,
} from "./types.ts";

export type Slice8EPilotAudit = NoLiveExecutionAudit & {
  commandExecuted: false;
};

export type SupervisorProcessAudit = {
  codexCliInvoked: boolean;
  acpSessionStarted: boolean;
  shellCommandExecuted: boolean;
  providerCallMade: boolean;
  rebuildPerformed: boolean;
  schedulerStarted: boolean;
  daemonStarted: boolean;
  subagentStarted: boolean;
  liveExecutionEnabled: boolean;
  commandExecuted: boolean;
};

export type OperatorAcceptanceMetadata = {
  artifactKind: "operator_acceptance";
  acceptedBy: string;
  acceptedAt: string;
  acceptedScope: "single_runtime_job";
  runtimeJobId: string;
  trustProfileId: TrustProfileId;
  executionMode: FutureSupervisorExecutionMode;
  repoPath: string;
  maxRuntimeMs: number;
  allowFileWrites: boolean;
  allowShellCommands: boolean;
  allowNetwork: boolean;
  allowRebuild: boolean;
  allowAutobailout: boolean;
  allowSubagents: boolean;
  reason: string;
  expiresAt: string;
};

export type OperatorAcceptanceValidation = Slice8EPilotAudit & {
  valid: boolean;
  blockingReasons: string[];
};

export type CodexProcessDescriptor = Slice8EPilotAudit & {
  artifactKind: "codex_process_descriptor";
  descriptorId: string;
  command: "codex";
  args: string[];
  cwd: string;
  envPolicy: {
    secretsIncluded: false;
    inheritedEnvAllowed: false;
  };
  promptStrategy: "inline_finalized_prompt_text";
  expectedStdout: "jsonl_events";
  expectedStderr: "progress_events";
  expectedStream: "codex_exec_jsonl";
  maxRuntimeMs: number;
  executionAllowed: boolean;
  sourcePackageId: string;
};

export type CodexJsonlParseResult =
  | {
      ok: true;
      event: Record<string, JsonValue>;
    }
  | {
      ok: false;
      error: {
        code: "malformed_jsonl";
        message: string;
      };
      rawLine: string;
    };

export type SupervisorProcessResult = SupervisorProcessAudit & {
  status: "completed" | "failed" | "refused" | "timed_out" | "killed";
  exitCode: number | null;
  errorMessage: string | null;
  finalMessage: string | null;
  emittedEventCount: number;
};

export type SupervisorProcessCallbacks = {
  onJsonlLine?: (line: string) => Promise<void> | void;
  onHeartbeat?: () => Promise<void> | void;
  onCodexAppServerEvent?: (event: JsonValue) => Promise<void> | void;
};

export type SupervisorProcessRunner = {
  run(
    descriptor: CodexProcessDescriptor,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<SupervisorProcessResult>;
};

export type ObserveOnlyPilotGateResult = Slice8EPilotAudit & {
  artifactKind: "observe_only_pilot_gate";
  runtimeJobId: string;
  allowed: boolean;
  blockingReasons: string[];
  operatorApprovalRequired: boolean;
  operatorApprovalSatisfied: boolean;
  expectedProcessDescriptor: CodexProcessDescriptor | null;
  expectedStreamParser: "codex_exec_jsonl";
  expectedArtifactContract: CompletedWorkPathContract;
};

export type SupervisorPilotReport = Slice8EPilotAudit & {
  artifactKind: "supervisor_pilot_report";
  runtimeJobId: string;
  sessionId: string;
  workQueueLink: FutureRunPackageMetadata["workQueueLink"];
  processDescriptor: CodexProcessDescriptor | null;
  gateAllowed: boolean;
  blockingReasons: string[];
  eventCount: number;
  finalResponsePresent: boolean;
  validationEvidencePresent: boolean;
  completedWorkPath: CompletedWorkPathContract;
  processResult: SupervisorProcessResult | null;
};

export type ExecutionSupervisorOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;
const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
const DEFAULT_WORKSPACE_DOCS_PATH = "/root/.openclaw/workspace/docs/projects/execution-platform";

function pilotAudit(): Slice8EPilotAudit {
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

function boundSupervisorMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 220,
    maxArrayItems: 120,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function summaryValue(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return JSON.stringify(value);
}

function textFromItem(item: Record<string, unknown>): string | null {
  const text = item.text;
  if (typeof text === "string") {
    return text;
  }
  const message = item.message;
  if (typeof message === "string") {
    return message;
  }
  const content = item.content;
  if (typeof content === "string") {
    return content;
  }
  return null;
}

function itemType(item: Record<string, unknown>): string {
  const type = item.type;
  return typeof type === "string" ? type : "unknown";
}

function eventTimestamp(event: Record<string, unknown>, fallback: Date): string {
  const timestamp = event.timestamp ?? event.created_at ?? event.createdAt;
  return typeof timestamp === "string" ? timestamp : fallback.toISOString();
}

export function createOperatorAcceptanceMetadata(input: {
  acceptedBy: string;
  acceptedAt: string;
  runtimeJobId: string;
  trustProfileId: TrustProfileId;
  executionMode: FutureSupervisorExecutionMode;
  repoPath: string;
  maxRuntimeMs: number;
  reason: string;
  expiresAt: string;
  allowFileWrites?: boolean;
  allowShellCommands?: boolean;
  allowNetwork?: boolean;
  allowRebuild?: boolean;
  allowAutobailout?: boolean;
  allowSubagents?: boolean;
}): OperatorAcceptanceMetadata {
  return {
    artifactKind: "operator_acceptance",
    acceptedBy: input.acceptedBy,
    acceptedAt: input.acceptedAt,
    acceptedScope: "single_runtime_job",
    runtimeJobId: input.runtimeJobId,
    trustProfileId: input.trustProfileId,
    executionMode: input.executionMode,
    repoPath: input.repoPath,
    maxRuntimeMs: input.maxRuntimeMs,
    allowFileWrites: input.allowFileWrites ?? false,
    allowShellCommands: input.allowShellCommands ?? false,
    allowNetwork: input.allowNetwork ?? false,
    allowRebuild: input.allowRebuild ?? false,
    allowAutobailout: input.allowAutobailout ?? false,
    allowSubagents: input.allowSubagents ?? false,
    reason: input.reason,
    expiresAt: input.expiresAt,
  };
}

export function validateOperatorAcceptanceForObserveOnlyLocalCodex(input: {
  acceptance: OperatorAcceptanceMetadata | null;
  runtimeJobId: string;
  expectedRepoPath?: string;
  now?: Date;
}): OperatorAcceptanceValidation {
  const blockingReasons: string[] = [];
  const acceptance = input.acceptance;
  if (!acceptance) {
    return {
      valid: false,
      blockingReasons: ["operator_acceptance_required"],
      ...pilotAudit(),
    };
  }
  if (!acceptance.acceptedBy) {
    blockingReasons.push("accepted_by_required");
  }
  if (!acceptance.runtimeJobId || acceptance.runtimeJobId !== input.runtimeJobId) {
    blockingReasons.push("runtime_job_id_mismatch");
  }
  if (acceptance.repoPath !== (input.expectedRepoPath ?? DEFAULT_REPO_PATH)) {
    blockingReasons.push("repo_scope_mismatch");
  }
  if (acceptance.trustProfileId !== "observe_only" && acceptance.trustProfileId !== "approve_run") {
    blockingReasons.push("trusted_yolo_profiles_blocked_in_slice_8e");
  }
  if (
    acceptance.executionMode !== "observe_only_live_local_codex" &&
    acceptance.executionMode !== "approve_run_live_local_codex"
  ) {
    blockingReasons.push("unsupported_execution_mode_for_slice_8e");
  }
  if (!Number.isInteger(acceptance.maxRuntimeMs) || acceptance.maxRuntimeMs <= 0) {
    blockingReasons.push("max_runtime_ms_required");
  }
  if (!acceptance.expiresAt || Number.isNaN(new Date(acceptance.expiresAt).getTime())) {
    blockingReasons.push("expires_at_required");
  } else if ((input.now ?? new Date()) >= new Date(acceptance.expiresAt)) {
    blockingReasons.push("operator_acceptance_expired");
  }
  if (acceptance.allowFileWrites) {
    blockingReasons.push("observe_only_file_writes_blocked");
  }
  if (acceptance.allowShellCommands) {
    blockingReasons.push("observe_only_shell_commands_blocked");
  }
  if (acceptance.allowNetwork) {
    blockingReasons.push("observe_only_network_blocked");
  }
  if (acceptance.allowRebuild) {
    blockingReasons.push("observe_only_rebuild_blocked");
  }
  if (acceptance.allowAutobailout) {
    blockingReasons.push("observe_only_autobailout_blocked");
  }
  if (acceptance.allowSubagents) {
    blockingReasons.push("observe_only_subagents_blocked");
  }
  return {
    valid: blockingReasons.length === 0,
    blockingReasons,
    ...pilotAudit(),
  };
}

export function materializeLocalCodexProcessDescriptor(input: {
  runPackage: FutureRunPackageMetadata;
  acceptance: OperatorAcceptanceMetadata;
  executionAllowed?: boolean;
}): CodexProcessDescriptor {
  return {
    artifactKind: "codex_process_descriptor",
    descriptorId: `codex-process-${input.runPackage.runtimeJobId}`,
    command: "codex",
    args: [
      "exec",
      "--json",
      "--cd",
      input.runPackage.expectedRepoPath,
      input.runPackage.finalizedPromptArtifact.promptText,
    ],
    cwd: input.runPackage.expectedRepoPath,
    envPolicy: {
      secretsIncluded: false,
      inheritedEnvAllowed: false,
    },
    promptStrategy: "inline_finalized_prompt_text",
    expectedStdout: "jsonl_events",
    expectedStderr: "progress_events",
    expectedStream: "codex_exec_jsonl",
    maxRuntimeMs: input.acceptance.maxRuntimeMs,
    executionAllowed: input.executionAllowed ?? false,
    sourcePackageId: input.runPackage.packageId,
    ...pilotAudit(),
  };
}

export function parseCodexJsonlEventLine(
  line: string,
  options: { fatalMalformedJson?: boolean } = {},
): CodexJsonlParseResult {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("JSONL event must be an object");
    }
    return { ok: true, event: parsed as Record<string, JsonValue> };
  } catch (error) {
    if (options.fatalMalformedJson) {
      throw error;
    }
    return {
      ok: false,
      error: {
        code: "malformed_jsonl",
        message: error instanceof Error ? error.message : "malformed JSONL event",
      },
      rawLine: line,
    };
  }
}

export function normalizeParsedCodexJsonlEvent(input: {
  event: Record<string, JsonValue>;
  sequence: number;
  now?: Date;
}): CodexBridgeNormalizedStreamEvent {
  const type = typeof input.event.type === "string" ? input.event.type : "unknown";
  const item = asRecord(input.event.item);
  const now = input.now ?? new Date();
  const timestamp = eventTimestamp(input.event, now);
  let eventKind: CodexBridgeNormalizedStreamEvent["eventKind"] = "assistant_update";
  let summary = type;
  if (type === "thread.started") {
    eventKind = "session_started";
    summary = `thread started ${summaryValue(input.event.thread_id, "")}`.trim();
  } else if (type === "turn.started") {
    eventKind = "assistant_update";
    summary = "turn started";
  } else if (type === "turn.completed") {
    eventKind = "session_completed";
    summary = "turn completed";
  } else if (type === "turn.failed" || type === "error") {
    eventKind = "error";
    summary = summaryValue(input.event.message ?? input.event.error, type);
  } else if (type === "item.started") {
    const currentItemType = itemType(item);
    eventKind =
      currentItemType === "file_change"
        ? "file_change"
        : currentItemType === "command_execution" || currentItemType.includes("tool")
          ? "tool_call_started"
          : "assistant_update";
    summary = `${currentItemType} started`;
  } else if (type === "item.completed") {
    const currentItemType = itemType(item);
    const text = textFromItem(item);
    eventKind = currentItemType === "agent_message" && text ? "final_response" : "assistant_update";
    summary = text ?? `${currentItemType} completed`;
  } else if (type.startsWith("item.")) {
    eventKind = "assistant_update";
    summary = `${itemType(item)} ${type}`;
  } else {
    eventKind = "assistant_update";
    summary = `unknown codex event: ${type}`;
  }
  return {
    eventKind,
    sourceProtocol: "codex_cli",
    sequence: input.sequence,
    occurredAt: timestamp,
    summary,
    data: boundSupervisorMetadata(input.event as JsonValue),
    providerCallMade: false,
    liveExecutorCallMade: false,
  };
}

export class FakeSupervisorProcessRunner implements SupervisorProcessRunner {
  constructor(
    private readonly lines: string[],
    private readonly result: Partial<SupervisorProcessResult> = {},
  ) {}

  async run(
    _descriptor: CodexProcessDescriptor,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<SupervisorProcessResult> {
    for (const line of this.lines) {
      await callbacks.onJsonlLine?.(line);
    }
    await callbacks.onHeartbeat?.();
    return {
      status: this.result.status ?? "completed",
      exitCode: this.result.exitCode ?? 0,
      errorMessage: this.result.errorMessage ?? null,
      finalMessage: this.result.finalMessage ?? null,
      emittedEventCount: this.lines.length,
      ...pilotAudit(),
    };
  }
}

export class DisabledSupervisorProcessRunner implements SupervisorProcessRunner {
  async run(
    _descriptor?: CodexProcessDescriptor,
    _callbacks?: SupervisorProcessCallbacks,
  ): Promise<SupervisorProcessResult> {
    return {
      status: "refused",
      exitCode: null,
      errorMessage: "supervisor process runner is disabled by default",
      finalMessage: null,
      emittedEventCount: 0,
      ...pilotAudit(),
    };
  }
}

export function evaluateObserveOnlyLocalCodexPilotGate(input: {
  runtimeJobId: string;
  runPackage: FutureRunPackageMetadata | null;
  eligibilityReport: ObserveOnlyReadinessEvaluation | null;
  operatorAcceptance: OperatorAcceptanceMetadata | null;
  now?: Date;
}): ObserveOnlyPilotGateResult {
  const blockingReasons: string[] = [];
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
  if (input.runPackage?.trustProfileSnapshot.profileId !== "observe_only") {
    blockingReasons.push("trusted_yolo_profiles_blocked_in_slice_8e");
  }
  if (input.runPackage?.executionMode !== "observe_only_live_local_codex") {
    blockingReasons.push("only_observe_only_local_codex_supported_in_slice_8e");
  }
  if (input.eligibilityReport && !input.eligibilityReport.allowed) {
    blockingReasons.push("eligibility_report_not_allowed");
  }
  const acceptance = validateOperatorAcceptanceForObserveOnlyLocalCodex({
    acceptance: input.operatorAcceptance,
    runtimeJobId: input.runtimeJobId,
    now: input.now,
  });
  blockingReasons.push(...acceptance.blockingReasons);
  const uniqueBlockingReasons = [...new Set(blockingReasons)];
  const descriptor =
    input.runPackage && input.operatorAcceptance
      ? materializeLocalCodexProcessDescriptor({
          runPackage: input.runPackage,
          acceptance: input.operatorAcceptance,
          executionAllowed: uniqueBlockingReasons.length === 0,
        })
      : null;
  return {
    artifactKind: "observe_only_pilot_gate",
    runtimeJobId: input.runtimeJobId,
    allowed: uniqueBlockingReasons.length === 0,
    blockingReasons: uniqueBlockingReasons,
    operatorApprovalRequired: true,
    operatorApprovalSatisfied: acceptance.valid,
    expectedProcessDescriptor: descriptor,
    expectedStreamParser: "codex_exec_jsonl",
    expectedArtifactContract: createCompletedWorkPathContract(),
    ...pilotAudit(),
  };
}

export class ExecutionSupervisorRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: ExecutionSupervisorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async runObserveOnlyPilot(input: {
    runtimeJobId: string;
    runPackage: FutureRunPackageMetadata | null;
    eligibilityReport: ObserveOnlyReadinessEvaluation | null;
    operatorAcceptance: OperatorAcceptanceMetadata | null;
    runner: SupervisorProcessRunner;
    sessionId?: string;
  }): Promise<SupervisorPilotReport> {
    await this.requireBridgeJob(input.runtimeJobId);
    const gate = evaluateObserveOnlyLocalCodexPilotGate({
      runtimeJobId: input.runtimeJobId,
      runPackage: input.runPackage,
      eligibilityReport: input.eligibilityReport,
      operatorAcceptance: input.operatorAcceptance,
      now: this.now(),
    });
    await this.recordArtifact(input.runtimeJobId, "supervisor.live_pilot_gate", gate);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.live_pilot_gate_evaluated",
      data: gate as unknown as JsonValue,
    });
    const sessionId = input.sessionId ?? `supervisor-${randomUUID()}`;
    let eventCount = 0;
    let finalResponse: string | null = null;
    let processResult: SupervisorProcessResult | null = null;
    if (gate.allowed && gate.expectedProcessDescriptor) {
      const handshake = {
        supervisorName: SUPERVISOR_NAME,
        sessionId,
        runtimeJobId: input.runtimeJobId,
        processBoundary: "external_to_openclaw_app_container",
        ...pilotAudit(),
      };
      await this.recordArtifact(input.runtimeJobId, "supervisor.session_plan", handshake);
      await this.runtimeJobs.recordEvent({
        jobId: input.runtimeJobId,
        eventType: "supervisor.live_pilot_handshake",
        data: handshake as unknown as JsonValue,
      });
      processResult = await input.runner.run(gate.expectedProcessDescriptor, {
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
                data: boundSupervisorMetadata(parsed as unknown as JsonValue),
                providerCallMade: false,
                liveExecutorCallMade: false,
              } satisfies CodexBridgeNormalizedStreamEvent);
          eventCount += 1;
          if (normalized.eventKind === "final_response") {
            finalResponse = normalized.summary;
          }
          await this.runtimeJobs.recordEvent({
            jobId: input.runtimeJobId,
            eventType: "codex_bridge.stream_event",
            data: {
              raw: boundSupervisorMetadata(line),
              normalized: boundSupervisorMetadata(normalized as unknown as JsonValue),
              ...pilotAudit(),
            },
          });
        },
        onHeartbeat: async () => {
          await this.runtimeJobs.recordEvent({
            jobId: input.runtimeJobId,
            eventType: "supervisor.live_pilot_heartbeat",
            data: {
              sessionId,
              heartbeatAt: this.now().toISOString(),
              ...pilotAudit(),
            },
          });
        },
      });
      if (finalResponse) {
        await this.recordArtifact(
          input.runtimeJobId,
          "codex_bridge.completed_work.final_response",
          {
            artifactKind: "completed_work",
            completedWorkKind: "final_response",
            summary: finalResponse,
            inlineText: finalResponse,
            metadata: {
              sessionId,
              source: "execution_supervisor_fake_runner",
              ...pilotAudit(),
            },
          },
        );
      }
      await this.runtimeJobs.recordEvent({
        jobId: input.runtimeJobId,
        eventType: "supervisor.executor_process_completed",
        data: {
          sessionId,
          processResult: processResult as unknown as JsonValue,
          processCompletionIsTaskSuccess: false,
          ...pilotAudit(),
        },
      });
    }
    const completedWorkPath = createCompletedWorkPathContract({
      executorProcessCompleted: processResult?.status === "completed",
      assistantFinalResponseReceived: finalResponse !== null,
      validationPassed: false,
    });
    const report: SupervisorPilotReport = {
      artifactKind: "supervisor_pilot_report",
      runtimeJobId: input.runtimeJobId,
      sessionId,
      workQueueLink: input.runPackage?.workQueueLink ?? null,
      processDescriptor: gate.expectedProcessDescriptor,
      gateAllowed: gate.allowed,
      blockingReasons: gate.blockingReasons,
      eventCount,
      finalResponsePresent: finalResponse !== null,
      validationEvidencePresent: false,
      completedWorkPath,
      processResult,
      ...pilotAudit(),
    };
    await this.recordArtifact(input.runtimeJobId, "supervisor.pilot_report", report);
    return report;
  }

  async readSupervisorPilotReports(runtimeJobId: string): Promise<SupervisorPilotReport[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "supervisor.pilot_report")
      .map((artifact) => artifact.metadata as unknown as SupervisorPilotReport);
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
    const bounded = boundSupervisorMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "supervisor metadata");
    return this.runtimeJobs.attachArtifact({
      jobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/execution-supervisor/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}
