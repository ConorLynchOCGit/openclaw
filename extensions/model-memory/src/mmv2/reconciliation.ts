import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  ReconciliationDecisionSchema,
  ReconciliationInputSchema,
  type CanonicalCandidate,
  type ExistingMemorySummary,
  type ReconciliationDecision,
  type ReconciliationInput,
} from "./contracts.ts";
import {
  parseExplicitMemoryCommand,
  type StructuralCorrectionTargetRef,
} from "./explicit-memory-command.ts";
import {
  buildReconciliationPrompt,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import {
  createCanonicalSemanticKey,
  createExistingMemorySemanticKey,
  describeCanonicalClaimIdentity,
  describeExistingClaimIdentity,
  effectiveScopesEqual,
  getEffectiveScope,
  isNarrowerEffectiveScope,
  normalizeSemanticIdentityValue,
  sourceRefsShareFamily,
} from "./semantic-identity.ts";

type ReconcileInput = {
  eventId: string;
  candidate: CanonicalCandidate;
  neighbors: ExistingMemorySummary[];
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  responseMode?: MmV2PromptResponseMode;
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableNormalize(entryValue)]),
    );
  }
  return value;
}

function normalizedPayloadEquals(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(stableNormalize(left)) === JSON.stringify(stableNormalize(right));
}

function claimTypeOf(candidateOrMemory: CanonicalCandidate | ExistingMemorySummary): string {
  if (candidateOrMemory.kind !== "claim") {
    return "";
  }
  const payloadType =
    typeof candidateOrMemory.payload.claim_type === "string"
      ? candidateOrMemory.payload.claim_type
      : "";
  if (payloadType.length > 0) {
    return payloadType;
  }
  return "candidate_id" in candidateOrMemory
    ? describeCanonicalClaimIdentity(candidateOrMemory).claimType
    : describeExistingClaimIdentity(candidateOrMemory).claimType;
}

function claimIdentityOf(candidateOrMemory: CanonicalCandidate | ExistingMemorySummary) {
  return "candidate_id" in candidateOrMemory
    ? describeCanonicalClaimIdentity(candidateOrMemory)
    : describeExistingClaimIdentity(candidateOrMemory);
}

function sameClaimFamily(candidate: CanonicalCandidate, neighbor: ExistingMemorySummary): boolean {
  const left = claimIdentityOf(candidate);
  const right = claimIdentityOf(neighbor);
  return (
    left.subject.length > 0 &&
    left.predicate.length > 0 &&
    left.subject === right.subject &&
    left.predicate === right.predicate
  );
}

function claimObjectsDiffer(
  candidate: CanonicalCandidate,
  neighbor: ExistingMemorySummary,
): boolean {
  const left = claimIdentityOf(candidate);
  const right = claimIdentityOf(neighbor);
  return left.object.length > 0 && right.object.length > 0 && left.object !== right.object;
}

function preferenceSubjectOf(
  candidateOrMemory: CanonicalCandidate | ExistingMemorySummary,
): string {
  const identity = claimIdentityOf(candidateOrMemory);
  if (identity.subject.length > 0) {
    return identity.subject;
  }
  const scope = getEffectiveScope(candidateOrMemory.scope);
  return normalizeSemanticIdentityValue(scope.subject_id ?? scope.subject_type);
}

function preferenceObjectOf(candidateOrMemory: CanonicalCandidate | ExistingMemorySummary): string {
  const identity = claimIdentityOf(candidateOrMemory);
  if (identity.object.length > 0) {
    return identity.object;
  }
  const canonicalText = normalizeSemanticIdentityValue(candidateOrMemory.canonical_text);
  const match = canonicalText.match(/^the (.+?) prefers (.+)$/u);
  return match?.[2]?.trim() ?? "";
}

function samePreferenceFamily(
  candidate: CanonicalCandidate,
  neighbor: ExistingMemorySummary,
): boolean {
  if (!isPreferenceClaim(candidate) || !isPreferenceClaim(neighbor)) {
    return false;
  }
  const leftSubject = preferenceSubjectOf(candidate);
  const rightSubject = preferenceSubjectOf(neighbor);
  return leftSubject.length > 0 && leftSubject === rightSubject;
}

