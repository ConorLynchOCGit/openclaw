import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  listWorkflowRouterSummaries,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import {
  hashPrompt,
  parseStructuredIntentRouterOutput,
  summarizePrompt,
  type StructuredIntentRouterOutput,
} from "./intent-router-schema.ts";

export type IntentRouterProviderRequest = {
  promptSummary: string;
  promptHash: string;
  workflowSummaries: ReturnType<typeof listWorkflowRouterSummaries>;
  runtimeContext?: JsonValue | null;
};

export type IntentRouterProviderResponse = {
  output: unknown;
  modelCandidateId?: string | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
};

export interface IntentRouterProvider {
  route(request: IntentRouterProviderRequest): Promise<IntentRouterProviderResponse>;
}

export const LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK_ENV =
  "OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK";

export function isTemporaryLegacySemanticIntentRoutingFallbackEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const testRuntime =
    env.NODE_ENV === "test" || env.VITEST === "true" || env.OPENCLAW_TEST_MINIMAL_GATEWAY === "1";
  return testRuntime && env[LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK_ENV] === "1";
}

export class HeuristicIntentRouterProvider implements IntentRouterProvider {
  constructor(
    private readonly options: {
      enabled?: boolean;
      allowHighRiskOrControlRoutes?: boolean;
      fallbackLabel?: string;
    } = {},
  ) {}

