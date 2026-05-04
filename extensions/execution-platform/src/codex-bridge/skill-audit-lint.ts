import { writeFile } from "node:fs/promises";
import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  buildSkillDeepCritiqueArtifact,
  buildSkillDeepCritiqueReport,
  type SkillDeepCritiqueReport,
  type SkillDeepCritiqueTarget,
  type SkillDeepCritiqueWebSource,
} from "./skill-deep-critique.ts";
import type { CodexBridgeClawHubComparisonReport } from "./skill-inventory.ts";

const SKILL_AUDIT_LINT_ARTIFACT_TYPE = "codex_bridge.skill_audit_lint_report";
const SKILL_AUDIT_LINT_EVENT_TYPE = "codex_bridge.skill_audit_lint_checked";
const DEFAULT_MAX_SKILL_AUDIT_LINT_METADATA_BYTES = 128 * 1024;

export type SkillAuditLintCoverageState = "coverage_present" | "coverage_missing" | "needs_review";

export type SkillQualitativeReviewArtifact = {
  artifactKind: "codex_bridge_skill_qualitative_review_boundary";
  reviewKind: "human_review" | "model_review_future";
  judgmentMade: boolean;
  reviewer: string | null;
  reviewedAt: string | null;
  scope: string[];
  evidenceRefs: string[];
  findings: string[];
  limitations: string[];
  notDeterministic: true;
  requiredBeforeCodeWritingBridgePilot: true;
};

export type SkillAuditLintItem = {
  targetId: string;
  sourcePaths: string[];
  coverageState: SkillAuditLintCoverageState;
  coverageMissing: string[];
  needsReview: string[];
  recommendedActions: string[];
  legacyLabel: string;
  ruleCoverageOnly: true;
  qualitativeJudgmentMade: false;
  necessaryButNotSufficient: true;
  requiresSeparateQualitativeReview: true;
};

export type SkillAuditLintReport = {
  artifactKind: "codex_bridge_skill_audit_lint_report";
  auditId: string;
  checkedAt: string;
  items: SkillAuditLintItem[];
  coverageCounts: Record<SkillAuditLintCoverageState, number>;
  qualitativeReviewBoundary: SkillQualitativeReviewArtifact;
  legacyDeepCritiqueArtifactKind: SkillDeepCritiqueReport["artifactKind"];
  ruleCoverageOnly: true;
  qualitativeJudgmentMade: false;
  necessaryButNotSufficient: true;
  requiresSeparateQualitativeReview: true;
  deepCritiqueTermDeprecated: true;
  codeWritingBridgePilotStillBlocked: true;
  codexCliInvoked: false;
  clawHubInstallUpdatePublishPerformed: false;
  workQueueLifecycleMutated: false;
};

export type BuildSkillAuditLintReportInput = {
  auditId: string;
  checkedAt: string;
  targets: SkillDeepCritiqueTarget[];
  comparison?: CodexBridgeClawHubComparisonReport;
  webSources?: SkillDeepCritiqueWebSource[];
  changesApplied?: string[];
};

function coverageStateForLegacyVerdict(verdict: string): SkillAuditLintCoverageState {
  if (verdict === "pass") {
    return "coverage_present";
  }
  if (verdict === "pass_with_minor_gaps") {
    return "needs_review";
  }
  return "coverage_missing";
}

function countCoverage(items: SkillAuditLintItem[]): Record<SkillAuditLintCoverageState, number> {
  return {
    coverage_present: items.filter((item) => item.coverageState === "coverage_present").length,
    coverage_missing: items.filter((item) => item.coverageState === "coverage_missing").length,
    needs_review: items.filter((item) => item.coverageState === "needs_review").length,
  };
}

