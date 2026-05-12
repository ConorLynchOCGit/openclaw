import { createHash } from "node:crypto";
import { AgentTeamQueuedRunner } from "../codex-bridge/agent-team-queued-runner.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  type CanonicalRouterOutput,
  type StructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterProviderResponse,
  type StructuredModelIntentRouterRequest,
} from "../intent-front-door/index.ts";
import { runProtocolPreGate } from "../intent-front-door/protocol-pre-gate.ts";
import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
} from "../workflows/web-research-runtime-evidence.ts";
import {
  NativeExecutionRpcService,
  type NativeExecutionSubmitResult,
} from "./native-execution-rpc.ts";

export const NORMAL_UX_DOGFOOD_VERSION = "execution-platform.normal-ux-dogfood.v1";

export type NormalUxDogfoodScenarioId =
  | "normal_chat"
  | "plan_only"
  | "coding_team"
  | "web_research"
  | "research_to_coding"
  | "negated_outbound"
  | "conditional_deploy"
  | "control_target"
  | "slash_protocol";

export type NormalUxDogfoodScenario = {
  scenarioId: NormalUxDogfoodScenarioId;
  promptSummary: string;
  expectedBehavior:
    | "chat"
    | "plan_only"
    | "runtime_job"
    | "child_handoff"
    | "blocked_or_review"
    | "control_validation"
    | "protocol_bypass";
  routerOutput: CanonicalRouterOutput | null;
};