function preferenceObjectsDiffer(
  candidate: CanonicalCandidate,
  neighbor: ExistingMemorySummary,
): boolean {
  const leftObject = preferenceObjectOf(candidate);
  const rightObject = preferenceObjectOf(neighbor);
  return leftObject.length > 0 && rightObject.length > 0 && leftObject !== rightObject;
}

function equivalentPreferenceScopes(
  candidateScope: Record<string, unknown>,
  neighborScope: Record<string, unknown>,
): boolean {
  if (effectiveScopesEqual(candidateScope, neighborScope)) {
    return true;
  }
  const left = getEffectiveScope(candidateScope);
  const right = getEffectiveScope(neighborScope);
  return (
    left.applies_to === right.applies_to &&
    left.subject_type === right.subject_type &&
    left.project_id === right.project_id &&
    left.workspace_id === right.workspace_id &&
    (left.subject_id === right.subject_id || !left.subject_id || !right.subject_id)
  );
}

function hasExplicitPreferenceEvidence(candidate: CanonicalCandidate): boolean {
  const evidence = normalizeSemanticIdentityValue(candidate.source.evidence_quote);
  return (
    /^i (prefer|like|usually want|want) /u.test(evidence) ||
    /\bi prefer\b/u.test(evidence) ||
    /\bi like\b/u.test(evidence) ||
    hasExplicitPreferenceReplacementEvidence(candidate) ||
    /\bdurable correction replace\b[\s\S]*?\bpreference\s+\S/u.test(evidence) ||
    /\bstanding(?:\s+\w+){0,8}\s+preference\s+\S/u.test(evidence)
  );
}

function hasExplicitPreferenceReplacementEvidence(candidate: CanonicalCandidate): boolean {
  if (candidate.candidate_id.startsWith("det-correction-preference:")) {
    return true;
  }
  const evidence = normalizeSemanticIdentityValue(candidate.source.evidence_quote);
  return (
    /\bdurable correction\b[\s\S]*?\breplace\b[\s\S]*?\bpreference\b/u.test(evidence) ||
    /\breplace\b[\s\S]*?\bwith\b[\s\S]*?\bpreference\b/u.test(evidence) ||
    /\bsupersede\b[\s\S]*?\bpreference\b/u.test(evidence)
  );
}

function explicitCorrectionTargetRefs(
  candidate: CanonicalCandidate,
): StructuralCorrectionTargetRef[] {
  const command = parseExplicitMemoryCommand(candidate.source.evidence_quote);
  return command?.commandType === "correction_preference" ? command.targetRefs : [];
}

function isExplicitCorrectionCommand(candidate: CanonicalCandidate): boolean {
  return (
    parseExplicitMemoryCommand(candidate.source.evidence_quote)?.commandType ===
    "correction_preference"
  );
}

function resolveStructuralCorrectionTargets(input: {
  targetRefs: StructuralCorrectionTargetRef[];
  neighbors: ExistingMemorySummary[];
}): {
  resolvedMemoryIds: string[];
  unresolvedRefs: StructuralCorrectionTargetRef[];
  unsupportedRefs: StructuralCorrectionTargetRef[];
} {
  const resolved = new Set<string>();
  const unresolvedRefs: StructuralCorrectionTargetRef[] = [];
  const unsupportedRefs: StructuralCorrectionTargetRef[] = [];
  const neighborIds = new Set(input.neighbors.map((neighbor) => neighbor.memory_id));

  for (const ref of input.targetRefs) {
    if (ref.type === "memory_id") {
      if (neighborIds.has(ref.value)) {
        resolved.add(ref.value);
      } else {
        unresolvedRefs.push(ref);
      }
      continue;
    }
    unsupportedRefs.push(ref);
  }

  return {
    resolvedMemoryIds: [...resolved],
    unresolvedRefs,
    unsupportedRefs,
  };
}

