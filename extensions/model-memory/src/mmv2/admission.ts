import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import { evaluateCompositeParentRetention } from "./composite-policy.ts";
import {
  AdmissionDecisionBatchSchema,
  type AdmissionDecisionBatch,
  type CanonicalCandidateBatch,
  type ExistingMemorySummary,
  type RawIngestEvent,
} from "./contracts.ts";
import {
  buildAdmissionPrompt,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import { getEffectiveScope } from "./semantic-identity.ts";

type AdmissionInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalBatch: CanonicalCandidateBatch;
  candidateNeighborsById?: Record<string, ExistingMemorySummary[]>;
  responseMode?: MmV2PromptResponseMode;
};

type AdmissionDecisionRecord = AdmissionDecisionBatch["decisions"][number];

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "admission_decision.v1",
      event_id: "",
      decisions: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function normalizeAdmissionPayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "admission_decision.v1",
      event_id: eventId,
      decisions: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "admission_decision.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

const ALLOWED_ADMISSION_REASON_CODES = new Set<AdmissionDecisionRecord["reason_codes"][number]>([
  "durable",
  "useful_future_context",
  "explicit_user_statement",
  "clear_instruction",
  "canonical_source",
  "important_decision",
  "temporary",
  "duplicate_likely",
  "too_vague",
  "low_confidence",
  "sensitive",
  "embedded_component_only",
  "scope_unclear",
  "not_actionable",
  "not_memory",
]);

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function sanitizeAdmissionScores(raw: unknown): AdmissionDecisionRecord["scores"] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    future_utility: clamp01(source.future_utility, 0.5),
    durability: clamp01(source.durability, 0.5),
    confidence: clamp01(source.confidence, 0.5),
    novelty: clamp01(source.novelty, 0.5),
    scope_clarity: clamp01(source.scope_clarity, 0.5),
    sensitivity_safety: clamp01(source.sensitivity_safety, 0.8),
    specificity: clamp01(source.specificity, 0.5),
  };
}

function sanitizeAdmissionDecisionName(value: unknown): AdmissionDecisionRecord["decision"] {
  return value === "admit" || value === "reject" || value === "quarantine" || value === "embed_only"
    ? value
    : "quarantine";
}

function sanitizeAdmissionReasonCodes(value: unknown): AdmissionDecisionRecord["reason_codes"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value.filter(
        (entry): entry is AdmissionDecisionRecord["reason_codes"][number] =>
          typeof entry === "string" &&
          ALLOWED_ADMISSION_REASON_CODES.has(
            entry as AdmissionDecisionRecord["reason_codes"][number],
          ),
      ),
    ),
  );
}

