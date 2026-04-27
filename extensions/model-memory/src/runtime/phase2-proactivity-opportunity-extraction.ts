import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
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
  targetMode: "live_signal_only";
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

const GENERIC_PLACEHOLDER_PATTERNS = [
  /suggestion available/i,
  /follow-up ready for review/i,
  /review the memory-derived suggestion/i,
  /a recent model memory task/i,
  /surfaces a bounded memory-derived item/i,
];

const ACTIONABLE_VERB_PATTERN =
  /\b(plan|investigate|draft|review|advance|fix|check|validate|resolve|follow up|compare|audit|stabilize|clean up|document|ship|close|reduce|verify)\b/i;

const RESOLUTION_MARKER_PATTERN =
  /\b(done|completed|implemented|resolved|handled|closed|superseded|obsolete|already done)\b/i;

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

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function compact(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function normalizeLine(value: string): string {
  return value
    .replace(/^[\s>*-]*(?:\d+\.\s*)?/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function toTitle(value: string): string {
  const cleaned = compact(value, 90)
    .replace(/[.:;]+$/u, "")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

function workItemKindForLine(value: string): Phase2ProactivityWorkItemKind {
  if (/\binvestigate|verify|debug|root cause\b/i.test(value)) {
    return "investigation_request";
  }
  if (/\bdraft\b/i.test(value)) {
    return "draft_next_steps";
  }
  return "planning_request";
}

function titleFromLine(value: string): string {
  const normalized = normalizeLine(value);
  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 6 && colonIndex < 80) {
    return toTitle(normalized.slice(0, colonIndex));
  }
  const words = normalized.split(/\s+/u).slice(0, 9);
  return toTitle(words.join(" "));
}

function buildCandidate(input: {
  source: Phase2OpportunityExtractionSource;
  seed: string;
  whySeed: string;
  now: string;
}): Phase2OpportunityExtractionCandidate | null {
  const normalizedSeed = normalizeLine(input.seed);
  if (normalizedSeed.length < 28) {
    return null;
  }
  if (GENERIC_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalizedSeed))) {
    return null;
  }
  if (!ACTIONABLE_VERB_PATTERN.test(normalizedSeed)) {
    return null;
  }
  const title = titleFromLine(normalizedSeed);
  const contentHash =
    input.source.contentHash ??
    hash({
      sourceId: input.source.sourceId,
      sourceMessageId: input.source.sourceMessageId,
      normalizedSeed,
    });
  const proofHash =
    input.source.proofHash ??
    hash({
      sourceRefs: input.source.sourceRefs,
      sourceRunId: input.source.sourceRunId ?? null,
      contentHash,
    });
  const whyNowSeed = compact(
    input.whySeed || input.source.userPromptSummary || normalizedSeed,
    180,
  );
  const proposedNextStep = compact(normalizedSeed, 220);
  const workItemKind = workItemKindForLine(proposedNextStep);
  return {
    opportunityId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_extracted_opportunity",
      targetId: input.source.sourceMessageId,
      seed: {
        title,
        projectId: input.source.projectId,
        sessionKey: input.source.sessionKey,
        contentHash,
      },
    }),
    sourceKind: input.source.sourceKind,
    sourceMessageId: input.source.sourceMessageId,
    sourceRunId: input.source.sourceRunId,
    projectId: input.source.projectId,
    sessionKey: input.source.sessionKey,
    workItemKind,
    title,
    whyNow: `${whyNowSeed} Source: ${input.source.sourceRefs[0] ?? input.source.sourceMessageId}.`,
    proposedNextStep,
    expectedUserValue: compact(
      `Turns a real assistant-produced next step into a reviewable ${input.source.projectId} opportunity without manual inbox seeding.`,
      180,
    ),
    evidenceSummary: compact(
      `Extracted from bounded ${input.source.sourceKind.replace(/_/gu, " ")} output. Evidence source: ${input.source.sourceRefs[0] ?? input.source.sourceMessageId}.`,
      180,
    ),
    confidence: RESOLUTION_MARKER_PATTERN.test(input.source.boundedText) ? "medium" : "high",
    limitations: ["bounded_assistant_output_extraction_only"],
    sourceRefs: input.source.sourceRefs,
    sourceProfileIds: [input.source.sourceProfileId],
    authorityTiers: [input.source.authorityTier],
    contentHashes: [contentHash],
    proofHashes: [proofHash],
    completionSignals: [
      `source_message:${input.source.sourceMessageId}`,
      `title_hash:${hash(title)}`,
    ],
    supersessionSignals: [
      `proposed_next_step_hash:${hash(proposedNextStep)}`,
      `title_hash:${hash(title)}`,
    ],
    blockedReasonCodes: [],
    noDarkDataStatus: input.source.noDarkDataStatus ?? "pass",
    generatedAt: input.now,
  };
}

function extractSeeds(text: string): string[] {
  const explicitPlanMatch = text.match(
    /(?:^|\n)(?:next steps?|proposed plans?|opportunities?)\s*:\s*(.+)$/imu,
  );
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLines = lines.filter(
    (line) =>
      /^[-*]\s+/u.test(line) ||
      /^\d+\.\s+/u.test(line) ||
      /^#{1,4}\s+/u.test(line) ||
      /\b(?:plan|investigate|draft|review|advance|fix|check|validate|resolve|follow up|compare|audit|stabilize|document|ship|close|reduce|verify)\b/i.test(
        line,
      ),
  );
  const seeds = explicitPlanMatch ? [explicitPlanMatch[1], ...bulletLines] : bulletLines;
  return uniqueSortedStrings(seeds.map(normalizeLine).filter(Boolean));
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
    : sources.flatMap((source) => {
        if (!(source.sourceKind === "assistant_turn" || source.sourceKind === "planning_output")) {
          return [];
        }
        const whySeed = source.userPromptSummary ?? compact(source.boundedText, 180);
        return extractSeeds(source.boundedText)
          .map((seed) => buildCandidate({ source, seed, whySeed, now: generatedAt }))
          .filter((candidate): candidate is Phase2OpportunityExtractionCandidate =>
            Boolean(candidate),
          );
      });
  addCheck(checks, "concrete_next_step_required", candidates.length > 0 || sources.length === 0);
  addCheck(
    checks,
    "generic_placeholder_blocked",
    candidates.every(
      (candidate) =>
        !GENERIC_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(candidate.proposedNextStep)),
    ),
  );

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
      targetMode: "live_signal_only",
      disablesAssistantOutputExtraction: true,
    },
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}
