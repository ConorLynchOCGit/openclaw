import { randomUUID } from "node:crypto";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type {
  CodexProcessDescriptor,
  ObserveOnlyPilotGateResult,
  OperatorAcceptanceMetadata,
  SupervisorProcessCallbacks,
  SupervisorProcessResult,
  SupervisorProcessRunner,
} from "./execution-supervisor.ts";
import {
  LiveCodexRunner,
  type LiveCodexRunnerOptions,
  type LiveCodexRunnerResult,
} from "./live-codex-runner.ts";
import type {
  LocalCodexSmokeOperatorRunbook,
  LocalCodexSmokePreflightReport,
  LocalCodexSmokePreflightRepository,
} from "./local-codex-smoke-preflight.ts";
import type {
  LocalCodexSmokeRequestRepository,
  LocalCodexSmokeRunRequest,
  LocalCodexSmokeRunRequestResult,
} from "./local-codex-smoke-request.ts";
import type { LocalCodexSmokeTestReport } from "./local-codex-smoke-test.ts";
import { ExecutionPlatformWorkEpisodeCloseoutRepository } from "./work-episode-closeout.ts";

const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;

export type LocalCodexLiveSmokeSuccessCriteria = {
  preflightAllowed: boolean;
  codexInvokedThroughBridgePath: boolean;
  processResultRecorded: boolean;
  streamOrProcessEvidenceRecorded: boolean;
  noFileChangesRequiredOrRequested: boolean;
  workQueueLifecycleNotMutated: boolean;
  noRebuildAutobailoutSubagentAcpOrPromotion: boolean;
  processCompletionIsOnlySmokeSuccess: true;
  smokeSucceeded: boolean;
  taskSuccessClaimed: false;
};

export type LocalCodexLiveSmokeResult = {
  artifactKind: "local_codex_live_smoke_result";
  liveSmokeRunId: string;
  runtimeJobId: string;
  requestId: string | null;
  preflightId: string | null;
  runbookId: string | null;
  smokeTestId: string | null;
  sessionId: string | null;
  startedAt: string;
  completedAt: string;
  operatorApprovedBy: string;
  executorSessionIsSeparate: true;
  manualOperatorSessionSharedWithExecutor: false;
  codexCliInvoked: boolean;
  commandExecuted: boolean;
  liveExecutionEnabled: boolean;
  processResult: SupervisorProcessResult | null;
  eventCount: number;
  finalResponsePresent: boolean;
  finalResponseCandidate: string | null;
  completedWorkPathSatisfied: boolean;
  validationEvidencePresent: false;
  workQueueLifecycleMutated: false;
  rebuildPerformed: boolean;
  autobailoutPerformed: false;
  subagentStarted: boolean;
  acpSessionStarted: boolean;
  providerCallMade: boolean;
  blockingReasons: string[];
  successCriteria: LocalCodexLiveSmokeSuccessCriteria;
};

export type LocalCodexSmokeLiveEntrypointOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
  liveRunnerOptions?: LiveCodexRunnerOptions;
  autoEmitWorkEpisodeCloseout?: boolean;
  workEpisodeCloseoutArtifactRoot?: string;
  workEpisodeCloseoutRepository?: ExecutionPlatformWorkEpisodeCloseoutRepository;
};

export type RunApprovedLocalCodexLiveSmokeInput = {
  runtimeJobId: string;
  operatorApprovedBy: string;
  request?: LocalCodexSmokeRunRequest;
  liveSmokeRunId?: string;
  preflightId?: string;
  runbookId?: string;
  runner?: SupervisorProcessRunner;
  liveRunner?: LiveCodexRunner;
  liveRunnerOptions?: LiveCodexRunnerOptions;
};

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function boundLiveSmokeMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 300,
    maxArrayItems: 180,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function processResultAudit(processResult: SupervisorProcessResult | null): {
  codexCliInvoked: boolean;
  commandExecuted: boolean;
  liveExecutionEnabled: boolean;
  rebuildPerformed: boolean;
  subagentStarted: boolean;
  acpSessionStarted: boolean;
  providerCallMade: boolean;
} {
  return {
    codexCliInvoked: processResult?.codexCliInvoked ?? false,
    commandExecuted: processResult?.commandExecuted ?? false,
    liveExecutionEnabled: processResult?.liveExecutionEnabled ?? false,
    rebuildPerformed: processResult?.rebuildPerformed ?? false,
    subagentStarted: processResult?.subagentStarted ?? false,
    acpSessionStarted: processResult?.acpSessionStarted ?? false,
    providerCallMade: processResult?.providerCallMade ?? false,
  };
}

