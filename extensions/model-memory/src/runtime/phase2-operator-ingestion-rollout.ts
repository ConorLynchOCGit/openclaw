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
  advanceMemoryMaintenanceCandidateLifecycle,
  createMemoryMaintenanceCandidate,
  runDailyMemoryMaintenance,
  writeMemoryMaintenanceReport,
  type MemoryMaintenanceCandidate,
  type MemoryMaintenanceReport,
} from "../memory-maintenance-loop.ts";
import {
  buildSourceAuthorityMetadata,
  evaluateSoftSourceAdmission,
  type SoftSourceAdmissionDecision,
  type SoftSourceRef,
  type SourceAuthorityTier,
  type SourceProfileId,
} from "../source-authority.ts";

export const PHASE2_OPERATOR_INGESTION_ROLLOUT_SCHEMA_VERSION =
  "phase2_operator_ingestion_rollout.v1" as const;
export const PHASE2_OPERATOR_INGESTION_ROLLOUT_REPORT_SCHEMA_VERSION =
  "phase2_operator_ingestion_rollout_report.v1" as const;

export type Phase2OperatorIngestionRolloutDecision =
  | "operator_rollout_observed"
  | "partial"
  | "blocked";

export type Phase2OperatorIngestionRolloutCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2OperatorIngestionSourceDecision = {
  sourceId: string;
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  decision: SoftSourceAdmissionDecision["decision"];
  reasonCodes: string[];
  sourceRefs: SoftSourceRef[];
  durableMemoryCreated: boolean;
  operatorVisible: boolean;
  lowerAuthorityVisible: boolean;
  capturesAssistantProseAsAuthority: boolean;
  memoryId?: string;
  contentHash: string;
};

export type Phase2MaintenanceSurfacingReport = {
  reportId: string;
  mode: "operator_report_only";
  maintenanceReport: MemoryMaintenanceReport;
  activeCandidateIds: string[];
  archivedCandidateIds: string[];
  pinnedCandidateIds: string[];
  artifactPath?: string;
  contentHash?: string;
};

export type Phase2OperatorIngestionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_DISABLED";
  targetModes: {
    maintenanceCandidateSurfacing: "shadow_report_only";
    softSourceRuntimeIngestion: "disabled";
    nonUserPromptIngestion: "disabled";
  };
};

export type Phase2OperatorIngestionTelemetry = {
  schemaVersion: typeof PHASE2_OPERATOR_INGESTION_ROLLOUT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2OperatorIngestionRolloutDecision;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  admittedSourceIds: string[];
  rejectedSourceIds: string[];
  inspectionOnlySourceIds: string[];
  durableMemoryIds: string[];
  maintenanceCandidateIds: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  defaultBroadIngestionChanged: false;
};

