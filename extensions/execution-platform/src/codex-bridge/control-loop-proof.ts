import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  type CodexBridgeControlCommand,
  type CodexBridgeControlCommandKind,
  type CodexBridgeControlReadinessSummary,
  type CodexBridgeControlReasonCategory,
  type CodexBridgeLatestControlState,
} from "./control-bridge.ts";
import {
  CodexBridgeEmissionGuardrailRepository,
  evaluateCodexBridgeEmissionGuardrails,
  type CodexBridgeEmissionGuardrailReport,
} from "./emission-guardrails.ts";
import {
  CodexBridgeSkillTriggerRepository,
  applyBridgeSafetySkillCoverage,
  evaluateCodexBridgeSkillTriggers,
  listRequiredCodexBridgeSkillDocs,
  produceCodexBridgeSkillReadinessReport,
  produceFakeControlLoopReadiness,
  type CodexBridgeFakeControlLoopReadiness,
  type CodexBridgeSkillReadinessReport,
  type CodexBridgeSkillTriggerReport,
} from "./skill-triggers.ts";
import { normalizeFakeCodexCliStreamEvent } from "./stream.ts";
import {
  CODEX_BRIDGE_JOB_TYPE,
  type CodexBridgeJobPayload,
  type CodexBridgeNormalizedStreamEvent,
  type FakeCodexCliStreamEvent,
  isCodexBridgeJobPayload,
} from "./types.ts";
import {
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  type ExecutionPlatformCloseoutGateReport,
  type ExecutionPlatformNextRunCloseoutGateReport,
} from "./work-episode-closeout.ts";

const FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE = "codex_bridge.fake_control_loop_proof";
const FAKE_CONTROL_LOOP_STREAM_ARTIFACT_TYPE = "codex_bridge.fake_control_loop_stream_snapshot";
const FAKE_CONTROL_LOOP_READINESS_ARTIFACT_TYPE = "codex_bridge.fake_control_loop_readiness_report";
const FAKE_CONTROL_LOOP_COMPLETED_EVENT_TYPE = "codex_bridge.fake_control_loop_completed";
const DEFAULT_MAX_FAKE_CONTROL_LOOP_METADATA_BYTES = 96 * 1024;

export const CODEX_BRIDGE_FAKE_CONTROL_LOOP_HAZARDS = [
  "runtime_substrate_mismatch",
  "missing_closeout_evidence",
  "missing_safe_ui_bridge_context",
  "prohibited_semantic_drift",
  "deterministic_vs_model_judgment_violation",
  "unexpected_command_execution",
  "timeout_or_stale_heartbeat",
] as const;

export type CodexBridgeFakeControlLoopHazard =
  (typeof CODEX_BRIDGE_FAKE_CONTROL_LOOP_HAZARDS)[number];

export type CodexBridgeFakeOversightStreamSnapshot = {
  artifactKind: "codex_bridge_fake_control_loop_stream_snapshot";
  runtimeJobId: string;
  sessionId: string;
  events: CodexBridgeNormalizedStreamEvent[];
  latestSequence: number;
  heartbeatState: {
    heartbeatAt: string | null;
    staleHeartbeat: boolean;
  };
  rawTranscriptPersisted: false;
  rawPromptPersisted: false;
  hiddenReasoningPersisted: false;
};

export type CodexBridgeControlLoopProofNoLiveAudit = {
  codexCliInvoked: false;
  acpSessionStarted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
  workQueueLifecycleMutated: false;
  commandExecuted: false;
};

export type CodexBridgeFakeControlLoopProof = {
  artifactKind: "codex_bridge_fake_control_loop_proof";
  proofId: string;
  runtimeJobId: string;
  sessionId: string;
  createdAt: string;
  createdBy: string;
  proofMode: "fake_control_loop";
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  simulatedHazard: CodexBridgeFakeControlLoopHazard;
  fakeOversightStreamSnapshot: CodexBridgeFakeOversightStreamSnapshot;
  latestSequence: number;
  heartbeatState: CodexBridgeFakeOversightStreamSnapshot["heartbeatState"];
  closeoutGateState:
    | ExecutionPlatformCloseoutGateReport
    | ExecutionPlatformNextRunCloseoutGateReport
    | null;
  skillTriggerReport: CodexBridgeSkillTriggerReport;
  skillReadinessReport: CodexBridgeSkillReadinessReport;
  fakeControlLoopReadiness: CodexBridgeFakeControlLoopReadiness;
  controlReadinessSummary: CodexBridgeControlReadinessSummary;
  selectedControlCommandKind: CodexBridgeControlCommandKind;
  controlReasonCategory: CodexBridgeControlReasonCategory;
  controlCommandId: string;
  controlCommandStatus: CodexBridgeControlCommand["status"];
  commandHistory: CodexBridgeControlCommand[];
  latestControlState: CodexBridgeLatestControlState;
  emissionGuardrailReport: CodexBridgeEmissionGuardrailReport | null;
  codeWritingBridgePilotBlocked: true;
  controlsTargetSeparateExecutorSession: true;
  manualOperatorSessionSharedWithExecutor: false;
  liveProcessSignalSent: false;
  promptInjectedIntoLiveProcess: false;
  noLiveExecutionAudit: CodexBridgeControlLoopProofNoLiveAudit;
  deferredSkillDirectionItems: string[];
};

