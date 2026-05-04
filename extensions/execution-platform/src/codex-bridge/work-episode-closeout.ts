import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  buildWorkEpisodeOutcomePack,
  discoverWorkEpisodeOutcomePackArtifacts,
  evaluateWorkEpisodeOutcomePackEligibility,
  validateWorkEpisodeOutcomePack,
  writeWorkEpisodeOutcomePackArtifact,
  type WorkEpisodeOutcomePack,
  type WorkEpisodeOutcomePackArtifact,
  type WorkEpisodeOutcomePackChangeKind,
  type WorkEpisodeOutcomePackEligibilityReport,
  type WorkEpisodeOutcomePackFailureStatus,
  type WorkEpisodeOutcomePackOutcomeStatus,
  type WorkEpisodeOutcomePackRuntime,
  type WorkEpisodeOutcomePackTestStatus,
  type WorkEpisodeOutcomePackWorkType,
} from "../../../../src/infra/work-episode-outcome-pack.ts";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { CODEX_BRIDGE_JOB_TYPE, isCodexBridgeJobPayload } from "./types.ts";

const DEFAULT_OUTCOME_PACK_RELATIVE_ROOT = ".artifacts/model-memory/work-episode-outcome-pack";
const CLOSEOUT_ARTIFACT_TYPE = "execution_platform.work_episode_outcome_pack";
const CLOSEOUT_EVENT_TYPE = "execution_platform.work_episode_closeout_emitted";
const DEFAULT_MAX_CLOSEOUT_METADATA_BYTES = 64 * 1024;

export type ExecutionPlatformCloseoutFile = {
  path: string;
  changeKind?: WorkEpisodeOutcomePackChangeKind;
  summary?: string;
};

export type ExecutionPlatformCloseoutTest = {
  command: string;
  status: WorkEpisodeOutcomePackTestStatus;
  summary: string;
};

export type ExecutionPlatformCloseoutFailure = {
  failure: string;
  fix?: string;
  status: WorkEpisodeOutcomePackFailureStatus;
};

export type ExecutionPlatformCloseoutFollowUp = {
  title: string;
  rationale: string;
  sourceRefs: string[];
};

export type ExecutionPlatformCloseoutSkillEvidence = {
  workflowName?: string;
  evidence: string;
  suggestedDirection?: string;
  sourceRefs: string[];
};

export type ExecutionPlatformCloseoutSmokeResult = {
  artifactKind: "local_codex_live_smoke_result";
  runtimeJobId: string;
  requestId: string | null;
  preflightId: string | null;
  runbookId: string | null;
  smokeTestId: string | null;
  sessionId: string | null;
  liveSmokeRunId: string;
  eventCount: number;
  finalResponsePresent: boolean;
  finalResponseCandidate: string | null;
  processResult: { status?: string } | null;
  commandExecuted: boolean;
  codexCliInvoked: boolean;
  workQueueLifecycleMutated: false;
  rebuildPerformed: boolean;
  autobailoutPerformed: false;
  subagentStarted: boolean;
  acpSessionStarted: boolean;
  completedAt?: string;
  blockingReasons: string[];
  successCriteria: {
    smokeSucceeded: boolean;
  };
};

