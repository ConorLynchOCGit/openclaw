import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  type CodexBridgeJobPayload,
  type CodexBridgeNormalizedStreamEvent,
  isCodexBridgeJobPayload,
} from "./types.ts";
import {
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  type ExecutionPlatformNextRunCloseoutGateReport,
} from "./work-episode-closeout.ts";

const CONTROL_COMMAND_ARTIFACT_TYPE = "codex_bridge.control_command";
const REDIRECT_PROMPT_ARTIFACT_TYPE = "codex_bridge.redirect_prompt_metadata";
const CONTROL_HISTORY_ARTIFACT_TYPE = "codex_bridge.control_command_history";
const DEFAULT_MAX_CONTROL_METADATA_BYTES = 64 * 1024;
const DEFAULT_CONTROL_COMMAND_TTL_MS = 10 * 60 * 1000;

export const CODEX_BRIDGE_CONTROL_REASON_CATEGORIES = [
  "runtime_substrate_mismatch",
  "wrong_repo_or_workspace",
  "missing_safe_ui_bridge_context",
  "prohibited_semantic_drift",
  "deterministic_vs_model_judgment_violation",
  "missing_closeout_evidence",
  "unsafe_authority_request",
  "unexpected_file_change",
  "unexpected_command_execution",
  "timeout_or_stale_heartbeat",
  "operator_manual_intervention",
  "other",
] as const;

export type CodexBridgeControlReasonCategory =
  (typeof CODEX_BRIDGE_CONTROL_REASON_CATEGORIES)[number];

export type CodexBridgeControlCommandKind = "pause" | "redirect" | "cancel";
export type CodexBridgeControlCommandStatus =
  | "recorded"
  | "acknowledged"
  | "applied"
  | "rejected"
  | "expired"
  | "superseded";

export type CodexBridgeRedirectPromptMetadata = {
  objective: string;
  scope: string[];
  nonGoals: string[];
  repoPath: string;
  workspaceDocsPath: string;
  safeUiBridge?: {
    tailscaleRequired: boolean;
    descriptor: string;
  } | null;
  promptText?: string;
};

export type CodexBridgeControlCommand = {
  artifactKind: "codex_bridge_control_command";
  commandId: string;
  runtimeJobId: string;
  sessionId: string;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  commandKind: CodexBridgeControlCommandKind;
  actor: string;
  reason: string;
  reasonCategory: CodexBridgeControlReasonCategory;
  createdAt: string;
  updatedAt: string;
  targetSequence: number | null;
  acknowledgementRequired: boolean;
  status: CodexBridgeControlCommandStatus;
  expectedEffect: string;
  actualEffect: string | null;
  appliesToSeparateExecutorSession: true;
  manualOperatorSessionSharedWithExecutor: false;
  redirectPrompt: CodexBridgeRedirectPromptMetadata | null;
  runtimeStateChanged: boolean;
  liveProcessSignalSent: false;
  promptInjectedIntoLiveProcess: false;
  workQueueLifecycleMutated: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  providerCallMade: false;
  shellCommandExecuted: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
};

export type CodexBridgeOversightStreamState = {
  latestObservedSequence: number | null;
  sequenceGaps: number[];
  latestHeartbeat: string | null;
  staleHeartbeat: boolean;
  latestAssistantUpdate: string | null;
  latestError: string | null;
  latestFinalResponse: string | null;
};

export type CodexBridgeControlReadinessSummary = {
  runtimeJobId: string;
  sessionId: string | null;
  readyForControlCommands: boolean;
  blockingReasons: string[];
  closeoutGate: ExecutionPlatformNextRunCloseoutGateReport | null;
  closeoutReasonCategory: CodexBridgeControlReasonCategory | null;
  oversight: CodexBridgeOversightStreamState;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  commandsTargetSeparateExecutorSession: true;
  manualOperatorSessionSharedWithExecutor: false;
};

export type CodexBridgeLatestControlState = {
  runtimeJobId: string;
  sessionId: string | null;
  latestCommand: CodexBridgeControlCommand | null;
  pendingCommands: CodexBridgeControlCommand[];
  appliedCommands: CodexBridgeControlCommand[];
  rejectedCommands: CodexBridgeControlCommand[];
  expiredCommands: CodexBridgeControlCommand[];
  supersededCommands: CodexBridgeControlCommand[];
  oversight: CodexBridgeOversightStreamState;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
};

