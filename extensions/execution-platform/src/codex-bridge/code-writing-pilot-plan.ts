import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { CODEX_BRIDGE_CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE } from "./code-writing-pilot-readiness.ts";
import { CODEX_BRIDGE_FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE } from "./control-loop-proof.ts";
import { CODEX_BRIDGE_EMISSION_GUARDRAIL_ARTIFACT_TYPE } from "./emission-guardrails.ts";
import { CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE } from "./redirect-application-proof.ts";
import { CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE } from "./skill-audit-lint.ts";
import { CODEX_BRIDGE_JOB_TYPE, isCodexBridgeJobPayload } from "./types.ts";
import { EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_ARTIFACT_TYPE } from "./work-episode-closeout.ts";

const CODE_WRITING_PILOT_PLAN_ARTIFACT_TYPE = "codex_bridge.code_writing_pilot_plan";
const CODE_WRITING_PILOT_OBJECTIVE_SELECTION_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_objective_selection";
const CODE_WRITING_PILOT_REQUEST_SKELETON_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_request_skeleton";
const CODE_WRITING_PILOT_PROMPT_PACKAGE_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_prompt_package";
const CODE_WRITING_PILOT_PREFLIGHT_PLAN_ARTIFACT_TYPE =
  "codex_bridge.code_writing_pilot_preflight_plan";
const CODE_WRITING_PILOT_PLAN_CREATED_EVENT_TYPE = "codex_bridge.code_writing_pilot_plan_created";
const CODE_WRITING_PILOT_PLANNING_COMPLETED_EVENT_TYPE =
  "codex_bridge.code_writing_pilot_planning_completed";
const DEFAULT_MAX_CODE_WRITING_PILOT_PLAN_METADATA_BYTES = 96 * 1024;

export type CodeWritingPilotObjectiveRiskClass =
  | "tiny_non_critical_patch"
  | "docs_only_patch"
  | "blocked_too_large";

export type CodeWritingPilotCandidatePatchType = "source_test" | "source" | "docs";

export type CodeWritingPilotObjectiveCandidate = {
  candidateId: string;
  title: string;
  objective: string;
  targetFiles: string[];
  expectedTests: string[];
  patchType: CodeWritingPilotCandidatePatchType;
  riskNotes?: string[];
};

export type CodeWritingPilotObjectiveSelectionReport = {
  artifactKind: "codex_bridge_code_writing_pilot_objective_selection";
  selectedObjective: CodeWritingPilotObjectiveCandidate | null;
  objectiveRiskClass: CodeWritingPilotObjectiveRiskClass;
  rejectedCandidates: Array<CodeWritingPilotObjectiveCandidate & { rejectedReasons: string[] }>;
  blockingReasons: string[];
  deterministicRulesOnly: true;
};

export type CodeWritingPilotRequestSkeleton = {
  artifactKind: "codex_bridge_code_writing_pilot_request_skeleton";
  requestId: string;
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  requestedMode: "code_writing_bridge_pilot";
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  operatorApprovalRequired: true;
  operatorApprovalSatisfied: false;
  enableLiveCodexPilot: false;
  enableCodeWritingBridgePilot: false;
  acknowledgeSeparateExecutorSession: false;
  acknowledgeNoSharedManualSession: false;
  acknowledgeCodeWritingRisk: false;
  acknowledgeNoRebuild: true;
  acknowledgeNoAutobailout: true;
  acknowledgeNoSubagents: true;
  acknowledgeNoWorkQueueLifecycleMutation: true;
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  maxFilesTouched: number;
  targetFiles: string[];
  expectedTests: string[];
  status: "planned_not_approved";
  commandExecuted: false;
  liveExecutionEnabled: false;
};

export type CodeWritingPilotPromptPackage = {
  artifactKind: "codex_bridge_code_writing_pilot_prompt_package";
  promptPackageId: string;
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  objective: string;
  allowedFiles: string[];
  prohibitedActions: string[];
  validationPlan: string[];
  rollbackExpectations: string[];
  closeoutRequirement: string;
  controlBridgeExpectations: string[];
  processCompletionIsTaskSuccess: false;
  rawTranscriptIncluded: false;
  hiddenReasoningRequested: false;
  shellCommandRequestedFromRuntimePayload: false;
  rebuildAuthorityGranted: false;
  autobailoutAuthorityGranted: false;
  subagentAuthorityGranted: false;
  acpAuthorityGranted: false;
  providerDirectCallAuthorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  inertMetadataOnly: true;
};

