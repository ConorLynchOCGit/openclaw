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
  buildPhase2PlannerControlledScopeReport,
  type Phase2PlannerControlledCandidatePlan,
  type Phase2PlannerControlledScopeInput,
  type Phase2PlannerControlledScopeReport,
} from "./phase2-planner-controlled-scope.ts";

export const PHASE2_PLANNER_DEFAULT_PROMOTION_SCHEMA_VERSION =
  "phase2_planner_default_promotion.v1" as const;
export const PHASE2_PLANNER_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION =
  "phase2_planner_default_promotion_report.v1" as const;

export type Phase2PlannerDefaultPromotionDecision =
  | "approved_for_default_operator_reports"
  | "partial_approval"
  | "blocked";

export type Phase2PlannerDefaultPromotionCapabilityDecision = {
  capability: "planner_candidate_reports";
  decision: "approved_for_default_operator_reports" | "blocked";
  reasonCodes: string[];
  defaultVisibleToOperators: boolean;
  proactiveSurfacingEnabled: false;
  plannerActionsEnabled: false;
};

export type Phase2PlannerDefaultPromotionConfig = {
  schemaVersion: typeof PHASE2_PLANNER_DEFAULT_PROMOTION_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  source: "phase2_planner_controlled_scope_proof";
  enabled: boolean;
  defaultVisibleToOperators: boolean;
  proactiveSurfacingEnabled: false;
  plannerActionsEnabled: false;
  controlledScopeReportId?: string;
  proofHashes: string[];
  rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED";
};

export type Phase2PlannerDefaultOperatorReport = {
  operatorReportId: string;
  planId: string;
  candidateId: string;
  title: string;
  evidenceArtifactIds: string[];
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  defaultVisibleToOperators: true;
  userFacingProactiveMessage: false;
  actionExecution: "none";
  evidenceOnly: true;
};

export type Phase2PlannerDefaultPromotionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED";
  targetMode: "controlled_or_readiness_report_only";
  disablesDefaultVisibleReports: true;
};

export type Phase2PlannerDefaultPromotionTelemetry = {
  schemaVersion: typeof PHASE2_PLANNER_DEFAULT_PROMOTION_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2PlannerDefaultPromotionDecision;
  configId: string;
  configHash: string;
  controlledScopeReportId?: string;
  operatorReportIds: string[];
  candidatePlanIds: string[];
  evidenceArtifactIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  defaultVisibleToOperators: boolean;
  proactiveSurfacingEnabled: false;
  plannerActionsExecuted: false;
  rollbackObserved: boolean;
};