export type NormalUxDogfoodScenarioResult = {
  scenarioId: NormalUxDogfoodScenarioId;
  promptHash: string;
  expectedBehavior: NormalUxDogfoodScenario["expectedBehavior"];
  status: "completed" | "blocked" | "needs_review";
  runtimeJobId: string | null;
  workItemId: string | null;
  route: string | null;
  accepted: boolean;
  protocolBypassed: boolean;
  runtimeJobCreated: boolean;
  workQueueReadbackState: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type NormalUxDogfoodResult = {
  artifactKind: "normal_ux_prompt_to_workflow_dogfood_result";
  dogfoodVersion: typeof NORMAL_UX_DOGFOOD_VERSION;
  status: "completed" | "needs_review" | "blocked";
  mode: "fixture" | "live_linked_fixture_router";
  scenarioCount: number;
  runtimeJobIds: string[];
  workItemIds: string[];
  results: NormalUxDogfoodScenarioResult[];
  normalChatPreserved: boolean;
  planOnlyPreserved: boolean;
  executionRouted: boolean;
  slashBypassed: boolean;
  noFalseExecution: boolean;
  runtimeJobsCreated: boolean;
  authorityGranted: false;
  controlsApplied: boolean;
  deployPerformed: false;
  outboundSendPerformed: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function blockedOutput(reasonCode: string, objectiveSummary: string): CanonicalRouterOutput {
  return createBaseCanonicalRouterOutput({
    route: "blocked",
    responseMode: "block",
    confidence: 0.98,
    objectiveSummary,
    riskClass: "high",
    sideEffectClass: "production_side_effect",
    reasonCodes: [reasonCode],
  });
}

export function createNormalUxDogfoodScenarios(): NormalUxDogfoodScenario[] {
  return [
    {
      scenarioId: "normal_chat",
      promptSummary: "Explain how Work Queue routing visibility could improve.",
      expectedBehavior: "chat",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Answer conversationally without execution.",
        reasonCodes: ["dogfood_normal_chat"],
      }),
    },
    {
      scenarioId: "plan_only",
      promptSummary: "How would you approach making provider failures easier to inspect?",
      expectedBehavior: "plan_only",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "plan_only",
        responseMode: "create_plan_only",
        confidence: 0.94,
        objectiveSummary: "Return a bounded plan only.",
        requestedActions: [createCanonicalRouterAction("plan", "bounded planning answer", 0.94)],
        reasonCodes: ["dogfood_plan_only"],
      }),
    },
    {
      scenarioId: "coding_team",
      promptSummary: "Have the team make a tiny product-safe readback improvement.",
      expectedBehavior: "runtime_job",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.96,
        objectiveSummary: "Tiny product-safe coding-team readback improvement.",
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded local code edit", 0.96),
          createCanonicalRouterAction("test", "focused validation", 0.96),
          createCanonicalRouterAction("review", "review result", 0.96),
          createCanonicalRouterAction("closeout", "closeout", 0.96),
        ],
        reasonCodes: ["dogfood_coding_team_execution"],
      }),
    },
    {
      scenarioId: "web_research",
      promptSummary: "Research current structured-output guidance with bounded citations only.",
      expectedBehavior: "runtime_job",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "research_only",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "single_agent.web_research",
        jobType: "executor.single_agent",
        confidence: 0.95,
        objectiveSummary: "Bounded current-doc research with source refs only.",
        requestedAuthority: "outbound_readonly",
        sideEffectClass: "outbound_readonly",
        requestedActions: [createCanonicalRouterAction("research", "bounded research", 0.95)],
        reasonCodes: ["dogfood_web_research_execution"],
      }),
    },
    {
      scenarioId: "research_to_coding",
      promptSummary: "Research then plan a safe front-door validation improvement.",
      expectedBehavior: "child_handoff",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "multi_workflow_plan",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.9,
        objectiveSummary: "Research current facts before bounded coding handoff.",
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
        requestedActions: [
          createCanonicalRouterAction("research", "bounded current-doc research", 0.9),
          createCanonicalRouterAction("code_edit", "bounded local code edit", 0.9),
        ],
        childWorkflowRequests: [
          {
            childWorkflowId: "single_agent.web_research",
            requirement: "mandatory",
            reasonCodes: ["dogfood_child_research_required"],
            requestedAuthority: "outbound_readonly",
            boundedInputSummary: "Research current docs with bounded citations.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        ],
        multiIntentPlan: [
          {
            order: 1,
            route: "research_only",
            workflowId: "single_agent.web_research",
            objectiveSummary: "Research bounded current facts.",
            dependsOnStep: null,
            authorityProfile: "outbound_readonly",
          },
          {
            order: 2,
            route: "workflow_execution",
            workflowId: "agent_team.coding",
            objectiveSummary: "Implement after research.",
            dependsOnStep: 1,
            authorityProfile: "local_yolo",
          },
        ],
        reasonCodes: ["dogfood_research_to_coding_plan"],
      }),
    },
    {
      scenarioId: "negated_outbound",
      promptSummary: "Do not send anything; improve outbound destination route-state readback.",
      expectedBehavior: "blocked_or_review",
      routerOutput: blockedOutput(
        "dogfood_negated_outbound_held",
        "Negated outbound send must not create outbound work.",
      ),
    },
    {
      scenarioId: "conditional_deploy",
      promptSummary: "Add a tiny regression test and deploy if policy permits.",
      expectedBehavior: "blocked_or_review",
      routerOutput: blockedOutput(
        "dogfood_conditional_deploy_needs_policy_proof",
        "Conditional deploy must not deploy without policy proof.",
      ),
    },
    {
      scenarioId: "control_target",
      promptSummary: "Cancel that job.",
      expectedBehavior: "control_validation",
      routerOutput: createBaseCanonicalRouterOutput({
        route: "work_queue_control",
        responseMode: "apply_control",
        confidence: 0.92,
        objectiveSummary: "Runtime-backed control requires target validation.",
        requestedActions: [
          createCanonicalRouterAction("work_queue_control", "cancel selected runtime job", 0.92),
        ],
        targetRefs: [
          { targetKind: "runtime_job", targetRef: "runtime-job://dogfood-control-target" },
        ],
        reasonCodes: ["dogfood_control_requires_apply_control"],
      }),
    },
    {
      scenarioId: "slash_protocol",
      promptSummary: "/compact",
      expectedBehavior: "protocol_bypass",
      routerOutput: null,
    },
  ];
}

export class PromptHashStructuredRouterProvider implements StructuredModelIntentRouterProvider {
  constructor(private readonly outputsByPromptHash: ReadonlyMap<string, CanonicalRouterOutput>) {}

  async route(
    request: StructuredModelIntentRouterRequest,
  ): Promise<StructuredModelIntentRouterProviderResponse> {
    const output = this.outputsByPromptHash.get(request.promptHash);
    return {
      output:
        output ??
        createBaseCanonicalRouterOutput({
          route: "clarification_required",
          responseMode: "ask_clarification",
          confidence: 0,
          objectiveSummary: "Fixture route missing.",
          ambiguity: {
            ambiguous: true,
            missingInputs: ["fixture"],
            conflictingInstructions: [],
            clarificationQuestion: "Which dogfood fixture should be used?",
          },
          reasonCodes: ["dogfood_fixture_missing"],
        }),
      providerRef: "fixture://normal-ux-dogfood",
      modelCandidateId: "fixture-router",
      providerCallMade: false,
      reasonCodes: ["normal_ux_dogfood_fixture_router"],
    };
  }
}