export type CodexBridgeControlBridgeOptions = {
  now?: () => Date;
  commandTtlMs?: number;
  maxArtifactMetadataBytes?: number;
  staleHeartbeatMs?: number;
  closeoutRepository?: ExecutionPlatformWorkEpisodeCloseoutRepository;
};

export type CreateControlCommandInput = {
  runtimeJobId: string;
  sessionId: string;
  actor: string;
  reason: string;
  reasonCategory?: CodexBridgeControlReasonCategory;
  targetSequence?: number | null;
  commandId?: string;
  acknowledgementRequired?: boolean;
};

export type CreateRedirectCommandInput = CreateControlCommandInput & {
  redirectPrompt: CodexBridgeRedirectPromptMetadata;
};

function controlAuditFlags() {
  return {
    appliesToSeparateExecutorSession: true,
    manualOperatorSessionSharedWithExecutor: false,
    liveProcessSignalSent: false,
    promptInjectedIntoLiveProcess: false,
    workQueueLifecycleMutated: false,
    codexCliInvoked: false,
    acpSessionStarted: false,
    providerCallMade: false,
    shellCommandExecuted: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
  } as const;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: JsonValue): Record<string, unknown> {
  return isRecord(value) ? (value as Record<string, unknown>) : {};
}

function boundControlMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 260,
    maxArrayItems: 160,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function assertNoUnsafeControlContent(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  const unsafePatterns = [
    /raw-prompt-marker/u,
    /raw-transcript-marker/u,
    /raw-tool-log-marker/u,
    /secret-marker/u,
    /\bsk-[a-z0-9_-]{12,}/u,
    /\bhidden reasoning\b/u,
    /\bprovider prompt\b/u,
    /\braw full transcript\b/u,
    /\braw command log\b/u,
    /\braw tool log\b/u,
  ];
  if (unsafePatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("control command contains prohibited raw/private content");
  }
}

