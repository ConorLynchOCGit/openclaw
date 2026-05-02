import fs from "node:fs/promises";
import path from "node:path";
import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2LiveProactivityOpportunity } from "./phase2-live-proactivity-signals.ts";
import type {
  Phase2OpportunityExtractionCandidate,
  Phase2OpportunityExtractionSource,
} from "./phase2-proactivity-opportunity-extraction.ts";
import type { Phase2ProactivityWorkItemKind } from "./phase2-proactivity-work-items.ts";
import type {
  Phase2SkillCandidateOpportunity,
  Phase2SkillCandidateRecord,
} from "./phase2-skill-candidate-ledger.ts";
import { buildProactivityUserFacingFocusKey } from "./proactivity-text.ts";

export const PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_SCHEMA_VERSION =
  "phase2_proactivity_opportunity_ledger.v1" as const;
export const PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_opportunity_ledger_report.v1" as const;

export type Phase2OpportunityLifecycleStatus =
  | "open"
  | "surfaced"
  | "draft_ready"
  | "planning_started"
  | "planned"
  | "in_progress"
  | "done"
  | "dismissed"
  | "snoozed"
  | "superseded"
  | "stale";

export type Phase2OpportunityResolutionSignal = {
  signalId: string;
  opportunityId: string;
  sourceMessageId: string;
  reasonCode: "assistant_marked_done" | "user_marked_handled" | "handoff_completed";
};

export type Phase2OpportunitySupersessionSignal = {
  signalId: string;
  opportunityId: string;
  supersededByOpportunityId: string;
  reasonCode: "duplicate_replaced" | "assistant_marked_superseded" | "docs_state_transition";
};

export type Phase2OpportunityLedgerSource =
  | (Phase2LiveProactivityOpportunity & {
      sourceFamily: "live_signal";
      projectId: string;
      sessionKey: string;
      generatedAt?: string;
    })
  | (Phase2OpportunityExtractionCandidate & { sourceFamily: "assistant_output" })
  | Phase2SkillCandidateOpportunity
  | {
      sourceFamily: "pattern_or_followup";
      opportunityClass?:
        | "proactive_plan"
        | "reverse_prompt"
        | "followup"
        | "delight"
        | "self_healing"
        | "recovery";
      opportunityId: string;
      projectId: string;
      sessionKey: string;
      title: string;
      whyNow: string;
      proposedNextStep: string;
      expectedUserValue: string;
      evidenceSummary: string;
      confidence: "high" | "medium" | "low";
      sourceRefs: string[];
      sourceProfileIds: SourceProfileId[];
      authorityTiers: SourceAuthorityTier[];
      contentHashes: string[];
      proofHashes: string[];
      noDarkDataStatus: "pass" | "fail";
      blockedReasonCodes: string[];
      workItemKind: Phase2ProactivityWorkItemKind;
      generatedAt?: string;
    };

export type Phase2OpportunityLedgerEntry = {
  opportunityId: string;
  workItemId: string;
  candidateId: string;
  queueItemId: string;
  sourceFamily: Phase2OpportunityLedgerSource["sourceFamily"];
  opportunityClass?:
    | "skill_candidate"
    | "proactive_plan"
    | "reverse_prompt"
    | "followup"
    | "delight"
    | "self_healing"
    | "recovery";
  skillCandidate?: Phase2SkillCandidateRecord;
  projectId: string;
  sessionKey: string;
  title: string;
  whyNow: string;
  proposedNextStep: string;
  expectedUserValue: string;
  evidenceSummary: string;
  confidence: "high" | "medium" | "low";
  workItemKind: Phase2ProactivityWorkItemKind;
  status: Phase2OpportunityLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
  resolvedByChatMessageId: string | null;
  supersededByOpportunityId: string | null;
  dismissalCooldownUntil?: string | null;
  plannedArtifact?: Phase2OpportunityPlannedArtifact | null;
  reviewStatus?: "pending_review" | "recommendation_finalized" | "revision_requested";
  attentionRequired: boolean;
  staleLabels: string[];
  conflictLabels: string[];
  noDarkDataStatus: "pass" | "fail";
  generatedAt: string;
  updatedAt: string;
};