export type Phase2PlannerDefaultPromotionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2PlannerDefaultPromotionReport = {
  schemaVersion: typeof PHASE2_PLANNER_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PlannerDefaultPromotionDecision;
  config: Phase2PlannerDefaultPromotionConfig;
  capabilityDecision: Phase2PlannerDefaultPromotionCapabilityDecision;
  controlledScopeReport?: Phase2PlannerControlledScopeReport;
  defaultOperatorReports: Phase2PlannerDefaultOperatorReport[];
  checks: Phase2PlannerDefaultPromotionCheck[];
  rollbackPlan: Phase2PlannerDefaultPromotionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2PlannerDefaultPromotionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    defaultOperatorRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2PlannerDefaultPromotionInput = Omit<
  Phase2PlannerControlledScopeInput,
  "uiEvidence"
> & {
  controlledScopeReport?: Phase2PlannerControlledScopeReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2PlannerDefaultPromotionReport["uiEvidence"];
};

export type Phase2PlannerDefaultPromotionArtifact = {
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
        `phase2 planner default promotion contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 planner default promotion contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2PlannerDefaultPromotionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function proofHashes(report: Phase2PlannerControlledScopeReport | undefined): string[] {
  if (!report) {
    return [];
  }
  return uniqueSortedStrings(report.telemetry.proofHashes.concat(report.telemetry.contentHashes));
}

function buildConfig(input: {
  generatedAt: string;
  enabled: boolean;
  report?: Phase2PlannerControlledScopeReport;
}): Phase2PlannerDefaultPromotionConfig {
  const seed = {
    generatedAt: input.generatedAt,
    enabled: input.enabled,
    controlledScopeReportId: input.report?.reportId ?? null,
  };
  const configId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_default_promotion_config",
    targetId: input.report?.config.approvedScope.projectId ?? "default",
    seed,
  });
  return {
    schemaVersion: PHASE2_PLANNER_DEFAULT_PROMOTION_SCHEMA_VERSION,
    configId,
    configHash: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_default_promotion_config_hash",
      targetId: configId,
      seed,
    }),
    source: "phase2_planner_controlled_scope_proof",
    enabled: input.enabled,
    defaultVisibleToOperators: input.enabled,
    proactiveSurfacingEnabled: false,
    plannerActionsEnabled: false,
    controlledScopeReportId: input.report?.reportId,
    proofHashes: proofHashes(input.report),
    rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED",
  };
}

function operatorReportFromPlan(input: {
  plan: Phase2PlannerControlledCandidatePlan;
  generatedAt: string;
}): Phase2PlannerDefaultOperatorReport {
  const evidenceBindings = input.plan.evidenceBindings;
  return {
    operatorReportId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_default_operator_report",
      targetId: input.plan.planId,
      seed: input.generatedAt,
    }),
    planId: input.plan.planId,
    candidateId: input.plan.candidateId,
    title: input.plan.title,
    evidenceArtifactIds: uniqueSortedStrings(evidenceBindings.map((binding) => binding.artifactId)),
    sourceRefIds: uniqueSortedStrings(evidenceBindings.flatMap((binding) => binding.sourceRefIds)),
    sourceProfileIds: uniqueSortedStrings(
      evidenceBindings.map((binding) => binding.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      evidenceBindings.map((binding) => binding.authorityTier),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(evidenceBindings.map((binding) => binding.contentHash)),
    proofHashes: uniqueSortedStrings(evidenceBindings.map((binding) => binding.proofHash)),
    defaultVisibleToOperators: true,
    userFacingProactiveMessage: false,
    actionExecution: "none",
    evidenceOnly: true,
  };
}

export async function buildPhase2PlannerDefaultPromotionReport(
  input: Phase2PlannerDefaultPromotionInput = {},
): Promise<Phase2PlannerDefaultPromotionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const controlledScopeReport =
    input.controlledScopeReport === null
      ? undefined
      : (input.controlledScopeReport ??
        (await buildPhase2PlannerControlledScopeReport({
          ...input,
          uiEvidence: undefined,
        })));
  const checks: Phase2PlannerDefaultPromotionCheck[] = [];
  addCheck(
    checks,
    "controlled_scope:proof_present",
    Boolean(controlledScopeReport),
    "controlled_scope_proof_required",
  );
  addCheck(
    checks,
    "controlled_scope:observed",
    controlledScopeReport?.decision === "controlled_scope_observed",
    "controlled_scope_observed_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    controlledScopeReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(
    checks,
    "planner:actions_disabled",
    controlledScopeReport?.telemetry.plannerActionsExecuted === false,
    "planner_actions_disabled",
  );
  addCheck(
    checks,
    "planner:proactive_surfacing_disabled",
    controlledScopeReport?.telemetry.proactiveSurfacingEnabled === false,
    "proactive_surfacing_disabled",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");

  const plans = controlledScopeReport?.candidatePlans ?? [];
  addCheck(
    checks,
    "candidate_plans:report_only",
    plans.every((plan) => plan.reportOnly && plan.actionExecution === "none"),
    "candidate_plans_report_only",
  );

  const eligible =
    !killed &&
    controlledScopeReport?.decision === "controlled_scope_observed" &&
    controlledScopeReport.noDarkDataStatus === "pass" &&
    plans.length > 0 &&
    plans.every((plan) => plan.reportOnly && plan.actionExecution === "none") &&
    !controlledScopeReport.telemetry.proactiveSurfacingEnabled &&
    !controlledScopeReport.telemetry.plannerActionsExecuted;
  const config = buildConfig({ generatedAt, enabled: eligible, report: controlledScopeReport });
  const defaultOperatorReports = eligible
    ? plans.map((plan) => operatorReportFromPlan({ plan, generatedAt }))
    : [];
  const decision: Phase2PlannerDefaultPromotionDecision = eligible
    ? "approved_for_default_operator_reports"
    : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_default_promotion_report",
    targetId: controlledScopeReport?.config.approvedScope.projectId ?? "default",
    seed: {
      generatedAt,
      controlledScopeReportId: controlledScopeReport?.reportId ?? null,
      decision,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2PlannerDefaultPromotionRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_default_promotion_rollback",
      targetId: config.configId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PLANNER_DEFAULT_REPORTS_DISABLED",
    targetMode: "controlled_or_readiness_report_only",
    disablesDefaultVisibleReports: true,
  };
  const telemetry: Phase2PlannerDefaultPromotionTelemetry = {
    schemaVersion: PHASE2_PLANNER_DEFAULT_PROMOTION_SCHEMA_VERSION,
    reportId,
    decision,
    configId: config.configId,
    configHash: config.configHash,
    controlledScopeReportId: controlledScopeReport?.reportId,
    operatorReportIds: uniqueSortedStrings(
      defaultOperatorReports.map((report) => report.operatorReportId),
    ),
    candidatePlanIds: uniqueSortedStrings(defaultOperatorReports.map((report) => report.planId)),
    evidenceArtifactIds: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.evidenceArtifactIds),
    ),
    sourceProfileIds: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.authorityTiers),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.sourceRefIds),
    ),
    contentHashes: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.contentHashes),
    ),
    proofHashes: uniqueSortedStrings(
      defaultOperatorReports.flatMap((report) => report.proofHashes),
    ),
    reasonCodes: uniqueSortedStrings(checks.map((check) => check.reasonCode)),
    noDarkDataStatus: controlledScopeReport?.noDarkDataStatus ?? "fail",
    defaultVisibleToOperators: config.defaultVisibleToOperators,
    proactiveSurfacingEnabled: false,
    plannerActionsExecuted: false,
    rollbackObserved: killed || !config.enabled,
  };
  const report: Phase2PlannerDefaultPromotionReport = {
    schemaVersion: PHASE2_PLANNER_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    capabilityDecision: {
      capability: "planner_candidate_reports",
      decision,
      reasonCodes: telemetry.reasonCodes,
      defaultVisibleToOperators: config.defaultVisibleToOperators,
      proactiveSurfacingEnabled: false,
      plannerActionsEnabled: false,
    },
    controlledScopeReport,
    defaultOperatorReports,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2PlannerDefaultPromotionReport;
}

export function assertPhase2PlannerDefaultPromotionObserved(
  report: Phase2PlannerDefaultPromotionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_default_operator_reports") {
    throw new Error(`phase2 planner default promotion was not observed: ${report.decision}`);
  }
  if (report.defaultOperatorReports.length === 0) {
    throw new Error("phase2 planner default promotion emitted no operator reports");
  }
  if (report.telemetry.proactiveSurfacingEnabled || report.telemetry.plannerActionsExecuted) {
    throw new Error("phase2 planner default promotion attempted proactive/action behavior");
  }
}

export async function writePhase2PlannerDefaultPromotionArtifact(input: {
  report: Phase2PlannerDefaultPromotionReport;
  artifactDir: string;
}): Promise<Phase2PlannerDefaultPromotionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-planner-default-promotion",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Planner Default Promotion Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- controlledScopeReportId: ${input.report.controlledScopeReport?.reportId ?? "none"}`,
    `- defaultOperatorReports: ${input.report.defaultOperatorReports.length}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- defaultVisibleToOperators: ${input.report.telemetry.defaultVisibleToOperators}`,
    `- proactiveSurfacingEnabled: ${input.report.telemetry.proactiveSurfacingEnabled}`,
    `- plannerActionsExecuted: ${input.report.telemetry.plannerActionsExecuted}`,
    "",
    "## Operator Report IDs",
    "",
    ...input.report.telemetry.operatorReportIds.map((reportId) => `- ${reportId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 planner default promotion markdown exceeds byte limit");
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