  async route(request: IntentRouterProviderRequest): Promise<IntentRouterProviderResponse> {
    if (this.options.enabled !== true && !isTemporaryLegacySemanticIntentRoutingFallbackEnabled()) {
      return this.disabledResponse(request);
    }
    const text = request.promptSummary.toLowerCase();
    const codingWorkflow = request.workflowSummaries.find(
      (workflow) => workflow.workflowId === "agent_team.coding",
    );
    const researchWorkflow = request.workflowSummaries.find(
      (workflow) => workflow.workflowId === "single_agent.web_research",
    );
    const architectureWorkflow = request.workflowSummaries.find(
      (workflow) => workflow.workflowId === "agent_team.architecture",
    );
    const docsWorkflow = request.workflowSummaries.find(
      (workflow) => workflow.workflowId === "workflow.docs_skills",
    );
    const isWorkQueueControl = /\b(cancel|pause|redirect|retry|needs-review|needs review)\b/u.test(
      text,
    );
    const asksCodingTeam =
      /\bcoding team\b|\bagent team\b|\badd (a )?(small )?(regression )?test\b|\bcode change\b|\bfix\b/u.test(
        text,
      );
    const asksResearch =
      /\bresearch\b|\bsearch\b|\bbrowse\b|\bverify\b|\blook up\b|\bcurrent\b|\blatest\b|\bpricing\b|\bapi docs\b|\bbrowser support\b/u.test(
        text,
      );
    const asksArchitecture =
      /\barchitecture\b|\barchitect\b|\bspec\b|\bplan\b|\bdesign\b|\bimplementation plan\b/u.test(
        text,
      );
    const asksDocs = /\brunbook\b|\bdocument\b|\bdocs?\b|\bskills?\b|\brole docs?\b/u.test(text);
    const asksFullTeamExecution =
      /\bfull team\b/u.test(text) &&
      /\b(use|run|harden|improve|build|implement|fix|add|make|test|review|deploy if policy permits|close out|close it out)\b/u.test(
        text,
      );
    const isDirectProductionDeploy =
      /\bdeploy\b/u.test(text) &&
      /\bproduction\b/u.test(text) &&
      !asksCodingTeam &&
      !asksFullTeamExecution &&
      !asksArchitecture &&
      !asksDocs;
    if (
      this.options.allowHighRiskOrControlRoutes !== true &&
      (isWorkQueueControl ||
        isDirectProductionDeploy ||
        /\b(send|outbound|install|dependency|model promotion|promote(?: the)? model|production)\b/u.test(
          text,
        ))
    ) {
      return {
        output: {
          route: "clarification_required",
          workflowId: null,
          jobType: null,
          confidence: 0.4,
          objectiveSummary: request.promptSummary,
          compiledInputs: {},
          requestedAuthority: null,
          requiresApproval: false,
          approvalKind: null,
          needsClarification: true,
          clarificationQuestion:
            "This legacy routing fallback cannot handle controls or high-risk authority requests.",
          reasonCodes: [
            "legacy_semantic_fallback_high_risk_or_control_rejected",
            "structured_front_door_required",
          ],
          riskClass: "medium",
          sideEffectClass: "none",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: this.options.fallbackLabel ?? "legacy-semantic-intent-router-disabled",
        latencyMs: 0,
      };
    }
    if (isDirectProductionDeploy) {
      return {
        output: {
          route: "blocked",
          workflowId: null,
          jobType: null,
          confidence: 0.92,
          objectiveSummary: request.promptSummary,
          compiledInputs: {},
          requestedAuthority: "deploy_production",
          requiresApproval: true,
          approvalKind: "production_deploy",
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: ["production_deploy_locked"],
          riskClass: "critical",
          sideEffectClass: "production_side_effect",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    if ((asksCodingTeam || asksFullTeamExecution) && codingWorkflow) {
      return {
        output: {
          route: "workflow_execution",
          workflowId: codingWorkflow.workflowId,
          jobType: codingWorkflow.jobType,
          confidence: 0.91,
          objectiveSummary: request.promptSummary,
          compiledInputs: {
            targetArea: "execution-platform",
            requestedChangeClass: text.includes("test") ? "test" : "code_change",
            childWorkflowRequests: asksResearch
              ? [{ workflowId: "single_agent.web_research", requirement: "optional" }]
              : [],
          },
          requestedAuthority: codingWorkflow.defaultAuthorityProfile,
          requiresApproval: false,
          approvalKind: null,
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: [
            "coding_team_requested",
            asksFullTeamExecution ? "full_team_execution_requested" : "explicit_coding_team",
            text.includes("test") ? "test_requested" : "code_change_requested",
            asksResearch ? "research_candidate_child_workflow" : "local_context_sufficient",
          ],
          riskClass: "medium",
          sideEffectClass: "code_edit",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    if (isWorkQueueControl) {
      return {
        output: {
          route: "work_queue_control",
          workflowId: null,
          jobType: null,
          confidence: 0.8,
          objectiveSummary: request.promptSummary,
          compiledInputs: { controlIntent: true },
          requestedAuthority: "runtime_control",
          requiresApproval: false,
          approvalKind: null,
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: ["work_queue_control_requested"],
          riskClass: "medium",
          sideEffectClass: "none",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    if (asksArchitecture && architectureWorkflow) {
      return {
        output: {
          route: "workflow_execution",
          workflowId: architectureWorkflow.workflowId,
          jobType: architectureWorkflow.jobType,
          confidence: 0.88,
          objectiveSummary: request.promptSummary,
          compiledInputs: {
            targetArea: "execution-platform",
            requestedChangeClass: "architecture_plan",
            childWorkflowRequests: asksResearch
              ? [{ workflowId: "single_agent.web_research", requirement: "optional" }]
              : [],
          },
          requestedAuthority: architectureWorkflow.defaultAuthorityProfile,
          requiresApproval: false,
          approvalKind: null,
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: [
            "architecture_workflow_requested",
            asksResearch ? "research_candidate_child_workflow" : "planning_requested",
          ],
          riskClass: "medium",
          sideEffectClass: "read_only",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    if (asksResearch && !asksArchitecture && researchWorkflow) {
      return {
        output: {
          route: "workflow_execution",
          workflowId: researchWorkflow.workflowId,
          jobType: researchWorkflow.jobType,
          confidence: 0.9,
          objectiveSummary: request.promptSummary,
          compiledInputs: {
            querySummary: request.promptSummary,
            sourceScope: "bounded_readonly",
          },
          requestedAuthority: researchWorkflow.defaultAuthorityProfile,
          requiresApproval: false,
          approvalKind: null,
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: ["web_research_requested"],
          riskClass: "medium",
          sideEffectClass: "outbound_readonly",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    if (asksDocs && docsWorkflow) {
      return {
        output: {
          route: "workflow_execution",
          workflowId: docsWorkflow.workflowId,
          jobType: docsWorkflow.jobType,
          confidence: 0.86,
          objectiveSummary: request.promptSummary,
          compiledInputs: {
            targetArea: "execution-platform-docs",
            requestedChangeClass: "docs_skills",
            childWorkflowRequests: asksResearch
              ? [{ workflowId: "single_agent.web_research", requirement: "optional" }]
              : [],
          },
          requestedAuthority: docsWorkflow.defaultAuthorityProfile,
          requiresApproval: false,
          approvalKind: null,
          needsClarification: false,
          clarificationQuestion: null,
          reasonCodes: ["docs_skills_workflow_requested"],
          riskClass: "medium",
          sideEffectClass: "code_edit",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        modelCandidateId: "heuristic-intent-router",
        latencyMs: 0,
      };
    }
    return {
      output: {
        route: "clarification_required",
        workflowId: null,
        jobType: null,
        confidence: 0.54,
        objectiveSummary: request.promptSummary,
        compiledInputs: {},
        requestedAuthority: null,
        requiresApproval: false,
        approvalKind: null,
        needsClarification: true,
        clarificationQuestion: "Do you want OpenClaw to run this as an execution workflow?",
        reasonCodes: ["workflow_unclear"],
        riskClass: "low",
        sideEffectClass: "none",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      modelCandidateId: "heuristic-intent-router",
      latencyMs: 0,
    };
  }

  private disabledResponse(request: IntentRouterProviderRequest): IntentRouterProviderResponse {
    return {
      output: {
        route: "clarification_required",
        workflowId: null,
        jobType: null,
        confidence: 0,
        objectiveSummary: request.promptSummary,
        compiledInputs: {},
        requestedAuthority: null,
        requiresApproval: false,
        approvalKind: null,
        needsClarification: true,
        clarificationQuestion:
          "The temporary legacy semantic intent fallback is disabled; use the structured Intent Front Door router.",
        reasonCodes: ["legacy_semantic_intent_fallback_disabled", "structured_front_door_required"],
        riskClass: "low",
        sideEffectClass: "none",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      modelCandidateId: this.options.fallbackLabel ?? "legacy-semantic-intent-router-disabled",
      latencyMs: 0,
    };
  }
}

export type ModelAssistedIntentRouterDecision = {
  artifactKind: "execution_intent_router_decision";
  promptHash: string;
  promptSummary: string;
  routeDecision: StructuredIntentRouterOutput;
  modelCandidateId: string | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  parseReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export class ModelAssistedIntentRouter {
  constructor(
    private readonly provider: IntentRouterProvider = new HeuristicIntentRouterProvider(),
    private readonly registry: WorkflowRegistry = DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  ) {}

  async route(input: {
    prompt: string;
    runtimeContext?: JsonValue | null;
  }): Promise<ModelAssistedIntentRouterDecision> {
    const promptHash = hashPrompt(input.prompt);
    const response = await this.provider.route({
      promptHash,
      promptSummary: summarizePrompt(input.prompt),
      workflowSummaries: listWorkflowRouterSummaries(this.registry),
      runtimeContext: input.runtimeContext ?? null,
    });
    const parsed = parseStructuredIntentRouterOutput(response.output);
    if (!parsed.valid || !parsed.output) {
      throw new Error(
        `intent router provider returned invalid output: ${parsed.reasonCodes.join(",")}`,
      );
    }
    return {
      artifactKind: "execution_intent_router_decision",
      promptHash,
      promptSummary: summarizePrompt(input.prompt),
      routeDecision: parsed.output,
      modelCandidateId: response.modelCandidateId ?? null,
      latencyMs: response.latencyMs ?? null,
      estimatedCostUsd: response.estimatedCostUsd ?? null,
      parseReasonCodes: parsed.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
}

export async function recordIntentRouterDecision(input: {
  runtimeJobs: RuntimeJobRepository;
  runtimeJobId: string;
  decision: ModelAssistedIntentRouterDecision;
}): Promise<void> {
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJobId,
    artifactType: "execution.intent_router_decision",
    storageKind: "metadata",
    uri: `runtime-job://${input.runtimeJobId}/execution/intent-router-decision`,
    contentType: "application/json",
    metadata: input.decision as unknown as JsonValue,
  });
}
