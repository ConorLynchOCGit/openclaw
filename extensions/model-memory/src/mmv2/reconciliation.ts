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
import { buildReconciliationPrompt, buildRepairPrompt } from "./prompt-contracts.ts";

type ReconcileInput = {
  eventId: string;
  candidate: CanonicalCandidate;
  neighbors: ExistingMemorySummary[];
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
};

export function applyDeterministicReconciliationShortcuts(
  candidate: CanonicalCandidate,
  neighbors: ExistingMemorySummary[],
): ReconciliationDecision | null {
  const exact = neighbors.find(
    (neighbor) =>
      neighbor.kind === candidate.kind &&
      neighbor.canonical_text === candidate.canonical_text &&
      JSON.stringify(neighbor.payload) === JSON.stringify(candidate.payload) &&
      JSON.stringify(neighbor.scope) === JSON.stringify(candidate.scope),
  );
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

  if (candidate.kind === "claim" && candidate.payload.claim_type === "preference_state") {
    const olderPreference = neighbors.find(
      (neighbor) =>
        neighbor.kind === "claim" &&
        neighbor.payload.claim_type === "preference_state" &&
        neighbor.payload.subject === candidate.payload.subject &&
        neighbor.payload.predicate === candidate.payload.predicate &&
        neighbor.payload.object !== candidate.payload.object,
    );
    if (olderPreference) {
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

  return null;
}

export async function reconcileCandidate(input: ReconcileInput): Promise<ReconciliationDecision> {
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
  const parsed = ReconciliationDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    const repairPrompt = buildRepairPrompt({
      modelId: input.modelId,
      contractVersion: "mmv2-reconciliation-repair-v1",
      originalPayload: raw,
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
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
    const repairedParsed = ReconciliationDecisionSchema.safeParse(repairedRaw);
    if (!repairedParsed.success) {
      throw new JsonModelOutputError(
        "invalid MMV2 reconciliation repair output",
        repairPrompt.contract,
        JSON.stringify(repairedRaw),
      );
    }
    return repairedParsed.data;
  }
  return parsed.data;
}