function buildUnresolvedCorrectionDecision(
  candidate: CanonicalCandidate,
  reason: string,
): ReconciliationDecision {
  return ReconciliationDecisionSchema.parse({
    schema_version: "reconciliation_decision.v1",
    event_id: candidate.source.event_id,
    candidate_id: candidate.candidate_id,
    decision: "insert_new",
    target_memory_ids: [],
    merged_canonical_text: null,
    conflict_type: "ambiguous",
    supersedes_memory_ids: [],
    rationale: reason,
    confidence: 0.86,
  });
}

function hasExplicitScopedPreferenceContext(candidate: CanonicalCandidate): boolean {
  const qualifiers = Array.isArray(candidate.payload.qualifiers)
    ? candidate.payload.qualifiers.filter((value): value is string => typeof value === "string")
    : [];
  if (qualifiers.some((value) => normalizeSemanticIdentityValue(value).length > 0)) {
    return true;
  }
  return /^for\s+[^,]+,\s*i (?:prefer|like|usually want|want)\b/u.test(
    normalizeSemanticIdentityValue(candidate.source.evidence_quote),
  );
}

function isPreferenceClaim(candidateOrMemory: CanonicalCandidate | ExistingMemorySummary): boolean {
  return claimTypeOf(candidateOrMemory) === "preference_state";
}

function isProjectFactClaim(
  candidateOrMemory: CanonicalCandidate | ExistingMemorySummary,
): boolean {
  return claimTypeOf(candidateOrMemory) === "project_fact";
}

function findExactDuplicateNeighbor(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
): ExistingMemorySummary | null {
  const candidateSemanticKey = createCanonicalSemanticKey(candidate);
  return (
    neighbors.find(
      (neighbor) =>
        createExistingMemorySemanticKey(neighbor) === candidateSemanticKey &&
        effectiveScopesEqual(neighbor.scope, candidate.scope) &&
        (neighbor.canonical_text === candidate.canonical_text ||
          normalizedPayloadEquals(neighbor.payload, candidate.payload)),
    ) ?? null
  );
}

