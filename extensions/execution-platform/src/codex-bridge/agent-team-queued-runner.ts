import { createHash } from "node:crypto";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import { OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES } from "../model-routing/model-candidate-validation-plan.ts";
import {
  enforceModelRoster,
  type ModelRosterEnforcementDecision,
  type ModelRosterRequestedAuthority,
  type ModelRosterRoleId,
} from "../model-routing/model-roster-enforcement.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { createFirstAgentTeamImplementationPlan } from "./agent-team-plan.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import {
  readSingleJobQualityProofPayloadFlag,
  type AgentTeamRoleExecutionEvidence,
} from "./agent-team-quality-proof.ts";
import {
  buildAgentTeamResultReviewArtifact,
  recordAgentTeamResultReviewArtifact,
} from "./agent-team-result-review.ts";
import {
  AGENT_TEAM_JOB_TYPE,
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
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import { createContextScoutArtifact, recordContextScoutArtifact } from "./context-scout-pilot.ts";
import { DynamicAgentTeamGraphRunner } from "./dynamic-agent-team-graph-runner.ts";
import type { DynamicCodingTeamModelClient } from "./dynamic-coding-team-orchestrator.ts";
import type { DynamicValidationRunner } from "./dynamic-test-repair-loop.ts";
import type { KimiFileImplementationAdapter } from "./kimi-file-implementation-adapter.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";
import {
  createDegradedSystemCloseoutCapsule,
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
  type CloseoutCapsuleReporterTiming,
} from "./model-closeout-capsule-reporter.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";
import { resolveRuntimeObjective } from "./source-prompt-ref.ts";

export type AgentTeamQueuedRunOnceResult = {
  artifactKind: "agent_team_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  teamRunId: string | null;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  evidence: AgentTeamRuntimeEvidence | null;
  failure: { stage: string; message: string } | null;
  closeoutRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type AgentTeamQueuedRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  runtimeJobId?: string;
  sourcePromptSessionRoots?: string[];
  closeoutReporter?: {
    createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
  };
  roleModelClient?: AgentTeamModelClient;
  implementationBridge?: AgentTeamImplementationBridge;
  kimiImplementationAdapter?: {
    run(
      input: Parameters<KimiFileImplementationAdapter["run"]>[0],
    ): ReturnType<KimiFileImplementationAdapter["run"]>;
  };
  runtimeWorkGraphs?: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue?: WorkQueueRepository;
  dynamicOrchestratorModelClient?: DynamicCodingTeamModelClient;
  missionContractModelClient?: DynamicCodingTeamModelClient;
  dynamicValidationRunner?: DynamicValidationRunner;
  now?: () => Date;
};

export type AgentTeamClaimedJobExecutionResult = {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type SingleJobQualityRoleSpec = {
  roleId: ModelRosterRoleId;
  modelId: string;
  candidateId: string;
  providerPath: "openrouter";
  requestedAuthority: ModelRosterRequestedAuthority;
  assignedTaskSummary: string;
};

type InlineRoleReportResult = {
  execution: AgentTeamRoleExecutionEvidence;
  closeout: CloseoutCapsuleRoleCloseout;
  artifactRef: string;
};

export type AgentTeamImplementationBridgeRunInput = {
  runtimeJob: RuntimeJob;
  teamRunId: string;
  objective: string;
  roleId: "implementation_engineer";
  assignedTaskSummary: string;
  evidenceRefs: string[];
  validationRefs: string[];
  approvedRepoScopePaths?: string[];
};

export type AgentTeamImplementationBridgeRunResult = {
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

export type AgentTeamImplementationBridge = {
  run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult>;
};

const SINGLE_JOB_QUALITY_ROLE_SEQUENCE: SingleJobQualityRoleSpec[] = [
  {
    roleId: "orchestrator",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "orchestration",
    assignedTaskSummary: "Coordinate the single-job coding-team proof and identify blockers.",
  },
  {
    roleId: "context_scout",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "observe",
    assignedTaskSummary: "Read-only context scout for relevant files, risks, and prior patterns.",
  },
  {
    roleId: "implementation_engineer",
    modelId: "moonshotai/kimi-k2.6",
    candidateId: "kimi-2-6-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "implementation",
    assignedTaskSummary: "Implement the smallest product-safe readback improvement.",
  },
  {
    roleId: "test_engineer",
    modelId: "deepseek/deepseek-v4-flash",
    candidateId: "deepseek-v4-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "testing",
    assignedTaskSummary: "Validate the role evidence, closeout, and Work Queue readback behavior.",
  },
  {
    roleId: "security_privacy_reviewer",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "review",
    assignedTaskSummary:
      "Read-only security/privacy review for raw storage, authority, and lifecycle safety.",
  },
  {
    roleId: "reviewer",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "review",
    assignedTaskSummary: "Review task fit, changed-file refs, and validation evidence.",
  },
  {
    roleId: "docs_skills_writer",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "observe",
    assignedTaskSummary: "Summarize docs/readback implications and follow-up opportunities.",
  },
  {
    roleId: "observability_scribe",
    modelId: "deepseek/deepseek-v4-pro",
    candidateId: "deepseek-v4-pro-coding-candidate",
    providerPath: "openrouter",
    requestedAuthority: "observe",
    assignedTaskSummary: "Record bounded evidence refs and owner-visible ELI5 progress.",
  },
];

const DEFAULT_AGENT_TEAM_VALIDATION_REFS = [
  "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
];

function objectiveRoleSequence(input: {
  roleTaskTheme: string;
  targetTitle: string | null;
}): SingleJobQualityRoleSpec[] {
  const target = input.targetTitle ?? "the requested runtime objective";
  return SINGLE_JOB_QUALITY_ROLE_SEQUENCE.map((role) => {
    const byRole: Partial<Record<ModelRosterRoleId, string>> = {
      orchestrator: `Coordinate ${target}; keep the team focused on the requested objective, blockers, and closeout evidence.`,
      context_scout: `Find relevant files, existing patterns, risks, and source refs for ${input.roleTaskTheme}.`,
      implementation_engineer: `Implement the smallest product-safe repo change for ${target} inside the approved objective scope.`,
      test_engineer: `Validate the implementation and readback behavior for ${target}; identify repair needs from bounded evidence.`,
      security_privacy_reviewer: `Review ${target} for raw storage, authority, lifecycle, background mutation, and scope risks.`,
      reviewer: `Assess whether the work product actually satisfies ${target}, not just generic process completion.`,
      docs_skills_writer: `Update or assess docs/skills implications for ${target} and identify bounded follow-up opportunities.`,
      observability_scribe: `Record bounded evidence refs, Work Queue/readback implications, limitations, and ELI5 progress for ${target}.`,
    };
    return {
      ...role,
      assignedTaskSummary: byRole[role.roleId] ?? role.assignedTaskSummary,
    };
  });
}

export function singleJobQualityRoleMaxTokensForModel(modelId: string): number {
  if (modelId === "moonshotai/kimi-k2.6") {
    return 3_000;
  }
  if (modelId === "deepseek/deepseek-v4-pro") {
    return 3_600;
  }
  if (modelId === "deepseek/deepseek-v4-flash") {
    return 1_800;
  }
  return 2_200;
}

export function buildSingleJobQualityRoleReportContractText(): string {
  return [
    "Return exactly one JSON object with this shape:",
    "{",
    '  "whatIWasAskedToDo": "bounded string",',
    '  "whatIActuallyDid": "bounded role-specific string",',
    '  "evidenceRefs": ["at least one supplied evidence ref"],',
    '  "filesOrArtifactsTouched": ["at least one supplied file or artifact ref"],',
    '  "validationIPerformed": "bounded string using supplied validation refs",',
    '  "whatWorked": ["bounded string"],',
    '  "whatWasWeakOrFailed": ["bounded string"],',
    '  "recommendedNextStep": "bounded string",',
    '  "skillOrProcessOpportunitySeeds": ["bounded string"],',
    '  "confidence": "low | medium | high",',
    '  "limitations": ["bounded string"]',
    "}",
    "For read/review roles, whatIActuallyDid must say what you reviewed and the judgment you made.",
    "Do not restate the role task as the work performed.",
    "Use only supplied refs; do not invent file paths, runtime ids, tests, deploys, sends, authority, or DB writes.",
  ].join("\n");
}

function singleJobQualityRoleMaxTokens(role: SingleJobQualityRoleSpec): number {
  return singleJobQualityRoleMaxTokensForModel(role.modelId);
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback.slice(0, maxLength);
}

function boundedStringArray(value: unknown, fallback: string[], maxItems: number): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const items = source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 260))
    .slice(0, maxItems);
  return items.length > 0 ? items : fallback.slice(0, maxItems);
}