function ensureAdmissionCoverage(
  batch: AdmissionDecisionBatch,
  canonicalBatch: CanonicalCandidateBatch,
): AdmissionDecisionBatch {
  const decisions: AdmissionDecisionBatch["decisions"] = [];
  const seen = new Set<string>();

  for (const decision of batch.decisions) {
    if (seen.has(decision.candidate_id)) {
      continue;
    }
    seen.add(decision.candidate_id);
    decisions.push(decision);
  }

  for (const candidate of canonicalBatch.canonical_candidates) {
    if (seen.has(candidate.candidate_id)) {
      continue;
    }
    decisions.push({
      candidate_id: candidate.candidate_id,
      decision: "quarantine",
      scores: {
        future_utility: 0.4,
        durability: 0.4,
        confidence: 0.4,
        novelty: 0.5,
        scope_clarity: 0.4,
        sensitivity_safety: 0.9,
        specificity: 0.4,
      },
      reason_codes: ["low_confidence"],
      rationale:
        "Model did not return a valid admission decision for this candidate, so MMV2 quarantined it deterministically.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    });
  }

  return {
    ...batch,
    decisions,
  };
}

function sanitizeAdmissionBatchUnknown(
  raw: unknown,
  eventId: string,
  canonicalBatch: CanonicalCandidateBatch,
): AdmissionDecisionBatch | null {
  let candidate = raw;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  const normalized = normalizeAdmissionPayload(candidate, eventId);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null;
  }

  const rawDecisions = Array.isArray((normalized as { decisions?: unknown }).decisions)
    ? (normalized as { decisions: unknown[] }).decisions
    : [];
  const validCandidateIds = new Set(
    canonicalBatch.canonical_candidates.map((entry) => entry.candidate_id),
  );
  const decisions: AdmissionDecisionBatch["decisions"] = [];

  for (const rawDecision of rawDecisions) {
    if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
      continue;
    }
    const source = rawDecision as Record<string, unknown>;
    const candidateId = typeof source.candidate_id === "string" ? source.candidate_id : null;
    if (!candidateId || !validCandidateIds.has(candidateId)) {
      continue;
    }
    decisions.push({
      candidate_id: candidateId,
      decision: sanitizeAdmissionDecisionName(source.decision),
      scores: sanitizeAdmissionScores(source.scores),
      reason_codes: sanitizeAdmissionReasonCodes(source.reason_codes),
      rationale:
        typeof source.rationale === "string" && source.rationale.trim().length > 0
          ? source.rationale
          : "Admission decision was sanitized after model schema drift.",
      recommended_ttl_seconds: Number.isInteger(source.recommended_ttl_seconds)
        ? (source.recommended_ttl_seconds as number)
        : null,
      requires_reconciliation:
        typeof source.requires_reconciliation === "boolean"
          ? source.requires_reconciliation
          : false,
    });
  }

  const parsed = AdmissionDecisionBatchSchema.safeParse({
    schema_version: "admission_decision.v1",
    event_id: eventId,
    decisions,
  });
  if (!parsed.success) {
    return null;
  }
  return ensureAdmissionCoverage(parsed.data, canonicalBatch);
}

function finalizeAdmissionBatch(input: {
  canonicalBatch: CanonicalCandidateBatch;
  parsedBatch: AdmissionDecisionBatch;
  candidateNeighborsById: Record<string, ExistingMemorySummary[]>;
}): AdmissionDecisionBatch {
  return applyAdmissionThresholds(
    input.canonicalBatch,
    applyDeterministicAdmissionMetadata(
      input.canonicalBatch,
      ensureAdmissionCoverage(input.parsedBatch, input.canonicalBatch),
      input.candidateNeighborsById,
    ),
  );
}

function needsDeterministicReconciliation(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  neighbors: ExistingMemorySummary[],
): boolean {
  if (neighbors.length > 0) {
    return true;
  }
  if (candidate.kind === "claim") {
    const claimType =
      typeof candidate.payload.claim_type === "string" ? candidate.payload.claim_type : null;
    const scope = getEffectiveScope(candidate.scope);
    const scoped = scope.applies_to !== "global";
    if (scoped && (claimType === "preference_state" || claimType === "project_fact")) {
      return true;
    }
  }
  return false;
}

function isClearlyTemporaryCandidate(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  if (candidate.scope.applies_to === "current_session_only") {
    return true;
  }
  const combined = `${candidate.canonical_text}\n${candidate.source.evidence_quote}`.toLowerCase();
  return (
    combined.includes("for this answer") ||
    combined.includes("this session only") ||
    combined.includes("current session only") ||
    combined.includes("for this response")
  );
}

function hasProjectScopedContext(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  const scope = getEffectiveScope(candidate.scope);
  return (
    scope.applies_to === "current_project" ||
    scope.applies_to === "current_workspace" ||
    Boolean(scope.project_id) ||
    Boolean(scope.workspace_id)
  );
}

function buildDeterministicScores(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): AdmissionDecisionRecord["scores"] {
  return {
    future_utility:
      candidate.unit_type === "composite"
        ? Math.max(candidate.quality.actionability, 0.7)
        : Math.max(candidate.quality.actionability, 0.45),
    durability: candidate.quality.durability,
    confidence: candidate.confidence,
    novelty: 0.5,
    scope_clarity: Math.max(candidate.quality.grounding, 0.45),
    sensitivity_safety: hasSensitiveRiskFlags(candidate) ? 0.2 : 0.95,
    specificity: candidate.quality.specificity,
  };
}