export type CodeWritingPilotPlan = {
  artifactKind: "codex_bridge_code_writing_pilot_plan";
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  createdAt: string;
  createdBy: string;
  pilotKind: "code_writing_bridge_pilot";
  planMode: "plan_only";
  selectedObjective: CodeWritingPilotObjectiveCandidate | null;
  objectiveRiskClass: CodeWritingPilotObjectiveRiskClass;
  targetFiles: string[];
  maxFilesAllowed: number;
  maxPatchScopeSummary: string;
  expectedTests: string[];
  validationPlan: string[];
  rollbackPlan: string[];
  noRebuildRequired: true;
  noDbMigrationRequired: true;
  noDependencyChangeRequired: true;
  noWorkQueueLifecycleMutation: true;
  noAcp: true;
  noSubagents: true;
  noAutobailout: true;
  noTrustedYolo: true;
  noModelPromotion: true;
  noProviderDirectCall: true;
  repoPath: string;
  workspaceDocsPath: string;
  safeUiBridgeMetadata: JsonValue;
  workQueueLink: JsonValue | null;
  priorCloseoutGateState: JsonValue | null;
  controlReadinessSummary: JsonValue | null;
  fakeControlLoopProofRef: string | null;
  fakeRedirectApplicationProofRef: string | null;
  skillTriggerReport: JsonValue | null;
  skillReadinessReport: JsonValue | null;
  skillAuditLintReport: JsonValue | null;
  qualitativeReviewBoundary: JsonValue | null;
  emissionGuardrailState: JsonValue | null;
  expectedOversightStreamChannels: string[];
  expectedControlCommands: Array<"pause" | "redirect" | "cancel">;
  expectedCloseoutBehavior: string;
  operatorApprovalRequired: true;
  operatorApprovalSatisfied: false;
  liveExecutionEnabled: false;
  codexCliInvoked: false;
  commandExecuted: false;
  allowedToCreateLiveRequest: boolean;
  allowedToRunLivePilot: false;
  blockingReasons: string[];
  requiredNextOperatorAction:
    | "request_explicit_operator_approval_for_first_code_writing_bridge_pilot"
    | "fix_code_writing_pilot_plan_blockers";
};

export type CodeWritingPilotPreflightPlan = {
  artifactKind: "codex_bridge_code_writing_pilot_preflight_plan";
  pilotPlanId: string;
  runtimeJobId: string;
  sessionId: string;
  allowedToCreateLiveRequest: boolean;
  allowedToRunLivePilot: false;
  requestSkeletonId: string;
  promptPackageId: string;
  blockingReasons: string[];
  operatorApprovalRequired: true;
  operatorApprovalSatisfied: false;
  liveExecutionEnabled: false;
  commandExecuted: false;
};

export type CreateCodeWritingPilotPlanInput = {
  pilotPlanId?: string;
  requestId?: string;
  promptPackageId?: string;
  runtimeJobId: string;
  sessionId: string;
  createdBy: string;
  candidates: CodeWritingPilotObjectiveCandidate[];
  validationPlan: string[];
  rollbackPlan: string[];
  maxRuntimeMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  maxFilesAllowed?: number;
  requestTtlMs?: number;
};

export type CreateCodeWritingPilotPlanResult = {
  objectiveSelection: CodeWritingPilotObjectiveSelectionReport;
  plan: CodeWritingPilotPlan;
  requestSkeleton: CodeWritingPilotRequestSkeleton;
  promptPackage: CodeWritingPilotPromptPackage;
  preflightPlan: CodeWritingPilotPreflightPlan;
};