export type Phase2OpportunityLedgerState = {
  ledgerId: string;
  entries: Phase2OpportunityLedgerEntry[];
};

export type Phase2OpportunityLedgerLifecycleOverride = {
  opportunityId: string;
  status: Exclude<Phase2OpportunityLifecycleStatus, "stale">;
  updatedAt?: string;
  resolvedByChatMessageId?: string | null;
  supersededByOpportunityId?: string | null;
  dismissalCooldownUntil?: string | null;
  plannedArtifact?: Phase2OpportunityPlannedArtifact | null;
  reviewStatus?: "pending_review" | "recommendation_finalized" | "revision_requested";
};

export type Phase2OpportunityPlannedArtifact = {
  status: "requested" | "compiled" | "failed";
  reviewStatus?: "pending_review" | "recommendation_finalized" | "revision_requested";
  title: string;
  requestSummary: string;
  compiledPlan?: string;
  sourceRunId?: string;
  sourceMessageId?: string;
  generatedAt: string;
  updatedAt: string;
  contentHash?: string;
};

export type Phase2OpportunityLedgerCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "opportunity_source_required"
    | "provenance_required"
    | "no_dark_data_required"
    | "canonical_ids_required"
    | "resolved_items_not_actionable"
    | "superseded_items_not_actionable"
    | "deterministic_supersession_only";
};

export type Phase2OpportunityLedgerTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_SCHEMA_VERSION;
  reportId: string;
  entryCount: number;
  actionableCount: number;
  resolvedCount: number;
  supersededCount: number;
  staleCount: number;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2OpportunityLedgerRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_LEDGER_DISABLED";
  targetMode: "queue_first_live_candidates";
  disablesLedgerFirstState: true;
};

export type Phase2OpportunityLedgerDecision =
  | "ledger_ready"
  | "no_opportunities"
  | "blocked"
  | "rollback_disabled";

export type Phase2OpportunityLedgerReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2OpportunityLedgerDecision;
  ledger: Phase2OpportunityLedgerState;
  resolutionSignals: Phase2OpportunityResolutionSignal[];
  supersessionSignals: Phase2OpportunitySupersessionSignal[];
  checks: Phase2OpportunityLedgerCheck[];
  telemetry: Phase2OpportunityLedgerTelemetry;
  rollbackPlan: Phase2OpportunityLedgerRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2OpportunityLedgerInput = {
  now?: Date;
  repoRoot?: string;
  opportunities?: Phase2OpportunityLedgerSource[];
  activitySources?: Phase2OpportunityExtractionSource[];
  lifecycleOverrides?: Phase2OpportunityLedgerLifecycleOverride[];
  env?: Record<string, string | undefined>;
};

const RESOLUTION_MARKERS = /\b(done|completed|implemented|resolved|handled|closed|already done)\b/i;
const SUPERSESSION_MARKERS = /\b(superseded|obsolete|replaced|no longer needed)\b/i;
const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_LEDGER_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function lifecycleOverrideActive(
  override: Phase2OpportunityLedgerLifecycleOverride,
  generatedAt: string,
): boolean {
  if (override.status !== "dismissed" || !override.dismissalCooldownUntil) {
    return true;
  }
  const expiresAt = Date.parse(override.dismissalCooldownUntil);
  const now = Date.parse(generatedAt);
  return Number.isFinite(expiresAt) && Number.isFinite(now) ? expiresAt > now : true;
}