function buildDeterministicAdmissionDecision(input: {
  candidate: CanonicalCandidateBatch["canonical_candidates"][number];
  neighbors: ExistingMemorySummary[];
}): AdmissionDecisionRecord | null {
  const { candidate, neighbors } = input;
  const requiresReconciliation = needsDeterministicReconciliation(candidate, neighbors);
  const scores = buildDeterministicScores(candidate);

  if (candidate.promotion === "blocked") {
    return {
      candidate_id: candidate.candidate_id,
      decision: "reject",
      scores: {
        ...scores,
        confidence: Math.max(scores.confidence, 0.8),
        sensitivity_safety: 0.1,
      },
      reason_codes: ["sensitive"],
      rationale:
        "Blocked candidates stay out of standalone durable memory deterministically in MMV2.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    };
  }

  if (hasSensitiveRiskFlags(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "quarantine",
      scores: {
        ...scores,
        confidence: Math.max(scores.confidence, 0.75),
        sensitivity_safety: 0.2,
      },
      reason_codes: ["sensitive"],
      rationale:
        "Sensitive or secret-like candidates are quarantined deterministically before standalone write.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    };
  }

  if (isSafeGroundedSourceRef(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.7),
        durability: Math.max(scores.durability, 0.68),
        confidence: Math.max(scores.confidence, 0.82),
        specificity: Math.max(scores.specificity, 0.82),
      },
      reason_codes: ["canonical_source", "useful_future_context"],
      rationale:
        "Safe grounded source references proceed deterministically to reconciliation; novelty ambiguity is resolved downstream.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  if (isExplicitStablePreferenceClaim(candidate) || isExplicitScopedPreferenceClaim(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.76),
        durability: Math.max(
          scores.durability,
          isExplicitScopedPreferenceClaim(candidate) ? 0.58 : 0.66,
        ),
        confidence: Math.max(scores.confidence, 0.75),
        specificity: Math.max(scores.specificity, 0.62),
      },
      reason_codes: ["explicit_user_statement", "durable"],
      rationale: "Explicit durable preference claim is admitted deterministically in MMV2.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  if (isStableAssistantDirectiveCandidate(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.74),
        durability: Math.max(scores.durability, 0.66),
        confidence: Math.max(scores.confidence, 0.74),
        specificity: Math.max(scores.specificity, 0.68),
      },
      reason_codes: ["clear_instruction", "durable"],
      rationale:
        "Exact grounded assistant-behavior directive is durable enough to keep and should not be quarantined as temporary when it is not session-bound.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  if (isExplicitGroundedProjectFactClaim(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.72),
        durability: Math.max(scores.durability, 0.62),
        confidence: Math.max(scores.confidence, 0.72),
        specificity: Math.max(scores.specificity, 0.72),
        scope_clarity: Math.max(scores.scope_clarity, 0.82),
      },
      reason_codes: ["durable", "useful_future_context"],
      rationale:
        "Exact grounded project fact is durable within the current project horizon and is admitted deterministically in MMV2.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  if (isProjectScopedDurableAtomicCandidate(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.72),
        durability: Math.max(scores.durability, 0.62),
        confidence: Math.max(scores.confidence, 0.72),
        specificity: Math.max(scores.specificity, 0.64),
        scope_clarity: Math.max(scores.scope_clarity, 0.75),
      },
      reason_codes: ["clear_instruction", "durable", "useful_future_context"],
      rationale:
        "Exact grounded project-scoped directive or constraint is durable within the current project horizon and is admitted deterministically in MMV2.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  if (isClearlyTemporaryCandidate(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "reject",
      scores: {
        ...scores,
        durability: 0.1,
        future_utility: Math.min(scores.future_utility, 0.25),
      },
      reason_codes: ["temporary"],
      rationale:
        "Current-session or one-response instructions are rejected deterministically in MMV2.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    };
  }

  if (candidate.unit_type === "component" && candidate.promotion === "embedded_only") {
    return {
      candidate_id: candidate.candidate_id,
      decision: "embed_only",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.6),
        confidence: Math.max(scores.confidence, 0.75),
      },
      reason_codes: ["embedded_component_only"],
      rationale:
        "Embedded-only components stay inside the retained parent artifact and do not enter standalone admission.",
      recommended_ttl_seconds: null,
      requires_reconciliation: false,
    };
  }

  if (isDurableParentCompositeArtifact(candidate)) {
    return {
      candidate_id: candidate.candidate_id,
      decision: "admit",
      scores: {
        ...scores,
        future_utility: Math.max(scores.future_utility, 0.78),
        durability: Math.max(scores.durability, 0.72),
        confidence: Math.max(scores.confidence, 0.75),
        specificity: Math.max(scores.specificity, 0.72),
      },
      reason_codes: ["durable", "useful_future_context"],
      rationale:
        "Parent composite artifact retention is structural and deterministic in MMV2; embedded children remain inside the admitted artifact by default.",
      recommended_ttl_seconds: null,
      requires_reconciliation: requiresReconciliation,
    };
  }

  return null;
}

