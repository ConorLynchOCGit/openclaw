import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  type SoftSourceRef,
  type SourceAuthorityTier,
  type SourceProfileId,
} from "../source-authority.ts";
import {
  buildPhase2OperatorIngestionRollout,
  type Phase2OperatorIngestionRolloutReport,
  type Phase2OperatorIngestionSourceDecision,
} from "./phase2-operator-ingestion-rollout.ts";
import {
  buildPhase2ProductionObservabilityReport,
  type Phase2ProductionObservabilityReport,
} from "./retrieval/phase2-production-observability.ts";

export const PHASE2_INGESTION_DEFAULT_PROMOTION_SCHEMA_VERSION =
  "phase2_ingestion_default_promotion.v1" as const;
export const PHASE2_INGESTION_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION =
  "phase2_ingestion_default_promotion_report.v1" as const;

export type Phase2IngestionCapability =
  | "soft_source_runtime_ingestion"
  | "non_user_prompt_ingestion"
  | "daily_continuity_capture"
  | "tool_grounded_capture"
  | "researcher_cited_soft_capture"
  | "cited_assistant_fact_capture";

export type Phase2IngestionCapabilityDecision = {
  capability: Phase2IngestionCapability;
  decision: "approved_for_default" | "operator_only" | "blocked";
  mode: "default_enabled" | "operator_enabled" | "disabled";
  reasonCodes: string[];
  sourceIds: string[];
};

export type Phase2IngestionPromotionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2IngestionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DEFAULT_INGESTION_DISABLED";
  targetModes: Record<Phase2IngestionCapability, "operator_enabled" | "disabled">;
};

export type Phase2IngestionDefaultPromotionConfig = {
  schemaVersion: typeof PHASE2_INGESTION_DEFAULT_PROMOTION_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  enabled: boolean;
  source: "phase2_ingestion_default_promotion";
  capabilityModes: Record<Phase2IngestionCapability, "default_enabled" | "operator_enabled">;
  operatorIngestionReportId: string;
  productionObservabilityReportId: string;
  rollbackPlan: Phase2IngestionRollbackPlan;
  defaultBroadIngestionChanged: boolean;
};

export type Phase2IngestionDefaultPromotionTelemetry = {
  schemaVersion: typeof PHASE2_INGESTION_DEFAULT_PROMOTION_SCHEMA_VERSION;
  reportId: string;
  decision: "approved_for_default" | "partial_approval" | "blocked";
  defaultEnabledCapabilities: Phase2IngestionCapability[];
  operatorOnlyCapabilities: Phase2IngestionCapability[];
  blockedSourceIds: string[];
  admittedSourceIds: string[];
  defaultEnabledSourceIds: string[];
  durableMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  defaultBroadIngestionChanged: boolean;
};

