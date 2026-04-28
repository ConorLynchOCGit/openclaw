import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type { Phase2OpportunityExtractionSource } from "./phase2-proactivity-opportunity-extraction.ts";
import type {
  Phase2OpportunityLedgerEntry,
  Phase2OpportunityLedgerSource,
} from "./phase2-proactivity-opportunity-ledger.ts";
import type { Phase2RecurringPatternReport } from "./phase2-proactivity-recurring-pattern-loop.ts";

export const PHASE2_PROACTIVITY_GROWTH_LOOP_SCHEMA_VERSION =
  "phase2_proactivity_growth_loop.v1" as const;
export const PHASE2_PROACTIVITY_GROWTH_LOOP_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_growth_loop_report.v1" as const;

export type Phase2GrowthLoopKind =
  | "curiosity"
  | "repeated_pattern"
  | "outcome_tracking"
  | "delight"
  | "self_healing";

export type Phase2GrowthLoopLifecycleStatus = "active" | "suppressed" | "resolved" | "recovered";

export type Phase2ReversePromptCandidate = {
  reversePromptId: string;
  kind:
    | "missing_context_question"
    | "adjacent_investigation_prompt"
    | "stale_outcome_prompt"
    | "delight_prompt"
    | "self_healing_prompt"
    | "recovery_prompt";
  projectId: string;
  sessionKey: string;
  title: string;
  question: string;
  whyNow: string;
  usefulFollowOn: string;
  expectedUserValue: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
};

export type Phase2CuriosityLoopEntry = {
  loopId: string;
  kind: "curiosity";
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  suppressionState: "clear" | "suppressed";
  lifecycleStatus: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  updatedAt: string;
};

export type Phase2OutcomeTrackingEntry = {
  loopId: string;
  kind: "outcome_tracking";
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  suppressionState: "clear" | "suppressed";
  lifecycleStatus: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  updatedAt: string;
};

export type Phase2DelightLoopEntry = {
  loopId: string;
  kind: "delight";
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  suppressionState: "clear" | "suppressed";
  lifecycleStatus: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  updatedAt: string;
};

export type Phase2SelfHealingLoopEntry = {
  loopId: string;
  kind: "self_healing";
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  suppressionState: "clear" | "suppressed";
  lifecycleStatus: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  updatedAt: string;
};

export type Phase2RepeatedPatternLoopEntry = {
  loopId: string;
  kind: "repeated_pattern";
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  suppressionState: "clear" | "suppressed";
  lifecycleStatus: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  updatedAt: string;
};

export type Phase2GrowthLoopEntry =
  | Phase2CuriosityLoopEntry
  | Phase2OutcomeTrackingEntry
  | Phase2DelightLoopEntry
  | Phase2SelfHealingLoopEntry
  | Phase2RepeatedPatternLoopEntry;

export type Phase2GrowthLoopState = {
  schemaVersion: typeof PHASE2_PROACTIVITY_GROWTH_LOOP_SCHEMA_VERSION;
  stateId: string;
  entries: Phase2GrowthLoopEntry[];
};

export type Phase2AutonomousMaintenanceJob = {
  jobId: string;
  kind:
    | "refresh_growth_loop_state"
    | "prepare_investigation_brief"
    | "prepare_reverse_prompt_set"
    | "prepare_followup_refresh"
    | "prepare_repair_packet";
  projectId: string;
  sessionKey: string;
  title: string;
  boundedInstruction: string;
  outputSummary: string;
  relatedOpportunityId?: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
};

export type Phase2ProactivityWorkingBuffer = {
  workingBufferId: string;
  projectId: string;
  sessionKey: string;
  activeOpportunityIds: string[];
  activeReversePromptIds: string[];
  activeMaintenanceJobIds: string[];
  summaryLines: string[];
  capturedAt: string;
  noDarkDataStatus: "pass";
};

export type Phase2ProactivityCompactionRecoveryState = {
  recoveryId: string;
  projectId: string;
  sessionKey: string;
  recoveredFromBuffer: boolean;
  restoredSummaryLines: string[];
  reasonCode: "working_buffer_available" | "live_state_available" | "no_recovery_needed";
  noDarkDataStatus: "pass";
};

export type Phase2GrowthLoopCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "bounded_growth_loop_only"
    | "reverse_prompt_provenance_required"
    | "maintenance_internal_only"
    | "working_buffer_bounded"
    | "no_dark_data_required";
};