function mergeAdmissionBatchesInCandidateOrder(input: {
  canonicalBatch: CanonicalCandidateBatch;
  deterministicDecisions: AdmissionDecisionRecord[];
  modelDecisions: AdmissionDecisionRecord[];
}): AdmissionDecisionBatch {
  const byCandidateId = new Map<string, AdmissionDecisionRecord>();
  for (const decision of input.deterministicDecisions) {
    byCandidateId.set(decision.candidate_id, decision);
  }
  for (const decision of input.modelDecisions) {
    byCandidateId.set(decision.candidate_id, decision);
  }
  return {
    schema_version: "admission_decision.v1",
    event_id: input.canonicalBatch.event_id,
    decisions: input.canonicalBatch.canonical_candidates.flatMap((candidate) => {
      const decision = byCandidateId.get(candidate.candidate_id);
      return decision ? [decision] : [];
    }),
  };
}

function hasSensitiveRiskFlags(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return candidate.risk_flags.some((flag) => flag !== "none" && flag !== "low_confidence");
}

function hasExactEvidence(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    typeof candidate.source.evidence_quote === "string" &&
    candidate.source.evidence_quote.trim().length > 0
  );
}

function isDurableParentCompositeArtifact(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  const retention = evaluateCompositeParentRetention(candidate);
  return retention?.retainParent === true && candidate.confidence >= 0.6;
}

function shouldCorrectParentCompositeDecision(decision: AdmissionDecisionRecord): boolean {
  return (
    decision.decision !== "admit" &&
    (decision.reason_codes.includes("embedded_component_only") ||
      decision.reason_codes.includes("not_actionable") ||
      decision.reason_codes.includes("clear_instruction") ||
      decision.reason_codes.length === 0 ||
      (decision.reason_codes.includes("sensitive") && decision.scores.sensitivity_safety < 0.8))
  );
}

function applyParentCompositeAdmissionCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (
    !isDurableParentCompositeArtifact(candidate) ||
    !shouldCorrectParentCompositeDecision(decision)
  ) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter(
        (code) =>
          code !== "embedded_component_only" && code !== "not_actionable" && code !== "sensitive",
      ),
      "durable",
      "useful_future_context",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Parent composite artifact retention is structural and code-owned in MMV2; embedded children stay inside the retained artifact, while standalone promotion remains child-owned.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.72),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.68),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.75),
      novelty: Math.max(decision.scores.novelty, 0.55),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.65),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.92),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.85),
    },
  };
}

function isSafeGroundedSourceRef(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  if (candidate.kind !== "source_ref") {
    return false;
  }
  const locator = candidate.payload.locator;
  return (
    typeof locator === "string" &&
    locator.trim().length > 0 &&
    hasExactEvidence(candidate) &&
    !hasSensitiveRiskFlags(candidate) &&
    candidate.quality.grounding >= 0.8 &&
    candidate.quality.specificity >= 0.75 &&
    candidate.confidence >= 0.7
  );
}

function looksLikePureResponseText(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  const combined = `${candidate.canonical_text}\n${candidate.source.evidence_quote}`.toLowerCase();
  return (
    combined.includes("for this answer") ||
    combined.includes("for this response") ||
    combined.includes("reply with") ||
    combined.includes("respond with")
  );
}

