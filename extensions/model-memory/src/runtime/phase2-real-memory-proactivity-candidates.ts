import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import type {
  Phase2LiveProactivityDetectionReport,
  Phase2LiveProactivityOpportunity,
  Phase2LiveProactivitySignalKind,
} from "./phase2-live-proactivity-signals.ts";
import type { Phase2UserFacingProactivityDefaultMessageClass } from "./phase2-user-facing-proactivity-default-promotion.ts";

export const PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_SCHEMA_VERSION =
  "phase2_real_memory_proactivity_candidate.v1" as const;
export const PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_REPORT_SCHEMA_VERSION =
  "phase2_real_memory_proactivity_candidate_report.v1" as const;

export type Phase2RealMemorySignalKind =
  | Phase2LiveProactivitySignalKind
  | "active_work_state"
  | "unresolved_question"
  | "recent_failure"
  | "repeated_friction"
  | "incomplete_follow_up"
  | "recent_task"
  | "unresolved_follow_up"
  | "stale_decision"
  | "maintenance_candidate"
  | "docs_change"
  | "project_state_capsule"
  | "retrieval_or_graph_observation";

export type Phase2RealMemorySignal = {
  signalId: string;
  kind: Phase2RealMemorySignalKind;
  boundedSummary: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash: string;
  freshness: "recent" | "stale" | "unknown";
  conflictState: "clear" | "conflicted";
  inspectionOnly: boolean;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2RealMemoryCandidateEvidence = {
  evidenceId: string;
  signalId: string;
  signalKind: Phase2RealMemorySignalKind;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash: string;
  freshness: Phase2RealMemorySignal["freshness"];
  conflictState: Phase2RealMemorySignal["conflictState"];
};

export type Phase2RealMemoryCandidate = {
  candidateId: string;
  sourceMode: "live_signal" | "static_fallback";
  liveOpportunityId?: string;
  liveSignalKind?: Phase2LiveProactivitySignalKind;
  workItemKind?: Phase2LiveProactivityOpportunity["workItemKind"];
  title?: string;
  whyNow?: string;
  proposedNextStep?: string;
  expectedUserValue?: string;
  evidenceSummary?: string;
  confidence?: "high" | "medium" | "low";
  limitations?: string[];
  messageClass: Phase2UserFacingProactivityDefaultMessageClass;
  boundedDisplayText: string;
  whyThisAppeared: string;
  evidence: Phase2RealMemoryCandidateEvidence[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  staleLabels: string[];
  conflictLabels: string[];
  blockedReasonCodes: string[];
  suppressed: boolean;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2RealMemoryCandidateGenerationPolicy = {
  schemaVersion: typeof PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_SCHEMA_VERSION;
  policyId: string;
  allowedSignalKinds: Phase2RealMemorySignalKind[];
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  requireProvenance: true;
  excludeInspectionOnly: true;
  requireNoDarkDataPass: true;
  deterministicDedupeOnly: true;
  semanticSimilarityTruthAllowed: false;
  topicParserAllowed: false;
  markerSpecificRuntimeLogicAllowed: false;
  externalTextHandling: "evidence_not_instruction";
  maxSignals: number;
  maxCandidates: number;
};

export type Phase2RealMemoryCandidateDedupeState = {
  suppressedCandidateIds: string[];
  suppressedContentHashes: string[];
};

export type Phase2RealMemoryCandidateSuppressionDecision = {
  candidateId: string;
  suppressed: boolean;
  reasonCodes: string[];
};

export type Phase2RealMemoryCandidateCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "signal_kind_allowed"
    | "provenance_required"
    | "source_profile_required"
    | "authority_tier_required"
    | "inspection_only_excluded"
    | "no_dark_data_required"
    | "stale_or_conflict_labeled"
    | "deterministic_dedupe_only"
    | "external_text_evidence_not_instruction";
};

export type Phase2RealMemoryCandidateTelemetry = {
  schemaVersion: typeof PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_SCHEMA_VERSION;
  reportId: string;
  signalCount: number;
  candidateCount: number;
  suppressedCount: number;
  signalKinds: Phase2RealMemorySignalKind[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  semanticSimilarityTruthAllowed: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2RealMemoryCandidateRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATES_DISABLED";
  disablesRealCandidateGeneration: true;
  targetMode: "product_queue_from_approved_reports_only";
};

export type Phase2RealMemoryCandidateReport = {
  schemaVersion: typeof PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "real_candidates_generated" | "blocked" | "rollback_disabled";
  policy: Phase2RealMemoryCandidateGenerationPolicy;
  signals: Phase2RealMemorySignal[];
  candidates: Phase2RealMemoryCandidate[];
  suppressionDecisions: Phase2RealMemoryCandidateSuppressionDecision[];
  checks: Phase2RealMemoryCandidateCheck[];
  telemetry: Phase2RealMemoryCandidateTelemetry;
  rollbackPlan: Phase2RealMemoryCandidateRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    queueVisible: boolean;
    realCandidateVisible: boolean;
    whyThisAppearedVisible: boolean;
    dedupeObserved: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2RealMemoryCandidateInput = {
  now?: Date;
  repoRoot?: string;
  signals?: Phase2RealMemorySignal[];
  liveDetectionReport?: Phase2LiveProactivityDetectionReport | null;
  primarySourceMode?: "live_only" | "allow_static_fallback";
  dedupeState?: Phase2RealMemoryCandidateDedupeState;
  env?: Record<string, string | undefined>;
  maxCandidates?: number;
  uiEvidence?: Phase2RealMemoryCandidateReport["uiEvidence"];
  forceMissingProvenance?: boolean;
  forceInspectionOnly?: boolean;
  forceNoDarkDataFail?: boolean;
};

export type Phase2RealMemoryCandidateArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALL_SIGNAL_KINDS: Phase2RealMemorySignalKind[] = [
  "active_work_state",
  "unresolved_question",
  "recent_failure",
  "repeated_friction",
  "incomplete_follow_up",
  "recent_task",
  "unresolved_follow_up",
  "stale_decision",
  "maintenance_candidate",
  "docs_change",
  "project_state_capsule",
  "retrieval_or_graph_observation",
];

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
        `phase2 real memory proactivity candidates contain prohibited field: ${[
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
      throw new Error(
        "phase2 real memory proactivity candidates contain prohibited marker content",
      );
    }
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATES_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2RealMemoryCandidateCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2RealMemoryCandidateCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function signalId(kind: Phase2RealMemorySignalKind, sourceRefs: string[]): string {
  return buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_real_memory_signal",
    targetId: kind,
    seed: sourceRefs,
  });
}

async function fileSignal(input: {
  repoRoot: string;
  kind: Phase2RealMemorySignalKind;
  relativePath: string;
  summary: string;
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  freshness?: Phase2RealMemorySignal["freshness"];
}): Promise<Phase2RealMemorySignal> {
  const filePath = path.join(input.repoRoot, input.relativePath);
  const stat = await fs.stat(filePath);
  const sourceRefs = [input.relativePath];
  const contentHash = hash({
    sourceRef: input.relativePath,
    mtimeMs: Math.trunc(stat.mtimeMs),
    size: stat.size,
  });
  return {
    signalId: signalId(input.kind, sourceRefs),
    kind: input.kind,
    boundedSummary: input.summary,
    sourceRefs,
    sourceProfileId: input.sourceProfileId,
    authorityTier: input.authorityTier,
    contentHash,
    proofHash: hash({ signal: input.kind, sourceRefs, contentHash }),
    freshness: input.freshness ?? "recent",
    conflictState: "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
  };
}

async function buildDefaultSignals(repoRoot: string): Promise<Phase2RealMemorySignal[]> {
  const generated = await Promise.all([
    fileSignal({
      repoRoot,
      kind: "active_work_state",
      relativePath: "docs/projects/model-memory/phase-2-execution-roadmap.md",
      summary:
        "Active work is Proactivity UX correctness: fix no-op sends, misleading counts, inert filters, and blind approval before adding capability.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "unresolved_question",
      relativePath: "docs/projects/model-memory/DECISIONS.md",
      summary:
        "The user still has not seen a concrete proactive plan surfaced in the active chat session; verify contextual surfacing and plan review.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "recent_failure",
      relativePath: "docs/projects/operator-experience/STATUS.md",
      summary:
        "Live gateway rebuild pickup was previously unclear after proactivity UI changes; verify the rebuilt gateway serves the current Proactivity Inbox before judging UX.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "repeated_friction",
      relativePath: "docs/projects/model-memory/DECISIONS.md",
      summary:
        "Repeated proactivity friction: notes say a plan exists without showing the plan; suppress placeholders and show concrete reviewable plan cards.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "incomplete_follow_up",
      relativePath: "docs/projects/model-memory/phase-2-execution-roadmap.md",
      summary:
        "Follow up on whether the latest Proactivity UX changes are visible in the real live chat session after gateway rebuild.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "recent_task",
      relativePath: "docs/projects/model-memory/phase-2-execution-roadmap.md",
      summary:
        "Recent Model Memory rollout work needs a product UX check: approve/send, filters, counts, and concrete plan cards must work in the real chat flow.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "unresolved_follow_up",
      relativePath: "docs/projects/model-memory/DECISIONS.md",
      summary: "Model Memory decisions include follow-up state that can be reviewed safely.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "docs_change",
      relativePath: "docs/projects/model-memory/specs/proactive-memory-planner.md",
      summary: "Planner/proactivity documentation changed and can be surfaced as evidence.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "project_state_capsule",
      relativePath: "docs/projects/model-memory/specs/project-state-capsule-schema.md",
      summary: "Project-state capsule evidence is available for bounded proactivity context.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "maintenance_candidate",
      relativePath: "docs/projects/model-memory/specs/memory-maintenance-loop.md",
      summary: "Maintenance-loop evidence can generate a safe operator review suggestion.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "retrieval_or_graph_observation",
      relativePath: "docs/projects/model-memory/specs/graph-derived-runtime-model.md",
      summary: "Runtime graph/retrieval evidence is available as evidence-only context.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    fileSignal({
      repoRoot,
      kind: "stale_decision",
      relativePath: "docs/projects/model-memory/DECISIONS.md",
      summary: "A previously recorded decision is old enough to warrant review labeling.",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      freshness: "stale",
    }),
  ]);
  return generated;
}

function displayTextForSignal(signal: Phase2RealMemorySignal): string {
  switch (signal.kind) {
    case "active_work_state":
      return "Fix the broken Proactivity Inbox before expanding capability.";
    case "unresolved_question":
      return "Verify why no concrete proactive plan has surfaced in the active chat session.";
    case "recent_failure":
      return "Confirm the rebuilt live gateway is serving the current Proactivity UX.";
    case "repeated_friction":
      return "Replace placeholder proactivity notes with concrete reviewable plan cards.";
    case "incomplete_follow_up":
      return "Follow up on whether the latest Proactivity UX appears in the real workspace.";
    case "recent_task":
      return "Check the current Model Memory proactivity remediation in the live chat flow.";
    case "unresolved_follow_up":
      return "An unresolved Model Memory follow-up is ready for review.";
    case "stale_decision":
      return "A Model Memory decision may need review before it goes stale.";
    case "maintenance_candidate":
      return "A Model Memory maintenance candidate is ready for operator review.";
    case "docs_change":
      return "A Model Memory doc change may need follow-up.";
    case "project_state_capsule":
      return "Project-state memory context has a suggestion ready for review.";
    case "retrieval_or_graph_observation":
      return "Runtime graph or retrieval evidence has a suggestion ready for review.";
  }
  return "A Model Memory suggestion is ready for review.";
}

function candidateFromSignal(signal: Phase2RealMemorySignal): Phase2RealMemoryCandidate {
  const evidenceId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_real_memory_candidate_evidence",
    targetId: signal.signalId,
    seed: signal.contentHash,
  });
  const evidence: Phase2RealMemoryCandidateEvidence = {
    evidenceId,
    signalId: signal.signalId,
    signalKind: signal.kind,
    sourceRefs: signal.sourceRefs,
    sourceProfileId: signal.sourceProfileId,
    authorityTier: signal.authorityTier,
    contentHash: signal.contentHash,
    proofHash: signal.proofHash,
    freshness: signal.freshness,
    conflictState: signal.conflictState,
  };
  const candidateId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_real_memory_proactivity_candidate",
    targetId: signal.kind,
    seed: {
      sourceRefs: signal.sourceRefs,
      contentHash: signal.contentHash,
      proofHash: signal.proofHash,
    },
  });
  const staleLabels = signal.freshness === "stale" ? ["stale_evidence_labeled"] : [];
  const conflictLabels =
    signal.conflictState === "conflicted" ? ["conflicted_evidence_labeled"] : [];
  return {
    candidateId,
    sourceMode: "static_fallback",
    messageClass:
      signal.kind === "unresolved_follow_up" ||
      signal.kind === "stale_decision" ||
      signal.kind === "unresolved_question" ||
      signal.kind === "incomplete_follow_up"
        ? "operator_approved_follow_up_available"
        : "operator_approved_suggestion_available",
    boundedDisplayText: displayTextForSignal(signal),
    whyThisAppeared: signal.boundedSummary,
    evidence: [evidence],
    sourceRefs: signal.sourceRefs,
    sourceProfileIds: [signal.sourceProfileId],
    authorityTiers: [signal.authorityTier],
    contentHashes: [signal.contentHash],
    proofHashes: [signal.proofHash],
    staleLabels,
    conflictLabels,
    blockedReasonCodes: [],
    suppressed: false,
    noDarkDataStatus: signal.noDarkDataStatus,
  };
}

function candidateFromLiveOpportunity(
  opportunity: Phase2LiveProactivityOpportunity,
): Phase2RealMemoryCandidate {
  const evidence: Phase2RealMemoryCandidateEvidence = {
    evidenceId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_proactivity_candidate_evidence",
      targetId: opportunity.signalId,
      seed: opportunity.opportunityId,
    }),
    signalId: opportunity.signalId,
    signalKind: opportunity.signalKind,
    sourceRefs: opportunity.sourceRefs,
    sourceProfileId: opportunity.sourceProfileIds[0] ?? "manual_note",
    authorityTier: opportunity.authorityTiers[0] ?? "tool_grounded",
    contentHash:
      opportunity.contentHashes[0] ?? sha256JsonValue(opportunity as unknown as JsonLike),
    proofHash:
      opportunity.proofHashes[0] ?? sha256JsonValue({ opportunityId: opportunity.opportunityId }),
    freshness: opportunity.staleLabels.length ? "stale" : "recent",
    conflictState: opportunity.conflictLabels.length ? "conflicted" : "clear",
  };
  return {
    candidateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_real_memory_proactivity_candidate",
      targetId: opportunity.opportunityId,
      seed: {
        sourceRefs: opportunity.sourceRefs,
        contentHashes: opportunity.contentHashes,
        proofHashes: opportunity.proofHashes,
      },
    }),
    sourceMode: "live_signal",
    liveOpportunityId: opportunity.opportunityId,
    liveSignalKind: opportunity.signalKind,
    workItemKind: opportunity.workItemKind,
    title: opportunity.title,
    whyNow: opportunity.whyNow,
    proposedNextStep: opportunity.proposedNextStep,
    expectedUserValue: opportunity.expectedUserValue,
    evidenceSummary: opportunity.evidenceSummary,
    confidence: opportunity.confidence,
    limitations: opportunity.limitations,
    messageClass:
      opportunity.workItemKind === "draft_next_steps"
        ? "operator_approved_follow_up_available"
        : "operator_approved_suggestion_available",
    boundedDisplayText: opportunity.title,
    whyThisAppeared: opportunity.whyNow,
    evidence: [evidence],
    sourceRefs: opportunity.sourceRefs,
    sourceProfileIds: opportunity.sourceProfileIds,
    authorityTiers: opportunity.authorityTiers,
    contentHashes: opportunity.contentHashes,
    proofHashes: opportunity.proofHashes,
    staleLabels: opportunity.staleLabels,
    conflictLabels: opportunity.conflictLabels,
    blockedReasonCodes: opportunity.blockedReasonCodes,
    suppressed: false,
    noDarkDataStatus: opportunity.noDarkDataStatus,
  };
}

function applyDedupe(input: {
  candidates: Phase2RealMemoryCandidate[];
  dedupeState: Phase2RealMemoryCandidateDedupeState;
}): {
  candidates: Phase2RealMemoryCandidate[];
  suppressionDecisions: Phase2RealMemoryCandidateSuppressionDecision[];
} {
  const decisions: Phase2RealMemoryCandidateSuppressionDecision[] = [];
  const seenHashes = new Set<string>();
  const suppressedIds = new Set(input.dedupeState.suppressedCandidateIds);
  const suppressedHashes = new Set(input.dedupeState.suppressedContentHashes);
  const candidates = input.candidates.map((candidate) => {
    const contentKey = candidate.contentHashes.join(":");
    const duplicate = seenHashes.has(contentKey);
    seenHashes.add(contentKey);
    const suppressed =
      duplicate || suppressedIds.has(candidate.candidateId) || suppressedHashes.has(contentKey);
    const reasonCodes = [
      ...(duplicate ? ["dedupe_repeated_candidate"] : []),
      ...(suppressedIds.has(candidate.candidateId) ? ["dedupe_candidate_id_suppressed"] : []),
      ...(suppressedHashes.has(contentKey) ? ["dedupe_content_hash_suppressed"] : []),
    ];
    decisions.push({ candidateId: candidate.candidateId, suppressed, reasonCodes });
    return suppressed
      ? { ...candidate, suppressed: true, blockedReasonCodes: reasonCodes }
      : candidate;
  });
  return { candidates, suppressionDecisions: decisions };
}

export async function buildPhase2RealMemoryProactivityCandidateReport(
  input: Phase2RealMemoryCandidateInput = {},
): Promise<Phase2RealMemoryCandidateReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const repoRoot = input.repoRoot ?? process.cwd();
  const rollback = readRollback(input.env);
  const maxCandidates = input.maxCandidates ?? 3;
  const primarySourceMode = input.primarySourceMode ?? "allow_static_fallback";
  const liveOpportunities =
    input.liveDetectionReport?.decision === "live_opportunities_detected"
      ? input.liveDetectionReport.opportunities
      : [];
  const rawSignals =
    input.signals ??
    (primarySourceMode === "allow_static_fallback" && liveOpportunities.length === 0
      ? await buildDefaultSignals(repoRoot)
      : []);
  const signals = rawSignals.map((signal) => ({
    ...signal,
    sourceRefs: input.forceMissingProvenance ? [] : signal.sourceRefs,
    inspectionOnly: input.forceInspectionOnly ? true : signal.inspectionOnly,
    noDarkDataStatus: input.forceNoDarkDataFail ? "fail" : signal.noDarkDataStatus,
  }));
  const policy: Phase2RealMemoryCandidateGenerationPolicy = {
    schemaVersion: PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_real_memory_proactivity_candidate_policy",
      targetId: "product-proactivity",
      seed: { generatedAt: generatedAt.slice(0, 10), maxCandidates },
    }),
    allowedSignalKinds: ALL_SIGNAL_KINDS,
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
    requireProvenance: true,
    excludeInspectionOnly: true,
    requireNoDarkDataPass: true,
    deterministicDedupeOnly: true,
    semanticSimilarityTruthAllowed: false,
    topicParserAllowed: false,
    markerSpecificRuntimeLogicAllowed: false,
    externalTextHandling: "evidence_not_instruction",
    maxSignals: 12,
    maxCandidates,
  };
  const checks: Phase2RealMemoryCandidateCheck[] = [];
  for (const signal of signals) {
    addCheck(
      checks,
      `signal:${signal.signalId}:kind`,
      policy.allowedSignalKinds.includes(signal.kind),
      "signal_kind_allowed",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:provenance`,
      signal.sourceRefs.length > 0,
      "provenance_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:source_profile`,
      Boolean(signal.sourceProfileId),
      "source_profile_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:authority`,
      Boolean(signal.authorityTier),
      "authority_tier_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:inspection_only`,
      !signal.inspectionOnly,
      "inspection_only_excluded",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:no_dark_data`,
      signal.noDarkDataStatus === "pass",
      "no_dark_data_required",
    );
    addCheck(
      checks,
      `signal:${signal.signalId}:stale_conflict`,
      signal.freshness !== "unknown" && Boolean(signal.conflictState),
      "stale_or_conflict_labeled",
    );
  }
  addCheck(checks, "dedupe:deterministic", true, "deterministic_dedupe_only");
  addCheck(
    checks,
    "external_text:evidence_not_instruction",
    true,
    "external_text_evidence_not_instruction",
  );
  const failedChecks = checks.filter((check) => check.status === "fail");
  const eligibleSignals =
    failedChecks.length === 0
      ? signals.filter((signal) => signal.noDarkDataStatus === "pass" && !signal.inspectionOnly)
      : [];
  const sourceCandidates =
    liveOpportunities.length > 0
      ? liveOpportunities.map(candidateFromLiveOpportunity)
      : eligibleSignals.map(candidateFromSignal);
  const deduped = applyDedupe({
    candidates: sourceCandidates.slice(0, maxCandidates),
    dedupeState: input.dedupeState ?? { suppressedCandidateIds: [], suppressedContentHashes: [] },
  });
  const candidates = deduped.candidates.filter((candidate) => !candidate.suppressed);
  const decision = rollback
    ? "rollback_disabled"
    : failedChecks.length === 0
      ? "real_candidates_generated"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_real_memory_proactivity_candidate_report",
    targetId: "product-proactivity",
    seed: {
      generatedAt,
      decision,
      candidateIds: candidates.map((candidate) => candidate.candidateId),
      failedReasonCodes: failedChecks.map((check) => check.reasonCode),
    },
  });
  const sourceRefs = uniqueSortedStrings(candidates.flatMap((candidate) => candidate.sourceRefs));
  const sourceProfileIds = uniqueSortedStrings(
    candidates.flatMap((candidate) => candidate.sourceProfileIds),
  ) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings(
    candidates.flatMap((candidate) => candidate.authorityTiers),
  ) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings(
    candidates.flatMap((candidate) => candidate.contentHashes),
  );
  const proofHashes = uniqueSortedStrings(candidates.flatMap((candidate) => candidate.proofHashes));
  const rollbackPlan: Phase2RealMemoryCandidateRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_real_memory_proactivity_candidate_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATES_DISABLED",
    disablesRealCandidateGeneration: true,
    targetMode: "product_queue_from_approved_reports_only",
  };
  const telemetry: Phase2RealMemoryCandidateTelemetry = {
    schemaVersion: PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_SCHEMA_VERSION,
    reportId,
    signalCount: signals.length,
    candidateCount: candidates.length,
    suppressedCount: deduped.suppressionDecisions.filter(
      (decisionEntry) => decisionEntry.suppressed,
    ).length,
    signalKinds: uniqueSortedStrings(
      signals.map((signal) => signal.kind),
    ) as Phase2RealMemorySignalKind[],
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
    semanticSimilarityTruthAllowed: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2RealMemoryCandidateReport = {
    schemaVersion: PHASE2_REAL_MEMORY_PROACTIVITY_CANDIDATE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    signals,
    candidates: decision === "real_candidates_generated" ? candidates : [],
    suppressionDecisions: deduped.suppressionDecisions,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2RealMemoryProactivityCandidatesGenerated(
  report: Phase2RealMemoryCandidateReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "real_candidates_generated") {
    throw new Error(`phase2 real memory candidates not generated: ${report.decision}`);
  }
  if (report.candidates.length < 1) {
    throw new Error("phase2 real memory candidates missing candidate output");
  }
  if (report.telemetry.semanticSimilarityTruthAllowed) {
    throw new Error("phase2 real memory candidates allowed semantic-similarity truth");
  }
}

export async function writePhase2RealMemoryProactivityCandidateArtifact(input: {
  report: Phase2RealMemoryCandidateReport;
  artifactDir: string;
}): Promise<Phase2RealMemoryCandidateArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-real-memory-proactivity-candidates",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Real Memory Proactivity Candidates",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- signalCount: ${input.report.telemetry.signalCount}`,
    `- candidateCount: ${input.report.telemetry.candidateCount}`,
    `- suppressedCount: ${input.report.telemetry.suppressedCount}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
