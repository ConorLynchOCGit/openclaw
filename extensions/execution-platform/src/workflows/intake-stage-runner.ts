import { createHash } from "node:crypto";
import type {
  DynamicCodingTeamModelCallProgressEvent,
  DynamicCodingTeamModelClient,
  DynamicCodingTeamToolTurnInput,
} from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { BoundaryReplayCheckpointKind } from "./boundary-replay-checkpoints.ts";
import {
  executeModelToolTurn,
  type ModelToolTurnParallelismPolicy,
  type ModelToolTurnTransportRequirement,
} from "./model-tool-turn-transport.ts";
import {
  REQUIREMENT_MAP_ARTIFACT_TYPE,
  RequirementMapSchema,
  applyRequirementConsolidationToolCalls,
  applyRequirementExtractionToolCalls,
  applyRequirementRepairToolCalls,
  buildRequirementPromptWindows,
  clusterRequirementCandidatesBySourceWindow,
  compileRequirementMapFromCoverage,
  createRequirementCoverageDraft,
  requirementNativeToolDefinitions,
  requirementToolCallFromNativeToolCall,
  summarizeRequirementMapForManifest,
  type RequirementMap,
  type RequirementCoverageDraft,
  type RequirementNativeToolId,
  type RequirementPromptWindow,
  type RequirementToolCall,
  type RequirementToolCompileResult,
} from "./requirement-map.ts";
import {
  SOURCE_PROMPT_ARTIFACT_TYPE,
  SOURCE_PROMPT_WINDOW_ARTIFACT_TYPE,
  buildSourcePromptArtifact,
  buildSourcePromptWindowArtifact,
  type SourcePromptArtifact,
} from "./source-prompt-context.ts";

type IntakeProgress = {
  stage: string;
  status: "started" | "completed" | "needs_review" | "failed" | "waiting_for_human";
  artifactRefs?: string[];
  reasonCodes?: string[];
  currentPhase?: string | null;
  currentObjective?: string | null;
  blockerSummary?: string | null;
  modelRef?: string | null;
  providerPath?: string | null;
  evidenceProducedRefs?: string[];
  commitmentIdsAdvanced?: string[];
  remainingOpenCommitmentIds?: string[];
  nextDecisionNeeded?: string | null;
  eli5Progress?: string | null;
  schedulerPhase?: string | null;
  toolCallTelemetry?: JsonValue | null;
};

type BoundaryCheckpointInput = {
  checkpointKind: BoundaryReplayCheckpointKind | "requirement_map";
  acceptedArtifactRefs?: string[];
  upstreamArtifactRefs?: string[];
  currentCommitmentIds?: string[];
  openCommitmentIds?: string[];
  satisfiedCommitmentIds?: string[];
  replayContinuationMode?: "continue_scheduler" | "repair_boundary" | "finalize_closeout";
  replayStartPolicy?: "allowed_from_checkpoint" | "blocked_until_repair" | "diagnostic_only";
  replaySafetyStatus?: "safe_to_replay" | "blocked" | "needs_review";
  reasonCodes?: string[];
};

export type IntakeStageRunnerResult = {
  requirementMap: RequirementMap | null;
  requirementMapRef: string | null;
  sourcePromptArtifactRef: string | null;
  artifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type IntakeStageRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  now: () => Date;
  missionModelClient: DynamicCodingTeamModelClient | null;
  attachProgress: (input: IntakeProgress) => Promise<string>;
  recordBoundaryCheckpoint: (input: BoundaryCheckpointInput) => Promise<string>;
  attachModelCallProgress: (input: {
    event: DynamicCodingTeamModelCallProgressEvent;
    stage: string;
    schedulerPhase: string;
    currentObjective: string;
    nextDecisionNeeded: string;
  }) => Promise<void>;
};

export type IntakeStageRunnerRunInput = {
  runtimeJobId: string;
  workItemId: string | null;
  graphId: string;
  teamRunId: string;
  objective: string;
  objectiveForModel: string;
  sourcePromptResolution: JsonValue;
  sourcePromptArtifact?: SourcePromptArtifact | null;
  repoScopeRefs: string[];
  validationCommandRefs: string[];
  checkpointReplay?: JsonValue | null;
};

type RequirementMapPhase =
  | "window_extraction"
  | "candidate_consolidation"
  | "requirement_repair"
  | "requirement_map_compile";

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveIntEnv(
  name: string,
  fallback: number,
  options: { max?: number } = {},
): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, options.max ?? parsed);
}

function runtimeNeedsReviewError(message: string, reasonCodes: string[]): Error {
  const error = new Error(message);
  (error as Error & { runtimeNeedsReviewReasonCodes?: string[] }).runtimeNeedsReviewReasonCodes =
    reasonCodes.slice(0, 80);
  return error;
}

function requirementAllowedToolIdsForPhase(
  phase: RequirementMapPhase,
): readonly RequirementNativeToolId[] {
  if (phase === "window_extraction") {
    return [
      "requirement.record_candidate",
      "requirement.record_no_requirement",
      "source_prompt.expand_window",
      "source_prompt.open_adjacent",
    ];
  }
  if (phase === "candidate_consolidation") {
    return ["requirement.merge", "requirement.split", "requirement.retire", "requirement.promote"];
  }
  if (phase === "requirement_repair") {
    return ["requirement.set_role", "requirement.attach_source_ref"];
  }
  return [];
}

function requirementPhaseTransportDescriptor(phase: RequirementMapPhase): {
  requiredTransport: ModelToolTurnTransportRequirement;
  parallelismPolicy: ModelToolTurnParallelismPolicy;
  maxAcceptedToolCalls: number;
} {
  if (phase === "window_extraction") {
    return {
      requiredTransport: "native_multi_tool_turn",
      parallelismPolicy: "parallel_focused_sessions",
      maxAcceptedToolCalls: 16,
    };
  }
  if (phase === "candidate_consolidation") {
    return {
      requiredTransport: "native_multi_tool_turn",
      parallelismPolicy: "single_turn_multi_tool",
      maxAcceptedToolCalls: 48,
    };
  }
  if (phase === "requirement_repair") {
    return {
      requiredTransport: "native_multi_tool_turn",
      parallelismPolicy: "sequential_repair",
      maxAcceptedToolCalls: 32,
    };
  }
  return {
    requiredTransport: "native_single_tool",
    parallelismPolicy: "sequential_repair",
    maxAcceptedToolCalls: 1,
  };
}