function assertNoDarkData(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(
        `phase2 proactivity opportunity ledger contains prohibited marker: ${marker}`,
      );
    }
  }
}

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function compact(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

async function maybeReadFileHash(repoRoot: string, sourceRef: string): Promise<string | null> {
  if (/^[a-z]+:\/\//iu.test(sourceRef)) {
    return null;
  }
  try {
    const filePath = path.resolve(repoRoot, sourceRef);
    const contents = await fs.readFile(filePath, "utf8");
    return hash({ sourceRef, contents });
  } catch {
    return null;
  }
}

function addCheck(
  checks: Phase2OpportunityLedgerCheck[],
  reasonCode: Phase2OpportunityLedgerCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_opportunity_ledger:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function entryFromOpportunity(
  opportunity: Phase2OpportunityLedgerSource,
  generatedAt: string,
): Phase2OpportunityLedgerEntry {
  const workItemKind = opportunity.workItemKind;
  const title = compact(opportunity.title, 96);
  const whyNow = compact(opportunity.whyNow, 220);
  const proposedNextStep = compact(opportunity.proposedNextStep, 240);
  const contentHashes = uniqueSortedStrings(opportunity.contentHashes);
  const proofHashes = uniqueSortedStrings(opportunity.proofHashes);
  return {
    opportunityId: opportunity.opportunityId,
    workItemId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_ledger_work_item",
      targetId: opportunity.opportunityId,
      seed: { title, contentHashes },
    }),
    candidateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_ledger_candidate",
      targetId: opportunity.opportunityId,
      seed: { proofHashes },
    }),
    queueItemId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_ledger_queue_item",
      targetId: opportunity.opportunityId,
      seed: { contentHashes, proofHashes },
    }),
    sourceFamily: opportunity.sourceFamily,
    opportunityClass: "opportunityClass" in opportunity ? opportunity.opportunityClass : undefined,
    skillCandidate: "skillCandidate" in opportunity ? opportunity.skillCandidate : undefined,
    projectId: opportunity.projectId,
    sessionKey: opportunity.sessionKey,
    title,
    whyNow,
    proposedNextStep,
    expectedUserValue: compact(opportunity.expectedUserValue, 220),
    evidenceSummary: compact(opportunity.evidenceSummary, 220),
    confidence: opportunity.confidence,
    workItemKind,
    status: "open",
    sourceRefs: uniqueSortedStrings(opportunity.sourceRefs),
    sourceProfileIds: uniqueSortedStrings(opportunity.sourceProfileIds) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(opportunity.authorityTiers) as SourceAuthorityTier[],
    contentHashes,
    proofHashes,
    blockedReasonCodes: [...opportunity.blockedReasonCodes],
    resolvedByChatMessageId: null,
    supersededByOpportunityId: null,
    dismissalCooldownUntil: null,
    plannedArtifact: null,
    reviewStatus: undefined,
    attentionRequired:
      opportunity.sourceFamily !== "assistant_output" ||
      opportunity.workItemKind === "investigation_request",
    staleLabels: "staleLabels" in opportunity ? [...opportunity.staleLabels] : [],
    conflictLabels: "conflictLabels" in opportunity ? [...opportunity.conflictLabels] : [],
    noDarkDataStatus: opportunity.noDarkDataStatus,
    generatedAt: opportunity.generatedAt ?? generatedAt,
    updatedAt: opportunity.generatedAt ?? generatedAt,
  };
}

function clearAttentionForInactiveStatus(entry: Phase2OpportunityLedgerEntry): void {
  if (
    entry.status === "done" ||
    entry.status === "superseded" ||
    entry.status === "stale" ||
    entry.status === "dismissed" ||
    entry.status === "snoozed"
  ) {
    entry.attentionRequired = false;
  }
}

function duplicateCollapseEligible(entry: Phase2OpportunityLedgerEntry): boolean {
  return (
    entry.sourceFamily === "assistant_output" ||
    entry.blockedReasonCodes.includes("model_reviewed_candidate")
  );
}

function duplicateCollapseSourceRefKey(entry: Phase2OpportunityLedgerEntry): string | null {
  if (!duplicateCollapseEligible(entry)) {
    return null;
  }
  const assistantSourceRef = entry.sourceRefs
    .filter((sourceRef) => sourceRef.startsWith(`chat://${entry.sessionKey}/assistant_turn/`))
    .toSorted()[0];
  if (!assistantSourceRef) {
    return null;
  }
  return [entry.projectId, entry.sessionKey, entry.workItemKind, assistantSourceRef].join("::");
}

function duplicateCollapseTitleFocusKey(entry: Phase2OpportunityLedgerEntry): string | null {
  if (!duplicateCollapseEligible(entry)) {
    return null;
  }
  const titleFocus = buildProactivityUserFacingFocusKey(entry.title);
  if (!titleFocus) {
    return null;
  }
  return [entry.projectId, entry.sessionKey, entry.workItemKind, titleFocus].join("::");
}

