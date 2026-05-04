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
  validateRedirectPromptMetadataSafety,
  type CodexBridgeControlCommand,
  type CodexBridgeControlReadinessSummary,
  type CodexBridgeLatestControlState,
  type CodexBridgeOversightStreamState,
  type CodexBridgeRedirectPromptMetadata,
} from "./control-bridge.ts";
import {
  CodexBridgeSkillTriggerRepository,
  applyBridgeSafetySkillCoverage,
  evaluateCodexBridgeSkillTriggers,
  listRequiredCodexBridgeSkillDocs,
  produceCodexBridgeSkillReadinessReport,
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
} from "./work-episode-closeout.ts";

const FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE =
  "codex_bridge.fake_redirect_application_proof";
const FAKE_REDIRECT_APPLICATION_STREAM_ARTIFACT_TYPE =
  "codex_bridge.fake_redirect_application_stream_snapshot";
const FAKE_REDIRECT_APPLICATION_COMPLETED_EVENT_TYPE =
  "codex_bridge.fake_redirect_application_completed";
const DEFAULT_MAX_REDIRECT_PROOF_METADATA_BYTES = 96 * 1024;

export type CodexBridgeFakeRedirectApplicationProof = {
  artifactKind: "codex_bridge_fake_redirect_application_proof";
  proofId: string;
  runtimeJobId: string;
  sessionId: string;
  sourceControlCommandId: string;
  redirectCommand: CodexBridgeControlCommand;
  createdAt: string;
  createdBy: string;
  proofMode: "fake_redirect_application";
  commandStatusBefore: CodexBridgeControlCommand["status"];
  commandStatusAfter: CodexBridgeControlCommand["status"];
  targetSequence: number | null;
  latestObservedSequence: number | null;
  redirectPromptMetadata: CodexBridgeRedirectPromptMetadata;
  redirectSafetyValidation: {
    safe: true;
    bounded: true;
    prohibitedAuthorityRequested: false;
    rawPrivateContentPresent: false;
  };
  fakeExecutorAcknowledgement: {
    acknowledged: boolean;
    acknowledgedAt: string;
    liveExecutorContacted: false;
  };
  fakeApplicationResult: {
    applied: boolean;
    appliedAt: string;
    actualEffect: "fake_redirect_applied_no_live_prompt_injection";
  };
  oversightStreamBefore: CodexBridgeOversightStreamState;
  oversightStreamAfter: CodexBridgeOversightStreamState;
  streamEvent: CodexBridgeNormalizedStreamEvent;
  closeoutGateState: ExecutionPlatformCloseoutGateReport | null;
  skillTriggerReport: CodexBridgeSkillTriggerReport;
  skillReadinessReport: CodexBridgeSkillReadinessReport;
  controlReadinessSummary: CodexBridgeControlReadinessSummary;
  latestControlState: CodexBridgeLatestControlState;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  separateExecutorSessionRequired: true;
  manualOperatorSessionSharedWithExecutor: false;
  liveProcessSignalSent: false;
  promptInjectedIntoLiveProcess: false;
  workQueueLifecycleMutated: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
  commandExecuted: false;
  codeWritingBridgePilotStillBlocked: true;
  blockersRemaining: string[];
};

export type RunCodexBridgeFakeRedirectApplicationProofInput = {
  proofId?: string;
  runtimeJobId: string;
  sessionId: string;
  sourceControlCommandId: string;
  createdBy: string;
  acknowledgeCommand?: boolean;
  previousRuntimeJobId?: string | null;
};

export type CodexBridgeRedirectApplicationProofOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
  controlBridge?: CodexBridgeControlBridgeRepository;
  skillTriggers?: CodexBridgeSkillTriggerRepository;
  closeoutRepository?: ExecutionPlatformWorkEpisodeCloseoutRepository;
};

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function boundRedirectProofMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 320,
    maxArrayItems: 220,
    maxDepth: 12,
    maxStringLength: 2_000,
  });
}

function redirectAppliedRawEvent(input: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  commandId: string;
}): FakeCodexCliStreamEvent {
  return {
    source: "codex_cli",
    type: "redirect_applied",
    sequence: input.sequence,
    timestamp: input.timestamp,
    summary: "Fake redirect application recorded for separate executor session.",
    metadata: {
      fixture: true,
      sessionId: input.sessionId,
      commandId: input.commandId,
      liveProcessSignalSent: false,
      promptInjectedIntoLiveProcess: false,
    },
  };
}