export type ExecutionPlatformCloseoutInput = {
  runtimeJobId: string;
  runtimeJobState?: string;
  runtime?: WorkEpisodeOutcomePackRuntime;
  projectId?: string;
  sessionKey?: string;
  branch?: string;
  startedAt?: string;
  completedAt: string;
  outcomeStatus?: WorkEpisodeOutcomePackOutcomeStatus;
  workType?: WorkEpisodeOutcomePackWorkType;
  primarySystemArea?: string;
  completedObjective?: string;
  recoveryRecommendation?: string;
  userGoal: string;
  workSummary: string;
  finalOutcome: string;
  smokeResult?: Pick<
    ExecutionPlatformCloseoutSmokeResult,
    | "runtimeJobId"
    | "requestId"
    | "preflightId"
    | "runbookId"
    | "smokeTestId"
    | "sessionId"
    | "liveSmokeRunId"
    | "eventCount"
    | "finalResponsePresent"
    | "finalResponseCandidate"
    | "processResult"
    | "commandExecuted"
    | "codexCliInvoked"
    | "workQueueLifecycleMutated"
    | "rebuildPerformed"
    | "autobailoutPerformed"
    | "subagentStarted"
    | "acpSessionStarted"
    | "successCriteria"
  >;
  filesTouched?: ExecutionPlatformCloseoutFile[];
  testsRun?: ExecutionPlatformCloseoutTest[];
  failuresAndFixes?: ExecutionPlatformCloseoutFailure[];
  unresolvedQuestions?: string[];
  followUpCandidates?: ExecutionPlatformCloseoutFollowUp[];
  skillImprovementEvidence?: ExecutionPlatformCloseoutSkillEvidence[];
  artifactRefs?: string[];
  supabasePersistenceProofRefs?: string[];
  workQueueLinkRefs?: string[];
  sourceRefs?: string[];
  contentHashes?: string[];
};

export type ExecutionPlatformCloseoutArtifactMetadata = {
  artifactKind: "execution_platform_work_episode_closeout";
  runtimeJobId: string;
  episodeId: string;
  packHash: string;
  packPath: string;
  markdownPath: string;
  artifactRoot: string;
  eligibility: WorkEpisodeOutcomePackEligibilityReport;
  promptPersisted: false;
  rawResponsePersisted: false;
  rawFullTranscriptPersisted: false;
  discoverableByModelMemory: boolean;
  emittedAt: string;
  sourceLiveSmokeRunId?: string | null;
  sourceRequestId?: string | null;
  sourcePackHash?: string | null;
};

export type ExecutionPlatformCloseoutStatus = {
  runtimeJobId: string;
  closeoutPresent: boolean;
  closeoutRequired: boolean;
  closeoutEligible: boolean;
  closeoutSafe: boolean;
  artifactPointerPersisted: boolean;
  discoverableByModelMemory: boolean;
  consumedOrReviewedByModelMemory: boolean;
  blockingReasons: string[];
  latestArtifact: RuntimeJobArtifact | null;
  metadata: ExecutionPlatformCloseoutArtifactMetadata | null;
};

export type ExecutionPlatformCloseoutGateReport = {
  runtimeJobId: string;
  closeoutRequired: boolean;
  allowed: boolean;
  pauseOrRedirectWorthy: boolean;
  blockingReasons: string[];
  status: ExecutionPlatformCloseoutStatus;
};

export type ExecutionPlatformNextRunCloseoutGateReport = ExecutionPlatformCloseoutGateReport & {
  previousRuntimeJobId: string;
  nextExecutionAllowed: boolean;
};

export type EmitExecutionPlatformCloseoutInput = {
  runtimeJobId: string;
  closeout?: ExecutionPlatformCloseoutInput;
  artifactRoot?: string;
  filesTouched?: ExecutionPlatformCloseoutFile[];
  testsRun?: ExecutionPlatformCloseoutTest[];
  failuresAndFixes?: ExecutionPlatformCloseoutFailure[];
  unresolvedQuestions?: string[];
  followUpCandidates?: ExecutionPlatformCloseoutFollowUp[];
  skillImprovementEvidence?: ExecutionPlatformCloseoutSkillEvidence[];
  sourceRefs?: string[];
};

export type EmitExecutionPlatformCloseoutResult = {
  closeoutInput: ExecutionPlatformCloseoutInput;
  pack: WorkEpisodeOutcomePack;
  packArtifact: WorkEpisodeOutcomePackArtifact;
  runtimeArtifact: RuntimeJobArtifact;
  eligibility: WorkEpisodeOutcomePackEligibilityReport;
  metadata: ExecutionPlatformCloseoutArtifactMetadata;
};