export type RunCodexBridgeFakeControlLoopProofInput = {
  proofId?: string;
  runtimeJobId: string;
  sessionId?: string;
  createdBy: string;
  simulatedHazard: CodexBridgeFakeControlLoopHazard;
  selectedControlCommandKind?: CodexBridgeControlCommandKind;
  previousRuntimeJobId?: string | null;
  acknowledgeCommand?: boolean;
  markApplied?: boolean;
};

export type CodexBridgeControlLoopProofOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
  controlBridge?: CodexBridgeControlBridgeRepository;
  skillTriggers?: CodexBridgeSkillTriggerRepository;
  closeoutRepository?: ExecutionPlatformWorkEpisodeCloseoutRepository;
  emissionGuardrails?: CodexBridgeEmissionGuardrailRepository;
};

function noLiveAudit(): CodexBridgeControlLoopProofNoLiveAudit {
  return {
    codexCliInvoked: false,
    acpSessionStarted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    workQueueLifecycleMutated: false,
    commandExecuted: false,
  };
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function boundProofMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 320,
    maxArrayItems: 220,
    maxDepth: 12,
    maxStringLength: 2_000,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compact(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function reasonForHazard(hazard: CodexBridgeFakeControlLoopHazard): string {
  const map: Record<CodexBridgeFakeControlLoopHazard, string> = {
    runtime_substrate_mismatch:
      "runtime substrate mismatch fixture: executor emission conflicts with configured runtime evidence",
    missing_closeout_evidence:
      "missing closeout evidence fixture: previous meaningful runtime job lacks a valid Work Episode Outcome Pack",
    missing_safe_ui_bridge_context:
      "missing safe UI bridge context fixture: oversight stream lacks required Tailscale safe UI metadata",
    prohibited_semantic_drift:
      "prohibited semantic drift fixture: executor emission drifts from observe-only control scope",
    deterministic_vs_model_judgment_violation:
      "deterministic vs model judgment fixture: emission says deterministic deep critique for a qualitative judgment",
    unexpected_command_execution:
      "unexpected command execution fixture: stream reports command execution in an observe-only proof",
    timeout_or_stale_heartbeat: "timeout or stale heartbeat fixture: supervisor heartbeat is stale",
  };
  return map[hazard];
}

function reasonCategoryForHazard(
  hazard: CodexBridgeFakeControlLoopHazard,
): CodexBridgeControlReasonCategory {
  return hazard;
}

function defaultCommandKindForHazard(
  hazard: CodexBridgeFakeControlLoopHazard,
): CodexBridgeControlCommandKind {
  if (hazard === "unexpected_command_execution" || hazard === "timeout_or_stale_heartbeat") {
    return "cancel";
  }
  return hazard === "missing_closeout_evidence" ? "pause" : "redirect";
}

function streamMessageForHazard(hazard: CodexBridgeFakeControlLoopHazard): string {
  const map: Record<CodexBridgeFakeControlLoopHazard, string> = {
    runtime_substrate_mismatch:
      "Fake stream: executor claims configured Supabase runtime is unavailable from partial local evidence.",
    missing_closeout_evidence:
      "Fake stream: next execution is requested while previous meaningful work has no closeout pack pointer.",
    missing_safe_ui_bridge_context:
      "Fake stream: safe UI bridge metadata is missing from the executor context.",
    prohibited_semantic_drift:
      "Fake stream: executor begins treating proof completion as task completion.",
    deterministic_vs_model_judgment_violation:
      "Fake stream: deterministic deep critique proves the skill loadout is robust.",
    unexpected_command_execution:
      "Fake stream: observe-only executor reports an unexpected shell command execution.",
    timeout_or_stale_heartbeat:
      "Fake stream: no fresh heartbeat was observed inside the timeout window.",
  };
  return map[hazard];
}

function eventTypeForHazard(hazard: CodexBridgeFakeControlLoopHazard): string {
  return hazard === "unexpected_command_execution" ? "tool_call_started" : "assistant_update";
}

function fakeRawEvent(input: {
  sessionId: string;
  hazard: CodexBridgeFakeControlLoopHazard;
  sequence: number;
  timestamp: string;
}): FakeCodexCliStreamEvent {
  return {
    source: "codex_cli",
    type: eventTypeForHazard(input.hazard),
    sequence: input.sequence,
    timestamp: input.timestamp,
    summary: streamMessageForHazard(input.hazard),
    metadata: {
      fixture: true,
      sessionId: input.sessionId,
      simulatedHazard: input.hazard,
      noLiveExecution: true,
    },
  };
}

function redirectPromptForHazard(input: { hazard: string; reason: string }) {
  return {
    objective: `Redirect separate executor session for ${input.hazard}.`,
    scope: [
      "Preserve the configured repo and workspace docs paths.",
      "Use runtime job evidence, oversight stream events, closeout status, and skill readiness.",
      "Correct the bounded hazard without adding live authority.",
    ],
    nonGoals: [
      "Do not rebuild.",
      "Do not use subagents.",
      "Do not mutate Work Queue lifecycle.",
      "Do not execute shell commands from runtime payloads.",
    ],
    repoPath: "/root/services/openclaw-roles/live",
    workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
    safeUiBridge: { tailscaleRequired: true, descriptor: "Tailscale safe UI bridge" },
    promptText: compact(`Pause and redirect for fake-control-loop proof: ${input.reason}`),
  };
}

function deferredSkillDirectionItems(): string[] {
  return [
    "Rename skill-deep-critique to skill-audit-lint or skill-rule-coverage-check.",
    "Replace pass labels with coverage_present, coverage_missing, and needs_review.",
    "Treat rule coverage as necessary but never sufficient.",
    "Add a separate qualitative review artifact that is clearly labeled as judgment.",
    "Add actual trigger tests from realistic prompts.",
    "Add runtime emission guardrails that catch overclaims such as deterministic deep critique.",
  ];
}

function closeoutSatisfied(
  report: ExecutionPlatformCloseoutGateReport | ExecutionPlatformNextRunCloseoutGateReport | null,
): boolean {
  if (!report) {
    return true;
  }
  return "nextExecutionAllowed" in report ? report.nextExecutionAllowed : report.allowed;
}

function closeoutState(
  report: ExecutionPlatformCloseoutGateReport | ExecutionPlatformNextRunCloseoutGateReport | null,
): "present" | "missing" | "blocked" | "not_required" {
  if (!report) {
    return "not_required";
  }
  if (!report.status.closeoutPresent) {
    return "missing";
  }
  return closeoutSatisfied(report) ? "present" : "blocked";
}

export class CodexBridgeControlLoopProofRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;
  private readonly controlBridge: CodexBridgeControlBridgeRepository;
  private readonly skillTriggers: CodexBridgeSkillTriggerRepository;
  private readonly closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
  private readonly emissionGuardrails: CodexBridgeEmissionGuardrailRepository;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodexBridgeControlLoopProofOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_FAKE_CONTROL_LOOP_METADATA_BYTES;
    this.closeout =
      options.closeoutRepository ??
      new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, { now: this.now });
    this.controlBridge =
      options.controlBridge ??
      new CodexBridgeControlBridgeRepository(runtimeJobs, {
        now: this.now,
        closeoutRepository: this.closeout,
      });
    this.skillTriggers =
      options.skillTriggers ?? new CodexBridgeSkillTriggerRepository(runtimeJobs);
    this.emissionGuardrails =
      options.emissionGuardrails ?? new CodexBridgeEmissionGuardrailRepository(runtimeJobs);
  }

  async runFakeControlLoopProof(
    input: RunCodexBridgeFakeControlLoopProofInput,
  ): Promise<CodexBridgeFakeControlLoopProof> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${input.runtimeJobId}`);
    }
    const createdAt = this.now().toISOString();
    const sessionId = input.sessionId ?? `${input.runtimeJobId}-fake-control-session`;
    await this.recordSessionEvidence(input.runtimeJobId, sessionId, createdAt);
    const streamSnapshot = await this.seedFakeOversightStream({
      runtimeJobId: input.runtimeJobId,
      sessionId,
      hazard: input.simulatedHazard,
      createdAt,
    });
    const closeoutGateState = input.previousRuntimeJobId
      ? await this.closeout.produceNextRunCloseoutGateReport(input.previousRuntimeJobId)
      : input.simulatedHazard === "missing_closeout_evidence"
        ? await this.closeout.produceCloseoutGateReport(input.runtimeJobId)
        : null;
    const controlReasonCategory = reasonCategoryForHazard(input.simulatedHazard);
    const registry = applyBridgeSafetySkillCoverage(
      listRequiredCodexBridgeSkillDocs().map((entry) => {
        if (
          entry.skillDocId === "work-queue-ux-review" ||
          entry.skillDocId === "openclaw-bridge-safety"
        ) {
          return { ...entry, currentActivationState: "active" };
        }
        return entry;
      }),
    );
    const skillTriggerReport = evaluateCodexBridgeSkillTriggers({
      registry,
      triggerInput: {
        userPrompt: `Fake control-loop proof for ${input.simulatedHazard}.`,
        runtimeJobType: job.jobType,
        bridgeEventKinds: streamSnapshot.events.map((event) => event.eventKind),
        controlReasonCategory,
        closeoutGateState: closeoutState(closeoutGateState),
        workQueueLinkPresent: Boolean(job.payload.workQueueLink),
        repoPath: job.payload.environment.repoPath,
        workspaceDocsPath: job.payload.environment.workspaceDocsPath,
        requestedOperationType: "fake_control_loop",
        observedHazards: [input.simulatedHazard],
      },
    });
    const skillReadinessReport = produceCodexBridgeSkillReadinessReport({
      requestedMode: "fake_control_loop",
      registry,
      liveAuthorityRequested: false,
      triggerTestedSkillDocIds: skillTriggerReport.triggeredSkillDocIds,
    });
    await this.skillTriggers.persistSkillTriggerReport({
      runtimeJobId: input.runtimeJobId,
      report: skillTriggerReport,
    });
    await this.skillTriggers.persistSkillReadinessReport({
      runtimeJobId: input.runtimeJobId,
      report: skillReadinessReport,
    });
    const controlReadinessSummary = await this.controlBridge.produceControlReadinessSummary({
      runtimeJobId: input.runtimeJobId,
      sessionId,
      previousRuntimeJobId: input.previousRuntimeJobId,
    });
    const fakeControlLoopReadiness = produceFakeControlLoopReadiness({
      controlBridgeReady: controlReadinessSummary.readyForControlCommands,
      closeoutGateSatisfied: closeoutSatisfied(closeoutGateState),
      skillReadiness: skillReadinessReport,
    });
    const emissionGuardrailReport = await this.maybeRecordEmissionGuardrail({
      runtimeJobId: input.runtimeJobId,
      createdAt,
      streamSnapshot,
    });
    const selectedCommandKind =
      input.selectedControlCommandKind ?? defaultCommandKindForHazard(input.simulatedHazard);
    const command = await this.recordSelectedCommand({
      runtimeJobId: input.runtimeJobId,
      sessionId,
      createdBy: input.createdBy,
      selectedCommandKind,
      reason: reasonForHazard(input.simulatedHazard),
      reasonCategory: emissionGuardrailReport?.recommendedControlReason ?? controlReasonCategory,
      targetSequence: streamSnapshot.latestSequence,
      acknowledgeCommand: input.acknowledgeCommand,
      markApplied: input.markApplied,
    });
    const commandHistory = await this.controlBridge.readControlCommandHistory(input.runtimeJobId);
    const latestControlState = await this.controlBridge.readLatestControlState({
      runtimeJobId: input.runtimeJobId,
      sessionId,
    });
    const proof: CodexBridgeFakeControlLoopProof = {
      artifactKind: "codex_bridge_fake_control_loop_proof",
      proofId: input.proofId ?? randomUUID(),
      runtimeJobId: input.runtimeJobId,
      sessionId,
      createdAt,
      createdBy: input.createdBy,
      proofMode: "fake_control_loop",
      workQueueLink: job.payload.workQueueLink ?? null,
      simulatedHazard: input.simulatedHazard,
      fakeOversightStreamSnapshot: streamSnapshot,
      latestSequence: streamSnapshot.latestSequence,
      heartbeatState: streamSnapshot.heartbeatState,
      closeoutGateState,
      skillTriggerReport,
      skillReadinessReport,
      fakeControlLoopReadiness,
      controlReadinessSummary,
      selectedControlCommandKind: selectedCommandKind,
      controlReasonCategory: command.reasonCategory,
      controlCommandId: command.commandId,
      controlCommandStatus: command.status,
      commandHistory,
      latestControlState,
      emissionGuardrailReport,
      codeWritingBridgePilotBlocked: true,
      controlsTargetSeparateExecutorSession: true,
      manualOperatorSessionSharedWithExecutor: false,
      liveProcessSignalSent: false,
      promptInjectedIntoLiveProcess: false,
      noLiveExecutionAudit: noLiveAudit(),
      deferredSkillDirectionItems: deferredSkillDirectionItems(),
    };
    await this.persistProof(input.runtimeJobId, proof, streamSnapshot, fakeControlLoopReadiness);
    return proof;
  }

  async readFakeControlLoopProofs(
    runtimeJobId: string,
  ): Promise<CodexBridgeFakeControlLoopProof[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE)
      .map((artifact) => artifact.metadata)
      .filter(isRecord)
      .map((metadata) => metadata as unknown as CodexBridgeFakeControlLoopProof);
  }

  async readLatestFakeControlLoopProof(
    runtimeJobId: string,
  ): Promise<CodexBridgeFakeControlLoopProof | null> {
    return (await this.readFakeControlLoopProofs(runtimeJobId)).at(-1) ?? null;
  }

  private async recordSessionEvidence(
    runtimeJobId: string,
    sessionId: string,
    createdAt: string,
  ): Promise<void> {
    await this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "supervisor_session",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/supervisor/${sessionId}/supervisor_session`,
      contentType: "application/json",
      metadata: {
        artifactKind: "supervisor_session",
        runtimeJobId,
        sessionId,
        createdAt,
        fakeControlLoopProof: true,
        separateExecutorSessionRequired: true,
        manualOperatorSessionSharedWithExecutor: false,
      },
    });
  }

  private async seedFakeOversightStream(input: {
    runtimeJobId: string;
    sessionId: string;
    hazard: CodexBridgeFakeControlLoopHazard;
    createdAt: string;
  }): Promise<CodexBridgeFakeOversightStreamSnapshot> {
    const first = fakeRawEvent({
      sessionId: input.sessionId,
      hazard: input.hazard,
      sequence: 1,
      timestamp: input.createdAt,
    });
    const second = fakeRawEvent({
      sessionId: input.sessionId,
      hazard: input.hazard,
      sequence: 2,
      timestamp: input.createdAt,
    });
    second.type = "heartbeat";
    second.summary = "Fake supervisor heartbeat for control-loop proof.";
    const firstNormalized = await this.recordFakeStreamEvent(input.runtimeJobId, first);
    const secondNormalized = await this.recordFakeStreamEvent(input.runtimeJobId, second);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor.heartbeat",
      data: {
        heartbeatAt: input.createdAt,
        sessionId: input.sessionId,
        fakeControlLoopProof: true,
      },
    });
    return {
      artifactKind: "codex_bridge_fake_control_loop_stream_snapshot",
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      events: [firstNormalized, secondNormalized],
      latestSequence: 2,
      heartbeatState: {
        heartbeatAt: input.createdAt,
        staleHeartbeat: false,
      },
      rawTranscriptPersisted: false,
      rawPromptPersisted: false,
      hiddenReasoningPersisted: false,
    };
  }

  private async recordFakeStreamEvent(
    runtimeJobId: string,
    event: FakeCodexCliStreamEvent,
  ): Promise<CodexBridgeNormalizedStreamEvent> {
    const normalized = normalizeFakeCodexCliStreamEvent(event);
    await this.runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: "codex_bridge.stream_event",
      data: {
        raw: boundProofMetadata(event as unknown as JsonValue),
        normalized: boundProofMetadata(normalized as unknown as JsonValue),
      },
    });
    return normalized;
  }

  private async maybeRecordEmissionGuardrail(input: {
    runtimeJobId: string;
    createdAt: string;
    streamSnapshot: CodexBridgeFakeOversightStreamSnapshot;
  }): Promise<CodexBridgeEmissionGuardrailReport | null> {
    const report = evaluateCodexBridgeEmissionGuardrails({
      guardrailId: `${input.runtimeJobId}-fake-control-loop`,
      checkedAt: input.createdAt,
      metadata: {
        summaries: input.streamSnapshot.events.map((event) => event.summary),
      },
    });
    if (!report.detected) {
      return null;
    }
    await this.emissionGuardrails.persistEmissionGuardrailReport({
      runtimeJobId: input.runtimeJobId,
      report,
    });
    return report;
  }

  private async recordSelectedCommand(input: {
    runtimeJobId: string;
    sessionId: string;
    createdBy: string;
    selectedCommandKind: CodexBridgeControlCommandKind;
    reason: string;
    reasonCategory: CodexBridgeControlReasonCategory;
    targetSequence: number;
    acknowledgeCommand?: boolean;
    markApplied?: boolean;
  }): Promise<CodexBridgeControlCommand> {
    const base = {
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      actor: input.createdBy,
      reason: input.reason,
      reasonCategory: input.reasonCategory,
      targetSequence: input.targetSequence,
      commandId: `${input.runtimeJobId}-${input.selectedCommandKind}-${input.targetSequence}`,
    };
    const command =
      input.selectedCommandKind === "redirect"
        ? await this.controlBridge.createRedirectCommand({
            ...base,
            redirectPrompt: redirectPromptForHazard({
              hazard: input.reasonCategory,
              reason: input.reason,
            }),
          })
        : input.selectedCommandKind === "cancel"
          ? await this.controlBridge.createCancelCommand(base)
          : await this.controlBridge.createPauseCommand(base);
    let recorded = await this.controlBridge.recordControlCommand({ command });
    if (input.acknowledgeCommand) {
      recorded = await this.controlBridge.acknowledgeControlCommand({
        runtimeJobId: input.runtimeJobId,
        commandId: recorded.commandId,
        actor: input.createdBy,
      });
    }
    if (input.markApplied) {
      recorded = await this.controlBridge.markControlCommandApplied({
        runtimeJobId: input.runtimeJobId,
        commandId: recorded.commandId,
        actualEffect: "fake_control_loop_applied_no_live_signal",
      });
    }
    return recorded;
  }

  private async persistProof(
    runtimeJobId: string,
    proof: CodexBridgeFakeControlLoopProof,
    streamSnapshot: CodexBridgeFakeOversightStreamSnapshot,
    readiness: CodexBridgeFakeControlLoopReadiness,
  ): Promise<void> {
    await this.recordArtifact(
      runtimeJobId,
      FAKE_CONTROL_LOOP_STREAM_ARTIFACT_TYPE,
      proof.proofId,
      streamSnapshot as unknown as JsonValue,
    );
    await this.recordArtifact(
      runtimeJobId,
      FAKE_CONTROL_LOOP_READINESS_ARTIFACT_TYPE,
      proof.proofId,
      readiness as unknown as JsonValue,
    );
    await this.recordArtifact(
      runtimeJobId,
      FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE,
      proof.proofId,
      proof as unknown as JsonValue,
    );
    await this.runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: FAKE_CONTROL_LOOP_COMPLETED_EVENT_TYPE,
      data: {
        proofId: proof.proofId,
        simulatedHazard: proof.simulatedHazard,
        controlCommandId: proof.controlCommandId,
        controlCommandStatus: proof.controlCommandStatus,
        codeWritingBridgePilotBlocked: true,
        noLiveExecutionAudit: proof.noLiveExecutionAudit,
      },
    });
  }

  private async recordArtifact(
    runtimeJobId: string,
    artifactType: string,
    proofId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundProofMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "fake control-loop metadata");
    return this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/codex-bridge/fake-control-loop/${proofId}/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

export async function writeCodexBridgeFakeControlLoopProofArtifact(input: {
  proof: CodexBridgeFakeControlLoopProof;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string; proofId: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/fake-control-loop-proof-8q.json",
    );
  const bounded = boundProofMetadata(input.proof as unknown as JsonValue);
  await writeFile(artifactPath, `${JSON.stringify(bounded, null, 2)}\n`);
  return { artifactPath, proofId: input.proof.proofId };
}

export const CODEX_BRIDGE_FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE =
  FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE;
export const CODEX_BRIDGE_FAKE_CONTROL_LOOP_STREAM_ARTIFACT_TYPE =
  FAKE_CONTROL_LOOP_STREAM_ARTIFACT_TYPE;
export const CODEX_BRIDGE_FAKE_CONTROL_LOOP_READINESS_ARTIFACT_TYPE =
  FAKE_CONTROL_LOOP_READINESS_ARTIFACT_TYPE;
export const CODEX_BRIDGE_FAKE_CONTROL_LOOP_COMPLETED_EVENT_TYPE =
  FAKE_CONTROL_LOOP_COMPLETED_EVENT_TYPE;