export function applyDeterministicReconciliationShortcuts(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
): ReconciliationDecision | null {
  if (
    candidate.kind === "claim" &&
    isPreferenceClaim(candidate) &&
    isExplicitCorrectionCommand(candidate)
  ) {
    const targetRefs = explicitCorrectionTargetRefs(candidate);
    if (targetRefs.length === 0) {
      return buildUnresolvedCorrectionDecision(
        candidate,
        "Explicit correction command did not provide a structural target, so MMV2 inserted it as an unresolved-target correction without superseding by semantic similarity.",
      );
    }
    const resolved = resolveStructuralCorrectionTargets({
      targetRefs,
      neighbors,
    });
    if (
      resolved.resolvedMemoryIds.length === 0 ||
      resolved.unresolvedRefs.length > 0 ||
      resolved.unsupportedRefs.length > 0
    ) {
      return buildUnresolvedCorrectionDecision(
        candidate,
        "Explicit correction command had unresolved or unsupported structural target refs, so MMV2 inserted it as an unresolved-target correction without fuzzy supersession.",
      );
    }
    return ReconciliationDecisionSchema.parse({
      schema_version: "reconciliation_decision.v1",
      event_id: candidate.source.event_id,
      candidate_id: candidate.candidate_id,
      decision: "supersede_existing",
      target_memory_ids: resolved.resolvedMemoryIds,
      merged_canonical_text: null,
      conflict_type: "preference_changed",
      supersedes_memory_ids: resolved.resolvedMemoryIds,
      rationale:
        "Explicit correction command resolved structural memory_id target refs and superseded only those targeted memories.",
      confidence: 0.95,
    });
  }

  const exact = findExactDuplicateNeighbor(candidate, neighbors);
  if (exact) {
    return ReconciliationDecisionSchema.parse({
      schema_version: "reconciliation_decision.v1",
      event_id: candidate.source.event_id,
      candidate_id: candidate.candidate_id,
      decision: "keep_existing_ignore_candidate",
      target_memory_ids: [exact.memory_id],
      merged_canonical_text: null,
      conflict_type: "duplicate",
      supersedes_memory_ids: [],
      rationale: "Exact duplicate candidate.",
      confidence: 1,
    });
  }

  if (candidate.kind === "source_ref") {
    const nearDuplicate = neighbors.find(
      (neighbor) =>
        neighbor.kind === "source_ref" &&
        typeof neighbor.payload.locator === "string" &&
        typeof candidate.payload.locator === "string" &&
        neighbor.payload.locator !== candidate.payload.locator &&
        sourceRefsShareFamily(neighbor.payload.locator, candidate.payload.locator),
    );
    if (nearDuplicate) {
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "record_as_conflict",
        target_memory_ids: [nearDuplicate.memory_id],
        merged_canonical_text: null,
        conflict_type: "ambiguous",
        supersedes_memory_ids: [],
        rationale:
          "Source reference belongs to the same document family as an existing locator but points to a different path, so it cannot be merged safely.",
        confidence: 0.92,
      });
    }

    const sameLocator = neighbors.find(
      (neighbor) =>
        neighbor.kind === "source_ref" && neighbor.payload.locator === candidate.payload.locator,
    );
    if (sameLocator) {
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "merge_with_existing",
        target_memory_ids: [sameLocator.memory_id],
        merged_canonical_text: candidate.canonical_text,
        conflict_type: "duplicate",
        supersedes_memory_ids: [],
        rationale: "Source reference locator already exists.",
        confidence: 0.95,
      });
    }
  }

  if (candidate.kind === "claim" && isPreferenceClaim(candidate)) {
    const equivalentPreferenceNeighbors = neighbors.filter(
      (neighbor) =>
        neighbor.kind === "claim" &&
        isPreferenceClaim(neighbor) &&
        samePreferenceFamily(candidate, neighbor) &&
        equivalentPreferenceScopes(neighbor.scope, candidate.scope) &&
        preferenceObjectsDiffer(candidate, neighbor),
    );
    if (
      equivalentPreferenceNeighbors.length > 0 &&
      hasExplicitPreferenceReplacementEvidence(candidate)
    ) {
      const supersededIds = equivalentPreferenceNeighbors.map((neighbor) => neighbor.memory_id);
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "supersede_existing",
        target_memory_ids: supersededIds,
        merged_canonical_text: null,
        conflict_type: "preference_changed",
        supersedes_memory_ids: supersededIds,
        rationale: "Explicit correction requested replacement of prior preference state.",
        confidence: 0.95,
      });
    }

    const scopedCoexistenceNeighbor = neighbors.find(
      (neighbor) =>
        neighbor.kind === "claim" &&
        isPreferenceClaim(neighbor) &&
        samePreferenceFamily(candidate, neighbor) &&
        (isNarrowerEffectiveScope(candidate.scope, neighbor.scope) ||
          hasExplicitScopedPreferenceContext(candidate)) &&
        preferenceObjectsDiffer(candidate, neighbor),
    );
    if (
      scopedCoexistenceNeighbor &&
      hasExplicitPreferenceEvidence(candidate) &&
      !hasExplicitPreferenceReplacementEvidence(candidate)
    ) {
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "insert_new",
        target_memory_ids: [scopedCoexistenceNeighbor.memory_id],
        merged_canonical_text: null,
        conflict_type: "scope_narrowing",
        supersedes_memory_ids: [],
        rationale:
          "Candidate is a narrower contextual preference that can co-exist with the broader baseline preference.",
        confidence: 0.9,
      });
    }

    const olderPreference = neighbors.find(
      (neighbor) =>
        neighbor.kind === "claim" &&
        isPreferenceClaim(neighbor) &&
        samePreferenceFamily(candidate, neighbor) &&
        equivalentPreferenceScopes(neighbor.scope, candidate.scope) &&
        preferenceObjectsDiffer(candidate, neighbor),
    );
    if (
      olderPreference &&
      hasExplicitPreferenceEvidence(candidate) &&
      !hasExplicitPreferenceReplacementEvidence(candidate) &&
      !hasExplicitScopedPreferenceContext(candidate)
    ) {
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "supersede_existing",
        target_memory_ids: [olderPreference.memory_id],
        merged_canonical_text: null,
        conflict_type: "preference_changed",
        supersedes_memory_ids: [olderPreference.memory_id],
        rationale: "Explicit newer preference changed the prior preference state.",
        confidence: 0.9,
      });
    }
  }

  if (candidate.kind === "claim" && isProjectFactClaim(candidate)) {
    const narrowedProjectFactNeighbor = neighbors.find(
      (neighbor) =>
        neighbor.kind === "claim" &&
        isProjectFactClaim(neighbor) &&
        sameClaimFamily(candidate, neighbor) &&
        !claimObjectsDiffer(candidate, neighbor) &&
        isNarrowerEffectiveScope(candidate.scope, neighbor.scope),
    );
    if (narrowedProjectFactNeighbor) {
      return ReconciliationDecisionSchema.parse({
        schema_version: "reconciliation_decision.v1",
        event_id: candidate.source.event_id,
        candidate_id: candidate.candidate_id,
        decision: "record_as_conflict",
        target_memory_ids: [narrowedProjectFactNeighbor.memory_id],
        merged_canonical_text: null,
        conflict_type: "scope_narrowing",
        supersedes_memory_ids: [],
        rationale:
          "Project-scoped fact narrows a broader existing fact and requires explicit review before replacing or coexisting.",
        confidence: 0.9,
      });
    }
  }

  return null;
}