function requirementToolTelemetry(input: {
  draft: RequirementCoverageDraft | null;
  compile?: RequirementToolCompileResult | null;
  phase: RequirementMapPhase;
  turnIndex: number;
  selectedToolNames?: string[];
  latencyMs?: number;
}): JsonValue {
  const missingFieldEntries = Object.entries(input.compile?.missingFieldsByPromotionId ?? {})
    .slice(0, 24)
    .map(([promotionId, missingFields]) => [
      promotionId,
      Array.isArray(missingFields) ? missingFields.slice(0, 12) : missingFields,
    ]);
  return {
    artifactKind: "requirement_map_tool_call_telemetry",
    schemaVersion: "execution-platform.tool-call-telemetry.v1",
    stage: "requirement_map_authoring",
    phase: input.phase,
    turnIndex: input.turnIndex,
    compileStatus: input.compile?.status ?? null,
    candidateCount: input.draft?.candidates.length ?? 0,
    promotionCount: input.draft?.promotions.length ?? 0,
    noRequirementReceiptCount: input.draft?.noRequirementReceipts.length ?? 0,
    retiredCandidateCount: input.draft?.retiredCandidateIds.length ?? 0,
    appliedToolNames: (input.draft?.appliedToolNames ?? []).slice(-64),
    selectedToolNames: (input.selectedToolNames ?? []).slice(0, 64),
    rejectedToolCalls: (input.draft?.rejectedToolCalls ?? []).slice(-16),
    missingFieldsByPromotionId: Object.fromEntries(missingFieldEntries),
    blockedPromotionIds: (input.compile?.blockedPromotionIds ?? []).slice(0, 32),
    reasonCodes: (input.compile?.reasonCodes ?? input.draft?.reasonCodes ?? []).slice(-80),
    latencyMs: input.latencyMs ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } as JsonValue;
}

function requirementRepairNoProgressSignature(input: {
  draft: RequirementCoverageDraft;
  compile: RequirementToolCompileResult | null;
}): string {
  const signature = {
    candidateCount: input.draft.candidates.length,
    promotionCount: input.draft.promotions.length,
    retiredCandidateIds: input.draft.retiredCandidateIds.toSorted(),
    blockedPromotionIds: (input.compile?.blockedPromotionIds ?? []).toSorted(),
    missingFieldsByPromotionId: Object.fromEntries(
      Object.entries(input.compile?.missingFieldsByPromotionId ?? {})
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([promotionId, fields]) => [promotionId, [...fields].toSorted()]),
    ),
    draftHash: sha256Text(
      JSON.stringify({
        candidates: input.draft.candidates.map((candidate) => [
          candidate.candidateId,
          candidate.text,
          candidate.sourceRefs,
          candidate.sourceWindowRefs,
          candidate.retired,
        ]),
        promotions: input.draft.promotions.map((promotion) => [
          promotion.promotionId,
          promotion.sourceCandidateIds,
          promotion.text,
          promotion.role,
          promotion.sourceRefs,
        ]),
      }),
    ),
  };
  return sha256Text(JSON.stringify(signature));
}

export class IntakeStageRunner {
  constructor(private readonly options: IntakeStageRunnerOptions) {}

