import type {
  AgentTeamRoleQualificationStatus,
  AgentTeamRoleTargetId,
} from "../model-routing/agent-team-role-evals.ts";
import {
  OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
  type RequestedModelCandidate,
} from "../model-routing/model-candidate-validation-plan.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  createTrustedLocalYoloProfile,
  trustedLocalYoloProfileToLiveRequestAuthorityBlock,
  validateTrustedLocalYoloProfile,
  type TrustedLocalYoloAuthorityProfile,
} from "./trusted-local-yolo-profile.ts";

export type AgentTeamRoleId =
  | "orchestrator"
  | "context_scout"
  | "architect_spec_writer"
  | "implementation_engineer"
  | "test_engineer"
  | "reviewer"
  | "security_privacy_reviewer"
  | "refactor_engineer"
  | "devops_release_sre"
  | "guardrail_auditor"
  | "observability_scribe"
  | "docs_skills_writer";

export type AgentTeamModelAssignment = {
  roleId: AgentTeamRoleId;
  provider: "openai_local_codex" | "openrouter" | "operator_human" | "deterministic_runtime";
  modelId: string;
  modelLabel: string;
  assignmentReason: string;
  authority: "orchestration" | "implementation" | "testing" | "review" | "observe" | "docs";
  liveAuthorityGrantedNow: false;
  requiresAcceptanceBy: AgentTeamRoleId | "operator";
  evidenceRefs: string[];
  roleTargetId?: AgentTeamRoleTargetId;
  roleQualificationStatus?: AgentTeamRoleQualificationStatus;
};

export type AgentTeamRolePlan = {
  roleId: AgentTeamRoleId;
  purpose: string;
  responsibilities: string[];
  mayEditRepo: boolean;
  mayRunValidation: boolean;
  mayAcceptWork: boolean;
  stopConditions: string[];
  localSpecRef: string;
  activation?: "required" | "conditional";
};

export type AgentTeamHandoffRule = {
  handoffId: string;
  fromRole: AgentTeamRoleId;
  toRole: AgentTeamRoleId;
  handoffKind:
    | "delegation"
    | "implementation_to_test"
    | "test_to_review"
    | "review_to_repair"
    | "review_to_closeout"
    | "evidence_capture";
  requiredPayloadFields: string[];
  boundedContextOnly: true;
  rawTranscriptAllowed: false;
  rawProviderPromptAllowed: false;
  privateReasoningAllowed: false;
  acceptanceCriteria: string[];
  stopConditions: string[];
};

export type AgentTeamResearchSource = {
  sourceId: string;
  title: string;
  url: string;
  sourceKind:
    | "official_openai_docs"
    | "official_vendor_docs"
    | "security_guidance"
    | "provider_catalog_docs"
    | "local_spec";
  findingApplied: string;
};

export type AgentTeamAuthorityPlan = {
  profile: TrustedLocalYoloAuthorityProfile;
  liveRequestAuthorityBlock: JsonValue;
  highBlastRadiusAuthoritiesGrantedNow: false;
  deployAllowed: false;
  outboundSendingAllowed: false;
  modelPromotionAllowed: false;
  workQueueLifecycleMutationAllowed: false;
  acpRequiredForFirstTeamRun: true;
  supabaseRuntimePersistenceRequired: true;
  durableControlsRequired: true;
  closeoutRequired: true;
};

export type AgentTeamControlPlan = {
  pauseRequired: true;
  redirectRequired: true;
  cancelRequired: true;
  staleHeartbeatAction: "pause";
  scopeDriftAction: "pause";
  validationFailureAction: "repair_or_needs_review";
  missingCloseoutAction: "pause_or_needs_review";
  commandTruthSource: "execution_platform_runtime_jobs";
};

export type AgentTeamCloseoutRequirement = {
  workEpisodeOutcomePackRequired: true;
  bridgeResultReviewRequired: true;
  validationEvidenceRequired: true;
  streamEvidenceRequired: true;
  heartbeatEvidenceRequired: true;
  noRawTranscriptPromptOrLogStorage: true;
};