function normalizeReconciliationPayload(
  raw: unknown,
  eventId: string,
  candidateId: string,
): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      schema_version: "reconciliation_decision.v1",
      event_id: eventId,
      candidate_id: candidateId,
      ...raw,
    };
  }
  return raw;
}

function applyScopedPreferenceCoexistenceNormalization(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
  decision: ReconciliationDecision,
): ReconciliationDecision {
  if (candidate.kind !== "claim" || !isPreferenceClaim(candidate)) {
    return decision;
  }
  if (decision.decision === "insert_new" && decision.conflict_type === "scope_narrowing") {
    return decision;
  }
  const broaderPreference = neighbors.find(
    (neighbor) =>
      neighbor.kind === "claim" &&
      isPreferenceClaim(neighbor) &&
      samePreferenceFamily(candidate, neighbor) &&
      (isNarrowerEffectiveScope(candidate.scope, neighbor.scope) ||
        hasExplicitScopedPreferenceContext(candidate)) &&
      preferenceObjectsDiffer(candidate, neighbor),
  );
  if (!broaderPreference || !hasExplicitPreferenceEvidence(candidate)) {
    return decision;
  }
  if (
    decision.decision === "supersede_existing" ||
    decision.decision === "record_as_conflict" ||
    decision.decision === "quarantine"
  ) {
    return ReconciliationDecisionSchema.parse({
      schema_version: "reconciliation_decision.v1",
      event_id: candidate.source.event_id,
      candidate_id: candidate.candidate_id,
      decision: "insert_new",
      target_memory_ids: [broaderPreference.memory_id],
      merged_canonical_text: null,
      conflict_type: "scope_narrowing",
      supersedes_memory_ids: [],
      rationale:
        "Explicit narrower contextual preference should co-exist with the broader baseline preference rather than supersede it.",
      confidence: Math.max(decision.confidence, 0.88),
    });
  }
  return decision;
}