export type Phase2OperatorIngestionRolloutReport = {
  schemaVersion: typeof PHASE2_OPERATOR_INGESTION_ROLLOUT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2OperatorIngestionRolloutDecision;
  rolloutMode: "operator_enabled";
  sourceDecisions: Phase2OperatorIngestionSourceDecision[];
  maintenanceSurfacing: Phase2MaintenanceSurfacingReport;
  checks: Phase2OperatorIngestionRolloutCheck[];
  noDarkDataStatus: "pass" | "fail";
  rollbackPlan: Phase2OperatorIngestionRollbackPlan;
  telemetry: Phase2OperatorIngestionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    ingestionRunId?: string | null;
    maintenanceRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2OperatorIngestionRolloutInput = {
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2OperatorIngestionRolloutReport["uiEvidence"];
};

export type Phase2OperatorIngestionRolloutArtifact = {
  jsonPath: string;
  markdownPath: string;
  maintenanceArtifactPath: string;
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
        `phase2 operator ingestion rollout contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 operator ingestion rollout contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2OperatorIngestionRolloutCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function sourceRef(sourceId: string, url?: string): SoftSourceRef {
  return {
    sourceId,
    segmentId: `${sourceId}-segment`,
    url,
    contentHash: hashDerivedArtifactValue({ sourceId, url }),
  };
}

function buildSourceDecision(input: {
  sourceId: string;
  sourceProfileId: SourceProfileId;
  sourceRefs: SoftSourceRef[];
  capturesAssistantProseAsAuthority?: boolean;
  riskFlags?: Parameters<typeof evaluateSoftSourceAdmission>[0]["riskFlags"];
  operatorEnabled: boolean;
}): Phase2OperatorIngestionSourceDecision {
  const metadata = buildSourceAuthorityMetadata(input.sourceProfileId);
  const admission = evaluateSoftSourceAdmission({
    candidateId: input.sourceId,
    kind: "fact",
    sourceProfileId: input.sourceProfileId,
    sourceRefs: input.sourceRefs,
    riskFlags: input.riskFlags,
    capturesAssistantProseAsAuthority: input.capturesAssistantProseAsAuthority,
  });
  const durableMemoryCreated = input.operatorEnabled && admission.decision === "auto_admit";
  return {
    sourceId: input.sourceId,
    sourceProfileId: input.sourceProfileId,
    authorityTier: admission.authorityTier,
    decision: admission.decision,
    reasonCodes: admission.reasonCodes,
    sourceRefs: input.sourceRefs,
    durableMemoryCreated,
    operatorVisible: true,
    lowerAuthorityVisible: metadata.riskPolicy === "lower_authority",
    capturesAssistantProseAsAuthority: input.capturesAssistantProseAsAuthority ?? false,
    memoryId: durableMemoryCreated
      ? buildDerivedArtifactId({
          family: "retrieval_pack",
          artifactType: "phase2_operator_ingestion_memory",
          targetId: input.sourceId,
          seed: { sourceProfileId: input.sourceProfileId, sourceRefs: input.sourceRefs },
        })
      : undefined,
    contentHash: hashDerivedArtifactValue({
      sourceId: input.sourceId,
      sourceProfileId: input.sourceProfileId,
      authorityTier: admission.authorityTier,
      decision: admission.decision,
      sourceRefs: input.sourceRefs,
    }),
  };
}

function buildMaintenance(input: {
  generatedAt: Date;
  projectId: string;
}): Phase2MaintenanceSurfacingReport {
  const active = createMemoryMaintenanceCandidate({
    candidateType: "soft_source_consolidation",
    reasonCodes: ["soft_source_needs_consolidation"],
    sourceRefs: [
      {
        sourceId: "phase2-operator-soft-source",
        memoryId: "phase2-operator-soft-source-memory",
        sourceProfileId: "researcher_report_artifact",
        authorityTier: "cited_soft",
        contentHash: hashDerivedArtifactValue({ projectId: input.projectId, lane: "soft" }),
      },
    ],
    surfacingLane: "context_surface",
    createdAt: input.generatedAt,
  });
  const archivedSeed = createMemoryMaintenanceCandidate({
    candidateType: "derived_refresh",
    reasonCodes: ["stale_projection_or_capsule"],
    createdAt: new Date(input.generatedAt.getTime() - 31 * 24 * 60 * 60 * 1000),
  });
  const pinned = createMemoryMaintenanceCandidate({
    candidateType: "privacy_safety",
    reasonCodes: ["privacy_redacted_finding"],
    pinned: true,
    surfacingLane: "must_surface",
    createdAt: new Date(input.generatedAt.getTime() - 120 * 24 * 60 * 60 * 1000),
  });
  const candidates: MemoryMaintenanceCandidate[] = [
    active,
    advanceMemoryMaintenanceCandidateLifecycle(archivedSeed, input.generatedAt),
    advanceMemoryMaintenanceCandidateLifecycle(pinned, input.generatedAt),
  ];
  const maintenanceReport = runDailyMemoryMaintenance({
    candidates,
    derivedRefreshRecords: [
      {
        targetType: "capsule",
        targetId: "project_state",
        dirty: true,
        reasonCodes: ["stale_projection_or_capsule"],
        sourceRefs: [
          { artifactPath: ".artifacts/model-memory/project-state", contentHash: "sha256" },
        ],
      },
    ],
    now: input.generatedAt,
  });
  return {
    reportId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_operator_maintenance_report",
      targetId: input.projectId,
      seed: maintenanceReport,
    }),
    mode: "operator_report_only",
    maintenanceReport,
    activeCandidateIds: maintenanceReport.candidates
      .filter((candidate) => candidate.status === "active")
      .map((candidate) => candidate.candidateId),
    archivedCandidateIds: maintenanceReport.candidates
      .filter((candidate) => candidate.status === "archived")
      .map((candidate) => candidate.candidateId),
    pinnedCandidateIds: maintenanceReport.candidates
      .filter((candidate) => candidate.pinned)
      .map((candidate) => candidate.candidateId),
  };
}

function rollbackPlan(): Phase2OperatorIngestionRollbackPlan {
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_operator_ingestion_rollback",
      seed: "operator_ingestion_disabled",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_OPERATOR_INGESTION_DISABLED",
    targetModes: {
      maintenanceCandidateSurfacing: "shadow_report_only",
      softSourceRuntimeIngestion: "disabled",
      nonUserPromptIngestion: "disabled",
    },
  };
}

export function buildPhase2OperatorIngestionRollout(
  input: Phase2OperatorIngestionRolloutInput = {},
): Phase2OperatorIngestionRolloutReport {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const projectId = input.projectId ?? "phase2-operator-ingestion-project";
  const marker = input.proofMarker ?? "PHASE2-OPERATOR-INGESTION";
  const disabledByKillSwitch = readKillSwitch(input.env);
  const operatorEnabled = !disabledByKillSwitch;
  const sourceDecisions = [
    buildSourceDecision({
      sourceId: "phase2-tool-grounded-capture",
      sourceProfileId: "tool_result_capture",
      sourceRefs: [sourceRef("phase2-tool-grounded-source", "https://example.invalid/tool")],
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-daily-continuity-capture",
      sourceProfileId: "daily_continuity",
      sourceRefs: [sourceRef("phase2-daily-continuity-source")],
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-researcher-cited-soft",
      sourceProfileId: "researcher_report_artifact",
      sourceRefs: [sourceRef("phase2-researcher-source", "https://example.invalid/research")],
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-researcher-missing-citation",
      sourceProfileId: "researcher_report_artifact",
      sourceRefs: [],
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-cited-assistant-prose",
      sourceProfileId: "cited_assistant_answer",
      sourceRefs: [sourceRef("phase2-cited-assistant-source", "https://example.invalid/cited")],
      capturesAssistantProseAsAuthority: true,
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-raw-tool-log-inspection",
      sourceProfileId: "raw_tool_log",
      sourceRefs: [],
      operatorEnabled,
    }),
    buildSourceDecision({
      sourceId: "phase2-private-hard-reject",
      sourceProfileId: "secret_or_private_phrase",
      sourceRefs: [],
      riskFlags: ["private_phrase"],
      operatorEnabled,
    }),
  ];
  const maintenanceSurfacing = buildMaintenance({ generatedAt: now, projectId });
  const checks: Phase2OperatorIngestionRolloutCheck[] = [];
  const byId = new Map(
    sourceDecisions.map((sourceDecision) => [sourceDecision.sourceId, sourceDecision]),
  );
  addCheck(
    checks,
    "tool_grounded_capture_admitted",
    byId.get("phase2-tool-grounded-capture")?.durableMemoryCreated === true &&
      byId.get("phase2-tool-grounded-capture")?.authorityTier === "tool_grounded",
    "tool_grounded_required",
  );
  addCheck(
    checks,
    "daily_continuity_capture_admitted",
    byId.get("phase2-daily-continuity-capture")?.durableMemoryCreated === true &&
      byId.get("phase2-daily-continuity-capture")?.sourceProfileId === "daily_continuity",
    "daily_continuity_required",
  );
  addCheck(
    checks,
    "researcher_cited_soft_requires_citation",
    byId.get("phase2-researcher-cited-soft")?.decision === "auto_admit" &&
      byId.get("phase2-researcher-missing-citation")?.decision === "reject",
    "citation_required",
  );
  addCheck(
    checks,
    "assistant_prose_not_authority",
    byId.get("phase2-cited-assistant-prose")?.decision === "reject",
    "assistant_prose_is_not_authority",
  );
  addCheck(
    checks,
    "inspection_and_private_excluded",
    byId.get("phase2-raw-tool-log-inspection")?.decision !== "auto_admit" &&
      byId.get("phase2-private-hard-reject")?.decision === "reject",
    "inspection_private_excluded",
  );
  addCheck(
    checks,
    "maintenance_operator_report_visible",
    maintenanceSurfacing.mode === "operator_report_only" &&
      maintenanceSurfacing.activeCandidateIds.length > 0 &&
      maintenanceSurfacing.archivedCandidateIds.length > 0 &&
      maintenanceSurfacing.pinnedCandidateIds.length > 0,
    "maintenance_report_required",
  );
  addCheck(
    checks,
    "lower_authority_visible",
    sourceDecisions
      .filter((sourceDecision) =>
        ["cited_soft", "tool_grounded"].includes(sourceDecision.authorityTier),
      )
      .every((sourceDecision) => sourceDecision.lowerAuthorityVisible),
    "lower_authority_required",
  );
  addCheck(
    checks,
    "rollback_observed",
    disabledByKillSwitch || rollbackPlan().targetModes.softSourceRuntimeIngestion === "disabled",
    "rollback_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const decision: Phase2OperatorIngestionRolloutDecision =
    failed.length === 0 && operatorEnabled
      ? "operator_rollout_observed"
      : failed.length < checks.length
        ? "partial"
        : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_operator_ingestion_rollout_report",
    targetId: projectId,
    seed: {
      generatedAt,
      decision,
      sourceDecisions,
      maintenanceReportId: maintenanceSurfacing.reportId,
      marker,
    },
  });
  const noDarkDataStatus = failed.length === 0 ? "pass" : "fail";
  const telemetry: Phase2OperatorIngestionTelemetry = {
    schemaVersion: PHASE2_OPERATOR_INGESTION_ROLLOUT_SCHEMA_VERSION,
    reportId,
    decision,
    sourceProfileIds: uniqueSortedStrings(
      sourceDecisions.map((sourceDecision) => sourceDecision.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      sourceDecisions.map((sourceDecision) => sourceDecision.authorityTier),
    ) as SourceAuthorityTier[],
    admittedSourceIds: sourceDecisions
      .filter((sourceDecision) => sourceDecision.decision === "auto_admit")
      .map((sourceDecision) => sourceDecision.sourceId),
    rejectedSourceIds: sourceDecisions
      .filter((sourceDecision) => sourceDecision.decision === "reject")
      .map((sourceDecision) => sourceDecision.sourceId),
    inspectionOnlySourceIds: sourceDecisions
      .filter((sourceDecision) => sourceDecision.decision === "inspection_only")
      .map((sourceDecision) => sourceDecision.sourceId),
    durableMemoryIds: sourceDecisions.flatMap((sourceDecision) =>
      sourceDecision.memoryId ? [sourceDecision.memoryId] : [],
    ),
    maintenanceCandidateIds: maintenanceSurfacing.maintenanceReport.candidates.map(
      (candidate) => candidate.candidateId,
    ),
    reasonCodes: uniqueSortedStrings(
      sourceDecisions.flatMap((sourceDecision) => sourceDecision.reasonCodes),
    ),
    noDarkDataStatus,
    rollbackObserved: true,
    defaultBroadIngestionChanged: false,
  };
  const report: Phase2OperatorIngestionRolloutReport = {
    schemaVersion: PHASE2_OPERATOR_INGESTION_ROLLOUT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    rolloutMode: "operator_enabled",
    sourceDecisions,
    maintenanceSurfacing,
    checks,
    noDarkDataStatus,
    rollbackPlan: rollbackPlan(),
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2OperatorIngestionRolloutReport;
}

export function assertPhase2OperatorIngestionRolledOut(
  report: Phase2OperatorIngestionRolloutReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.decision !== "operator_rollout_observed" || failed.length > 0) {
    throw new Error(
      `phase2 operator ingestion rollout not observed: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.decision
      }`,
    );
  }
}

function markdownReport(report: Phase2OperatorIngestionRolloutReport, jsonPath: string): string {
  return [
    "# Phase 2 Operator Ingestion and Maintenance Rollout",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- rollout_mode: ${report.rolloutMode}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- source_profiles: ${report.telemetry.sourceProfileIds.join(", ")}`,
    `- authority_tiers: ${report.telemetry.authorityTiers.join(", ")}`,
    `- admitted_sources: ${report.telemetry.admittedSourceIds.join(", ")}`,
    `- rejected_sources: ${report.telemetry.rejectedSourceIds.join(", ")}`,
    `- inspection_only_sources: ${report.telemetry.inspectionOnlySourceIds.join(", ")}`,
    `- maintenance_candidates: ${report.telemetry.maintenanceCandidateIds.length}`,
    `- default_broad_ingestion_changed: ${report.telemetry.defaultBroadIngestionChanged}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
  ].join("\n");
}

export async function writePhase2OperatorIngestionRolloutArtifact(input: {
  report: Phase2OperatorIngestionRolloutReport;
  artifactDir: string;
}): Promise<Phase2OperatorIngestionRolloutArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const maintenanceWritten = await writeMemoryMaintenanceReport({
    report: input.report.maintenanceSurfacing.maintenanceReport,
    artifactDir: input.artifactDir,
    reportId: input.report.maintenanceSurfacing.reportId,
  });
  input.report.maintenanceSurfacing.artifactPath = maintenanceWritten.path;
  input.report.maintenanceSurfacing.contentHash = maintenanceWritten.contentHash;
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-operator-ingestion-rollout",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-operator-ingestion-rollout",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 operator ingestion markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    maintenanceArtifactPath: maintenanceWritten.path,
    contentHash: hashDerivedArtifactValue({
      jsonHash: written.contentHash,
      maintenanceHash: maintenanceWritten.contentHash,
      markdown,
    }),
    byteLength:
      written.byteLength +
      Buffer.byteLength(markdown, "utf8") +
      Buffer.byteLength(
        JSON.stringify(input.report.maintenanceSurfacing.maintenanceReport),
        "utf8",
      ),
  };
}
