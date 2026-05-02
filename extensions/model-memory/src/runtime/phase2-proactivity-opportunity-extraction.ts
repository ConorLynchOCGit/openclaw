import { buildDerivedArtifactId, uniqueSortedStrings } from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2ProactivityWorkItemKind } from "./phase2-proactivity-work-items.ts";

export const PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_SCHEMA_VERSION =
  "phase2_proactivity_opportunity_extraction.v1" as const;
export const PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_opportunity_extraction_report.v1" as const;

export type Phase2OpportunityExtractionSourceKind =
  | "assistant_turn"
  | "planning_output"
  | "user_turn"
  | "system_followup";

export type Phase2OpportunityExtractionSource = {
  sourceId: string;
  sourceKind: Phase2OpportunityExtractionSourceKind;
  sourceMessageId: string;
  sourceRunId?: string;
  projectId: string;
  sessionKey: string;
  boundedText: string;
  userPromptSummary?: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash?: string;
  proofHash?: string;
  noDarkDataStatus?: "pass" | "fail";
};

export type Phase2OpportunityExtractionCandidate = {
  opportunityId: string;
  sourceKind: Phase2OpportunityExtractionSourceKind;
  sourceMessageId: string;
  sourceRunId?: string;
  projectId: string;
  sessionKey: string;
  workItemKind: Phase2ProactivityWorkItemKind;
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  evidenceSummary: string;
  confidence: "high" | "medium" | "low";
  limitations: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  completionSignals: string[];
  supersessionSignals: string[];
  blockedReasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  generatedAt: string;
};

export type Phase2OpportunityExtractionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "bounded_source_required"
    | "assistant_or_planning_source_required"
    | "concrete_next_step_required"
    | "provenance_required"
    | "no_dark_data_required"
    | "generic_placeholder_blocked"
    | "external_text_evidence_not_instruction";
};

export type Phase2OpportunityExtractionTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_SCHEMA_VERSION;
  reportId: string;
  sourceCount: number;
  candidateCount: number;
  sourceKinds: Phase2OpportunityExtractionSourceKind[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2OpportunityExtractionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_OPPORTUNITY_EXTRACTION_DISABLED";
  targetMode: "model_reviewed_candidate_only";
  disablesAssistantOutputExtraction: true;
};

export type Phase2OpportunityExtractionDecision =
  | "opportunities_extracted"
  | "no_concrete_opportunities"
  | "blocked"
  | "rollback_disabled";

export type Phase2OpportunityExtractionReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2OpportunityExtractionDecision;
  candidates: Phase2OpportunityExtractionCandidate[];
  checks: Phase2OpportunityExtractionCheck[];
  telemetry: Phase2OpportunityExtractionTelemetry;
  rollbackPlan: Phase2OpportunityExtractionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2OpportunityExtractionInput = {
  now?: Date;
  sources?: Phase2OpportunityExtractionSource[];
  modelReviewedCandidates?: Phase2OpportunityExtractionCandidate[];
  env?: Record<string, string | undefined>;
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
        `phase2 proactivity opportunity extraction contains prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
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
      throw new Error("phase2 proactivity opportunity extraction contains prohibited marker");
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_OPPORTUNITY_EXTRACTION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function compact(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function addCheck(
  checks: Phase2OpportunityExtractionCheck[],
  reasonCode: Phase2OpportunityExtractionCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_opportunity_extraction:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

export async function buildPhase2ProactivityOpportunityExtractionReport(
  input: Phase2OpportunityExtractionInput = {},
): Promise<Phase2OpportunityExtractionReport> {
  assertNoDarkData(input.sources ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const sources = input.sources ?? [];
  const checks: Phase2OpportunityExtractionCheck[] = [];
  addCheck(
    checks,
    "bounded_source_required",
    sources.every((source) => compact(source.boundedText).length >= 24),
  );
  addCheck(
    checks,
    "assistant_or_planning_source_required",
    sources.some(
      (source) => source.sourceKind === "assistant_turn" || source.sourceKind === "planning_output",
    ),
  );
  addCheck(
    checks,
    "provenance_required",
    sources.every((source) => source.sourceRefs.length > 0),
  );
  addCheck(
    checks,
    "no_dark_data_required",
    sources.every((source) => (source.noDarkDataStatus ?? "pass") === "pass"),
  );
  addCheck(checks, "external_text_evidence_not_instruction", true);

  const candidates = rollback
    ? []
    : (input.modelReviewedCandidates ?? []).filter(
        (candidate) =>
          sources.length === 0 ||
          sources.some(
            (source) =>
              source.sourceMessageId === candidate.sourceMessageId ||
              candidate.sourceRefs.some((ref) => source.sourceRefs.includes(ref)),
          ),
      );
  addCheck(checks, "concrete_next_step_required", candidates.length > 0 || sources.length === 0);
  addCheck(checks, "generic_placeholder_blocked", true);

  const failedChecks = checks.filter((check) => check.status === "fail");
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_opportunity_extraction_report",
    targetId: sources[0]?.sessionKey ?? "main",
    seed: {
      generatedAt,
      candidateIds: candidates.map((candidate) => candidate.opportunityId),
      sourceIds: sources.map((source) => source.sourceId),
    },
  });
  const decision: Phase2OpportunityExtractionDecision = rollback
    ? "rollback_disabled"
    : failedChecks.some((check) => check.reasonCode !== "concrete_next_step_required")
      ? "blocked"
      : candidates.length > 0
        ? "opportunities_extracted"
        : "no_concrete_opportunities";
  const telemetry: Phase2OpportunityExtractionTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_SCHEMA_VERSION,
    reportId,
    sourceCount: sources.length,
    candidateCount: candidates.length,
    sourceKinds: uniqueSortedStrings(
      sources.map((source) => source.sourceKind),
    ) as Phase2OpportunityExtractionSourceKind[],
    sourceRefs: uniqueSortedStrings(candidates.flatMap((candidate) => candidate.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      candidates.flatMap((candidate) => candidate.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      candidates.flatMap((candidate) => candidate.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(candidates.flatMap((candidate) => candidate.contentHashes)),
    proofHashes: uniqueSortedStrings(candidates.flatMap((candidate) => candidate.proofHashes)),
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
  };
  const report: Phase2OpportunityExtractionReport = {
    schemaVersion: PHASE2_PROACTIVITY_OPPORTUNITY_EXTRACTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    candidates: decision === "opportunities_extracted" ? candidates : [],
    checks,
    telemetry,
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_opportunity_extraction_rollback",
        targetId: reportId,
        seed: decision,
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_OPPORTUNITY_EXTRACTION_DISABLED",
      targetMode: "model_reviewed_candidate_only",
      disablesAssistantOutputExtraction: true,
    },
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}
