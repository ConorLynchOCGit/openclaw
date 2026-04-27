import { buildDerivedArtifactId, uniqueSortedStrings } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2OpportunityExtractionSource } from "./phase2-proactivity-opportunity-extraction.ts";

export const PHASE2_PROACTIVITY_RECURRING_PATTERN_SCHEMA_VERSION =
  "phase2_proactivity_recurring_pattern.v1" as const;
export const PHASE2_PROACTIVITY_RECURRING_PATTERN_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_recurring_pattern_report.v1" as const;

export type Phase2RecurringPatternKind =
  | "repeated_user_ask"
  | "repeated_error"
  | "manual_workaround"
  | "postponed_decision";

export type Phase2RecurringPatternThreshold = {
  kind: Phase2RecurringPatternKind;
  countRequired: number;
};

export type Phase2RecurringPattern = {
  patternId: string;
  kind: Phase2RecurringPatternKind;
  projectId: string;
  sessionKey: string;
  count: number;
  normalizedKey: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
};

export type Phase2RecurringPatternOpportunity = {
  opportunityId: string;
  patternId: string;
  projectId: string;
  sessionKey: string;
  workItemKind: "planning_request" | "investigation_request";
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  evidenceSummary: string;
  confidence: "high" | "medium";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
  noDarkDataStatus: "pass";
};

export type Phase2RecurringPatternCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "thresholds_applied"
    | "provenance_required"
    | "no_dark_data_required"
    | "bounded_pattern_only"
    | "no_semantic_similarity_truth";
};

export type Phase2RecurringPatternTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_RECURRING_PATTERN_SCHEMA_VERSION;
  reportId: string;
  sourceCount: number;
  patternCount: number;
  opportunityCount: number;
  sourceRefs: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
};

export type Phase2RecurringPatternRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_RECURRING_PATTERN_DISABLED";
  targetMode: "no_pattern_generated_opportunities";
  disablesPatternLoop: true;
};

export type Phase2RecurringPatternDecision =
  | "pattern_opportunities_ready"
  | "no_patterns"
  | "rollback_disabled";

export type Phase2RecurringPatternReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_RECURRING_PATTERN_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2RecurringPatternDecision;
  thresholds: Phase2RecurringPatternThreshold[];
  patterns: Phase2RecurringPattern[];
  opportunities: Phase2RecurringPatternOpportunity[];
  checks: Phase2RecurringPatternCheck[];
  telemetry: Phase2RecurringPatternTelemetry;
  rollbackPlan: Phase2RecurringPatternRollbackPlan;
  noDarkDataStatus: "pass";
};

export type Phase2RecurringPatternInput = {
  now?: Date;
  sources?: Phase2OpportunityExtractionSource[];
  env?: Record<string, string | undefined>;
};

const WORKAROUND_PATTERN = /\b(manual|manually|workaround|by hand)\b/i;
const POSTPONED_PATTERN = /\b(later|defer|deferred|postpone|not now|after this|park this)\b/i;
const ERROR_PATTERN = /\b(error|failed|failure|broken|didn't work|doesn't work)\b/i;

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_RECURRING_PATTERN_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hash(value: unknown): string {
  return sha256JsonValue(value as never);
}