type PlanningEvidence = {
  artifacts: RuntimeJobArtifact[];
  latestReadiness: RuntimeJobArtifact | null;
  latestCloseout: RuntimeJobArtifact | null;
  latestControlLoop: RuntimeJobArtifact | null;
  latestRedirectProof: RuntimeJobArtifact | null;
  latestSkillTrigger: RuntimeJobArtifact | null;
  latestSkillReadiness: RuntimeJobArtifact | null;
  latestSkillLint: RuntimeJobArtifact | null;
  latestEmissionGuardrail: RuntimeJobArtifact | null;
};

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundPlanMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 360,
    maxArrayItems: 220,
    maxDepth: 12,
    maxStringLength: 2_000,
  });
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  if (jsonByteLength(value) > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function latestArtifact(
  artifacts: RuntimeJobArtifact[],
  artifactType: string,
): RuntimeJobArtifact | null {
  return artifacts.findLast((artifact) => artifact.artifactType === artifactType) ?? null;
}

function rejectUnsafeContent(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  const unsafePatterns = [
    /raw-prompt-marker/u,
    /raw-transcript-marker/u,
    /raw-tool-log-marker/u,
    /secret-marker/u,
    /\bsk-[a-z0-9_-]{12,}/u,
    /hidden-reasoning-marker/u,
    /provider-prompt-marker/u,
  ];
  if (unsafePatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("code-writing pilot plan contains prohibited raw/private content");
  }
}

function forbiddenTargetReason(targetFile: string): string | null {
  const normalized = targetFile.replace(/\\/gu, "/");
  if (normalized.startsWith("../") || normalized.includes("/../")) {
    return "target_file_outside_allowed_paths";
  }
  const lower = normalized.toLowerCase();
  const forbidden = [
    ["package_lockfile", /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/u],
    ["migration", /(^|\/)(migrations|db\/migrations)\//u],
    ["runtime_config", /(^|\/)(\.env|openclaw\.json|config\/|src\/config\/)/u],
    ["secret", /(^|\/)(secrets?|credentials?)(\/|\.|$)/u],
    ["deployment", /(^|\/)(dockerfile|docker-compose|deploy|deployment|k8s|helm)(\/|\.|$)/u],
    ["provider_sdk_wiring", /provider|openrouter|deepseek|minimax|qwen|anthropic|openai/u],
    ["work_queue_lifecycle_ui", /work[-_]?queue.*(ui|component|page|button)|ui.*work[-_]?queue/u],
    ["acp_live_execution", /acp.*(live|runner|executor)|live.*acp/u],
    ["rebuild_autobailout_subagent", /rebuild|autobailout|subagent/u],
  ] as const;
  const match = forbidden.find(([, pattern]) => pattern.test(lower));
  return match ? `target_file_forbidden:${match[0]}` : null;
}

function objectiveRiskClass(
  candidate: CodeWritingPilotObjectiveCandidate | null,
): CodeWritingPilotObjectiveRiskClass {
  if (!candidate) {
    return "blocked_too_large";
  }
  return candidate.patchType === "docs" ? "docs_only_patch" : "tiny_non_critical_patch";
}

function candidateRejectedReasons(input: {
  candidate: CodeWritingPilotObjectiveCandidate;
  repoPath: string;
  workspaceDocsPath: string;
  maxFilesAllowed: number;
}): string[] {
  const reasons: string[] = [];
  if (!input.candidate.candidateId.trim()) {
    reasons.push("missing_candidate_id");
  }
  if (!input.candidate.objective.trim()) {
    reasons.push("missing_objective");
  }
  if (input.candidate.targetFiles.length === 0) {
    reasons.push("missing_target_files");
  }
  if (input.candidate.targetFiles.length > input.maxFilesAllowed) {
    reasons.push("too_many_target_files");
  }
  if (input.candidate.expectedTests.length === 0) {
    reasons.push("missing_expected_tests");
  }
  for (const targetFile of input.candidate.targetFiles) {
    const forbiddenReason = forbiddenTargetReason(targetFile);
    if (forbiddenReason) {
      reasons.push(forbiddenReason);
    }
    const absolute = path.isAbsolute(targetFile)
      ? path.normalize(targetFile)
      : path.resolve(input.repoPath, targetFile);
    const allowedRepo =
      absolute === input.repoPath || absolute.startsWith(`${input.repoPath}${path.sep}`);
    const allowedDocs =
      absolute === input.workspaceDocsPath ||
      absolute.startsWith(`${input.workspaceDocsPath}${path.sep}`);
    if (!allowedRepo && !allowedDocs) {
      reasons.push("target_file_outside_allowed_paths");
    }
  }
  if (input.candidate.patchType === "source" && input.candidate.targetFiles.length > 1) {
    reasons.push("source_patch_touches_multiple_files");
  }
  if (
    input.candidate.riskNotes?.some((note) => /broad|large|migration|rebuild|deploy/iu.test(note))
  ) {
    reasons.push("risk_notes_indicate_broad_or_blocked_work");
  }
  return [...new Set(reasons)];
}

export function selectCodeWritingPilotObjective(input: {
  candidates: CodeWritingPilotObjectiveCandidate[];
  repoPath?: string;
  workspaceDocsPath?: string;
  maxFilesAllowed?: number;
}): CodeWritingPilotObjectiveSelectionReport {
  const repoPath = path.resolve(input.repoPath ?? "/root/services/openclaw-roles/live");
  const workspaceDocsPath = path.resolve(
    input.workspaceDocsPath ?? "/root/.openclaw/workspace/docs/projects/execution-platform",
  );
  const maxFilesAllowed = input.maxFilesAllowed ?? 1;
  const rejectedCandidates = input.candidates
    .map((candidate) => ({
      ...candidate,
      rejectedReasons: candidateRejectedReasons({
        candidate,
        repoPath,
        workspaceDocsPath,
        maxFilesAllowed,
      }),
    }))
    .filter((candidate) => candidate.rejectedReasons.length > 0);
  const safeCandidates = input.candidates.filter(
    (candidate) =>
      !rejectedCandidates.some((rejected) => rejected.candidateId === candidate.candidateId),
  );
  const blockingReasons: string[] = [];
  if (safeCandidates.length === 0) {
    blockingReasons.push("no_safe_tiny_objective");
  }
  if (safeCandidates.length > 1) {
    blockingReasons.push("ambiguous_multiple_safe_objectives");
  }
  const selectedObjective = safeCandidates.length === 1 ? safeCandidates[0] : null;
  return {
    artifactKind: "codex_bridge_code_writing_pilot_objective_selection",
    selectedObjective,
    objectiveRiskClass: objectiveRiskClass(selectedObjective),
    rejectedCandidates,
    blockingReasons,
    deterministicRulesOnly: true,
  };
}

function collectPlanningEvidence(artifacts: RuntimeJobArtifact[]): PlanningEvidence {
  return {
    artifacts,
    latestReadiness: latestArtifact(
      artifacts,
      CODEX_BRIDGE_CODE_WRITING_PILOT_READINESS_ARTIFACT_TYPE,
    ),
    latestCloseout: latestArtifact(
      artifacts,
      EXECUTION_PLATFORM_WORK_EPISODE_CLOSEOUT_ARTIFACT_TYPE,
    ),
    latestControlLoop: latestArtifact(
      artifacts,
      CODEX_BRIDGE_FAKE_CONTROL_LOOP_PROOF_ARTIFACT_TYPE,
    ),
    latestRedirectProof: latestArtifact(
      artifacts,
      CODEX_BRIDGE_FAKE_REDIRECT_APPLICATION_PROOF_ARTIFACT_TYPE,
    ),
    latestSkillTrigger: latestArtifact(artifacts, "codex_bridge.skill_trigger_report"),
    latestSkillReadiness: latestArtifact(artifacts, "codex_bridge.skill_readiness_report"),
    latestSkillLint: latestArtifact(artifacts, CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE),
    latestEmissionGuardrail: latestArtifact(
      artifacts,
      CODEX_BRIDGE_EMISSION_GUARDRAIL_ARTIFACT_TYPE,
    ),
  };
}

function validatePlanningEvidence(evidence: PlanningEvidence): string[] {
  const blockingReasons: string[] = [];
  if (
    !evidence.latestReadiness ||
    !isRecord(evidence.latestReadiness.metadata) ||
    evidence.latestReadiness.metadata.allowedToPlanCodeWritingPilot !== true
  ) {
    blockingReasons.push("missing_or_blocked_slice_8r_readiness");
  }
  if (!evidence.latestControlLoop) {
    blockingReasons.push("missing_fake_control_loop_proof");
  }
  if (!evidence.latestRedirectProof) {
    blockingReasons.push("missing_fake_redirect_application_proof");
  }
  if (!evidence.latestCloseout) {
    blockingReasons.push("missing_closeout_gate_evidence");
  }
  if (
    !evidence.latestSkillReadiness ||
    !isRecord(evidence.latestSkillReadiness.metadata) ||
    evidence.latestSkillReadiness.metadata.allowed !== true
  ) {
    blockingReasons.push("missing_or_blocked_skill_readiness");
  }
  if (!evidence.latestSkillTrigger) {
    blockingReasons.push("missing_skill_trigger_report");
  }
  if (
    !evidence.latestSkillLint ||
    !isRecord(evidence.latestSkillLint.metadata) ||
    evidence.latestSkillLint.metadata.ruleCoverageOnly !== true ||
    evidence.latestSkillLint.metadata.qualitativeJudgmentMade !== false ||
    evidence.latestSkillLint.metadata.requiresSeparateQualitativeReview !== true
  ) {
    blockingReasons.push("missing_or_overclaiming_skill_audit_lint");
  }
  if (
    evidence.latestSkillLint &&
    isRecord(evidence.latestSkillLint.metadata) &&
    evidence.latestSkillLint.metadata.qualitativeJudgmentMade === true
  ) {
    blockingReasons.push("skill_audit_lint_claims_qualitative_proof");
  }
  if (
    !evidence.latestEmissionGuardrail ||
    !isRecord(evidence.latestEmissionGuardrail.metadata) ||
    evidence.latestEmissionGuardrail.metadata.stringPatternOnly !== true
  ) {
    blockingReasons.push("missing_emission_guardrail_evidence");
  }
  return blockingReasons;
}

function validationBlockingReasons(input: {
  objectiveSelection: CodeWritingPilotObjectiveSelectionReport;
  validationPlan: string[];
  rollbackPlan: string[];
  liveExecutionEnabled?: boolean;
}): string[] {
  const reasons = [...input.objectiveSelection.blockingReasons];
  if (input.validationPlan.length === 0) {
    reasons.push("missing_validation_plan");
  }
  if (input.rollbackPlan.length === 0) {
    reasons.push("missing_rollback_plan");
  }
  if (input.liveExecutionEnabled === true) {
    reasons.push("live_execution_enabled_in_planning_slice");
  }
  return [...new Set(reasons)];
}

function requestExpiry(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

export class CodexBridgeCodeWritingPilotPlanRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: { now?: () => Date; maxArtifactMetadataBytes?: number } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_CODE_WRITING_PILOT_PLAN_METADATA_BYTES;
  }

  async createPilotPlan(
    input: CreateCodeWritingPilotPlanInput,
  ): Promise<CreateCodeWritingPilotPlanResult> {
    const job = await this.runtimeJobs.getJob(input.runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${input.runtimeJobId}`);
    }
    const now = this.now();
    const createdAt = now.toISOString();
    const maxFilesAllowed = input.maxFilesAllowed ?? 1;
    const objectiveSelection = selectCodeWritingPilotObjective({
      candidates: input.candidates,
      repoPath: job.payload.environment.repoPath,
      workspaceDocsPath: job.payload.environment.workspaceDocsPath,
      maxFilesAllowed,
    });
    const artifacts = await this.runtimeJobs.listArtifacts(input.runtimeJobId);
    const evidence = collectPlanningEvidence(artifacts);
    const blockingReasons = [
      ...validatePlanningEvidence(evidence),
      ...validationBlockingReasons({
        objectiveSelection,
        validationPlan: input.validationPlan,
        rollbackPlan: input.rollbackPlan,
        liveExecutionEnabled: false,
      }),
    ];
    const selected = objectiveSelection.selectedObjective;
    const pilotPlanId = input.pilotPlanId ?? randomUUID();
    const requestId = input.requestId ?? randomUUID();
    const promptPackageId = input.promptPackageId ?? randomUUID();
    const allowedToCreateLiveRequest = blockingReasons.length === 0;
    const requestSkeleton: CodeWritingPilotRequestSkeleton = {
      artifactKind: "codex_bridge_code_writing_pilot_request_skeleton",
      requestId,
      pilotPlanId,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      requestedMode: "code_writing_bridge_pilot",
      requestedBy: input.createdBy,
      requestedAt: createdAt,
      expiresAt: requestExpiry(now, input.requestTtlMs ?? 24 * 60 * 60 * 1000),
      operatorApprovalRequired: true,
      operatorApprovalSatisfied: false,
      enableLiveCodexPilot: false,
      enableCodeWritingBridgePilot: false,
      acknowledgeSeparateExecutorSession: false,
      acknowledgeNoSharedManualSession: false,
      acknowledgeCodeWritingRisk: false,
      acknowledgeNoRebuild: true,
      acknowledgeNoAutobailout: true,
      acknowledgeNoSubagents: true,
      acknowledgeNoWorkQueueLifecycleMutation: true,
      maxRuntimeMs: input.maxRuntimeMs ?? 120_000,
      maxStdoutBytes: input.maxStdoutBytes ?? 256 * 1024,
      maxStderrBytes: input.maxStderrBytes ?? 64 * 1024,
      maxFilesTouched: maxFilesAllowed,
      targetFiles: selected?.targetFiles ?? [],
      expectedTests: selected?.expectedTests ?? [],
      status: "planned_not_approved",
      commandExecuted: false,
      liveExecutionEnabled: false,
    };
    const promptPackage: CodeWritingPilotPromptPackage = {
      artifactKind: "codex_bridge_code_writing_pilot_prompt_package",
      promptPackageId,
      pilotPlanId,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      objective: selected?.objective ?? "No safe objective selected.",
      allowedFiles: selected?.targetFiles ?? [],
      prohibitedActions: [
        "Do not run shell commands from runtime job payloads.",
        "Do not rebuild.",
        "Do not use ACP.",
        "Do not use subagents.",
        "Do not mutate Work Queue lifecycle.",
        "Do not install, deploy, promote, or send outbound data.",
        "Do not edit files outside the allowed file list.",
        "Do not store raw transcripts, provider prompts, hidden reasoning, secrets, or raw logs.",
      ],
      validationPlan: input.validationPlan,
      rollbackExpectations: input.rollbackPlan,
      closeoutRequirement:
        "A work_episode_outcome_pack.v1 closeout must be emitted after any future real bridge work.",
      controlBridgeExpectations: [
        "Emit oversight stream events and heartbeat evidence.",
        "Honor durable pause, redirect, and cancel control command truth.",
        "Pause or stop on unexpected file scope expansion.",
        "Pause or stop on runtime substrate mismatch or emission overclaim.",
      ],
      processCompletionIsTaskSuccess: false,
      rawTranscriptIncluded: false,
      hiddenReasoningRequested: false,
      shellCommandRequestedFromRuntimePayload: false,
      rebuildAuthorityGranted: false,
      autobailoutAuthorityGranted: false,
      subagentAuthorityGranted: false,
      acpAuthorityGranted: false,
      providerDirectCallAuthorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
      inertMetadataOnly: true,
    };
    const plan: CodeWritingPilotPlan = {
      artifactKind: "codex_bridge_code_writing_pilot_plan",
      pilotPlanId,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      createdAt,
      createdBy: input.createdBy,
      pilotKind: "code_writing_bridge_pilot",
      planMode: "plan_only",
      selectedObjective: selected,
      objectiveRiskClass: objectiveSelection.objectiveRiskClass,
      targetFiles: selected?.targetFiles ?? [],
      maxFilesAllowed,
      maxPatchScopeSummary:
        "Future bridge pilot may touch only the selected tiny objective file list and remains disabled until explicit approval.",
      expectedTests: selected?.expectedTests ?? [],
      validationPlan: input.validationPlan,
      rollbackPlan: input.rollbackPlan,
      noRebuildRequired: true,
      noDbMigrationRequired: true,
      noDependencyChangeRequired: true,
      noWorkQueueLifecycleMutation: true,
      noAcp: true,
      noSubagents: true,
      noAutobailout: true,
      noTrustedYolo: true,
      noModelPromotion: true,
      noProviderDirectCall: true,
      repoPath: job.payload.environment.repoPath,
      workspaceDocsPath: job.payload.environment.workspaceDocsPath,
      safeUiBridgeMetadata: job.payload.environment.safeUiBridge as unknown as JsonValue,
      workQueueLink: (job.payload.workQueueLink ?? null) as JsonValue | null,
      priorCloseoutGateState: evidence.latestCloseout?.metadata ?? null,
      controlReadinessSummary: evidence.latestReadiness?.metadata ?? null,
      fakeControlLoopProofRef: evidence.latestControlLoop?.artifactId ?? null,
      fakeRedirectApplicationProofRef: evidence.latestRedirectProof?.artifactId ?? null,
      skillTriggerReport: evidence.latestSkillTrigger?.metadata ?? null,
      skillReadinessReport: evidence.latestSkillReadiness?.metadata ?? null,
      skillAuditLintReport: evidence.latestSkillLint?.metadata ?? null,
      qualitativeReviewBoundary:
        isRecord(evidence.latestSkillLint?.metadata) &&
        isRecord(evidence.latestSkillLint.metadata.qualitativeReviewBoundary)
          ? (evidence.latestSkillLint.metadata.qualitativeReviewBoundary as JsonValue)
          : null,
      emissionGuardrailState: evidence.latestEmissionGuardrail?.metadata ?? null,
      expectedOversightStreamChannels: [
        "handshake",
        "heartbeat",
        "stream_event",
        "control_command",
        "process_completion",
        "work_episode_closeout",
      ],
      expectedControlCommands: ["pause", "redirect", "cancel"],
      expectedCloseoutBehavior:
        "Future real bridge work must auto-emit Work Episode Outcome Pack closeout evidence and keep process completion distinct from task success.",
      operatorApprovalRequired: true,
      operatorApprovalSatisfied: false,
      liveExecutionEnabled: false,
      codexCliInvoked: false,
      commandExecuted: false,
      allowedToCreateLiveRequest,
      allowedToRunLivePilot: false,
      blockingReasons: [...new Set(blockingReasons)],
      requiredNextOperatorAction: allowedToCreateLiveRequest
        ? "request_explicit_operator_approval_for_first_code_writing_bridge_pilot"
        : "fix_code_writing_pilot_plan_blockers",
    };
    const preflightPlan: CodeWritingPilotPreflightPlan = {
      artifactKind: "codex_bridge_code_writing_pilot_preflight_plan",
      pilotPlanId,
      runtimeJobId: input.runtimeJobId,
      sessionId: input.sessionId,
      allowedToCreateLiveRequest,
      allowedToRunLivePilot: false,
      requestSkeletonId: requestId,
      promptPackageId,
      blockingReasons: plan.blockingReasons,
      operatorApprovalRequired: true,
      operatorApprovalSatisfied: false,
      liveExecutionEnabled: false,
      commandExecuted: false,
    };
    rejectUnsafeContent({
      objectiveSelection,
      plan,
      requestSkeleton,
      promptPackage,
      preflightPlan,
    });
    await this.persistPlanningResult({
      objectiveSelection,
      plan,
      requestSkeleton,
      promptPackage,
      preflightPlan,
    });
    return { objectiveSelection, plan, requestSkeleton, promptPackage, preflightPlan };
  }

  async readPilotPlans(runtimeJobId: string): Promise<CodeWritingPilotPlan[]> {
    return (await this.runtimeJobs.listArtifacts(runtimeJobId))
      .filter((artifact) => artifact.artifactType === CODE_WRITING_PILOT_PLAN_ARTIFACT_TYPE)
      .map((artifact) => artifact.metadata as unknown as CodeWritingPilotPlan);
  }

  async readLatestPilotPlan(runtimeJobId: string): Promise<CodeWritingPilotPlan | null> {
    return (await this.readPilotPlans(runtimeJobId)).at(-1) ?? null;
  }

  async readObjectiveSelectionReport(
    runtimeJobId: string,
  ): Promise<CodeWritingPilotObjectiveSelectionReport | null> {
    const artifact = latestArtifact(
      await this.runtimeJobs.listArtifacts(runtimeJobId),
      CODE_WRITING_PILOT_OBJECTIVE_SELECTION_ARTIFACT_TYPE,
    );
    return artifact?.metadata as unknown as CodeWritingPilotObjectiveSelectionReport | null;
  }

  async readRequestSkeleton(runtimeJobId: string): Promise<CodeWritingPilotRequestSkeleton | null> {
    const artifact = latestArtifact(
      await this.runtimeJobs.listArtifacts(runtimeJobId),
      CODE_WRITING_PILOT_REQUEST_SKELETON_ARTIFACT_TYPE,
    );
    return artifact?.metadata as unknown as CodeWritingPilotRequestSkeleton | null;
  }

  async readPromptPackage(runtimeJobId: string): Promise<CodeWritingPilotPromptPackage | null> {
    const artifact = latestArtifact(
      await this.runtimeJobs.listArtifacts(runtimeJobId),
      CODE_WRITING_PILOT_PROMPT_PACKAGE_ARTIFACT_TYPE,
    );
    return artifact?.metadata as unknown as CodeWritingPilotPromptPackage | null;
  }

  async readPlanningReadinessSummary(
    runtimeJobId: string,
  ): Promise<CodeWritingPilotPreflightPlan | null> {
    const artifact = latestArtifact(
      await this.runtimeJobs.listArtifacts(runtimeJobId),
      CODE_WRITING_PILOT_PREFLIGHT_PLAN_ARTIFACT_TYPE,
    );
    return artifact?.metadata as unknown as CodeWritingPilotPreflightPlan | null;
  }

  async readBlockers(runtimeJobId: string): Promise<string[]> {
    return (await this.readLatestPilotPlan(runtimeJobId))?.blockingReasons ?? [];
  }

  async readRequiredNextOperatorAction(
    runtimeJobId: string,
  ): Promise<CodeWritingPilotPlan["requiredNextOperatorAction"] | null> {
    return (await this.readLatestPilotPlan(runtimeJobId))?.requiredNextOperatorAction ?? null;
  }

  private async persistPlanningResult(input: CreateCodeWritingPilotPlanResult): Promise<void> {
    await this.recordArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_OBJECTIVE_SELECTION_ARTIFACT_TYPE,
      input.plan.pilotPlanId,
      input.objectiveSelection as unknown as JsonValue,
    );
    await this.recordArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_REQUEST_SKELETON_ARTIFACT_TYPE,
      input.plan.pilotPlanId,
      input.requestSkeleton as unknown as JsonValue,
    );
    await this.recordArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_PROMPT_PACKAGE_ARTIFACT_TYPE,
      input.plan.pilotPlanId,
      input.promptPackage as unknown as JsonValue,
    );
    await this.recordArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_PREFLIGHT_PLAN_ARTIFACT_TYPE,
      input.plan.pilotPlanId,
      input.preflightPlan as unknown as JsonValue,
    );
    const planArtifact = await this.recordArtifact(
      input.plan.runtimeJobId,
      CODE_WRITING_PILOT_PLAN_ARTIFACT_TYPE,
      input.plan.pilotPlanId,
      input.plan as unknown as JsonValue,
    );
    await this.runtimeJobs.recordEvent({
      jobId: input.plan.runtimeJobId,
      eventType: CODE_WRITING_PILOT_PLAN_CREATED_EVENT_TYPE,
      data: {
        artifactId: planArtifact.artifactId,
        pilotPlanId: input.plan.pilotPlanId,
        allowedToCreateLiveRequest: input.plan.allowedToCreateLiveRequest,
        allowedToRunLivePilot: false,
      },
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.plan.runtimeJobId,
      eventType: CODE_WRITING_PILOT_PLANNING_COMPLETED_EVENT_TYPE,
      data: {
        pilotPlanId: input.plan.pilotPlanId,
        requestId: input.requestSkeleton.requestId,
        promptPackageId: input.promptPackage.promptPackageId,
        selectedObjectiveId: input.plan.selectedObjective?.candidateId ?? null,
        liveExecutionEnabled: false,
        commandExecuted: false,
      },
    });
  }

  private async recordArtifact(
    runtimeJobId: string,
    artifactType: string,
    pilotPlanId: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundPlanMetadata(metadata);
    assertJsonByteLength(
      bounded,
      this.maxArtifactMetadataBytes,
      "code-writing pilot plan metadata",
    );
    return this.runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/codex-bridge/code-writing-pilot-plan/${pilotPlanId}/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

export async function writeCodeWritingPilotPlanArtifact(input: {
  result: CreateCodeWritingPilotPlanResult;
  artifactPath?: string;
  cwd?: string;
}): Promise<{ artifactPath: string; pilotPlanId: string }> {
  const artifactPath =
    input.artifactPath ??
    path.resolve(
      input.cwd ?? process.cwd(),
      ".artifacts/execution-platform/code-writing-pilot-plan-8s.json",
    );
  const bounded = boundPlanMetadata(input.result as unknown as JsonValue);
  await writeFile(artifactPath, `${JSON.stringify(bounded, null, 2)}\n`);
  return { artifactPath, pilotPlanId: input.result.plan.pilotPlanId };
}

export const CODEX_BRIDGE_CODE_WRITING_PILOT_PLAN_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_PLAN_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_OBJECTIVE_SELECTION_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_OBJECTIVE_SELECTION_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_REQUEST_SKELETON_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_REQUEST_SKELETON_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_PROMPT_PACKAGE_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_PROMPT_PACKAGE_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_PREFLIGHT_PLAN_ARTIFACT_TYPE =
  CODE_WRITING_PILOT_PREFLIGHT_PLAN_ARTIFACT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_PLAN_CREATED_EVENT_TYPE =
  CODE_WRITING_PILOT_PLAN_CREATED_EVENT_TYPE;
export const CODEX_BRIDGE_CODE_WRITING_PILOT_PLANNING_COMPLETED_EVENT_TYPE =
  CODE_WRITING_PILOT_PLANNING_COMPLETED_EVENT_TYPE;
