import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2OpportunityExtractionCandidate } from "./phase2-proactivity-opportunity-extraction.ts";
import {
  buildProactivityUserFacingFocusKey,
  cleanProactivityUserFacingText,
} from "./proactivity-text.ts";

export const PHASE2_SKILL_CANDIDATE_LEDGER_SCHEMA_VERSION =
  "phase2_skill_candidate_ledger.v1" as const;
export const PHASE2_SKILL_CANDIDATE_LEDGER_REPORT_SCHEMA_VERSION =
  "phase2_skill_candidate_ledger_report.v1" as const;

export type Phase2SkillCandidateSourceRuntime =
  | "openclaw_session"
  | "codex_session"
  | "operator_digest"
  | "validation_lane"
  | "user_request"
  | "recurring_task";

export type Phase2SkillCandidateType =
  | "repeated_work_pattern"
  | "explicit_skill_request"
  | "recurring_validation_fix"
  | "manual_workflow";

export type Phase2SkillCandidateRiskTier = "low" | "medium" | "high" | "blocked";

export type Phase2SkillCandidateAutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Phase2SkillCandidateLifecycleStatus =
  | "detected"
  | "superseded"
  | "rejected"
  | "disabled";

export type Phase2SkillCandidateEvalStatus = "not_started" | "pending" | "passed" | "failed";
export type Phase2SkillCandidateVettingStatus = "not_started" | "pending" | "passed" | "failed";
export type Phase2SkillCandidateCanaryStatus = "not_started" | "pending" | "passed" | "failed";

export type Phase2SkillCandidateInstallTarget =
  | "repo_bundled_skills_dir"
  | "workspace_skills_dir"
  | "workspace_agents_skills_dir"
  | "agents_personal_skills_dir"
  | "openclaw_shared_skills_dir"
  | "plugin_skill_dir"
  | "codex_home_skills_dir";

export type Phase2SkillCandidateRollbackPlan = {
  rollbackId: string;
  strategy: "disable_candidate_only";
  targetPaths: Phase2SkillCandidateInstallTarget[];
  directMainMutationAllowed: false;
};

export type Phase2SkillCandidateRecord = {
  skillCandidateId: string;
  proactivityOpportunityId: string;
  normalizedIntentKey: string;
  sourceRuntime: Phase2SkillCandidateSourceRuntime;
  candidateType: Phase2SkillCandidateType;
  evidenceSummary: string;
  recurrenceCount: number;
  recurrenceWindow: {
    firstSeenAt: string;
    lastSeenAt: string;
  };
  exampleHashes: string[];
  suggestedSkillName: string;
  suggestedExistingSkillName?: string;
  riskTier: Phase2SkillCandidateRiskTier;
  autonomyLevelCeiling: Phase2SkillCandidateAutonomyLevel;
  lifecycleStatus: Phase2SkillCandidateLifecycleStatus;
  installTargets: Phase2SkillCandidateInstallTarget[];
  evalStatus: Phase2SkillCandidateEvalStatus;
  vettingStatus: Phase2SkillCandidateVettingStatus;
  canaryStatus: Phase2SkillCandidateCanaryStatus;
  createdAt: string;
  updatedAt: string;
  provenanceRefs: string[];
  rollbackPlan: Phase2SkillCandidateRollbackPlan;
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2SkillCandidateActivitySource = {
  sourceId: string;
  sourceKind: "assistant_turn" | "planning_output" | "user_turn" | "system_followup";
  sourceMessageId: string;
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
  recordedAt: string;
  updatedAt: string;
};

export type Phase2SkillCandidateOpportunity = {
  sourceFamily: "skill_candidate";
  opportunityClass: "skill_candidate";
  opportunityId: string;
  projectId: string;
  sessionKey: string;
  workItemKind: "planning_request";
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
  noDarkDataStatus: "pass" | "fail";
  generatedAt?: string;
  skillCandidate: Phase2SkillCandidateRecord;
};

export type Phase2SkillCandidateLedgerCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "bounded_evidence_only"
    | "deterministic_ids_required"
    | "deterministic_dedupe_only"
    | "provenance_required"
    | "no_dark_data_required"
    | "raw_transcript_excluded";
};

