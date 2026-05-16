import {
  AcpCodexCodingWorkerAdapter,
  AgentTeamQueuedRunner,
  CodexParityImplementationBridge,
  HumanOperatorInputRequiredError,
  ModelCloseoutCapsuleReporter,
  OpenRouterAgentTeamModelClient,
  RuntimeWorkerSupervisor,
  type RuntimeToolKernel,
  type AcpCodexCodingWorkerRunResult,
  type AgentTeamClaimedJobExecutionResult,
  type RuntimeJobRepository,
  type RuntimeWorkGraphRepository,
  type WorkQueueRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import { CodexAppServerJsonExecutor } from "../../extensions/model-memory/src/mmv2/codex-app-server-json-executor.js";

export type GatewayAgentTeamRunOnceResult = {
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  status: string;
  runtimeJobId: string | null;
  teamRunId: string | null;
  workflowId: "agent_team.coding";
  workerId: string;
  reasonCodes: string[];
};

function createGatewayCloseoutReporter(): ModelCloseoutCapsuleReporter {
  return new ModelCloseoutCapsuleReporter({
    executor: new CodexAppServerJsonExecutor({
      cwd: process.cwd(),
      requestTimeoutMs: 300_000,
      reasoningEffort: "medium",
    }),
    modelId: "openai-codex/gpt-5.4",
    reasoningEffort: "medium",
    maxOutputTokens: 12_000,
  });
}

function createGatewayRoleModelClient(): OpenRouterAgentTeamModelClient | undefined {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterApiKey) {
    return undefined;
  }
  return new OpenRouterAgentTeamModelClient({
    apiKey: openRouterApiKey,
    retryPolicy: {
      maxAttempts: 2,
      timeoutMs: 600_000,
    },
    requestProfilesByModelId: {
      "deepseek/deepseek-v4-pro": {
        responseFormatMode: "native",
        reasoningMode: "omit",
        maxTokens: 1_600,
      },
      "moonshotai/kimi-k2.6": {
        responseFormatMode: "prompt_only",
        reasoningMode: "omit",
        maxTokens: 8_000,
      },
    },
  });
}

function createGatewayImplementationBridge(runtimeJobs: RuntimeJobRepository) {
  return new CodexParityImplementationBridge({
    runtimeJobs,
    approvedRepoScopePaths: [
      "extensions/execution-platform/src/",
      "extensions/model-memory/src/",
      "src/gateway/",
      "src/auto-reply/",
      "src/agents/",
      "src/infra/",
      "ui/src/ui/",
      "scripts/",
      "docs/projects/execution-platform/",
      "docs/projects/model-memory/",
    ],
    approvedValidationCommands: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
      "pnpm test:file extensions/execution-platform/src/workflows/workflow-registry.test.ts",
      "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
      "pnpm test:file src/gateway/server-methods/chat.execution-routing.test.ts",
      "pnpm test:file ui/src/ui/views/work-queue.test.ts",
      "pnpm tsgo:full",
    ],
  });
}