function assertNoUnsafeAuthorityRequest(value: unknown): void {
  const serialized = JSON.stringify(value)
    .toLowerCase()
    .replace(/\bdo not\b[^."]*/gu, "")
    .replace(/\bno\b[^."]*(rebuild|autobailout|subagent|shell command)[^."]*/gu, "");
  const authorityPatterns = [
    /"allowrebuild"\s*:\s*true/u,
    /"allowautobailout"\s*:\s*true/u,
    /"allowsubagents"\s*:\s*true/u,
    /"allowshellcommands"\s*:\s*true/u,
    /\b(run|execute|invoke)\s+(a\s+)?(shell|bash|command|script|pnpm|npm|rebuild)\b/u,
    /\b(start|use|spawn)\s+(subagent|subagents)\b/u,
    /\bautobailout\b/u,
  ];
  if (authorityPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("control command requests authority outside Slice 8N bounds");
  }
}

function normalizedStreamEventFromRuntimeEvent(
  event: RuntimeJobEvent,
): CodexBridgeNormalizedStreamEvent | null {
  const normalized = asRecord(event.data).normalized;
  if (!isRecord(normalized)) {
    return null;
  }
  return typeof normalized.sequence === "number"
    ? (normalized as unknown as CodexBridgeNormalizedStreamEvent)
    : null;
}

function analyzeSequences(events: CodexBridgeNormalizedStreamEvent[]): {
  latestObservedSequence: number | null;
  sequenceGaps: number[];
} {
  const unique = [...new Set(events.map((event) => event.sequence))].toSorted(
    (left, right) => left - right,
  );
  const sequenceGaps: number[] = [];
  if (unique.length > 0) {
    for (let sequence = unique[0]!; sequence <= unique.at(-1)!; sequence += 1) {
      if (!unique.includes(sequence)) {
        sequenceGaps.push(sequence);
      }
    }
  }
  return {
    latestObservedSequence: unique.at(-1) ?? null,
    sequenceGaps,
  };
}

function eventIsoTime(event: RuntimeJobEvent): string {
  return event.eventTime.toISOString();
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function commandSortKey(command: CodexBridgeControlCommand): string {
  const statusRank: Record<CodexBridgeControlCommandStatus, number> = {
    recorded: 0,
    acknowledged: 1,
    applied: 2,
    rejected: 2,
    expired: 2,
    superseded: 2,
  };
  return `${command.updatedAt}:${command.commandId}:${statusRank[command.status]}:${command.status}`;
}

function latestByCommandId(commands: CodexBridgeControlCommand[]): CodexBridgeControlCommand[] {
  const byId = new Map<string, CodexBridgeControlCommand>();
  for (const command of commands.toSorted((left, right) =>
    commandSortKey(left).localeCompare(commandSortKey(right)),
  )) {
    byId.set(command.commandId, command);
  }
  return [...byId.values()].toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function isPending(command: CodexBridgeControlCommand): boolean {
  return command.status === "recorded" || command.status === "acknowledged";
}

export function classifyCodexBridgeControlReason(input: {
  reason: string;
  closeoutMissing?: boolean;
  staleHeartbeat?: boolean;
}): CodexBridgeControlReasonCategory {
  if (input.closeoutMissing) {
    return "missing_closeout_evidence";
  }
  const reason = input.reason.toLowerCase();
  if (
    reason.includes("runtime substrate") ||
    reason.includes("supabase") ||
    reason.includes("pg-mem")
  ) {
    return "runtime_substrate_mismatch";
  }
  if (
    reason.includes("wrong repo") ||
    reason.includes("workspace path") ||
    reason.includes("wrong workspace")
  ) {
    return "wrong_repo_or_workspace";
  }
  if (reason.includes("tailscale") || reason.includes("safe ui bridge")) {
    return "missing_safe_ui_bridge_context";
  }
  if (reason.includes("semantic drift") || reason.includes("prohibited semantics")) {
    return "prohibited_semantic_drift";
  }
  if (reason.includes("deterministic") && reason.includes("judgment")) {
    return "deterministic_vs_model_judgment_violation";
  }
  if (reason.includes("closeout") || reason.includes("outcome pack")) {
    return "missing_closeout_evidence";
  }
  if (
    reason.includes("unsafe authority") ||
    reason.includes("permission") ||
    reason.includes("yolo")
  ) {
    return "unsafe_authority_request";
  }
  if (reason.includes("file change") || reason.includes("diff")) {
    return "unexpected_file_change";
  }
  if (reason.includes("command execution") || reason.includes("shell command")) {
    return "unexpected_command_execution";
  }
  if (reason.includes("timeout") || reason.includes("stale heartbeat")) {
    return "timeout_or_stale_heartbeat";
  }
  if (input.staleHeartbeat) {
    return "timeout_or_stale_heartbeat";
  }
  if (reason.includes("operator") || reason.includes("manual")) {
    return "operator_manual_intervention";
  }
  return "other";
}

export function validateRedirectPromptMetadataSafety(
  metadata: CodexBridgeRedirectPromptMetadata,
): CodexBridgeRedirectPromptMetadata {
  if (!metadata.objective.trim()) {
    throw new Error("redirect objective is required");
  }
  if (metadata.scope.length === 0) {
    throw new Error("redirect scope is required");
  }
  if (metadata.nonGoals.length === 0) {
    throw new Error("redirect non-goals are required");
  }
  if (!metadata.repoPath || !metadata.workspaceDocsPath) {
    throw new Error("redirect repo path and workspace docs path are required");
  }
  assertNoUnsafeControlContent(metadata);
  assertNoUnsafeAuthorityRequest(metadata);
  const bounded = boundControlMetadata(metadata as unknown as JsonValue);
  assertJsonByteLength(bounded, 16 * 1024, "redirect prompt metadata");
  return metadata;
}

export class CodexBridgeControlBridgeRepository {
  private readonly now: () => Date;
  private readonly commandTtlMs: number;
  private readonly maxArtifactMetadataBytes: number;
  private readonly staleHeartbeatMs: number;
  private readonly closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodexBridgeControlBridgeOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.commandTtlMs = options.commandTtlMs ?? DEFAULT_CONTROL_COMMAND_TTL_MS;
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_CONTROL_METADATA_BYTES;
    this.staleHeartbeatMs = options.staleHeartbeatMs ?? 30_000;
    this.closeout =
      options.closeoutRepository ??
      new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, { now: this.now });
  }

  async createPauseCommand(input: CreateControlCommandInput): Promise<CodexBridgeControlCommand> {
    return this.createCommand({ ...input, commandKind: "pause", redirectPrompt: null });
  }

  async createRedirectCommand(
    input: CreateRedirectCommandInput,
  ): Promise<CodexBridgeControlCommand> {
    validateRedirectPromptMetadataSafety(input.redirectPrompt);
    return this.createCommand({
      ...input,
      commandKind: "redirect",
      redirectPrompt: input.redirectPrompt,
    });
  }

  async createCancelCommand(input: CreateControlCommandInput): Promise<CodexBridgeControlCommand> {
    return this.createCommand({ ...input, commandKind: "cancel", redirectPrompt: null });
  }

  validateControlCommand(command: CodexBridgeControlCommand): CodexBridgeControlCommand {
    assertNoUnsafeControlContent(command);
    if (command.redirectPrompt) {
      validateRedirectPromptMetadataSafety(command.redirectPrompt);
    }
    if (
      !command.appliesToSeparateExecutorSession ||
      command.manualOperatorSessionSharedWithExecutor
    ) {
      throw new Error("control command must target a separate executor session");
    }
    return command;
  }

  async recordControlCommand(input: {
    command: CodexBridgeControlCommand;
    cancelRuntimeJob?: boolean;
  }): Promise<CodexBridgeControlCommand> {
    const job = await this.requireBridgeJob(input.command.runtimeJobId);
    await this.assertKnownSessionIfEvidenceExists(
      input.command.runtimeJobId,
      input.command.sessionId,
    );
    const command = this.validateControlCommand({
      ...input.command,
      workQueueLink: isCodexBridgeJobPayload(job.payload)
        ? (job.payload.workQueueLink ?? null)
        : null,
      updatedAt: this.now().toISOString(),
    });
    let recorded = command;
    if (command.commandKind === "redirect") {
      await this.supersedeOlderPendingRedirectCommands(command);
    }
    if (command.commandKind === "cancel" && input.cancelRuntimeJob === true) {
      const canceled = await this.runtimeJobs.cancelJob(command.runtimeJobId, command.reason);
      recorded = {
        ...command,
        status: canceled ? "applied" : "recorded",
        actualEffect: canceled ? "runtime_job_canceled" : "cancel_intent_recorded",
        runtimeStateChanged: Boolean(canceled),
        updatedAt: this.now().toISOString(),
      };
    }
    await this.persistCommand(recorded, "codex_bridge.control_command_recorded");
    if (recorded.commandKind === "redirect" && recorded.redirectPrompt) {
      await this.recordArtifact(
        recorded.runtimeJobId,
        REDIRECT_PROMPT_ARTIFACT_TYPE,
        recorded.commandId,
        {
          commandId: recorded.commandId,
          runtimeJobId: recorded.runtimeJobId,
          sessionId: recorded.sessionId,
          redirectPrompt: recorded.redirectPrompt,
          promptInjectedIntoLiveProcess: false,
        },
      );
    }
    return recorded;
  }

  async acknowledgeControlCommand(input: {
    runtimeJobId: string;
    commandId: string;
    actor: string;
  }): Promise<CodexBridgeControlCommand> {
    const command = await this.requireCommand(input.runtimeJobId, input.commandId);
    return this.transitionCommand(command, "acknowledged", {
      actualEffect: `acknowledged_by:${input.actor}`,
      eventType: "codex_bridge.control_command_acknowledged",
    });
  }

  async markControlCommandApplied(input: {
    runtimeJobId: string;
    commandId: string;
    actualEffect: string;
  }): Promise<CodexBridgeControlCommand> {
    const command = await this.requireCommand(input.runtimeJobId, input.commandId);
    return this.transitionCommand(command, "applied", {
      actualEffect: input.actualEffect,
      eventType: "codex_bridge.control_command_applied",
    });
  }

  async rejectControlCommand(input: {
    runtimeJobId: string;
    commandId: string;
    reason: string;
  }): Promise<CodexBridgeControlCommand> {
    const command = await this.requireCommand(input.runtimeJobId, input.commandId);
    return this.transitionCommand(command, "rejected", {
      actualEffect: input.reason,
      eventType: "codex_bridge.control_command_rejected",
    });
  }

  async expireStaleControlCommands(runtimeJobId: string): Promise<CodexBridgeControlCommand[]> {
    const latest = latestByCommandId(await this.readControlCommandHistory(runtimeJobId));
    const nowMs = this.now().getTime();
    const expired: CodexBridgeControlCommand[] = [];
    for (const command of latest.filter(isPending)) {
      if (nowMs - new Date(command.createdAt).getTime() <= this.commandTtlMs) {
        continue;
      }
      expired.push(
        await this.transitionCommand(command, "expired", {
          actualEffect: "command_expired_without_application",
          eventType: "codex_bridge.control_command_expired",
        }),
      );
    }
    return expired;
  }

  async supersedeOlderPendingRedirectCommands(
    command: CodexBridgeControlCommand,
  ): Promise<CodexBridgeControlCommand[]> {
    const latest = latestByCommandId(await this.readControlCommandHistory(command.runtimeJobId));
    const superseded: CodexBridgeControlCommand[] = [];
    for (const candidate of latest) {
      if (
        candidate.commandKind !== "redirect" ||
        candidate.commandId === command.commandId ||
        candidate.sessionId !== command.sessionId ||
        !isPending(candidate)
      ) {
        continue;
      }
      superseded.push(
        await this.transitionCommand(candidate, "superseded", {
          actualEffect: `superseded_by:${command.commandId}`,
          eventType: "codex_bridge.control_command_superseded",
        }),
      );
    }
    return superseded;
  }

  async readControlCommandById(input: {
    runtimeJobId: string;
    commandId: string;
  }): Promise<CodexBridgeControlCommand | null> {
    const commands = await this.readControlCommandHistory(input.runtimeJobId);
    return (
      latestByCommandId(commands).find((command) => command.commandId === input.commandId) ?? null
    );
  }

  async readControlCommandHistory(runtimeJobId: string): Promise<CodexBridgeControlCommand[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === CONTROL_COMMAND_ARTIFACT_TYPE)
      .map((artifact) => artifact.metadata as unknown as CodexBridgeControlCommand)
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.updatedAt.localeCompare(right.updatedAt),
      );
  }

  async readLatestControlState(input: {
    runtimeJobId: string;
    sessionId?: string | null;
  }): Promise<CodexBridgeLatestControlState> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    const workQueueLink =
      job && isCodexBridgeJobPayload(job.payload) ? (job.payload.workQueueLink ?? null) : null;
    const latest = latestByCommandId(
      await this.readControlCommandHistory(input.runtimeJobId),
    ).filter((command) => !input.sessionId || command.sessionId === input.sessionId);
    return {
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId ?? null,
      latestCommand: latest.at(-1) ?? null,
      pendingCommands: latest.filter(isPending),
      appliedCommands: latest.filter((command) => command.status === "applied"),
      rejectedCommands: latest.filter((command) => command.status === "rejected"),
      expiredCommands: latest.filter((command) => command.status === "expired"),
      supersededCommands: latest.filter((command) => command.status === "superseded"),
      oversight: await this.readOversightStreamState(input.runtimeJobId),
      workQueueLink,
    };
  }

  async produceControlReadinessSummary(input: {
    runtimeJobId: string;
    sessionId?: string | null;
    previousRuntimeJobId?: string | null;
  }): Promise<CodexBridgeControlReadinessSummary> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    const workQueueLink =
      job && isCodexBridgeJobPayload(job.payload) ? (job.payload.workQueueLink ?? null) : null;
    const oversight = await this.readOversightStreamState(input.runtimeJobId);
    const blockingReasons: string[] = [];
    let closeoutGate: ExecutionPlatformNextRunCloseoutGateReport | null = null;
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE) {
      blockingReasons.push("runtime_job_not_codex_bridge");
    }
    if (input.previousRuntimeJobId) {
      closeoutGate = await this.closeout.produceNextRunCloseoutGateReport(
        input.previousRuntimeJobId,
      );
      if (!closeoutGate.nextExecutionAllowed) {
        blockingReasons.push("missing_closeout_evidence");
      }
    }
    return {
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId ?? null,
      readyForControlCommands: blockingReasons.length === 0,
      blockingReasons,
      closeoutGate,
      closeoutReasonCategory: blockingReasons.includes("missing_closeout_evidence")
        ? "missing_closeout_evidence"
        : null,
      oversight,
      workQueueLink,
      commandsTargetSeparateExecutorSession: true,
      manualOperatorSessionSharedWithExecutor: false,
    };
  }

  async produceOperatorControlSummary(input: {
    runtimeJobId: string;
    sessionId?: string | null;
  }): Promise<JsonValue> {
    const state = await this.readLatestControlState(input);
    return boundControlMetadata({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId ?? null,
      pendingCommandCount: state.pendingCommands.length,
      appliedCommandCount: state.appliedCommands.length,
      rejectedCommandCount: state.rejectedCommands.length,
      expiredCommandCount: state.expiredCommands.length,
      latestCommand: state.latestCommand
        ? {
            commandId: state.latestCommand.commandId,
            commandKind: state.latestCommand.commandKind,
            status: state.latestCommand.status,
            reasonCategory: state.latestCommand.reasonCategory,
          }
        : null,
      oversight: state.oversight,
      workQueueLink: state.workQueueLink,
      commandsTargetSeparateExecutorSession: true,
      liveProcessSignalAvailable: false,
      workQueueLifecycleMutationAllowed: false,
    });
  }

  private async createCommand(
    input: CreateControlCommandInput & {
      commandKind: CodexBridgeControlCommandKind;
      redirectPrompt: CodexBridgeRedirectPromptMetadata | null;
    },
  ): Promise<CodexBridgeControlCommand> {
    const job = await this.requireBridgeJob(input.runtimeJobId);
    const payload = job.payload as CodexBridgeJobPayload;
    const oversight = await this.readOversightStreamState(input.runtimeJobId);
    const createdAt = this.now().toISOString();
    const reasonCategory =
      input.reasonCategory ??
      classifyCodexBridgeControlReason({
        reason: input.reason,
        staleHeartbeat: oversight.staleHeartbeat,
      });
    return {
      artifactKind: "codex_bridge_control_command",
      commandId: input.commandId ?? randomUUID(),
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      workQueueLink: payload.workQueueLink ?? null,
      commandKind: input.commandKind,
      actor: input.actor,
      reason: input.reason,
      reasonCategory,
      createdAt,
      updatedAt: createdAt,
      targetSequence: input.targetSequence ?? oversight.latestObservedSequence,
      acknowledgementRequired: input.acknowledgementRequired ?? true,
      status: "recorded",
      expectedEffect: expectedEffect(input.commandKind),
      actualEffect: null,
      redirectPrompt: input.redirectPrompt,
      runtimeStateChanged: false,
      ...controlAuditFlags(),
    };
  }

  private async persistCommand(
    command: CodexBridgeControlCommand,
    eventType: string,
  ): Promise<CodexBridgeControlCommand> {
    await this.recordArtifact(
      command.runtimeJobId,
      CONTROL_COMMAND_ARTIFACT_TYPE,
      command.commandId,
      command,
    );
    await this.runtimeJobs.recordEvent({
      jobId: command.runtimeJobId,
      eventType,
      data: command as unknown as JsonValue,
    });
    await this.recordHistoryArtifact(command.runtimeJobId);
    return command;
  }

  private async transitionCommand(
    command: CodexBridgeControlCommand,
    status: CodexBridgeControlCommandStatus,
    input: { actualEffect: string; eventType: string },
  ): Promise<CodexBridgeControlCommand> {
    const transitioned: CodexBridgeControlCommand = {
      ...command,
      status,
      actualEffect: input.actualEffect,
      updatedAt: this.now().toISOString(),
      runtimeStateChanged: command.runtimeStateChanged,
    };
    return this.persistCommand(transitioned, input.eventType);
  }

  private async requireCommand(
    runtimeJobId: string,
    commandId: string,
  ): Promise<CodexBridgeControlCommand> {
    const command = await this.readControlCommandById({ runtimeJobId, commandId });
    if (!command) {
      throw new Error(`control command not found: ${commandId}`);
    }
    return command;
  }

  private async requireBridgeJob(runtimeJobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${runtimeJobId}`);
    }
    return job;
  }

  private async assertKnownSessionIfEvidenceExists(
    runtimeJobId: string,
    sessionId: string,
  ): Promise<void> {
    const knownSessions = await this.readKnownSessionIds(runtimeJobId);
    if (knownSessions.size > 0 && !knownSessions.has(sessionId)) {
      throw new Error(`unknown executor session id: ${sessionId}`);
    }
  }

  private async readKnownSessionIds(runtimeJobId: string): Promise<Set<string>> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    const events = await this.runtimeJobs.listEvents(runtimeJobId, 500);
    const ids = new Set<string>();
    for (const artifact of artifacts) {
      const sessionId = maybeString(asRecord(artifact.metadata).sessionId);
      if (sessionId) {
        ids.add(sessionId);
      }
    }
    for (const event of events) {
      const data = asRecord(event.data);
      const sessionId =
        maybeString(data.sessionId) ??
        maybeString(asRecord(data.normalized as JsonValue).sessionId);
      if (sessionId) {
        ids.add(sessionId);
      }
    }
    return ids;
  }

  private async readOversightStreamState(
    runtimeJobId: string,
  ): Promise<CodexBridgeOversightStreamState> {
    const events = await this.runtimeJobs.listEvents(runtimeJobId, 500);
    const streamEvents = events
      .filter(
        (event) =>
          event.eventType === "codex_bridge.stream_event" ||
          event.eventType === "codex_bridge.smoke_test_stream_event",
      )
      .map(normalizedStreamEventFromRuntimeEvent)
      .filter((event): event is CodexBridgeNormalizedStreamEvent => Boolean(event))
      .toSorted((left, right) => left.sequence - right.sequence);
    const sequence = analyzeSequences(streamEvents);
    const heartbeatEvents = events.filter(
      (event) =>
        event.eventType === "supervisor.heartbeat" ||
        event.eventType === "supervisor.live_pilot_heartbeat" ||
        event.eventType === "codex_bridge.smoke_test_heartbeat",
    );
    const latestHeartbeatEvent = heartbeatEvents.at(-1) ?? null;
    const latestHeartbeat =
      maybeString(asRecord(latestHeartbeatEvent?.data ?? {}).heartbeatAt) ??
      (latestHeartbeatEvent ? eventIsoTime(latestHeartbeatEvent) : null);
    const staleHeartbeat =
      latestHeartbeat === null ||
      this.now().getTime() - new Date(latestHeartbeat).getTime() > this.staleHeartbeatMs;
    return {
      ...sequence,
      latestHeartbeat,
      staleHeartbeat,
      latestAssistantUpdate:
        streamEvents.findLast((event) => event.eventKind === "assistant_update")?.summary ?? null,
      latestError:
        streamEvents.findLast(
          (event) => event.eventKind === "error" || event.eventKind === "rebuild_failed",
        )?.summary ?? null,
      latestFinalResponse:
        streamEvents.findLast((event) => event.eventKind === "final_response")?.summary ?? null,
    };
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    commandId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundControlMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "control bridge metadata");
    return this.runtimeJobs.attachArtifact({
      jobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/codex-bridge/control/${commandId}/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }

  private async recordHistoryArtifact(runtimeJobId: string): Promise<void> {
    const latest = latestByCommandId(await this.readControlCommandHistory(runtimeJobId));
    await this.recordArtifact(runtimeJobId, CONTROL_HISTORY_ARTIFACT_TYPE, "history", {
      artifactKind: "codex_bridge_control_command_history",
      runtimeJobId,
      commandCount: latest.length,
      commands: latest.map((command) => ({
        commandId: command.commandId,
        commandKind: command.commandKind,
        sessionId: command.sessionId,
        status: command.status,
        reasonCategory: command.reasonCategory,
        updatedAt: command.updatedAt,
      })),
      commandsTargetSeparateExecutorSession: true,
      workQueueLifecycleMutated: false,
    });
  }
}

function expectedEffect(kind: CodexBridgeControlCommandKind): string {
  if (kind === "pause") {
    return "record_pause_intent_only_no_live_process_signal";
  }
  if (kind === "redirect") {
    return "record_redirect_intent_and_metadata_only_no_live_prompt_injection";
  }
  return "record_cancel_intent_only_runtime_cancel_requires_explicit_option";
}

export const CODEX_BRIDGE_CONTROL_COMMAND_ARTIFACT_TYPE = CONTROL_COMMAND_ARTIFACT_TYPE;
export const CODEX_BRIDGE_REDIRECT_PROMPT_ARTIFACT_TYPE = REDIRECT_PROMPT_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CONTROL_HISTORY_ARTIFACT_TYPE = CONTROL_HISTORY_ARTIFACT_TYPE;