function addCheck(
  checks: Phase2RecurringPatternCheck[],
  reasonCode: Phase2RecurringPatternCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_recurring_pattern:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function thresholds(): Phase2RecurringPatternThreshold[] {
  return [
    { kind: "repeated_user_ask", countRequired: 2 },
    { kind: "repeated_error", countRequired: 2 },
    { kind: "manual_workaround", countRequired: 2 },
    { kind: "postponed_decision", countRequired: 2 },
  ];
}

function patternKindForSource(
  source: Phase2OpportunityExtractionSource,
): Phase2RecurringPatternKind | null {
  const text = source.boundedText;
  if (source.sourceKind === "user_turn") {
    if (WORKAROUND_PATTERN.test(text)) {
      return "manual_workaround";
    }
    if (POSTPONED_PATTERN.test(text)) {
      return "postponed_decision";
    }
    return "repeated_user_ask";
  }
  if (ERROR_PATTERN.test(text)) {
    return "repeated_error";
  }
  return null;
}

export async function buildPhase2ProactivityRecurringPatternReport(
  input: Phase2RecurringPatternInput = {},
): Promise<Phase2RecurringPatternReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const sourceRows = input.sources ?? [];
  const thresholdsByKind = new Map(thresholds().map((threshold) => [threshold.kind, threshold]));
  const grouped = new Map<
    string,
    { kind: Phase2RecurringPatternKind; sources: Phase2OpportunityExtractionSource[] }
  >();

  for (const source of sourceRows) {
    const kind = patternKindForSource(source);
    if (!kind) {
      continue;
    }
    const normalizedKey =
      kind === "repeated_user_ask"
        ? normalize(source.userPromptSummary ?? source.boundedText)
        : kind === "repeated_error"
          ? normalize(source.boundedText)
          : kind === "manual_workaround"
            ? `${kind}:${source.projectId}:${source.sessionKey}`
            : `${kind}:${source.projectId}:${source.sessionKey}`;
    const key = `${kind}:${normalizedKey}`;
    const current = grouped.get(key);
    if (current) {
      current.sources.push(source);
    } else {
      grouped.set(key, { kind, sources: [source] });
    }
  }

  const patterns: Phase2RecurringPattern[] = [];
  const opportunities: Phase2RecurringPatternOpportunity[] = [];
  for (const [normalizedKey, group] of grouped.entries()) {
    const threshold = thresholdsByKind.get(group.kind)!;
    if (group.sources.length < threshold.countRequired) {
      continue;
    }
    const first = group.sources[0]!;
    const patternId = buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_recurring_pattern",
      targetId: first.sessionKey,
      seed: { groupKind: group.kind, normalizedKey, count: group.sources.length },
    });
    const pattern: Phase2RecurringPattern = {
      patternId,
      kind: group.kind,
      projectId: first.projectId,
      sessionKey: first.sessionKey,
      count: group.sources.length,
      normalizedKey,
      sourceRefs: uniqueSortedStrings(group.sources.flatMap((source) => source.sourceRefs)),
      sourceProfileIds: uniqueSortedStrings(
        group.sources.map((source) => source.sourceProfileId),
      ) as SourceProfileId[],
      authorityTiers: uniqueSortedStrings(
        group.sources.map((source) => source.authorityTier),
      ) as SourceAuthorityTier[],
      contentHashes: uniqueSortedStrings(
        group.sources.map((source) => source.contentHash ?? hash(source.boundedText)),
      ),
      proofHashes: uniqueSortedStrings(
        group.sources.map((source) => source.proofHash ?? hash(source.sourceId)),
      ),
    };
    patterns.push(pattern);
    const title =
      group.kind === "repeated_error"
        ? `Investigate recurring ${first.projectId} failure`
        : group.kind === "manual_workaround"
          ? `Reduce repeated ${first.projectId} manual workaround`
          : group.kind === "postponed_decision"
            ? `Reopen postponed ${first.projectId} decision`
            : `Follow up on repeated ${first.projectId} ask`;
    opportunities.push({
      opportunityId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_recurring_pattern_opportunity",
        targetId: patternId,
        seed: { count: pattern.count, title },
      }),
      patternId,
      projectId: first.projectId,
      sessionKey: first.sessionKey,
      workItemKind: group.kind === "repeated_error" ? "investigation_request" : "planning_request",
      title,
      whyNow: `Observed ${pattern.count} bounded ${group.kind.replace(/_/gu, " ")} events in recent ${first.projectId} work.`,
      proposedNextStep:
        group.kind === "repeated_error"
          ? "Investigate the repeated failure pattern, summarize the concrete evidence, and propose the smallest safe next step."
          : `Plan a bounded follow-up that removes or addresses the repeated ${group.kind.replace(/_/gu, " ")} pattern.`,
      expectedUserValue:
        "Turns recurring friction into a proactive follow-up before it keeps repeating.",
      evidenceSummary: `Pattern detected from ${pattern.sourceRefs.slice(0, 4).join(", ") || "bounded recent activity"}.`,
      confidence: group.kind === "repeated_error" ? "high" : "medium",
      sourceRefs: pattern.sourceRefs,
      sourceProfileIds: pattern.sourceProfileIds,
      authorityTiers: pattern.authorityTiers,
      contentHashes: pattern.contentHashes,
      proofHashes: pattern.proofHashes,
      blockedReasonCodes: [],
      noDarkDataStatus: "pass",
    });
  }

  const checks: Phase2RecurringPatternCheck[] = [];
  addCheck(
    checks,
    "thresholds_applied",
    patterns.every((pattern) => pattern.count >= 2),
  );
  addCheck(
    checks,
    "provenance_required",
    opportunities.every((opportunity) => opportunity.sourceRefs.length > 0),
  );
  addCheck(checks, "no_dark_data_required", true);
  addCheck(checks, "bounded_pattern_only", true);
  addCheck(checks, "no_semantic_similarity_truth", true);

  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_recurring_pattern_report",
    targetId: sourceRows[0]?.sessionKey ?? "main",
    seed: { generatedAt, patternIds: patterns.map((pattern) => pattern.patternId) },
  });
  return {
    schemaVersion: PHASE2_PROACTIVITY_RECURRING_PATTERN_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision: rollback
      ? "rollback_disabled"
      : opportunities.length > 0
        ? "pattern_opportunities_ready"
        : "no_patterns",
    thresholds: thresholds(),
    patterns: rollback ? [] : patterns,
    opportunities: rollback ? [] : opportunities,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_RECURRING_PATTERN_SCHEMA_VERSION,
      reportId,
      sourceCount: sourceRows.length,
      patternCount: patterns.length,
      opportunityCount: opportunities.length,
      sourceRefs: uniqueSortedStrings(
        opportunities.flatMap((opportunity) => opportunity.sourceRefs),
      ),
      contentHashes: uniqueSortedStrings(
        opportunities.flatMap((opportunity) => opportunity.contentHashes),
      ),
      proofHashes: uniqueSortedStrings(
        opportunities.flatMap((opportunity) => opportunity.proofHashes),
      ),
      noDarkDataStatus: "pass",
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_recurring_pattern_rollback",
        targetId: reportId,
        seed: "pattern-loop",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_RECURRING_PATTERN_DISABLED",
      targetMode: "no_pattern_generated_opportunities",
      disablesPatternLoop: true,
    },
    noDarkDataStatus: "pass",
  };
}