export async function runGatewayAgentTeamRuntimeJobOnce(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue: WorkQueueRepository;
  runtimeJobId: string;
  workerId: string;
  queueName?: string | null;
}): Promise<GatewayAgentTeamRunOnceResult> {
  let claimedExecution: AgentTeamClaimedJobExecutionResult | null = null;
  let claimedTeamRunId: string | null = null;
  const roleModelClient = createGatewayRoleModelClient();
  const queuedRunner = new AgentTeamQueuedRunner({
    runtimeJobs: input.runtimeJobs,
    runtimeWorkGraphs: input.runtimeWorkGraphs,
    runtimeToolKernel: input.runtimeToolKernel ?? null,
    workQueue: input.workQueue,
    workerId: input.workerId,
    queueName: input.queueName ?? "agent-team",
    runtimeJobId: input.runtimeJobId,
    closeoutReporter: createGatewayCloseoutReporter(),
    roleModelClient,
    implementationBridge: createGatewayImplementationBridge(input.runtimeJobs),
  });
  const workerAdapter = new AcpCodexCodingWorkerAdapter({
    runtimeJobs: input.runtimeJobs,
    runner: {
      async run({ job }): Promise<AcpCodexCodingWorkerRunResult> {
        try {
          claimedExecution = await queuedRunner.runClaimedJobForAdapter(job);
          claimedTeamRunId = claimedExecution.evidence.teamRunId;
          const evidence = claimedExecution.evidence;
          const closeoutCapsule = claimedExecution.closeoutCapsule;
          const closeoutRefs = [
            `runtime-job://${job.jobId}/closeout-capsule/${closeoutCapsule.capsuleId}`,
          ];
          const roleRefs = evidence.roster.map((role) => `role://${role.roleId}`).slice(0, 20);
          const modelRefs = evidence.roster.map((role) => role.modelId).slice(0, 20);
          const validationRefs =
            claimedExecution.validationRefs.length > 0
              ? claimedExecution.validationRefs
              : [`runtime-job://${job.jobId}/agent-team/validation`];
          const reviewRefs = evidence.artifactRefs
            .filter((ref) => ref.includes("security-review") || ref.includes("result-review"))
            .slice(0, 20);
          const completedWorkEvidenceRefs = claimedExecution.cleanSuccessAccepted
            ? [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40)
            : [];
          return {
            status: claimedExecution.cleanSuccessAccepted ? "completed" : "needs_review",
            summary: claimedExecution.cleanSuccessAccepted
              ? "Coding worker completed bounded work with model-authored closeout evidence."
              : `Coding worker needs review: ${claimedExecution.blockingReasonCodes.join(", ")}`,
            teamRunId: evidence.teamRunId,
            workflowId: "agent_team.coding",
            roleRefs,
            modelRefs,
            validationRefs: validationRefs.slice(0, 20),
            reviewRefs,
            closeoutRefs,
            completedWorkEvidenceRefs,
            artifactRefs: [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40),
            closeoutCapsule,
            evidence,
            roleExecutionEvidence: evidence.roleExecutionEvidence,
            reasonCodes: claimedExecution.cleanSuccessAccepted
              ? ["agent_team_queued_runner_completed"]
              : claimedExecution.blockingReasonCodes,
            result: {
              teamRunId: evidence.teamRunId,
              closeoutCapsuleId: closeoutCapsule.capsuleId,
              cleanSuccessAccepted: claimedExecution.cleanSuccessAccepted,
              changedFileRefs: claimedExecution.changedFileRefs,
              validationRefs,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutated: false,
          };
        } catch (error) {
          if (error instanceof HumanOperatorInputRequiredError) {
            return {
              status: "deferred",
              summary: `Waiting for owner decision for human task ${error.humanTaskId}.`,
              teamRunId: claimedTeamRunId,
              workflowId: "agent_team.coding",
              roleRefs: ["role://human_operator"],
              modelRefs: ["human/operator"],
              validationRefs: [],
              reviewRefs: [],
              closeoutRefs: [],
              completedWorkEvidenceRefs: [],
              artifactRefs: error.artifactRefs,
              reasonCodes: error.reasonCodes,
              retryDelayMs: 86_400_000,
              result: {
                status: "waiting_for_human",
                runtimeJobId: error.runtimeJobId,
                graphId: error.graphId,
                humanTaskId: error.humanTaskId,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                workQueueLifecycleMutated: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            };
          }
          throw error;
        }
      },
    },
  });
  const supervisorResult = await new RuntimeWorkerSupervisor({
    repository: input.runtimeJobs,
    workerId: input.workerId,
    queueName: input.queueName ?? "agent-team",
    adapters: [workerAdapter],
  }).runOnce({ runtimeJobId: input.runtimeJobId });
  return {
    claimed: supervisorResult.claimed,
    completed: supervisorResult.completed,
    failed:
      supervisorResult.claimed &&
      !supervisorResult.completed &&
      supervisorResult.status !== "deferred",
    status: supervisorResult.status,
    runtimeJobId: supervisorResult.runtimeJobId,
    workflowId: "agent_team.coding",
    workerId: input.workerId,
    teamRunId: claimedTeamRunId,
    reasonCodes: supervisorResult.reasonCodes,
  };
}
