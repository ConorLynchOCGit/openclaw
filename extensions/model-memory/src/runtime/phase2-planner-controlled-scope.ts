import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2PlannerReadinessReport,
  type Phase2PlannerCandidate,
  type Phase2PlannerReadableArtifactKind,
  type Phase2PlannerReadinessReport,
} from "./phase2-planner-readiness.ts";

export const PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION =
  "phase2_planner_controlled_scope.v1" as const;
export const PHASE2_PLANNER_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION =
  "phase2_planner_controlled_scope_report.v1" as const;

export type Phase2PlannerControlledScopeDecision =
  | "controlled_scope_observed"
  | "outside_scope_report_only"
  | "rollback_disabled"
  | "blocked";

export type Phase2PlannerControlledScopeConfig = {
  schemaVersion: typeof PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  mode: "explicit_operator_eval";
  enabled: boolean;
  approvedScope: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
  };
  defaultVisibleToOperators: false;
  proactiveSurfacingEnabled: false;
  plannerActionsEnabled: false;
};

export type Phase2PlannerControlledScopePolicy = {
  schemaVersion: typeof PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION;
  policyId: string;
  allowedEvidenceArtifactKinds: Phase2PlannerReadableArtifactKind[];
  allowedSourceProfileIds: SourceProfileId[];
  allowedAuthorityTiers: SourceAuthorityTier[];
  maxArtifactCount: number;
  maxCandidateCount: number;
  maxPlanSteps: number;
  maxEstimatedTokens: number;
  requireExplicitOperatorEvalScope: true;
  excludeInspectionOnly: true;
  blockStale: true;
  blockConflicts: true;
  requireNoDarkDataPass: true;
  prohibitActions: true;
};

export type Phase2PlannerControlledEvidenceBinding = {
  artifactId: string;
  sourceRefIds: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash?: string;
  semanticTruth: false;
  externalImperativeTextHandling: "evidence_not_instruction";
};

export type Phase2PlannerControlledCandidateStep = {
  stepId: string;
  title: string;
  evidenceBindingIds: string[];
  reportOnly: true;
  actionExecution: "none";
  reasonCodes: string[];
};

export type Phase2PlannerControlledCandidatePlan = {
  planId: string;
  candidateId: string;
  sourceArtifactId: string;
  title: string;
  steps: Phase2PlannerControlledCandidateStep[];
  evidenceBindings: Phase2PlannerControlledEvidenceBinding[];
  estimatedTokens: number;
  reportOnly: true;
  actionExecution: "none";
  proactiveSurfacingEnabled: false;
};

export type Phase2PlannerControlledRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED";
  targetMode: "report_only_readiness";
  disablesCandidatePlans: true;
};

export type Phase2PlannerControlledScopeTelemetry = {
  schemaVersion: typeof PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2PlannerControlledScopeDecision;
  matchedScope: boolean;
  generatedPlanIds: string[];
  blockedCandidateIds: string[];
  evidenceArtifactIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  defaultVisibleToOperators: false;
  proactiveSurfacingEnabled: false;
  plannerActionsExecuted: false;
};

export type Phase2PlannerControlledScopeCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2PlannerControlledScopeReport = {
  schemaVersion: typeof PHASE2_PLANNER_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PlannerControlledScopeDecision;
  config: Phase2PlannerControlledScopeConfig;
  policy: Phase2PlannerControlledScopePolicy;
  readinessReportId: string;
  candidatePlans: Phase2PlannerControlledCandidatePlan[];
  checks: Phase2PlannerControlledScopeCheck[];
  rollbackPlan: Phase2PlannerControlledRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2PlannerControlledScopeTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    outsideScopeRunId?: string | null;
    insideScopeRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2PlannerControlledScopeInput = {
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  readinessReport?: Phase2PlannerReadinessReport;
  requestScope?: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
    purpose: "operator_eval" | "ordinary_chat";
  };
  approvedScope?: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
  };
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2PlannerControlledScopeReport["uiEvidence"];
};

export type Phase2PlannerControlledScopeArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

const DEFAULT_SCOPE = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
} as const;

