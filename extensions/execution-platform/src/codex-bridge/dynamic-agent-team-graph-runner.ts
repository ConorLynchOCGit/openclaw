import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { CodexAppServerJsonExecutor } from "../../../model-memory/src/mmv2/codex-app-server-json-executor.ts";
import type { JsonModelExecutionRequest } from "../../../model-memory/src/model-execution.ts";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { graphRef } from "../workflows/runtime-work-graph.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import { type AgentTeamRoleExecutionEvidence } from "./agent-team-quality-proof.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import {
  closeoutCapsuleHash,
  closeoutCapsuleToLegacyHumanSummary,
  type CloseoutCapsuleRoleCloseout,
  parseCloseoutCapsule,
} from "./closeout-capsule.ts";
import { buildCodexParityRoleModelPolicy } from "./codex-parity-role-model-policy.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import {
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DynamicCodingTeamOrchestrator,
  type DynamicCodingTeamModelClient,
} from "./dynamic-coding-team-orchestrator.ts";
import {
  DynamicTestRepairLoop,
  type DynamicRepairWorker,
  type DynamicTestEngineer,
} from "./dynamic-test-repair-loop.ts";
import type { DynamicValidationRunner } from "./dynamic-test-repair-loop.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";
import {
  createDegradedSystemCloseoutCapsule,
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";
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
  transportKind: "codex_app_server" | "acp_codex" | "codex_parity_runtime_adapter";
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

function rolePrompt(input: {
  roleId: AgentTeamRoleId;
  objective: string;
  graphId: string;
  artifactRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  assignment: string;
}): string {
  return [
    "Return strict compact JSON only for an OpenClaw role invocation.",
    "Do not include raw prompts, raw responses, transcripts, provider logs, command logs, tool logs, secrets, or hidden reasoning.",
    "Do not claim deploy, outbound send, model promotion, authority grant, Work Queue lifecycle mutation, or DB mutation.",
    `roleId: ${input.roleId}`,
    `assignment: ${input.assignment}`,
    `objective: ${input.objective}`,
    `graphId: ${input.graphId}`,
    `artifactRefs: ${input.artifactRefs.join(", ")}`,
    `changedFileRefs: ${input.changedFileRefs.join(", ")}`,
    `validationRefs: ${input.validationRefs.join(", ")}`,
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
  ].join("\n");
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

function stringArray(value: unknown, fallback: string[] = []): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const values = source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 260))
    .slice(0, 12);
  return values.length > 0 ? values : fallback.slice(0, 12);
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
    evidenceRefs: stringArray(parsed.evidenceRefs, input.fallbackArtifactRefs),
    filesOrArtifactsTouched: stringArray(parsed.filesOrArtifactsTouched, [
      ...input.changedFileRefs,
      ...input.fallbackArtifactRefs,
    ]),
    validationIPerformed: bounded(
      typeof parsed.validationIPerformed === "string"
        ? parsed.validationIPerformed
        : input.validationRefs.join("; "),
      800,
    ),
    worked: stringArray(parsed.whatWorked, ["bounded role invocation completed"]),
    failedOrWeak: stringArray(parsed.whatWasWeakOrFailed, [
      "broader parity soak remains the next proof",
    ]),
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
    limitations: stringArray(parsed.limitations, ["bounded parity proof scope"]),
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
    validationIPerformed: input.result.validationRefs.join("; ").slice(0, 800),
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
  workerId: string;
  sourcePromptSessionRoots?: string[];
  roleModelClient: AgentTeamModelClient;
  orchestratorModelClient?: DynamicCodingTeamModelClient;
  validationRunner?: DynamicValidationRunner;
  implementationBridge: AgentTeamImplementationBridge;
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

  async run(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
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
    const graph = await this.options.runtimeWorkGraphs.createGraph({
      graphId: `${teamRunId}-runtime-work-graph`,
      parentWorkItemId: job.workItemId,
      rootRuntimeJobId: job.jobId,
      workflowId,
      orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
      graphStatus: "running",
      metadata: {
        productionCodexParityPath: true,
        legacySingleJobQualitySequenceUsed: false,
        inlineRoleOnlyExecutionAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    await this.options.runtimeWorkGraphs.recordCheckpoint({
      graphId: graph.graphId,
      checkpointKind: "production_path_started",
      stateSummary:
        "Production Codex parity graph runner started; static sequence is not the execution source.",
      artifactRefs: [],
    });
    let progressCounter = 0;
    const attachProgress = async (input: {
      stage: string;
      status: "started" | "completed" | "needs_review" | "failed";
      roleId?: string;
      nodeId?: string;
      artifactRefs?: string[];
      reasonCodes?: string[];
    }) => {
      progressCounter += 1;
      const ref = `runtime-job://${job.jobId}/runtime-work-graph/progress/${String(progressCounter).padStart(3, "0")}-${input.stage}`;
      const metadata = {
        artifactKind: "agent_team_dynamic_progress",
        graphId: graph.graphId,
        runtimeJobId: job.jobId,
        teamRunId,
        stage: input.stage,
        status: input.status,
        roleId: input.roleId ?? null,
        nodeId: input.nodeId ?? null,
        artifactRefs: (input.artifactRefs ?? []).slice(0, 12),
        reasonCodes: (input.reasonCodes ?? []).slice(0, 12),
        recordedAt: this.now().toISOString(),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogsStored: false,
        workQueueLifecycleMutated: false,
      };
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_progress",
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: metadata as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.dynamic_progress",
        data: metadata as unknown as JsonValue,
      });
      return ref;
    };
    await attachProgress({ stage: "production_path", status: "started" });

    const orchestrator = new DynamicCodingTeamOrchestrator({
      graphs: this.options.runtimeWorkGraphs,
      modelClient:
        this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot()),
    });
    await attachProgress({ stage: "orchestrator", status: "started" });
    const orchestratorResult = await orchestrator.plan({
      graphId: graph.graphId,
      ownerObjectiveSummary: objective.slice(0, 4_000),
      repoScopeRefs: objectiveScope.approvedRepoScopePaths,
      contextPackRefs: [],
      validationCommandRefs: objectiveScope.approvedValidationCommands,
      allowedWorkflowIds: [
        "agent_team.coding",
        "agent_team.qa_test",
        "agent_team.architecture",
        "workflow.docs_skills",
        "human/operator",
      ],
      allowHumanTasks: true,
    });
    const orchestratorArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/orchestrator/${orchestratorResult.orchestratorNodeId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.dynamic_orchestrator_plan",
      storageKind: "metadata",
      uri: orchestratorArtifactRef,
      contentType: "application/json",
      metadata: {
        ...orchestratorResult,
        plan: {
          ...orchestratorResult.plan,
          childTasks: orchestratorResult.plan.childTasks.slice(0, 12),
        },
      } as unknown as JsonValue,
    });
    await attachProgress({
      stage: "orchestrator",
      status: "completed",
      nodeId: orchestratorResult.orchestratorNodeId,
      artifactRefs: [orchestratorArtifactRef],
    });
    const artifactRefs = [orchestratorArtifactRef];
    const plannedTaskForRole = (roleId: string) =>
      orchestratorResult.plan.childTasks.find((task) => task.assignedRole === roleId) ??
      orchestratorResult.plan.childTasks.find((task) => task.actionKind === "coding");
    const plannedAssignmentForRole = (roleId: string, fallback: string) => {
      const task = plannedTaskForRole(roleId);
      return task ? `${task.title}: ${fallback}` : fallback;
    };
    const roleCloseouts: CloseoutCapsuleRoleCloseout[] = [];
    const roleEvidence: AgentTeamRoleExecutionEvidence[] = [];
    const roleAssignments: AgentTeamRuntimeEvidence["roleAssignments"] = [];
    const addRoleEvidence = (input: {
      roleId: AgentTeamRoleId;
      modelRef: string;
      providerPath: string;
      transportKind: AgentTeamRoleExecutionEvidence["transportKind"] | "model_task";
      modelRunRef: string;
      responseHash: string;
      startedAt: string;
      completedAt: string;
      latencyMs: number;
      assignedTaskSummary: string;
      producedArtifactRefs: string[];
    }) => {
      roleAssignments.push({
        roleId: input.roleId,
        modelId: input.modelRef,
        assignedAt: input.startedAt,
        status: "completed",
      });
      roleEvidence.push({
        roleId: input.roleId,
        agentId: input.roleId,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        transportKind: input.transportKind === "model_task" ? "live_model" : input.transportKind,
        modelRunRef: input.modelRunRef,
        responseHash: input.responseHash,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        latencyMs: input.latencyMs,
        assignedTaskSummary: input.assignedTaskSummary,
        producedArtifactRefs: input.producedArtifactRefs,
        inlineRoleReportRef: input.producedArtifactRefs[0],
        rawPromptStored: false,
        rawResponseStored: false,
      });
    };

    const runModelRole = async (
      roleId: AgentTeamRoleId,
      assignment: string,
      changedFileRefs: string[],
      validationRefs: string[],
    ) => {
      const policy = roleModelFor(roleId);
      const node = await this.options.runtimeWorkGraphs.addNode({
        graphId: graph.graphId,
        nodeKind:
          roleId === "context_scout"
            ? "context_scout"
            : roleId === "test_engineer"
              ? "test_review"
              : "reviewer",
        assignedRole: roleId,
        modelOrWorkerRef: policy.modelId,
        nodeStatus: "running",
        inputHandoffRefs: artifactRefs.slice(0, 20),
      });
      await attachProgress({
        stage: "role_invocation",
        status: "started",
        roleId,
        nodeId: node.nodeId,
      });
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
        }),
        responseFormat: "json_object",
        maxTokens: policy.maxTokens,
      });
      const completedAt = this.now();
      if (response.status !== "succeeded" || !response.responseHash) {
        await this.options.runtimeWorkGraphs.updateNodeStatus({
          nodeId: node.nodeId,
          nodeStatus: "failed",
        });
        throw new Error(
          `dynamic_role_invocation_failed:${roleId}:${response.errorReasonCode ?? response.status}`,
        );
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
      const roleArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/role/${roleId}/${node.nodeId}`;
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.dynamic_role_invocation",
        storageKind: "metadata",
        uri: roleArtifactRef,
        contentType: "application/json",
        metadata: {
          roleId,
          nodeId: node.nodeId,
          graphId: graph.graphId,
          closeout,
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
      await this.options.runtimeWorkGraphs.updateNodeStatus({
        nodeId: node.nodeId,
        nodeStatus: "succeeded",
        outputArtifactRefs: [roleArtifactRef, graphRef("role-invocation", invocation.invocationId)],
      });
      await attachProgress({
        stage: "role_invocation",
        status: "completed",
        roleId,
        nodeId: node.nodeId,
        artifactRefs: [roleArtifactRef, graphRef("role-invocation", invocation.invocationId)],
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
        producedArtifactRefs: [roleArtifactRef],
      });
      return { nodeId: node.nodeId, artifactRef: roleArtifactRef };
    };

    await runModelRole(
      "context_scout",
      plannedAssignmentForRole(
        "context_scout",
        "Identify relevant files, existing patterns, risks, and validation needs before implementation.",
      ),
      [],
      objectiveScope.approvedValidationCommands,
    );

    const implementationNode = await this.options.runtimeWorkGraphs.addNode({
      graphId: graph.graphId,
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "worker.codex.parity-runtime-adapter",
      nodeStatus: "running",
      inputHandoffRefs: artifactRefs.slice(0, 20),
      metadata: { sourceEditsRequired: true },
    });
    const implementationStartedAt = this.now();
    await attachProgress({
      stage: "implementation",
      status: "started",
      roleId: "implementation_engineer",
      nodeId: implementationNode.nodeId,
    });
    let bridgeResult = await this.options.implementationBridge.run({
      runtimeJob: job,
      teamRunId,
      objective: objectiveResolution.objectiveForModel,
      roleId: "implementation_engineer",
      assignedTaskSummary: plannedAssignmentForRole(
        "implementation_engineer",
        "Implement the requested coding-team work directly in the main repo within approved scope.",
      ),
      evidenceRefs: artifactRefs,
      validationRefs: objectiveScope.approvedValidationCommands,
      approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
    });
    const sourceEditEvidenceMissing =
      bridgeResult.changedFileRefs.length === 0 ||
      bridgeResult.reasonCodes.some(
        (reason) =>
          reason === "source_edit_evidence_missing" ||
          reason === "required_source_edit_missing" ||
          reason === "main_repo_pre_post_hash_manifest_no_changes",
      );
    if (bridgeResult.status !== "completed" && sourceEditEvidenceMissing) {
      const repairNode = await this.options.runtimeWorkGraphs.addNode({
        graphId: graph.graphId,
        nodeKind: "repair",
        assignedRole: "implementation_engineer",
        modelOrWorkerRef: "worker.codex.parity-runtime-adapter",
        nodeStatus: "running",
        inputHandoffRefs: [...artifactRefs, ...bridgeResult.artifactRefs].slice(0, 20),
        metadata: { repairFor: bridgeResult.reasonCodes.slice(0, 12) },
      });
      await this.options.runtimeWorkGraphs.addEdge({
        graphId: graph.graphId,
        fromNodeId: implementationNode.nodeId,
        toNodeId: repairNode.nodeId,
        edgeKind: "repair_requested",
        reasonCodes: bridgeResult.reasonCodes.slice(0, 12),
        artifactRefs: bridgeResult.artifactRefs.slice(0, 12),
      });
      bridgeResult = await this.options.implementationBridge.run({
        runtimeJob: job,
        teamRunId,
        objective: [
          objectiveResolution.objectiveForModel,
          "",
          "Repair turn: the prior implementation attempt did not satisfy runtime evidence.",
          `Bounded reason codes: ${bridgeResult.reasonCodes.join(", ")}`,
          "Make a concrete source/test/readback improvement inside approved scope, then validation will rerun.",
        ].join("\n"),
        roleId: "implementation_engineer",
        assignedTaskSummary: plannedAssignmentForRole(
          "implementation_engineer",
          "Repair the implementation so source edit evidence and validation can pass.",
        ),
        evidenceRefs: [...artifactRefs, ...bridgeResult.artifactRefs].slice(0, 30),
        validationRefs: objectiveScope.approvedValidationCommands,
        approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
      });
      await this.options.runtimeWorkGraphs.updateNodeStatus({
        nodeId: repairNode.nodeId,
        nodeStatus: bridgeResult.status === "completed" ? "succeeded" : "needs_review",
        outputArtifactRefs: bridgeResult.artifactRefs,
      });
    }
    const implementationCompletedAt = this.now();
    const implementationStatus = bridgeResult.status === "completed" ? "succeeded" : "needs_review";
    await this.options.runtimeWorkGraphs.updateNodeStatus({
      nodeId: implementationNode.nodeId,
      nodeStatus: implementationStatus,
      outputArtifactRefs: bridgeResult.artifactRefs,
    });
    await attachProgress({
      stage: "implementation",
      status: bridgeResult.status === "completed" ? "completed" : "needs_review",
      roleId: "implementation_engineer",
      nodeId: implementationNode.nodeId,
      artifactRefs: bridgeResult.artifactRefs,
      reasonCodes: bridgeResult.reasonCodes,
    });
    const implementationInvocation = await this.options.runtimeWorkGraphs.recordRoleInvocation({
      graphId: graph.graphId,
      nodeId: implementationNode.nodeId,
      roleId: "implementation_engineer",
      modelRef: bridgeResult.modelRef,
      providerPath: bridgeResult.providerPath,
      transportKind: bridgeResult.transportKind,
      modelRunRef: bridgeResult.modelRunRef,
      outputHash: bridgeResult.responseHash,
      latencyMs: Math.max(
        0,
        implementationCompletedAt.getTime() - implementationStartedAt.getTime(),
      ),
      artifactRefs: bridgeResult.artifactRefs,
    });
    artifactRefs.push(...bridgeResult.artifactRefs);
    roleCloseouts.push(
      bridgeCloseout({
        result: bridgeResult,
        assignment: plannedAssignmentForRole(
          "implementation_engineer",
          "Implement the requested coding-team work directly in the main repo within approved scope.",
        ),
      }),
    );
    addRoleEvidence({
      roleId: "implementation_engineer",
      modelRef: bridgeResult.modelRef,
      providerPath: bridgeResult.providerPath,
      transportKind: bridgeResult.transportKind,
      modelRunRef: bridgeResult.modelRunRef,
      responseHash: bridgeResult.responseHash,
      startedAt: implementationStartedAt.toISOString(),
      completedAt: implementationCompletedAt.toISOString(),
      latencyMs: Math.max(
        0,
        implementationCompletedAt.getTime() - implementationStartedAt.getTime(),
      ),
      assignedTaskSummary: plannedAssignmentForRole(
        "implementation_engineer",
        "Implement the requested coding-team work directly in the main repo within approved scope.",
      ),
      producedArtifactRefs: [
        ...bridgeResult.artifactRefs,
        graphRef("role-invocation", implementationInvocation.invocationId),
      ].slice(0, 20),
    });

    const validationRunner = this.options.validationRunner ?? {
      run: async (commandRef: string) => {
        const started = Date.now();
        const commandHash = sha256Text(commandRef).slice(0, 16);
        const validationRef = `runtime-job://${job.jobId}/runtime-work-graph/validation/${commandHash}`;
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
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.dynamic_validation",
            storageKind: "metadata",
            uri: validationRef,
            contentType: "application/json",
            metadata: {
              commandRef,
              status: "passed",
              durationMs: Date.now() - started,
              rawCommandLogsStored: false,
            } as unknown as JsonValue,
          });
          return {
            validationRef,
            status: "passed" as const,
            summary: "Focused validation passed.",
          };
        } catch (error) {
          const errorRecord =
            error && typeof error === "object" && !Array.isArray(error)
              ? (error as Record<string, unknown>)
              : {};
          const stderr = typeof errorRecord.stderr === "string" ? errorRecord.stderr : "";
          const stdout = typeof errorRecord.stdout === "string" ? errorRecord.stdout : "";
          const message = error instanceof Error ? error.message : String(error);
          const boundedFailureSummary = bounded(
            [message, stdout, stderr].filter(Boolean).join("\n"),
            2_000,
          );
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.dynamic_validation",
            storageKind: "metadata",
            uri: validationRef,
            contentType: "application/json",
            metadata: {
              commandRef,
              status: "failed",
              durationMs: Date.now() - started,
              errorHash: sha256Text([message, stdout, stderr].filter(Boolean).join("\n")),
              boundedFailureSummary,
              rawCommandLogsStored: false,
            } as unknown as JsonValue,
          });
          return { validationRef, status: "failed" as const, summary: boundedFailureSummary };
        }
      },
    };
    const testEngineer: DynamicTestEngineer = {
      diagnose: async (diag) => {
        const started = this.now();
        const result = await this.options.roleModelClient.callRole({
          roleId: "test_engineer",
          modelId: "deepseek/deepseek-v4-flash",
          modelCandidateId: "deepseek-v4-coding-candidate",
          prompt: [
            "Return strict JSON only. Diagnose validation evidence for OpenClaw.",
            `failedValidationRefs: ${diag.failedValidationRefs.join(", ")}`,
            `failedValidationSummaries: ${diag.failedValidationSummaries.join(" | ")}`,
            `changedFileRefs: ${diag.changedFileRefs.join(", ")}`,
            'Shape: {"recommendation":"repair|context_scout|escalate|human_task|needs_review|no_op_repair","reasonCodes":["bounded"],"artifactRefs":["bounded"]}',
          ].join("\n"),
          responseFormat: "json_object",
          maxTokens: 2_000,
        });
        const parsed = parseJsonObject(result.responseText);
        const recommendation =
          parsed.recommendation === "repair" ||
          parsed.recommendation === "context_scout" ||
          parsed.recommendation === "escalate" ||
          parsed.recommendation === "human_task" ||
          parsed.recommendation === "needs_review" ||
          parsed.recommendation === "no_op_repair"
            ? parsed.recommendation
            : "repair";
        return {
          modelRunRef: `${teamRunId}-test-engineer-diagnosis-${sha256Text(result.responseHash ?? "missing").slice(0, 8)}`,
          responseHash: result.responseHash ?? sha256Text("missing-test-diagnosis"),
          latencyMs: Math.max(0, this.now().getTime() - started.getTime()),
          recommendation,
          reasonCodes: stringArray(parsed.reasonCodes, ["validation_failure_classified"]),
          artifactRefs: stringArray(parsed.artifactRefs, diag.failedValidationRefs),
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    };
    const acceptedRepairBridgeResult: { current: AgentTeamImplementationBridgeRunResult | null } = {
      current: null,
    };
    const repairWorker: DynamicRepairWorker = {
      repair: async (repair) => {
        const started = this.now();
        const repaired = await this.options.implementationBridge.run({
          runtimeJob: job,
          teamRunId,
          objective: [
            objectiveResolution.objectiveForModel,
            "",
            "Validation repair turn.",
            `Failed validation refs: ${repair.failedValidationRefs.join(", ")}`,
            `Failed validation summaries: ${repair.failedValidationSummaries.join(" | ")}`,
            `Reason codes: ${repair.reasonCodes.join(", ")}`,
            "Make the smallest source/test fix that addresses the validation failure. Prefer repairing the changed files already in scope before broadening scope.",
          ].join("\n"),
          roleId: "implementation_engineer",
          assignedTaskSummary: "Repair implementation after validation failure.",
          evidenceRefs: [...artifactRefs, ...repair.failedValidationRefs].slice(0, 30),
          validationRefs: objectiveScope.approvedValidationCommands,
          approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
        });
        if (repaired.status === "completed") {
          acceptedRepairBridgeResult.current = repaired;
        }
        return {
          status: repaired.status,
          changedFileRefs: repaired.changedFileRefs,
          artifactRefs: repaired.artifactRefs,
          modelRunRef: repaired.modelRunRef,
          responseHash: repaired.responseHash,
          latencyMs: Math.max(0, this.now().getTime() - started.getTime()),
          reasonCodes: repaired.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    };
    await attachProgress({ stage: "validation_repair_loop", status: "started" });
    const repairLoop = await new DynamicTestRepairLoop({
      graphs: this.options.runtimeWorkGraphs,
      validationRunner,
      testEngineer,
      repairWorker,
      maxRepairAttempts: 2,
    }).run({
      graphId: graph.graphId,
      implementationNodeId: implementationNode.nodeId,
      changedFileRefs: bridgeResult.changedFileRefs,
      validationCommandRefs: objectiveScope.approvedValidationCommands,
    });
    await attachProgress({
      stage: "validation_repair_loop",
      status: repairLoop.finalState === "passed" ? "completed" : "needs_review",
      artifactRefs: repairLoop.validationRefs,
      reasonCodes: repairLoop.reasonCodes,
    });
    const acceptedBridgeResult =
      repairLoop.finalState === "passed" &&
      acceptedRepairBridgeResult.current?.status === "completed"
        ? acceptedRepairBridgeResult.current
        : bridgeResult;
    const acceptedChangedFileRefs = [
      ...new Set([...bridgeResult.changedFileRefs, ...acceptedBridgeResult.changedFileRefs]),
    ].slice(0, 30);
    if (acceptedRepairBridgeResult.current) {
      artifactRefs.push(...acceptedRepairBridgeResult.current.artifactRefs);
      roleCloseouts.push(
        bridgeCloseout({
          result: acceptedRepairBridgeResult.current,
          assignment: "Repair implementation after validation failure.",
        }),
      );
      addRoleEvidence({
        roleId: "implementation_engineer",
        modelRef: acceptedRepairBridgeResult.current.modelRef,
        providerPath: acceptedRepairBridgeResult.current.providerPath,
        transportKind: acceptedRepairBridgeResult.current.transportKind,
        modelRunRef: acceptedRepairBridgeResult.current.modelRunRef,
        responseHash: acceptedRepairBridgeResult.current.responseHash,
        startedAt: implementationStartedAt.toISOString(),
        completedAt: this.now().toISOString(),
        latencyMs: acceptedRepairBridgeResult.current.latencyMs,
        assignedTaskSummary: "Repair implementation after validation failure.",
        producedArtifactRefs: acceptedRepairBridgeResult.current.artifactRefs.slice(0, 20),
      });
    }
    artifactRefs.push(...repairLoop.validationRefs);
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.dynamic_validation_repair_loop",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/runtime-work-graph/validation-repair/${graph.graphId}`,
      contentType: "application/json",
      metadata: repairLoop as unknown as JsonValue,
    });

    await runModelRole(
      "reviewer",
      plannedAssignmentForRole(
        "reviewer",
        "Review changed-file refs, validation refs, graph evidence, and determine whether the work product satisfies the objective.",
      ),
      acceptedChangedFileRefs,
      repairLoop.validationRefs,
    );
    await runModelRole(
      "observability_scribe",
      plannedAssignmentForRole(
        "observability_scribe",
        "Summarize owner-visible readback, runtime ids, limitations, and ELI5 progress from real graph evidence.",
      ),
      acceptedChangedFileRefs,
      repairLoop.validationRefs,
    );

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
          acceptedBridgeResult.status === "completed" &&
          acceptedChangedFileRefs.length > 0 &&
          repairLoop.finalState === "passed"
            ? "completed"
            : "needs_review",
        roles: factualRoles,
        fileRefs: acceptedChangedFileRefs,
        artifactRefs: artifactRefs.slice(0, 40),
        validationRefs: repairLoop.validationRefs,
        runtimeEventRefs: [`runtime-job://${job.jobId}/events`, graphRef("graph", graph.graphId)],
      },
      objectiveSummary: objective,
      boundedRoleEvidence: roleCloseouts.map((closeout) => ({
        roleId: closeout.roleId,
        agentId: closeout.agentId ?? closeout.roleId,
        modelRef: closeout.modelRef ?? "unknown",
        askedToDo: closeout.whatIWasAskedToDo ?? closeout.askedToDo,
        evidenceSummary: closeout.whatIActuallyDid ?? closeout.actuallyDid,
        artifactRefs: closeout.evidenceRefs ?? [],
        validationRefs: repairLoop.validationRefs,
        limitations: closeout.limitations,
      })),
      boundedResultEvidence: {
        completed:
          acceptedBridgeResult.status === "completed" &&
          acceptedChangedFileRefs.length > 0 &&
          repairLoop.finalState === "passed",
        needsReview:
          acceptedBridgeResult.status !== "completed" ||
          acceptedChangedFileRefs.length === 0 ||
          repairLoop.finalState !== "passed",
        failed: false,
        findings: [],
        requiredFixes:
          acceptedBridgeResult.status === "completed" &&
          acceptedChangedFileRefs.length > 0 &&
          repairLoop.finalState === "passed"
            ? []
            : [
                ...acceptedBridgeResult.reasonCodes,
                ...repairLoop.reasonCodes,
                ...(acceptedChangedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
              ].slice(0, 12),
        limitations: ["production Codex parity graph proof"],
      },
    };
    await attachProgress({ stage: "closeout", status: "started" });
    let capsuleResult = this.options.closeoutReporter
      ? await this.options.closeoutReporter.createCapsule(capsuleInput)
      : createDegradedSystemCloseoutCapsule({
          ...capsuleInput,
          reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
        });
    const mergedCapsule = parseCloseoutCapsule({
      ...capsuleResult.capsule,
      roleCloseouts,
      factualRefs: {
        ...capsuleResult.capsule.factualRefs,
        roles: factualRoles,
        fileRefs: acceptedChangedFileRefs,
        artifactRefs: [...capsuleResult.capsule.factualRefs.artifactRefs, ...artifactRefs].slice(
          0,
          40,
        ),
        validationRefs: repairLoop.validationRefs,
      },
    });
    capsuleResult = {
      ...capsuleResult,
      capsule: mergedCapsule,
      legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(mergedCapsule),
    };
    const capsuleHash = closeoutCapsuleHash(mergedCapsule);
    const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${mergedCapsule.capsuleId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.closeout_capsule",
      storageKind: "metadata",
      uri: closeoutRef,
      contentType: "application/json",
      metadata: {
        ...mergedCapsule,
        capsuleHash,
        rawPromptStored: false,
        rawResponseStored: false,
      } as unknown as JsonValue,
    });
    await attachProgress({
      stage: "closeout",
      status: "completed",
      artifactRefs: [closeoutRef],
      reasonCodes:
        capsuleResult.source === "model"
          ? ["model_closeout_recorded"]
          : ["degraded_closeout_recorded"],
    });
    await this.options.runtimeWorkGraphs.addNode({
      graphId: graph.graphId,
      nodeKind: "closeout",
      assignedRole: "observability_scribe",
      modelOrWorkerRef: capsuleResult.capsule.modelRef,
      nodeStatus: "succeeded",
      inputHandoffRefs: artifactRefs.slice(0, 20),
      outputArtifactRefs: [closeoutRef],
    });
    await this.options.runtimeWorkGraphs.recordCheckpoint({
      graphId: graph.graphId,
      checkpointKind: "final_closeout_recorded",
      stateSummary:
        "Final Closeout Capsule recorded after implementation, validation, and review evidence.",
      artifactRefs: [closeoutRef],
    });

    const cleanSuccessAccepted =
      acceptedBridgeResult.status === "completed" &&
      acceptedChangedFileRefs.length > 0 &&
      repairLoop.finalState === "passed" &&
      capsuleResult.source === "model" &&
      mergedCapsule.structuredSummary.taskSuccess === "satisfied";
    const blockingReasonCodes = [
      ...(acceptedBridgeResult.status === "completed"
        ? []
        : ["implementation_bridge_not_completed"]),
      ...(acceptedChangedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
      ...(repairLoop.finalState === "passed" ? [] : ["validation_repair_loop_not_passed"]),
      ...(capsuleResult.source === "model"
        ? []
        : ["model_authored_closeout_required_before_success"]),
      ...(mergedCapsule.structuredSummary.taskSuccess === "satisfied"
        ? []
        : ["model_closeout_reports_missing_work"]),
    ];
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
      roleAssignments,
      roleExecutionEvidence: roleEvidence,
      roleEligibility: Object.fromEntries(
        buildCodexParityRoleModelPolicy({
          codexGpt55Available: true,
          codexCodingModelRef: "openai-codex/gpt-5.3-codex",
          kimiAvailable: Boolean(process.env.OPENCLAW_CODEX_PARITY_KIMI_MAIN_EDIT_ENABLED),
          deepseekAvailable: true,
        }).map((role) => [role.modelRef, role.missingConfigBlocker ? "needs_review" : "allowed"]),
      ),
      activeRole: "observability_scribe",
      handoffHistory: [
        {
          handoffId: `${teamRunId}-dynamic-graph-closeout`,
          fromRole: "reviewer",
          toRole: "observability_scribe",
          status: "completed",
          recordedAt: this.now().toISOString(),
          payloadSummary: "Dynamic Runtime Work Graph evidence handed to final closeout.",
          evidenceRefs: artifactRefs.slice(0, 12),
          rawTranscriptAllowed: false,
          rawProviderPromptAllowed: false,
        },
      ],
      reviewState: cleanSuccessAccepted ? "reviewed" : "needs_review",
      validationState: repairLoop.finalState === "passed" ? "passed" : "needs_review",
      closeoutState: "present",
      authorityStatus: "allowed",
      permissionEvidence,
      modelRoutingEvidence: {
        graphId: graph.graphId,
        orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        staticSingleJobSequenceUsed: false,
        inlineRoleOnlyExecutionAllowed: false,
      } as unknown as JsonValue,
      sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
      controlState: "none",
      streamEvidenceRefs: [`runtime-job://${job.jobId}/events`],
      artifactRefs: [...artifactRefs, closeoutRef].slice(0, 40),
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    return {
      artifactKind: "agent_team_claimed_job_execution_result",
      evidence,
      modelRosterDecisions: [],
      closeoutCapsule: mergedCapsule,
      cleanSuccessAccepted,
      blockingReasonCodes,
      changedFileRefs: acceptedChangedFileRefs,
      validationRefs: repairLoop.validationRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