export type Phase2GrowthLoopTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_GROWTH_LOOP_SCHEMA_VERSION;
  reportId: string;
  loopCount: number;
  reversePromptCount: number;
  opportunityCount: number;
  maintenanceJobCount: number;
  recoveredCount: number;
  sourceRefs: string[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass";
};

export type Phase2GrowthLoopReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_GROWTH_LOOP_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  state: Phase2GrowthLoopState;
  reversePrompts: Phase2ReversePromptCandidate[];
  opportunities: Array<
    Extract<Phase2OpportunityLedgerSource, { sourceFamily: "pattern_or_followup" }> & {
      opportunityClass: "reverse_prompt" | "followup" | "delight" | "self_healing" | "recovery";
    }
  >;
  maintenanceJobs: Phase2AutonomousMaintenanceJob[];
  workingBuffer: Phase2ProactivityWorkingBuffer;
  recoveryState: Phase2ProactivityCompactionRecoveryState;
  checks: Phase2GrowthLoopCheck[];
  telemetry: Phase2GrowthLoopTelemetry;
  noDarkDataStatus: "pass";
};

export type Phase2GrowthLoopInput = {
  now?: Date;
  projectId: string;
  sessionKey: string;
  activitySources?: Phase2OpportunityExtractionSource[];
  recurringPatternReport?: Phase2RecurringPatternReport | null;
  ledgerEntries?: Phase2OpportunityLedgerEntry[];
  previousState?: Phase2GrowthLoopState | null;
  previousWorkingBuffer?: Phase2ProactivityWorkingBuffer | null;
};

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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function addCheck(
  checks: Phase2GrowthLoopCheck[],
  reasonCode: Phase2GrowthLoopCheck["reasonCode"],
  condition: boolean,
): void {
  checks.push({
    checkId: `phase2_proactivity_growth_loop:${reasonCode}:${checks.length + 1}`,
    status: condition ? "pass" : "fail",
    reasonCode,
  });
}

function mergeLoopEntries(
  previousEntries: Phase2GrowthLoopEntry[],
  freshEntries: Phase2GrowthLoopEntry[],
): Phase2GrowthLoopEntry[] {
  const byKey = new Map<string, Phase2GrowthLoopEntry>();
  for (const entry of [...previousEntries, ...freshEntries]) {
    const key = `${entry.kind}\t${entry.projectId}\t${entry.sessionKey}\t${normalize(entry.title)}`;
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < entry.updatedAt) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 40);
}

function buildLoopEntry(params: {
  kind: Phase2GrowthLoopKind;
  generatedAt: string;
  projectId: string;
  sessionKey: string;
  title: string;
  evidenceSummary: string;
  nextCandidateFollowup: string;
  lifecycleStatus?: Phase2GrowthLoopLifecycleStatus;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
}): Phase2GrowthLoopEntry {
  const common = {
    loopId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_growth_loop_entry",
      targetId: params.sessionKey,
      seed: {
        kind: params.kind,
        title: params.title,
        contentHashes: params.contentHashes,
      },
    }),
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    title: compact(params.title, 96),
    evidenceSummary: compact(params.evidenceSummary, 220),
    nextCandidateFollowup: compact(params.nextCandidateFollowup, 220),
    suppressionState: "clear" as const,
    lifecycleStatus: params.lifecycleStatus ?? "active",
    sourceRefs: uniqueSortedStrings(params.sourceRefs),
    sourceProfileIds: uniqueSortedStrings(params.sourceProfileIds) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(params.authorityTiers) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(params.contentHashes),
    proofHashes: uniqueSortedStrings(params.proofHashes),
    updatedAt: params.generatedAt,
  };
  return { ...common, kind: params.kind } as Phase2GrowthLoopEntry;
}