function isProjectScopedDurableAtomicCandidate(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  if (
    !hasExactEvidence(candidate) ||
    hasSensitiveRiskFlags(candidate) ||
    isClearlyTemporaryCandidate(candidate)
  ) {
    return false;
  }
  if (!hasProjectScopedContext(candidate) || looksLikePureResponseText(candidate)) {
    return false;
  }
  if (
    candidate.kind === "directive" &&
    typeof candidate.payload.directive_type === "string" &&
    typeof candidate.payload.action === "string"
  ) {
    return (
      candidate.quality.grounding >= 0.72 &&
      candidate.quality.specificity >= 0.6 &&
      candidate.quality.durability >= 0.52 &&
      candidate.confidence >= 0.58
    );
  }
  if (
    candidate.kind === "claim" &&
    typeof candidate.payload.claim_type === "string" &&
    typeof candidate.payload.subject === "string" &&
    typeof candidate.payload.object === "string"
  ) {
    return (
      candidate.payload.claim_type === "constraint_state" &&
      candidate.quality.grounding >= 0.75 &&
      candidate.quality.specificity >= 0.62 &&
      candidate.quality.durability >= 0.5 &&
      candidate.confidence >= 0.52
    );
  }
  return false;
}

function hasExplicitProjectFactEvidence(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    candidate.candidate_id.includes("det-project-fact:") ||
    /\bdurable\s+(?:workspace\s+)?project\s+fact:\s*\S/iu.test(candidate.source.evidence_quote)
  );
}

function isExplicitGroundedProjectFactClaim(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    candidate.kind === "claim" &&
    hasExplicitProjectFactEvidence(candidate) &&
    (candidate.payload.claim_type === "project_fact" ||
      candidate.scope.subject_type === "project" ||
      hasProjectScopedContext(candidate)) &&
    hasProjectScopedContext(candidate) &&
    hasExactEvidence(candidate) &&
    !hasSensitiveRiskFlags(candidate) &&
    !isClearlyTemporaryCandidate(candidate) &&
    !looksLikePureResponseText(candidate) &&
    candidate.quality.grounding >= 0.75 &&
    candidate.quality.specificity >= 0.7 &&
    candidate.quality.durability >= 0.48 &&
    candidate.confidence >= 0.52
  );
}

function hasExplicitPreferenceEvidence(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  const evidence = candidate.source.evidence_quote;
  return (
    /\bi (?:prefer|like|usually want|want)\b/iu.test(evidence) ||
    /\bdurable\s+correction:\s*replace\b[\s\S]*?\bpreference:\s*\S/iu.test(evidence) ||
    /\bstanding(?:\s+[\w-]+){0,8}\s+preference:\s*\S/iu.test(evidence)
  );
}

function isExplicitStablePreferenceClaim(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    candidate.kind === "claim" &&
    candidate.payload.claim_type === "preference_state" &&
    hasExactEvidence(candidate) &&
    !hasSensitiveRiskFlags(candidate) &&
    !isClearlyTemporaryCandidate(candidate) &&
    hasExplicitPreferenceEvidence(candidate) &&
    candidate.quality.grounding >= 0.75 &&
    candidate.quality.durability >= 0.6 &&
    candidate.quality.specificity >= 0.55 &&
    candidate.confidence >= 0.58
  );
}

function isExplicitScopedPreferenceClaim(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    candidate.kind === "claim" &&
    candidate.payload.claim_type === "preference_state" &&
    hasExactEvidence(candidate) &&
    !hasSensitiveRiskFlags(candidate) &&
    !isClearlyTemporaryCandidate(candidate) &&
    !looksLikePureResponseText(candidate) &&
    (hasProjectScopedContext(candidate) ||
      (Array.isArray(candidate.payload.qualifiers) &&
        candidate.payload.qualifiers.some(
          (value) => typeof value === "string" && value.trim().length > 0,
        ))) &&
    hasExplicitPreferenceEvidence(candidate) &&
    candidate.quality.grounding >= 0.72 &&
    candidate.quality.durability >= 0.5 &&
    candidate.quality.specificity >= 0.55 &&
    candidate.confidence >= 0.52
  );
}