function duplicateCollapseNextStepFocusKey(entry: Phase2OpportunityLedgerEntry): string | null {
  if (!duplicateCollapseEligible(entry)) {
    return null;
  }
  const nextStepFocus = buildProactivityUserFacingFocusKey(entry.proposedNextStep);
  if (!nextStepFocus) {
    return null;
  }
  return [entry.projectId, entry.sessionKey, entry.workItemKind, nextStepFocus].join("::");
}

function mergeDuplicateProvenance(
  canonical: Phase2OpportunityLedgerEntry,
  duplicate: Phase2OpportunityLedgerEntry,
): void {
  canonical.sourceRefs = uniqueSortedStrings([...canonical.sourceRefs, ...duplicate.sourceRefs]);
  canonical.sourceProfileIds = uniqueSortedStrings([
    ...canonical.sourceProfileIds,
    ...duplicate.sourceProfileIds,
  ]) as SourceProfileId[];
  canonical.authorityTiers = uniqueSortedStrings([
    ...canonical.authorityTiers,
    ...duplicate.authorityTiers,
  ]) as SourceAuthorityTier[];
  canonical.contentHashes = uniqueSortedStrings([
    ...canonical.contentHashes,
    ...duplicate.contentHashes,
  ]);
  canonical.proofHashes = uniqueSortedStrings([...canonical.proofHashes, ...duplicate.proofHashes]);
  canonical.blockedReasonCodes = uniqueSortedStrings([
    ...canonical.blockedReasonCodes,
    ...duplicate.blockedReasonCodes,
  ]);
}

function collapseDuplicateEntryGroups(params: {
  entries: Phase2OpportunityLedgerEntry[];
  generatedAt: string;
  supersessionSignals: Phase2OpportunitySupersessionSignal[];
  keyResolver: (entry: Phase2OpportunityLedgerEntry) => string | null;
}): void {
  const duplicateGroups = new Map<string, Phase2OpportunityLedgerEntry[]>();
  for (const entry of params.entries) {
    const key = params.keyResolver(entry);
    if (!key) {
      continue;
    }
    const group = duplicateGroups.get(key);
    if (group) {
      group.push(entry);
    } else {
      duplicateGroups.set(key, [entry]);
    }
  }

  for (const group of duplicateGroups.values()) {
    if (group.length < 2) {
      continue;
    }
    const sorted = [...group].toSorted((left, right) => {
      const leftPriority =
        Number(
          left.status === "open" || left.status === "surfaced" || left.status === "draft_ready",
        ) + left.proposedNextStep.length;
      const rightPriority =
        Number(
          right.status === "open" || right.status === "surfaced" || right.status === "draft_ready",
        ) + right.proposedNextStep.length;
      return (
        rightPriority - leftPriority ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.generatedAt.localeCompare(left.generatedAt) ||
        right.opportunityId.localeCompare(left.opportunityId)
      );
    });
    const canonical = sorted[0];
    for (const duplicate of sorted.slice(1)) {
      if (
        duplicate.opportunityId === canonical.opportunityId ||
        duplicate.status === "superseded" ||
        duplicate.supersededByOpportunityId === canonical.opportunityId
      ) {
        continue;
      }
      duplicate.status = "superseded";
      duplicate.supersededByOpportunityId = canonical.opportunityId;
      duplicate.updatedAt = params.generatedAt;
      clearAttentionForInactiveStatus(duplicate);
      mergeDuplicateProvenance(canonical, duplicate);
      params.supersessionSignals.push({
        signalId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_proactivity_supersession_signal",
          targetId: duplicate.opportunityId,
          seed: canonical.opportunityId,
        }),
        opportunityId: duplicate.opportunityId,
        supersededByOpportunityId: canonical.opportunityId,
        reasonCode: "duplicate_replaced",
      });
    }
    canonical.updatedAt = params.generatedAt;
  }
}