  private async runRequirementToolTurn(input: {
    phase: RequirementMapPhase;
    modelRef: string;
    providerPath: string;
    systemPrompt: string;
    userPayload: JsonValue;
    tools: ReturnType<typeof requirementNativeToolDefinitions>;
    allowedToolNames: string[];
    maxOutputTokens: number;
    timeoutMs: number;
    maxAttempts?: number;
    reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    taskClass: DynamicCodingTeamToolTurnInput["taskClass"];
    modelTaskCallSite: string;
    progress: {
      objectiveSummary: string;
      reasonCodes: string[];
      onEvent: (event: DynamicCodingTeamModelCallProgressEvent) => void | Promise<void>;
    };
  }): Promise<{
    calls: RequirementToolCall[];
    selectedToolNames: string[];
    rejectedToolCallCount: number;
    latencyMs: number;
    providerDiagnostics: JsonValue;
  }> {
    const descriptor = requirementPhaseTransportDescriptor(input.phase);
    let response: Awaited<ReturnType<typeof executeModelToolTurn>>;
    try {
      response = await executeModelToolTurn({
        modelClient: this.options.missionModelClient,
        request: {
          owner: "intake",
          phaseId: `requirement_map.${input.phase}`,
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          systemPrompt: input.systemPrompt,
          userPayload: input.userPayload,
          tools: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
          allowedToolNames: input.allowedToolNames,
          requiredTransport: descriptor.requiredTransport,
          parallelismPolicy: descriptor.parallelismPolicy,
          maxAcceptedToolCalls: descriptor.maxAcceptedToolCalls,
          maxOutputTokens: input.maxOutputTokens,
          timeoutMs: input.timeoutMs,
          maxAttempts: input.maxAttempts,
          reasoningEffort: input.reasoningEffort,
          taskClass: input.taskClass,
          modelTaskCallSite: input.modelTaskCallSite,
          telemetryBudget: {
            inlineToolCallNameLimit: 32,
            inlineRejectedCallLimit: 12,
          },
          progress: input.progress,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith("model_tool_turn_no_accepted_tools:")) {
        throw error;
      }
      return {
        calls: [],
        selectedToolNames: [],
        rejectedToolCallCount: 0,
        latencyMs: 0,
        providerDiagnostics: {
          artifactKind: "model_tool_turn_provider_diagnostics",
          owner: "intake",
          phaseId: `requirement_map.${input.phase}`,
          status: "no_accepted_tool_calls",
          reasonCodes: ["requirement_map_native_tool_turn_no_accepted_calls"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      };
    }
    const calls = response.acceptedToolCalls
      .map((toolCall) =>
        requirementToolCallFromNativeToolCall({
          providerToolName: toolCall.toolName,
          toolArguments: toolCall.toolArguments,
        }),
      )
      .filter((call): call is RequirementToolCall => Boolean(call));
    return {
      calls,
      selectedToolNames: calls.map((call) => call.tool),
      rejectedToolCallCount: response.rejectedToolCalls.length,
      latencyMs: response.latencyMs,
      providerDiagnostics: response.providerDiagnostics,
    };
  }

  async run(input: IntakeStageRunnerRunInput): Promise<IntakeStageRunnerResult> {
    const sourcePromptInput: IntakeStageRunnerRunInput = {
      ...input,
      sourcePromptArtifact: this.resolveSourcePromptArtifact(input),
    };
    const sourcePromptArtifactRef = await this.attachSourcePromptArtifact(sourcePromptInput);
    await this.assertSourcePromptArtifactReadyForExecution(
      sourcePromptInput,
      sourcePromptArtifactRef,
    );
    const replayRequirementMap = await this.loadAcceptedReplayRequirementMap(sourcePromptInput);
    const requirementMap =
      replayRequirementMap ?? (await this.authorRequirementMap(sourcePromptInput));
    return {
      requirementMap,
      requirementMapRef: requirementMap?.mapRef ?? null,
      sourcePromptArtifactRef,
      artifactRefs: [
        ...(sourcePromptArtifactRef ? [sourcePromptArtifactRef] : []),
        ...(requirementMap?.mapRef ? [requirementMap.mapRef] : []),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  private resolveSourcePromptArtifact(input: IntakeStageRunnerRunInput): SourcePromptArtifact {
    if (input.sourcePromptArtifact) {
      return input.sourcePromptArtifact;
    }
    const record = recordValue(input.sourcePromptResolution);
    const statusValue = typeof record.status === "string" ? record.status : "not_present";
    const status = ["not_present", "resolved", "unresolved", "unsupported"].includes(statusValue)
      ? (statusValue as "not_present" | "resolved" | "unresolved" | "unsupported")
      : "not_present";
    const promptHash = typeof record.promptHash === "string" ? record.promptHash : null;
    const promptLength =
      typeof record.promptLength === "number" && Number.isFinite(record.promptLength)
        ? Math.max(0, Math.floor(record.promptLength))
        : null;
    return buildSourcePromptArtifact({
      promptText: status === "resolved" ? input.objectiveForModel : null,
      resolution: {
        status,
        reasonCodes: Array.isArray(record.reasonCodes)
          ? record.reasonCodes.filter((item): item is string => typeof item === "string")
          : [`source_prompt_resolution:${status}`],
        promptHash,
        promptLength,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
  }

  private async attachSourcePromptArtifact(
    input: IntakeStageRunnerRunInput,
  ): Promise<string | null> {
    const artifact = input.sourcePromptArtifact;
    if (!artifact) {
      return null;
    }
    const ref = `runtime-job://${input.runtimeJobId}/source-prompt/artifact/${artifact.promptHash.slice(0, 16)}`;
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.runtimeJobId,
      artifactType: SOURCE_PROMPT_ARTIFACT_TYPE,
      uri: ref,
      contentType: "application/json",
      body: artifact as unknown as JsonValue,
      boundedSummary: `Source prompt artifact ${artifact.resolutionStatus}: ${artifact.promptLength} byte(s), body ref ${artifact.sourcePromptBodyRef}.`,
      targetCommitmentIds: [],
      resourcePacketKind: "source_prompt_artifact",
      readinessStatus: artifact.resolutionStatus,
      reasonCodes: [
        `source_prompt_artifact:${artifact.resolutionStatus}`,
        "source_prompt_artifact_owned_by_intake_stage_runner",
        "source_prompt_body_ref_is_requirement_map_source_of_truth",
        ...artifact.reasonCodes.slice(0, 12),
      ],
      metadata: {
        artifactKind: SOURCE_PROMPT_ARTIFACT_TYPE,
        promptHash: artifact.promptHash,
        promptLength: artifact.promptLength,
        sourcePromptBodyRef: artifact.sourcePromptBodyRef,
        resolutionStatus: artifact.resolutionStatus,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.attachProgress({
      stage: "source_prompt_artifact",
      status: artifact.resolutionStatus === "resolved" ? "completed" : "needs_review",
      artifactRefs: [ref],
      reasonCodes: [
        `source_prompt_artifact:${artifact.resolutionStatus}`,
        "source_prompt_artifact_owned_by_intake_stage_runner",
        "source_prompt_body_ref_is_requirement_map_source_of_truth",
        ...artifact.reasonCodes.slice(0, 8),
      ],
      currentPhase: "source_prompt_ready",
      currentObjective: "Expose a stable source prompt body ref before RequirementMap authoring.",
      evidenceProducedRefs: [ref],
      eli5Progress:
        artifact.resolutionStatus === "resolved"
          ? "OpenClaw persisted a bounded source prompt artifact pointer before RequirementMap intake."
          : "OpenClaw could not resolve the source prompt body for RequirementMap intake.",
      schedulerPhase: "source_prompt_ready",
    });
    return ref;
  }

  private async attachSourcePromptWindowArtifacts(input: {
    source: IntakeStageRunnerRunInput;
    windows: RequirementPromptWindow[];
  }): Promise<string[]> {
    if (input.windows.length === 0) {
      return [];
    }
    const refs = await Promise.all(
      input.windows.map(async (window) => {
        const body = buildSourcePromptWindowArtifact({
          windowRef: window.windowRef,
          sourcePromptBodyRef: window.sourcePromptBodyRef,
          sourcePromptHash: window.promptHash,
          start: window.start,
          end: window.end,
          promptLength: input.source.objectiveForModel.length,
          text: window.text,
          boundarySensitive: window.boundarySensitive,
        });
        await this.options.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: input.source.runtimeJobId,
          artifactType: SOURCE_PROMPT_WINDOW_ARTIFACT_TYPE,
          uri: body.windowRef,
          contentType: "application/json",
          body: body as unknown as JsonValue,
          boundedSummary: `Source prompt window ${body.start}-${body.end} of ${body.promptLength} byte(s).`,
          targetCommitmentIds: [],
          resourcePacketKind: "source_prompt_window",
          readinessStatus: "available",
          reasonCodes: [
            "source_prompt_window_artifact_attached",
            "source_prompt_window_owned_by_intake_stage_runner",
            ...(body.boundarySensitive ? ["source_prompt_window_boundary_sensitive"] : []),
          ],
          metadata: {
            artifactKind: SOURCE_PROMPT_WINDOW_ARTIFACT_TYPE,
            windowRef: body.windowRef,
            sourcePromptBodyRef: body.sourcePromptBodyRef,
            sourcePromptHash: body.sourcePromptHash,
            start: body.start,
            end: body.end,
            promptLength: body.promptLength,
            byteCount: body.byteCount,
            boundarySensitive: body.boundarySensitive,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        });
        return body.windowRef;
      }),
    );
    await this.options.attachProgress({
      stage: "source_prompt_window_artifacts",
      status: "completed",
      artifactRefs: refs.slice(0, 40),
      reasonCodes: [
        "source_prompt_window_artifacts_attached",
        `source_prompt_window_artifact_count:${refs.length}`,
        "source_prompt_windows_are_bounded_prompt_material_for_downstream_agents",
      ],
      currentPhase: "source_prompt_window_artifacts",
      currentObjective:
        "Persist bounded source prompt windows so downstream OpenClaw node agents can hydrate exact source refs.",
      nextDecisionNeeded: "requirement_map_window_extraction",
      schedulerPhase: "source_prompt_window_artifacts",
    });
    return refs;
  }

  private async assertSourcePromptArtifactReadyForExecution(
    input: IntakeStageRunnerRunInput,
    sourcePromptArtifactRef: string | null,
  ): Promise<void> {
    const artifact = input.sourcePromptArtifact;
    const record = recordValue(input.sourcePromptResolution);
    const promptLength =
      typeof record.promptLength === "number" && Number.isFinite(record.promptLength)
        ? Math.max(0, Math.floor(record.promptLength))
        : input.objectiveForModel.length;
    const longPrompt = promptLength > 8_000;
    const unresolved =
      !artifact ||
      artifact.resolutionStatus !== "resolved" ||
      !artifact.sourcePromptBodyRef ||
      input.objectiveForModel.trim().length === 0;
    if (!longPrompt || !unresolved) {
      return;
    }
    await this.options.attachProgress({
      stage: "source_prompt_artifact",
      status: "needs_review",
      artifactRefs: sourcePromptArtifactRef ? [sourcePromptArtifactRef] : [],
      reasonCodes: [
        "source_prompt_artifact_body_missing_for_long_prompt_execution",
        "intake_blocked_before_requirement_map",
      ],
      currentPhase: "source_prompt_unresolved",
      blockerSummary:
        "Long-prompt execution requires a replayable source prompt body artifact before RequirementMap authoring.",
      schedulerPhase: "intake_source_prompt_blocked",
    });
    throw runtimeNeedsReviewError("source_prompt_artifact_body_missing_for_long_prompt_execution", [
      "source_prompt_artifact_body_missing_for_long_prompt_execution",
      "intake_blocked_before_requirement_map",
    ]);
  }

  private async authorRequirementMap(input: IntakeStageRunnerRunInput): Promise<RequirementMap> {
    if (!this.options.missionModelClient?.executeProviderToolTurn) {
      throw runtimeNeedsReviewError("requirement_map_native_tool_client_missing", [
        "requirement_map_native_tool_client_missing",
        "requirement_map_prompt_only_json_fallback_forbidden",
      ]);
    }
    const artifact = input.sourcePromptArtifact;
    if (!artifact || artifact.resolutionStatus !== "resolved") {
      throw runtimeNeedsReviewError("requirement_map_source_prompt_unresolved", [
        "requirement_map_source_prompt_unresolved",
      ]);
    }
    const extractionModelRef =
      process.env.OPENCLAW_REQUIREMENT_MAP_EXTRACTION_MODEL_REF?.trim() ||
      process.env.OPENCLAW_REQUIREMENT_MAP_AUTHOR_MODEL_REF?.trim() ||
      "qwen/qwen3-coder-next";
    const extractionProviderPath =
      process.env.OPENCLAW_REQUIREMENT_MAP_EXTRACTION_PROVIDER_PATH?.trim() ||
      process.env.OPENCLAW_REQUIREMENT_MAP_AUTHOR_PROVIDER_PATH?.trim() ||
      "openrouter";
    const repairModelRef =
      process.env.OPENCLAW_REQUIREMENT_MAP_REPAIR_MODEL_REF?.trim() || extractionModelRef;
    const repairProviderPath =
      process.env.OPENCLAW_REQUIREMENT_MAP_REPAIR_PROVIDER_PATH?.trim() || extractionProviderPath;
    const timeoutMs = readPositiveIntEnv("OPENCLAW_REQUIREMENT_MAP_AUTHOR_TIMEOUT_MS", 180_000, {
      max: 600_000,
    });
    const extractionWindowChars = readPositiveIntEnv(
      "OPENCLAW_REQUIREMENT_MAP_WINDOW_CHARS",
      3_000,
      { max: 16_000 },
    );
    const extractionOverlapChars = readPositiveIntEnv(
      "OPENCLAW_REQUIREMENT_MAP_WINDOW_OVERLAP_CHARS",
      700,
      { max: 4_000 },
    );
    const maxWindowTurns = readPositiveIntEnv("OPENCLAW_REQUIREMENT_MAP_WINDOW_MAX_TURNS", 2, {
      max: 4,
    });
    const maxRepairTurns = readPositiveIntEnv("OPENCLAW_REQUIREMENT_MAP_REPAIR_MAX_TURNS", 2, {
      max: 6,
    });
    const mapId = `${input.teamRunId}:requirement-map`;
    const mapRefPrefix = `runtime-job://${input.runtimeJobId}/requirement-map/${sha256Text(mapId).slice(0, 16)}`;
    const windows = buildRequirementPromptWindows({
      promptText: input.objectiveForModel,
      promptHash: artifact.promptHash,
      sourcePromptBodyRef: artifact.sourcePromptBodyRef,
      windowChars: extractionWindowChars,
      overlapChars: extractionOverlapChars,
    });
    const sourcePromptWindowRefs = await this.attachSourcePromptWindowArtifacts({
      source: input,
      windows,
    });
    let draft = createRequirementCoverageDraft(windows);
    await this.options.attachProgress({
      stage: "requirement_map_authoring",
      status: "started",
      artifactRefs: sourcePromptWindowRefs.slice(0, 40),
      reasonCodes: [
        "requirement_map_window_plan_created",
        `requirement_map_window_count:${windows.length}`,
        "requirement_map_source_prompt_windows_persisted",
      ],
      currentPhase: "window_extraction",
      currentObjective:
        "Walk bounded source prompt windows and extract source-grounded obligation candidates.",
      nextDecisionNeeded: "requirement_map_window_extraction",
      modelRef: extractionModelRef,
      providerPath: extractionProviderPath,
      schedulerPhase: "window_extraction",
      toolCallTelemetry: requirementToolTelemetry({
        draft,
        phase: "window_extraction",
        turnIndex: 0,
      }),
    });

    const extractionResults = await Promise.all(
      windows.map((window, index) =>
        this.extractRequirementWindow({
          input,
          window,
          windowIndex: index,
          windowCount: windows.length,
          maxWindowTurns,
          timeoutMs,
          modelRef: extractionModelRef,
          providerPath: extractionProviderPath,
        }),
      ),
    );
    for (const result of extractionResults) {
      draft = applyRequirementExtractionToolCalls({
        draft,
        window: result.window,
        calls: result.calls,
      });
    }

    draft = await this.consolidateRequirementCandidates({
      input,
      artifact,
      mapId,
      draft,
      timeoutMs,
      modelRef: extractionModelRef,
      providerPath: extractionProviderPath,
    });

    let compile = compileRequirementMapFromCoverage({
      mapId,
      mapRefPrefix,
      sourcePromptBodyRef: artifact.sourcePromptBodyRef,
      sourcePromptHash: artifact.promptHash,
      sourcePromptLength: artifact.promptLength,
      draft,
    });
    await this.options.attachProgress({
      stage: "requirement_map_authoring",
      status: compile.status === "accepted" ? "completed" : "needs_review",
      reasonCodes: [
        compile.status === "accepted"
          ? "requirement_map_compile_accepted"
          : "requirement_map_compile_blocked_before_repair",
        ...compile.reasonCodes,
      ].slice(0, 80),
      currentPhase: "requirement_map_compile",
      currentObjective:
        "Compile source-grounded RequirementMap promotions before scheduler decomposition.",
      blockerSummary:
        compile.status === "accepted"
          ? null
          : "RequirementMap compile found missing fields and will run targeted native-tool repair.",
      nextDecisionNeeded:
        compile.status === "accepted"
          ? "requirement_map_persist"
          : "requirement_map_targeted_repair",
      modelRef: extractionModelRef,
      providerPath: extractionProviderPath,
      schedulerPhase: "requirement_map_compile",
      toolCallTelemetry: requirementToolTelemetry({
        draft,
        compile,
        phase: "requirement_map_compile",
        turnIndex: 0,
      }),
    });
    let previousRepairSignature =
      compile.status === "accepted"
        ? null
        : requirementRepairNoProgressSignature({ draft, compile });
    for (
      let repairTurn = 0;
      compile.status !== "accepted" && repairTurn < maxRepairTurns;
      repairTurn += 1
    ) {
      draft = await this.repairRequirementPromotions({
        input,
        artifact,
        mapId,
        draft,
        compile,
        turnIndex: repairTurn,
        timeoutMs,
        modelRef: repairModelRef,
        providerPath: repairProviderPath,
      });
      compile = compileRequirementMapFromCoverage({
        mapId,
        mapRefPrefix,
        sourcePromptBodyRef: artifact.sourcePromptBodyRef,
        sourcePromptHash: artifact.promptHash,
        sourcePromptLength: artifact.promptLength,
        draft,
      });
      await this.options.attachProgress({
        stage: "requirement_map_authoring",
        status: compile.status === "accepted" ? "completed" : "needs_review",
        reasonCodes: [
          compile.status === "accepted"
            ? "requirement_map_compile_accepted_after_repair"
            : "requirement_map_compile_still_blocked_after_repair",
          ...compile.reasonCodes,
        ].slice(0, 80),
        currentPhase: "requirement_map_compile",
        currentObjective: "Compile targeted RequirementMap repair before scheduler decomposition.",
        blockerSummary:
          compile.status === "accepted"
            ? null
            : "RequirementMap targeted repair did not yet satisfy the compile gate.",
        nextDecisionNeeded:
          compile.status === "accepted"
            ? "requirement_map_persist"
            : "requirement_map_targeted_repair",
        modelRef: repairModelRef,
        providerPath: repairProviderPath,
        schedulerPhase: "requirement_map_compile",
        toolCallTelemetry: requirementToolTelemetry({
          draft,
          compile,
          phase: "requirement_map_compile",
          turnIndex: repairTurn + 1,
        }),
      });
      const nextRepairSignature =
        compile.status === "accepted"
          ? null
          : requirementRepairNoProgressSignature({ draft, compile });
      if (nextRepairSignature && nextRepairSignature === previousRepairSignature) {
        await this.options.attachProgress({
          stage: "requirement_map_authoring",
          status: "needs_review",
          reasonCodes: [
            "requirement_map_no_progress_collapsed",
            ...(compile.reasonCodes ?? []),
          ].slice(0, 80),
          currentPhase: "requirement_repair_no_progress",
          currentObjective:
            "Stop repeated RequirementMap repair when blockers and draft state do not change.",
          blockerSummary:
            "RequirementMap targeted repair repeated the same typed blocker signature without improving the draft.",
          nextDecisionNeeded: "requirement_map_authoring_blocked",
          schedulerPhase: "requirement_repair_no_progress",
          toolCallTelemetry: requirementToolTelemetry({
            draft,
            compile,
            phase: "requirement_repair",
            turnIndex: repairTurn,
          }),
        });
        throw runtimeNeedsReviewError("requirement_map_no_progress_collapsed", [
          "requirement_map_no_progress_collapsed",
          ...compile.reasonCodes,
        ]);
      }
      previousRepairSignature = nextRepairSignature;
    }
    if (!compile?.requirementMap) {
      await this.options.attachProgress({
        stage: "requirement_map_authoring",
        status: "needs_review",
        reasonCodes: [
          "requirement_map_authoring_blocked",
          ...(compile?.reasonCodes ?? ["requirement_map_compile_not_attempted"]),
        ].slice(0, 80),
        currentPhase: "requirement_map_blocked",
        currentObjective: "Repair RequirementMap prompt coverage before scheduler decomposition.",
        blockerSummary:
          "RequirementMap native tool calls did not compile into a fully covered source-grounded intake product.",
        nextDecisionNeeded: "requirement_map_targeted_repair",
        schedulerPhase: "requirement_map_blocked",
        toolCallTelemetry: requirementToolTelemetry({
          draft,
          compile,
          phase: "requirement_repair",
          turnIndex: maxRepairTurns,
        }),
      });
      throw runtimeNeedsReviewError("requirement_map_authoring_blocked", [
        "requirement_map_authoring_blocked",
        ...(compile?.reasonCodes ?? []),
      ]);
    }
    const requirementMap = compile.requirementMap;
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.runtimeJobId,
      artifactType: REQUIREMENT_MAP_ARTIFACT_TYPE,
      uri: requirementMap.mapRef,
      contentType: "application/json",
      body: requirementMap as unknown as JsonValue,
      boundedSummary: `RequirementMap for ${input.graphId}: ${requirementMap.requirements.length} requirement(s), source prompt ${requirementMap.sourcePromptLength} byte(s).`,
      targetCommitmentIds: requirementMap.requirements.map(
        (requirement) => requirement.requirementId,
      ),
      resourcePacketKind: "requirement_map",
      readinessStatus: "accepted",
      reasonCodes: [
        "requirement_map_created",
        "requirement_map_native_tool_batch",
        ...requirementMap.reasonCodes.slice(0, 30),
      ],
      metadata: {
        artifactKind: REQUIREMENT_MAP_ARTIFACT_TYPE,
        mapId: requirementMap.mapId,
        mapRef: requirementMap.mapRef,
        mapHash: requirementMap.mapHash,
        sourcePromptBodyRef: requirementMap.sourcePromptBodyRef,
        sourcePromptHash: requirementMap.sourcePromptHash,
        sourcePromptLength: requirementMap.sourcePromptLength,
        requirementCount: requirementMap.requirements.length,
        coverage: requirementMap.coverage,
        requirementMapSummary: summarizeRequirementMapForManifest(requirementMap),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.recordBoundaryCheckpoint({
      checkpointKind: "requirement_map",
      acceptedArtifactRefs: [requirementMap.mapRef],
      currentCommitmentIds: requirementMap.requirements
        .map((requirement) => requirement.requirementId)
        .slice(0, 80),
      replayContinuationMode: "continue_scheduler",
      replayStartPolicy: "allowed_from_checkpoint",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: ["requirement_map_boundary_checkpoint_recorded"],
    });
    await this.options.attachProgress({
      stage: "requirement_map",
      status: "completed",
      artifactRefs: [requirementMap.mapRef],
      reasonCodes: [
        "requirement_map_created",
        "requirement_map_ready_for_scheduler",
        "requirement_map_full_prompt_coverage_complete",
        ...requirementMap.reasonCodes.slice(0, 20),
      ],
      currentPhase: "requirement_map_accepted",
      currentObjective: "Use RequirementMap as the only scheduler-facing semantic intake product.",
      evidenceProducedRefs: [requirementMap.mapRef],
      schedulerPhase: "requirement_map_ready",
      toolCallTelemetry: {
        artifactKind: "requirement_map_quality_diagnostic",
        schemaVersion: "execution-platform.requirement-map-quality.v1",
        summary: summarizeRequirementMapForManifest(requirementMap),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as JsonValue,
    });
    return requirementMap;
  }

  private promptWindowFromRange(input: {
    source: IntakeStageRunnerRunInput;
    baseWindow: RequirementPromptWindow;
    start: number;
    end: number;
  }): RequirementPromptWindow {
    const promptText = input.source.objectiveForModel;
    const start = Math.max(0, Math.min(input.start, promptText.length));
    const end = Math.max(start, Math.min(input.end, promptText.length));
    return {
      ...input.baseWindow,
      start,
      end,
      text: promptText.slice(start, end),
      boundarySensitive: start !== input.baseWindow.start || end !== input.baseWindow.end,
    };
  }

  private windowAfterNavigation(input: {
    source: IntakeStageRunnerRunInput;
    window: RequirementPromptWindow;
    calls: RequirementToolCall[];
  }): RequirementPromptWindow {
    const firstNavigation = input.calls.find(
      (call) =>
        call.tool === "source_prompt.expand_window" || call.tool === "source_prompt.open_adjacent",
    );
    if (!firstNavigation) {
      return input.window;
    }
    const promptLength = input.source.objectiveForModel.length;
    if (firstNavigation.tool === "source_prompt.expand_window") {
      const expansionChars = readPositiveIntEnv(
        "OPENCLAW_REQUIREMENT_MAP_WINDOW_EXPANSION_CHARS",
        1_500,
        { max: 4_000 },
      );
      return this.promptWindowFromRange({
        source: input.source,
        baseWindow: input.window,
        start: Math.max(0, input.window.start - expansionChars),
        end: Math.min(promptLength, input.window.end + expansionChars),
      });
    }
    const direction =
      typeof firstNavigation.input.direction === "string"
        ? firstNavigation.input.direction
        : "next";
    const span = Math.max(1, input.window.end - input.window.start);
    if (direction === "previous") {
      return this.promptWindowFromRange({
        source: input.source,
        baseWindow: input.window,
        start: Math.max(0, input.window.start - span),
        end: input.window.start,
      });
    }
    return this.promptWindowFromRange({
      source: input.source,
      baseWindow: input.window,
      start: input.window.end,
      end: Math.min(promptLength, input.window.end + span),
    });
  }

  private async extractRequirementWindow(input: {
    input: IntakeStageRunnerRunInput;
    window: RequirementPromptWindow;
    windowIndex: number;
    windowCount: number;
    maxWindowTurns: number;
    timeoutMs: number;
    modelRef: string;
    providerPath: string;
  }): Promise<{ window: RequirementPromptWindow; calls: RequirementToolCall[] }> {
    const phase: RequirementMapPhase = "window_extraction";
    const allowedToolIds = requirementAllowedToolIdsForPhase(phase);
    const tools = requirementNativeToolDefinitions(allowedToolIds);
    const allowedToolNames = tools.map((tool) => tool.name);
    let activeWindow = input.window;
    let lastCalls: RequirementToolCall[] = [];
    for (let turnIndex = 0; turnIndex < input.maxWindowTurns; turnIndex += 1) {
      const response = await this.runRequirementToolTurn({
        phase,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        systemPrompt: [
          "You are IntakeStageRunner's RequirementMap window extraction worker.",
          "Use provider-native tools only. Do not return JSON text.",
          "Read only this bounded source-prompt window. Record every operator-authored requirement candidate in the window, or record that the window has no requirement.",
          "A requirement candidate is an operator obligation, constraint, validation/review/closeout instruction, non-goal, or contextual requirement that downstream scheduler/worker/closeout may need.",
          "The evidenceExcerpt must be copied from the visible window so runtime can anchor a source ref. Runtime owns ids, refs, hashes, offsets, coverage, and submit.",
          "If the visible window is cut in the middle of a requirement, call source_prompt.expand_window or source_prompt.open_adjacent. Do not invent text from outside the visible window.",
        ].join("\n"),
        userPayload: {
          windowIndex: input.windowIndex,
          windowCount: input.windowCount,
          promptWindowRef: activeWindow.windowRef,
          promptWindowStart: activeWindow.start,
          promptWindowEnd: activeWindow.end,
          boundarySensitive: activeWindow.boundarySensitive,
          visiblePromptWindowText: activeWindow.text,
          roleGuide: {
            runnable_work: "Implementation or other executable work.",
            validation: "Testing, verification, quality proof, replay, or validation obligations.",
            review: "Review, inspection, or critique obligations.",
            closeout: "Final report, readback, completion, or closure obligations.",
            constraint:
              "Hard restrictions, architectural constraints, or requirements that constrain work.",
            non_goal: "Explicit do-not-do or out-of-scope instruction.",
            context: "Background/source-grounding information later consumers must preserve.",
          },
        } as JsonValue,
        tools,
        allowedToolNames,
        maxOutputTokens: 3_000,
        timeoutMs: input.timeoutMs,
        maxAttempts: 1,
        reasoningEffort: "none",
        taskClass: "local_semantic_extraction",
        modelTaskCallSite: "intake.requirement_map.window_extraction",
        progress: {
          objectiveSummary:
            "Extract RequirementMap candidates from a bounded source prompt window.",
          reasonCodes: [
            "requirement_map_window_extraction_native_tools",
            `requirement_map_window_index:${input.windowIndex}`,
          ],
          onEvent: async (event) =>
            this.options.attachModelCallProgress({
              event,
              stage: "requirement_map_authoring",
              schedulerPhase: "window_extraction",
              currentObjective:
                "Extract source-grounded requirement candidates from prompt window.",
              nextDecisionNeeded: "requirement_map_window_extraction",
            }),
        },
      });
      const calls = response.calls;
      lastCalls = calls;
      await this.options.attachProgress({
        stage: "requirement_map_authoring",
        status: "completed",
        reasonCodes: [
          "requirement_map_window_extraction_turn_completed",
          `requirement_map_window_index:${input.windowIndex}`,
        ],
        currentPhase: phase,
        currentObjective: "Extract source-grounded requirement candidates from prompt window.",
        nextDecisionNeeded: "requirement_map_window_extraction",
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        schedulerPhase: phase,
        toolCallTelemetry: requirementToolTelemetry({
          draft: null,
          phase,
          turnIndex,
          selectedToolNames: response.selectedToolNames,
          latencyMs: response.latencyMs,
        }),
      });
      if (
        calls.some(
          (call) =>
            call.tool === "requirement.record_candidate" ||
            call.tool === "requirement.record_no_requirement",
        )
      ) {
        return { window: activeWindow, calls };
      }
      const nextWindow = this.windowAfterNavigation({
        source: input.input,
        window: activeWindow,
        calls,
      });
      if (nextWindow.start === activeWindow.start && nextWindow.end === activeWindow.end) {
        break;
      }
      activeWindow = nextWindow;
    }
    return { window: activeWindow, calls: lastCalls };
  }

  private async consolidateRequirementCandidates(input: {
    input: IntakeStageRunnerRunInput;
    artifact: SourcePromptArtifact;
    mapId: string;
    draft: RequirementCoverageDraft;
    timeoutMs: number;
    modelRef: string;
    providerPath: string;
  }): Promise<RequirementCoverageDraft> {
    const phase: RequirementMapPhase = "candidate_consolidation";
    const allowedToolIds = requirementAllowedToolIdsForPhase(phase);
    const tools = requirementNativeToolDefinitions(allowedToolIds);
    const candidateClusters = clusterRequirementCandidatesBySourceWindow({
      draft: input.draft,
      maxCandidatesPerCluster: 18,
    });
    const candidateById = new Map(
      input.draft.candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    const coveredWindowCount = new Set([
      ...input.draft.candidates.flatMap((candidate) => candidate.sourceWindowRefs),
      ...input.draft.noRequirementReceipts.map((receipt) => receipt.sourceWindowRef),
    ]).size;
    const clusterResponses = await Promise.all(
      candidateClusters.map((cluster, clusterIndex) =>
        this.runRequirementToolTurn({
          phase,
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          systemPrompt: [
            "You are IntakeStageRunner's RequirementMap cluster consolidation worker.",
            "Use provider-native tools only. Do not return JSON text.",
            "Consolidate only the supplied source-anchored candidate cluster into final requirements for scheduler, worker, and closeout.",
            "Merge duplicates, split bundled candidates, retire process artifacts or non-operator instructions, and promote every real operator requirement in this cluster.",
            "Use compact requirement text and role only. Scheduler owns ordering and success/evidence projection after RequirementMap is accepted. Runtime owns ids, refs, hashes, coverage, and submit.",
          ].join("\n"),
          userPayload: {
            artifactKind: "requirement_map_candidate_cluster_consolidation_request",
            schemaVersion: "execution-platform.requirement-map-candidate-cluster-consolidation.v1",
            mapId: input.mapId,
            sourcePromptBodyRef: input.artifact.sourcePromptBodyRef,
            sourcePromptHash: input.artifact.promptHash,
            windowCount: input.draft.windows.length,
            coveredWindowCount,
            candidateClusterIndex: clusterIndex,
            candidateClusterCount: candidateClusters.length,
            candidateCluster: {
              clusterId: cluster.clusterId,
              sourceWindowRefs: cluster.sourceWindowRefs,
              sourceRefs: cluster.sourceRefs,
              candidateCount: cluster.candidateCount,
              candidates: cluster.candidateIds.flatMap((candidateId) => {
                const candidate = candidateById.get(candidateId);
                return candidate
                  ? [
                      {
                        candidateId: candidate.candidateId,
                        text: candidate.text,
                        sourceRefs: candidate.sourceRefs,
                        sourceWindowRefs: candidate.sourceWindowRefs,
                        retired: candidate.retired,
                      },
                    ]
                  : [];
              }),
            },
            roleGuide: {
              runnable_work: "Implementation or other executable work.",
              validation:
                "Testing, verification, quality proof, replay, or validation obligations.",
              review: "Review, inspection, or critique obligations.",
              closeout: "Final report, readback, completion, or closure obligations.",
              constraint:
                "Hard restrictions, architectural constraints, or requirements that constrain work.",
              non_goal: "Explicit do-not-do or out-of-scope instruction.",
              context: "Background/source-grounding information later consumers must preserve.",
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
          tools,
          allowedToolNames: tools.map((tool) => tool.name),
          maxOutputTokens: 6_000,
          timeoutMs: input.timeoutMs,
          reasoningEffort: "none",
          taskClass: "schema_normalization",
          modelTaskCallSite: "intake.requirement_map.native_tool_batch",
          progress: {
            objectiveSummary: "Consolidate one RequirementMap candidate cluster.",
            reasonCodes: [
              "requirement_map_candidate_cluster_consolidation_native_tools",
              `requirement_map_candidate_cluster:${cluster.clusterId}`,
            ],
            onEvent: async (event) =>
              this.options.attachModelCallProgress({
                event,
                stage: "requirement_map_authoring",
                schedulerPhase: "candidate_consolidation",
                currentObjective:
                  "Consolidate one candidate cluster into final RequirementMap requirements.",
                nextDecisionNeeded: "requirement_map_candidate_cluster_consolidation",
              }),
          },
        }),
      ),
    );
    let nextDraft = input.draft;
    for (const response of clusterResponses) {
      nextDraft = applyRequirementConsolidationToolCalls({
        draft: nextDraft,
        calls: response.calls,
      });
    }
    const selectedToolNames = clusterResponses.flatMap((response) => response.selectedToolNames);
    const latencyMs = Math.max(...clusterResponses.map((response) => response.latencyMs), 0);
    await this.options.attachProgress({
      stage: "requirement_map_authoring",
      status: "completed",
      reasonCodes: [
        "requirement_map_candidate_consolidation_completed",
        "requirement_map_candidate_consolidation_parallel_clusters_completed",
        `requirement_map_candidate_cluster_count:${candidateClusters.length}`,
      ],
      currentPhase: phase,
      currentObjective: "Consolidate candidate requirements into final requirements.",
      nextDecisionNeeded: "requirement_map_compile",
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      schedulerPhase: phase,
      toolCallTelemetry: requirementToolTelemetry({
        draft: nextDraft,
        phase,
        turnIndex: 0,
        selectedToolNames,
        latencyMs,
      }),
    });
    return nextDraft;
  }

  private async repairRequirementPromotions(input: {
    input: IntakeStageRunnerRunInput;
    artifact: SourcePromptArtifact;
    mapId: string;
    draft: RequirementCoverageDraft;
    compile: RequirementToolCompileResult;
    turnIndex: number;
    timeoutMs: number;
    modelRef: string;
    providerPath: string;
  }): Promise<RequirementCoverageDraft> {
    const phase: RequirementMapPhase = "requirement_repair";
    const allowedToolIds = requirementAllowedToolIdsForPhase(phase);
    const tools = requirementNativeToolDefinitions(allowedToolIds);
    const response = await this.runRequirementToolTurn({
      phase,
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      systemPrompt: [
        "You are IntakeStageRunner's RequirementMap targeted repair worker.",
        "Use provider-native tools only. Do not return JSON text.",
        "Repair only missing fields in already promoted requirements. Do not redraft the map.",
        "Runtime owns ids, refs, hashes, coverage, and submit. You may attach only source refs already present in knownSourceRefs.",
      ].join("\n"),
      userPayload: {
        artifactKind: "requirement_map_repair_request",
        schemaVersion: "execution-platform.requirement-map-repair.v1",
        mapId: input.mapId,
        sourcePromptBodyRef: input.artifact.sourcePromptBodyRef,
        sourcePromptHash: input.artifact.promptHash,
        missingFieldsByPromotionId: input.compile.missingFieldsByPromotionId,
        blockedPromotionIds: input.compile.blockedPromotionIds,
        reasonCodes: input.compile.reasonCodes,
        promotions: input.draft.promotions.map((promotion) => ({
          promotionId: promotion.promotionId,
          text: promotion.text,
          role: promotion.role,
          sourceRefs: promotion.sourceRefs,
        })),
        knownSourceRefs: [
          ...new Set(input.draft.candidates.flatMap((candidate) => candidate.sourceRefs)),
        ].slice(0, 120),
        roleGuide: {
          runnable_work: "Implementation or other executable work.",
          validation: "Testing, verification, quality proof, replay, or validation obligations.",
          review: "Review, inspection, or critique obligations.",
          closeout: "Final report, readback, completion, or closure obligations.",
          constraint:
            "Hard restrictions, architectural constraints, or requirements that constrain work.",
          non_goal: "Explicit do-not-do or out-of-scope instruction.",
          context: "Background/source-grounding information later consumers must preserve.",
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as JsonValue,
      tools,
      allowedToolNames: tools.map((tool) => tool.name),
      maxOutputTokens: 4_000,
      timeoutMs: input.timeoutMs,
      reasoningEffort: "low",
      taskClass: "schema_normalization",
      modelTaskCallSite: "intake.requirement_map.targeted_repair",
      progress: {
        objectiveSummary: "Repair missing RequirementMap fields without redrafting.",
        reasonCodes: ["requirement_map_targeted_repair_native_tools"],
        onEvent: async (event) =>
          this.options.attachModelCallProgress({
            event,
            stage: "requirement_map_authoring",
            schedulerPhase: "requirement_repair",
            currentObjective: "Repair missing RequirementMap fields.",
            nextDecisionNeeded: "requirement_map_targeted_repair",
          }),
      },
    });
    const calls = response.calls;
    const nextDraft = applyRequirementRepairToolCalls({
      draft: input.draft,
      calls,
    });
    await this.options.attachProgress({
      stage: "requirement_map_authoring",
      status: "completed",
      reasonCodes: ["requirement_map_repair_turn_completed"],
      currentPhase: phase,
      currentObjective: "Repair missing RequirementMap fields.",
      nextDecisionNeeded: "requirement_map_compile",
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      schedulerPhase: phase,
      toolCallTelemetry: requirementToolTelemetry({
        draft: nextDraft,
        compile: input.compile,
        phase,
        turnIndex: input.turnIndex,
        selectedToolNames: response.selectedToolNames,
        latencyMs: response.latencyMs,
      }),
    });
    return nextDraft;
  }

  private async loadAcceptedReplayRequirementMap(
    input: IntakeStageRunnerRunInput,
  ): Promise<RequirementMap | null> {
    const checkpointReplay = recordValue(input.checkpointReplay);
    const sourceRuntimeJobId =
      typeof checkpointReplay.sourceRuntimeJobId === "string"
        ? checkpointReplay.sourceRuntimeJobId.trim()
        : "";
    const replayBoundary =
      typeof checkpointReplay.replayBoundary === "string" ? checkpointReplay.replayBoundary : "";
    if (!sourceRuntimeJobId || replayBoundary !== "requirement_map") {
      return null;
    }
    const sourceArtifacts = await this.options.runtimeJobs.listArtifacts(sourceRuntimeJobId);
    const mapArtifact =
      sourceArtifacts
        .filter((artifact) => artifact.artifactType === REQUIREMENT_MAP_ARTIFACT_TYPE)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    if (!mapArtifact) {
      await this.options.attachProgress({
        stage: "checkpoint_replay",
        status: "needs_review",
        reasonCodes: ["checkpoint_replay_source_requirement_map_missing"],
        currentPhase: "checkpoint_replay_blocked",
        blockerSummary:
          "Replay requested from RequirementMap, but the source job has no accepted RequirementMap artifact.",
        schedulerPhase: "checkpoint_replay_blocked",
      });
      return null;
    }
    const hydrated = await this.options.runtimeJobs.hydrateRuntimeArtifactByContract(mapArtifact);
    const mapBody =
      hydrated.status === "payload_hydrated" && hydrated.body
        ? hydrated.body
        : mapArtifact.metadata;
    const requirementMap = RequirementMapSchema.parse(mapBody);
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.runtimeJobId,
      artifactType: REQUIREMENT_MAP_ARTIFACT_TYPE,
      uri: requirementMap.mapRef,
      contentType: "application/json",
      body: requirementMap as unknown as JsonValue,
      boundedSummary: `Reused RequirementMap ${requirementMap.mapId}: ${requirementMap.requirements.length} requirement(s).`,
      targetCommitmentIds: requirementMap.requirements.map(
        (requirement) => requirement.requirementId,
      ),
      resourcePacketKind: "requirement_map",
      readinessStatus: "accepted",
      reasonCodes: [
        "checkpoint_replay_requirement_map_reused",
        `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
      ],
      metadata: {
        artifactKind: REQUIREMENT_MAP_ARTIFACT_TYPE,
        mapRef: requirementMap.mapRef,
        mapHash: requirementMap.mapHash,
        sourcePromptBodyRef: requirementMap.sourcePromptBodyRef,
        requirementCount: requirementMap.requirements.length,
        requirementMapSummary: summarizeRequirementMapForManifest(requirementMap),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await this.options.recordBoundaryCheckpoint({
      checkpointKind: "requirement_map",
      upstreamArtifactRefs: [mapArtifact.uri],
      acceptedArtifactRefs: [requirementMap.mapRef],
      currentCommitmentIds: requirementMap.requirements
        .map((requirement) => requirement.requirementId)
        .slice(0, 80),
      replayContinuationMode: "continue_scheduler",
      replayStartPolicy: "allowed_from_checkpoint",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: [
        "requirement_map_replay_boundary_checkpoint_recorded",
        "checkpoint_replay_requirement_map_reused",
      ],
    });
    await this.options.attachProgress({
      stage: "checkpoint_replay",
      status: "completed",
      artifactRefs: [requirementMap.mapRef],
      reasonCodes: [
        "checkpoint_replay_requirement_map_reused",
        `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
      ],
      currentPhase: "requirement_map_reused_for_scheduler",
      currentObjective:
        "Resume proof from accepted RequirementMap and continue scheduler planning.",
      evidenceProducedRefs: [requirementMap.mapRef],
      nextDecisionNeeded: "scheduler_work_intent_planning",
      eli5Progress:
        "OpenClaw reused the accepted RequirementMap as the sole pre-scheduler intake product.",
      schedulerPhase: "requirement_map_ready",
    });
    return requirementMap;
  }
}