function applyExactDuplicateNormalization(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
  decision: ReconciliationDecision,
): ReconciliationDecision {
  if (
    decision.decision !== "merge_with_existing" &&
    decision.decision !== "insert_new" &&
    decision.decision !== "record_as_conflict"
  ) {
    return decision;
  }
  const exact = findExactDuplicateNeighbor(candidate, neighbors);
  if (!exact) {
    return decision;
  }
  return ReconciliationDecisionSchema.parse({
    schema_version: "reconciliation_decision.v1",
    event_id: candidate.source.event_id,
    candidate_id: candidate.candidate_id,
    decision: "keep_existing_ignore_candidate",
    target_memory_ids: [exact.memory_id],
    merged_canonical_text: null,
    conflict_type: "duplicate",
    supersedes_memory_ids: [],
    rationale: "Exact duplicate candidate.",
    confidence: Math.max(decision.confidence, 0.98),
  });
}

function applyReconciliationNormalizations(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
  decision: ReconciliationDecision,
): ReconciliationDecision {
  return applyScopedPreferenceCoexistenceNormalization(
    candidate,
    neighbors,
    applyExactDuplicateNormalization(candidate, neighbors, decision),
  );
}

export async function reconcileCandidate(input: ReconcileInput): Promise<ReconciliationDecision> {
  if (input.neighbors.length === 0) {
    return ReconciliationDecisionSchema.parse({
      schema_version: "reconciliation_decision.v1",
      event_id: input.eventId,
      candidate_id: input.candidate.candidate_id,
      decision: "insert_new",
      target_memory_ids: [],
      merged_canonical_text: null,
      conflict_type: "none",
      supersedes_memory_ids: [],
      rationale:
        "No related neighbors were retrieved, so the candidate can be inserted without model reconciliation.",
      confidence: 1,
    });
  }

  const shortcut = applyDeterministicReconciliationShortcuts(input.candidate, input.neighbors);
  if (shortcut) {
    return shortcut;
  }

  const reconciliationInput: ReconciliationInput = ReconciliationInputSchema.parse({
    schema_version: "reconciliation_input.v1",
    event_id: input.eventId,
    candidate: input.candidate,
    neighbors: input.neighbors,
  });
  const prompt = buildReconciliationPrompt({
    modelId: input.modelId,
    reconciliationInput,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const raw =
    result.action === "capture"
      ? result.objects.length === 1
        ? result.objects[0]
        : result.objects
      : null;
  const parsed = ReconciliationDecisionSchema.safeParse(
    normalizeReconciliationPayload(raw, input.eventId, input.candidate.candidate_id),
  );
  if (!parsed.success) {
    const repairPrompt = buildRepairPrompt({
      modelId: input.modelId,
      contractVersion: "mmv2-reconciliation-repair-v1",
      originalPayload: raw,
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      expectedOutputShape: [
        'Top-level keys: "schema_version", "event_id", "candidate_id", "decision", "target_memory_ids", "merged_canonical_text", "conflict_type", "supersedes_memory_ids", "rationale", and "confidence".',
        '"schema_version" must be "reconciliation_decision.v1".',
        '"decision" must be one of "insert_new", "merge_with_existing", "supersede_existing", "keep_existing_ignore_candidate", "record_as_conflict", or "quarantine".',
      ].join("\n"),
      responseSchemaName: "reconciliation_decision",
      responseSchema: ReconciliationDecisionSchema,
      responseMode: input.responseMode,
    });
    const repaired = await input.interpreter.interpret({
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceWindow: input.sourceWindow,
      prompt: repairPrompt,
    });
    const repairedRaw =
      repaired.action === "capture"
        ? repaired.objects.length === 1
          ? repaired.objects[0]
          : repaired.objects
        : null;
    const repairedParsed = ReconciliationDecisionSchema.safeParse(
      normalizeReconciliationPayload(repairedRaw, input.eventId, input.candidate.candidate_id),
    );
    if (!repairedParsed.success) {
      throw new JsonModelOutputError(
        "invalid MMV2 reconciliation repair output",
        repairPrompt.contract,
        JSON.stringify(repairedRaw),
      );
    }
    return applyReconciliationNormalizations(input.candidate, input.neighbors, repairedParsed.data);
  }
  return applyReconciliationNormalizations(input.candidate, input.neighbors, parsed.data);
}
