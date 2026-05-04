import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { classifyAutobailoutEligibility, createAutobailoutPlan } from "./policy.ts";
import type { ReadinessReport } from "./readiness-gates.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  type CodexBridgeExecutorKind,
  type CodexBridgeJobPayload,
  type CodexBridgeNormalizedStreamEvent,
  isCodexBridgeJobPayload,
} from "./types.ts";

export const SUPERVISOR_DRY_RUN_EXECUTION_MODE = "dry_run_only";
export const SUPERVISOR_NAME = "execution-supervisor";

export type SupervisorDryRunLiveFlags = {
  liveProcessStarted: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  shellCommandExecuted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
};

export type SupervisorDryRunSession = SupervisorDryRunLiveFlags & {
  artifactKind: "supervisor_session";
  supervisorName: typeof SUPERVISOR_NAME;
  sessionId: string;
  runtimeJobId: string;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  executorKind: Exclude<CodexBridgeExecutorKind, "multi_agent_future">;
  executionMode: typeof SUPERVISOR_DRY_RUN_EXECUTION_MODE;
  repoPath: string;
  workspaceDocsPath: string;
  trustProfileSnapshot: CodexBridgeJobPayload["trustPolicy"];
  environmentContractSnapshot: CodexBridgeJobPayload["environment"];
  readinessReportSnapshot: ReadinessReport;
  createdAt: string;
};

export type SupervisorSequenceAnalysis = {
  sequences: number[];
  lastSequence: number | null;
  missingSequences: number[];
  duplicateSequences: number[];
  monotonic: boolean;
};

export type SupervisorResumePlan = SupervisorDryRunLiveFlags & {
  artifactKind: "resume_plan";
  sessionId: string;
  runtimeJobId: string;
  lastSequence: number | null;
  missingSequences: number[];
  eventCount: number;
  artifactCount: number;
  replayIntoLiveProcess: false;
};

export type SupervisorHeartbeat = SupervisorDryRunLiveFlags & {
  artifactKind: "heartbeat_summary";
  sessionId: string;
  runtimeJobId: string;
  sequence: number;
  observedRuntimeJobState: RuntimeJob["state"];
  sessionStatus: "dry_run_active" | "dry_run_paused" | "dry_run_canceled";
  heartbeatAt: string;
};

export type SupervisorReplayPlan = SupervisorDryRunLiveFlags & {
  artifactKind: "replay_plan";
  sessionId: string;
  runtimeJobId: string;
  eventCount: number;
  lastSequence: number | null;
  missingSequences: number[];
  duplicateSequences: number[];
  monotonic: boolean;
  replayIntoLiveProcess: false;
};

export type SupervisorControlCommandKind = "cancel" | "pause" | "redirect";

export type SupervisorControlCommand = SupervisorDryRunLiveFlags & {
  artifactKind: "control_command";
  sessionId: string;
  runtimeJobId: string;
  commandKind: SupervisorControlCommandKind;
  actorId: string;
  reason: string;
  sequence: number;
  requestedAt: string;
  runtimeStateChanged: boolean;
  redirectPrompt?: string;
};

export type SupervisorRebuildEventKind = "started" | "completed" | "failed";

export type SupervisorRebuildEvent = SupervisorDryRunLiveFlags & {
  artifactKind: "rebuild_event";
  sessionId: string;
  runtimeJobId: string;
  rebuildEventKind: SupervisorRebuildEventKind;
  rebuildDescriptorId: string;
  summary: string;
  artifactRefs: string[];
  recordedAt: string;
  autobailoutPlanCreated: boolean;
};

export type SupervisorDryRunStatus = SupervisorDryRunLiveFlags & {
  session: SupervisorDryRunSession | null;
  runtimeJob: RuntimeJob | null;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  lastSequence: number | null;
  sequenceGaps: number[];
  latestHeartbeat: SupervisorHeartbeat | null;
  staleHeartbeat: boolean;
  controlCommands: SupervisorControlCommand[];
  rebuildEvents: SupervisorRebuildEvent[];
  artifacts: RuntimeJobArtifact[];
};

export type SupervisorDryRunOptions = {
  now?: () => Date;
  staleHeartbeatMs?: number;
  maxArtifactMetadataBytes?: number;
};

const DEFAULT_STALE_HEARTBEAT_MS = 30_000;
const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;

const LIVE_FLAGS: SupervisorDryRunLiveFlags = {
  liveProcessStarted: false,
  codexCliInvoked: false,
  acpSessionStarted: false,
  shellCommandExecuted: false,
  providerCallMade: false,
  rebuildPerformed: false,
  schedulerStarted: false,
  daemonStarted: false,
  subagentStarted: false,
};

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue | undefined, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function asRecord(value: JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedStreamEventFromRuntimeEvent(
  event: RuntimeJobEvent,
): CodexBridgeNormalizedStreamEvent | null {
  const normalized = asRecord(event.data).normalized;
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) {
    return null;
  }
  const sequence = (normalized as Record<string, unknown>).sequence;
  return typeof sequence === "number" ? (normalized as CodexBridgeNormalizedStreamEvent) : null;
}