function isStableAssistantDirectiveCandidate(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
): boolean {
  return (
    candidate.kind === "directive" &&
    typeof candidate.payload.directive_type === "string" &&
    typeof candidate.payload.target === "string" &&
    typeof candidate.payload.action === "string" &&
    hasExactEvidence(candidate) &&
    !hasSensitiveRiskFlags(candidate) &&
    !isClearlyTemporaryCandidate(candidate) &&
    !looksLikePureResponseText(candidate) &&
    (candidate.payload.target === "assistant" || candidate.payload.target === "system") &&
    candidate.quality.grounding >= 0.78 &&
    candidate.quality.specificity >= 0.62 &&
    candidate.quality.durability >= 0.58 &&
    candidate.confidence >= 0.58
  );
}

function applyPreferenceAdmissionCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (!isExplicitStablePreferenceClaim(candidate) && !isExplicitScopedPreferenceClaim(candidate)) {
    return decision;
  }
  if (decision.decision === "admit" || decision.scores.sensitivity_safety < 0.8) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter((code) => code !== "temporary" && code !== "too_vague"),
      "explicit_user_statement",
      "durable",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Explicit preference claim is durable enough to keep and should not be rejected merely because its scope is narrower than global.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.74),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.6),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.76),
      novelty: Math.max(decision.scores.novelty, 0.5),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.78),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.92),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.62),
    },
  };
}

function applyProjectFactAdmissionCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (!isExplicitGroundedProjectFactClaim(candidate)) {
    return decision;
  }
  if (decision.decision === "admit" || decision.scores.sensitivity_safety < 0.8) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter((code) => code !== "temporary" && code !== "too_vague"),
      "durable",
      "useful_future_context",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Exact grounded project fact is durable within the current project horizon and should proceed to deterministic reconciliation when related neighbors exist.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.72),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.62),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.72),
      novelty: Math.max(decision.scores.novelty, 0.48),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.82),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.92),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.72),
    },
  };
}

function applyStableAssistantDirectiveCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (!isStableAssistantDirectiveCandidate(candidate)) {
    return decision;
  }
  if (decision.decision === "admit" || decision.scores.sensitivity_safety < 0.8) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter((code) => code !== "temporary" && code !== "too_vague"),
      "clear_instruction",
      "durable",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Exact grounded assistant-behavior directive is durable enough to keep and should not be quarantined merely because the model treated it as soft guidance.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.74),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.66),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.74),
      novelty: Math.max(decision.scores.novelty, 0.46),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.72),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.92),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.68),
    },
  };
}

function applyProjectScopedAdmissionCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (!isProjectScopedDurableAtomicCandidate(candidate)) {
    return decision;
  }
  if (decision.decision === "admit" || decision.scores.sensitivity_safety < 0.8) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter((code) => code !== "temporary" && code !== "too_vague"),
      "clear_instruction",
      "durable",
      "useful_future_context",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Exact grounded project-scoped directive or constraint is durable within the current project horizon and should not be rejected merely for being bounded in scope.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.72),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.64),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.74),
      novelty: Math.max(decision.scores.novelty, 0.45),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.76),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.92),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.68),
    },
  };
}

function applySafeSourceRefAdmissionCorrection(
  candidate: CanonicalCandidateBatch["canonical_candidates"][number],
  decision: AdmissionDecisionRecord,
): AdmissionDecisionRecord {
  if (!isSafeGroundedSourceRef(candidate)) {
    return decision;
  }
  if (decision.decision === "reject" && decision.scores.sensitivity_safety < 0.8) {
    return decision;
  }

  const reasonCodes = Array.from(
    new Set([
      ...decision.reason_codes.filter(
        (code) => code !== "too_vague" && code !== "low_confidence" && code !== "temporary",
      ),
      "canonical_source",
      "useful_future_context",
    ]),
  ) as AdmissionDecisionRecord["reason_codes"];

  return {
    ...decision,
    decision: "admit",
    reason_codes: reasonCodes,
    rationale:
      "Safe grounded source reference should proceed to reconciliation; locator ambiguity is resolved downstream rather than in admission.",
    scores: {
      future_utility: Math.max(decision.scores.future_utility, 0.7),
      durability: Math.max(decision.scores.durability, candidate.quality.durability, 0.65),
      confidence: Math.max(decision.scores.confidence, candidate.confidence, 0.8),
      novelty: Math.max(decision.scores.novelty, 0.45),
      scope_clarity: Math.max(decision.scores.scope_clarity, 0.7),
      sensitivity_safety: Math.max(decision.scores.sensitivity_safety, 0.9),
      specificity: Math.max(decision.scores.specificity, candidate.quality.specificity, 0.8),
    },
  };
}

