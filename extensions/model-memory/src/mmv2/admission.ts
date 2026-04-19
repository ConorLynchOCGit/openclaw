import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  AdmissionDecisionBatchSchema,
  type AdmissionDecisionBatch,
  type CanonicalCandidateBatch,
  type RawIngestEvent,
} from "./contracts.ts";
import { buildAdmissionPrompt, buildRepairPrompt } from "./prompt-contracts.ts";

type AdmissionInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  canonicalBatch: CanonicalCandidateBatch;
};

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
      if (
        decision.scores.sensitivity_safety < 0.5 ||
        decision.scores.confidence < 0.55 ||
        decision.scores.durability < 0.45 ||
        decision.scores.specificity < 0.45 ||
        decision.scores.scope_clarity < 0.45 ||
        candidate.promotion === "blocked"
      ) {
        return { ...decision, decision: "reject" as const };
      }
      if (candidate.unit_type === "component" && candidate.promotion === "embedded_only") {
        return { ...decision, decision: "embed_only" as const };
      }
      if (
        decision.scores.future_utility >= 0.65 &&
        decision.scores.durability >= 0.6 &&
        decision.scores.confidence >= 0.7 &&
        decision.scores.specificity >= 0.6 &&
        decision.scores.sensitivity_safety >= 0.8 &&
        decision.scores.scope_clarity >= 0.6
      ) {
        return {
          ...decision,
          decision: decision.decision === "embed_only" ? "embed_only" : "admit",
        };
      }
      if (decision.scores.confidence < 0.7 || decision.requires_reconciliation) {
        return { ...decision, decision: "quarantine" as const };
      }
      return decision;
    }),
  };
}

export async function scoreAdmission(input: AdmissionInput): Promise<AdmissionDecisionBatch> {
  const prompt = buildAdmissionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    canonicalCandidates: input.canonicalBatch.canonical_candidates,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = AdmissionDecisionBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    const repairPrompt = buildRepairPrompt({
      modelId: input.modelId,
      contractVersion: "mmv2-admission-repair-v1",
      originalPayload: extractBatch(result),
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
    const repairedParsed = AdmissionDecisionBatchSchema.safeParse(extractBatch(repaired));
    if (!repairedParsed.success) {
      throw new JsonModelOutputError(
        "invalid MMV2 admission repair output",
        repairPrompt.contract,
        JSON.stringify(extractBatch(repaired)),
      );
    }
    return applyAdmissionThresholds(input.canonicalBatch, repairedParsed.data);
  }
  return applyAdmissionThresholds(input.canonicalBatch, parsed.data);
}