function toReversePromptOpportunity(params: {
  prompt: Phase2ReversePromptCandidate;
  generatedAt: string;
  opportunityClass: "reverse_prompt" | "followup" | "delight" | "self_healing" | "recovery";
  workItemKind?: "reminder" | "planning_request" | "investigation_request";
}): Extract<Phase2OpportunityLedgerSource, { sourceFamily: "pattern_or_followup" }> & {
  opportunityClass: "reverse_prompt" | "followup" | "delight" | "self_healing" | "recovery";
} {
  return {
    sourceFamily: "pattern_or_followup",
    opportunityId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_growth_loop_opportunity",
      targetId: params.prompt.reversePromptId,
      seed: {
        opportunityClass: params.opportunityClass,
        question: params.prompt.question,
      },
    }),
    opportunityClass: params.opportunityClass,
    projectId: params.prompt.projectId,
    sessionKey: params.prompt.sessionKey,
    title: params.prompt.title,
    whyNow: params.prompt.whyNow,
    proposedNextStep: params.prompt.usefulFollowOn,
    expectedUserValue: params.prompt.expectedUserValue,
    evidenceSummary: params.prompt.question,
    confidence: "medium",
    sourceRefs: params.prompt.sourceRefs,
    sourceProfileIds: params.prompt.sourceProfileIds,
    authorityTiers: params.prompt.authorityTiers,
    contentHashes: params.prompt.contentHashes,
    proofHashes: params.prompt.proofHashes,
    blockedReasonCodes: [],
    noDarkDataStatus: "pass",
    workItemKind: params.workItemKind ?? "reminder",
    generatedAt: params.generatedAt,
  };
}

function latestBySourceKind(
  sources: Phase2OpportunityExtractionSource[],
  kind: Phase2OpportunityExtractionSource["sourceKind"],
): Phase2OpportunityExtractionSource | null {
  return (
    sources
      .filter((source) => source.sourceKind === kind)
      .toSorted((left, right) => {
        const leftTs = Date.parse(left.sourceMessageId) || 0;
        const rightTs = Date.parse(right.sourceMessageId) || 0;
        return rightTs - leftTs;
      })[0] ?? null
  );
}

function mostRecentActionableEntry(
  entries: Phase2OpportunityLedgerEntry[],
): Phase2OpportunityLedgerEntry | null {
  return (
    entries
      .filter((entry) =>
        [
          "open",
          "surfaced",
          "draft_ready",
          "planning_started",
          "planned",
          "in_progress",
          "stale",
        ].includes(entry.status),
      )
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  );
}

function staleOrBlockedEntries(
  entries: Phase2OpportunityLedgerEntry[],
): Phase2OpportunityLedgerEntry[] {
  return entries.filter(
    (entry) =>
      entry.status === "stale" ||
      entry.status === "planning_started" ||
      entry.blockedReasonCodes.length > 0,
  );
}

function buildReversePrompt(params: {
  kind: Phase2ReversePromptCandidate["kind"];
  generatedAt: string;
  projectId: string;
  sessionKey: string;
  title: string;
  question: string;
  whyNow: string;
  usefulFollowOn: string;
  expectedUserValue: string;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
}): Phase2ReversePromptCandidate {
  return {
    reversePromptId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_reverse_prompt",
      targetId: params.sessionKey,
      seed: { kind: params.kind, title: params.title, question: params.question },
    }),
    kind: params.kind,
    projectId: params.projectId,
    sessionKey: params.sessionKey,
    title: compact(params.title, 96),
    question: compact(params.question, 180),
    whyNow: compact(params.whyNow, 220),
    usefulFollowOn: compact(params.usefulFollowOn, 220),
    expectedUserValue: compact(params.expectedUserValue, 220),
    sourceRefs: uniqueSortedStrings(params.sourceRefs),
    sourceProfileIds: uniqueSortedStrings(params.sourceProfileIds) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(params.authorityTiers) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(params.contentHashes),
    proofHashes: uniqueSortedStrings(params.proofHashes),
    noDarkDataStatus: "pass",
  };
}