function successCriteria(input: {
  preflight: LocalCodexSmokePreflightReport;
  report: LocalCodexSmokeTestReport | null;
  processResult: SupervisorProcessResult | null;
}): LocalCodexLiveSmokeSuccessCriteria {
  const audit = processResultAudit(input.processResult);
  const noRebuildAutobailoutSubagentAcpOrPromotion =
    !audit.rebuildPerformed && !audit.subagentStarted && !audit.acpSessionStarted;
  const streamOrProcessEvidenceRecorded =
    (input.report?.eventCount ?? 0) > 0 || input.processResult !== null;
  const smokeSucceeded =
    input.preflight.allowed &&
    audit.commandExecuted &&
    input.processResult !== null &&
    streamOrProcessEvidenceRecorded &&
    noRebuildAutobailoutSubagentAcpOrPromotion;
  return {
    preflightAllowed: input.preflight.allowed,
    codexInvokedThroughBridgePath: audit.commandExecuted,
    processResultRecorded: input.processResult !== null,
    streamOrProcessEvidenceRecorded,
    noFileChangesRequiredOrRequested: true,
    workQueueLifecycleNotMutated: true,
    noRebuildAutobailoutSubagentAcpOrPromotion,
    processCompletionIsOnlySmokeSuccess: true,
    smokeSucceeded,
    taskSuccessClaimed: false,
  };
}

export class LiveCodexSupervisorProcessRunner implements SupervisorProcessRunner {
  constructor(
    private readonly liveRunner: LiveCodexRunner,
    private readonly gate: ObserveOnlyPilotGateResult,
    private readonly operatorAcceptance: OperatorAcceptanceMetadata,
  ) {}

  async run(
    descriptor: CodexProcessDescriptor,
    callbacks: SupervisorProcessCallbacks,
  ): Promise<LiveCodexRunnerResult> {
    return this.liveRunner.run(
      {
        descriptor,
        gate: this.gate,
        operatorAcceptance: this.operatorAcceptance,
      },
      callbacks,
    );
  }
}

export class LocalCodexSmokeLiveEntrypointRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;
  private readonly autoEmitWorkEpisodeCloseout: boolean;
  private readonly workEpisodeCloseoutArtifactRoot: string | undefined;
  private readonly workEpisodeCloseoutRepository:
    | ExecutionPlatformWorkEpisodeCloseoutRepository
    | undefined;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly requests: LocalCodexSmokeRequestRepository,
    private readonly preflight: LocalCodexSmokePreflightRepository,
    options: LocalCodexSmokeLiveEntrypointOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
    this.autoEmitWorkEpisodeCloseout = options.autoEmitWorkEpisodeCloseout ?? true;
    this.workEpisodeCloseoutArtifactRoot = options.workEpisodeCloseoutArtifactRoot;
    this.workEpisodeCloseoutRepository = options.workEpisodeCloseoutRepository;
  }

  async runApprovedLiveSmoke(
    input: RunApprovedLocalCodexLiveSmokeInput,
  ): Promise<LocalCodexLiveSmokeResult> {
    const startedAt = this.now().toISOString();
    if (input.request) {
      await this.requests.executeAcceptedRequest({ request: input.request });
    }
    const preflight = await this.preflight.checkAndPersistPreflight({
      runtimeJobId: input.runtimeJobId,
      checkedBy: input.operatorApprovedBy,
      preflightId: input.preflightId,
    });
    const runbook = await this.preflight.createAndPersistOperatorRunbook({
      report: preflight,
      createdBy: input.operatorApprovedBy,
      runbookId: input.runbookId,
    });
    if (
      !preflight.allowed ||
      preflight.nextOperatorAction !== "run_single_observe_only_smoke_test"
    ) {
      return this.persistLiveSmokeResult(
        this.createResult({
          input,
          startedAt,
          preflight,
          runbook,
          requestResult: null,
          blockingReasons: preflight.blockingReasons,
        }),
        "codex_bridge.live_smoke_blocked",
      );
    }
    const request = preflight.smokeRunRequest;
    if (!request?.smokeTestPlan || !request.operatorAcceptance) {
      return this.persistLiveSmokeResult(
        this.createResult({
          input,
          startedAt,
          preflight,
          runbook,
          requestResult: null,
          blockingReasons: ["accepted_live_smoke_request_required"],
        }),
        "codex_bridge.live_smoke_blocked",
      );
    }
    const runner =
      input.runner ??
      new LiveCodexSupervisorProcessRunner(
        input.liveRunner ??
          new LiveCodexRunner({
            ...input.liveRunnerOptions,
            enableLiveCodexPilot: true,
            maxRuntimeMs: request.maxRuntimeMs,
            maxStdoutBytes: request.maxStdoutBytes,
            maxStderrBytes: request.maxStderrBytes,
          }),
        request.smokeTestPlan.pilotGate,
        request.operatorAcceptance,
      );
    const requestResult = await this.requests.executeAcceptedRequest({ request, runner });
    const blockingReasons =
      requestResult.status === "completed" ? [] : requestResult.blockingReasons;
    return this.persistLiveSmokeResult(
      this.createResult({
        input,
        startedAt,
        preflight,
        runbook,
        requestResult,
        blockingReasons,
      }),
      "codex_bridge.live_smoke_completed",
    );
  }

  async readLiveSmokeResults(runtimeJobId: string): Promise<LocalCodexLiveSmokeResult[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "codex_bridge.live_smoke_result")
      .map((artifact) => artifact.metadata as unknown as LocalCodexLiveSmokeResult);
  }

  async readLatestLiveSmokeResult(runtimeJobId: string): Promise<LocalCodexLiveSmokeResult | null> {
    const results = await this.readLiveSmokeResults(runtimeJobId);
    return results.at(-1) ?? null;
  }

  private createResult(input: {
    input: RunApprovedLocalCodexLiveSmokeInput;
    startedAt: string;
    preflight: LocalCodexSmokePreflightReport;
    runbook: LocalCodexSmokeOperatorRunbook;
    requestResult: LocalCodexSmokeRunRequestResult | null;
    blockingReasons: string[];
  }): LocalCodexLiveSmokeResult {
    const report = input.requestResult?.smokeReport ?? null;
    const processResult = report?.processResult ?? null;
    const audit = processResultAudit(processResult);
    return {
      artifactKind: "local_codex_live_smoke_result",
      liveSmokeRunId: input.input.liveSmokeRunId ?? `codex-live-smoke-${randomUUID()}`,
      runtimeJobId: input.input.runtimeJobId,
      requestId: input.preflight.requestId,
      preflightId: input.preflight.preflightId,
      runbookId: input.runbook.runbookId,
      smokeTestId: input.preflight.smokeTestId,
      sessionId: input.preflight.sessionId,
      startedAt: input.startedAt,
      completedAt: this.now().toISOString(),
      operatorApprovedBy: input.input.operatorApprovedBy,
      executorSessionIsSeparate: true,
      manualOperatorSessionSharedWithExecutor: false,
      codexCliInvoked: audit.codexCliInvoked,
      commandExecuted: audit.commandExecuted,
      liveExecutionEnabled: audit.liveExecutionEnabled,
      processResult,
      eventCount: report?.eventCount ?? 0,
      finalResponsePresent: report?.finalResponsePresent ?? false,
      finalResponseCandidate: report?.finalResponseCandidate ?? null,
      completedWorkPathSatisfied: report?.completedWorkPath.satisfied ?? false,
      validationEvidencePresent: false,
      workQueueLifecycleMutated: false,
      rebuildPerformed: audit.rebuildPerformed,
      autobailoutPerformed: false,
      subagentStarted: audit.subagentStarted,
      acpSessionStarted: audit.acpSessionStarted,
      providerCallMade: audit.providerCallMade,
      blockingReasons: input.blockingReasons,
      successCriteria: successCriteria({
        preflight: input.preflight,
        report,
        processResult,
      }),
    };
  }

  private async persistLiveSmokeResult(
    result: LocalCodexLiveSmokeResult,
    eventType: "codex_bridge.live_smoke_blocked" | "codex_bridge.live_smoke_completed",
  ): Promise<LocalCodexLiveSmokeResult> {
    await this.recordArtifact(result.runtimeJobId, "codex_bridge.live_smoke_result", result);
    await this.runtimeJobs.recordEvent({
      jobId: result.runtimeJobId,
      eventType,
      data: result as unknown as JsonValue,
    });
    if (this.shouldAutoEmitWorkEpisodeCloseout(result)) {
      try {
        await this.closeoutRepository().emitCloseoutForRuntimeJob({
          runtimeJobId: result.runtimeJobId,
          sourceRefs: [`codex-bridge://live-smoke/${result.liveSmokeRunId}`],
        });
      } catch (error) {
        await this.runtimeJobs.recordEvent({
          jobId: result.runtimeJobId,
          eventType: "execution_platform.work_episode_closeout_failed",
          data: {
            code: "work_episode_closeout_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        return {
          ...result,
          blockingReasons: [...result.blockingReasons, "work_episode_closeout_failed"],
        };
      }
    }
    return result;
  }

  private shouldAutoEmitWorkEpisodeCloseout(result: LocalCodexLiveSmokeResult): boolean {
    return (
      this.autoEmitWorkEpisodeCloseout &&
      result.commandExecuted &&
      result.codexCliInvoked &&
      result.liveExecutionEnabled
    );
  }

  private closeoutRepository(): ExecutionPlatformWorkEpisodeCloseoutRepository {
    return (
      this.workEpisodeCloseoutRepository ??
      new ExecutionPlatformWorkEpisodeCloseoutRepository(this.runtimeJobs, {
        now: this.now,
        artifactRoot: this.workEpisodeCloseoutArtifactRoot,
        maxArtifactMetadataBytes: this.maxArtifactMetadataBytes,
      })
    );
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundLiveSmokeMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "live smoke metadata");
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