export async function buildPhase2ProactivityOpportunityLedgerReport(
  input: Phase2OpportunityLedgerInput = {},
): Promise<Phase2OpportunityLedgerReport> {
  assertNoDarkData(input.opportunities ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const repoRoot = input.repoRoot ?? process.cwd();
  const opportunities = input.opportunities ?? [];
  const entries = opportunities.map((opportunity) =>
    entryFromOpportunity(opportunity, generatedAt),
  );
  const overrides = new Map(
    (input.lifecycleOverrides ?? [])
      .filter((override) => lifecycleOverrideActive(override, generatedAt))
      .map((override) => [override.opportunityId, override]),
  );
  const resolutionSignals: Phase2OpportunityResolutionSignal[] = [];
  const supersessionSignals: Phase2OpportunitySupersessionSignal[] = [];

  for (const entry of entries) {
    const override = overrides.get(entry.opportunityId);
    if (override) {
      entry.status = override.status;
      entry.updatedAt = override.updatedAt ?? generatedAt;
      entry.resolvedByChatMessageId = override.resolvedByChatMessageId ?? null;
      entry.supersededByOpportunityId = override.supersededByOpportunityId ?? null;
      entry.dismissalCooldownUntil = override.dismissalCooldownUntil ?? null;
      entry.plannedArtifact = override.plannedArtifact ?? null;
      entry.reviewStatus = override.reviewStatus ?? override.plannedArtifact?.reviewStatus;
      clearAttentionForInactiveStatus(entry);
    }

    for (const source of input.activitySources ?? []) {
      if (source.sourceRefs.some((sourceRef) => entry.sourceRefs.includes(sourceRef))) {
        continue;
      }
      const sourceText = normalizeText(source.boundedText);
      const title = normalizeText(entry.title);
      if (!sourceText.includes(title)) {
        continue;
      }
      if (RESOLUTION_MARKERS.test(source.boundedText)) {
        entry.status = "done";
        entry.resolvedByChatMessageId = source.sourceMessageId;
        entry.updatedAt = generatedAt;
        clearAttentionForInactiveStatus(entry);
        resolutionSignals.push({
          signalId: buildDerivedArtifactId({
            family: "context_artifact",
            artifactType: "phase2_proactivity_resolution_signal",
            targetId: entry.opportunityId,
            seed: source.sourceMessageId,
          }),
          opportunityId: entry.opportunityId,
          sourceMessageId: source.sourceMessageId,
          reasonCode:
            source.sourceKind === "assistant_turn" || source.sourceKind === "planning_output"
              ? "assistant_marked_done"
              : "user_marked_handled",
        });
      } else if (SUPERSESSION_MARKERS.test(source.boundedText)) {
        entry.status = "superseded";
        entry.updatedAt = generatedAt;
        clearAttentionForInactiveStatus(entry);
        supersessionSignals.push({
          signalId: buildDerivedArtifactId({
            family: "context_artifact",
            artifactType: "phase2_proactivity_supersession_signal",
            targetId: entry.opportunityId,
            seed: source.sourceMessageId,
          }),
          opportunityId: entry.opportunityId,
          supersededByOpportunityId: entry.supersededByOpportunityId ?? entry.opportunityId,
          reasonCode: "assistant_marked_superseded",
        });
      }
    }

    if (
      entry.status !== "done" &&
      entry.status !== "superseded" &&
      entry.status !== "dismissed" &&
      entry.status !== "snoozed"
    ) {
      for (const sourceRef of entry.sourceRefs) {
        const currentHash = await maybeReadFileHash(repoRoot, sourceRef);
        if (currentHash && !entry.contentHashes.includes(currentHash)) {
          entry.status = "stale";
          entry.staleLabels = uniqueSortedStrings([
            ...entry.staleLabels,
            "source_ref_state_changed",
          ]);
          entry.updatedAt = generatedAt;
          clearAttentionForInactiveStatus(entry);
          supersessionSignals.push({
            signalId: buildDerivedArtifactId({
              family: "context_artifact",
              artifactType: "phase2_proactivity_supersession_signal",
              targetId: entry.opportunityId,
              seed: currentHash,
            }),
            opportunityId: entry.opportunityId,
            supersededByOpportunityId: entry.opportunityId,
            reasonCode: "docs_state_transition",
          });
          break;
        }
      }
    }
  }

  collapseDuplicateEntryGroups({
    entries,
    generatedAt,
    supersessionSignals,
    keyResolver: duplicateCollapseSourceRefKey,
  });
  collapseDuplicateEntryGroups({
    entries,
    generatedAt,
    supersessionSignals,
    keyResolver: duplicateCollapseTitleFocusKey,
  });
  collapseDuplicateEntryGroups({
    entries,
    generatedAt,
    supersessionSignals,
    keyResolver: duplicateCollapseNextStepFocusKey,
  });

  const checks: Phase2OpportunityLedgerCheck[] = [];
  addCheck(checks, "opportunity_source_required", opportunities.length > 0);
  addCheck(
    checks,
    "provenance_required",
    entries.every((entry) => entry.sourceRefs.length > 0),
  );
  addCheck(
    checks,
    "no_dark_data_required",
    entries.every((entry) => entry.noDarkDataStatus === "pass"),
  );
  addCheck(
    checks,
    "canonical_ids_required",
    entries.every((entry) => Boolean(entry.workItemId && entry.candidateId && entry.queueItemId)),
  );
  addCheck(
    checks,
    "resolved_items_not_actionable",
    entries.filter((entry) => entry.status === "done").every((entry) => !entry.attentionRequired),
  );
  addCheck(
    checks,
    "superseded_items_not_actionable",
    entries
      .filter((entry) => entry.status === "superseded" || entry.status === "stale")
      .every((entry) => !entry.attentionRequired),
  );
  addCheck(checks, "deterministic_supersession_only", true);

  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_opportunity_ledger_report",
    targetId: entries[0]?.sessionKey ?? "main",
    seed: {
      generatedAt,
      opportunityIds: entries.map((entry) => entry.opportunityId),
      statuses: entries.map((entry) => entry.status),
    },
  });
  const actionableEntries = entries.filter(
    (entry) =>
      entry.status === "open" ||
      entry.status === "surfaced" ||
      entry.status === "draft_ready" ||
      entry.status === "planning_started" ||
      entry.status === "planned" ||
      entry.status === "in_progress",
  );
  const decision: Phase2OpportunityLedgerDecision = rollback
    ? "rollback_disabled"
    : entries.length === 0
      ? "no_opportunities"
      : checks.some(
            (check) =>
              check.status === "fail" && check.reasonCode !== "opportunity_source_required",
          )
        ? "blocked"
        : "ledger_ready";
  const telemetry: Phase2OpportunityLedgerTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_SCHEMA_VERSION,
    reportId,
    entryCount: entries.length,
    actionableCount: actionableEntries.length,
    resolvedCount: entries.filter((entry) => entry.status === "done").length,
    supersededCount: entries.filter((entry) => entry.status === "superseded").length,
    staleCount: entries.filter((entry) => entry.status === "stale").length,
    sourceRefs: uniqueSortedStrings(entries.flatMap((entry) => entry.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      entries.flatMap((entry) => entry.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      entries.flatMap((entry) => entry.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(entries.flatMap((entry) => entry.contentHashes)),
    proofHashes: uniqueSortedStrings(entries.flatMap((entry) => entry.proofHashes)),
    noDarkDataStatus: checks.some(
      (check) => check.reasonCode === "no_dark_data_required" && check.status === "fail",
    )
      ? "fail"
      : "pass",
  };
  const report: Phase2OpportunityLedgerReport = {
    schemaVersion: PHASE2_PROACTIVITY_OPPORTUNITY_LEDGER_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    ledger: {
      ledgerId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_opportunity_ledger",
        targetId: reportId,
        seed: entries.map((entry) => entry.opportunityId),
      }),
      entries: decision === "ledger_ready" ? entries : [],
    },
    resolutionSignals,
    supersessionSignals,
    checks,
    telemetry,
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_proactivity_opportunity_ledger_rollback",
        targetId: reportId,
        seed: decision,
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_LEDGER_DISABLED",
      targetMode: "queue_first_live_candidates",
      disablesLedgerFirstState: true,
    },
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}