function liveFlags(): SupervisorDryRunLiveFlags {
  return { ...LIVE_FLAGS };
}

function boundSupervisorMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 200,
    maxArrayItems: 100,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

export class SupervisorDryRunRepository {
  private readonly now: () => Date;
  private readonly staleHeartbeatMs: number;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: SupervisorDryRunOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.staleHeartbeatMs = options.staleHeartbeatMs ?? DEFAULT_STALE_HEARTBEAT_MS;
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async createDryRunSession(input: {
    runtimeJobId: string;
    sessionId?: string;
    readinessReport: ReadinessReport;
    idempotencyKey?: string;
  }): Promise<SupervisorDryRunSession> {
    const job = await this.requireBridgeJob(input.runtimeJobId);
    if (!isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${input.runtimeJobId}`);
    }
    if (job.payload.executorKind === "multi_agent_future") {
      throw new Error("multi_agent_future is not supported for supervisor dry run");
    }
    if (!input.readinessReport.allRequiredGateEvidencePresent) {
      throw new Error("readiness report evidence is required before supervisor dry run");
    }
    const sessionId = input.sessionId ?? input.idempotencyKey ?? randomUUID();
    const existing = await this.findSessionArtifact(input.runtimeJobId, sessionId);
    if (existing) {
      return existing;
    }
    const session: SupervisorDryRunSession = {
      artifactKind: "supervisor_session",
      supervisorName: SUPERVISOR_NAME,
      sessionId,
      runtimeJobId: input.runtimeJobId,
      workQueueLink: job.payload.workQueueLink ?? null,
      executorKind: job.payload.executorKind,
      executionMode: SUPERVISOR_DRY_RUN_EXECUTION_MODE,
      repoPath: job.payload.environment.repoPath,
      workspaceDocsPath: job.payload.environment.workspaceDocsPath,
      trustProfileSnapshot: job.payload.trustPolicy,
      environmentContractSnapshot: job.payload.environment,
      readinessReportSnapshot: input.readinessReport,
      createdAt: this.now().toISOString(),
      ...liveFlags(),
    };
    await this.recordArtifact(input.runtimeJobId, "supervisor_session", sessionId, session);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.handshake",
      data: session as unknown as JsonValue,
    });
    return session;
  }

  async planResume(input: {
    runtimeJobId: string;
    sessionId: string;
  }): Promise<SupervisorResumePlan> {
    await this.requireSession(input.runtimeJobId, input.sessionId);
    const events = await this.runtimeJobs.listEvents(input.runtimeJobId, 500);
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    const sequence = analyzeSupervisorSequences(
      events
        .map(normalizedStreamEventFromRuntimeEvent)
        .filter((event): event is CodexBridgeNormalizedStreamEvent => Boolean(event)),
    );
    const plan: SupervisorResumePlan = {
      artifactKind: "resume_plan",
      sessionId: input.sessionId,
      runtimeJobId: input.runtimeJobId,
      lastSequence: sequence.lastSequence,
      missingSequences: sequence.missingSequences,
      eventCount: events.length,
      artifactCount: artifacts.length,
      replayIntoLiveProcess: false,
      ...liveFlags(),
    };
    await this.recordArtifact(input.runtimeJobId, "resume_plan", input.sessionId, plan);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.resume_planned",
      data: plan as unknown as JsonValue,
    });
    return plan;
  }

  async recordHeartbeat(input: {
    runtimeJobId: string;
    sessionId: string;
    sequence: number;
    sessionStatus?: SupervisorHeartbeat["sessionStatus"];
  }): Promise<SupervisorHeartbeat> {
    await this.requireSession(input.runtimeJobId, input.sessionId);
    const job = await this.requireRuntimeJob(input.runtimeJobId);
    const heartbeat: SupervisorHeartbeat = {
      artifactKind: "heartbeat_summary",
      sessionId: input.sessionId,
      runtimeJobId: input.runtimeJobId,
      sequence: input.sequence,
      observedRuntimeJobState: job.state,
      sessionStatus: input.sessionStatus ?? "dry_run_active",
      heartbeatAt: this.now().toISOString(),
      ...liveFlags(),
    };
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.heartbeat",
      data: heartbeat as unknown as JsonValue,
    });
    return heartbeat;
  }

  async planStreamReplay(input: {
    runtimeJobId: string;
    sessionId: string;
    events: CodexBridgeNormalizedStreamEvent[];
  }): Promise<SupervisorReplayPlan> {
    await this.requireSession(input.runtimeJobId, input.sessionId);
    const analysis = analyzeSupervisorSequences(input.events);
    const plan: SupervisorReplayPlan = {
      artifactKind: "replay_plan",
      sessionId: input.sessionId,
      runtimeJobId: input.runtimeJobId,
      eventCount: input.events.length,
      lastSequence: analysis.lastSequence,
      missingSequences: analysis.missingSequences,
      duplicateSequences: analysis.duplicateSequences,
      monotonic: analysis.monotonic,
      replayIntoLiveProcess: false,
      ...liveFlags(),
    };
    await this.recordArtifact(input.runtimeJobId, "replay_plan", input.sessionId, plan);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.replay_planned",
      data: plan as unknown as JsonValue,
    });
    return plan;
  }

  async recordControlCommand(input: {
    runtimeJobId: string;
    sessionId: string;
    commandKind: SupervisorControlCommandKind;
    actorId: string;
    reason: string;
    sequence: number;
    redirectPrompt?: string;
    cancelRuntimeJob?: boolean;
  }): Promise<SupervisorControlCommand> {
    await this.requireSession(input.runtimeJobId, input.sessionId);
    let runtimeStateChanged = false;
    if (input.commandKind === "cancel" && input.cancelRuntimeJob === true) {
      const canceled = await this.runtimeJobs.cancelJob(input.runtimeJobId, input.reason);
      runtimeStateChanged = Boolean(canceled);
    }
    const command: SupervisorControlCommand = {
      artifactKind: "control_command",
      sessionId: input.sessionId,
      runtimeJobId: input.runtimeJobId,
      commandKind: input.commandKind,
      actorId: input.actorId,
      reason: input.reason,
      sequence: input.sequence,
      requestedAt: this.now().toISOString(),
      runtimeStateChanged,
      redirectPrompt: input.redirectPrompt,
      ...liveFlags(),
    };
    await this.recordArtifact(input.runtimeJobId, "control_command", input.sessionId, command);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.control_command",
      data: command as unknown as JsonValue,
    });
    return command;
  }

  async recordRebuildEvent(input: {
    runtimeJobId: string;
    sessionId: string;
    rebuildEventKind: SupervisorRebuildEventKind;
    rebuildDescriptorId: string;
    summary: string;
    artifactRefs?: string[];
    failureLogs?: string[];
    priorStreamEvidenceRefs?: string[];
  }): Promise<{
    rebuildEvent: SupervisorRebuildEvent;
    autobailoutPlanCreated: boolean;
  }> {
    const session = await this.requireSession(input.runtimeJobId, input.sessionId);
    const job = await this.requireBridgeJob(input.runtimeJobId);
    if (!isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${input.runtimeJobId}`);
    }
    let autobailoutPlanCreated = false;
    if (input.rebuildEventKind === "failed") {
      const classification = classifyAutobailoutEligibility({
        trustPolicy: job.payload.trustPolicy,
        autobailoutPolicy: job.payload.autobailoutPolicy,
        repoPath: session.repoPath,
        originalObjective: job.payload.prompt.objective,
        failureLogs: input.failureLogs ?? [],
        priorStreamEvidenceRefs: input.priorStreamEvidenceRefs ?? [],
        rebuildEvidenceRefs: input.artifactRefs ?? [],
      });
      if (classification.eligible) {
        const plan = createAutobailoutPlan({
          classification,
          originalObjective: job.payload.prompt.objective,
          failureSummary: input.summary,
          policy: job.payload.autobailoutPolicy,
          evidenceRefs: [...(input.priorStreamEvidenceRefs ?? []), ...(input.artifactRefs ?? [])],
        });
        await this.recordArtifact(input.runtimeJobId, "autobailout_plan", input.sessionId, plan);
        await this.runtimeJobs.recordEvent({
          jobId: input.runtimeJobId,
          eventType: "supervisor.autobailout_plan_created",
          data: plan as unknown as JsonValue,
        });
        autobailoutPlanCreated = true;
      }
    }
    const rebuildEvent: SupervisorRebuildEvent = {
      artifactKind: "rebuild_event",
      sessionId: input.sessionId,
      runtimeJobId: input.runtimeJobId,
      rebuildEventKind: input.rebuildEventKind,
      rebuildDescriptorId: input.rebuildDescriptorId,
      summary: input.summary,
      artifactRefs: input.artifactRefs ?? [],
      recordedAt: this.now().toISOString(),
      autobailoutPlanCreated,
      ...liveFlags(),
    };
    await this.recordArtifact(input.runtimeJobId, "rebuild_event", input.sessionId, rebuildEvent);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.rebuild_event",
      data: rebuildEvent as unknown as JsonValue,
    });
    return { rebuildEvent, autobailoutPlanCreated };
  }

  async readDryRunStatus(input: {
    runtimeJobId: string;
    sessionId: string;
  }): Promise<SupervisorDryRunStatus> {
    const runtimeJob = await this.runtimeJobs.getJob(input.runtimeJobId);
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    const events = await this.runtimeJobs.listEvents(input.runtimeJobId, 500);
    const session = await this.findSessionArtifact(input.runtimeJobId, input.sessionId);
    const streamAnalysis = analyzeSupervisorSequences(
      events
        .map(normalizedStreamEventFromRuntimeEvent)
        .filter((event): event is CodexBridgeNormalizedStreamEvent => Boolean(event)),
    );
    const heartbeats = events
      .filter((event) => event.eventType === "supervisor.heartbeat")
      .map((event) => asRecord(event.data) as unknown as SupervisorHeartbeat)
      .filter((heartbeat) => heartbeat.sessionId === input.sessionId)
      .toSorted((left, right) => left.sequence - right.sequence);
    const latestHeartbeat = heartbeats.at(-1) ?? null;
    const now = this.now().getTime();
    const staleHeartbeat =
      latestHeartbeat === null ||
      now - new Date(latestHeartbeat.heartbeatAt).getTime() > this.staleHeartbeatMs;
    return {
      session,
      runtimeJob,
      workQueueLink: session?.workQueueLink ?? null,
      lastSequence: streamAnalysis.lastSequence,
      sequenceGaps: streamAnalysis.missingSequences,
      latestHeartbeat,
      staleHeartbeat,
      controlCommands: events
        .filter((event) => event.eventType === "supervisor.control_command")
        .map((event) => asRecord(event.data) as unknown as SupervisorControlCommand)
        .filter((command) => command.sessionId === input.sessionId)
        .toSorted((left, right) => left.sequence - right.sequence),
      rebuildEvents: events
        .filter((event) => event.eventType === "supervisor.rebuild_event")
        .map((event) => asRecord(event.data) as unknown as SupervisorRebuildEvent)
        .filter((event) => event.sessionId === input.sessionId)
        .toSorted(
          (left, right) =>
            rebuildEventOrder(left.rebuildEventKind) - rebuildEventOrder(right.rebuildEventKind),
        ),
      artifacts,
      ...liveFlags(),
    };
  }

  private async requireRuntimeJob(jobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(jobId);
    if (!job) {
      throw new Error(`runtime job not found: ${jobId}`);
    }
    return job;
  }

  private async requireBridgeJob(jobId: string): Promise<RuntimeJob> {
    const job = await this.requireRuntimeJob(jobId);
    if (job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${jobId}`);
    }
    return job;
  }

  private async findSessionArtifact(
    runtimeJobId: string,
    sessionId: string,
  ): Promise<SupervisorDryRunSession | null> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    const artifact = artifacts.find(
      (candidate) =>
        candidate.artifactType === "supervisor_session" &&
        asRecord(candidate.metadata).sessionId === sessionId,
    );
    return artifact ? (artifact.metadata as unknown as SupervisorDryRunSession) : null;
  }

  private async requireSession(
    runtimeJobId: string,
    sessionId: string,
  ): Promise<SupervisorDryRunSession> {
    const session = await this.findSessionArtifact(runtimeJobId, sessionId);
    if (!session) {
      throw new Error(`supervisor dry-run session not found: ${sessionId}`);
    }
    return session;
  }

  private async recordArtifact(
    jobId: string,
    artifactKind: string,
    sessionId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundSupervisorMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "supervisor artifact metadata");
    return this.runtimeJobs.attachArtifact({
      jobId,
      artifactType: artifactKind,
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/supervisor/${sessionId}/${artifactKind}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

function rebuildEventOrder(kind: SupervisorRebuildEventKind): number {
  if (kind === "started") {
    return 1;
  }
  if (kind === "completed") {
    return 2;
  }
  return 3;
}

export function analyzeSupervisorSequences(
  events: Pick<CodexBridgeNormalizedStreamEvent, "sequence">[],
): SupervisorSequenceAnalysis {
  const sequences = events.map((event) => event.sequence);
  const unique = [...new Set(sequences)].toSorted((left, right) => left - right);
  const duplicateSequences = unique.filter(
    (sequence) => sequences.filter((candidate) => candidate === sequence).length > 1,
  );
  const missingSequences: number[] = [];
  if (unique.length > 0) {
    for (let sequence = unique[0]!; sequence <= unique.at(-1)!; sequence += 1) {
      if (!unique.includes(sequence)) {
        missingSequences.push(sequence);
      }
    }
  }
  return {
    sequences,
    lastSequence: unique.at(-1) ?? null,
    missingSequences,
    duplicateSequences,
    monotonic: sequences.every(
      (sequence, index) => index === 0 || sequence > sequences[index - 1]!,
    ),
  };
}
