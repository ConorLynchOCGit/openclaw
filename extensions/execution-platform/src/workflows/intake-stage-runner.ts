import { createHash } from "node:crypto";
import type {
  DynamicCodingTeamModelCallProgressEvent,
  DynamicCodingTeamModelClient,
} from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
  MissionContractLedgerSchema,
  normalizeMissionContractLedger,
  openBlockingMissionCommitments,
  type MissionContractLedger,
} from "./mission-contract-ledger.ts";
import {
  OBLIGATION_GRAPH_ARTIFACT_TYPE,
  applyObligationToolCallsToDraft,
  obligationAuthorPayloadFromLedger,
  obligationGraphAuthorNeedsRepair,
  obligationGraphAuthorRepairPayload,
  parseObligationGraphAuthorOutput,
  type ObligationGraph,
  type ObligationGraphAuthorParseResult,
  type ObligationToolCompileResult,
} from "./obligation-graph.ts";
import type { BoundaryReplayCheckpointKind } from "./boundary-replay-checkpoints.ts";

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
  missionLedgerMode?: "production_single_pass" | "staged_diagnostic" | null;
};

type BoundaryCheckpointInput = {
  checkpointKind: BoundaryReplayCheckpointKind;
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
  missionLedger: MissionContractLedger | null;
  obligationGraph: ObligationGraph | null;
  missionLedgerRefs: string[];
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
  attachMissionLedger: (
    ledger: MissionContractLedger,
    reasonCodes: string[],
  ) => Promise<string>;
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
  sourcePromptContextIndexRef: string | null;
  repoScopeRefs: string[];
  validationCommandRefs: string[];
  checkpointReplay?: JsonValue | null;
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveIntEnv(name: string, fallback: number, options: { max?: number } = {}): number {
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

function parseJsonObject(text: string | null): Record<string, unknown> {
  const source = text?.trim() ?? "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  throw new Error("intake_json_object_parse_failed");
}

export class IntakeStageRunner {
  constructor(private readonly options: IntakeStageRunnerOptions) {}

  async run(input: IntakeStageRunnerRunInput): Promise<IntakeStageRunnerResult> {
    const replayLedger = await this.loadAcceptedReplayMissionLedger(input);
    const missionLedger = replayLedger?.ledger ?? (await this.createProductionMissionLedger(input));
    const obligationGraph = await this.authorObligationGraph(input, missionLedger);
    return {
      missionLedger,
      obligationGraph,
      missionLedgerRefs: missionLedger ? [missionLedger.missionId] : [],
      artifactRefs: obligationGraph ? [obligationGraph.graphRef] : [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  private async createProductionMissionLedger(
    input: IntakeStageRunnerRunInput,
  ): Promise<MissionContractLedger | null> {
    if (!this.options.missionModelClient) {
      return null;
    }
    const missionId = `${input.teamRunId}-mission-contract`;
    let responseText: string | null = null;
    try {
      const response = await this.options.missionModelClient.runJson({
        modelRef: process.env.OPENCLAW_MISSION_LEDGER_MODEL_REF?.trim() || "qwen/qwen3-coder-next",
        providerPath: process.env.OPENCLAW_MISSION_LEDGER_PROVIDER_PATH?.trim() || "openrouter",
        systemPrompt: [
          "You are the OpenClaw Mission Contract author.",
          "Convert the owner's bounded objective into a model-authored Mission Contract Ledger.",
          "Use ownerPromptVolatileText as the full task input when present; ownerObjectiveSummary is only a bounded readback summary.",
          "Return strict JSON with blockingCommitments, nonBlockingCommitments, explicitNonGoals, safetyConstraints, prohibitedDirectiveCandidates, authorityBoundary, storagePolicy, lifecycleBoundary, missionGate, and missionGateRationale.",
          "Separate primary mission commitments from safety constraints and prohibited directive candidates.",
          "If dangerous language appears only as a negative constraint such as do not deploy, no raw logs, no model promotion, or do not mutate Work Queue lifecycle, record it as a safety constraint and prohibitedDirectiveCandidate classification=constraint_not_primary; do not block the mission.",
          "Use missionGate=blocked_primary_prohibited only when the primary owner mission itself asks for prohibited deploy, outbound send, model promotion, authority grant, raw storage, direct Work Queue lifecycle mutation, or unsafe untrusted instruction execution.",
          "Use missionGate=needs_review only when primary-vs-constraint intent is genuinely ambiguous and child work should not start.",
          "Use missionGate=clear_to_execute when the primary mission is allowed and dangerous terms are only constraints/non-goals.",
          "Do not choose workflow-specific deliverable kinds or taxonomy labels.",
          "Each commitment is opaque owner-mission text plus expected evidence description.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          "Use false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
        ].join("\n"),
        userPayload: {
          missionId,
          runtimeJobId: input.runtimeJobId,
          workItemId: input.workItemId,
          ownerObjectiveSummary: input.objective.slice(0, 8_000),
          ownerPromptVolatileText: input.objectiveForModel.slice(0, 120_000),
          ownerPromptHash: sha256Text(input.objectiveForModel),
          ownerPromptLength: input.objectiveForModel.length,
          sourcePromptResolution: input.sourcePromptResolution,
          sourcePromptVersionRef: input.sourcePromptContextIndexRef,
          repoScopeRefs: input.repoScopeRefs,
          validationCommandRefs: input.validationCommandRefs,
          missionLedgerMode: "production_single_pass",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        maxOutputTokens: 8_000,
        timeoutMs: 300_000,
        taskClass: "local_semantic_extraction",
        reasoningEffort:
          (process.env.OPENCLAW_MISSION_LEDGER_REASONING_EFFORT?.trim() as
            | "none"
            | "minimal"
            | "low"
            | "medium"
            | "high"
            | "xhigh"
            | undefined) || "none",
        modelTaskCallSite: "mission_ledger.production_single_pass",
        progress: {
          spanId: `${input.runtimeJobId}:${input.graphId}:mission-ledger`,
          objectiveSummary: "Create the Mission Contract Ledger from the full owner prompt.",
          reasonCodes: ["mission_contract_model_call", "mission_ledger_mode:production_single_pass"],
          onEvent: (event) =>
            this.options.attachModelCallProgress({
              event,
              stage: "mission_contract_model_call",
              schedulerPhase: "mission_contract_authoring",
              currentObjective:
                "Extract owner objective, commitments, constraints, and evidence expectations.",
              nextDecisionNeeded:
                event.phase === "completed" ? "validate_mission_contract" : "mission_contract",
            }),
        },
      });
      responseText = response.responseText;
    } catch (error) {
      await this.options.attachProgress({
        stage: "mission_ledger",
        status: "needs_review",
        reasonCodes: [
          "intake_mission_ledger_provider_failed",
          error instanceof Error ? `provider_error:${error.name}` : "provider_error:unknown",
        ],
        currentPhase: "mission_ledger_provider_blocked",
        blockerSummary:
          "Mission Ledger model call failed before scheduler intake; no raw provider response was stored.",
        schedulerPhase: "mission_ledger_blocked",
      });
      throw error;
    }

    let ledger: MissionContractLedger;
    try {
      ledger = normalizeMissionContractLedger({
        value: parseJsonObject(responseText),
        missionId,
        sourceRuntimeJobId: input.runtimeJobId,
        sourceWorkItemId: input.workItemId,
        ownerObjectiveSummary: input.objective,
      });
    } catch (error) {
      await this.options.attachProgress({
        stage: "mission_ledger",
        status: "needs_review",
        reasonCodes: [
          "intake_mission_ledger_parse_failed",
          error instanceof Error ? `parse_error:${error.name}` : "parse_error:unknown",
        ],
        currentPhase: "mission_ledger_parse_blocked",
        blockerSummary:
          "Mission Ledger model output could not be normalized into the canonical ledger contract.",
        schedulerPhase: "mission_ledger_blocked",
      });
      throw error;
    }

    const ledgerRef = await this.options.attachMissionLedger(ledger, [
      "mission_contract_ledger_created",
      "mission_ledger_mode:production_single_pass",
    ]);
    await this.options.attachProgress({
      stage: "mission_ledger",
      status: ledger.ledgerStatus === "blocked" ? "failed" : "completed",
      artifactRefs: [ledgerRef],
      reasonCodes: [
        "mission_contract_ledger_created",
        "mission_ledger_mode:production_single_pass",
        `mission_gate:${ledger.missionGate}`,
      ],
      currentPhase: "mission_ledger_created",
      currentObjective: ledger.ownerObjectiveSummary,
      evidenceProducedRefs: [ledgerRef],
      commitmentIdsAdvanced: ledger.blockingCommitments
        .map((commitment) => commitment.commitmentId)
        .slice(0, 30),
      remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
        .map((commitment) => commitment.commitmentId)
        .slice(0, 30),
      eli5Progress: `Mission Ledger created with ${ledger.blockingCommitments.length} blocking commitment(s), gate ${ledger.missionGate}.`,
      schedulerPhase: "mission_ledger_ready",
      missionLedgerMode: "production_single_pass",
    });
    return ledger;
  }

  private async authorObligationGraph(
    input: IntakeStageRunnerRunInput,
    ledger: MissionContractLedger | null,
  ): Promise<ObligationGraph | null> {
    if (!ledger || !this.options.missionModelClient) {
      return null;
    }
    const obligationGraphId = `${ledger.missionId}:obligation-graph`;
    const obligationGraphRefPrefix = `runtime-job://${input.runtimeJobId}/obligation-graph/${ledger.missionId}`;
    const obligationModelRef =
      process.env.OPENCLAW_OBLIGATION_GRAPH_AUTHOR_MODEL_REF?.trim() || "qwen/qwen3-coder-next";
    const obligationCandidateId =
      process.env.OPENCLAW_OBLIGATION_GRAPH_AUTHOR_CANDIDATE_ID?.trim() ||
      "qwen3-coder-next-obligation-graph-author";
    const obligationTimeoutMs = readPositiveIntEnv(
      "OPENCLAW_OBLIGATION_GRAPH_AUTHOR_TIMEOUT_MS",
      120_000,
      { max: 300_000 },
    );
    const obligationPayload = obligationAuthorPayloadFromLedger({
      ledger,
      missionLedgerRef: null,
    });
    await this.options.attachProgress({
      stage: "obligation_graph_authoring",
      status: "started",
      reasonCodes: [
        "obligation_graph_authoring_started",
        `obligation_graph_model:${obligationModelRef}`,
      ],
      currentPhase: "obligation_graph_authoring",
      currentObjective:
        "Classify Mission Ledger commitments into typed obligations before scheduler decomposition.",
      modelRef: obligationModelRef,
      providerPath: "openrouter",
      eli5Progress:
        "OpenClaw is turning commitments into typed obligations so read-only, validation, review, closeout, constraint, and evidence requirements do not have to pretend to be implementation packets.",
      schedulerPhase: "obligation_graph_authoring",
    });

    const first = await this.runObligationAuthorModelCall({
      input,
      ledger,
      obligationModelRef,
      obligationPayload,
      timeoutMs: obligationTimeoutMs,
      repairAttempt: 0,
    });
    const firstCompiled = first.parse.status === "parsed"
      ? applyObligationToolCallsToDraft({
          missionId: ledger.missionId,
          graphId: obligationGraphId,
          graphRefPrefix: obligationGraphRefPrefix,
          sourceMissionLedgerRef: null,
          ledger,
          modelOutputs: [first.parse.parsed],
        })
      : null;
    let finalParse = first.parse;
    let finalCompile = firstCompiled;
    if (obligationGraphAuthorNeedsRepair({ parse: first.parse, compile: firstCompiled })) {
      await this.options.attachProgress({
        stage: "obligation_graph_authoring",
        status: "started",
        reasonCodes: [
          "obligation_graph_authoring_repairing_tool_shape",
          ...first.parse.reasonCodes,
          ...(firstCompiled?.reasonCodes ?? []),
        ].slice(0, 30),
        currentPhase: "obligation_graph_repairing_tool_shape",
        currentObjective:
          "Repair ObligationGraph author output into the canonical small-verb tool shape.",
        nextDecisionNeeded: "obligation_graph_tool_shape_repair",
        schedulerPhase: "obligation_graph_authoring_repair",
      });
      const repairPayload = obligationGraphAuthorRepairPayload({
        originalPayload: obligationPayload,
        parse: first.parse,
        compile: firstCompiled,
      });
      const repaired = await this.runObligationAuthorModelCall({
        input,
        ledger,
        obligationModelRef,
        obligationPayload: repairPayload,
        timeoutMs: obligationTimeoutMs,
        repairAttempt: 1,
      });
      const repairedCompile = repaired.parse.status === "parsed"
        ? applyObligationToolCallsToDraft({
            missionId: ledger.missionId,
            graphId: obligationGraphId,
            graphRefPrefix: obligationGraphRefPrefix,
            sourceMissionLedgerRef: null,
            ledger,
            modelOutputs: [repaired.parse.parsed],
          })
        : null;
      finalParse = repaired.parse;
      finalCompile = repairedCompile;
    }

    const diagnosticRef = await this.attachObligationDiagnostic({
      input,
      ledger,
      compile: finalCompile,
      parse: finalParse,
      obligationGraphRefPrefix,
      obligationModelRef,
      obligationCandidateId,
      obligationPayload,
      latencyMs: first.latencyMs,
    });

    if (!finalCompile?.graph) {
      const reasonCodes = [
        ...(finalParse.reasonCodes ?? []),
        ...(finalCompile?.reasonCodes ?? ["obligation_graph_compile_not_attempted"]),
      ].slice(0, 80);
      await this.options.attachProgress({
        stage: "obligation_graph_authoring",
        status: "needs_review",
        artifactRefs: [diagnosticRef],
        reasonCodes,
        currentPhase: "obligation_graph_blocked",
        currentObjective:
          "Repair typed obligation graph authoring before scheduler decomposition.",
        blockerSummary:
          "ObligationGraph authoring did not produce a complete typed graph; scheduler cannot fall back to universal worker packet fanout.",
        modelRef: obligationModelRef,
        providerPath: "openrouter",
        eli5Progress:
          "OpenClaw stopped before scheduling because it refused to treat every commitment like a worker implementation packet.",
        schedulerPhase: "obligation_graph_blocked",
      });
      throw new Error(`obligation_graph_authoring_blocked:${reasonCodes.join(",")}`);
    }

    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.runtimeJobId,
      artifactType: OBLIGATION_GRAPH_ARTIFACT_TYPE,
      uri: finalCompile.graph.graphRef,
      contentType: "application/json",
      body: finalCompile.graph as unknown as JsonValue,
      boundedSummary: `Typed ObligationGraph for ${ledger.missionId}: ${finalCompile.graph.obligations.length} obligation(s).`,
      targetCommitmentIds: finalCompile.graph.obligations.flatMap((obligation) =>
        obligation.commitmentIds,
      ),
      resourcePacketKind: "obligation_graph",
      readinessStatus: "accepted",
      reasonCodes: finalCompile.graph.reasonCodes,
      metadata: {
        artifactKind: OBLIGATION_GRAPH_ARTIFACT_TYPE,
        missionId: ledger.missionId,
        graphRef: finalCompile.graph.graphRef,
        graphHash: finalCompile.graph.graphHash,
        obligationCount: finalCompile.graph.obligations.length,
        executableCount: finalCompile.graph.obligations.filter(
          (obligation) => obligation.obligationKind === "executable",
        ).length,
        nonExecutableCount: finalCompile.graph.obligations.filter(
          (obligation) => obligation.obligationKind !== "executable",
        ).length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as Record<string, JsonValue>,
    });
    await this.options.recordBoundaryCheckpoint({
      checkpointKind: "obligation_graph",
      upstreamArtifactRefs: [],
      acceptedArtifactRefs: [finalCompile.graph.graphRef, diagnosticRef],
      currentCommitmentIds: finalCompile.graph.obligations
        .flatMap((obligation) => obligation.commitmentIds)
        .slice(0, 40),
      openCommitmentIds: openBlockingMissionCommitments(ledger).map(
        (commitment) => commitment.commitmentId,
      ),
      replayContinuationMode: "continue_scheduler",
      replayStartPolicy: "allowed_from_checkpoint",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: [
        "obligation_graph_boundary_checkpoint_recorded",
        "obligation_graph_ready_for_scheduler",
      ],
    });
    await this.options.attachProgress({
      stage: "obligation_graph_authoring",
      status: "completed",
      artifactRefs: [finalCompile.graph.graphRef, diagnosticRef],
      reasonCodes: finalCompile.graph.reasonCodes,
      currentPhase: "obligation_graph_accepted",
      currentObjective: "Use typed obligations as the only scheduler-facing intake contract.",
      evidenceProducedRefs: [finalCompile.graph.graphRef],
      commitmentIdsAdvanced: finalCompile.graph.obligations
        .flatMap((obligation) => obligation.commitmentIds)
        .slice(0, 40),
      modelRef: obligationModelRef,
      providerPath: "openrouter",
      eli5Progress:
        "OpenClaw has typed obligations; the scheduler can now create runnable WorkIntents without forcing read-only commitments into worker packets.",
      schedulerPhase: "obligation_graph_ready",
    });
    return finalCompile.graph;
  }

  private async runObligationAuthorModelCall(input: {
    input: IntakeStageRunnerRunInput;
    ledger: MissionContractLedger;
    obligationModelRef: string;
    obligationPayload: JsonValue;
    timeoutMs: number;
    repairAttempt: 0 | 1;
  }): Promise<{ parse: ObligationGraphAuthorParseResult; latencyMs: number }> {
    const response = await this.options.missionModelClient!.runJson({
      modelRef: input.obligationModelRef,
      providerPath: "openrouter",
      systemPrompt: [
        "You are the OpenClaw ObligationGraph author.",
        "Use only the obligation tool family. Return strict JSON with top-level obligationActions.",
        "Classify each Mission Ledger commitment into typed obligations: executable, read_only_grounding, validation, review, closeout, constraint, prerequisite, or evidence_requirement.",
        "Do not create worker packets, graph nodes, executor keys, worker refs, lifecycle state, or evidence enums.",
        "Only executable obligations may include executionIntentHint, selectedCapabilityHints, or resourceRequirementKinds.",
        "Every obligation must include commitmentIds, ownerIntentSummary, successCondition, evidenceExpectation, and obligationKind.",
        "Call obligation.submit_graph after all obligations are complete.",
        "Runtime validates structure, stores bounded artifacts, and scheduler/runner own downstream lifecycle.",
        "Set rawPromptStored, rawResponseStored, and rawProviderLogStored false.",
      ].join("\n"),
      userPayload: input.obligationPayload,
      maxOutputTokens: 5_000,
      timeoutMs: input.timeoutMs,
      reasoningEffort: "none",
      taskClass: "local_semantic_extraction",
      modelTaskCallSite:
        input.repairAttempt === 0
          ? "mission.obligation_graph_author"
          : "mission.obligation_graph_author.repair_tool_shape",
      progress: {
        spanId: `${input.input.runtimeJobId}:${input.input.graphId}:obligation-graph-author:${input.ledger.missionId}:${input.repairAttempt}`,
        objectiveSummary: "Author a typed ObligationGraph from Mission Ledger commitments.",
        reasonCodes: [
          input.repairAttempt === 0
            ? "obligation_graph_author_model_call"
            : "obligation_graph_author_repair_model_call",
        ],
        onEvent: (event) =>
          this.options.attachModelCallProgress({
            event,
            stage:
              input.repairAttempt === 0
                ? "obligation_graph_author_model_call"
                : "obligation_graph_author_repair_model_call",
            schedulerPhase: "obligation_graph_authoring",
            currentObjective:
              "Classify commitments into conditional obligations before scheduler WorkIntent planning.",
            nextDecisionNeeded:
              event.phase === "completed" ? "compile_obligation_graph" : "obligation_graph_authoring",
          }),
      },
    });
    return {
      parse: parseObligationGraphAuthorOutput(response.responseText),
      latencyMs: response.latencyMs,
    };
  }

  private async attachObligationDiagnostic(input: {
    input: IntakeStageRunnerRunInput;
    ledger: MissionContractLedger;
    parse: ObligationGraphAuthorParseResult;
    compile: ObligationToolCompileResult | null;
    obligationGraphRefPrefix: string;
    obligationModelRef: string;
    obligationCandidateId: string;
    obligationPayload: JsonValue;
    latencyMs: number;
  }): Promise<string> {
    const status = input.compile?.status ?? "blocked";
    const reasonCodes = [
      ...input.parse.reasonCodes,
      ...(input.compile?.reasonCodes ?? ["obligation_graph_compile_not_attempted"]),
    ].slice(0, 80);
    const diagnosticRef = `${input.obligationGraphRefPrefix}/diagnostic/${sha256Text(
      JSON.stringify({
        status,
        reasonCodes,
        missingFieldsByObligationId: input.compile?.missingFieldsByObligationId ?? {},
        outputHash: input.parse.outputHash,
      }),
    ).slice(0, 16)}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.input.runtimeJobId,
      artifactType: `${OBLIGATION_GRAPH_ARTIFACT_TYPE}.diagnostic`,
      storageKind: "metadata",
      uri: diagnosticRef,
      contentType: "application/json",
      metadata: {
        artifactKind: "obligation_graph_diagnostic",
        schemaVersion: "execution-platform.obligation-graph.v1",
        missionId: input.ledger.missionId,
        status,
        parseStatus: input.parse.status,
        parseTopLevelKeys: input.parse.topLevelKeys,
        parseOutputHash: input.parse.outputHash,
        appliedToolNames: input.compile?.appliedToolNames ?? [],
        rejectedToolCalls: input.compile?.rejectedToolCalls ?? [],
        blockedObligationIds: input.compile?.blockedObligationIds ?? [],
        missingFieldsByObligationId: input.compile?.missingFieldsByObligationId ?? {},
        reasonCodes,
        modelRef: input.obligationModelRef,
        providerPath: "openrouter",
        modelCandidateId: input.obligationCandidateId,
        latencyMs: input.latencyMs,
        inputBytes: Buffer.byteLength(stringifyJson(input.obligationPayload), "utf8"),
        outputBytes: input.parse.outputBytes,
        providerDiagnostics: null,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as JsonValue,
    });
    return diagnosticRef;
  }

  private async loadAcceptedReplayMissionLedger(
    input: IntakeStageRunnerRunInput,
  ): Promise<{ ledger: MissionContractLedger; sourceRuntimeJobId: string } | null> {
    const checkpointReplay = recordValue(input.checkpointReplay);
    const sourceRuntimeJobId =
      typeof checkpointReplay.sourceRuntimeJobId === "string"
        ? checkpointReplay.sourceRuntimeJobId.trim()
        : "";
    const replayBoundary =
      typeof checkpointReplay.replayBoundary === "string" ? checkpointReplay.replayBoundary : "";
    const replayFromMissionLedger =
      replayBoundary === "mission_ledger" || replayBoundary === "obligation_graph";
    if (!sourceRuntimeJobId || !replayFromMissionLedger) {
      return null;
    }
    const sourceArtifacts = await this.options.runtimeJobs.listArtifacts(sourceRuntimeJobId);
    const ledgerArtifact =
      sourceArtifacts
        .filter((artifact) => artifact.artifactType === MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    if (!ledgerArtifact) {
      await this.options.attachProgress({
        stage: "checkpoint_replay",
        status: "needs_review",
        reasonCodes: ["checkpoint_replay_source_mission_ledger_missing"],
        currentPhase: "checkpoint_replay_blocked",
        blockerSummary:
          "Replay requested from Mission Ledger or ObligationGraph, but the source job has no accepted Mission Ledger artifact.",
        schedulerPhase: "checkpoint_replay_blocked",
      });
      return null;
    }
    const { ledgerHash: _ledgerHash, reasonCodes: _reasonCodes, ...ledgerMetadata } = recordValue(
      ledgerArtifact.metadata,
    );
    const ledger = MissionContractLedgerSchema.parse(ledgerMetadata);
    const ledgerRef = await this.options.attachMissionLedger(ledger, [
      "checkpoint_replay_mission_ledger_reused",
      "checkpoint_replay_obligation_graph_will_be_reauthored",
      `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
    ]);
    await this.options.recordBoundaryCheckpoint({
      checkpointKind: "mission_ledger",
      upstreamArtifactRefs: [ledgerArtifact.uri],
      acceptedArtifactRefs: [ledgerRef],
      currentCommitmentIds: [
        ...ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
        ...ledger.nonBlockingCommitments.map((commitment) => commitment.commitmentId),
      ],
      openCommitmentIds: openBlockingMissionCommitments(ledger).map(
        (commitment) => commitment.commitmentId,
      ),
      replayContinuationMode: "continue_scheduler",
      replayStartPolicy: "allowed_from_checkpoint",
      replaySafetyStatus: "safe_to_replay",
      reasonCodes: [
        "mission_ledger_replay_boundary_checkpoint_recorded",
        "checkpoint_replay_mission_ledger_reused",
        "checkpoint_replay_obligation_graph_will_be_reauthored",
      ],
    });
    await this.options.attachProgress({
      stage: "checkpoint_replay",
      status: "completed",
      artifactRefs: [ledgerRef],
      reasonCodes: [
        "checkpoint_replay_mission_ledger_reused",
        "checkpoint_replay_obligation_graph_will_be_reauthored",
        `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
      ],
      currentPhase: "mission_ledger_reused_for_obligation_graph",
      currentObjective:
        "Resume Product/Spec proof from accepted Mission Ledger and reauthor the typed ObligationGraph.",
      evidenceProducedRefs: [ledgerRef],
      remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
        .map((commitment) => commitment.commitmentId)
        .slice(0, 30),
      nextDecisionNeeded: "obligation_graph_authoring",
      eli5Progress:
        "OpenClaw reused the accepted Mission Ledger, but it will not replay retired worker-packet fanout artifacts.",
      schedulerPhase: "obligation_graph_authoring",
    });
    return { ledger, sourceRuntimeJobId };
  }
}
