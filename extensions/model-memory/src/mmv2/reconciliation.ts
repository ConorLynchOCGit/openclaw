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
  effectiveScopesEqual,
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

function isModelTypedPreferenceClaim(candidate: CanonicalCandidate): boolean {
  return candidate.kind === "claim" && candidate.payload.claim_type === "preference_state";
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
  if (isModelTypedPreferenceClaim(candidate) && isExplicitCorrectionCommand(candidate)) {
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
    return applyExactDuplicateNormalization(input.candidate, input.neighbors, repairedParsed.data);
  }
  return applyExactDuplicateNormalization(input.candidate, input.neighbors, parsed.data);
}