function clone<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoProhibitedKeys(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 planner controlled scope contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoProhibitedKeys(nested, [...pathParts, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 planner controlled scope contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2PlannerControlledScopeCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function scopeMatches(input: Phase2PlannerControlledScopeInput): boolean {
  const request = input.requestScope;
  const approved = input.approvedScope ?? DEFAULT_SCOPE;
  return (
    request?.purpose === "operator_eval" &&
    request.sessionKey === approved.sessionKey &&
    request.operatorId === approved.operatorId &&
    request.projectId === approved.projectId
  );
}

function buildPolicy(input: {
  projectId?: string;
  readinessReport: Phase2PlannerReadinessReport;
}): Phase2PlannerControlledScopePolicy {
  return {
    schemaVersion: PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_controlled_scope_policy",
      targetId: input.projectId ?? "default",
      seed: input.readinessReport.reportId,
    }),
    allowedEvidenceArtifactKinds: [...input.readinessReport.telemetry.readableArtifactKinds],
    allowedSourceProfileIds: [...input.readinessReport.telemetry.sourceProfileIds],
    allowedAuthorityTiers: [...input.readinessReport.telemetry.authorityTiers],
    maxArtifactCount: 24,
    maxCandidateCount: 8,
    maxPlanSteps: 3,
    maxEstimatedTokens: 4_000,
    requireExplicitOperatorEvalScope: true,
    excludeInspectionOnly: true,
    blockStale: true,
    blockConflicts: true,
    requireNoDarkDataPass: true,
    prohibitActions: true,
  };
}

function buildConfig(input: {
  approvedScope: Phase2PlannerControlledScopeConfig["approvedScope"];
  enabled: boolean;
  policy: Phase2PlannerControlledScopePolicy;
}): Phase2PlannerControlledScopeConfig {
  const configSeed = {
    scope: input.approvedScope,
    enabled: input.enabled,
    policyId: input.policy.policyId,
  };
  const configId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_controlled_scope_config",
    targetId: input.approvedScope.projectId,
    seed: configSeed,
  });
  return {
    schemaVersion: PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION,
    configId,
    configHash: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_controlled_scope_config_hash",
      targetId: configId,
      seed: configSeed,
    }),
    mode: "explicit_operator_eval",
    enabled: input.enabled,
    approvedScope: input.approvedScope,
    defaultVisibleToOperators: false,
    proactiveSurfacingEnabled: false,
    plannerActionsEnabled: false,
  };
}

function evidenceBindings(
  candidate: Phase2PlannerCandidate,
): Phase2PlannerControlledEvidenceBinding[] {
  return candidate.evidenceSources.map((source) => ({
    artifactId: source.sourceId,
    sourceRefIds: [...source.sourceRefIds],
    sourceProfileId: source.sourceProfileId,
    authorityTier: source.authorityTier,
    contentHash: source.contentHash,
    proofHash: source.proofHash,
    semanticTruth: false,
    externalImperativeTextHandling: "evidence_not_instruction",
  }));
}

function buildPlan(input: {
  candidate: Phase2PlannerCandidate;
  generatedAt: string;
  maxPlanSteps: number;
}): Phase2PlannerControlledCandidatePlan {
  const bindings = evidenceBindings(input.candidate);
  const planId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_controlled_candidate_plan",
    targetId: input.candidate.candidateId,
    seed: input.generatedAt,
  });
  const steps: Phase2PlannerControlledCandidateStep[] = Array.from(
    { length: Math.min(input.maxPlanSteps, 2) },
    (_, index) => ({
      stepId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_planner_controlled_candidate_step",
        targetId: planId,
        seed: index,
      }),
      title:
        index === 0
          ? "Review bounded evidence and provenance"
          : "Prepare operator-visible report-only recommendation",
      evidenceBindingIds: bindings.map((binding) => binding.artifactId),
      reportOnly: true,
      actionExecution: "none" as const,
      reasonCodes: [...input.candidate.reasonCodes, "report_only_no_action"],
    }),
  );
  return {
    planId,
    candidateId: input.candidate.candidateId,
    sourceArtifactId: input.candidate.artifactId,
    title: `Planner candidate plan for ${input.candidate.kind}`,
    steps,
    evidenceBindings: bindings,
    estimatedTokens: Math.max(128, bindings.length * 256),
    reportOnly: true,
    actionExecution: "none",
    proactiveSurfacingEnabled: false,
  };
}