function firstBoundedString(values: unknown[], fallback: string, maxLength: number): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, maxLength);
    }
    if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .join("; ");
      if (joined.trim()) {
        return joined.slice(0, maxLength);
      }
    }
  }
  return fallback.slice(0, maxLength);
}

function firstFieldValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function fieldArrayValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      return [value];
    }
  }
  return undefined;
}

function parseRoleReportJson(responseText: string | null): Record<string, unknown> {
  const text = responseText?.trim() ?? "";
  const candidates = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim() ?? "",
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next bounded candidate.
    }
  }
  return {};
}

function boundedPriorRoleResponseForRepair(responseText: string | null): string {
  const text = responseText?.trim() ?? "";
  if (!text) {
    return "prior response was empty";
  }
  return text.replace(/\s+/gu, " ").slice(0, 1_800);
}

function inlineRolePrompt(input: {
  role: SingleJobQualityRoleSpec;
  objective: string;
  runtimeJobId: string;
  changedFileRefs: string[];
  validationRefs: string[];
  evidenceRefs: string[];
}): string {
  return [
    "Return strict compact JSON only. This is an inline role report for OpenClaw runtime evidence.",
    "Do not include raw prompts, raw responses, transcripts, provider logs, tool logs, secrets, hidden reasoning, or unbounded logs.",
    "Do not claim deploy, outbound send, model promotion, authority grant, Work Queue lifecycle mutation, or DB mutation.",
    `roleId: ${input.role.roleId}`,
    `roleTask: ${input.role.assignedTaskSummary}`,
    `objective: ${input.objective}`,
    `runtimeJobId: ${input.runtimeJobId}`,
    `changedFileRefs: ${input.changedFileRefs.join(", ")}`,
    `validationRefs: ${input.validationRefs.join(", ")}`,
    `evidenceRefs: ${input.evidenceRefs.join(", ")}`,
    buildSingleJobQualityRoleReportContractText(),
  ].join("\n");
}