function pilotBlockers(input: {
  skillReadiness: CodexBridgeSkillReadinessReport;
  closeout: ExecutionPlatformCloseoutGateReport | null;
}): string[] {
  const blockers = [
    "actual_code_writing_bridge_pilot_requires_future_explicit_approval",
    "live_process_signal_not_implemented",
  ];
  if (input.skillReadiness.blockingReasons.length > 0) {
    blockers.push(...input.skillReadiness.blockingReasons);
  }
  if (input.closeout && !input.closeout.allowed) {
    blockers.push(...input.closeout.blockingReasons.map((reason) => `closeout:${reason}`));
  }
  return [...new Set(blockers)];
}

export class CodexBridgeRedirectApplicationProofRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;
  private readonly controlBridge: CodexBridgeControlBridgeRepository;
  private readonly skillTriggers: CodexBridgeSkillTriggerRepository;
  private readonly closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: CodexBridgeRedirectApplicationProofOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_REDIRECT_PROOF_METADATA_BYTES;
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
  }

  async runFakeRedirectApplicationProof(
    input: RunCodexBridgeFakeRedirectApplicationProofInput,
  ): Promise<CodexBridgeFakeRedirectApplicationProof> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${input.runtimeJobId}`);
    }
    const command = await this.controlBridge.readControlCommandById({
      runtimeJobId: input.runtimeJobId,
      commandId: input.sourceControlCommandId,
    });
    if (!command) {
      throw new Error(`redirect command not found: ${input.sourceControlCommandId}`);
    }
    if (command.commandKind !== "redirect") {
      throw new Error(`control command is not a redirect command: ${input.sourceControlCommandId}`);
    }
    if (command.sessionId !== input.sessionId) {
      throw new Error(`unknown executor session id: ${input.sessionId}`);
    }
    if (!command.redirectPrompt) {
      throw new Error("redirect command is missing redirect prompt metadata");
    }
    const redirectPrompt = validateRedirectPromptMetadataSafety(command.redirectPrompt);
    const createdAt = this.now().toISOString();
    const oversightBefore = await this.controlBridge.readLatestControlState({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
    });
    const acknowledged =
      input.acknowledgeCommand === false
        ? command
        : await this.controlBridge.acknowledgeControlCommand({
            runtimeJobId: input.runtimeJobId,
            commandId: command.commandId,
            actor: input.createdBy,
          });
    const applied = await this.controlBridge.markControlCommandApplied({
      runtimeJobId: input.runtimeJobId,
      commandId: acknowledged.commandId,
      actualEffect: "fake_redirect_applied_no_live_prompt_injection",
    });
    const streamEvent = await this.recordRedirectAppliedStreamEvent({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      commandId: command.commandId,
      sequence: (oversightBefore.oversight.latestObservedSequence ?? 0) + 1,
      timestamp: createdAt,
    });
    const closeoutGateState = input.previousRuntimeJobId
      ? await this.closeout.produceCloseoutGateReport(input.previousRuntimeJobId)
      : null;
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
        userPrompt: "Pause that bridge runner and redirect it to check the DB substrate.",
        runtimeJobType: job.jobType,
        bridgeEventKinds: ["redirect_requested", "redirect_applied"],
        controlReasonCategory: command.reasonCategory,
        workQueueLinkPresent: Boolean(job.payload.workQueueLink),
        repoPath: job.payload.environment.repoPath,
        workspaceDocsPath: job.payload.environment.workspaceDocsPath,
        requestedOperationType: "fake_control_loop",
        observedHazards: [command.reasonCategory],
      },
    });
    const skillReadinessReport = produceCodexBridgeSkillReadinessReport({
      requestedMode: "fake_control_loop",
      registry,
      triggerTestedSkillDocIds: skillTriggerReport.triggeredSkillDocIds,
      liveAuthorityRequested: false,
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
      sessionId: input.sessionId,
      previousRuntimeJobId: input.previousRuntimeJobId,
    });
    const latestControlState = await this.controlBridge.readLatestControlState({
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
    });
    const proof: CodexBridgeFakeRedirectApplicationProof = {
      artifactKind: "codex_bridge_fake_redirect_application_proof",
      proofId: input.proofId ?? randomUUID(),
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      sourceControlCommandId: input.sourceControlCommandId,
      redirectCommand: applied,
      createdAt,
      createdBy: input.createdBy,
      proofMode: "fake_redirect_application",
      commandStatusBefore: command.status,
      commandStatusAfter: applied.status,
      targetSequence: command.targetSequence,
      latestObservedSequence: latestControlState.oversight.latestObservedSequence,
      redirectPromptMetadata: redirectPrompt,
      redirectSafetyValidation: {
        safe: true,
        bounded: true,
        prohibitedAuthorityRequested: false,
        rawPrivateContentPresent: false,
      },
      fakeExecutorAcknowledgement: {
        acknowledged: input.acknowledgeCommand !== false,
        acknowledgedAt: createdAt,
        liveExecutorContacted: false,
      },
      fakeApplicationResult: {
        applied: true,
        appliedAt: createdAt,
        actualEffect: "fake_redirect_applied_no_live_prompt_injection",
      },
      oversightStreamBefore: oversightBefore.oversight,
      oversightStreamAfter: latestControlState.oversight,
      streamEvent,
      closeoutGateState,
      skillTriggerReport,
      skillReadinessReport,
      controlReadinessSummary,
      latestControlState,
      workQueueLink: job.payload.workQueueLink ?? null,
      separateExecutorSessionRequired: true,
      manualOperatorSessionSharedWithExecutor: false,
      liveProcessSignalSent: false,
      promptInjectedIntoLiveProcess: false,
      workQueueLifecycleMutated: false,
      codexCliInvoked: false,
      acpSessionStarted: false,
      providerCallMade: false,
      rebuildPerformed: false,
      schedulerStarted: false,
      daemonStarted: false,
      subagentStarted: false,
      commandExecuted: false,
      codeWritingBridgePilotStillBlocked: true,
      blockersRemaining: pilotBlockers({
        skillReadiness: skillReadinessReport,
        closeout: closeoutGateState,
      }),
    };
    await this.persistProof(input.runtimeJobId, proof);
    return proof;
  }

  async readFakeRedirectApplicationProofs(
    runtimeJobId: string,
  ): Promise<CodexBridgeFakeRedirectApplicationProof[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE)
      .map((artifact) => artifact.metadata)
      .filter((metadata) =>
        Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata)),
      )
      .map((metadata) => metadata as unknown as CodexBridgeFakeRedirectApplicationProof);
  }

  async readLatestFakeRedirectApplicationProof(
    runtimeJobId: string,
  ): Promise<CodexBridgeFakeRedirectApplicationProof | null> {
    return (await this.readFakeRedirectApplicationProofs(runtimeJobId)).at(-1) ?? null;
  }

  private async recordRedirectAppliedStreamEvent(input: {
    runtimeJobId: string;
    sessionId: string;
    commandId: string;
    sequence: number;
    timestamp: string;
  }): Promise<CodexBridgeNormalizedStreamEvent> {
    const raw = redirectAppliedRawEvent(input);
    const normalized = normalizeFakeCodexCliStreamEvent(raw);
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "codex_bridge.stream_event",
      data: {
        raw: boundRedirectProofMetadata(raw as unknown as JsonValue),
        normalized: boundRedirectProofMetadata(normalized as unknown as JsonValue),
      },
    });
    return normalized;
  }

  private async persistProof(
    runtimeJobId: string,
    proof: CodexBridgeFakeRedirectApplicationProof,
  ): Promise<void> {
    await this.recordArtifact(
      runtimeJobId,
      FAKE_REDIRECT_APPLICATION_STREAM_ARTIFACT_TYPE,
      proof.proofId,
      {
        artifactKind: "codex_bridge_fake_redirect_application_stream_snapshot",
        runtimeJobId,
        sessionId: proof.sessionId,
        event: proof.streamEvent,
        before: proof.oversightStreamBefore,
        after: proof.oversightStreamAfter,
      },
    );
    await this.recordArtifact(
      runtimeJobId,
      FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE,
      proof.proofId,
      proof as unknown as JsonValue,
    );
    await this.runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: FAKE_REDIRECT_APPLICATION_COMPLETED_EVENT_TYPE,
      data: {
        proofId: proof.proofId,
        sourceControlCommandId: proof.sourceControlCommandId,
        commandStatusAfter: proof.commandStatusAfter,
        liveProcessSignalSent: false,
        promptInjectedIntoLiveProcess: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  private async recordArtifact(
    runtimeJobId: string,
    artifactType: string,
    proofId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundRedirectProofMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "fake redirect proof metadata");
    return this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/codex-bridge/fake-redirect-application/${proofId}/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

export async function writeCodexBridgeFakeRedirectApplicationProofArtifact(input: {
  proof: CodexBridgeFakeRedirectApplicationProof;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string; proofId: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/fake-redirect-application-proof-8r.json",
    );
  const bounded = boundRedirectProofMetadata(input.proof as unknown as JsonValue);
  await writeFile(artifactPath, `${JSON.stringify(bounded, null, 2)}\n`);
  return { artifactPath, proofId: input.proof.proofId };
}

export const CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE =
  FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE;
export const CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_STREAM_ARTIFACT_TYPE =
  FAKE_REDIRECT_APPLICATION_STREAM_ARTIFACT_TYPE;
export const CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_COMPLETED_EVENT_TYPE =
  FAKE_REDIRECT_APPLICATION_COMPLETED_EVENT_TYPE;