export async function buildPhase2PlannerControlledScopeReport(
  input: Phase2PlannerControlledScopeInput = {},
): Promise<Phase2PlannerControlledScopeReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const readinessReport =
    input.readinessReport ??
    (await buildPhase2PlannerReadinessReport({
      projectId: input.projectId,
      proofMarker: input.proofMarker,
      now: input.now,
    }));
  const policy = buildPolicy({ projectId: input.projectId, readinessReport });
  const approvedScope = input.approvedScope ?? { ...DEFAULT_SCOPE };
  const killed = readKillSwitch(input.env);
  const matchedScope = scopeMatches(input);
  const enabled = matchedScope && !killed && readinessReport.status === "ready_report_only";
  const config = buildConfig({ approvedScope, enabled, policy });
  const checks: Phase2PlannerControlledScopeCheck[] = [];
  addCheck(
    checks,
    "scope:explicit_operator_eval",
    matchedScope,
    "explicit_operator_eval_scope_required",
  );
  addCheck(
    checks,
    "readiness:ready_report_only",
    readinessReport.status === "ready_report_only",
    "readiness_report_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    readinessReport.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(
    checks,
    "planner:actions_disabled",
    !config.plannerActionsEnabled,
    "planner_actions_disabled",
  );
  addCheck(
    checks,
    "planner:proactive_surfacing_disabled",
    !config.proactiveSurfacingEnabled,
    "proactive_surfacing_disabled",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");

  const eligibleCandidates = readinessReport.candidates
    .filter((candidate) => candidate.reportOnly && candidate.actionExecution === "none")
    .slice(0, policy.maxCandidateCount);
  const candidatePlans = enabled
    ? eligibleCandidates.map((candidate) =>
        buildPlan({ candidate, generatedAt, maxPlanSteps: policy.maxPlanSteps }),
      )
    : [];
  const rollbackPlan: Phase2PlannerControlledRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_controlled_rollback",
      targetId: config.configId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_CONTROLLED_DISABLED",
    targetMode: "report_only_readiness",
    disablesCandidatePlans: true,
  };
  const blockedCandidateIds = enabled
    ? readinessReport.candidates
        .filter((candidate) => !eligibleCandidates.includes(candidate))
        .map((candidate) => candidate.candidateId)
    : [
        ...readinessReport.candidates.map((candidate) => candidate.candidateId),
        ...readinessReport.telemetry.blockedArtifactIds,
      ];
  const decision: Phase2PlannerControlledScopeDecision = killed
    ? "rollback_disabled"
    : matchedScope
      ? candidatePlans.length > 0
        ? "controlled_scope_observed"
        : "blocked"
      : "outside_scope_report_only";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_controlled_scope_report",
    targetId: input.projectId ?? "default",
    seed: {
      generatedAt,
      readinessReportId: readinessReport.reportId,
      decision,
      marker: input.proofMarker ?? null,
    },
  });
  const telemetry: Phase2PlannerControlledScopeTelemetry = {
    schemaVersion: PHASE2_PLANNER_CONTROLLED_SCOPE_SCHEMA_VERSION,
    reportId,
    decision,
    matchedScope,
    generatedPlanIds: uniqueSortedStrings(candidatePlans.map((plan) => plan.planId)),
    blockedCandidateIds: uniqueSortedStrings(blockedCandidateIds),
    evidenceArtifactIds: uniqueSortedStrings(
      candidatePlans.flatMap((plan) => plan.evidenceBindings.map((binding) => binding.artifactId)),
    ),
    sourceProfileIds: uniqueSortedStrings(
      candidatePlans.flatMap((plan) =>
        plan.evidenceBindings.map((binding) => binding.sourceProfileId),
      ),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      candidatePlans.flatMap((plan) =>
        plan.evidenceBindings.map((binding) => binding.authorityTier),
      ),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(
      candidatePlans.flatMap((plan) =>
        plan.evidenceBindings.flatMap((binding) => binding.sourceRefIds),
      ),
    ),
    contentHashes: uniqueSortedStrings(
      candidatePlans.flatMap((plan) => plan.evidenceBindings.map((binding) => binding.contentHash)),
    ),
    proofHashes: uniqueSortedStrings(
      candidatePlans.flatMap((plan) => plan.evidenceBindings.map((binding) => binding.proofHash)),
    ),
    reasonCodes: uniqueSortedStrings(
      checks
        .map((check) => check.reasonCode)
        .concat(candidatePlans.flatMap((plan) => plan.steps.flatMap((step) => step.reasonCodes))),
    ),
    noDarkDataStatus: readinessReport.noDarkDataStatus,
    rollbackObserved: killed || !config.enabled,
    defaultVisibleToOperators: false,
    proactiveSurfacingEnabled: false,
    plannerActionsExecuted: false,
  };
  const report: Phase2PlannerControlledScopeReport = {
    schemaVersion: PHASE2_PLANNER_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    policy,
    readinessReportId: readinessReport.reportId,
    candidatePlans,
    checks,
    rollbackPlan,
    noDarkDataStatus: readinessReport.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2PlannerControlledScopeReport;
}

export function assertPhase2PlannerControlledScopeObserved(
  report: Phase2PlannerControlledScopeReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "controlled_scope_observed") {
    throw new Error(`phase2 planner controlled scope was not observed: ${report.decision}`);
  }
  if (report.candidatePlans.length === 0) {
    throw new Error("phase2 planner controlled scope emitted no candidate plans");
  }
  if (report.telemetry.proactiveSurfacingEnabled || report.telemetry.plannerActionsExecuted) {
    throw new Error("phase2 planner controlled scope attempted proactive/action behavior");
  }
  if (
    report.candidatePlans.some(
      (plan) =>
        !plan.reportOnly || plan.actionExecution !== "none" || plan.proactiveSurfacingEnabled,
    )
  ) {
    throw new Error("phase2 planner controlled scope emitted actionable plans");
  }
}

export async function writePhase2PlannerControlledScopeArtifact(input: {
  report: Phase2PlannerControlledScopeReport;
  artifactDir: string;
}): Promise<Phase2PlannerControlledScopeArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-planner-controlled-scope",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Planner Controlled Scope Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- readinessReportId: ${input.report.readinessReportId}`,
    `- candidatePlans: ${input.report.candidatePlans.length}`,
    `- matchedScope: ${input.report.telemetry.matchedScope}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- proactiveSurfacingEnabled: ${input.report.telemetry.proactiveSurfacingEnabled}`,
    `- plannerActionsExecuted: ${input.report.telemetry.plannerActionsExecuted}`,
    "",
    "## Candidate Plan IDs",
    "",
    ...input.report.telemetry.generatedPlanIds.map((planId) => `- ${planId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 planner controlled scope markdown exceeds byte limit");
  }
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