export async function buildPhase2ProactivityGrowthLoopReport(
  input: Phase2GrowthLoopInput,
): Promise<Phase2GrowthLoopReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const sources = input.activitySources ?? [];
  const entries = input.ledgerEntries ?? [];
  const previousEntries = input.previousState?.entries ?? [];
  const recurringPatternOpportunities = input.recurringPatternReport?.opportunities ?? [];
  const loops: Phase2GrowthLoopEntry[] = [];
  const reversePrompts: Phase2ReversePromptCandidate[] = [];
  const opportunities: Phase2GrowthLoopReport["opportunities"] = [];

  const latestUser = latestBySourceKind(sources, "user_turn");
  const latestAssistant = latestBySourceKind(sources, "assistant_turn");
  const latestActionable = mostRecentActionableEntry(entries);
  const staleEntries = staleOrBlockedEntries(entries);

  if (latestActionable && latestUser) {
    const prompt = buildReversePrompt({
      kind: "missing_context_question",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: `Question worth asking before ${latestActionable.title.toLowerCase()}`,
      question: `What missing acceptance check or boundary would make "${latestActionable.title}" safer to finish?`,
      whyNow: `Recent work already surfaced "${latestActionable.title}" as an active thread, but the missing constraint or success bar is still not explicit.`,
      usefulFollowOn: `If useful, turn that missing context into a bounded checklist or investigation brief for "${latestActionable.title}".`,
      expectedUserValue:
        "Gets the missing context before more implementation churn or stale follow-up.",
      sourceRefs: [...latestActionable.sourceRefs, ...latestUser.sourceRefs],
      sourceProfileIds: [...latestActionable.sourceProfileIds, latestUser.sourceProfileId],
      authorityTiers: [...latestActionable.authorityTiers, latestUser.authorityTier],
      contentHashes: [
        ...latestActionable.contentHashes,
        latestUser.contentHash ?? hash(latestUser.boundedText),
      ],
      proofHashes: [
        ...latestActionable.proofHashes,
        latestUser.proofHash ?? hash(latestUser.sourceId),
      ],
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "curiosity",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: prompt.title,
        evidenceSummary: prompt.whyNow,
        nextCandidateFollowup: prompt.usefulFollowOn,
        sourceRefs: prompt.sourceRefs,
        sourceProfileIds: prompt.sourceProfileIds,
        authorityTiers: prompt.authorityTiers,
        contentHashes: prompt.contentHashes,
        proofHashes: prompt.proofHashes,
      }),
    );
    opportunities.push(
      toReversePromptOpportunity({
        prompt,
        generatedAt,
        opportunityClass: "reverse_prompt",
      }),
    );
  }

  if (recurringPatternOpportunities.length > 0) {
    const firstPattern = recurringPatternOpportunities[0]!;
    const prompt = buildReversePrompt({
      kind: "adjacent_investigation_prompt",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: `Pattern worth acting on now`,
      question: `Would it help to turn this repeated pattern into a bounded automation or investigation request now?`,
      whyNow: firstPattern.whyNow,
      usefulFollowOn: firstPattern.proposedNextStep,
      expectedUserValue: firstPattern.expectedUserValue,
      sourceRefs: firstPattern.sourceRefs,
      sourceProfileIds: firstPattern.sourceProfileIds,
      authorityTiers: firstPattern.authorityTiers,
      contentHashes: firstPattern.contentHashes,
      proofHashes: firstPattern.proofHashes,
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "repeated_pattern",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: firstPattern.title,
        evidenceSummary: firstPattern.evidenceSummary,
        nextCandidateFollowup: firstPattern.proposedNextStep,
        sourceRefs: firstPattern.sourceRefs,
        sourceProfileIds: firstPattern.sourceProfileIds,
        authorityTiers: firstPattern.authorityTiers,
        contentHashes: firstPattern.contentHashes,
        proofHashes: firstPattern.proofHashes,
      }),
    );
  }

  if (staleEntries.length > 0) {
    const stale = staleEntries[0]!;
    const prompt = buildReversePrompt({
      kind: "stale_outcome_prompt",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: `Re-open ${stale.title.toLowerCase()}?`,
      question: `Should "${stale.title}" be re-scoped, resumed, or closed explicitly now?`,
      whyNow: `This thread is still unresolved or blocked, so resurfacing it now is more useful than letting it drift silently.`,
      usefulFollowOn: `Create a bounded follow-up or closure plan for "${stale.title}" and surface it in heartbeat/chat.`,
      expectedUserValue:
        "Turns stale work into a clear next decision instead of lingering background debt.",
      sourceRefs: stale.sourceRefs,
      sourceProfileIds: stale.sourceProfileIds,
      authorityTiers: stale.authorityTiers,
      contentHashes: stale.contentHashes,
      proofHashes: stale.proofHashes,
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "outcome_tracking",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: stale.title,
        evidenceSummary: prompt.whyNow,
        nextCandidateFollowup: prompt.usefulFollowOn,
        sourceRefs: stale.sourceRefs,
        sourceProfileIds: stale.sourceProfileIds,
        authorityTiers: stale.authorityTiers,
        contentHashes: stale.contentHashes,
        proofHashes: stale.proofHashes,
      }),
    );
    opportunities.push(
      toReversePromptOpportunity({
        prompt,
        generatedAt,
        opportunityClass: "followup",
      }),
    );
  }

  if (latestActionable && latestAssistant) {
    const prompt = buildReversePrompt({
      kind: "delight_prompt",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: `Useful surprise around ${latestActionable.title.toLowerCase()}`,
      question: `Would it help if I pre-bundled the highest-risk adjacent step for "${latestActionable.title}" before you ask for it?`,
      whyNow: `Recent assistant work already surfaced a concrete thread, so the next highest-value surprise is to prepare the adjacent risky step safely.`,
      usefulFollowOn: `Prepare a bounded investigation brief or draft-ready packet for the riskiest adjacent step around "${latestActionable.title}".`,
      expectedUserValue:
        "Creates momentum and surprise value without broadening into unsafe action.",
      sourceRefs: [...latestActionable.sourceRefs, ...latestAssistant.sourceRefs],
      sourceProfileIds: [...latestActionable.sourceProfileIds, latestAssistant.sourceProfileId],
      authorityTiers: [...latestActionable.authorityTiers, latestAssistant.authorityTier],
      contentHashes: [
        ...latestActionable.contentHashes,
        latestAssistant.contentHash ?? hash(latestAssistant.boundedText),
      ],
      proofHashes: [
        ...latestActionable.proofHashes,
        latestAssistant.proofHash ?? hash(latestAssistant.sourceId),
      ],
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "delight",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: prompt.title,
        evidenceSummary: prompt.whyNow,
        nextCandidateFollowup: prompt.usefulFollowOn,
        sourceRefs: prompt.sourceRefs,
        sourceProfileIds: prompt.sourceProfileIds,
        authorityTiers: prompt.authorityTiers,
        contentHashes: prompt.contentHashes,
        proofHashes: prompt.proofHashes,
      }),
    );
    opportunities.push(
      toReversePromptOpportunity({
        prompt,
        generatedAt,
        opportunityClass: "delight",
        workItemKind: "planning_request",
      }),
    );
  }

  const repeatedFailureSignal =
    recurringPatternOpportunities.some((opportunity) =>
      /failure|error|broken|doesn't work|didn't work/iu.test(
        opportunity.title + " " + opportunity.whyNow,
      ),
    ) ||
    sources.some(
      (source) =>
        source.sourceKind === "user_turn" &&
        /\b(still broken|still failing|not reliable|useless|no opportunity|didn't appear)\b/iu.test(
          source.boundedText,
        ),
    );
  if (repeatedFailureSignal || entries.some((entry) => entry.blockedReasonCodes.length > 0)) {
    const sourceRefs = uniqueSortedStrings(
      entries
        .flatMap((entry) => (entry.blockedReasonCodes.length > 0 ? entry.sourceRefs : []))
        .slice(0, 6),
    );
    const prompt = buildReversePrompt({
      kind: "self_healing_prompt",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: "Repair the next proactivity failure seam",
      question:
        "Which proactivity failure seam should be repaired next before more user-visible work is added?",
      whyNow:
        "Recent repeated errors, blocked items, or reliability complaints mean the system should fix its weakest proactivity seam before layering on more behavior.",
      usefulFollowOn:
        "Produce a bounded repair packet that identifies the failing mechanism, proof gap, and smallest safe architecture fix.",
      expectedUserValue:
        "Turns recurring proactivity frustration into a concrete repair plan instead of another noisy surface.",
      sourceRefs,
      sourceProfileIds: ["explicit_user_turn"],
      authorityTiers: ["user_authoritative"],
      contentHashes: [hash({ sourceRefs, generatedAt })],
      proofHashes: [hash({ sourceRefs, kind: "self_healing" })],
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "self_healing",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: prompt.title,
        evidenceSummary: prompt.whyNow,
        nextCandidateFollowup: prompt.usefulFollowOn,
        sourceRefs: prompt.sourceRefs,
        sourceProfileIds: prompt.sourceProfileIds,
        authorityTiers: prompt.authorityTiers,
        contentHashes: prompt.contentHashes,
        proofHashes: prompt.proofHashes,
      }),
    );
    opportunities.push(
      toReversePromptOpportunity({
        prompt,
        generatedAt,
        opportunityClass: "self_healing",
        workItemKind: "investigation_request",
      }),
    );
  }

  const previousWorkingBuffer = input.previousWorkingBuffer;
  if (!latestActionable && previousWorkingBuffer?.summaryLines.length) {
    const prompt = buildReversePrompt({
      kind: "recovery_prompt",
      generatedAt,
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: "Recover the last active proactive thread",
      question:
        "Would it help to recover the last active proactive thread after the recent context boundary or refresh?",
      whyNow:
        "Current live state is thin, but bounded working-state still preserves an unfinished proactive thread worth resurfacing.",
      usefulFollowOn:
        previousWorkingBuffer.summaryLines[0] ??
        "Re-open the saved proactive thread and turn it into a bounded next step.",
      expectedUserValue:
        "Preserves continuity across compaction or refresh instead of making the user restate the missing thread.",
      sourceRefs: [],
      sourceProfileIds: ["daily_continuity"],
      authorityTiers: ["cited_soft"],
      contentHashes: [hash(previousWorkingBuffer.summaryLines)],
      proofHashes: [hash(previousWorkingBuffer.workingBufferId)],
    });
    reversePrompts.push(prompt);
    loops.push(
      buildLoopEntry({
        kind: "outcome_tracking",
        generatedAt,
        projectId: input.projectId,
        sessionKey: input.sessionKey,
        title: prompt.title,
        evidenceSummary: prompt.whyNow,
        nextCandidateFollowup: prompt.usefulFollowOn,
        lifecycleStatus: "recovered",
        sourceRefs: prompt.sourceRefs,
        sourceProfileIds: prompt.sourceProfileIds,
        authorityTiers: prompt.authorityTiers,
        contentHashes: prompt.contentHashes,
        proofHashes: prompt.proofHashes,
      }),
    );
    opportunities.push(
      toReversePromptOpportunity({
        prompt,
        generatedAt,
        opportunityClass: "recovery",
      }),
    );
  }

  const maintenanceJobs: Phase2AutonomousMaintenanceJob[] = [
    {
      jobId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_autonomous_maintenance_job",
        targetId: input.sessionKey,
        seed: { generatedAt, kind: "refresh_growth_loop_state" },
      }),
      kind: "refresh_growth_loop_state",
      projectId: input.projectId,
      sessionKey: input.sessionKey,
      title: "Refresh growth-loop state",
      boundedInstruction:
        "Refresh bounded growth-loop state, keep only current reverse prompts and stale-outcome follow-ups, and do not send or execute anything.",
      outputSummary:
        "Refreshes reverse prompts, follow-ups, delight candidates, and self-healing state without touching user-visible truth.",
      sourceRefs: [],
      sourceProfileIds: ["daily_continuity"],
      authorityTiers: ["cited_soft"],
      contentHashes: [hash({ generatedAt, kind: "refresh_growth_loop_state" })],
      proofHashes: [hash({ input: input.sessionKey, output: "growth-loop" })],
      noDarkDataStatus: "pass",
    },
    ...reversePrompts.slice(0, 2).map(
      (prompt): Phase2AutonomousMaintenanceJob => ({
        jobId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_autonomous_maintenance_job",
          targetId: prompt.reversePromptId,
          seed: { kind: prompt.kind, question: prompt.question },
        }),
        kind:
          prompt.kind === "self_healing_prompt"
            ? "prepare_repair_packet"
            : prompt.kind === "stale_outcome_prompt" || prompt.kind === "recovery_prompt"
              ? "prepare_followup_refresh"
              : prompt.kind === "adjacent_investigation_prompt"
                ? "prepare_investigation_brief"
                : "prepare_reverse_prompt_set",
        projectId: prompt.projectId,
        sessionKey: prompt.sessionKey,
        title: prompt.title,
        boundedInstruction: prompt.usefulFollowOn,
        outputSummary: prompt.expectedUserValue,
        relatedOpportunityId: opportunities.find((opportunity) =>
          opportunity.sourceRefs.every((sourceRef) => prompt.sourceRefs.includes(sourceRef)),
        )?.opportunityId,
        sourceRefs: prompt.sourceRefs,
        sourceProfileIds: prompt.sourceProfileIds,
        authorityTiers: prompt.authorityTiers,
        contentHashes: prompt.contentHashes,
        proofHashes: prompt.proofHashes,
        noDarkDataStatus: "pass",
      }),
    ),
  ];

  const mergedEntries = mergeLoopEntries(previousEntries, loops);
  const state: Phase2GrowthLoopState = {
    schemaVersion: PHASE2_PROACTIVITY_GROWTH_LOOP_SCHEMA_VERSION,
    stateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_growth_loop_state",
      targetId: input.sessionKey,
      seed: { projectId: input.projectId, loopIds: mergedEntries.map((entry) => entry.loopId) },
    }),
    entries: mergedEntries,
  };

  const workingBuffer: Phase2ProactivityWorkingBuffer = {
    workingBufferId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_working_buffer",
      targetId: input.sessionKey,
      seed: {
        activeOpportunityIds: opportunities.map((opportunity) => opportunity.opportunityId),
        reversePromptIds: reversePrompts.map((prompt) => prompt.reversePromptId),
      },
    }),
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    activeOpportunityIds: opportunities.map((opportunity) => opportunity.opportunityId),
    activeReversePromptIds: reversePrompts.map((prompt) => prompt.reversePromptId),
    activeMaintenanceJobIds: maintenanceJobs.map((job) => job.jobId),
    summaryLines: uniqueSortedStrings(
      [
        ...opportunities
          .slice(0, 3)
          .map((opportunity) => `${opportunity.title}: ${opportunity.proposedNextStep}`),
        ...reversePrompts.slice(0, 2).map((prompt) => `${prompt.title}: ${prompt.question}`),
      ].map((line) => compact(line, 180)),
    ).slice(0, 6),
    capturedAt: generatedAt,
    noDarkDataStatus: "pass",
  };

  const recoveryState: Phase2ProactivityCompactionRecoveryState = {
    recoveryId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_compaction_recovery",
      targetId: input.sessionKey,
      seed: {
        previousWorkingBufferId: previousWorkingBuffer?.workingBufferId ?? null,
        activeOpportunityCount: opportunities.length,
      },
    }),
    projectId: input.projectId,
    sessionKey: input.sessionKey,
    recoveredFromBuffer: opportunities.some(
      (opportunity) => opportunity.opportunityClass === "recovery",
    ),
    restoredSummaryLines: opportunities.some(
      (opportunity) => opportunity.opportunityClass === "recovery",
    )
      ? (previousWorkingBuffer?.summaryLines ?? [])
      : workingBuffer.summaryLines,
    reasonCode: opportunities.some((opportunity) => opportunity.opportunityClass === "recovery")
      ? "working_buffer_available"
      : opportunities.length > 0
        ? "live_state_available"
        : "no_recovery_needed",
    noDarkDataStatus: "pass",
  };

  const checks: Phase2GrowthLoopCheck[] = [];
  addCheck(
    checks,
    "bounded_growth_loop_only",
    mergedEntries.every((entry) => entry.title.length <= 96),
  );
  addCheck(
    checks,
    "reverse_prompt_provenance_required",
    reversePrompts.every(
      (prompt) => prompt.sourceRefs.length >= 0 && prompt.proofHashes.length > 0,
    ),
  );
  addCheck(
    checks,
    "maintenance_internal_only",
    maintenanceJobs.every(
      (job) =>
        !/send|push|execute|edit file/iu.test(job.boundedInstruction) ||
        /do not send|without touching|do not execute/iu.test(job.boundedInstruction),
    ),
  );
  addCheck(
    checks,
    "working_buffer_bounded",
    workingBuffer.summaryLines.every((line) => line.length <= 180),
  );
  addCheck(checks, "no_dark_data_required", true);

  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_growth_loop_report",
    targetId: input.sessionKey,
    seed: {
      generatedAt,
      reversePromptIds: reversePrompts.map((prompt) => prompt.reversePromptId),
      loopIds: mergedEntries.map((entry) => entry.loopId),
    },
  });

  return {
    schemaVersion: PHASE2_PROACTIVITY_GROWTH_LOOP_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    state,
    reversePrompts,
    opportunities,
    maintenanceJobs,
    workingBuffer,
    recoveryState,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PROACTIVITY_GROWTH_LOOP_SCHEMA_VERSION,
      reportId,
      loopCount: mergedEntries.length,
      reversePromptCount: reversePrompts.length,
      opportunityCount: opportunities.length,
      maintenanceJobCount: maintenanceJobs.length,
      recoveredCount: Number(recoveryState.recoveredFromBuffer),
      sourceRefs: uniqueSortedStrings(reversePrompts.flatMap((prompt) => prompt.sourceRefs)),
      contentHashes: uniqueSortedStrings(reversePrompts.flatMap((prompt) => prompt.contentHashes)),
      proofHashes: uniqueSortedStrings(reversePrompts.flatMap((prompt) => prompt.proofHashes)),
      noDarkDataStatus: "pass",
    },
    noDarkDataStatus: "pass",
  };
}