export type AgentTeamPlanningSlice = {
  artifactKind: "codex_bridge_agent_team_implementation_plan";
  planId: string;
  createdAt: string;
  planMode: "planning_only";
  firstImplementationObjective: {
    objectiveId: string;
    title: string;
    summary: string;
    targetScope: string[];
    expectedValidation: string[];
    riskClass: "bounded_agent_team_implementation";
  };
  roles: AgentTeamRolePlan[];
  modelAssignments: AgentTeamModelAssignment[];
  handoffRules: AgentTeamHandoffRule[];
  authorityPlan: AgentTeamAuthorityPlan;
  controlPlan: AgentTeamControlPlan;
  closeoutRequirements: AgentTeamCloseoutRequirement;
  successCriteria: string[];
  researchSources: AgentTeamResearchSource[];
  localSpecRefs: string[];
  modelValidationEvidenceRefs: string[];
  runtimeEvidenceRefs: string[];
  noLiveFlags: {
    codexCliInvoked: false;
    acpSessionStarted: false;
    providerCallMade: false;
    rebuildPerformed: false;
    deployPerformed: false;
    outboundSendPerformed: false;
    modelPromotionPerformed: false;
    workQueueLifecycleMutated: false;
    daemonStarted: false;
    schedulerStarted: false;
  };
  allowedToPlanFirstAgentTeamImplementation: boolean;
  allowedToRunFirstAgentTeamImplementation: false;
  blockingReasons: string[];
  requiredNextOperatorAction: string;
};

export type AgentTeamPlanValidationReport = {
  artifactKind: "codex_bridge_agent_team_plan_validation";
  planId: string;
  validForPlanning: boolean;
  allowedToRunFirstAgentTeamImplementation: false;
  blockingReasons: string[];
  warnings: string[];
};

const DEFAULT_MODEL_VALIDATION_EVIDENCE_REFS = [
  ".artifacts/execution-platform/model-candidate-validation-plan-proof.json",
  ".artifacts/execution-platform/openrouter-coding-executor-eval-proof.json",
];

const DEFAULT_RUNTIME_EVIDENCE_REFS = [
  ".artifacts/execution-platform/real-acp-endpoint-pilot-rerun-proof.json",
  ".artifacts/execution-platform/production-like-host-supervisor-e2e-proof.json",
];

export const AGENT_TEAM_RESEARCH_SOURCES: AgentTeamResearchSource[] = [
  {
    sourceId: "openai-agents-orchestration",
    title: "OpenAI Agents SDK: Agent orchestration",
    url: "https://openai.github.io/openai-agents-python/multi_agent/",
    sourceKind: "official_openai_docs",
    findingApplied:
      "Use a manager/orchestrator for shared guardrails and specialist agents for bounded subtasks; combine model-driven and code-driven orchestration.",
  },
  {
    sourceId: "openai-agents-guardrails",
    title: "OpenAI Agents SDK: Guardrails",
    url: "https://openai.github.io/openai-agents-python/guardrails/",
    sourceKind: "official_openai_docs",
    findingApplied:
      "Use boundary checks around inputs, outputs, and tool calls rather than relying only on role prompts.",
  },
  {
    sourceId: "openai-agents-tracing",
    title: "OpenAI Agents SDK: Tracing",
    url: "https://openai.github.io/openai-agents-python/tracing/",
    sourceKind: "official_openai_docs",
    findingApplied:
      "Persist bounded stream, handoff, guardrail, and tool-call evidence for debugging and production review.",
  },
  {
    sourceId: "anthropic-multi-agent-research",
    title: "Anthropic: How we built our multi-agent research system",
    url: "https://www.anthropic.com/engineering/multi-agent-research-system",
    sourceKind: "official_vendor_docs",
    findingApplied:
      "Prefer lead-agent orchestration with specialized workers, explicit guardrails, observability, and evals for complex tasks.",
  },
  {
    sourceId: "google-adk-multi-agent",
    title: "Google ADK: Multi-agent systems",
    url: "https://adk.dev/agents/multi-agents/",
    sourceKind: "official_vendor_docs",
    findingApplied:
      "Represent sequential, parallel, loop, review/critique, and human-in-the-loop patterns explicitly.",
  },
  {
    sourceId: "microsoft-agent-group-chat",
    title: "Microsoft Agent Framework: Group chat orchestration",
    url: "https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/group-chat",
    sourceKind: "official_vendor_docs",
    findingApplied:
      "Keep a central orchestrator responsible for speaker selection, max rounds, iterative refinement, and termination.",
  },
  {
    sourceId: "owasp-multi-agent-threat-modeling",
    title: "OWASP GenAI: Multi-Agentic system Threat Modeling Guide v1.0",
    url: "https://genai.owasp.org/resource/multi-agentic-system-threat-modeling-guide-v1-0/",
    sourceKind: "security_guidance",
    findingApplied:
      "Treat multi-agent coordination as a new attack surface and require authority, handoff, and evidence boundaries.",
  },
  {
    sourceId: "owasp-agentic-skills-top-10",
    title: "OWASP Agentic Skills Top 10",
    url: "https://owasp.org/www-project-agentic-skills-top-10/",
    sourceKind: "security_guidance",
    findingApplied:
      "Treat skills as execution-layer behavior, not harmless text; require permission review and bounded activation.",
  },
  {
    sourceId: "openrouter-models-api",
    title: "OpenRouter: List all models and their properties",
    url: "https://openrouter.ai/docs/api/api-reference/models/get-models",
    sourceKind: "provider_catalog_docs",
    findingApplied:
      "Model assignments require current provider catalog evidence, not benchmark claims alone.",
  },
];