export function createSkillQualitativeReviewBoundary(
  input: {
    scope?: string[];
    evidenceRefs?: string[];
    createdAt?: string;
  } = {},
): SkillQualitativeReviewArtifact {
  return {
    artifactKind: "codex_bridge_skill_qualitative_review_boundary",
    reviewKind: "human_review",
    judgmentMade: false,
    reviewer: null,
    reviewedAt: null,
    scope: input.scope ?? ["Execution Platform bridge-safety skill loadout"],
    evidenceRefs: input.evidenceRefs ?? [],
    findings: ["Qualitative review was not performed in this deterministic lint slice."],
    limitations: [
      "Rule coverage can identify missing text and required evidence, but cannot prove skill quality.",
      "Human or explicitly labeled model judgment is required before claiming qualitative sufficiency.",
    ],
    notDeterministic: true,
    requiredBeforeCodeWritingBridgePilot: true,
  };
}

export function buildSkillAuditLintReport(
  input: BuildSkillAuditLintReportInput,
): SkillAuditLintReport {
  const legacyReport = buildSkillDeepCritiqueReport(input);
  const legacyArtifact = buildSkillDeepCritiqueArtifact(legacyReport);
  const items: SkillAuditLintItem[] = legacyReport.targets.map((target) => {
    const coverageState = coverageStateForLegacyVerdict(target.verdict);
    const coverageMissing =
      coverageState === "coverage_missing" ? target.missingCapabilities.slice(0, 12) : [];
    const needsReview =
      coverageState === "needs_review"
        ? [...target.missingCapabilities.slice(0, 10), ...target.overbroadCapabilities.slice(0, 4)]
        : [];
    return {
      targetId: target.targetId,
      sourcePaths: target.targetSourcePaths,
      coverageState,
      coverageMissing,
      needsReview,
      recommendedActions: target.recommendedChanges.slice(0, 12),
      legacyLabel: target.verdict,
      ruleCoverageOnly: true,
      qualitativeJudgmentMade: false,
      necessaryButNotSufficient: true,
      requiresSeparateQualitativeReview: true,
    };
  });
  return {
    artifactKind: "codex_bridge_skill_audit_lint_report",
    auditId: input.auditId,
    checkedAt: input.checkedAt,
    items,
    coverageCounts: countCoverage(items),
    qualitativeReviewBoundary: createSkillQualitativeReviewBoundary({
      evidenceRefs: [`skill-deep-critique-legacy://${legacyArtifact.auditId}`],
    }),
    legacyDeepCritiqueArtifactKind: legacyReport.artifactKind,
    ruleCoverageOnly: true,
    qualitativeJudgmentMade: false,
    necessaryButNotSufficient: true,
    requiresSeparateQualitativeReview: true,
    deepCritiqueTermDeprecated: true,
    codeWritingBridgePilotStillBlocked: true,
    codexCliInvoked: false,
    clawHubInstallUpdatePublishPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

export async function writeSkillAuditLintArtifact(input: {
  artifactPath: string;
  report: SkillAuditLintReport;
}): Promise<void> {
  await writeFile(input.artifactPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
}

function boundSkillAuditLintMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 520,
    maxArrayItems: 320,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export class CodexBridgeSkillAuditLintRepository {
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: { maxArtifactMetadataBytes?: number } = {},
  ) {
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_SKILL_AUDIT_LINT_METADATA_BYTES;
  }

  async persistReport(input: {
    runtimeJobId: string;
    report: SkillAuditLintReport;
  }): Promise<RuntimeJobArtifact> {
    const bounded = boundSkillAuditLintMetadata(input.report as unknown as JsonValue);
    if (jsonByteLength(bounded) > this.maxArtifactMetadataBytes) {
      throw new Error("skill audit lint metadata exceeds artifact bounds");
    }
    const artifact = await this.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: SKILL_AUDIT_LINT_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/codex-bridge/skill-audit-lint`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: SKILL_AUDIT_LINT_EVENT_TYPE,
      data: {
        artifactId: artifact.artifactId,
        ruleCoverageOnly: true,
        qualitativeJudgmentMade: false,
        necessaryButNotSufficient: true,
      },
    });
    return artifact;
  }
}

export const CODEX_BRIDGE_SKILL_AUDIT_LINT_ARTIFACT_TYPE = SKILL_AUDIT_LINT_ARTIFACT_TYPE;
export const CODEX_BRIDGE_SKILL_AUDIT_LINT_EVENT_TYPE = SKILL_AUDIT_LINT_EVENT_TYPE;