export type Phase2SkillCandidateLedgerTelemetry = {
  schemaVersion: typeof PHASE2_SKILL_CANDIDATE_LEDGER_SCHEMA_VERSION;
  reportId: string;
  activityCount: number;
  assistantCandidateCount: number;
  recordCount: number;
  opportunityCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2SkillCandidateLedgerReport = {
  schemaVersion: typeof PHASE2_SKILL_CANDIDATE_LEDGER_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "skill_candidates_ready" | "no_skill_candidates";
  records: Phase2SkillCandidateRecord[];
  opportunities: Phase2SkillCandidateOpportunity[];
  checks: Phase2SkillCandidateLedgerCheck[];
  telemetry: Phase2SkillCandidateLedgerTelemetry;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2SkillCandidateLedgerInput = {
  now?: Date;
  activities?: Phase2SkillCandidateActivitySource[];
  assistantCandidates?: Phase2OpportunityExtractionCandidate[];
  previousRecords?: Phase2SkillCandidateRecord[];
};

type SkillCandidateGroup = {
  normalizedIntentKey: string;
  projectId: string;
  sessionKey: string;
  candidates: Phase2OpportunityExtractionCandidate[];
  assistantSources: Phase2SkillCandidateActivitySource[];
};

const EXPLICIT_SKILL_REQUEST_PATTERN =
  /\b(skill(?:s|ifier)?|reusable skill|skill candidate|turn .* into (?:a )?skill)\b/iu;
const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function assertNoDarkData(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`phase2 skill candidate ledger contains prohibited marker: ${marker}`);
    }
  }
}

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function compact(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function addCheck(
  checks: Phase2SkillCandidateLedgerCheck[],
  reasonCode: Phase2SkillCandidateLedgerCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_skill_candidate_ledger:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function humanizeIntentKey(value: string): string {
  return value
    .split(/\s+/u)
    .slice(0, 6)
    .map((token, index) => (index === 0 ? token.charAt(0).toUpperCase() + token.slice(1) : token))
    .join(" ");
}

function suggestedSkillName(value: string): string {
  const tokens = value
    .split(/\s+/u)
    .filter((token) => token.length >= 3)
    .slice(0, 6);
  if (tokens.length === 0) {
    return "bounded-workflow-skill";
  }
  return tokens.join("-");
}

function resolveFallbackGroupKey(
  groups: Map<string, SkillCandidateGroup>,
  input: { projectId: string; sessionKey: string; normalizedIntentKey: string },
): string {
  const exactKey = `${input.projectId}\t${input.sessionKey}\t${input.normalizedIntentKey}`;
  return exactKey;
}

function activityFocusKey(activity: Phase2SkillCandidateActivitySource): string {
  return (
    buildProactivityUserFacingFocusKey(activity.userPromptSummary) ||
    buildProactivityUserFacingFocusKey(activity.boundedText)
  );
}

function sourceRuntimeForCandidate(
  sources: Phase2SkillCandidateActivitySource[],
): Phase2SkillCandidateSourceRuntime {
  const refs = sources.flatMap((source) => source.sourceRefs);
  if (refs.some((sourceRef) => sourceRef.startsWith("codex://"))) {
    return "codex_session";
  }
  if (refs.some((sourceRef) => sourceRef.startsWith("validation://"))) {
    return "validation_lane";
  }
  if (refs.some((sourceRef) => sourceRef.startsWith("operator://"))) {
    return "operator_digest";
  }
  return "openclaw_session";
}

function dedupeRecords(records: Phase2SkillCandidateRecord[]): Phase2SkillCandidateRecord[] {
  const byId = new Map<string, Phase2SkillCandidateRecord>();
  for (const record of records) {
    const existing = byId.get(record.skillCandidateId);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byId.set(record.skillCandidateId, record);
    }
  }
  return [...byId.values()].toSorted((left, right) =>
    left.updatedAt.localeCompare(right.updatedAt),
  );
}

export async function buildPhase2SkillCandidateLedgerReport(
  input: Phase2SkillCandidateLedgerInput = {},
): Promise<Phase2SkillCandidateLedgerReport> {
  assertNoDarkData(input.activities ?? []);
  assertNoDarkData(input.assistantCandidates ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const activities = input.activities ?? [];
  const assistantCandidates = input.assistantCandidates ?? [];
  const previousById = new Map(
    (input.previousRecords ?? []).map((record) => [record.skillCandidateId, record]),
  );
  const activityByMessageId = new Map(
    activities.map((activity) => [`${activity.sourceKind}\t${activity.sourceMessageId}`, activity]),
  );
  const explicitSkillRequests = activities.filter((activity) => {
    if (activity.sourceKind !== "user_turn") {
      return false;
    }
    const prompt =
      cleanProactivityUserFacingText(activity.userPromptSummary ?? activity.boundedText, {
        maxLength: 220,
      }) ?? "";
    return prompt.length > 0 && EXPLICIT_SKILL_REQUEST_PATTERN.test(prompt);
  });

  const grouped = new Map<string, SkillCandidateGroup>();

  for (const candidate of assistantCandidates) {
    const normalizedIntentKey =
      buildProactivityUserFacingFocusKey(candidate.proposedNextStep) ||
      buildProactivityUserFacingFocusKey(candidate.title);
    if (!normalizedIntentKey) {
      continue;
    }
    const key = `${candidate.projectId}\t${candidate.sessionKey}\t${normalizedIntentKey}`;
    const assistantSource = activityByMessageId.get(
      `${candidate.sourceKind}\t${candidate.sourceMessageId}`,
    );
    const existing = grouped.get(key);
    if (existing) {
      existing.candidates.push(candidate);
      if (assistantSource) {
        existing.assistantSources.push(assistantSource);
      }
      continue;
    }
    grouped.set(key, {
      normalizedIntentKey,
      projectId: candidate.projectId,
      sessionKey: candidate.sessionKey,
      candidates: [candidate],
      assistantSources: assistantSource ? [assistantSource] : [],
    });
  }

  for (const activity of activities) {
    if (activity.sourceKind !== "assistant_turn" && activity.sourceKind !== "planning_output") {
      continue;
    }
    const text = cleanProactivityUserFacingText(activity.boundedText, { maxLength: 220 }) ?? "";
    const prompt =
      cleanProactivityUserFacingText(activity.userPromptSummary ?? "", {
        maxLength: 220,
      }) ?? "";
    if (
      !EXPLICIT_SKILL_REQUEST_PATTERN.test(text) &&
      !EXPLICIT_SKILL_REQUEST_PATTERN.test(prompt)
    ) {
      continue;
    }
    const normalizedIntentKey =
      buildProactivityUserFacingFocusKey(text) || buildProactivityUserFacingFocusKey(prompt);
    if (!normalizedIntentKey) {
      continue;
    }
    const resolvedKey = resolveFallbackGroupKey(grouped, {
      projectId: activity.projectId,
      sessionKey: activity.sessionKey,
      normalizedIntentKey,
    });
    const existing = grouped.get(resolvedKey);
    if (existing) {
      existing.assistantSources.push(activity);
      continue;
    }
    grouped.set(resolvedKey, {
      normalizedIntentKey,
      projectId: activity.projectId,
      sessionKey: activity.sessionKey,
      candidates: [],
      assistantSources: [activity],
    });
  }

  const records: Phase2SkillCandidateRecord[] = [];
  const opportunities: Phase2SkillCandidateOpportunity[] = [];
  for (const group of grouped.values()) {
    const sameSessionExplicitRequests = explicitSkillRequests.filter(
      (activity) =>
        activity.projectId === group.projectId &&
        activity.sessionKey === group.sessionKey &&
        activityFocusKey(activity) === group.normalizedIntentKey,
    );
    const assistantSourceIds = new Set([
      ...group.candidates.map((candidate) => candidate.sourceMessageId),
      ...group.assistantSources
        .filter(
          (activity) =>
            activity.sourceKind === "assistant_turn" || activity.sourceKind === "planning_output",
        )
        .map((activity) => activity.sourceMessageId),
    ]);
    const repeatedCount = assistantSourceIds.size;
    const hasExplicitRequestSupport = sameSessionExplicitRequests.length > 0;
    if (repeatedCount < 2 && !hasExplicitRequestSupport) {
      continue;
    }

    const supportingActivities = [...group.assistantSources, ...sameSessionExplicitRequests].filter(
      (activity, index, array) => {
        const key = `${activity.sourceKind}\t${activity.sourceMessageId}`;
        return (
          array.findIndex(
            (candidate) => `${candidate.sourceKind}\t${candidate.sourceMessageId}` === key,
          ) === index
        );
      },
    );
    if (supportingActivities.length === 0) {
      continue;
    }

    const sourceRuntime = sourceRuntimeForCandidate(supportingActivities);
    const candidateType: Phase2SkillCandidateType =
      repeatedCount >= 2
        ? "repeated_work_pattern"
        : hasExplicitRequestSupport
          ? "explicit_skill_request"
          : "manual_workflow";
    const firstSeenAt =
      supportingActivities.map((activity) => activity.recordedAt).toSorted()[0] ?? generatedAt;
    const lastSeenAt =
      supportingActivities
        .map((activity) => activity.updatedAt)
        .toSorted()
        .slice(-1)[0] ?? generatedAt;
    const humanLabel =
      cleanProactivityUserFacingText(group.candidates[0]?.title, { maxLength: 90 }) ??
      cleanProactivityUserFacingText(group.assistantSources[0]?.boundedText, { maxLength: 90 }) ??
      humanizeIntentKey(group.normalizedIntentKey);
    const normalizedSkillName = suggestedSkillName(group.normalizedIntentKey);
    const evidenceSummary = compact(
      repeatedCount >= 2
        ? `Observed ${repeatedCount} bounded assistant opportunities for the same recurring work pattern${hasExplicitRequestSupport ? " plus an explicit skill request" : ""}.`
        : `Observed an explicit skill-oriented user request plus bounded follow-on work for the same recurring task.`,
      180,
    );
    const skillCandidateId = buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_skill_candidate_record",
      targetId: `${group.projectId}:${group.sessionKey}`,
      seed: {
        normalizedIntentKey: group.normalizedIntentKey,
        sourceRuntime,
        candidateType,
      },
    });
    const previous = previousById.get(skillCandidateId);
    const record: Phase2SkillCandidateRecord = {
      skillCandidateId,
      proactivityOpportunityId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_skill_candidate_opportunity",
        targetId: skillCandidateId,
        seed: group.normalizedIntentKey,
      }),
      normalizedIntentKey: group.normalizedIntentKey,
      sourceRuntime,
      candidateType,
      evidenceSummary,
      recurrenceCount: supportingActivities.length,
      recurrenceWindow: {
        firstSeenAt: previous?.recurrenceWindow.firstSeenAt ?? firstSeenAt,
        lastSeenAt,
      },
      exampleHashes: uniqueSortedStrings([
        ...supportingActivities.map(
          (activity) => activity.contentHash ?? hash(activity.boundedText),
        ),
        ...group.candidates.flatMap((candidate) => candidate.contentHashes),
      ]),
      suggestedSkillName: normalizedSkillName,
      suggestedExistingSkillName: undefined,
      riskTier: "low",
      autonomyLevelCeiling: 1,
      lifecycleStatus:
        previous?.lifecycleStatus && previous.lifecycleStatus !== "superseded"
          ? previous.lifecycleStatus
          : "detected",
      installTargets: ["workspace_skills_dir"],
      evalStatus: previous?.evalStatus ?? "not_started",
      vettingStatus: previous?.vettingStatus ?? "not_started",
      canaryStatus: previous?.canaryStatus ?? "not_started",
      createdAt: previous?.createdAt ?? generatedAt,
      updatedAt: generatedAt,
      provenanceRefs: uniqueSortedStrings(
        supportingActivities.flatMap((activity) => activity.sourceRefs),
      ),
      rollbackPlan: previous?.rollbackPlan ?? {
        rollbackId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_skill_candidate_rollback",
          targetId: skillCandidateId,
          seed: "disable_candidate_only",
        }),
        strategy: "disable_candidate_only",
        targetPaths: ["workspace_skills_dir"],
        directMainMutationAllowed: false,
      },
      sourceProfileIds: uniqueSortedStrings(
        supportingActivities.map((activity) => activity.sourceProfileId),
      ) as SourceProfileId[],
      authorityTiers: uniqueSortedStrings(
        supportingActivities.map((activity) => activity.authorityTier),
      ) as SourceAuthorityTier[],
      contentHashes: uniqueSortedStrings([
        ...supportingActivities.map(
          (activity) => activity.contentHash ?? hash(activity.boundedText),
        ),
        ...group.candidates.flatMap((candidate) => candidate.contentHashes),
      ]),
      proofHashes: uniqueSortedStrings([
        ...supportingActivities.map((activity) => activity.proofHash ?? hash(activity.sourceId)),
        ...group.candidates.flatMap((candidate) => candidate.proofHashes),
      ]),
      noDarkDataStatus:
        supportingActivities.every(
          (activity) => (activity.noDarkDataStatus ?? "pass") === "pass",
        ) && group.candidates.every((candidate) => candidate.noDarkDataStatus === "pass")
          ? "pass"
          : "fail",
    };
    records.push(record);
    if (record.lifecycleStatus === "rejected" || record.lifecycleStatus === "disabled") {
      continue;
    }
    opportunities.push({
      sourceFamily: "skill_candidate",
      opportunityClass: "skill_candidate",
      opportunityId: record.proactivityOpportunityId,
      projectId: group.projectId,
      sessionKey: group.sessionKey,
      workItemKind: "planning_request",
      title: `Turn ${humanLabel} into a reusable skill`,
      whyNow: compact(
        repeatedCount >= 2
          ? `This same bounded work surfaced ${repeatedCount} times in recent ${group.projectId} work${hasExplicitRequestSupport ? " and the user explicitly asked for skill coverage" : ""}.`
          : `The user explicitly asked for skill-oriented reuse and recent ${group.projectId} work already produced a concrete bounded example.`,
        180,
      ),
      proposedNextStep: compact(
        `Plan a bounded ${normalizedSkillName} skill candidate: define the reusable workflow, success checks, and safest initial target path before generating any skill package.`,
        220,
      ),
      expectedUserValue:
        "Converts repeated manual work into a reusable skill for OpenClaw and Codex without re-solving the same task each session.",
      evidenceSummary,
      confidence: repeatedCount >= 2 && hasExplicitRequestSupport ? "high" : "medium",
      sourceRefs: record.provenanceRefs,
      sourceProfileIds: record.sourceProfileIds,
      authorityTiers: record.authorityTiers,
      contentHashes: record.contentHashes,
      proofHashes: record.proofHashes,
      blockedReasonCodes: [],
      noDarkDataStatus: record.noDarkDataStatus,
      generatedAt,
      skillCandidate: record,
    });
  }

  const dedupedRecords = dedupeRecords(records);
  const checks: Phase2SkillCandidateLedgerCheck[] = [];
  addCheck(
    checks,
    "bounded_evidence_only",
    dedupedRecords.every((record) => record.evidenceSummary.length <= 180),
  );
  addCheck(
    checks,
    "deterministic_ids_required",
    dedupedRecords.every((record) =>
      Boolean(record.skillCandidateId && record.proactivityOpportunityId),
    ),
  );
  addCheck(checks, "deterministic_dedupe_only", true);
  addCheck(
    checks,
    "provenance_required",
    dedupedRecords.every((record) => record.provenanceRefs.length > 0),
  );
  addCheck(
    checks,
    "no_dark_data_required",
    dedupedRecords.every((record) => record.noDarkDataStatus === "pass"),
  );
  addCheck(checks, "raw_transcript_excluded", true);

  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_skill_candidate_ledger_report",
    targetId: activities[0]?.sessionKey ?? "main",
    seed: {
      generatedAt,
      skillCandidateIds: dedupedRecords.map((record) => record.skillCandidateId),
    },
  });
  const telemetry: Phase2SkillCandidateLedgerTelemetry = {
    schemaVersion: PHASE2_SKILL_CANDIDATE_LEDGER_SCHEMA_VERSION,
    reportId,
    activityCount: activities.length,
    assistantCandidateCount: assistantCandidates.length,
    recordCount: dedupedRecords.length,
    opportunityCount: opportunities.length,
    sourceRefs: uniqueSortedStrings(dedupedRecords.flatMap((record) => record.provenanceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      dedupedRecords.flatMap((record) => record.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      dedupedRecords.flatMap((record) => record.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(dedupedRecords.flatMap((record) => record.contentHashes)),
    proofHashes: uniqueSortedStrings(dedupedRecords.flatMap((record) => record.proofHashes)),
    noDarkDataStatus: dedupedRecords.every((record) => record.noDarkDataStatus === "pass")
      ? "pass"
      : "fail",
  };
  const report: Phase2SkillCandidateLedgerReport = {
    schemaVersion: PHASE2_SKILL_CANDIDATE_LEDGER_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision: opportunities.length > 0 ? "skill_candidates_ready" : "no_skill_candidates",
    records: dedupedRecords,
    opportunities: opportunities.filter(
      (opportunity, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.skillCandidate.skillCandidateId ===
            opportunity.skillCandidate.skillCandidateId,
        ) === index,
    ),
    checks,
    telemetry,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}