function applyDeterministicAdmissionMetadata(
  canonicalBatch: CanonicalCandidateBatch,
  decisions: AdmissionDecisionBatch,
  candidateNeighborsById: Record<string, ExistingMemorySummary[]>,
): AdmissionDecisionBatch {
  const candidateById = new Map(
    canonicalBatch.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return {
    ...decisions,
    decisions: decisions.decisions.map((decision) => {
      const candidate = candidateById.get(decision.candidate_id);
      if (!candidate) {
        return decision;
      }
      return {
        ...decision,
        requires_reconciliation: needsDeterministicReconciliation(
          candidate,
          candidateNeighborsById[decision.candidate_id] ?? [],
        ),
      };
    }),
  };
}

export function applyAdmissionThresholds(
  canonicalBatch: CanonicalCandidateBatch,
  decisions: AdmissionDecisionBatch,
): AdmissionDecisionBatch {
  const candidateById = new Map(
    canonicalBatch.canonical_candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );
  return {
    ...decisions,
    decisions: decisions.decisions.map((decision) => {
      const candidate = candidateById.get(decision.candidate_id);
      if (!candidate) {
        return { ...decision, decision: "quarantine" as const };
      }
      const correctedDecision = applySafeSourceRefAdmissionCorrection(
        candidate,
        applyStableAssistantDirectiveCorrection(
          candidate,
          applyPreferenceAdmissionCorrection(
            candidate,
            applyProjectFactAdmissionCorrection(
              candidate,
              applyProjectScopedAdmissionCorrection(
                candidate,
                applyParentCompositeAdmissionCorrection(candidate, decision),
              ),
            ),
          ),
        ),
      );
      if (
        correctedDecision.scores.sensitivity_safety < 0.5 ||
        correctedDecision.scores.confidence < 0.55 ||
        correctedDecision.scores.durability < 0.45 ||
        correctedDecision.scores.specificity < 0.45 ||
        correctedDecision.scores.scope_clarity < 0.45 ||
        candidate.promotion === "blocked"
      ) {
        return { ...correctedDecision, decision: "reject" as const };
      }
      if (candidate.unit_type === "component" && candidate.promotion === "embedded_only") {
        return { ...correctedDecision, decision: "embed_only" as const };
      }
      if (
        correctedDecision.scores.future_utility >= 0.65 &&
        correctedDecision.scores.durability >= 0.6 &&
        correctedDecision.scores.confidence >= 0.7 &&
        correctedDecision.scores.specificity >= 0.6 &&
        correctedDecision.scores.sensitivity_safety >= 0.8 &&
        correctedDecision.scores.scope_clarity >= 0.6
      ) {
        return {
          ...correctedDecision,
          decision: correctedDecision.decision === "embed_only" ? "embed_only" : "admit",
        };
      }
      if (correctedDecision.scores.confidence < 0.7) {
        return { ...correctedDecision, decision: "quarantine" as const };
      }
      return correctedDecision;
    }),
  };
}

export async function scoreAdmission(input: AdmissionInput): Promise<AdmissionDecisionBatch> {
  const candidateNeighborsById = input.candidateNeighborsById ?? {};
  const prompt = buildAdmissionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    canonicalCandidates: input.canonicalBatch.canonical_candidates,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const rawPayload = extractBatch(result);
  const parsed = AdmissionDecisionBatchSchema.safeParse(
    normalizeAdmissionPayload(rawPayload, input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const sanitized = sanitizeAdmissionBatchUnknown(
      rawPayload,
      input.rawEvent.event_id,
      input.canonicalBatch,
    );
    if (sanitized) {
      return finalizeAdmissionBatch({
        canonicalBatch: input.canonicalBatch,
        parsedBatch: sanitized,
        candidateNeighborsById,
      });
    }

    const repairPrompt = buildRepairPrompt({
      modelId: input.modelId,
      contractVersion: "mmv2-admission-repair-v1",
      originalPayload: rawPayload,
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      expectedOutputShape: [
        'Top-level keys: "schema_version", "event_id", "decisions".',
        '"schema_version" must be "admission_decision.v1".',
        'Each decision must include "candidate_id", "decision", "scores", "reason_codes", "rationale", "recommended_ttl_seconds", and "requires_reconciliation".',
        '"decision" must be one of "admit", "reject", "quarantine", or "embed_only".',
      ].join("\n"),
      responseSchemaName: "admission_decision_batch",
      responseSchema: AdmissionDecisionBatchSchema,
      responseMode: input.responseMode,
    });
    const repaired = await input.interpreter.interpret({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceWindow: input.sourceWindow,
      prompt: repairPrompt,
    });
    const repairedRaw = extractBatch(repaired);
    const repairedParsed = AdmissionDecisionBatchSchema.safeParse(
      normalizeAdmissionPayload(repairedRaw, input.rawEvent.event_id),
    );
    if (!repairedParsed.success) {
      const sanitizedRepair = sanitizeAdmissionBatchUnknown(
        repairedRaw,
        input.rawEvent.event_id,
        input.canonicalBatch,
      );
      if (sanitizedRepair) {
        return finalizeAdmissionBatch({
          canonicalBatch: input.canonicalBatch,
          parsedBatch: sanitizedRepair,
          candidateNeighborsById,
        });
      }
      throw new JsonModelOutputError(
        "invalid MMV2 admission repair output",
        repairPrompt.contract,
        JSON.stringify(repairedRaw),
      );
    }
    return finalizeAdmissionBatch({
      canonicalBatch: input.canonicalBatch,
      parsedBatch: repairedParsed.data,
      candidateNeighborsById,
    });
  }
  return finalizeAdmissionBatch({
    canonicalBatch: input.canonicalBatch,
    parsedBatch: parsed.data,
    candidateNeighborsById,
  });
}

export async function scoreAdmissionRuntime(
  input: AdmissionInput,
): Promise<AdmissionDecisionBatch> {
  const candidateNeighborsById = input.candidateNeighborsById ?? {};
  const deterministicDecisions: AdmissionDecisionRecord[] = [];
  const unresolvedCandidates = input.canonicalBatch.canonical_candidates.filter((candidate) => {
    const decision = buildDeterministicAdmissionDecision({
      candidate,
      neighbors: candidateNeighborsById[candidate.candidate_id] ?? [],
    });
    if (decision) {
      deterministicDecisions.push(decision);
      return false;
    }
    return true;
  });

  if (unresolvedCandidates.length === 0) {
    return ensureAdmissionCoverage(
      mergeAdmissionBatchesInCandidateOrder({
        canonicalBatch: input.canonicalBatch,
        deterministicDecisions,
        modelDecisions: [],
      }),
      input.canonicalBatch,
    );
  }

  const modelBatch = await scoreAdmission({
    ...input,
    canonicalBatch: {
      schema_version: "canonical_candidates.v1",
      event_id: input.canonicalBatch.event_id,
      canonical_candidates: unresolvedCandidates,
    },
    candidateNeighborsById: Object.fromEntries(
      unresolvedCandidates.map((candidate) => [
        candidate.candidate_id,
        candidateNeighborsById[candidate.candidate_id] ?? [],
      ]),
    ),
  });

  return ensureAdmissionCoverage(
    mergeAdmissionBatchesInCandidateOrder({
      canonicalBatch: input.canonicalBatch,
      deterministicDecisions,
      modelDecisions: modelBatch.decisions,
    }),
    input.canonicalBatch,
  );
}