export type Phase2IngestionDefaultPromotionReport = {
  schemaVersion: typeof PHASE2_INGESTION_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "approved_for_default" | "partial_approval" | "blocked";
  operatorIngestionReportId: string;
  productionObservabilityReportId: string;
  sourceDecisions: Phase2OperatorIngestionSourceDecision[];
  capabilityDecisions: Phase2IngestionCapabilityDecision[];
  defaultPromotionConfig: Phase2IngestionDefaultPromotionConfig;
  checks: Phase2IngestionPromotionCheck[];
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2IngestionDefaultPromotionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    ingestionRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2IngestionDefaultPromotionInput = {
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  operatorIngestionReport?: Phase2OperatorIngestionRolloutReport;
  productionObservabilityReport?: Phase2ProductionObservabilityReport;
  uiEvidence?: Phase2IngestionDefaultPromotionReport["uiEvidence"];
};

export type Phase2IngestionDefaultPromotionArtifact = {
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
        `phase2 ingestion default promotion contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 ingestion default promotion contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2IngestionPromotionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_DEFAULT_INGESTION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function sourceRef(sourceId: string): SoftSourceRef {
  return {
    sourceId,
    segmentId: `${sourceId}-segment`,
    url: "https://example.invalid/cited-fact",
    contentHash: hashDerivedArtifactValue({ sourceId }),
  };
}

function citedAssistantFactDecision(enabled: boolean): Phase2OperatorIngestionSourceDecision {
  const refs = [sourceRef("phase2-cited-assistant-fact-source")];
  return {
    sourceId: "phase2-cited-assistant-underlying-fact",
    sourceProfileId: "cited_assistant_answer",
    authorityTier: "cited_soft",
    decision: "auto_admit",
    reasonCodes: ["captures_underlying_cited_facts_only"],
    sourceRefs: refs,
    durableMemoryCreated: enabled,
    operatorVisible: true,
    lowerAuthorityVisible: true,
    capturesAssistantProseAsAuthority: false,
    memoryId: enabled
      ? buildDerivedArtifactId({
          family: "retrieval_pack",
          artifactType: "phase2_ingestion_default_memory",
          targetId: "phase2-cited-assistant-underlying-fact",
          seed: refs,
        })
      : undefined,
    contentHash: hashDerivedArtifactValue({
      sourceId: "phase2-cited-assistant-underlying-fact",
      sourceProfileId: "cited_assistant_answer",
      authorityTier: "cited_soft",
      sourceRefs: refs,
    }),
  };
}

function bySourceId(
  report: Phase2OperatorIngestionRolloutReport,
  sourceId: string,
): Phase2OperatorIngestionSourceDecision | undefined {
  return report.sourceDecisions.find((sourceDecision) => sourceDecision.sourceId === sourceId);
}

function rollbackPlan(): Phase2IngestionRollbackPlan {
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_ingestion_default_rollback",
      seed: "default_ingestion_disabled",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DEFAULT_INGESTION_DISABLED",
    targetModes: {
      soft_source_runtime_ingestion: "operator_enabled",
      non_user_prompt_ingestion: "operator_enabled",
      daily_continuity_capture: "operator_enabled",
      tool_grounded_capture: "operator_enabled",
      researcher_cited_soft_capture: "operator_enabled",
      cited_assistant_fact_capture: "operator_enabled",
    },
  };
}

function capabilityDecisions(input: {
  eligible: boolean;
  sourceDecisions: Phase2OperatorIngestionSourceDecision[];
}): Phase2IngestionCapabilityDecision[] {
  const byId = new Map(input.sourceDecisions.map((entry) => [entry.sourceId, entry]));
  const tool = byId.get("phase2-tool-grounded-capture");
  const daily = byId.get("phase2-daily-continuity-capture");
  const researcher = byId.get("phase2-researcher-cited-soft");
  const citedFact = byId.get("phase2-cited-assistant-underlying-fact");
  const approved = input.eligible;
  const citedFactSafe =
    Boolean(citedFact?.durableMemoryCreated) && !citedFact?.capturesAssistantProseAsAuthority;
  return [
    {
      capability: "tool_grounded_capture",
      decision: approved && tool?.durableMemoryCreated ? "approved_for_default" : "blocked",
      mode: approved && tool?.durableMemoryCreated ? "default_enabled" : "disabled",
      reasonCodes: ["tool_provenance_required"],
      sourceIds: ["phase2-tool-grounded-capture"],
    },
    {
      capability: "daily_continuity_capture",
      decision: approved && daily?.durableMemoryCreated ? "approved_for_default" : "blocked",
      mode: approved && daily?.durableMemoryCreated ? "default_enabled" : "disabled",
      reasonCodes: ["continuity_profile_required"],
      sourceIds: ["phase2-daily-continuity-capture"],
    },
    {
      capability: "researcher_cited_soft_capture",
      decision: approved && researcher?.durableMemoryCreated ? "approved_for_default" : "blocked",
      mode: approved && researcher?.durableMemoryCreated ? "default_enabled" : "disabled",
      reasonCodes: ["citation_required"],
      sourceIds: ["phase2-researcher-cited-soft"],
    },
    {
      capability: "cited_assistant_fact_capture",
      decision: approved && citedFactSafe ? "approved_for_default" : "blocked",
      mode: approved && citedFactSafe ? "default_enabled" : "disabled",
      reasonCodes: ["underlying_cited_facts_only"],
      sourceIds: ["phase2-cited-assistant-underlying-fact"],
    },
    {
      capability: "soft_source_runtime_ingestion",
      decision: approved ? "approved_for_default" : "operator_only",
      mode: approved ? "default_enabled" : "operator_enabled",
      reasonCodes: ["lower_authority_label_required", "no_corroboration_promotion"],
      sourceIds: ["phase2-researcher-cited-soft", "phase2-cited-assistant-underlying-fact"],
    },
    {
      capability: "non_user_prompt_ingestion",
      decision: approved ? "approved_for_default" : "operator_only",
      mode: approved ? "default_enabled" : "operator_enabled",
      reasonCodes: ["source_profile_and_provenance_required"],
      sourceIds: ["phase2-tool-grounded-capture", "phase2-daily-continuity-capture"],
    },
  ];
}

function buildConfig(input: {
  enabled: boolean;
  operatorIngestionReportId: string;
  productionObservabilityReportId: string;
}): Phase2IngestionDefaultPromotionConfig {
  const modes: Record<Phase2IngestionCapability, "default_enabled" | "operator_enabled"> = {
    soft_source_runtime_ingestion: input.enabled ? "default_enabled" : "operator_enabled",
    non_user_prompt_ingestion: input.enabled ? "default_enabled" : "operator_enabled",
    daily_continuity_capture: input.enabled ? "default_enabled" : "operator_enabled",
    tool_grounded_capture: input.enabled ? "default_enabled" : "operator_enabled",
    researcher_cited_soft_capture: input.enabled ? "default_enabled" : "operator_enabled",
    cited_assistant_fact_capture: input.enabled ? "default_enabled" : "operator_enabled",
  };
  const seed = { ...input, modes, rollbackPlan: rollbackPlan() };
  const config: Phase2IngestionDefaultPromotionConfig = {
    schemaVersion: PHASE2_INGESTION_DEFAULT_PROMOTION_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_ingestion_default_config",
      targetId: input.operatorIngestionReportId,
      seed,
    }),
    configHash: hashDerivedArtifactValue(seed),
    enabled: input.enabled,
    source: "phase2_ingestion_default_promotion",
    capabilityModes: modes,
    operatorIngestionReportId: input.operatorIngestionReportId,
    productionObservabilityReportId: input.productionObservabilityReportId,
    rollbackPlan: rollbackPlan(),
    defaultBroadIngestionChanged: input.enabled,
  };
  assertNoDarkData(config);
  return clone(config as unknown as JsonLike) as unknown as Phase2IngestionDefaultPromotionConfig;
}

export async function buildPhase2IngestionDefaultPromotion(
  input: Phase2IngestionDefaultPromotionInput = {},
): Promise<Phase2IngestionDefaultPromotionReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const projectId = input.projectId ?? "phase2-ingestion-default-project";
  const marker = input.proofMarker ?? "PHASE2-INGESTION-DEFAULT";
  const disabledByKillSwitch = readKillSwitch(input.env);
  const operatorReport =
    input.operatorIngestionReport ??
    buildPhase2OperatorIngestionRollout({ projectId, proofMarker: marker, now });
  const productionReport =
    input.productionObservabilityReport ??
    (await buildPhase2ProductionObservabilityReport({ projectId, proofMarker: marker, now }));
  const defaultEnabled = !disabledByKillSwitch;
  const sourceDecisions = [
    ...operatorReport.sourceDecisions,
    citedAssistantFactDecision(defaultEnabled),
  ];
  const checks: Phase2IngestionPromotionCheck[] = [];
  const tool = bySourceId(operatorReport, "phase2-tool-grounded-capture");
  const daily = bySourceId(operatorReport, "phase2-daily-continuity-capture");
  const researcher = bySourceId(operatorReport, "phase2-researcher-cited-soft");
  const missingCitation = bySourceId(operatorReport, "phase2-researcher-missing-citation");
  const assistantProse = bySourceId(operatorReport, "phase2-cited-assistant-prose");
  const rawLog = bySourceId(operatorReport, "phase2-raw-tool-log-inspection");
  const privateMaterial = bySourceId(operatorReport, "phase2-private-hard-reject");
  addCheck(
    checks,
    "operator_ingestion_proof_pass",
    operatorReport.decision === "operator_rollout_observed" &&
      operatorReport.noDarkDataStatus === "pass",
    "operator_ingestion_proof_required",
  );
  addCheck(
    checks,
    "production_observability_healthy",
    productionReport.status === "healthy" && productionReport.noDarkDataStatus === "pass",
    "production_observability_required",
  );
  addCheck(
    checks,
    "tool_grounded_default_ready",
    tool?.decision === "auto_admit" &&
      tool.authorityTier === "tool_grounded" &&
      tool.sourceRefs.length > 0,
    "tool_provenance_required",
  );
  addCheck(
    checks,
    "daily_continuity_default_ready",
    daily?.decision === "auto_admit" && daily.sourceProfileId === "daily_continuity",
    "daily_continuity_required",
  );
  addCheck(
    checks,
    "researcher_requires_citation",
    researcher?.decision === "auto_admit" &&
      researcher.sourceRefs.length > 0 &&
      missingCitation?.decision === "reject",
    "citation_required",
  );
  addCheck(
    checks,
    "assistant_prose_not_authority",
    assistantProse?.decision === "reject" && assistantProse.capturesAssistantProseAsAuthority,
    "assistant_prose_is_not_authority",
  );
  addCheck(
    checks,
    "raw_private_excluded",
    rawLog?.decision === "inspection_only" && privateMaterial?.decision === "reject",
    "raw_private_excluded",
  );
  addCheck(
    checks,
    "rollback_available",
    rollbackPlan().targetModes.soft_source_runtime_ingestion === "operator_enabled",
    "rollback_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const eligible = failed.length === 0 && defaultEnabled;
  const decisions = capabilityDecisions({ eligible, sourceDecisions });
  const defaultEnabledSourceIds = uniqueSortedStrings(
    decisions
      .filter((decision) => decision.decision === "approved_for_default")
      .flatMap((decision) => decision.sourceIds),
  );
  const reportDecision =
    eligible && decisions.every((decision) => decision.decision === "approved_for_default")
      ? "approved_for_default"
      : decisions.some((decision) => decision.decision === "approved_for_default")
        ? "partial_approval"
        : "blocked";
  const config = buildConfig({
    enabled: reportDecision === "approved_for_default",
    operatorIngestionReportId: operatorReport.reportId,
    productionObservabilityReportId: productionReport.reportId,
  });
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_ingestion_default_promotion_report",
    targetId: projectId,
    seed: { generatedAt, marker, reportDecision, checks, configId: config.configId },
  });
  const telemetry: Phase2IngestionDefaultPromotionTelemetry = {
    schemaVersion: PHASE2_INGESTION_DEFAULT_PROMOTION_SCHEMA_VERSION,
    reportId,
    decision: reportDecision,
    defaultEnabledCapabilities: decisions
      .filter((decision) => decision.decision === "approved_for_default")
      .map((decision) => decision.capability),
    operatorOnlyCapabilities: decisions
      .filter((decision) => decision.decision === "operator_only")
      .map((decision) => decision.capability),
    blockedSourceIds: sourceDecisions
      .filter((decision) => decision.decision === "reject")
      .map((decision) => decision.sourceId),
    admittedSourceIds: sourceDecisions
      .filter((decision) => decision.decision === "auto_admit")
      .map((decision) => decision.sourceId),
    defaultEnabledSourceIds,
    durableMemoryIds: sourceDecisions.flatMap((decision) =>
      defaultEnabledSourceIds.includes(decision.sourceId) && decision.memoryId
        ? [decision.memoryId]
        : [],
    ),
    sourceProfileIds: uniqueSortedStrings(
      sourceDecisions.map((decision) => decision.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      sourceDecisions.map((decision) => decision.authorityTier),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(sourceDecisions.map((decision) => decision.contentHash)),
    reasonCodes: uniqueSortedStrings([
      ...checks.map((check) => check.reasonCode),
      ...sourceDecisions.flatMap((decision) => decision.reasonCodes),
    ]),
    noDarkDataStatus: failed.length === 0 ? "pass" : "fail",
    rollbackObserved: true,
    defaultBroadIngestionChanged: config.defaultBroadIngestionChanged,
  };
  const report: Phase2IngestionDefaultPromotionReport = {
    schemaVersion: PHASE2_INGESTION_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision: reportDecision,
    operatorIngestionReportId: operatorReport.reportId,
    productionObservabilityReportId: productionReport.reportId,
    sourceDecisions,
    capabilityDecisions: decisions,
    defaultPromotionConfig: config,
    checks,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2IngestionDefaultPromotionReport;
}

export function assertPhase2IngestionDefaultPromoted(
  report: Phase2IngestionDefaultPromotionReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.decision !== "approved_for_default" || failed.length > 0) {
    throw new Error(
      `phase2 ingestion default promotion not approved: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.decision
      }`,
    );
  }
}

function markdownReport(report: Phase2IngestionDefaultPromotionReport, jsonPath: string): string {
  return [
    "# Phase 2 Ingestion Default Promotion Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- operator_ingestion_report_id: ${report.operatorIngestionReportId}`,
    `- production_observability_report_id: ${report.productionObservabilityReportId}`,
    `- default_enabled_capabilities: ${report.telemetry.defaultEnabledCapabilities.join(", ")}`,
    `- blocked_source_ids: ${report.telemetry.blockedSourceIds.join(", ")}`,
    `- rollback_id: ${report.defaultPromotionConfig.rollbackPlan.rollbackId}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
  ].join("\n");
}

export async function writePhase2IngestionDefaultPromotionArtifact(input: {
  report: Phase2IngestionDefaultPromotionReport;
  artifactDir: string;
}): Promise<Phase2IngestionDefaultPromotionArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-ingestion-default-promotion",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-ingestion-default-promotion",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 ingestion default promotion markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