export type ExecutionPlatformCloseoutOptions = {
  now?: () => Date;
  artifactRoot?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxArtifactMetadataBytes?: number;
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

function compact(value: string | null | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function unique(values: Array<string | null | undefined>, maxItems: number): string[] {
  return [...new Set(values.map((value) => compact(value, 220)).filter(Boolean) as string[])].slice(
    0,
    maxItems,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLiveSmokeResult(value: unknown): value is ExecutionPlatformCloseoutSmokeResult {
  return isRecord(value) && value.artifactKind === "local_codex_live_smoke_result";
}

function boundCloseoutMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 260,
    maxArrayItems: 160,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function assertNoCloseoutUnsafeContent(value: unknown): void {
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
    throw new Error("execution platform closeout contains prohibited raw/private content");
  }
}

function statusFromRuntimeJob(job: RuntimeJob): WorkEpisodeOutcomePackOutcomeStatus {
  if (job.state === "succeeded") {
    return "completed";
  }
  if (job.state === "failed" || job.state === "timed_out") {
    return "failed";
  }
  if (job.state === "canceled") {
    return "interrupted";
  }
  return "partial";
}

function sourceRefsFromJob(input: {
  job: RuntimeJob;
  artifacts: RuntimeJobArtifact[];
  events: RuntimeJobEvent[];
  smokeResult: ExecutionPlatformCloseoutSmokeResult | null;
  extraRefs?: string[];
}): string[] {
  return unique(
    [
      `runtime-job://${input.job.jobId}`,
      `runtime-job://${input.job.jobId}/state/${input.job.state}`,
      input.smokeResult?.liveSmokeRunId
        ? `codex-bridge://live-smoke/${input.smokeResult.liveSmokeRunId}`
        : undefined,
      input.smokeResult?.requestId
        ? `codex-bridge://smoke-request/${input.smokeResult.requestId}`
        : undefined,
      input.smokeResult?.preflightId
        ? `codex-bridge://smoke-preflight/${input.smokeResult.preflightId}`
        : undefined,
      input.smokeResult?.runbookId
        ? `codex-bridge://smoke-runbook/${input.smokeResult.runbookId}`
        : undefined,
      ...input.artifacts.map((artifact) => `runtime-artifact://${artifact.artifactId}`),
      ...input.events.slice(-12).map((event) => `runtime-event://${event.eventId}`),
      ...(input.extraRefs ?? []),
    ],
    24,
  );
}

function defaultWorkSummary(input: {
  job: RuntimeJob;
  smokeResult: ExecutionPlatformCloseoutSmokeResult | null;
  artifactCount: number;
  eventCount: number;
}): string {
  if (input.smokeResult) {
    return [
      "Execution Platform ran or evaluated a local Codex bridge smoke path and persisted bounded runtime evidence.",
      `Runtime job state: ${input.job.state}.`,
      `Smoke event count: ${input.smokeResult.eventCount}.`,
      `Final response captured: ${input.smokeResult.finalResponsePresent ? "yes" : "no"}.`,
      "Process completion remains distinct from task success.",
    ].join(" ");
  }
  return [
    "Execution Platform runtime job evidence was summarized into a structured closeout pack.",
    `Runtime job state: ${input.job.state}.`,
    `Runtime artifacts: ${input.artifactCount}.`,
    `Runtime events: ${input.eventCount}.`,
  ].join(" ");
}

function defaultFinalOutcome(input: {
  smokeResult: ExecutionPlatformCloseoutSmokeResult | null;
  job: RuntimeJob;
}): string {
  if (input.smokeResult?.successCriteria.smokeSucceeded) {
    return [
      "The bridge smoke proof succeeded as a smoke test and produced durable evidence.",
      "It did not claim completed user-task success, mutate Work Queue lifecycle, rebuild, start ACP, start subagents, or promote models.",
    ].join(" ");
  }
  if (input.job.state === "succeeded") {
    return "The runtime job reached a terminal success state, with task success still requiring completed-work and validation evidence.";
  }
  return "The runtime job has bounded evidence available for review; follow-up work may still be required.";
}

function testsFromSmoke(
  smokeResult: ExecutionPlatformCloseoutSmokeResult | null,
): ExecutionPlatformCloseoutTest[] {
  if (!smokeResult) {
    return [];
  }
  return [
    {
      command: "Execution Platform local Codex observe-only smoke through bridge",
      status: smokeResult.successCriteria.smokeSucceeded ? "passed" : "failed",
      summary: `Bridge smoke process status: ${smokeResult.processResult?.status ?? "unknown"}; event count: ${smokeResult.eventCount}; task success not claimed.`,
    },
  ];
}

function failureFromSmoke(
  smokeResult: ExecutionPlatformCloseoutSmokeResult | null,
): ExecutionPlatformCloseoutFailure[] {
  if (!smokeResult || smokeResult.successCriteria.smokeSucceeded) {
    return [];
  }
  return [
    {
      failure: `Bridge smoke did not meet smoke success criteria: ${smokeResult.blockingReasons.join(", ") || "unknown"}.`,
      status: "unresolved",
    },
  ];
}

function findLatestLiveSmokeResult(
  artifacts: RuntimeJobArtifact[],
): ExecutionPlatformCloseoutSmokeResult | null {
  const artifact = artifacts
    .toReversed()
    .find(
      (candidate) =>
        candidate.artifactType === "codex_bridge.live_smoke_result" &&
        isLiveSmokeResult(candidate.metadata),
    );
  return artifact && isLiveSmokeResult(artifact.metadata) ? artifact.metadata : null;
}

function isSafeCloseoutMetadata(
  metadata: ExecutionPlatformCloseoutArtifactMetadata | null,
): boolean {
  return (
    metadata !== null &&
    !metadata.promptPersisted &&
    !metadata.rawResponsePersisted &&
    !metadata.rawFullTranscriptPersisted
  );
}

async function readExistingCloseoutPack(
  metadata: ExecutionPlatformCloseoutArtifactMetadata,
): Promise<WorkEpisodeOutcomePack> {
  return validateWorkEpisodeOutcomePack(JSON.parse(await readFile(metadata.packPath, "utf8")));
}

function closeoutMatchesPack(input: {
  metadata: ExecutionPlatformCloseoutArtifactMetadata;
  packHash?: string | null;
  smokeResult?: ExecutionPlatformCloseoutInput["smokeResult"];
}): boolean {
  return (
    (Boolean(input.packHash) && input.metadata.packHash === input.packHash) ||
    (Boolean(input.smokeResult?.liveSmokeRunId) &&
      input.metadata.sourceLiveSmokeRunId === input.smokeResult?.liveSmokeRunId) ||
    (Boolean(input.smokeResult?.requestId) &&
      input.metadata.sourceRequestId === input.smokeResult?.requestId)
  );
}

export function resolveExecutionPlatformCloseoutArtifactRoot(
  input: { env?: NodeJS.ProcessEnv; cwd?: string; artifactRoot?: string } = {},
): string {
  const env = input.env ?? process.env;
  return path.resolve(
    input.cwd ?? process.cwd(),
    input.artifactRoot ??
      env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT ??
      DEFAULT_OUTCOME_PACK_RELATIVE_ROOT,
  );
}

export function buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout(
  input: ExecutionPlatformCloseoutInput,
): WorkEpisodeOutcomePack {
  assertNoCloseoutUnsafeContent(input);
  const smokeRefs = input.smokeResult
    ? [
        input.smokeResult.liveSmokeRunId
          ? `codex-bridge://live-smoke/${input.smokeResult.liveSmokeRunId}`
          : undefined,
        input.smokeResult.requestId
          ? `codex-bridge://smoke-request/${input.smokeResult.requestId}`
          : undefined,
        input.smokeResult.preflightId
          ? `codex-bridge://smoke-preflight/${input.smokeResult.preflightId}`
          : undefined,
        input.smokeResult.runbookId
          ? `codex-bridge://smoke-runbook/${input.smokeResult.runbookId}`
          : undefined,
      ]
    : [];
  const sourceRefs = unique(
    [
      `runtime-job://${input.runtimeJobId}`,
      ...smokeRefs,
      ...(input.artifactRefs ?? []),
      ...(input.supabasePersistenceProofRefs ?? []),
      ...(input.workQueueLinkRefs ?? []),
      ...(input.sourceRefs ?? []),
    ],
    24,
  );
  return buildWorkEpisodeOutcomePack({
    runtime: input.runtime ?? "mixed",
    projectId: input.projectId ?? "execution-platform",
    sessionKey: input.sessionKey,
    branch: input.branch,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcomeStatus: input.outcomeStatus ?? "completed",
    workType: input.workType ?? "proof",
    primarySystemArea: input.primarySystemArea ?? "Execution Platform",
    completedObjective: input.completedObjective,
    recoveryRecommendation: input.recoveryRecommendation,
    userGoal: input.userGoal,
    workSummary: input.workSummary,
    finalOutcome: input.finalOutcome,
    filesTouched: input.filesTouched ?? [],
    testsRun: input.testsRun ?? [],
    failuresAndFixes: input.failuresAndFixes ?? [],
    unresolvedQuestions: input.unresolvedQuestions ?? [],
    followUpCandidates: input.followUpCandidates ?? [],
    skillImprovementEvidence: input.skillImprovementEvidence ?? [],
    sourceRefs,
    contentHashes: input.contentHashes,
  });
}

export function validateExecutionPlatformCloseoutPack(pack: unknown): WorkEpisodeOutcomePack {
  return validateWorkEpisodeOutcomePack(pack);
}

export class ExecutionPlatformWorkEpisodeCloseoutRepository {
  private readonly now: () => Date;
  private readonly artifactRoot: string;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: ExecutionPlatformCloseoutOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.artifactRoot = resolveExecutionPlatformCloseoutArtifactRoot(options);
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_CLOSEOUT_METADATA_BYTES;
  }

  async buildCloseoutInputFromRuntimeJobEvidence(
    input: EmitExecutionPlatformCloseoutInput,
  ): Promise<ExecutionPlatformCloseoutInput> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    if (!job) {
      throw new Error(`runtime job not found: ${input.runtimeJobId}`);
    }
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    const events = await this.runtimeJobs.listEvents(input.runtimeJobId, 200);
    const smokeResult = findLatestLiveSmokeResult(artifacts);
    const payload = isCodexBridgeJobPayload(job.payload) ? job.payload : null;
    const sourceRefs = sourceRefsFromJob({
      job,
      artifacts,
      events,
      smokeResult,
      extraRefs: input.sourceRefs,
    });
    return {
      runtimeJobId: job.jobId,
      runtimeJobState: job.state,
      runtime: smokeResult?.commandExecuted ? "codex" : "mixed",
      projectId: "execution-platform",
      sessionKey: smokeResult?.sessionId ?? payload?.prompt.promptId,
      completedAt:
        smokeResult?.completedAt ?? job.completedAt?.toISOString() ?? this.now().toISOString(),
      outcomeStatus: smokeResult?.successCriteria.smokeSucceeded
        ? "completed"
        : statusFromRuntimeJob(job),
      workType: smokeResult ? "proof" : "meta_infrastructure",
      primarySystemArea: "Execution Platform",
      completedObjective:
        payload?.prompt.objective ??
        (smokeResult
          ? "Run the local Codex observe-only smoke through Execution Platform."
          : undefined),
      userGoal:
        payload?.prompt.objective ??
        "Summarize Execution Platform runtime evidence into a structured closeout pack.",
      workSummary: defaultWorkSummary({
        job,
        smokeResult,
        artifactCount: artifacts.length,
        eventCount: events.length,
      }),
      finalOutcome: defaultFinalOutcome({ smokeResult, job }),
      smokeResult: smokeResult ?? undefined,
      filesTouched: input.filesTouched ?? [],
      testsRun: [...(input.testsRun ?? []), ...testsFromSmoke(smokeResult)],
      failuresAndFixes: [...(input.failuresAndFixes ?? []), ...failureFromSmoke(smokeResult)],
      unresolvedQuestions: input.unresolvedQuestions ?? [],
      followUpCandidates: input.followUpCandidates ?? [
        {
          title: "Implement Pause Redirect Cancel Control Bridge",
          rationale:
            "The recent runtime substrate mismatch shows oversight needs a durable way to pause and redirect a separate executor session.",
          sourceRefs: [`runtime-job://${job.jobId}`],
        },
      ],
      skillImprovementEvidence: input.skillImprovementEvidence ?? [
        {
          workflowName: "Work Queue UX Review",
          evidence:
            "Meaningful Execution Platform runs need a structured Work Episode Outcome Pack before proactivity or skill review.",
          suggestedDirection:
            "Check for closeout pack evidence before reviewing Work Queue, proactivity, or skill output.",
          sourceRefs: [`runtime-job://${job.jobId}`],
        },
      ],
      artifactRefs: artifacts.map((artifact) => `runtime-artifact://${artifact.artifactId}`),
      workQueueLinkRefs: payload?.workQueueLink
        ? [`work-queue://${payload.workQueueLink.workItemId}`]
        : [],
      sourceRefs,
    };
  }

  async emitCloseoutForRuntimeJob(
    input: EmitExecutionPlatformCloseoutInput,
  ): Promise<EmitExecutionPlatformCloseoutResult> {
    const closeoutInput =
      input.closeout ?? (await this.buildCloseoutInputFromRuntimeJobEvidence(input));
    const mergedInput: ExecutionPlatformCloseoutInput = {
      ...closeoutInput,
      filesTouched: input.filesTouched ?? closeoutInput.filesTouched,
      testsRun: input.testsRun ?? closeoutInput.testsRun,
      failuresAndFixes: input.failuresAndFixes ?? closeoutInput.failuresAndFixes,
      unresolvedQuestions: input.unresolvedQuestions ?? closeoutInput.unresolvedQuestions,
      followUpCandidates: input.followUpCandidates ?? closeoutInput.followUpCandidates,
      skillImprovementEvidence:
        input.skillImprovementEvidence ?? closeoutInput.skillImprovementEvidence,
      sourceRefs: unique([...(closeoutInput.sourceRefs ?? []), ...(input.sourceRefs ?? [])], 24),
    };
    const pack = buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout(mergedInput);
    const existingCloseout = await this.findExistingCloseoutForPack({
      runtimeJobId: input.runtimeJobId,
      smokeResult: mergedInput.smokeResult,
    });
    if (existingCloseout) {
      const existingPack = await readExistingCloseoutPack(existingCloseout.metadata);
      return {
        closeoutInput: mergedInput,
        pack: existingPack,
        packArtifact: {
          artifactRoot: existingCloseout.metadata.artifactRoot,
          jsonPath: existingCloseout.metadata.packPath,
          markdownPath: existingCloseout.metadata.markdownPath,
          packHash: existingCloseout.metadata.packHash,
          promptPersisted: false,
          rawResponsePersisted: false,
          rawFullTranscriptPersisted: false,
        },
        runtimeArtifact: existingCloseout.artifact,
        eligibility: existingCloseout.metadata.eligibility,
        metadata: existingCloseout.metadata,
      };
    }
    const packArtifact = await writeWorkEpisodeOutcomePackArtifact(pack, {
      artifactRoot: input.artifactRoot ?? this.artifactRoot,
      timestamp: pack.completedAt,
    });
    const eligibility = evaluateWorkEpisodeOutcomePackEligibility(pack);
    const discoverableByModelMemory = await this.isPackDiscoverable(
      pack,
      packArtifact.artifactRoot,
    );
    const metadata: ExecutionPlatformCloseoutArtifactMetadata = {
      artifactKind: "execution_platform_work_episode_closeout",
      runtimeJobId: input.runtimeJobId,
      episodeId: pack.episodeId,
      packHash: packArtifact.packHash,
      packPath: packArtifact.jsonPath,
      markdownPath: packArtifact.markdownPath,
      artifactRoot: packArtifact.artifactRoot,
      eligibility,
      promptPersisted: false,
      rawResponsePersisted: false,
      rawFullTranscriptPersisted: false,
      discoverableByModelMemory,
      emittedAt: this.now().toISOString(),
      sourceLiveSmokeRunId: mergedInput.smokeResult?.liveSmokeRunId ?? null,
      sourceRequestId: mergedInput.smokeResult?.requestId ?? null,
      sourcePackHash: pack.contentHashes[0] ?? null,
    };
    const statResult = await stat(packArtifact.jsonPath);
    const runtimeArtifact = await this.attachCloseoutArtifact({
      jobId: input.runtimeJobId,
      metadata,
      sizeBytes: statResult.size,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: CLOSEOUT_EVENT_TYPE,
      data: {
        episodeId: metadata.episodeId,
        packHash: metadata.packHash,
        eligibility: metadata.eligibility,
        artifactId: runtimeArtifact.artifactId,
        discoverableByModelMemory,
      },
    });
    return {
      closeoutInput: mergedInput,
      pack,
      packArtifact,
      runtimeArtifact,
      eligibility,
      metadata,
    };
  }

  async readCloseoutStatus(runtimeJobId: string): Promise<ExecutionPlatformCloseoutStatus> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    const artifacts = job ? await this.runtimeJobs.listArtifacts(runtimeJobId) : [];
    const closeoutArtifacts = artifacts.filter(
      (artifact) => artifact.artifactType === CLOSEOUT_ARTIFACT_TYPE,
    );
    const latest = closeoutArtifacts.at(-1) ?? null;
    const metadata = latest
      ? (latest.metadata as unknown as ExecutionPlatformCloseoutArtifactMetadata)
      : null;
    const closeoutRequired = job ? this.isCloseoutRequired(job, artifacts) : false;
    const closeoutPresent = Boolean(latest);
    const closeoutEligible = metadata?.eligibility.reviewEligible === true;
    const closeoutSafe = isSafeCloseoutMetadata(metadata);
    const artifactPointerPersisted = Boolean(latest?.uri && metadata?.packPath);
    const discoverableByModelMemory = metadata?.discoverableByModelMemory === true;
    const consumedOrReviewedByModelMemory = artifacts.some(
      (artifact) =>
        artifact.artifactType === "execution_platform.work_episode_outcome_pack_reviewed" ||
        artifact.artifactType === "model_memory.outcome_pack_candidate_review",
    );
    const blockingReasons: string[] = [];
    if (!job) {
      blockingReasons.push("runtime_job_not_found");
    }
    if (closeoutRequired && !closeoutPresent) {
      blockingReasons.push("work_episode_closeout_missing");
    }
    if (closeoutPresent && !closeoutEligible) {
      blockingReasons.push("work_episode_closeout_not_eligible");
    }
    if (closeoutPresent && !closeoutSafe) {
      blockingReasons.push("work_episode_closeout_unsafe");
    }
    if (closeoutPresent && !artifactPointerPersisted) {
      blockingReasons.push("work_episode_closeout_pointer_missing");
    }
    if (closeoutPresent && !discoverableByModelMemory) {
      blockingReasons.push("work_episode_closeout_not_discoverable");
    }
    return {
      runtimeJobId,
      closeoutPresent,
      closeoutRequired,
      closeoutEligible,
      closeoutSafe,
      artifactPointerPersisted,
      discoverableByModelMemory,
      consumedOrReviewedByModelMemory,
      blockingReasons,
      latestArtifact: latest,
      metadata,
    };
  }

  async produceCloseoutGateReport(
    runtimeJobId: string,
  ): Promise<ExecutionPlatformCloseoutGateReport> {
    const status = await this.readCloseoutStatus(runtimeJobId);
    const allowed = status.blockingReasons.length === 0;
    return {
      runtimeJobId,
      closeoutRequired: status.closeoutRequired,
      allowed,
      pauseOrRedirectWorthy: !allowed && status.closeoutRequired,
      blockingReasons: status.blockingReasons,
      status,
    };
  }

  async produceNextRunCloseoutGateReport(
    previousRuntimeJobId: string,
  ): Promise<ExecutionPlatformNextRunCloseoutGateReport> {
    const report = await this.produceCloseoutGateReport(previousRuntimeJobId);
    return {
      ...report,
      previousRuntimeJobId,
      nextExecutionAllowed: report.allowed,
    };
  }

  async produceCloseoutOperatorSummary(runtimeJobId: string): Promise<JsonValue> {
    const status = await this.readCloseoutStatus(runtimeJobId);
    return boundCloseoutMetadata({
      runtimeJobId,
      closeoutPresent: status.closeoutPresent,
      closeoutRequired: status.closeoutRequired,
      closeoutEligible: status.closeoutEligible,
      discoverableByModelMemory: status.discoverableByModelMemory,
      consumedOrReviewedByModelMemory: status.consumedOrReviewedByModelMemory,
      blockingReasons: status.blockingReasons,
      packPath: status.metadata?.packPath ?? null,
      nextStep: status.blockingReasons.length
        ? "emit_or_fix_work_episode_outcome_pack"
        : "proceed_to_pause_redirect_cancel_control_bridge",
    });
  }

  private async attachCloseoutArtifact(input: {
    jobId: string;
    metadata: ExecutionPlatformCloseoutArtifactMetadata;
    sizeBytes: number;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundCloseoutMetadata(input.metadata as unknown as JsonValue);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "work episode closeout metadata");
    return this.runtimeJobs.attachArtifact({
      jobId: input.jobId,
      artifactType: CLOSEOUT_ARTIFACT_TYPE,
      storageKind: "file_pointer",
      uri: input.metadata.packPath,
      contentType: "application/json",
      sizeBytes: input.sizeBytes,
      sha256: input.metadata.packHash,
      metadata: bounded,
    });
  }

  private async findExistingCloseoutForPack(input: {
    runtimeJobId: string;
    packHash?: string | null;
    smokeResult?: ExecutionPlatformCloseoutInput["smokeResult"];
  }): Promise<{
    artifact: RuntimeJobArtifact;
    metadata: ExecutionPlatformCloseoutArtifactMetadata;
  } | null> {
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    for (const artifact of artifacts.toReversed()) {
      if (artifact.artifactType !== CLOSEOUT_ARTIFACT_TYPE) {
        continue;
      }
      const metadata = artifact.metadata as unknown as ExecutionPlatformCloseoutArtifactMetadata;
      if (
        !closeoutMatchesPack({
          metadata,
          packHash: input.packHash,
          smokeResult: input.smokeResult,
        })
      ) {
        continue;
      }
      if (
        !isSafeCloseoutMetadata(metadata) ||
        !metadata.eligibility.reviewEligible ||
        !metadata.discoverableByModelMemory
      ) {
        throw new Error("matching work episode closeout exists but is not valid for reuse");
      }
      return { artifact, metadata };
    }
    return null;
  }

  private isCloseoutRequired(job: RuntimeJob, artifacts: RuntimeJobArtifact[]): boolean {
    return (
      job.jobType === CODEX_BRIDGE_JOB_TYPE ||
      artifacts.some((artifact) => artifact.artifactType === "codex_bridge.live_smoke_result")
    );
  }

  private async isPackDiscoverable(
    pack: WorkEpisodeOutcomePack,
    artifactRoot: string,
  ): Promise<boolean> {
    const records = await discoverWorkEpisodeOutcomePackArtifacts([artifactRoot]);
    return records.some((record) => record.pack.episodeId === pack.episodeId);
  }
}

export const EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_ARTIFACT_TYPE = CLOSEOUT_ARTIFACT_TYPE;
export const EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_EVENT_TYPE = CLOSEOUT_EVENT_TYPE;