function createRolePlans(): AgentTeamRolePlan[] {
  return [
    {
      roleId: "orchestrator",
      purpose: "Own decomposition, sequencing, runtime gates, and final acceptance.",
      responsibilities: [
        "create bounded task graph",
        "assign roles and models",
        "enforce stop conditions",
        "accept or redirect work based on evidence",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: true,
      stopConditions: [
        "scope drift",
        "missing validation",
        "missing closeout",
        "unsafe authority request",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/orchestrator.md",
    },
    {
      roleId: "context_scout",
      purpose: "Find relevant code, contracts, tests, docs, and hidden dependencies before edits.",
      responsibilities: [
        "search the repo with read-only tools",
        "summarize existing patterns and constraints",
        "suggest files to change and files not to touch",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: ["scope cannot be bounded", "source of truth is ambiguous"],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/context_scout.md",
    },
    {
      roleId: "architect_spec_writer",
      purpose: "Translate the objective into explicit contracts and integration boundaries.",
      responsibilities: [
        "draft scoped spec",
        "identify interface impacts",
        "define validation plan",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: [
        "runtime truth ambiguity",
        "unbounded scope",
        "missing rollback expectation",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/architect_spec_writer.md",
    },
    {
      roleId: "implementation_engineer",
      purpose: "Implement the bounded source/test change and repair validation failures.",
      responsibilities: [
        "inspect scoped files",
        "edit approved scope",
        "run approved validation",
        "repair failures",
      ],
      mayEditRepo: true,
      mayRunValidation: true,
      mayAcceptWork: false,
      stopConditions: [
        "scope drift",
        "forbidden authority needed",
        "validation cannot be repaired",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/implementation_engineer.md",
    },
    {
      roleId: "test_engineer",
      purpose: "Design and run evidence-oriented tests for handoff and runtime behavior.",
      responsibilities: [
        "write focused tests",
        "check edge cases",
        "differentiate process completion from success",
      ],
      mayEditRepo: true,
      mayRunValidation: true,
      mayAcceptWork: false,
      stopConditions: [
        "test asserts arbitrary schema instead of product behavior",
        "test requires live provider",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/test_engineer.md",
    },
    {
      roleId: "reviewer",
      purpose: "Review the completed patch against objective, risks, and missing proof.",
      responsibilities: [
        "review diff",
        "identify regressions",
        "separate deterministic validation from judgment",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: ["high severity finding", "missing qualitative review boundary"],
      localSpecRef: "/root/.openclaw/workspace/docs/projects/execution-platform/roles/reviewer.md",
    },
    {
      roleId: "security_privacy_reviewer",
      purpose: "Review auth, secrets, injection, command execution, logging, and agent authority.",
      responsibilities: [
        "identify security/privacy findings by severity",
        "check agent permissions and tool scope",
        "escalate high-risk findings for operator or local Codex review",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: [
        "secret exposure",
        "unapproved authority expansion",
        "high severity finding",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/security_privacy_reviewer.md",
    },
    {
      roleId: "refactor_engineer",
      purpose: "Conditionally simplify boundaries and remove duplication when agent work needs it.",
      responsibilities: [
        "make behavior-preserving maintainability changes",
        "keep refactors scoped and separately validated",
        "avoid API/schema behavior changes unless explicitly authorized",
      ],
      mayEditRepo: true,
      mayRunValidation: true,
      mayAcceptWork: false,
      stopConditions: ["behavior change needed", "scope exceeds maintainability-only patch"],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/refactor_engineer.md",
      activation: "conditional",
    },
    {
      roleId: "devops_release_sre",
      purpose: "Conditionally handle CI, observability, rollback, and release-readiness evidence.",
      responsibilities: [
        "summarize CI and runtime evidence",
        "prepare rollback and release-readiness notes",
        "keep production deploy gated by explicit operator approval",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: ["production deploy requested", "cloud access would exceed approved scope"],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/devops_release_sre.md",
      activation: "conditional",
    },
    {
      roleId: "guardrail_auditor",
      purpose: "Audit handoffs, authority, and runtime emissions for safety boundary drift.",
      responsibilities: [
        "check authority creep",
        "check prompt and artifact hygiene",
        "recommend pause or redirect",
      ],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: ["forbidden authority request", "raw transcript or secret storage"],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/guardrail_auditor.md",
    },
    {
      roleId: "observability_scribe",
      purpose: "Capture bounded runtime evidence and summarize missing artifacts.",
      responsibilities: ["summarize stream evidence", "verify closeout refs", "avoid raw logs"],
      mayEditRepo: false,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: ["unbounded log capture", "missing runtime artifact pointers"],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/observability_scribe.md",
    },
    {
      roleId: "docs_skills_writer",
      purpose: "Update docs and skill guidance after accepted implementation evidence.",
      responsibilities: [
        "write bounded docs updates",
        "record limitations",
        "avoid claiming runtime truth from docs",
      ],
      mayEditRepo: true,
      mayRunValidation: false,
      mayAcceptWork: false,
      stopConditions: [
        "docs assert unsupported live behavior",
        "skill text grants runtime authority",
      ],
      localSpecRef:
        "/root/.openclaw/workspace/docs/projects/execution-platform/roles/docs_skills_writer.md",
    },
  ];
}

function findCandidate(
  candidates: RequestedModelCandidate[],
  candidateId: string,
): RequestedModelCandidate {
  const candidate = candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`missing model candidate ${candidateId}`);
  }
  return candidate;
}

function createModelAssignments(input: {
  candidates: RequestedModelCandidate[];
  evidenceRefs: string[];
  v4ProRoleStatuses?: Partial<Record<AgentTeamRoleTargetId, AgentTeamRoleQualificationStatus>>;
}): AgentTeamModelAssignment[] {
  const kimi = findCandidate(input.candidates, "kimi-2-6-coding-candidate");
  const deepseek = findCandidate(input.candidates, "deepseek-v4-coding-candidate");
  const deepseekPro = findCandidate(input.candidates, "deepseek-v4-pro-coding-candidate");
  const v4ProContextStatus = input.v4ProRoleStatuses?.context_scout ?? "needs_review";
  const v4ProSecurityStatus =
    input.v4ProRoleStatuses?.security_privacy_reviewer_assist ?? "needs_review";
  return [
    {
      roleId: "orchestrator",
      provider: "openai_local_codex",
      modelId: "local-codex-operator-session",
      modelLabel: "OpenAI Codex local operator",
      assignmentReason:
        "highest authority role keeps final routing and acceptance under the operator bridge lane",
      authority: "orchestration",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "operator",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "context_scout",
      provider: "openrouter",
      modelId: deepseekPro.openRouterModelId,
      modelLabel: deepseekPro.modelLabel,
      assignmentReason:
        "DeepSeek V4 Pro is evaluated separately for codebase research; assignment remains role-gated by V4 Pro scorecard evidence",
      authority: "observe",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "orchestrator",
      evidenceRefs: input.evidenceRefs,
      roleTargetId: "context_scout",
      roleQualificationStatus: v4ProContextStatus,
    },
    {
      roleId: "implementation_engineer",
      provider: "openrouter",
      modelId: kimi.openRouterModelId,
      modelLabel: kimi.modelLabel,
      assignmentReason:
        "validated coding-executor candidate for bounded implementation and repair work",
      authority: "implementation",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "reviewer",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "test_engineer",
      provider: "openrouter",
      modelId: deepseek.openRouterModelId,
      modelLabel: deepseek.modelLabel,
      assignmentReason:
        "validated alternate coding candidate for independent test and recovery coverage",
      authority: "testing",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "reviewer",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "reviewer",
      provider: "openai_local_codex",
      modelId: "frontier-reviewer-lane",
      modelLabel: "Frontier reviewer lane",
      assignmentReason:
        "final qualitative review should be separated from implementation and not treated as deterministic",
      authority: "review",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "operator",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "security_privacy_reviewer",
      provider: "openrouter",
      modelId: deepseekPro.openRouterModelId,
      modelLabel: deepseekPro.modelLabel,
      assignmentReason:
        "DeepSeek V4 Pro may assist security/privacy review only where role-specific scorecards qualify it; final verdict remains local Codex/operator-gated",
      authority: "review",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "reviewer",
      evidenceRefs: input.evidenceRefs,
      roleTargetId: "security_privacy_reviewer_assist",
      roleQualificationStatus: v4ProSecurityStatus,
    },
    {
      roleId: "guardrail_auditor",
      provider: "deterministic_runtime",
      modelId: "execution-platform-guardrail-checks-plus-review-escalation",
      modelLabel: "Runtime guardrails with reviewer escalation",
      assignmentReason:
        "hard boundaries are checked deterministically, with model or human review for judgment",
      authority: "review",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "orchestrator",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "observability_scribe",
      provider: "openrouter",
      modelId: deepseek.openRouterModelId,
      modelLabel: deepseek.modelLabel,
      assignmentReason:
        "bounded summaries and missing-evidence checks are low-risk when raw logs are excluded",
      authority: "observe",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "orchestrator",
      evidenceRefs: input.evidenceRefs,
    },
    {
      roleId: "docs_skills_writer",
      provider: "openrouter",
      modelId: kimi.openRouterModelId,
      modelLabel: kimi.modelLabel,
      assignmentReason:
        "docs and skill updates benefit from the implementation context but remain review-gated",
      authority: "docs",
      liveAuthorityGrantedNow: false,
      requiresAcceptanceBy: "reviewer",
      evidenceRefs: input.evidenceRefs,
    },
  ];
}

function createHandoffRules(): AgentTeamHandoffRule[] {
  return [
    {
      handoffId: "orchestrator-to-architect",
      fromRole: "orchestrator",
      toRole: "architect_spec_writer",
      handoffKind: "delegation",
      requiredPayloadFields: ["objective", "scope", "runtimeTruthSource", "acceptanceCriteria"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: [
        "spec identifies authority boundaries",
        "spec includes validation and rollback plan",
      ],
      stopConditions: ["scope cannot be bounded", "runtime truth source is ambiguous"],
    },
    {
      handoffId: "architect-to-implementer",
      fromRole: "architect_spec_writer",
      toRole: "implementation_engineer",
      handoffKind: "delegation",
      requiredPayloadFields: ["ownedFilesOrModuleScope", "prohibitedActions", "validationCommands"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: ["patch remains in scope", "validation and repair evidence is produced"],
      stopConditions: ["requested action needs unapproved high-blast-radius authority"],
    },
    {
      handoffId: "implementer-to-tester",
      fromRole: "implementation_engineer",
      toRole: "test_engineer",
      handoffKind: "implementation_to_test",
      requiredPayloadFields: ["diffSummary", "filesChanged", "validationRun", "knownRisks"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: [
        "tests cover behavior not arbitrary schema only",
        "failure is not reported as success",
      ],
      stopConditions: ["missing diff summary", "missing validation command"],
    },
    {
      handoffId: "tester-to-reviewer",
      fromRole: "test_engineer",
      toRole: "reviewer",
      handoffKind: "test_to_review",
      requiredPayloadFields: ["testResults", "remainingGaps", "artifactRefs"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: ["review separates validation pass from qualitative goal satisfaction"],
      stopConditions: ["no artifact refs", "qualitative claim is labeled deterministic"],
    },
    {
      handoffId: "reviewer-to-implementer-repair",
      fromRole: "reviewer",
      toRole: "implementation_engineer",
      handoffKind: "review_to_repair",
      requiredPayloadFields: ["findings", "severity", "requiredRepair", "validationToRerun"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: ["repair addresses findings", "validation rerun evidence exists"],
      stopConditions: ["repair requires new unapproved scope", "repair attempts exhausted"],
    },
    {
      handoffId: "reviewer-to-observability-closeout",
      fromRole: "reviewer",
      toRole: "observability_scribe",
      handoffKind: "review_to_closeout",
      requiredPayloadFields: ["acceptedFindings", "validationEvidence", "reviewArtifactRef"],
      boundedContextOnly: true,
      rawTranscriptAllowed: false,
      rawProviderPromptAllowed: false,
      privateReasoningAllowed: false,
      acceptanceCriteria: [
        "closeout pack pointer emitted",
        "Work Queue read model can consume evidence",
      ],
      stopConditions: ["missing review artifact", "missing closeout eligibility"],
    },
  ];
}

export function createFirstAgentTeamImplementationPlan(
  input: {
    planId?: string;
    createdAt?: string;
    candidates?: RequestedModelCandidate[];
    modelValidationEvidenceRefs?: string[];
    runtimeEvidenceRefs?: string[];
    authorityProfile?: TrustedLocalYoloAuthorityProfile;
    researchSources?: AgentTeamResearchSource[];
    v4ProRoleStatuses?: Partial<Record<AgentTeamRoleTargetId, AgentTeamRoleQualificationStatus>>;
  } = {},
): AgentTeamPlanningSlice {
  const modelValidationEvidenceRefs =
    input.modelValidationEvidenceRefs ?? DEFAULT_MODEL_VALIDATION_EVIDENCE_REFS;
  const runtimeEvidenceRefs = input.runtimeEvidenceRefs ?? DEFAULT_RUNTIME_EVIDENCE_REFS;
  const candidates = input.candidates ?? OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES;
  const authorityProfile =
    input.authorityProfile ??
    createTrustedLocalYoloProfile({
      profileId: "trusted-local-yolo-v1-for-first-agent-team-implementation",
      acpAllowed: true,
      metadata: {
        agentTeamPlanningOnly: true,
        highBlastRadiusAuthoritiesGrantedNow: false,
      },
    });
  const authorityValidation = validateTrustedLocalYoloProfile(authorityProfile);
  const roles = createRolePlans();
  const handoffRules = createHandoffRules();
  const blockingReasons: string[] = [];

  if (modelValidationEvidenceRefs.length === 0) {
    blockingReasons.push("model_validation_evidence_refs_required");
  }
  if (runtimeEvidenceRefs.length === 0) {
    blockingReasons.push("runtime_evidence_refs_required");
  }
  if (!authorityValidation.valid) {
    blockingReasons.push(...authorityValidation.blockingReasons);
  }
  if (roles.length < 6) {
    blockingReasons.push("agent_team_roles_incomplete");
  }
  if (handoffRules.length < 4) {
    blockingReasons.push("agent_team_handoff_rules_incomplete");
  }

  return {
    artifactKind: "codex_bridge_agent_team_implementation_plan",
    planId: input.planId ?? "agent-team-planning-slice-1",
    createdAt: input.createdAt ?? new Date().toISOString(),
    planMode: "planning_only",
    firstImplementationObjective: {
      objectiveId: "agent-team-runtime-read-model-projection",
      title: "Agent-team runtime read-model projection",
      summary:
        "Add a small projection helper and tests that surface role assignment, handoff state, review state, and closeout requirements from runtime artifacts.",
      targetScope: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
      ],
      expectedValidation: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-plan.test.ts",
        "focused Work Queue execution read-model test for agent-team fields",
      ],
      riskClass: "bounded_agent_team_implementation",
    },
    roles,
    modelAssignments: createModelAssignments({
      candidates,
      evidenceRefs: modelValidationEvidenceRefs,
      v4ProRoleStatuses: input.v4ProRoleStatuses,
    }),
    handoffRules,
    authorityPlan: {
      profile: authorityProfile,
      liveRequestAuthorityBlock:
        trustedLocalYoloProfileToLiveRequestAuthorityBlock(authorityProfile),
      highBlastRadiusAuthoritiesGrantedNow: false,
      deployAllowed: false,
      outboundSendingAllowed: false,
      modelPromotionAllowed: false,
      workQueueLifecycleMutationAllowed: false,
      acpRequiredForFirstTeamRun: true,
      supabaseRuntimePersistenceRequired: true,
      durableControlsRequired: true,
      closeoutRequired: true,
    },
    controlPlan: {
      pauseRequired: true,
      redirectRequired: true,
      cancelRequired: true,
      staleHeartbeatAction: "pause",
      scopeDriftAction: "pause",
      validationFailureAction: "repair_or_needs_review",
      missingCloseoutAction: "pause_or_needs_review",
      commandTruthSource: "execution_platform_runtime_jobs",
    },
    closeoutRequirements: {
      workEpisodeOutcomePackRequired: true,
      bridgeResultReviewRequired: true,
      validationEvidenceRequired: true,
      streamEvidenceRequired: true,
      heartbeatEvidenceRequired: true,
      noRawTranscriptPromptOrLogStorage: true,
    },
    successCriteria: [
      "orchestrator emits bounded delegation plan before worker execution",
      "context scout reports relevant files and unknowns before implementation edits",
      "implementation and test agents receive only scoped handoff packages",
      "Kimi 2.6, DeepSeek V4 Flash, and DeepSeek V4 Pro are used only through validated OpenRouter model routes",
      "security/privacy reviewer assist cannot issue final acceptance or high-risk verdicts without local Codex/operator review",
      "review artifact separates deterministic validation from qualitative judgment",
      "durable pause redirect cancel controls remain available",
      "Work Queue read model consumes runtime truth and does not mutate lifecycle",
      "Work Episode Outcome Pack is emitted with artifact pointers and bounded summaries",
      "no deploy outbound send production model promotion hidden rebuild hidden install or raw log storage occurs",
    ],
    researchSources: input.researchSources ?? AGENT_TEAM_RESEARCH_SOURCES,
    localSpecRefs: [
      "/root/.openclaw/workspace/docs/projects/execution-platform/specs/execution-supervisor-protocol.md",
      "/root/.openclaw/workspace/docs/projects/execution-platform/specs/live-execution-readiness-gates.md",
      "/root/.openclaw/workspace/docs/projects/execution-platform/specs/acp-codex-bridge-readiness.md",
      "/root/.openclaw/workspace/docs/projects/execution-platform/specs/work-queue-execution-truth.md",
      "/root/.openclaw/workspace/docs/projects/execution-platform/roles/",
    ],
    modelValidationEvidenceRefs,
    runtimeEvidenceRefs,
    noLiveFlags: {
      codexCliInvoked: false,
      acpSessionStarted: false,
      providerCallMade: false,
      rebuildPerformed: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      modelPromotionPerformed: false,
      workQueueLifecycleMutated: false,
      daemonStarted: false,
      schedulerStarted: false,
    },
    allowedToPlanFirstAgentTeamImplementation: blockingReasons.length === 0,
    allowedToRunFirstAgentTeamImplementation: false,
    blockingReasons,
    requiredNextOperatorAction:
      blockingReasons.length === 0
        ? "approve the first agent-team implementation run using the planned objective, role graph, ACP endpoint, OpenRouter model routes, controls, review, and closeout gates"
        : "fix blocking planning evidence before approving the first agent-team implementation run",
  };
}

export function validateAgentTeamImplementationPlan(
  plan: AgentTeamPlanningSlice,
): AgentTeamPlanValidationReport {
  const blockingReasons = [...plan.blockingReasons];
  const warnings: string[] = [];
  const requiredRoles: AgentTeamRoleId[] = [
    "orchestrator",
    "context_scout",
    "implementation_engineer",
    "test_engineer",
    "reviewer",
    "security_privacy_reviewer",
    "guardrail_auditor",
    "observability_scribe",
  ];
  const roleIds = new Set(plan.roles.map((role) => role.roleId));
  for (const roleId of requiredRoles) {
    if (!roleIds.has(roleId)) {
      blockingReasons.push(`missing_role:${roleId}`);
    }
  }
  if (!plan.modelAssignments.some((assignment) => assignment.modelId === "moonshotai/kimi-k2.6")) {
    blockingReasons.push("kimi_2_6_implementation_assignment_required");
  }
  if (
    !plan.modelAssignments.some((assignment) => assignment.modelId === "deepseek/deepseek-v4-flash")
  ) {
    blockingReasons.push("deepseek_v4_flash_testing_or_observability_assignment_required");
  }
  if (
    !plan.modelAssignments.some((assignment) => assignment.modelId === "deepseek/deepseek-v4-pro")
  ) {
    blockingReasons.push("deepseek_v4_pro_role_candidate_assignment_required");
  }
  if (plan.authorityPlan.highBlastRadiusAuthoritiesGrantedNow) {
    blockingReasons.push("high_blast_radius_authority_not_allowed_in_planning");
  }
  if (
    plan.authorityPlan.deployAllowed ||
    plan.authorityPlan.outboundSendingAllowed ||
    plan.authorityPlan.modelPromotionAllowed
  ) {
    blockingReasons.push("deploy_outbound_model_promotion_not_allowed_for_first_team_plan");
  }
  if (plan.authorityPlan.workQueueLifecycleMutationAllowed) {
    blockingReasons.push("work_queue_lifecycle_mutation_not_allowed");
  }
  if (!plan.closeoutRequirements.workEpisodeOutcomePackRequired) {
    blockingReasons.push("work_episode_outcome_pack_required");
  }
  if (!plan.closeoutRequirements.bridgeResultReviewRequired) {
    blockingReasons.push("bridge_result_review_required");
  }
  if (
    plan.handoffRules.some((rule) => rule.rawTranscriptAllowed || rule.rawProviderPromptAllowed)
  ) {
    blockingReasons.push("handoff_raw_transcript_or_prompt_not_allowed");
  }
  if (plan.researchSources.length < 5) {
    warnings.push("research_source_set_is_thin");
  }
  if (!plan.runtimeEvidenceRefs.some((ref) => ref.includes("real-acp-endpoint"))) {
    warnings.push("real_acp_endpoint_evidence_ref_not_present");
  }

  return {
    artifactKind: "codex_bridge_agent_team_plan_validation",
    planId: plan.planId,
    validForPlanning: blockingReasons.length === 0,
    allowedToRunFirstAgentTeamImplementation: false,
    blockingReasons,
    warnings,
  };
}

export function agentTeamImplementationPlanArtifact(plan: AgentTeamPlanningSlice): JsonValue {
  return plan as unknown as JsonValue;
}