function normalizeInlineRoleReport(input: {
  role: SingleJobQualityRoleSpec;
  objective: string;
  modelRunRef: string;
  responseText: string | null;
  fallbackEvidenceRefs: string[];
  fallbackFileRefs: string[];
  fallbackValidationRefs: string[];
}): CloseoutCapsuleRoleCloseout {
  const parsed = parseRoleReportJson(input.responseText);
  const askedToDo = firstFieldValue(parsed, [
    "whatIWasAskedToDo",
    "what_i_was_asked_to_do",
    "askedToDo",
    "asked_to_do",
    "task",
  ]);
  const actuallyDid = firstFieldValue(parsed, [
    "whatIActuallyDid",
    "what_i_actually_did",
    "actuallyDid",
    "actually_did",
    "summary",
    "findings",
  ]);
  const evidenceRefs = boundedStringArray(
    fieldArrayValue(parsed, [
      "evidenceRefs",
      "evidence_refs",
      "artifactRefs",
      "artifact_refs",
      "sourceRefs",
      "source_refs",
    ]),
    input.fallbackEvidenceRefs,
    8,
  );
  const filesOrArtifactsTouched = boundedStringArray(
    fieldArrayValue(parsed, [
      "filesOrArtifactsTouched",
      "files_or_artifacts_touched",
      "filesTouched",
      "files_touched",
      "changedFileRefs",
      "changed_file_refs",
      "filesChanged",
      "files_changed",
      "changedFiles",
      "changed_files",
    ]),
    input.fallbackFileRefs,
    12,
  );
  const validationRefs = boundedStringArray(
    fieldArrayValue(parsed, [
      "validationRefs",
      "validation_refs",
      "testsRun",
      "tests_run",
      "validationEvidence",
      "validation_evidence",
    ]),
    input.fallbackValidationRefs,
    6,
  );
  const confidenceValue = boundedString(parsed.confidence, "medium", 20).toLowerCase();
  const confidence =
    confidenceValue === "low" || confidenceValue === "high" ? confidenceValue : "medium";
  return {
    roleId: input.role.roleId,
    agentId: input.role.roleId,
    modelRef: input.role.modelId,
    modelRunRef: input.modelRunRef,
    source: "model",
    askedToDo: firstBoundedString([askedToDo], input.role.assignedTaskSummary, 800),
    actuallyDid: firstBoundedString(
      [actuallyDid],
      `${input.role.roleId} produced bounded inline role evidence for the single-job quality proof.`,
      1_200,
    ),
    whatIWasAskedToDo: firstBoundedString([askedToDo], input.role.assignedTaskSummary, 800),
    whatIActuallyDid: firstBoundedString(
      [actuallyDid],
      `${input.role.roleId} produced bounded inline role evidence for the single-job quality proof.`,
      1_200,
    ),
    evidenceRefs,
    filesOrArtifactsTouched,
    validationIPerformed: boundedString(
      firstFieldValue(parsed, [
        "validationIPerformed",
        "validation_i_performed",
        "validationPerformed",
        "validation_performed",
        "validation",
        "testsRun",
        "tests_run",
        "validationEvidence",
        "validation_evidence",
      ]),
      validationRefs.join("; "),
      800,
    ),
    worked: boundedStringArray(
      parsed.whatWorked ?? parsed.worked ?? parsed.findings,
      ["bounded role report produced"],
      6,
    ),
    failedOrWeak: boundedStringArray(
      parsed.whatWasWeakOrFailed ?? parsed.failedOrWeak ?? parsed.risks ?? parsed.limitations,
      ["broader soak remains future work"],
      6,
    ),
    wouldImproveNext: [
      firstBoundedString(
        [parsed.recommendedNextStep, parsed.nextStep],
        "Use this proof to unblock the managed owner soak.",
        500,
      ),
    ],
    recommendedNextStep: firstBoundedString(
      [parsed.recommendedNextStep, parsed.nextStep],
      "Use this proof to unblock the managed owner soak.",
      500,
    ),
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence,
    limitations: boundedStringArray(parsed.limitations, ["bounded single-job proof scope"], 6),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function closeoutFromImplementationBridgeResult(input: {
  role: SingleJobQualityRoleSpec;
  objective: string;
  result: AgentTeamImplementationBridgeRunResult;
}): CloseoutCapsuleRoleCloseout {
  return {
    roleId: input.role.roleId,
    agentId: input.role.roleId,
    modelRef: input.result.modelRef,
    modelRunRef: input.result.modelRunRef,
    source: "model",
    askedToDo: input.role.assignedTaskSummary,
    actuallyDid: boundedString(
      input.result.summary,
      "Approved Codex file-editing bridge completed the implementation lane.",
      1_200,
    ),
    whatIWasAskedToDo: input.role.assignedTaskSummary,
    whatIActuallyDid: boundedString(
      input.result.summary,
      "Approved Codex file-editing bridge completed the implementation lane.",
      1_200,
    ),
    evidenceRefs: boundedStringArray(input.result.artifactRefs, input.result.artifactRefs, 12),
    filesOrArtifactsTouched: boundedStringArray(
      input.result.changedFileRefs,
      input.result.artifactRefs,
      20,
    ),
    validationIPerformed: boundedString(
      input.result.validationRefs.join("; "),
      "Approved bridge validation evidence recorded.",
      800,
    ),
    worked: [
      "implementation lane used the approved Codex file-editing bridge instead of a read-only role report",
    ],
    failedOrWeak:
      input.result.status === "completed"
        ? ["broader managed owner soak remains the next proof"]
        : input.result.reasonCodes.slice(0, 6),
    wouldImproveNext: ["run the five-prompt owner soak after this single-job proof is green"],
    recommendedNextStep: "Run the managed owner soak after this bridge-backed proof passes.",
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence: input.result.status === "completed" ? "high" : "medium",
    limitations: ["implementation bridge authority remains bounded to the approved repo scope"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function inlineRoleReportIsConcrete(closeout: CloseoutCapsuleRoleCloseout): boolean {
  const genericFallbackPattern =
    /produced bounded inline role evidence for the single-job quality proof/iu;
  return (
    closeout.source === "model" &&
    Boolean(closeout.modelRef?.trim()) &&
    Boolean(closeout.modelRunRef?.trim()) &&
    Boolean(closeout.whatIActuallyDid?.trim() || closeout.actuallyDid.trim()) &&
    (closeout.evidenceRefs?.length ?? 0) > 0 &&
    (closeout.filesOrArtifactsTouched?.length ?? 0) > 0 &&
    Boolean(closeout.validationIPerformed?.trim()) &&
    !genericFallbackPattern.test(JSON.stringify(closeout))
  );
}

export class AgentTeamQueuedRunner {
  private readonly queueName: string;
  private readonly now: () => Date;
  private readonly leaseRenewalIntervalMs = 10_000;
  private readonly leaseRenewalExtendByMs = 120_000;

  constructor(private readonly options: AgentTeamQueuedRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<AgentTeamQueuedRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: [AGENT_TEAM_JOB_TYPE],
      runtimeJobId: this.options.runtimeJobId,
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }

    const stopLeaseRenewal = this.startLeaseRenewal(claimed.leaseToken);
    try {
      const run = await this.runClaimedJob(claimed.job);
      if (!run.cleanSuccessAccepted) {
        const message = run.blockingReasonCodes[0] ?? "agent_team_clean_success_not_accepted";
        await this.options.runtimeJobs.failJob({
          leaseToken: claimed.leaseToken,
          error: {
            stage: "agent_team_run_once",
            message,
            reasonCodes: run.blockingReasonCodes,
          },
        });
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          teamRunId: run.evidence.teamRunId,
          failure: { stage: "agent_team_run_once", message },
          modelRosterDecisions: run.modelRosterDecisions,
          evidence: run.evidence,
        });
      }
      const completed = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          teamRunId: run.evidence.teamRunId,
          completedWorkPathSatisfied: true,
          modelRosterAllowed: run.modelRosterDecisions.every((decision) => decision.allowed),
        } as JsonValue,
      });
      if (!completed) {
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          teamRunId: run.evidence.teamRunId,
          failure: { stage: "complete_job", message: "lease expired before completion" },
          modelRosterDecisions: run.modelRosterDecisions,
          evidence: run.evidence,
        });
      }
      return this.empty({
        claimed: true,
        completed: true,
        runtimeJobId: claimed.job.jobId,
        teamRunId: run.evidence.teamRunId,
        modelRosterDecisions: run.modelRosterDecisions,
        evidence: run.evidence,
      });
    } catch (error) {
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          stage: "agent_team_run_once",
          message: error instanceof Error ? error.message : "unknown agent-team run failure",
        },
      });
      return this.empty({
        claimed: true,
        failed: true,
        runtimeJobId: claimed.job.jobId,
        failure: {
          stage: "agent_team_run_once",
          message: error instanceof Error ? error.message : "unknown agent-team run failure",
        },
      });
    } finally {
      stopLeaseRenewal();
    }
  }

  private startLeaseRenewal(leaseToken: string): () => void {
    let stopped = false;
    const renew = (): void => {
      if (stopped) {
        return;
      }
      void this.options.runtimeJobs
        .renewLease({
          leaseToken,
          workerId: this.options.workerId,
          extendByMs: this.leaseRenewalExtendByMs,
        })
        .catch(() => undefined);
    };
    renew();
    const interval = setInterval(renew, this.leaseRenewalIntervalMs);
    interval.unref?.();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }

  async runClaimedJobForAdapter(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    return this.runClaimedJob(job);
  }

  private async runSingleJobQualityProofJob(input: {
    job: RuntimeJob;
    workflowId: string;
    teamRunId: string;
    objectiveForModel: string;
    objectiveForEvidence: string;
    taskSpecificObjectivePresent: boolean;
    sourcePromptResolution: JsonValue;
    permissionEvidence: AgentTeamRuntimeEvidence["permissionEvidence"];
  }): Promise<AgentTeamClaimedJobExecutionResult> {
    const roleModelClient = this.options.roleModelClient;
    if (!roleModelClient) {
      throw new Error("single_job_quality_role_model_client_not_configured");
    }

    const objectiveScope = resolveCodingTeamObjectiveScope({
      objectiveForModel: input.objectiveForModel,
      objectiveForEvidence: input.objectiveForEvidence,
      fallbackRepoScopePaths: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
        "scripts/",
        ".artifacts/execution-platform/",
      ],
      fallbackValidationCommands: DEFAULT_AGENT_TEAM_VALIDATION_REFS,
    });
    const roleSequence = objectiveRoleSequence({
      roleTaskTheme: objectiveScope.roleTaskTheme,
      targetTitle: objectiveScope.targetTitle,
    });
    const evidenceRefs = [
      ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
      ".artifacts/execution-platform/work-queue-model-readiness-v4-pro-proof.json",
      ...objectiveScope.sourceDocRefs.slice(0, 8),
    ];
    const modelRosterDecisions = roleSequence.map((role) =>
      enforceModelRoster({
        roleId: role.roleId,
        requestedModelId: role.modelId,
        requestedAuthority: role.requestedAuthority,
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }),
    );
    const blockedRosterDecision = modelRosterDecisions.find((decision) => !decision.allowed);
    if (blockedRosterDecision) {
      throw new Error(
        `single_job_quality_model_roster_blocked:${blockedRosterDecision.roleId}:${blockedRosterDecision.reasonCodes.join("|")}`,
      );
    }

    const taskGraphId = `${input.teamRunId}-coding-team-task-graph`;
    const taskGraphArtifactRef = `runtime-job://${input.job.jobId}/agent-team/task-graph/${taskGraphId}`;
    const taskGraphArtifact = {
      artifactKind: "agent_team_coding_real_work_task_graph",
      graphId: taskGraphId,
      teamRunId: input.teamRunId,
      runtimeJobId: input.job.jobId,
      workflowId: input.workflowId,
      orchestratorRoleRequired: true,
      requiredSourceEdit: true,
      nodes: roleSequence.map((role, index) => ({
        nodeId: `${taskGraphId}-node-${index + 1}`,
        roleId: role.roleId,
        modelId: role.modelId,
        providerPath: role.providerPath,
        assignedTaskSummary: role.assignedTaskSummary,
      })),
      dependencyEdges: [
        { fromRoleId: "orchestrator", toRoleId: "context_scout", edgeKind: "handoff" },
        { fromRoleId: "context_scout", toRoleId: "implementation_engineer", edgeKind: "handoff" },
        {
          fromRoleId: "implementation_engineer",
          toRoleId: "test_engineer",
          edgeKind: "validation",
        },
        { fromRoleId: "test_engineer", toRoleId: "reviewer", edgeKind: "review" },
      ],
      validationPlan: objectiveScope.approvedValidationCommands,
      reasonCodes: [
        "orchestrator_role_first_in_sequence",
        "required_source_edit_must_change_files",
        "process_completion_not_task_success",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.job.jobId,
      artifactType: "agent_team.coding_real_work_task_graph",
      storageKind: "metadata",
      uri: taskGraphArtifactRef,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(taskGraphArtifact), "utf8"),
      sha256: sha256Text(JSON.stringify(taskGraphArtifact)),
      metadata: taskGraphArtifact as unknown as JsonValue,
    });
    const baseArtifactRefs = [
      taskGraphArtifactRef,
      `runtime-job://${input.job.jobId}/execution/workflow-dispatch/${input.workflowId}`,
      ...evidenceRefs,
    ];
    const roleReports: InlineRoleReportResult[] = [];
    let implementationChangedFileRefs: string[] = [];
    let implementationValidationRefs = objectiveScope.approvedValidationCommands;
    const implementationBridgeArtifactRefs: string[] = [];
    for (const role of roleSequence) {
      const startedAt = this.now();
      const modelRunRef = `${input.teamRunId}-${role.roleId}-inline-role-report`;
      if (role.roleId === "implementation_engineer" && this.options.implementationBridge) {
        const bridgeResult = await this.options.implementationBridge.run({
          runtimeJob: input.job,
          teamRunId: input.teamRunId,
          objective: input.objectiveForModel,
          roleId: "implementation_engineer",
          assignedTaskSummary: role.assignedTaskSummary,
          evidenceRefs: baseArtifactRefs,
          validationRefs: implementationValidationRefs,
          approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
        });
        if (bridgeResult.status !== "completed") {
          throw new Error(
            `single_job_quality_implementation_bridge_failed:${bridgeResult.reasonCodes.join("|")}`,
          );
        }
        implementationChangedFileRefs =
          bridgeResult.changedFileRefs.length > 0
            ? bridgeResult.changedFileRefs
            : implementationChangedFileRefs;
        implementationValidationRefs =
          bridgeResult.validationRefs.length > 0
            ? bridgeResult.validationRefs
            : implementationValidationRefs;
        implementationBridgeArtifactRefs.push(...bridgeResult.artifactRefs);
        const closeout = closeoutFromImplementationBridgeResult({
          role,
          objective: input.objectiveForEvidence,
          result: bridgeResult,
        });
        const artifactRef = `runtime-job://${input.job.jobId}/agent-team/inline-role-report/${role.roleId}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: input.job.jobId,
          artifactType: "agent_team.inline_role_report",
          storageKind: "metadata",
          uri: artifactRef,
          contentType: "application/json",
          sizeBytes: Buffer.byteLength(JSON.stringify(closeout), "utf8"),
          sha256: sha256Text(JSON.stringify(closeout)),
          metadata: {
            ...closeout,
            roleId: role.roleId,
            modelRunRef: bridgeResult.modelRunRef,
            responseHash: bridgeResult.responseHash,
            startedAt: bridgeResult.startedAt,
            completedAt: bridgeResult.completedAt,
            latencyMs: bridgeResult.latencyMs,
            bridgeTransportKind: bridgeResult.transportKind,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
        });
        await this.options.runtimeJobs.recordEvent({
          jobId: input.job.jobId,
          eventType: "agent_team.implementation_bridge_role_report_recorded",
          workerId: this.options.workerId,
          data: {
            roleId: role.roleId,
            modelRef: bridgeResult.modelRef,
            modelRunRef: bridgeResult.modelRunRef,
            artifactRef,
            responseHash: bridgeResult.responseHash,
            transportKind: bridgeResult.transportKind,
            changedFileRefs: implementationChangedFileRefs.slice(0, 20),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        roleReports.push({
          artifactRef,
          closeout,
          execution: {
            roleId: role.roleId,
            agentId: role.roleId,
            modelRef: bridgeResult.modelRef,
            providerPath: bridgeResult.providerPath,
            transportKind: bridgeResult.transportKind,
            modelRunRef: bridgeResult.modelRunRef,
            responseHash: bridgeResult.responseHash,
            startedAt: bridgeResult.startedAt,
            completedAt: bridgeResult.completedAt,
            latencyMs: bridgeResult.latencyMs,
            assignedTaskSummary: role.assignedTaskSummary,
            producedArtifactRefs: [...bridgeResult.artifactRefs, artifactRef].slice(0, 20),
            inlineRoleReportRef: artifactRef,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
        continue;
      }
      const prompt = inlineRolePrompt({
        role,
        objective: input.objectiveForModel,
        runtimeJobId: input.job.jobId,
        changedFileRefs: implementationChangedFileRefs,
        validationRefs: implementationValidationRefs,
        evidenceRefs: [...baseArtifactRefs, ...implementationBridgeArtifactRefs].slice(0, 30),
      });
      let modelResult = await roleModelClient.callRole({
        roleId: role.roleId,
        modelId: role.modelId,
        modelCandidateId: role.candidateId,
        prompt,
        responseFormat: "json_object",
        maxTokens: singleJobQualityRoleMaxTokens(role),
      });
      let completedAt = this.now();
      if (modelResult.status !== "succeeded" || !modelResult.responseHash) {
        throw new Error(
          `single_job_quality_role_model_call_failed:${role.roleId}:${modelResult.errorReasonCode ?? modelResult.status}`,
        );
      }
      let closeout = normalizeInlineRoleReport({
        role,
        objective: input.objectiveForEvidence,
        modelRunRef,
        responseText: modelResult.responseText,
        fallbackEvidenceRefs: [...baseArtifactRefs, ...implementationBridgeArtifactRefs].slice(
          0,
          30,
        ),
        fallbackFileRefs: implementationChangedFileRefs,
        fallbackValidationRefs: implementationValidationRefs,
      });
      if (!inlineRoleReportIsConcrete(closeout)) {
        const repairStartedAt = this.now();
        modelResult = await roleModelClient.callRole({
          roleId: role.roleId,
          modelId: role.modelId,
          modelCandidateId: role.candidateId,
          prompt: [
            prompt,
            "Repair instruction: the prior bounded response did not provide concrete role-specific JSON in the required shape.",
            "Prior bounded response excerpt for volatile repair input only:",
            boundedPriorRoleResponseForRepair(modelResult.responseText),
            "Return one JSON object only. Include concrete whatIActuallyDid, evidenceRefs, filesOrArtifactsTouched, and validationIPerformed.",
            "For observability_scribe, explicitly name the bounded evidence refs recorded, the validation/readback refs inspected, and the owner-visible ELI5 progress you would surface.",
          ].join("\n"),
          responseFormat: "json_object",
          maxTokens: singleJobQualityRoleMaxTokens(role),
        });
        if (modelResult.status !== "succeeded" || !modelResult.responseHash) {
          throw new Error(
            `single_job_quality_role_report_repair_failed:${role.roleId}:${modelResult.errorReasonCode ?? modelResult.status}`,
          );
        }
        closeout = normalizeInlineRoleReport({
          role,
          objective: input.objectiveForEvidence,
          modelRunRef,
          responseText: modelResult.responseText,
          fallbackEvidenceRefs: [...baseArtifactRefs, ...implementationBridgeArtifactRefs].slice(
            0,
            30,
          ),
          fallbackFileRefs: implementationChangedFileRefs,
          fallbackValidationRefs: implementationValidationRefs,
        });
        if (!inlineRoleReportIsConcrete(closeout)) {
          throw new Error(`single_job_quality_role_report_not_concrete:${role.roleId}`);
        }
        completedAt = this.now();
        await this.options.runtimeJobs.recordEvent({
          jobId: input.job.jobId,
          eventType: "agent_team.inline_role_report_repaired",
          workerId: this.options.workerId,
          data: {
            roleId: role.roleId,
            modelRef: role.modelId,
            modelRunRef,
            repairLatencyMs: Math.max(0, this.now().getTime() - repairStartedAt.getTime()),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
      }
      const artifactRef = `runtime-job://${input.job.jobId}/agent-team/inline-role-report/${role.roleId}`;
      await this.options.runtimeJobs.attachArtifact({
        jobId: input.job.jobId,
        artifactType: "agent_team.inline_role_report",
        storageKind: "metadata",
        uri: artifactRef,
        contentType: "application/json",
        sizeBytes: Buffer.byteLength(JSON.stringify(closeout), "utf8"),
        sha256: sha256Text(JSON.stringify(closeout)),
        metadata: {
          ...closeout,
          roleId: role.roleId,
          modelRunRef,
          responseHash: modelResult.responseHash,
          retryEvidence: modelResult.retryEvidence ?? null,
          usage: modelResult.usage ?? null,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: input.job.jobId,
        eventType: "agent_team.inline_role_report_recorded",
        workerId: this.options.workerId,
        data: {
          roleId: role.roleId,
          modelRef: role.modelId,
          modelRunRef,
          artifactRef,
          responseHash: modelResult.responseHash,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      roleReports.push({
        artifactRef,
        closeout,
        execution: {
          roleId: role.roleId,
          agentId: role.roleId,
          modelRef: role.modelId,
          providerPath: role.providerPath,
          transportKind: "live_model",
          modelRunRef,
          responseHash: modelResult.responseHash,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          assignedTaskSummary: role.assignedTaskSummary,
          producedArtifactRefs: [artifactRef],
          inlineRoleReportRef: artifactRef,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }

    const factualRoles = roleReports.map((report) => ({
      roleId: report.execution.roleId,
      agentId: report.execution.agentId,
      modelRef: report.execution.modelRef,
      status: "completed",
    }));
    const capsuleInput: CloseoutCapsuleReporterInput = {
      factualRefs: {
        runtimeJobId: input.job.jobId,
        teamRunId: input.teamRunId,
        workflowId: input.workflowId,
        status: input.taskSpecificObjectivePresent ? "completed" : "needs_review",
        roles: factualRoles,
        fileRefs: implementationChangedFileRefs,
        artifactRefs: [
          ...baseArtifactRefs,
          ...implementationBridgeArtifactRefs,
          ...roleReports.map((report) => report.artifactRef),
        ].slice(0, 40),
        validationRefs: implementationValidationRefs,
        runtimeEventRefs: [`runtime-job://${input.job.jobId}/events`],
      },
      objectiveSummary: input.objectiveForEvidence,
      boundedRoleEvidence: roleReports.map((report) => ({
        roleId: report.closeout.roleId,
        agentId: report.closeout.agentId ?? report.closeout.roleId,
        modelRef: report.closeout.modelRef ?? "unknown",
        askedToDo: report.closeout.whatIWasAskedToDo ?? report.closeout.askedToDo,
        evidenceSummary: report.closeout.whatIActuallyDid ?? report.closeout.actuallyDid,
        artifactRefs: [report.artifactRef],
        validationRefs: report.closeout.evidenceRefs ?? implementationValidationRefs,
        limitations: report.closeout.limitations,
      })),
      boundedResultEvidence: {
        completed: input.taskSpecificObjectivePresent,
        needsReview: !input.taskSpecificObjectivePresent,
        failed: false,
        findings: input.taskSpecificObjectivePresent
          ? []
          : ["runtime job did not include objectiveSummary"],
        requiredFixes: input.taskSpecificObjectivePresent
          ? []
          : ["rerun with a bounded objectiveSummary before marking succeeded"],
        limitations: [
          "single-job quality proof validates one substantive coding-team job before managed soak",
        ],
      },
    };
    const closeoutStartedAtDate = this.now();
    let capsuleResult = this.options.closeoutReporter
      ? await this.options.closeoutReporter.createCapsule(capsuleInput)
      : createDegradedSystemCloseoutCapsule({
          ...capsuleInput,
          reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
          closeoutTiming: buildCloseoutFailureTiming({
            startedAt: closeoutStartedAtDate,
            completedAt: this.now(),
            failureReason: "closeout_capsule_model_reporter_not_configured",
          }),
        });
    const mergedCapsule = parseCloseoutCapsule({
      ...capsuleResult.capsule,
      roleCloseouts: roleReports.map((report) => report.closeout),
      factualRefs: {
        ...capsuleResult.capsule.factualRefs,
        roles: factualRoles,
        fileRefs: implementationChangedFileRefs,
        artifactRefs: [
          ...capsuleResult.capsule.factualRefs.artifactRefs,
          ...implementationBridgeArtifactRefs,
          ...roleReports.map((report) => report.artifactRef),
        ].slice(0, 40),
        validationRefs: implementationValidationRefs,
      },
      structuredSummary: {
        ...capsuleResult.capsule.structuredSummary,
        taskSuccess: input.taskSpecificObjectivePresent
          ? capsuleResult.capsule.structuredSummary.taskSuccess
          : "needs_review",
      },
    });
    const mergedCapsuleHash = closeoutCapsuleHash(mergedCapsule);
    capsuleResult = {
      ...capsuleResult,
      capsule: mergedCapsule,
      legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(mergedCapsule),
      closeoutTiming: capsuleResult.closeoutTiming
        ? {
            ...capsuleResult.closeoutTiming,
            capsuleId: mergedCapsule.capsuleId,
            capsuleHash: mergedCapsuleHash,
          }
        : capsuleResult.closeoutTiming,
    };

    const capsuleReportsMissingWork =
      mergedCapsule.structuredSummary.taskSuccess !== "satisfied" ||
      mergedCapsule.structuredSummary.missingWork.length > 0;
    const requiredSourceEditMissing = implementationChangedFileRefs.length === 0;
    const cleanSuccessAccepted =
      input.taskSpecificObjectivePresent &&
      capsuleResult.source === "model" &&
      !capsuleReportsMissingWork &&
      roleReports.length === roleSequence.length &&
      implementationBridgeArtifactRefs.length > 0 &&
      !requiredSourceEditMissing;
    const blockingReasonCodes = [
      ...(!input.taskSpecificObjectivePresent
        ? ["task_specific_closeout_evidence_required_before_success"]
        : []),
      ...(capsuleResult.source !== "model"
        ? ["model_authored_closeout_required_before_success"]
        : []),
      ...(capsuleReportsMissingWork ? ["model_closeout_reports_missing_work"] : []),
      ...(roleReports.length !== roleSequence.length
        ? ["single_job_quality_role_reports_missing"]
        : []),
      ...(implementationBridgeArtifactRefs.length === 0
        ? ["implementation_codex_file_editing_bridge_evidence_missing"]
        : []),
      ...(requiredSourceEditMissing ? ["required_source_edit_missing"] : []),
    ];
    const resultReview = buildAgentTeamResultReviewArtifact({
      reviewId: `${input.teamRunId}-single-job-quality-result-review`,
      teamRunId: input.teamRunId,
      runtimeJobId: input.job.jobId,
      objective: input.objectiveForEvidence,
      validationEvidenceRefs: implementationValidationRefs,
      closeoutRefs: [
        `runtime-job://${input.job.jobId}/closeout-capsule/${capsuleResult.capsule.capsuleId}`,
      ],
      filesChanged: implementationChangedFileRefs,
      reviewer: "local-codex-operator",
      reviewKind: "local_codex_review",
      judgmentMade: true,
      notDeterministic: true,
      goalSatisfaction: cleanSuccessAccepted ? "satisfied" : "needs_review",
      findings: [],
      limitations: ["single-job proof precedes broader managed owner soak"],
      requiredFixes: cleanSuccessAccepted ? [] : blockingReasonCodes,
      closeoutCapsule: capsuleResult.capsule,
      closeoutTiming: capsuleResult.closeoutTiming,
      humanCloseoutSummary: capsuleResult.legacyHumanSummary,
      accepted: cleanSuccessAccepted,
      needsReview: !cleanSuccessAccepted,
      finalAcceptanceBy: "operator",
    });
    await recordAgentTeamResultReviewArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: resultReview,
    });
    if (capsuleResult.closeoutTiming) {
      await this.options.runtimeJobs.attachArtifact({
        jobId: input.job.jobId,
        artifactType: "agent_team.closeout_model_timing",
        storageKind: "metadata",
        uri: `runtime-job://${input.job.jobId}/agent-team/closeout-model-timing/${input.teamRunId}`,
        contentType: "application/json",
        metadata: capsuleResult.closeoutTiming as unknown as JsonValue,
      });
    }

    const now = this.now().toISOString();
    const roleAssignments = roleSequence.map((role) => ({
      roleId: role.roleId as AgentTeamRoleId,
      modelId: role.modelId,
      assignedAt: now,
      status: "completed" as const,
    }));
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId: input.teamRunId,
      runtimeJobId: input.job.jobId,
      workQueueLink: input.job.workItemId ? { workItemId: input.job.workItemId } : null,
      objective: input.objectiveForEvidence,
      roster: roleSequence.map((role) => ({
        roleId: role.roleId as AgentTeamRoleId,
        modelId:
          roleReports.find((report) => report.execution.roleId === role.roleId)?.execution
            .modelRef ?? role.modelId,
        status: "allowed" as const,
      })),
      roleAssignments,
      roleExecutionEvidence: roleReports.map((report) => report.execution),
      roleEligibility: Object.fromEntries(
        modelRosterDecisions.map((decision) => [
          decision.requestedModelId,
          decision.allowed ? "allowed" : decision.status,
        ]),
      ),
      activeRole: "observability_scribe",
      handoffHistory: [
        {
          handoffId: `${input.teamRunId}-quality-proof-role-closeout`,
          fromRole: "reviewer",
          toRole: "observability_scribe",
          status: "completed",
          recordedAt: now,
          payloadSummary:
            "model-authored inline role reports and lead Closeout Capsule were recorded",
          evidenceRefs: roleReports.map((report) => report.artifactRef).slice(0, 12),
          rawTranscriptAllowed: false,
          rawProviderPromptAllowed: false,
        },
      ],
      reviewState: cleanSuccessAccepted ? "reviewed" : "needs_review",
      validationState: cleanSuccessAccepted ? "passed" : "needs_review",
      closeoutState: "present",
      authorityStatus: "allowed",
      permissionEvidence: input.permissionEvidence,
      modelRoutingEvidence: modelRosterDecisions as unknown as JsonValue,
      sourcePromptResolution: input.sourcePromptResolution,
      controlState: "none",
      streamEvidenceRefs: [`runtime-job://${input.job.jobId}/events`],
      artifactRefs: [
        ...roleReports.map((report) => report.artifactRef),
        `runtime-job://${input.job.jobId}/agent-team/result-review/${resultReview.reviewId}`,
        `runtime-job://${input.job.jobId}/closeout-capsule/${capsuleResult.capsule.capsuleId}`,
      ],
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    return {
      artifactKind: "agent_team_claimed_job_execution_result",
      evidence,
      modelRosterDecisions,
      closeoutCapsule: capsuleResult.capsule,
      cleanSuccessAccepted,
      blockingReasonCodes,
      changedFileRefs: implementationChangedFileRefs,
      validationRefs: implementationValidationRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private async runClaimedJob(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const payload = asRecord(job.payload);
    if (
      payload.legacyFixedDynamicRunner === true ||
      payload.proofOnlyLegacyFixedDynamicRunner === true
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
        } as JsonValue,
      });
      throw new Error("legacy_fixed_dynamic_runner_retired");
    }
    const workflowId = stringValue(payload.workflowId, "agent_team.coding");
    const executorId = `workflow-executor:${workflowId}`;
    const teamRunId = stringValue(payload.teamRunId, `team-run-${job.jobId}`);
    const objectiveResolution = await resolveRuntimeObjective(payload, {
      sessionSearchRoots: this.options.sourcePromptSessionRoots,
    });
    const objective = objectiveResolution.objectiveForEvidence;
    const taskSpecificObjectivePresent = objectiveResolution.taskSpecificObjectivePresent;
    const authorityProfile = stringValue(payload.authorityProfile, "local_yolo");
    const permissionEvidence = createWorkflowPermissionReadback({ workflowId, authorityProfile });
    await this.options.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.workflow_dispatch_started",
      workerId: this.options.workerId,
      data: {
        workflowId,
        jobType: job.jobType,
        executorId,
        genericWorkflowDispatch: true,
        permissionDecision: permissionEvidence.decision,
      },
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_dispatch",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-dispatch/${workflowId}`,
      contentType: "application/json",
      metadata: {
        workflowId,
        jobType: job.jobType,
        executorId,
        dispatchedTo: "agent_team_queued_runner",
        codingTeamSpecialPath: false,
        permissionEvidence,
        closeoutRequired: true,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    const liveQualityPathConfigured = Boolean(
      this.options.roleModelClient &&
      this.options.implementationBridge &&
      this.options.closeoutReporter,
    );
    const explicitSingleJobQualityProof = readSingleJobQualityProofPayloadFlag(job.payload);
    if (workflowId === "agent_team.coding" && !explicitSingleJobQualityProof) {
      if (
        !liveQualityPathConfigured ||
        !this.options.runtimeWorkGraphs ||
        !this.options.runtimeToolKernel
      ) {
        throw new Error(
          "dynamic_runtime_work_graph_required:live coding-team execution requires configured role model, implementation bridge, closeout reporter, runtime work graph, and scheduler tool kernel",
        );
      }
    }
    if (
      liveQualityPathConfigured &&
      this.options.runtimeWorkGraphs &&
      workflowId === "agent_team.coding"
    ) {
      return new DynamicAgentTeamGraphRunner({
        runtimeJobs: this.options.runtimeJobs,
        runtimeWorkGraphs: this.options.runtimeWorkGraphs,
        runtimeToolKernel: this.options.runtimeToolKernel ?? null,
        requireSchedulerToolKernel: !explicitSingleJobQualityProof,
        workQueue: this.options.workQueue,
        workerId: this.options.workerId,
        sourcePromptSessionRoots: this.options.sourcePromptSessionRoots,
        roleModelClient: this.options.roleModelClient!,
        orchestratorModelClient: this.options.dynamicOrchestratorModelClient,
        missionContractModelClient: this.options.missionContractModelClient,
        validationRunner: this.options.dynamicValidationRunner,
        implementationBridge: this.options.implementationBridge!,
        kimiImplementationAdapter: this.options.kimiImplementationAdapter,
        closeoutReporter: this.options.closeoutReporter,
        now: this.now,
      }).run(job);
    }
    if (
      liveQualityPathConfigured &&
      workflowId === "agent_team.coding" &&
      !readSingleJobQualityProofPayloadFlag(job.payload)
    ) {
      throw new Error(
        "dynamic_runtime_work_graph_required:live coding-team execution cannot fall back to the static single-job role sequence",
      );
    }
    if (explicitSingleJobQualityProof || liveQualityPathConfigured) {
      return this.runSingleJobQualityProofJob({
        job,
        workflowId,
        teamRunId,
        objectiveForModel: objectiveResolution.objectiveForModel,
        objectiveForEvidence: objective,
        taskSpecificObjectivePresent,
        sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
        permissionEvidence,
      });
    }
    const plan = createFirstAgentTeamImplementationPlan({
      planId: `${teamRunId}-plan`,
      createdAt: this.now().toISOString(),
    });
    const evidenceRefs = [
      ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
      ".artifacts/execution-platform/work-queue-model-readiness-v4-pro-proof.json",
    ];
    const modelRosterDecisions = [
      enforceModelRoster({
        roleId: "implementation_engineer",
        requestedModelId: "moonshotai/kimi-k2.6",
        requestedAuthority: "implementation",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }),
      enforceModelRoster({
        roleId: "test_engineer",
        requestedModelId: "deepseek/deepseek-v4-flash",
        requestedAuthority: "testing",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }),
      enforceModelRoster({
        roleId: "context_scout",
        requestedModelId: "deepseek/deepseek-v4-pro",
        requestedAuthority: "observe",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleTargetId: "context_scout",
        roleQualificationStatus: "needs_review",
        evidenceRefs,
      }),
    ];
    const now = this.now().toISOString();
    const scout = createContextScoutArtifact({
      scoutId: `${teamRunId}-context-scout`,
      runtimeJobId: job.jobId,
      teamRunId,
      objective,
      relevantFiles: taskSpecificFilesForWorkflow(workflowId),
      existingPatterns: [`${workflowId} runtime artifacts feed Work Queue projection`],
      knownConstraints: ["Work Queue lifecycle is not mutated by agent-team evidence"],
      risks: ["V4 Pro remains needs_review and cannot receive authority"],
      suggestedImplementationPath: [`produce task-specific evidence for ${workflowId}`],
      unknowns: ["future live multi-model runner details remain outside this pass"],
      filesNotToTouch: ["pnpm-lock.yaml", "deployment config", "secrets"],
    });
    await recordContextScoutArtifact({ runtimeJobs: this.options.runtimeJobs, artifact: scout });
    const review = buildSecurityPrivacyReviewerArtifact({
      reviewId: `${teamRunId}-security-review`,
      reviewKind: "local_codex_review",
      runtimeJobId: job.jobId,
      teamRunId,
      objective,
      filesReviewed: scout.relevantFiles,
      evidenceRefs: [`runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`],
      findings: [
        ...(taskSpecificObjectivePresent
          ? []
          : [
              {
                severity: "high" as const,
                title: "Task-specific objective missing",
                requiredFix: "Provide objectiveSummary before completing the workflow.",
              },
            ]),
        {
          severity: "low" as const,
          title: "V4 Pro remains needs_review and is not granted authority",
          requiredFix: null,
        },
      ],
      exploitabilityNotes: ["no live authority expansion in injected runner"],
      requiredFixes: [],
      recommendedFixes: ["rerun V4 Pro eval before assigning authority"],
      residualRisk: ["future live agent-team transport still needs production proof"],
      judgmentMade: true,
    });
    await recordSecurityPrivacyReviewerArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: review,
    });
    const capsuleInput: CloseoutCapsuleReporterInput = {
      factualRefs: {
        runtimeJobId: job.jobId,
        teamRunId,
        workflowId,
        status: taskSpecificObjectivePresent ? "completed" : "needs_review",
        roles: plan.modelAssignments.slice(0, 12).map((assignment) => ({
          roleId: assignment.roleId,
          agentId: assignment.roleId,
          modelRef: assignment.modelId,
          status: assignment.modelId === "deepseek/deepseek-v4-pro" ? "needs_review" : "completed",
        })),
        fileRefs: scout.relevantFiles.slice(0, 30),
        artifactRefs: [
          `runtime-job://${job.jobId}/agent-team/context-scout`,
          `runtime-job://${job.jobId}/agent-team/security-review`,
        ],
        validationRefs: ["focused agent-team runtime evidence tests"],
        runtimeEventRefs: [`runtime-job://${job.jobId}/events`],
      },
      objectiveSummary: objective,
      boundedRoleEvidence: plan.modelAssignments.slice(0, 12).map((assignment) => ({
        roleId: assignment.roleId,
        agentId: assignment.roleId,
        modelRef: assignment.modelId,
        askedToDo: objective,
        evidenceSummary:
          assignment.modelId === "deepseek/deepseek-v4-pro"
            ? "V4 Pro lane was explicitly held at needs_review and did not receive authority."
            : "Injected role execution recorded bounded runtime evidence for this pilot.",
        artifactRefs: [`runtime-job://${job.jobId}/agent-team/${assignment.roleId}`],
        validationRefs: ["focused agent-team runtime evidence tests"],
        limitations:
          assignment.modelId === "deepseek/deepseek-v4-pro"
            ? ["model lane remains needs_review"]
            : ["injected one-shot runner path"],
      })),
      boundedResultEvidence: {
        completed: taskSpecificObjectivePresent,
        needsReview: !taskSpecificObjectivePresent,
        failed: false,
        findings: taskSpecificObjectivePresent
          ? []
          : ["runtime job did not include objectiveSummary"],
        requiredFixes: taskSpecificObjectivePresent
          ? []
          : ["rerun with a bounded objectiveSummary before marking succeeded"],
        limitations: [
          "runner used injected role execution, not live multi-model team transport",
          ...(!taskSpecificObjectivePresent ? ["task-specific objective was missing"] : []),
        ],
      },
    };
    const closeoutStartedAtDate = this.now();
    let capsuleResult: CloseoutCapsuleReporterResult;
    try {
      capsuleResult = this.options.closeoutReporter
        ? await this.options.closeoutReporter.createCapsule(capsuleInput)
        : createDegradedSystemCloseoutCapsule({
            ...capsuleInput,
            reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
            closeoutTiming: buildCloseoutFailureTiming({
              startedAt: closeoutStartedAtDate,
              completedAt: this.now(),
              failureReason: "closeout_capsule_model_reporter_not_configured",
            }),
          });
    } catch (error) {
      const failureReason =
        error instanceof Error && error.message === "closeout_model_timeout"
          ? "closeout_model_timeout"
          : "closeout_capsule_model_reporter_failed";
      capsuleResult = createDegradedSystemCloseoutCapsule({
        ...capsuleInput,
        reasonCodes: [failureReason],
        closeoutTiming: buildCloseoutFailureTiming({
          startedAt: closeoutStartedAtDate,
          completedAt: this.now(),
          failureReason,
        }),
      });
    }
    const capsuleIsModelAuthored =
      capsuleResult.source === "model" && capsuleResult.capsule.humanReport.source === "model";
    const cleanSuccessAccepted = taskSpecificObjectivePresent && capsuleIsModelAuthored;
    const blockingReasonCodes = [
      ...(!taskSpecificObjectivePresent
        ? ["task_specific_closeout_evidence_required_before_success"]
        : []),
      ...(!capsuleIsModelAuthored
        ? [
            ...(capsuleResult.reasonCodes.includes("closeout_model_timeout")
              ? ["closeout_model_timeout"]
              : []),
            "model_authored_closeout_required_before_success",
          ]
        : []),
    ];
    const resultReview = buildAgentTeamResultReviewArtifact({
      reviewId: `${teamRunId}-result-review`,
      teamRunId,
      runtimeJobId: job.jobId,
      objective,
      validationEvidenceRefs: ["focused agent-team runtime evidence tests"],
      closeoutRefs: [
        `runtime-job://${job.jobId}/closeout-capsule/${capsuleResult.capsule.capsuleId}`,
      ],
      filesChanged: scout.relevantFiles,
      reviewer: "local-codex-operator",
      reviewKind: "local_codex_review",
      judgmentMade: true,
      notDeterministic: true,
      goalSatisfaction: cleanSuccessAccepted ? "satisfied" : "needs_review",
      findings: taskSpecificObjectivePresent
        ? []
        : ["runtime job did not include objectiveSummary"],
      limitations: [
        "runner used injected role execution, not live multi-model team transport",
        ...(!taskSpecificObjectivePresent ? ["task-specific objective was missing"] : []),
      ],
      requiredFixes: cleanSuccessAccepted
        ? []
        : [
            ...(!taskSpecificObjectivePresent
              ? ["rerun with a bounded objectiveSummary before marking succeeded"]
              : []),
            ...(!capsuleIsModelAuthored
              ? [
                  capsuleResult.reasonCodes.includes("closeout_model_timeout")
                    ? "closeout model timed out before a model-authored Closeout Capsule could be accepted"
                    : "generate a model-authored Closeout Capsule before marking clean success",
                ]
              : []),
          ],
      closeoutCapsule: capsuleResult.capsule,
      closeoutTiming: capsuleResult.closeoutTiming,
      humanCloseoutSummary: capsuleResult.legacyHumanSummary,
      accepted: cleanSuccessAccepted,
      needsReview: !cleanSuccessAccepted,
      finalAcceptanceBy: "operator",
    });
    await recordAgentTeamResultReviewArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: resultReview,
    });
    if (capsuleResult.closeoutTiming) {
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.closeout_model_timing",
        storageKind: "metadata",
        uri: `runtime-job://${job.jobId}/agent-team/closeout-model-timing/${teamRunId}`,
        contentType: "application/json",
        metadata: capsuleResult.closeoutTiming as unknown as JsonValue,
      });
    }
    const allowedAssignments = plan.modelAssignments
      .filter((assignment) => assignment.modelId !== "deepseek/deepseek-v4-pro")
      .slice(0, 5)
      .map((assignment) => ({
        roleId: assignment.roleId,
        modelId: assignment.modelId,
        assignedAt: now,
        status: "completed" as const,
      }));
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId,
      runtimeJobId: job.jobId,
      workQueueLink: job.workItemId ? { workItemId: job.workItemId } : null,
      objective,
      roster: [
        ...allowedAssignments.map((assignment) => ({
          roleId: assignment.roleId,
          modelId: assignment.modelId,
          status: "allowed" as const,
        })),
        { roleId: "context_scout", modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
      ],
      roleAssignments: allowedAssignments,
      roleEligibility: Object.fromEntries(
        modelRosterDecisions.map((decision) => [
          decision.requestedModelId,
          decision.allowed ? "allowed" : decision.status,
        ]),
      ),
      activeRole: "observability_scribe",
      handoffHistory: [
        {
          handoffId: `${teamRunId}-scout-to-implementation`,
          fromRole: "context_scout",
          toRole: "implementation_engineer",
          status: "completed",
          recordedAt: now,
          payloadSummary: "context scout suggested runtime evidence and read-model files",
          evidenceRefs: [`runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`],
          rawTranscriptAllowed: false,
          rawProviderPromptAllowed: false,
        },
      ],
      reviewState: cleanSuccessAccepted ? "reviewed" : "needs_review",
      validationState: cleanSuccessAccepted ? "passed" : "needs_review",
      closeoutState: "present",
      authorityStatus: modelRosterDecisions.every(
        (decision) => decision.allowed || decision.status === "needs_review",
      )
        ? "allowed"
        : "blocked",
      permissionEvidence,
      modelRoutingEvidence: modelRosterDecisions as unknown as JsonValue,
      controlState: "none",
      streamEvidenceRefs: [`runtime-job://${job.jobId}/agent-team/events`],
      artifactRefs: [
        `runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`,
        `runtime-job://${job.jobId}/agent-team/security-review/${review.reviewId}`,
        `runtime-job://${job.jobId}/agent-team/result-review/${resultReview.reviewId}`,
      ],
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    return {
      artifactKind: "agent_team_claimed_job_execution_result",
      evidence,
      modelRosterDecisions,
      closeoutCapsule: capsuleResult.capsule,
      cleanSuccessAccepted,
      blockingReasonCodes,
      changedFileRefs: taskSpecificFilesForWorkflow(workflowId),
      validationRefs: ["focused agent-team runtime evidence tests"],
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private empty(input: Partial<AgentTeamQueuedRunOnceResult>): AgentTeamQueuedRunOnceResult {
    return {
      artifactKind: "agent_team_queued_run_once_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      runtimeJobId: null,
      teamRunId: null,
      modelRosterDecisions: [],
      evidence: null,
      failure: null,
      closeoutRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      daemonStarted: false,
      schedulerStarted: false,
      ...input,
    };
  }
}

function taskSpecificFilesForWorkflow(workflowId: string): string[] {
  switch (workflowId) {
    case "agent_team.architecture":
      return [
        "extensions/execution-platform/src/workflows/architecture-workflow.ts",
        "extensions/execution-platform/src/workflows/architecture-spec-review-live-pilot.ts",
        "extensions/execution-platform/src/workflows/workflow-contract.ts",
      ];
    case "agent_team.qa_test":
      return [
        "extensions/execution-platform/src/workflows/qa-test-workflow.ts",
        "extensions/execution-platform/src/workflows/qa-test-review-live-pilot.ts",
        "extensions/execution-platform/src/codex-bridge/agent-team-result-review.ts",
      ];
    case "agent_team.coding":
      return [
        "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
        "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ];
    default:
      return [
        "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ];
  }
}

function buildCloseoutFailureTiming(input: {
  startedAt: Date;
  completedAt: Date;
  failureReason: string;
}): CloseoutCapsuleReporterTiming {
  return {
    closeoutModelStartedAt: input.startedAt.toISOString(),
    closeoutModelCompletedAt: input.completedAt.toISOString(),
    latencyMs: Math.max(0, input.completedAt.getTime() - input.startedAt.getTime()),
    modelRef: "not_available",
    reasoningEffort: "medium",
    maxOutputTokens: 0,
    capsuleId: null,
    capsuleHash: null,
    failureReason: input.failureReason,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
