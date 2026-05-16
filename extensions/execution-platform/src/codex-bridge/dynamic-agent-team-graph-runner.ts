import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { CodexAppServerJsonExecutor } from "../../../model-memory/src/mmv2/codex-app-server-json-executor.ts";
import type { JsonModelExecutionRequest } from "../../../model-memory/src/model-execution.ts";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE,
  MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
  applyMissionCommitmentEvaluation,
  missionContractLedgerArtifactRef,
  missionContractLedgerHash,
  missionContractLedgerToJson,
  missionLedgerHasOpenBlockingCommitments,
  normalizeMissionContractLedger,
  openBlockingMissionCommitments,
  parseMissionCommitmentEvaluation,
  summarizeMissionContractLedger,
  type MissionContractLedger,
} from "../workflows/mission-contract-ledger.ts";
import { runtimeNodeCapabilityManifestForModel } from "../workflows/runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  CODING_TEAM_ROLE_COVERAGE_PROFILE,
  RuntimeWorkGraphScheduler,
  type CommitmentEvidenceClaim,
  type RuntimeWorkGraphNodeExecutor,
  type RuntimeWorkGraphNodeExecutionResult,
  type RuntimeWorkGraphSchedulerOrchestrator,
} from "../workflows/runtime-work-graph-scheduler.ts";
import {
  graphRef,
  type TeamGraphNode,
  type TeamGraphNodeStatus,
} from "../workflows/runtime-work-graph.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import { type AgentTeamRoleExecutionEvidence } from "./agent-team-quality-proof.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import {
  parseContextScoutOutput,
  validateContextScoutOutputShape,
  type ChildWorkOrder,
} from "./child-work-order.ts";
import {
  closeoutCapsuleHash,
  type CloseoutCapsuleRoleCloseout,
  parseCloseoutCapsule,
} from "./closeout-capsule.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import {
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  type DynamicCodingTeamModelClient,
} from "./dynamic-coding-team-orchestrator.ts";
import type { DynamicValidationRunner } from "./dynamic-test-repair-loop.ts";
import { ModelAgnosticFileEditWorkerAdapter } from "./file-edit-worker-adapter.ts";
import {
  KimiFileImplementationAdapter,
  type KimiFileImplementationAdapterResult,
  type KimiPatchModelClient,
} from "./kimi-file-implementation-adapter.ts";
import {
  KimiMicrotaskImplementationExecutor,
  type KimiMicrotaskImplementationExecutorResult,
} from "./kimi-microtask-implementation-executor.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";
import {
  createDegradedSystemCloseoutCapsule,
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";
import { NonCodexToolUsingWorkerLoop } from "./non-codex-tool-using-worker-loop.ts";
import { resolveRuntimeObjective } from "./source-prompt-ref.ts";

const execFileAsync = promisify(execFile);

type AgentTeamClaimedJobExecutionResult = {
  artifactKind: "agent_team_claimed_job_execution_result";
  evidence: AgentTeamRuntimeEvidence;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  closeoutCapsule: CloseoutCapsuleReporterResult["capsule"];
  cleanSuccessAccepted: boolean;
  blockingReasonCodes: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

function isModelAuthoredCloseoutResult(result: CloseoutCapsuleReporterResult): boolean {
  return result.source === "model" && result.capsule.humanReport.source === "model";
}

type AgentTeamImplementationBridgeRunInput = {
  runtimeJob: RuntimeJob;
  teamRunId: string;
  objective: string;
  roleId: "implementation_engineer";
  assignedTaskSummary: string;
  evidenceRefs: string[];
  validationRefs: string[];
  approvedRepoScopePaths?: string[];
};

type AgentTeamImplementationBridgeRunResult = {
  status: "completed" | "needs_review" | "failed";
  transportKind: "live_model" | "codex_app_server" | "acp_codex" | "codex_parity_runtime_adapter";
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  summary: string;
  changedFileRefs: string[];
  validationRefs: string[];
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

type AgentTeamImplementationBridge = {
  run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult>;
};

type AgentTeamKimiImplementationAdapter = {
  run(
    input: Parameters<KimiFileImplementationAdapter["run"]>[0],
  ): Promise<KimiFileImplementationAdapterResult>;
};

export class HumanOperatorInputRequiredError extends Error {
  readonly runtimeJobId: string;
  readonly graphId: string;
  readonly humanTaskId: string;
  readonly artifactRefs: string[];
  readonly reasonCodes: string[];

  constructor(input: {
    runtimeJobId: string;
    graphId: string;
    humanTaskId: string;
    artifactRefs: string[];
    reasonCodes?: string[];
  }) {
    super(`human_operator_input_required:${input.humanTaskId}`);
    this.name = "HumanOperatorInputRequiredError";
    this.runtimeJobId = input.runtimeJobId;
    this.graphId = input.graphId;
    this.humanTaskId = input.humanTaskId;
    this.artifactRefs = input.artifactRefs.slice(0, 12);
    this.reasonCodes = (input.reasonCodes ?? ["human_operator_input_required"]).slice(0, 12);
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max = 1_000): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultRepoRoot(): string {
  return process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT?.trim() || process.cwd();
}

function roleModelFor(roleId: AgentTeamRoleId): {
  modelId: string;
  candidateId: string;
  maxTokens: number;
} {
  if (roleId === "context_scout") {
    return {
      modelId: "moonshotai/kimi-k2.6",
      candidateId: "kimi-2-6-coding-candidate",
      maxTokens: 4_000,
    };
  }
  if (roleId === "test_engineer" || roleId === "observability_scribe") {
    return {
      modelId: "deepseek/deepseek-v4-flash",
      candidateId: "deepseek-v4-coding-candidate",
      maxTokens: 2_000,
    };
  }
  return {
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    maxTokens: 3_600,
  };
}

function boolFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function kimiPatchPrompt(input: {
  taskSummary: string;
  allowedFileRefs: string[];
  fileSnapshots?: Array<{
    path: string;
    contentHash: string;
    boundedContent: string;
    truncated: boolean;
  }>;
  contextPackRefs: string[];
  validationCommandRefs: string[];
  previousFailureSummary?: string;
  attempt?: number;
}): string {
  return [
    "Return strict compact JSON only for a Kimi implementation patch proposal.",
    "You are one OpenClaw implementation worker with a bounded main-repo file editing loop.",
    "Do not store or repeat raw prompts, raw responses, transcripts, provider logs, command logs, secrets, or hidden reasoning.",
    "Do not deploy, send outbound messages, grant authority, mutate Work Queue lifecycle, promote models, or edit outside scope.",
    "Your job is not to complete the full project. Complete exactly one small standard edit and leave complex follow-up to Codex.",
    "Use the supplied bounded file snapshots to inspect the target file, write a short editPlan, and return one complete create_file/replace_file edit, one replace_text edit with exact oldText/newText snippets, one unified-diff patch edit, or a SEARCH/REPLACE block if that is shorter.",
    "If this is a repair attempt, address the previous bounded failure directly.",
    "Do not choose needs_review merely because you are uncertain. If the file snapshot and target refs are sufficient, make the smallest safe patch.",
    "Use status needs_review with no fileEdits only for a concrete blocker such as missing target snapshot, conflicting acceptance criteria, out-of-scope file, or validation impossible.",
    "Return the JSON object as the entire response, with no markdown and no prose.",
    `Attempt: ${input.attempt ?? 1}`,
    `Allowed file refs: ${input.allowedFileRefs.join(", ")}`,
    `Context refs: ${input.contextPackRefs.join(", ")}`,
    `Validation refs: ${input.validationCommandRefs.join(", ")}`,
    input.previousFailureSummary
      ? `Previous bounded failure summary: ${bounded(input.previousFailureSummary, 1_500)}`
      : "Previous bounded failure summary: none",
    "Bounded file snapshots:",
    ...(input.fileSnapshots ?? []).flatMap((snapshot) => [
      `--- ${snapshot.path} sha256:${snapshot.contentHash} truncated:${snapshot.truncated ? "true" : "false"} ---`,
      snapshot.boundedContent || "<missing-or-empty>",
    ]),
    "JSON shape:",
    "{",
    '  "schemaVersion": "openclaw.kimi.patch-proposal.v1",',
    '  "status": "patch_proposed",',
    '  "editPlan": "short bounded plan for the exact target file edit",',
    '  "fileEdits": [{"path": "relative/path.ts", "operation": "replace_text", "oldText": "exact existing snippet", "newText": "replacement snippet", "rationale": "bounded reason"}],',
    '  "validationCommandRefs": ["bounded validation command ref"],',
    '  "limitations": ["bounded string"],',
    '  "rawPromptStored": false,',
    '  "rawResponseStored": false,',
    '  "rawProviderLogStored": false',
    "}",
    "If you use status needs_review, include escalationReason with the concrete blocker. Generic uncertainty is not enough.",
    "If JSON is hard, return a single fenced diff or a SEARCH/REPLACE block for exactly one target file. Do not include commentary that is not part of the edit proposal.",
    "",
    `Task summary: ${bounded(input.taskSummary, 2_000)}`,
  ].join("\n");
}

function rolePrompt(input: {
  roleId: AgentTeamRoleId;
  objective: string;
  graphId: string;
  artifactRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  assignment: string;
  workOrder?: ChildWorkOrder | null;
}): string {
  return [
    "Return strict compact JSON only for an OpenClaw role invocation.",
    "Do not include raw prompts, raw responses, transcripts, provider logs, command logs, tool logs, secrets, or hidden reasoning.",
    "Do not claim deploy, outbound send, model promotion, authority grant, Work Queue lifecycle mutation, or DB mutation.",
    `roleId: ${input.roleId}`,
    `assignment: ${input.assignment}`,
    input.workOrder ? `childWorkOrder: ${bounded(JSON.stringify(input.workOrder), 2_500)}` : null,
    `objective: ${input.objective}`,
    `graphId: ${input.graphId}`,
    `artifactRefs: ${input.artifactRefs.join(", ")}`,
    `changedFileRefs: ${input.changedFileRefs.join(", ")}`,
    `validationRefs: ${input.validationRefs.join(", ")}`,
    input.roleId === "context_scout"
      ? [
          "For context_scout, include these optional bounded fields if you can:",
          '  "relevantFiles": [{"path":"relative/file.ts","whyRelevant":"bounded","keySymbolsOrFunctions":["symbol"]}],',
          '  "existingPatterns": ["bounded"],',
          '  "risks": ["bounded"],',
          '  "recommendedEditPoints": [{"path":"relative/file.ts","symbolOrRegion":"bounded","reason":"bounded"}],',
          '  "validationSuggestions": ["bounded validation ref"],',
          '  "handoffSummaryForImplementation": "bounded handoff summary",',
        ].join("\n")
      : null,
    "Shape:",
    "{",
    '  "whatIActuallyDid": "bounded role-specific work and judgment",',
    '  "evidenceRefs": ["supplied bounded refs only"],',
    '  "filesOrArtifactsTouched": ["supplied file or artifact refs"],',
    '  "validationIPerformed": "bounded validation/readback evidence",',
    '  "whatWorked": ["bounded string"],',
    '  "whatWasWeakOrFailed": ["bounded string"],',
    '  "recommendedNextStep": "bounded string",',
    '  "confidence": "low | medium | high",',
    '  "limitations": ["bounded string"]',
    "}",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
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
  return {};
}

function stringArray(value: unknown, fallback: string[] = [], maxItems = 12): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const values = source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 260))
    .slice(0, maxItems);
  return values.length > 0 ? values : fallback.slice(0, maxItems);
}

function roleCloseout(input: {
  roleId: AgentTeamRoleId;
  modelRef: string;
  modelRunRef: string;
  assignment: string;
  responseText: string | null;
  fallbackArtifactRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
}): CloseoutCapsuleRoleCloseout {
  const parsed = parseJsonObject(input.responseText);
  return {
    roleId: input.roleId,
    agentId: input.roleId,
    modelRef: input.modelRef,
    modelRunRef: input.modelRunRef,
    source: "model",
    askedToDo: input.assignment,
    actuallyDid: bounded(
      typeof parsed.whatIActuallyDid === "string"
        ? parsed.whatIActuallyDid
        : `${input.roleId} completed a bounded OpenClaw role invocation.`,
      1_200,
    ),
    whatIWasAskedToDo: input.assignment,
    whatIActuallyDid: bounded(
      typeof parsed.whatIActuallyDid === "string"
        ? parsed.whatIActuallyDid
        : `${input.roleId} completed a bounded OpenClaw role invocation.`,
      1_200,
    ),
    evidenceRefs: stringArray(parsed.evidenceRefs, input.fallbackArtifactRefs, 12),
    filesOrArtifactsTouched: stringArray(
      parsed.filesOrArtifactsTouched,
      [...input.changedFileRefs, ...input.fallbackArtifactRefs],
      20,
    ),
    validationIPerformed: bounded(
      typeof parsed.validationIPerformed === "string"
        ? parsed.validationIPerformed
        : input.validationRefs.join("; "),
      800,
    ),
    worked: stringArray(parsed.whatWorked, ["bounded role invocation completed"], 8),
    failedOrWeak: stringArray(
      parsed.whatWasWeakOrFailed,
      ["broader parity soak remains the next proof"],
      8,
    ),
    wouldImproveNext: [
      bounded(
        typeof parsed.recommendedNextStep === "string"
          ? parsed.recommendedNextStep
          : "Continue through the long-form UX parity proof.",
        500,
      ),
    ],
    recommendedNextStep: bounded(
      typeof parsed.recommendedNextStep === "string"
        ? parsed.recommendedNextStep
        : "Continue through the long-form UX parity proof.",
      500,
    ),
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence:
      parsed.confidence === "low" || parsed.confidence === "high" ? parsed.confidence : "medium",
    limitations: stringArray(parsed.limitations, ["bounded parity proof scope"], 8),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function bridgeCloseout(input: {
  result: AgentTeamImplementationBridgeRunResult;
  assignment: string;
}): CloseoutCapsuleRoleCloseout {
  const validationPerformed =
    input.result.validationRefs.length > 0
      ? input.result.validationRefs.join("; ").slice(0, 800)
      : input.result.status === "completed"
        ? "Implementation completed; validation evidence is recorded on adjacent runtime artifacts."
        : "No validation refs were produced by this implementation attempt; escalation or review is required.";
  return {
    roleId: "implementation_engineer",
    agentId: "implementation_engineer",
    modelRef: input.result.modelRef,
    modelRunRef: input.result.modelRunRef,
    source: "model",
    askedToDo: input.assignment,
    actuallyDid: bounded(input.result.summary, 1_200),
    whatIWasAskedToDo: input.assignment,
    whatIActuallyDid: bounded(input.result.summary, 1_200),
    evidenceRefs: input.result.artifactRefs.slice(0, 12),
    filesOrArtifactsTouched: input.result.changedFileRefs.slice(0, 20),
    validationIPerformed: validationPerformed,
    worked: ["implementation ran through the Codex parity runtime adapter"],
    failedOrWeak:
      input.result.status === "completed"
        ? ["broader parity soak remains the next proof"]
        : input.result.reasonCodes.slice(0, 6),
    wouldImproveNext: ["continue validation and review through Runtime Work Graph"],
    recommendedNextStep: "Continue validation and review through Runtime Work Graph.",
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence: input.result.status === "completed" ? "high" : "medium",
    limitations: ["implementation authority is bounded to approved repo scope"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function kimiToImplementationResult(input: {
  result: KimiFileImplementationAdapterResult | KimiMicrotaskImplementationExecutorResult;
  startedAt: string;
  completedAt: string;
}): AgentTeamImplementationBridgeRunResult {
  const responseHash = sha256Text(JSON.stringify(input.result));
  const completed = input.result.status === "completed";
  return {
    status: completed ? "completed" : "needs_review",
    transportKind: "live_model",
    modelRef: input.result.modelRef,
    providerPath: input.result.providerPath,
    modelRunRef:
      input.result.modelRunRef ??
      `openrouter://${input.result.modelRef}/${responseHash.slice(0, 16)}`,
    responseHash,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    latencyMs: Math.max(0, Date.parse(input.completedAt) - Date.parse(input.startedAt)),
    summary: completed
      ? "Kimi produced a scoped standard implementation edit with validation evidence."
      : "Kimi attempted a bounded implementation microtask and escalated with parser/validation diagnostics.",
    changedFileRefs: input.result.changedFileRefs,
    validationRefs: input.result.validationRefs,
    artifactRefs: input.result.artifactRefs,
    reasonCodes: input.result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

class CodexDynamicJsonClient implements DynamicCodingTeamModelClient {
  private readonly executor: CodexAppServerJsonExecutor;

  constructor(private readonly repoRoot: string) {
    this.executor = new CodexAppServerJsonExecutor({
      cwd: repoRoot,
      requestTimeoutMs: 900_000,
      reasoningEffort: "xhigh",
    });
  }

  async runJson(input: Parameters<DynamicCodingTeamModelClient["runJson"]>[0]) {
    const request: JsonModelExecutionRequest = {
      contract: {
        contractName: "runtime_work_graph_orchestrator_plan",
        contractVersion: "v1",
        modelId: input.modelRef,
      },
      systemPrompt: input.systemPrompt,
      userPrompt: stringifyJson(input.userPayload),
      responseFormat: "json",
      responseOptions: {
        transport: { type: "json_object" },
        reasoningEffort: "xhigh",
      },
    };
    const started = Date.now();
    const response = await this.executor.execute(request);
    return {
      modelRunRef: `codex-app-server://${input.modelRef}/${sha256Text(response.outputText).slice(0, 16)}`,
      responseText: response.outputText,
      responseHash: sha256Text(response.outputText),
      latencyMs: Date.now() - started,
      rawPromptStored: false,
      rawResponseStored: false,
    } as const;
  }
}

export type DynamicAgentTeamGraphRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  workQueue?: WorkQueueRepository;
  workerId: string;
  sourcePromptSessionRoots?: string[];
  roleModelClient: AgentTeamModelClient;
  orchestratorModelClient?: DynamicCodingTeamModelClient;
  missionContractModelClient?: DynamicCodingTeamModelClient;
  validationRunner?: DynamicValidationRunner;
  implementationBridge: AgentTeamImplementationBridge;
  kimiImplementationAdapter?: AgentTeamKimiImplementationAdapter;
  runtimeToolKernel?: RuntimeToolKernel | null;
  requireSchedulerToolKernel?: boolean;
  closeoutReporter?: {
    createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
  };
  now?: () => Date;
};

export class DynamicAgentTeamGraphRunner {
  private readonly now: () => Date;

  constructor(private readonly options: DynamicAgentTeamGraphRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private async runSchedulerBacked(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const payload =
      job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : {};
    const workflowId =
      typeof payload.workflowId === "string" ? payload.workflowId : "agent_team.coding";
    const teamRunId =
      typeof payload.teamRunId === "string" ? payload.teamRunId : `team-run-${job.jobId}`;
    const objectiveResolution = await resolveRuntimeObjective(payload, {
      sessionSearchRoots: this.options.sourcePromptSessionRoots,
    });
    const objective = objectiveResolution.objectiveForEvidence;
    const objectiveScope = resolveCodingTeamObjectiveScope({
      objectiveForModel: objectiveResolution.objectiveForModel,
      objectiveForEvidence: objective,
      fallbackRepoScopePaths: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
        "scripts/",
      ],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
    });
    const permissionEvidence = createWorkflowPermissionReadback({
      workflowId,
      authorityProfile:
        typeof payload.authorityProfile === "string" ? payload.authorityProfile : "local_yolo",
    });
    const graphId = `${teamRunId}-runtime-work-graph`;
    const existingGraphSnapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(graphId);
    const graph =
      existingGraphSnapshot?.graph ??
      (await this.options.runtimeWorkGraphs.createGraph({
        graphId,
        parentWorkItemId: job.workItemId,
        rootRuntimeJobId: job.jobId,
        workflowId,
        orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        graphStatus: "running",
        metadata: {
          schedulerBackedProductionPath: true,
          legacyFixedOuterSequenceUsed: false,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }));

    let progressCounter = 0;
    const artifactRefs: string[] = [];
    const changedFileRefs: string[] = [];
    const validationRefs: string[] = [];
    const roleCloseouts: CloseoutCapsuleRoleCloseout[] = [];
    const roleEvidence: AgentTeamRoleExecutionEvidence[] = [];
    const closeoutRefs: string[] = [];
    const missionLedgerRefs: string[] = [];
    let latestMissionLedger: MissionContractLedger | null = null;
    let schedulerCloseoutCapsule: CloseoutCapsuleReporterResult["capsule"] | null = null;
    let schedulerCloseoutModelAuthored = false;
    const nodeResultById = new Map<string, RuntimeWorkGraphNodeExecutionResult>();

    const attachProgress = async (input: {
      stage: string;
      status: "started" | "completed" | "needs_review" | "failed" | "waiting_for_human";
      roleId?: string;
      nodeId?: string;
      artifactRefs?: string[];
      reasonCodes?: string[];
      currentObjective?: string | null;
      whyThisNodeWasChosen?: string | null;
      activeNodeKind?: string | null;
      capabilityId?: string | null;
      selectedCapabilityId?: string | null;
      capabilityCostClass?: string | null;
      capabilityUtilityRationale?: string | null;
      capabilityCostRationale?: string | null;
      whyCheaperOptionsWereInsufficient?: string | null;
      consideredCapabilityIds?: string[];
      modelRef?: string | null;
      providerPath?: string | null;
      changedFileRefs?: string[];
      validationRefs?: string[];
      targetRefs?: string[];
      inputHandoffRefs?: string[];
      expectedOutput?: string | null;
      acceptanceCriteria?: string[];
      currentPhase?: string | null;
      validationState?: string | null;
      evidenceProducedRefs?: string[];
      evidenceClaimRefs?: string[];
      commitmentIdsAdvanced?: string[];
      remainingOpenCommitmentIds?: string[];
      acceptedCommitmentIds?: string[];
      rejectedCommitmentIds?: string[];
      nextDecisionNeeded?: string | null;
      blockerSummary?: string | null;
      eli5Progress?: string | null;
      finalizationState?: string | null;
      latestToolEventKind?: string | null;
      schedulerPhase?: string | null;
      schedulerToolId?: string | null;
      schedulerToolInvocationRefs?: string[];
    }): Promise<string> => {
      progressCounter += 1;
      const ref = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-progress/${String(progressCounter).padStart(3, "0")}-${input.stage}`;
      const metadata = {
        artifactKind: "agent_team_scheduler_progress",
        graphId: graph.graphId,
        runtimeJobId: job.jobId,
        teamRunId,
        stage: input.stage,
        status: input.status,
        roleId: input.roleId ?? null,
        nodeId: input.nodeId ?? null,
        artifactRefs: (input.artifactRefs ?? []).slice(0, 12),
        reasonCodes: (input.reasonCodes ?? []).slice(0, 12),
        currentObjective: input.currentObjective ?? null,
        whyThisNodeWasChosen: input.whyThisNodeWasChosen ?? null,
        activeNodeKind: input.activeNodeKind ?? null,
        capabilityId: input.capabilityId ?? null,
        selectedCapabilityId: input.selectedCapabilityId ?? null,
        capabilityCostClass: input.capabilityCostClass ?? null,
        capabilityUtilityRationale: input.capabilityUtilityRationale ?? null,
        capabilityCostRationale: input.capabilityCostRationale ?? null,
        whyCheaperOptionsWereInsufficient: input.whyCheaperOptionsWereInsufficient ?? null,
        consideredCapabilityIds: (input.consideredCapabilityIds ?? []).slice(0, 12),
        modelRef: input.modelRef ?? null,
        providerPath: input.providerPath ?? null,
        changedFileRefs: (input.changedFileRefs ?? []).slice(0, 20),
        validationRefs: (input.validationRefs ?? []).slice(0, 20),
        targetRefs: (input.targetRefs ?? []).slice(0, 12),
        inputHandoffRefs: (input.inputHandoffRefs ?? []).slice(0, 12),
        expectedOutput: input.expectedOutput ?? null,
        acceptanceCriteria: (input.acceptanceCriteria ?? []).slice(0, 12),
        currentPhase: input.currentPhase ?? null,
        validationState: input.validationState ?? null,
        evidenceProducedRefs: (input.evidenceProducedRefs ?? []).slice(0, 12),
        evidenceClaimRefs: (input.evidenceClaimRefs ?? []).slice(0, 20),
        commitmentIdsAdvanced: (input.commitmentIdsAdvanced ?? []).slice(0, 12),
        remainingOpenCommitmentIds: (input.remainingOpenCommitmentIds ?? []).slice(0, 12),
        acceptedCommitmentIds: (input.acceptedCommitmentIds ?? []).slice(0, 12),
        rejectedCommitmentIds: (input.rejectedCommitmentIds ?? []).slice(0, 12),
        nextDecisionNeeded: input.nextDecisionNeeded ?? null,
        blockerSummary: input.blockerSummary ?? null,
        eli5Progress: input.eli5Progress ?? null,
        finalizationState: input.finalizationState ?? null,
        latestToolEventKind: input.latestToolEventKind ?? null,
        schedulerPhase: input.schedulerPhase ?? null,
        schedulerToolId: input.schedulerToolId ?? null,
        schedulerToolInvocationRefs: (input.schedulerToolInvocationRefs ?? []).slice(0, 20),
        recordedAt: this.now().toISOString(),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogsStored: false,
        workQueueLifecycleMutated: false,
      };
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: metadata as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.scheduler_progress",
        data: metadata as unknown as JsonValue,
      });
      return ref;
    };

    const queueStatusForNodeStatus = (
      nodeStatus: TeamGraphNodeStatus,
    ): "active" | "closed" | "needs_review" | "blocked" => {
      if (nodeStatus === "succeeded" || nodeStatus === "skipped") {
        return "closed";
      }
      if (nodeStatus === "needs_review" || nodeStatus === "waiting_for_human") {
        return "needs_review";
      }
      if (nodeStatus === "failed") {
        return "blocked";
      }
      return "active";
    };

    const syncGraphNodeToWorkQueue = async (input: {
      node: TeamGraphNode;
      nodeStatus?: TeamGraphNodeStatus;
      evidenceRefs?: string[];
      reasonCodes?: string[];
    }): Promise<void> => {
      if (!this.options.workQueue || !job.workItemId) {
        return;
      }
      const metadata =
        input.node.metadata &&
        typeof input.node.metadata === "object" &&
        !Array.isArray(input.node.metadata)
          ? (input.node.metadata as Record<string, unknown>)
          : {};
      const title =
        typeof metadata.expectedOutput === "string" && metadata.expectedOutput.trim()
          ? metadata.expectedOutput.trim()
          : `${input.node.nodeKind} - ${input.node.assignedRole}`;
      const sync = await this.options.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: job.workItemId,
        graphId: graph.graphId,
        nodeId: input.node.nodeId,
        nodeKind: input.node.nodeKind,
        assignedRole: input.node.assignedRole,
        assignedWorkflow: workflowId,
        queueStatus: queueStatusForNodeStatus(input.nodeStatus ?? input.node.nodeStatus),
        title: bounded(title, 180),
        runtimeJobId: job.jobId,
        humanTaskId: input.node.humanTaskId,
        graphNodeRef: `runtime-work-graph://${graph.graphId}/node/${input.node.nodeId}`,
        evidenceRefs: input.evidenceRefs ?? input.node.outputArtifactRefs,
        blockerReasonCodes: input.reasonCodes ?? [],
        actorId: "system:runtime-work-graph-scheduler",
      });
      await attachProgress({
        stage: "work_queue_child_sync",
        status: "completed",
        roleId: input.node.assignedRole,
        nodeId: input.node.nodeId,
        artifactRefs: [`work-queue://${sync.childWorkItemId}`],
        reasonCodes: [
          sync.created ? "work_queue_child_created" : "work_queue_child_updated",
          `work_queue_child_status:${queueStatusForNodeStatus(
            input.nodeStatus ?? input.node.nodeStatus,
          )}`,
        ],
      });
    };

    const missionModelClient =
      this.options.missionContractModelClient ??
      (process.env.NODE_ENV === "test"
        ? null
        : (this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot())));

    const attachMissionLedger = async (
      ledger: MissionContractLedger,
      reasonCodes: string[],
    ): Promise<string> => {
      const ref = missionContractLedgerArtifactRef({
        runtimeJobId: job.jobId,
        missionId: ledger.missionId,
        revision: missionLedgerRefs.length + 1,
      });
      const metadata = {
        ...(missionContractLedgerToJson(ledger) as Record<string, unknown>),
        ledgerHash: missionContractLedgerHash(ledger),
        reasonCodes: reasonCodes.slice(0, 12),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: metadata as JsonValue,
      });
      missionLedgerRefs.push(ref);
      artifactRefs.push(ref);
      return ref;
    };

    const createMissionLedger = async (): Promise<MissionContractLedger | null> => {
      if (!missionModelClient) {
        return null;
      }
      const response = await missionModelClient.runJson({
        modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
        systemPrompt: [
          "You are the OpenClaw Mission Contract author.",
          "Convert the owner's bounded objective into a model-authored Mission Contract Ledger.",
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
          missionId: `${teamRunId}-mission-contract`,
          runtimeJobId: job.jobId,
          workItemId: job.workItemId ?? null,
          ownerObjectiveSummary: objective.slice(0, 8_000),
          repoScopeRefs: objectiveScope.approvedRepoScopePaths,
          validationCommandRefs: objectiveScope.approvedValidationCommands,
          requestedShape: {
            blockingCommitments: [
              {
                commitmentId: "bounded-stable-id",
                commitmentText: "opaque model-authored owner mission requirement",
                whyItMatters: "bounded rationale",
                expectedEvidenceDescription: "bounded evidence expectation",
                status: "pending",
                blocking: true,
              },
            ],
            nonBlockingCommitments: [],
            explicitNonGoals: [],
            safetyConstraints: [],
            prohibitedDirectiveCandidates: [],
            authorityBoundary: {
              requestedAuthority: null,
              maximumAuthority: "workflow_default",
              requiresApproval: false,
              approvalRefs: [],
              authorityRefs: [],
              rawPromptStored: false,
              rawResponseStored: false,
            },
            storagePolicy: {
              rawPromptStorageAllowed: false,
              rawResponseStorageAllowed: false,
              rawTranscriptStorageAllowed: false,
              rawProviderLogStorageAllowed: false,
              rawToolLogStorageAllowed: false,
              rawDbRowStorageAllowed: false,
              secretsStorageAllowed: false,
              boundedRefsOnly: true,
            },
            lifecycleBoundary: {
              workQueueLifecycleMutationAllowed: false,
              authorityGrantAllowed: false,
              deployAllowed: false,
              outboundSendAllowed: false,
              modelPromotionAllowed: false,
              runtimeJobLifecycleOwner: "runtime_jobs",
            },
            missionGate: "clear_to_execute",
            missionGateRationale: "bounded rationale",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
        maxOutputTokens: 4_000,
        timeoutMs: 300_000,
      });
      const ledger = normalizeMissionContractLedger({
        value: parseJsonObject(response.responseText),
        missionId: `${teamRunId}-mission-contract`,
        sourceRuntimeJobId: job.jobId,
        sourceWorkItemId: job.workItemId ?? null,
        ownerObjectiveSummary: objective,
      });
      latestMissionLedger = ledger;
      await attachMissionLedger(ledger, ["mission_contract_ledger_created"]);
      return ledger;
    };

    const evaluateMissionLedger = async (input: {
      ledger: MissionContractLedger;
      outputArtifactRefs: string[];
      evidenceClaims: CommitmentEvidenceClaim[];
      reasonCodes: string[];
    }): Promise<MissionContractLedger> => {
      if (!missionModelClient) {
        return input.ledger;
      }
      const evidenceClaimRefs = [
        ...new Set(input.evidenceClaims.map((claim) => claim.evidenceRef)),
      ].slice(0, 30);
      if (evidenceClaimRefs.length === 0) {
        const updated = {
          ...input.ledger,
          ledgerStatus: "needs_review" as const,
        };
        latestMissionLedger = updated;
        await attachMissionLedger(updated, [
          "mission_contract_evidence_claims_missing",
          "mission_contract_evaluation_skipped_without_claims",
        ]);
        return updated;
      }

      const runEvaluationAttempt = async (repair: {
        attempt: number;
        priorErrorHash?: string | null;
      }) =>
        missionModelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Mission Contract evaluator.",
            "Review only bounded refs, evidence claims, and summaries. Do not infer from raw logs, raw artifacts, or hidden reasoning.",
            "Return strict JSON matching MissionCommitmentEvaluation.",
            "Judge whether each commitment is satisfied, partially_satisfied, impossible, pending, or needs_review.",
            "Accepted evidence must come from explicit evidenceClaims only. Do not accept generic artifact refs that were not claimed against a commitment.",
            "Do not rewrite evidence, do not create runtime success, and do not mutate Work Queue lifecycle.",
            "Use false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
            repair.attempt > 0
              ? `This is repair attempt ${repair.attempt}. The previous structural error hash was ${repair.priorErrorHash}. Return only the required JSON shape.`
              : null,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          userPayload: {
            missionLedger: summarizeMissionContractLedger(input.ledger),
            evidenceClaims: input.evidenceClaims
              .map((claim) => ({
                commitmentId: claim.commitmentId,
                evidenceRef: claim.evidenceRef,
                evidenceKind: claim.evidenceKind,
                claimSummary: bounded(claim.claimSummary, 500),
                limitations: claim.limitations.slice(0, 8),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }))
              .slice(0, 30),
            candidateEvidenceRefs: evidenceClaimRefs,
            unclaimedOutputArtifactRefs: input.outputArtifactRefs
              .filter((ref) => !evidenceClaimRefs.includes(ref))
              .slice(0, 12),
            nodeReasonCodes: input.reasonCodes.slice(0, 12),
            changedFileRefs: changedFileRefs.slice(0, 30),
            validationRefs: validationRefs.slice(0, 30),
            closeoutRefs: closeoutRefs.slice(0, 10),
            requestedShape: {
              artifactKind: "mission_commitment_evaluation",
              schemaVersion: "execution-platform.mission-contract-ledger.v1",
              evaluationId: `${input.ledger.missionId}-eval`,
              missionId: input.ledger.missionId,
              commitmentUpdates: [],
              revisionProposals: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 4_000,
          timeoutMs: 300_000,
        });

      let response = await runEvaluationAttempt({ attempt: 0 });
      let priorError: unknown = null;
      for (const attempt of [0, 1]) {
        try {
          const evaluation = parseMissionCommitmentEvaluation({
            ...parseJsonObject(response.responseText),
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            missionId: input.ledger.missionId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          const evaluationRef = `runtime-job://${job.jobId}/mission-contract-evaluation/${evaluation.evaluationId}`;
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE,
            storageKind: "metadata",
            uri: evaluationRef,
            contentType: "application/json",
            metadata: evaluation as unknown as JsonValue,
          });
          artifactRefs.push(evaluationRef);
          const updated = applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: evidenceClaimRefs,
          });
          latestMissionLedger = updated;
          await attachMissionLedger(updated, [
            "mission_contract_ledger_evaluated",
            "mission_contract_evidence_claims_evaluated",
          ]);
          return updated;
        } catch (error) {
          priorError = error;
          if (attempt === 0) {
            response = await runEvaluationAttempt({
              attempt: 1,
              priorErrorHash: sha256Text(error instanceof Error ? error.message : String(error)),
            });
            continue;
          }
        }
      }
      {
        const updated = {
          ...input.ledger,
          ledgerStatus: "needs_review" as const,
        };
        const diagnosticRef = `runtime-job://${job.jobId}/mission-contract-evaluation/diagnostic-${sha256Text(
          `${input.ledger.missionId}:${Date.now()}:${
            priorError instanceof Error ? priorError.message : String(priorError)
          }`,
        ).slice(0, 12)}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.mission_contract_evaluation_diagnostic",
          storageKind: "metadata",
          uri: diagnosticRef,
          contentType: "application/json",
          metadata: {
            artifactKind: "mission_contract_evaluation_diagnostic",
            missionId: input.ledger.missionId,
            errorKind: priorError instanceof Error ? priorError.name : "unknown_error",
            errorMessageHash: sha256Text(
              priorError instanceof Error ? priorError.message : String(priorError),
            ),
            newEvidenceRefs: input.outputArtifactRefs.slice(0, 20),
            evidenceClaimRefs,
            nodeReasonCodes: input.reasonCodes.slice(0, 12),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
        });
        artifactRefs.push(diagnosticRef);
        latestMissionLedger = updated;
        await attachMissionLedger(updated, [
          "mission_contract_evaluation_invalid",
          "mission_contract_evaluation_diagnostic_recorded",
        ]);
        return updated;
      }
    };

    const addRoleEvidence = (input: {
      roleId: AgentTeamRoleId;
      modelRef: string;
      providerPath: string;
      transportKind: string;
      modelRunRef: string;
      responseHash: string;
      startedAt: string;
      completedAt: string;
      latencyMs: number;
      assignedTaskSummary: string;
      producedArtifactRefs: string[];
    }) => {
      roleEvidence.push({
        roleId: input.roleId,
        agentId: input.roleId,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        transportKind: input.transportKind as AgentTeamRoleExecutionEvidence["transportKind"],
        modelRunRef: input.modelRunRef,
        responseHash: input.responseHash,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        latencyMs: input.latencyMs,
        assignedTaskSummary: input.assignedTaskSummary,
        producedArtifactRefs: input.producedArtifactRefs.slice(0, 20),
        rawPromptStored: false,
        rawResponseStored: false,
      });
    };

    const metadataStringArray = (metadata: Record<string, unknown>, key: string): string[] =>
      stringArray(metadata[key], [], 12);

    const schedulerOrchestrator: RuntimeWorkGraphSchedulerOrchestrator = {
      decide: async (input) => {
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        const capabilityRegistrySummary =
          input.capabilityRegistrySummary ?? runtimeNodeCapabilityManifestForModel();
        const response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Runtime Work Graph scheduler orchestrator.",
            "Choose exactly one next graph action from current bounded graph state.",
            "Return strict JSON matching OrchestratorGraphDecision.",
            "Required top-level fields: decisionId, decisionKind, rationaleForDecision, reasonCodes, rawPromptStored, rawResponseStored, rawProviderLogStored, workQueueLifecycleMutated.",
            "Valid decisionKind values include add_nodes, run_node, split_node, retry_node, rerun_role, request_context, request_validation, request_review, request_human_decision, escalate_worker, repair_from_validation, create_closeout, mark_needs_review, mark_blocked.",
            "For new nodes choose capabilityId from runtimeNodeCapabilityManifest and include nodeId, capabilityId, graphNodeKind/nodeKind if known, assignedRole, modelOrWorkerRef, expectedOutput, acceptanceCriteria, downstreamConsumer, targetRefs, and metadata.",
            "For complex missions every new node must include these per-node commitment contract fields, either at the node top level, metadata, or taskDetails: commitmentIdsAdvanced, whyThisRoleIsNeededNow, exactObjective, and evidenceExpectation.",
            'Example new node shape: {"nodeId":"context-1","capabilityId":"context_scout","assignedRole":"context_scout","expectedOutput":"Bounded file/context handoff","acceptanceCriteria":["Cites target refs"],"downstreamConsumer":"implementation_engineer","commitmentIdsAdvanced":["wire-workflow-to-scheduler"],"whyThisRoleIsNeededNow":"Implementation needs repo facts before editing","exactObjective":"Identify files and patterns for scheduler wiring","evidenceExpectation":"Context handoff artifact with target refs","targetRefs":["extensions/execution-platform/src/workflows/"]}.',
            "Capability IDs are not executable node kinds. If unsure, return selectedCapabilities with capabilityId and task details; the runtime compiler will create canonical graph node envelopes.",
            "If you use selectedCapabilities, put the same concrete assignment fields in taskDetails: nodeId, expectedOutput, acceptanceCriteria, downstreamConsumer, commitmentIdsAdvanced, whyThisRoleIsNeededNow, exactObjective, evidenceExpectation, and targetRefs.",
            "For add_nodes, split_node, request_context, request_validation, request_review, request_human_decision, escalate_worker, and rerun_role, include at least one concrete newNodes entry.",
            "Set runAfterAdd true only when the node should run immediately after creation; otherwise the scheduler will request another orchestrator decision.",
            "For run_node, retry_node, and repair_from_validation, include runNodeId or targetNodeId.",
            "Use booleans false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
            "Do not inject generic proof-shaped nodes. If you cannot choose a concrete next action, mark_needs_review.",
            "If a Mission Contract Ledger is present, choose actions that advance specific open commitments and include commitmentIdsAdvanced plus expectedEvidenceDescription.",
            "Use the runtimeNodeCapabilityManifest to choose the smallest capable node. Prefer Kimi implementation_microtask for scoped source/test edits, strong Codex implementation_complex for broad/failed/escalated edits, test_authoring when tests must be written, and human_decision when owner input is needed.",
            "Every new node and every run/retry/repair decision must include cost-aware utility evidence: consideredCapabilityIds, selectedCapabilityId, selectedNodeKind, selectedExecutorKey, targetCommitmentIds, utilityRationale, costRationale, whyThisIsNotDuplicateWork, expectedEvidence, expectedDownstreamConsumer, and stopOrEscalationCondition.",
            "If the selected capability has productionSelectionRequiresQualification true, include selectedModelQualificationProfileId and qualificationEvidenceRefs from the capability manifest/matrix. Do not select an unqualified non-Codex worker for production source edits.",
            "If you select a premium or broad Codex capability while cheaper same-role capabilities exist, include whyCheaperOptionsWereInsufficient. Do not choose Codex just because it is strongest; choose the cheapest sufficiently capable node that advances a commitment, reduces uncertainty, enables parallel work, or produces evidence needed for closure.",
            "For run_node, retry_node, or repair_from_validation, put the same cost-aware utility evidence in decision metadata as utilityDecision or costAwareUtilityDecision.",
            "If rejectedDecisionReasonCodes or rejectedDecisionDiagnostics are present, repair the exact structural issue and cite the failed decision id; do not switch to generic fallback nodes.",
            "Do not self-execute work in the orchestrator. The orchestrator selects nodes and reviews evidence; worker nodes do the implementation, research, validation, or closeout work.",
            "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          ].join("\n"),
          userPayload: {
            graphId: input.graphId,
            iteration: input.iteration,
            ownerObjectiveSummary: objective.slice(0, 4_000),
            repoScopeRefs: objectiveScope.approvedRepoScopePaths,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            schedulerSnapshot: input.snapshotSummary,
            missionLedgerSummary: input.missionLedgerSummary ?? null,
            runtimeNodeCapabilityManifest: capabilityRegistrySummary,
            nodeResultRefs: [...nodeResultById.entries()].map(([nodeId, result]) => ({
              nodeId,
              status: result.status,
              outputArtifactRefs: result.outputArtifactRefs.slice(0, 8),
              reasonCodes: result.reasonCodes.slice(0, 8),
            })),
            repairAttempt: input.repairAttempt ?? 0,
            rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes ?? [],
            rejectedDecisionDiagnostics: input.rejectedDecisionDiagnostics ?? [],
            rejectedDecisionRef: input.rejectedDecisionRef ?? null,
            allowedTerminalStates: ["create_closeout", "mark_needs_review", "mark_blocked"],
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 4_000,
          timeoutMs: 300_000,
        });
        return parseJsonObject(response.responseText);
      },
    };

    const roleExecutor = (roleId: AgentTeamRoleId): RuntimeWorkGraphNodeExecutor => ({
      execute: async ({ node }) => {
        await attachProgress({
          stage: `${roleId}_node`,
          status: "started",
          roleId,
          nodeId: node.nodeId,
        });
        const metadata = recordValue(node.metadata);
        const policy = roleModelFor(roleId);
        const assignment = bounded(
          typeof metadata.expectedOutput === "string"
            ? metadata.expectedOutput
            : `${roleId} scheduler-selected node execution.`,
          1_000,
        );
        const startedAt = this.now();
        const response = await this.options.roleModelClient.callRole({
          roleId,
          modelId: policy.modelId,
          modelCandidateId: policy.candidateId,
          prompt: rolePrompt({
            roleId,
            objective,
            graphId: graph.graphId,
            artifactRefs: artifactRefs.slice(0, 20),
            changedFileRefs,
            validationRefs,
            assignment,
            workOrder: null,
          }),
          responseFormat: "json_object",
          maxTokens: policy.maxTokens,
        });
        const completedAt = this.now();
        if (response.status !== "succeeded" || !response.responseHash) {
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            reasonCodes: [`${roleId}_model_call_failed`, response.errorReasonCode ?? "unknown"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const closeout = roleCloseout({
          roleId,
          modelRef: policy.modelId,
          modelRunRef: `${teamRunId}-${roleId}-${sha256Text(response.responseHash).slice(0, 8)}`,
          assignment,
          responseText: response.responseText,
          fallbackArtifactRefs: artifactRefs,
          changedFileRefs,
          validationRefs,
        });
        const roleArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-role/${roleId}/${node.nodeId}`;
        const contextScoutOutput =
          roleId === "context_scout"
            ? parseContextScoutOutput({
                responseText: response.responseText,
                targetRefs:
                  metadataStringArray(metadata, "targetRefs").length > 0
                    ? metadataStringArray(metadata, "targetRefs")
                    : objectiveScope.approvedRepoScopePaths,
                validationCommandRefs: objectiveScope.approvedValidationCommands,
              })
            : null;
        const contextScoutShape = contextScoutOutput
          ? validateContextScoutOutputShape(contextScoutOutput)
          : null;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.scheduler_role_invocation",
          storageKind: "metadata",
          uri: roleArtifactRef,
          contentType: "application/json",
          metadata: {
            roleId,
            nodeId: node.nodeId,
            graphId: graph.graphId,
            closeout,
            contextScoutOutput,
            contextScoutShape,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
        });
        const invocation = await this.options.runtimeWorkGraphs.recordRoleInvocation({
          graphId: graph.graphId,
          nodeId: node.nodeId,
          roleId,
          modelRef: policy.modelId,
          providerPath: "openrouter",
          transportKind: "live_model",
          modelRunRef: closeout.modelRunRef ?? `${teamRunId}-${roleId}-model-run`,
          outputHash: response.responseHash,
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          artifactRefs: [roleArtifactRef],
        });
        artifactRefs.push(roleArtifactRef);
        roleCloseouts.push(closeout);
        addRoleEvidence({
          roleId,
          modelRef: policy.modelId,
          providerPath: "openrouter",
          transportKind: "live_model",
          modelRunRef: closeout.modelRunRef ?? `${teamRunId}-${roleId}-model-run`,
          responseHash: response.responseHash,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          assignedTaskSummary: assignment,
          producedArtifactRefs: [
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
          ],
        });
        await attachProgress({
          stage: `${roleId}_node`,
          status: "completed",
          roleId,
          nodeId: node.nodeId,
          artifactRefs: [roleArtifactRef],
          evidenceClaimRefs: [roleArtifactRef],
        });
        const commitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        return {
          status: "succeeded",
          outputArtifactRefs: [
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
          ],
          evidenceClaims: commitmentIds.map((commitmentId) => ({
            commitmentId,
            evidenceRef: roleArtifactRef,
            evidenceKind:
              roleId === "reviewer"
                ? ("review" as const)
                : roleId === "observability_scribe"
                  ? ("readback" as const)
                  : ("artifact" as const),
            claimSummary: `${roleId} produced bounded role evidence for this mission commitment.`,
            limitations: [],
            rawPromptStored: false as const,
            rawResponseStored: false as const,
            rawProviderLogStored: false as const,
          })),
          reasonCodes: [`${roleId}_scheduler_node_completed`],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    });

    const validationExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        const metadata = recordValue(node.metadata);
        const commandRefs =
          metadataStringArray(metadata, "validationCommandRefs").length > 0
            ? metadataStringArray(metadata, "validationCommandRefs")
            : objectiveScope.approvedValidationCommands;
        const runner =
          this.options.validationRunner ??
          ({
            run: async (commandRef: string) => {
              const commandHash = sha256Text(commandRef).slice(0, 16);
              const validationRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-validation/${commandHash}`;
              const parts = commandRef.split(/\s+/u);
              if (parts[0] !== "pnpm" || parts[1] !== "test:file" || parts.length < 3) {
                return {
                  validationRef,
                  status: "not_run" as const,
                  summary: "Unsupported validation command shape.",
                };
              }
              try {
                await execFileAsync("pnpm", parts.slice(1), {
                  cwd: defaultRepoRoot(),
                  env: { ...process.env, NODE_ENV: "test" },
                  timeout: 240_000,
                  maxBuffer: 128 * 1024,
                });
                return { validationRef, status: "passed" as const, summary: "Validation passed." };
              } catch (error) {
                return {
                  validationRef,
                  status: "failed" as const,
                  summary: bounded(error instanceof Error ? error.message : String(error), 1_200),
                };
              }
            },
          } satisfies DynamicValidationRunner);
        const results: Awaited<ReturnType<DynamicValidationRunner["run"]>>[] = [];
        for (const commandRef of commandRefs) {
          const result = await runner.run(commandRef);
          results.push(result);
          validationRefs.push(result.validationRef);
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.scheduler_validation",
            storageKind: "metadata",
            uri: result.validationRef,
            contentType: "application/json",
            metadata: {
              commandRef,
              status: result.status,
              summary: bounded(result.summary, 1_200),
              rawCommandLogsStored: false,
            } as unknown as JsonValue,
          });
        }
        const failed = results.filter((result) => result.status !== "passed");
        const commitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        return {
          status: failed.length === 0 ? "succeeded" : "needs_review",
          outputArtifactRefs: results.map((result) => result.validationRef),
          evidenceClaims:
            failed.length === 0
              ? commitmentIds.flatMap((commitmentId) =>
                  results.map((result) => ({
                    commitmentId,
                    evidenceRef: result.validationRef,
                    evidenceKind: "test_validation" as const,
                    claimSummary: "Validation executor produced passed validation evidence.",
                    limitations: [],
                    rawPromptStored: false as const,
                    rawResponseStored: false as const,
                    rawProviderLogStored: false as const,
                  })),
                )
              : [],
          reasonCodes:
            failed.length === 0
              ? ["scheduler_validation_passed"]
              : ["scheduler_validation_needs_review"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

    const implementationExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        await attachProgress({
          stage: "implementation_node",
          status: "started",
          roleId: "implementation_engineer",
          nodeId: node.nodeId,
        });
        const metadata = recordValue(node.metadata);
        const targetFileRefs = metadataStringArray(metadata, "targetRefs");
        const usesKimi = (node.modelOrWorkerRef ?? "").includes("kimi");
        const startedAt = this.now();
        let result: AgentTeamImplementationBridgeRunResult;
        if (usesKimi) {
          const kimiPatchModelClient: KimiPatchModelClient = {
            proposeFileEdits: async (input) => {
              const started = this.now();
              const response = await this.options.roleModelClient.callRole({
                roleId: "implementation_engineer",
                modelId: input.modelRef,
                modelCandidateId: "kimi-2-6-tool-using-standard-implementation",
                prompt: kimiPatchPrompt(input),
                responseFormat: undefined,
                requestProfileOverride: {
                  responseFormatMode: "prompt_only",
                  reasoningMode: "omit",
                  maxTokens: input.maxOutputTokens,
                },
                maxTokens: input.maxOutputTokens,
                timeoutMs: input.timeoutMs,
                maxAttempts: input.maxProviderAttempts,
              });
              const responseHash =
                response.responseHash ??
                sha256Text(response.errorReasonCode ?? "kimi-file-edit-no-response");
              return {
                modelRunRef: `openrouter://${input.modelRef}/${responseHash.slice(0, 16)}`,
                responseText: response.responseText,
                responseHash,
                latencyMs: Math.max(0, this.now().getTime() - started.getTime()),
                rawPromptStored: false,
                rawResponseStored: false,
              };
            },
          };
          const kimiAdapter =
            this.options.kimiImplementationAdapter ??
            new KimiFileImplementationAdapter({
              modelClient: kimiPatchModelClient,
              validationRunner:
                this.options.validationRunner ??
                ({
                  async run(commandRef: string) {
                    return {
                      validationRef: `validation://${sha256Text(commandRef).slice(0, 16)}`,
                      status: "not_run" as const,
                      summary: "Validation runner was not configured for Kimi scheduler node.",
                    };
                  },
                } satisfies DynamicValidationRunner),
            });
          const generic = await new ModelAgnosticFileEditWorkerAdapter({
            kimiExecutor: new KimiMicrotaskImplementationExecutor({ adapter: kimiAdapter }),
            toolUsingKimiWorkerLoop: this.options.runtimeToolKernel
              ? new NonCodexToolUsingWorkerLoop({
                  runtimeToolKernel: this.options.runtimeToolKernel,
                  modelClient: {
                    nextTurn: async (input) => {
                      const started = this.now();
                      const response = await this.options.roleModelClient.callRole({
                        roleId: "implementation_engineer",
                        modelId: input.modelRef,
                        modelCandidateId: "kimi-2-6-tool-selection",
                        prompt: input.taskSummary,
                        responseFormat: "json_object",
                        requestProfileOverride: {
                          responseFormatMode: "native",
                          reasoningMode: "omit",
                          maxTokens: Math.min(input.maxOutputTokens, 4_000),
                        },
                        maxTokens: Math.min(input.maxOutputTokens, 4_000),
                        timeoutMs: Math.min(input.timeoutMs, 180_000),
                        maxAttempts: 1,
                      });
                      const responseHash =
                        response.responseHash ??
                        sha256Text(response.errorReasonCode ?? "kimi-tool-selection-no-response");
                      return {
                        modelRunRef: `openrouter://${input.modelRef}/tool-selection/${responseHash.slice(0, 16)}`,
                        responseText: response.responseText,
                        responseHash,
                        latencyMs: Math.max(0, this.now().getTime() - started.getTime()),
                        rawPromptStored: false,
                        rawResponseStored: false,
                      };
                    },
                  },
                  patchModelClient: kimiPatchModelClient,
                  validationRunner:
                    this.options.validationRunner ??
                    ({
                      async run(commandRef: string) {
                        return {
                          validationRef: `validation://${sha256Text(commandRef).slice(0, 16)}`,
                          status: "not_run" as const,
                          summary: "Validation runner was not configured for Kimi scheduler node.",
                        };
                      },
                    } satisfies DynamicValidationRunner),
                  patchAdapter: kimiAdapter,
                })
              : undefined,
            runtimeToolKernel: this.options.runtimeToolKernel ?? null,
          }).run({
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            workerKind: "kimi_standard_implementation",
            workerId: "worker.kimi.file-implementation",
            roleId: "implementation_engineer",
            taskId: `${teamRunId}-${node.nodeId}`,
            taskTitle: bounded(
              typeof metadata.title === "string" ? metadata.title : "Scheduler-selected Kimi edit",
              220,
            ),
            exactEditObjective: bounded(
              typeof metadata.exactEditObjective === "string"
                ? metadata.exactEditObjective
                : typeof metadata.expectedOutput === "string"
                  ? metadata.expectedOutput
                  : "Make the scheduler-selected scoped implementation edit.",
              2_000,
            ),
            rationaleForCallingThisRole:
              typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : undefined,
            downstreamConsumer:
              typeof metadata.downstreamConsumer === "string"
                ? metadata.downstreamConsumer
                : undefined,
            expectedOutput:
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : undefined,
            contextScoutHandoff:
              typeof metadata.contextScoutHandoff === "string"
                ? metadata.contextScoutHandoff
                : undefined,
            repoRoot: defaultRepoRoot(),
            allowedFileRefs: objectiveScope.approvedRepoScopePaths,
            targetFileRefs:
              targetFileRefs.length > 0
                ? targetFileRefs
                : objectiveScope.approvedRepoScopePaths.slice(0, 2),
            contextPackRefs: artifactRefs.slice(0, 20),
            validationCommandRefs: objectiveScope.approvedValidationCommands.slice(0, 4),
            acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            budgetPolicy: {
              modelRef: "moonshotai/kimi-k2.6",
              providerPath: "openrouter",
              maxOutputTokens: 8_000,
              timeoutMs: 480_000,
              maxAttempts: 5,
            },
          });
          const source = generic.sourceResult ?? {
            status: generic.status === "applied_change" ? "completed" : "needs_review",
            modelRef: generic.modelRef,
            providerPath: generic.providerPath,
            modelRunRef: generic.modelRunRef,
            changedFileRefs: generic.changedFileRefs,
            diffHash: generic.diffHash,
            validationRefs: generic.validationRefs,
            artifactRefs: generic.artifactRefs,
            reasonCodes: generic.reasonCodes,
          };
          result = kimiToImplementationResult({
            result: source as KimiMicrotaskImplementationExecutorResult,
            startedAt: startedAt.toISOString(),
            completedAt: this.now().toISOString(),
          });
        } else {
          result = await this.options.implementationBridge.run({
            runtimeJob: job,
            teamRunId,
            objective: objectiveResolution.objectiveForModel,
            roleId: "implementation_engineer",
            assignedTaskSummary: bounded(
              typeof metadata.expectedOutput === "string"
                ? metadata.expectedOutput
                : "Scheduler-selected implementation node.",
              1_000,
            ),
            evidenceRefs: artifactRefs.slice(0, 30),
            validationRefs: objectiveScope.approvedValidationCommands,
            approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
          });
        }
        const implementationArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-implementation/${node.nodeId}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.scheduler_implementation",
          storageKind: "metadata",
          uri: implementationArtifactRef,
          contentType: "application/json",
          metadata: {
            nodeId: node.nodeId,
            graphId: graph.graphId,
            result,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
        });
        changedFileRefs.push(...result.changedFileRefs);
        validationRefs.push(...result.validationRefs);
        artifactRefs.push(implementationArtifactRef, ...result.artifactRefs);
        roleCloseouts.push(
          bridgeCloseout({ result, assignment: "Scheduler-selected implementation node." }),
        );
        addRoleEvidence({
          roleId: "implementation_engineer",
          modelRef: result.modelRef,
          providerPath: result.providerPath,
          transportKind: result.transportKind,
          modelRunRef: result.modelRunRef,
          responseHash: result.responseHash,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          latencyMs: result.latencyMs,
          assignedTaskSummary: "Scheduler-selected implementation node.",
          producedArtifactRefs: [implementationArtifactRef, ...result.artifactRefs].slice(0, 20),
        });
        await attachProgress({
          stage: "implementation_node",
          status: result.status === "completed" ? "completed" : "needs_review",
          roleId: "implementation_engineer",
          nodeId: node.nodeId,
          artifactRefs: [implementationArtifactRef, ...result.artifactRefs].slice(0, 12),
          reasonCodes: result.reasonCodes,
          modelRef: result.modelRef,
          providerPath: result.providerPath,
          changedFileRefs: result.changedFileRefs,
          validationRefs: result.validationRefs,
          evidenceClaimRefs: [implementationArtifactRef, ...result.validationRefs.slice(0, 4)],
        });
        return {
          status:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? "succeeded"
              : "needs_review",
          outputArtifactRefs: [implementationArtifactRef, ...result.artifactRefs].slice(0, 20),
          evidenceClaims: [
            ...metadataStringArray(metadata, "commitmentIdsAdvanced")
              .map((commitmentId) =>
                result.changedFileRefs.length > 0
                  ? {
                      commitmentId,
                      evidenceRef: implementationArtifactRef,
                      evidenceKind: "source_change" as const,
                      claimSummary:
                        "Implementation worker produced changed-file evidence for this commitment.",
                      limitations:
                        result.status === "completed"
                          ? []
                          : ["Implementation worker result still requires review."],
                      rawPromptStored: false as const,
                      rawResponseStored: false as const,
                      rawProviderLogStored: false as const,
                    }
                  : null,
              )
              .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)),
            ...metadataStringArray(metadata, "commitmentIdsAdvanced")
              .map((commitmentId) =>
                result.validationRefs.length > 0
                  ? {
                      commitmentId,
                      evidenceRef: result.validationRefs[0]!,
                      evidenceKind: "test_validation" as const,
                      claimSummary:
                        "Implementation worker produced validation evidence for this commitment.",
                      limitations: [],
                      rawPromptStored: false as const,
                      rawResponseStored: false as const,
                      rawProviderLogStored: false as const,
                    }
                  : null,
              )
              .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)),
          ],
          reasonCodes:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? ["scheduler_implementation_completed"]
              : [...result.reasonCodes, "scheduler_implementation_evidence_incomplete"].slice(
                  0,
                  12,
                ),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

    const repairExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) =>
        implementationExecutor.execute({
          graphId: graph.graphId,
          node: { ...node, assignedRole: "implementation_engineer", nodeKind: "repair" },
          snapshotSummary: {
            workflowId: graph.workflowId,
            graphStatus: "running",
            nodeSummaries: [],
            edgeCount: 0,
            humanTaskCount: 0,
            latestCheckpointKinds: [],
          },
          rawPromptStored: false,
          rawResponseStored: false,
        }),
    };

    const closeoutExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        const factualRoles = roleEvidence.map((role) => ({
          roleId: role.roleId,
          agentId: role.agentId,
          modelRef: role.modelRef,
          status: "completed" as const,
        }));
        const capsuleInput: CloseoutCapsuleReporterInput = {
          factualRefs: {
            runtimeJobId: job.jobId,
            teamRunId,
            workflowId,
            status:
              changedFileRefs.length > 0 && validationRefs.length > 0
                ? "completed"
                : "needs_review",
            roles: factualRoles,
            fileRefs: [...new Set(changedFileRefs)].slice(0, 30),
            artifactRefs: artifactRefs.slice(0, 40),
            validationRefs: validationRefs.slice(0, 30),
            runtimeEventRefs: [
              `runtime-job://${job.jobId}/events`,
              graphRef("graph", graph.graphId),
            ],
          },
          objectiveSummary: objective,
          boundedRoleEvidence: roleCloseouts.map((closeout) => ({
            roleId: closeout.roleId,
            agentId: closeout.agentId ?? closeout.roleId,
            modelRef: closeout.modelRef ?? "unknown",
            askedToDo: closeout.whatIWasAskedToDo ?? closeout.askedToDo,
            evidenceSummary: closeout.whatIActuallyDid ?? closeout.actuallyDid,
            artifactRefs: closeout.evidenceRefs ?? [],
            validationRefs: validationRefs.slice(0, 12),
            limitations: closeout.limitations,
          })),
          boundedResultEvidence: {
            completed: changedFileRefs.length > 0 && validationRefs.length > 0,
            needsReview: changedFileRefs.length === 0 || validationRefs.length === 0,
            failed: false,
            findings: [],
            requiredFixes: [
              ...(changedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
              ...(validationRefs.length > 0 ? [] : ["validation_evidence_missing"]),
            ],
            limitations: ["scheduler-backed dynamic agent-team lane"],
          },
        };
        const capsuleResult = this.options.closeoutReporter
          ? await this.options.closeoutReporter.createCapsule(capsuleInput)
          : createDegradedSystemCloseoutCapsule({
              ...capsuleInput,
              reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
            });
        const mergedCapsule = parseCloseoutCapsule({
          ...capsuleResult.capsule,
          roleCloseouts,
          ...(latestMissionLedger ? { missionContractLedger: latestMissionLedger } : {}),
        });
        schedulerCloseoutCapsule = mergedCapsule;
        schedulerCloseoutModelAuthored = isModelAuthoredCloseoutResult(capsuleResult);
        const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${mergedCapsule.capsuleId}`;
        const capsuleHash = closeoutCapsuleHash(mergedCapsule);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.closeout_capsule",
          storageKind: "metadata",
          uri: closeoutRef,
          contentType: "application/json",
          metadata: {
            ...mergedCapsule,
            capsuleHash,
            schedulerBackedCloseout: true,
            rawPromptStored: false,
            rawResponseStored: false,
          } as unknown as JsonValue,
        });
        closeoutRefs.push(closeoutRef);
        artifactRefs.push(closeoutRef);
        await this.options.runtimeWorkGraphs.recordCheckpoint({
          graphId: graph.graphId,
          checkpointKind: schedulerCloseoutModelAuthored
            ? "scheduler_final_closeout_recorded"
            : "scheduler_degraded_closeout_rejected",
          stateSummary: schedulerCloseoutModelAuthored
            ? "Scheduler-backed final model-authored Closeout Capsule recorded after orchestrator-selected nodes."
            : "A degraded/system closeout was recorded as diagnostic evidence only and cannot satisfy clean production success.",
          artifactRefs: [closeoutRef],
        });
        return {
          status: schedulerCloseoutModelAuthored ? "succeeded" : "needs_review",
          outputArtifactRefs: [closeoutRef],
          evidenceClaims: schedulerCloseoutModelAuthored
            ? metadataStringArray(recordValue(node.metadata), "commitmentIdsAdvanced").map(
                (commitmentId) => ({
                  commitmentId,
                  evidenceRef: closeoutRef,
                  evidenceKind: "closeout" as const,
                  claimSummary:
                    "Model-authored Closeout Capsule summarized final workflow evidence for this commitment.",
                  limitations: [],
                  rawPromptStored: false as const,
                  rawResponseStored: false as const,
                  rawProviderLogStored: false as const,
                }),
              )
            : [],
          reasonCodes: schedulerCloseoutModelAuthored
            ? ["scheduler_closeout_recorded"]
            : [
                "degraded_closeout_diagnostic_only",
                "model_authored_closeout_required_before_success",
              ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

    const humanExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => ({
        status: "waiting_for_human",
        outputArtifactRefs: [graphRef("node", node.nodeId)],
        reasonCodes: ["scheduler_human_operator_input_required"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    };

    await attachProgress({ stage: "scheduler_path", status: "started" });
    const initialMissionLedger = await createMissionLedger();
    const schedulerExecutors: Record<string, RuntimeWorkGraphNodeExecutor> = {
      "role:context_scout": roleExecutor("context_scout"),
      "role:test_engineer": roleExecutor("test_engineer"),
      "role:reviewer": roleExecutor("reviewer"),
      "role:observability_scribe": roleExecutor("observability_scribe"),
      "role:implementation_engineer": implementationExecutor,
      "kind:implementation": implementationExecutor,
      "kind:test_authoring": implementationExecutor,
      "kind:repair": repairExecutor,
      "kind:validation": validationExecutor,
      "kind:test_review": validationExecutor,
      "kind:observability_readback": roleExecutor("observability_scribe"),
      "kind:human_task": humanExecutor,
      "kind:closeout": closeoutExecutor,
    };
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs: this.options.runtimeWorkGraphs,
      runtimeToolKernel: this.options.runtimeToolKernel ?? null,
      requireSchedulerToolKernel: this.options.requireSchedulerToolKernel === true,
      orchestrator: schedulerOrchestrator,
      executors: schedulerExecutors,
      missionLedger: initialMissionLedger,
      requireMissionLedgerForExecutionWorkflow: true,
      requireCostAwareCapabilityPolicy: true,
      requireEvidenceClaimsForMissionLedger: true,
      roleCoverageProfile: CODING_TEAM_ROLE_COVERAGE_PROFILE,
      capabilityRegistrySummary: runtimeNodeCapabilityManifestForModel({
        executableExecutorKeys: Object.keys(schedulerExecutors),
      }),
      onNodeAdded: async ({ node, reasonCodes }) => {
        await syncGraphNodeToWorkQueue({ node, reasonCodes });
      },
      onNodeStatusChanged: async ({ node, nodeStatus, evidenceRefs, reasonCodes }) => {
        await syncGraphNodeToWorkQueue({ node, nodeStatus, evidenceRefs, reasonCodes });
      },
      onProgress: async (progress) => {
        await attachProgress({
          stage: progress.stage,
          status: progress.status,
          roleId: progress.roleId,
          nodeId: progress.nodeId,
          artifactRefs: progress.artifactRefs,
          reasonCodes: progress.reasonCodes,
          currentObjective: progress.currentObjective,
          whyThisNodeWasChosen: progress.whyThisNodeWasChosen,
          activeNodeKind: progress.activeNodeKind,
          capabilityId: progress.capabilityId,
          selectedCapabilityId: progress.selectedCapabilityId,
          capabilityCostClass: progress.capabilityCostClass,
          capabilityUtilityRationale: progress.capabilityUtilityRationale,
          capabilityCostRationale: progress.capabilityCostRationale,
          whyCheaperOptionsWereInsufficient: progress.whyCheaperOptionsWereInsufficient,
          consideredCapabilityIds: progress.consideredCapabilityIds,
          modelRef: progress.modelRef,
          providerPath: progress.providerPath,
          targetRefs: progress.targetRefs,
          inputHandoffRefs: progress.inputHandoffRefs,
          expectedOutput: progress.expectedOutput,
          acceptanceCriteria: progress.acceptanceCriteria,
          currentPhase: progress.currentPhase,
          validationState: progress.validationState,
          evidenceProducedRefs: progress.evidenceProducedRefs,
          evidenceClaimRefs: progress.evidenceClaimRefs,
          commitmentIdsAdvanced: progress.commitmentIdsAdvanced,
          remainingOpenCommitmentIds: progress.remainingOpenCommitmentIds,
          nextDecisionNeeded: progress.nextDecisionNeeded,
          blockerSummary: progress.blockerSummary,
          eli5Progress: progress.eli5Progress,
          schedulerPhase: progress.schedulerPhase,
          schedulerToolId: progress.schedulerToolId,
          schedulerToolInvocationRefs: progress.schedulerToolInvocationRefs,
        });
      },
      evaluateMissionLedger: initialMissionLedger
        ? async (input) =>
            evaluateMissionLedger({
              ledger: input.ledger,
              outputArtifactRefs: input.outputArtifactRefs,
              evidenceClaims: input.evidenceClaims,
              reasonCodes: input.reasonCodes,
            })
        : undefined,
      onMissionLedgerUpdated: async (ledger) => {
        latestMissionLedger = ledger;
        await this.options.runtimeWorkGraphs.recordCheckpoint({
          graphId: graph.graphId,
          checkpointKind: `mission_contract_${ledger.ledgerStatus}`,
          stateSummary: `Mission Contract Ledger status: ${ledger.ledgerStatus}; open blocking commitments: ${openBlockingMissionCommitments(ledger).length}.`,
          artifactRefs: missionLedgerRefs.slice(-2),
        });
      },
      maxIterations:
        typeof payload.schedulerMaxIterations === "number" ? payload.schedulerMaxIterations : 24,
    });
    const schedulerResult = await scheduler.run(graph.graphId);
    for (const nodeId of schedulerResult.executedNodeIds) {
      const snapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(graph.graphId);
      const node = snapshot?.nodes.find((candidate) => candidate.nodeId === nodeId);
      if (!node) {
        continue;
      }
      nodeResultById.set(nodeId, {
        status:
          node.nodeStatus === "succeeded"
            ? "succeeded"
            : node.nodeStatus === "waiting_for_human"
              ? "waiting_for_human"
              : node.nodeStatus === "failed"
                ? "failed"
                : "needs_review",
        outputArtifactRefs: node.outputArtifactRefs,
        reasonCodes: [`node_${node.nodeStatus}`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      });
    }
    await attachProgress({
      stage: "scheduler_path",
      status:
        schedulerResult.status === "succeeded"
          ? "completed"
          : schedulerResult.status === "waiting_for_human"
            ? "waiting_for_human"
            : schedulerResult.status === "failed"
              ? "failed"
              : "needs_review",
      artifactRefs: [...schedulerResult.decisionRefs, ...closeoutRefs].slice(0, 12),
      reasonCodes: schedulerResult.reasonCodes,
    });

    const fallbackCapsule = createDegradedSystemCloseoutCapsule({
      factualRefs: {
        runtimeJobId: job.jobId,
        teamRunId,
        workflowId,
        status: schedulerResult.status === "succeeded" ? "completed" : "needs_review",
        roles: roleEvidence.map((role) => ({
          roleId: role.roleId,
          agentId: role.agentId,
          modelRef: role.modelRef,
          status: "completed" as const,
        })),
        fileRefs: [...new Set(changedFileRefs)].slice(0, 30),
        artifactRefs: artifactRefs.slice(0, 40),
        validationRefs: validationRefs.slice(0, 30),
        runtimeEventRefs: [`runtime-job://${job.jobId}/events`, graphRef("graph", graph.graphId)],
      },
      objectiveSummary: objective,
      boundedRoleEvidence: [],
      boundedResultEvidence: {
        completed: schedulerResult.status === "succeeded",
        needsReview: schedulerResult.status !== "succeeded",
        failed: schedulerResult.status === "failed",
        findings: [],
        requiredFixes: schedulerResult.reasonCodes.slice(0, 12),
        limitations: ["scheduler closeout was not selected before terminal state"],
      },
      reasonCodes: ["scheduler_terminal_without_model_closeout"],
    });
    const closeoutCapsule =
      closeoutRefs.length > 0 && schedulerCloseoutCapsule
        ? schedulerCloseoutCapsule
        : fallbackCapsule.capsule;
    const cleanSuccessAccepted =
      schedulerResult.status === "succeeded" &&
      closeoutRefs.length > 0 &&
      schedulerCloseoutModelAuthored &&
      changedFileRefs.length > 0 &&
      (!latestMissionLedger || !missionLedgerHasOpenBlockingCommitments(latestMissionLedger));
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId,
      runtimeJobId: job.jobId,
      workQueueLink: job.workItemId ? { workItemId: job.workItemId } : null,
      objective,
      roster: roleEvidence.map((role) => ({
        roleId: role.roleId,
        modelId: role.modelRef,
        status: "allowed" as const,
      })),
      roleAssignments: roleEvidence.map((role) => ({
        roleId: role.roleId,
        modelId: role.modelRef,
        assignedAt: role.startedAt,
        status: "completed" as const,
      })),
      roleExecutionEvidence: roleEvidence,
      validationState:
        schedulerResult.status === "succeeded"
          ? "passed"
          : schedulerResult.status === "failed"
            ? "failed"
            : "needs_review",
      reviewState: roleEvidence.some((role) => role.roleId === "reviewer")
        ? "reviewed"
        : "needs_review",
      closeoutState: closeoutRefs.length > 0 ? "present" : "required",
      authorityStatus: "allowed",
      permissionEvidence,
      modelRoutingEvidence: {
        graphId: graph.graphId,
        orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        schedulerBackedDynamicRunner: true,
        staticSingleJobSequenceUsed: false,
        inlineRoleOnlyExecutionAllowed: false,
      },
      sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
      artifactRefs: [
        ...artifactRefs,
        ...schedulerResult.decisionRefs,
        ...missionLedgerRefs,
        graphRef("graph", graph.graphId),
      ].slice(0, 60),
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    return {
      artifactKind: "agent_team_claimed_job_execution_result",
      evidence,
      modelRosterDecisions: [],
      closeoutCapsule,
      cleanSuccessAccepted,
      blockingReasonCodes: cleanSuccessAccepted
        ? []
        : [
            ...schedulerResult.reasonCodes,
            ...(latestMissionLedger && missionLedgerHasOpenBlockingCommitments(latestMissionLedger)
              ? [
                  "mission_contract_blocking_commitments_open",
                  ...openBlockingMissionCommitments(latestMissionLedger).map(
                    (commitment) => `mission_commitment_open:${commitment.commitmentId}`,
                  ),
                ]
              : []),
            ...(closeoutRefs.length > 0 ? [] : ["scheduler_model_closeout_missing"]),
            ...(schedulerCloseoutModelAuthored
              ? []
              : ["model_authored_closeout_required_before_success"]),
            ...(changedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
          ].slice(0, 20),
      changedFileRefs: [...new Set(changedFileRefs)].slice(0, 30),
      validationRefs: [...new Set(validationRefs)].slice(0, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async run(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const runPayload =
      job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : {};
    if (
      boolFlag(runPayload.legacyFixedDynamicRunner) ||
      boolFlag(runPayload.proofOnlyLegacyFixedDynamicRunner)
    ) {
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.legacy_fixed_runner_rejected",
        data: {
          artifactKind: "agent_team_legacy_fixed_runner_rejected",
          runtimeJobId: job.jobId,
          reasonCodes: ["legacy_fixed_dynamic_runner_retired"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        } as unknown as JsonValue,
      });
      throw new Error("legacy_fixed_dynamic_runner_retired");
    }
    return this.runSchedulerBacked(job);
  }
}