export function createNormalUxDogfoodProvider(
  scenarios = createNormalUxDogfoodScenarios(),
): PromptHashStructuredRouterProvider {
  return new PromptHashStructuredRouterProvider(
    new Map(
      scenarios
        .filter((scenario) => scenario.routerOutput)
        .map((scenario) => [hash(scenario.promptSummary), scenario.routerOutput!]),
    ),
  );
}

export async function runNormalUxPromptToWorkflowDogfood(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  mode?: NormalUxDogfoodResult["mode"];
  scenarios?: NormalUxDogfoodScenario[];
}): Promise<NormalUxDogfoodResult> {
  const scenarios = input.scenarios ?? createNormalUxDogfoodScenarios();
  const rpc = new NativeExecutionRpcService({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    structuredRouterProvider: createNormalUxDogfoodProvider(scenarios),
  });
  const results: NormalUxDogfoodScenarioResult[] = [];
  const runtimeJobIds: string[] = [];
  const workItemIds: string[] = [];
  let controlsApplied = false;

  for (const scenario of scenarios) {
    const promptHash = hash(scenario.promptSummary);
    const workItemId = `normal-ux-dogfood-${scenario.scenarioId}-${promptHash.slice(0, 10)}`;
    const preGate = runProtocolPreGate({
      text: scenario.promptSummary,
      sourceRoute: "ux",
      auth: { authenticated: true, actorId: "operator:main", sessionId: "agent:main:main" },
      requireAuthentication: false,
    });
    if (preGate.kind !== "continue_to_intent_routing") {
      results.push({
        scenarioId: scenario.scenarioId,
        promptHash,
        expectedBehavior: scenario.expectedBehavior,
        status: "completed",
        runtimeJobId: null,
        workItemId: null,
        route: null,
        accepted: false,
        protocolBypassed: true,
        runtimeJobCreated: false,
        workQueueReadbackState: null,
        reasonCodes: ["protocol_pregate_bypassed_models", ...preGate.reasonCodes],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      });
      continue;
    }

    const submit = await rpc.submit({
      prompt: scenario.promptSummary,
      auth: {
        actorId: "operator:main",
        authenticated: true,
        role: "operator",
        sessionId: "agent:main:main",
        sourceRoute: "ux",
      },
      sourceRoute: "ux",
      workItemId,
    });
    if (submit.runtimeJobId) {
      runtimeJobIds.push(submit.runtimeJobId);
      workItemIds.push(workItemId);
      await maybeCompleteRuntimeJob({
        runtimeJobs: input.runtimeJobs,
        runtimeJobId: submit.runtimeJobId,
        scenarioId: scenario.scenarioId,
      });
    }
    if (scenario.scenarioId === "control_target") {
      const decision = await rpc.applyControl({
        actionKind: "cancel",
        actionId: `normal-ux-dogfood-cancel-${promptHash.slice(0, 10)}`,
        runtimeJobId: runtimeJobIds[0] ?? null,
        workItemId: workItemIds[0] ?? null,
        auth: {
          actorId: "operator:main",
          authenticated: true,
          role: "operator",
          sourceRoute: "ux",
        },
      });
      controlsApplied = decision.accepted;
    }
    const workQueueReadbackState = submit.runtimeJobId
      ? await readLatestWorkQueueState({
          runtimeJobs: input.runtimeJobs,
          workQueue: input.workQueue,
          workItemId,
        })
      : null;
    results.push(
      summarizeSubmitResult({ scenario, promptHash, submit, workItemId, workQueueReadbackState }),
    );
  }

  const normalChatPreserved = Boolean(
    results.find((result) => result.scenarioId === "normal_chat" && !result.runtimeJobCreated),
  );
  const planOnlyPreserved = Boolean(
    results.find((result) => result.scenarioId === "plan_only" && !result.runtimeJobCreated),
  );
  const executionRouted = results.some((result) => result.runtimeJobCreated);
  const slashBypassed = Boolean(
    results.find((result) => result.scenarioId === "slash_protocol" && result.protocolBypassed),
  );
  const noFalseExecution = results
    .filter((result) =>
      [
        "normal_chat",
        "plan_only",
        "negated_outbound",
        "conditional_deploy",
        "slash_protocol",
      ].includes(result.scenarioId),
    )
    .every((result) => !result.runtimeJobCreated);
  const status =
    normalChatPreserved && planOnlyPreserved && executionRouted && slashBypassed && noFalseExecution
      ? "completed"
      : "needs_review";
  return {
    artifactKind: "normal_ux_prompt_to_workflow_dogfood_result",
    dogfoodVersion: NORMAL_UX_DOGFOOD_VERSION,
    status,
    mode: input.mode ?? "fixture",
    scenarioCount: results.length,
    runtimeJobIds,
    workItemIds,
    results,
    normalChatPreserved,
    planOnlyPreserved,
    executionRouted,
    slashBypassed,
    noFalseExecution,
    runtimeJobsCreated: runtimeJobIds.length > 0,
    authorityGranted: false,
    controlsApplied,
    deployPerformed: false,
    outboundSendPerformed: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function summarizeSubmitResult(input: {
  scenario: NormalUxDogfoodScenario;
  promptHash: string;
  submit: NativeExecutionSubmitResult;
  workItemId: string;
  workQueueReadbackState: string | null;
}): NormalUxDogfoodScenarioResult {
  const runtimeJobCreated = Boolean(input.submit.runtimeJobId);
  return {
    scenarioId: input.scenario.scenarioId,
    promptHash: input.promptHash,
    expectedBehavior: input.scenario.expectedBehavior,
    status:
      input.submit.statusCode >= 500
        ? "blocked"
        : input.submit.statusCode >= 400
          ? "needs_review"
          : "completed",
    runtimeJobId: input.submit.runtimeJobId,
    workItemId: runtimeJobCreated ? input.workItemId : null,
    route: input.submit.frontDoorRouterResult?.output?.route ?? null,
    accepted: input.submit.accepted,
    protocolBypassed: false,
    runtimeJobCreated,
    workQueueReadbackState: input.workQueueReadbackState,
    reasonCodes: input.submit.reasonCodes.slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function maybeCompleteRuntimeJob(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  scenarioId: NormalUxDogfoodScenarioId;
}): Promise<void> {
  if (input.scenarioId === "coding_team" || input.scenarioId === "research_to_coding") {
    await new AgentTeamQueuedRunner({
      runtimeJobs: input.runtimeJobs,
      workerId: `normal-ux-dogfood-${input.scenarioId}`,
      queueName: "agent-team",
      runtimeJobId: input.runtimeJobId,
    }).runOnce();
    return;
  }
  if (input.scenarioId !== "web_research") {
    return;
  }
  const claim = await input.runtimeJobs.claimNextJob({
    workerId: "normal-ux-dogfood-web-research",
    queueName: "agent-team",
    runtimeJobId: input.runtimeJobId,
  });
  if (!claim) {
    return;
  }
  const evidence = createWebResearchRuntimeEvidence({
    runtimeJobId: input.runtimeJobId,
    researchRunId: `research-run-${input.runtimeJobId}`,
    boundedQuerySummary: "Research current structured-output guidance with bounded citations.",
    boundedAnswerSummary:
      "Fixture research stores bounded source refs, hashes, and citation summaries only.",
    sources: [
      {
        sourceRef: "official-openai-docs://structured-outputs",
        sourceKind: "official_docs",
        urlHash: hash("https://platform.openai.com/docs/guides/structured-outputs"),
        contentHash: "normal-ux-dogfood-fixture-content-hash",
        titleSummary: "OpenAI structured outputs guide",
        citationSummary: "Bounded official docs source ref; no page body stored.",
        retrievedAt: new Date().toISOString(),
      },
    ],
    reasonCodes: ["normal_ux_dogfood_web_research_completed"],
  });
  const evidenceRef = await recordWebResearchRuntimeEvidence({
    runtimeJobs: input.runtimeJobs,
    evidence,
  });
  await input.runtimeJobs.completeJob({
    leaseToken: claim.leaseToken,
    result: {
      workflowId: "single_agent.web_research",
      researchRunId: evidence.researchRunId,
      evidenceRef: evidenceRef.uri,
      sourceCount: evidence.sources.length,
      citationCount: evidence.citationRefs.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    },
  });
}

async function readLatestWorkQueueState(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  workItemId: string;
}): Promise<string | null> {
  const model = await buildWorkQueueExecutionReadModel(input);
  return model.runtimeJobs.at(-1)?.runtimeJobState ?? null;
}
