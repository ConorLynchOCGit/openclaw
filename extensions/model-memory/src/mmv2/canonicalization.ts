import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  CanonicalCandidateBatchSchema,
  type AtomicExtractionBatch,
  type CanonicalCandidateBatch,
  type CompositeExtractionBatch,
  type RawIngestEvent,
} from "./contracts.ts";
import { buildCanonicalizationPrompt, buildRepairPrompt } from "./prompt-contracts.ts";

type CanonicalizationInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  atomicBatch: AtomicExtractionBatch;
  compositeBatch: CompositeExtractionBatch;
};

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "canonical_candidates.v1",
      event_id: "",
      canonical_candidates: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function validateCanonical(
  batch: CanonicalCandidateBatch,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  batch.canonical_candidates.forEach((candidate, index) => {
    if (candidate.kind && candidate.unit_type === "composite") {
      errors.push({
        path: `canonical_candidates.${index}.kind`,
        message: "composite candidates must not declare an atomic kind",
      });
    }
    if (candidate.kind === "claim" && /\b(always|never|must)\b/i.test(candidate.canonical_text)) {
      errors.push({
        path: `canonical_candidates.${index}.canonical_text`,
        message: "claim canonical text drifted into directive modality",
      });
    }
    if (candidate.kind === "directive" && /\bthe user prefers\b/i.test(candidate.canonical_text)) {
      errors.push({
        path: `canonical_candidates.${index}.canonical_text`,
        message: "directive canonical text drifted into descriptive preference wording",
      });
    }
  });
  return errors;
}

export async function repairCanonicalization(
  input: CanonicalizationInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<CanonicalCandidateBatch> {
  const prompt = buildRepairPrompt({
    modelId: input.modelId,
    contractVersion: "mmv2-canonicalization-repair-v1",
    originalPayload: input.previousPayload,
    validationErrors: input.validationErrors,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CanonicalCandidateBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 canonicalization repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return parsed.data;
}

export async function canonicalizeCandidates(
  input: CanonicalizationInput,
): Promise<CanonicalCandidateBatch> {
  const extractedCandidates = [
    ...input.atomicBatch.atomic_candidates,
    ...input.compositeBatch.composite_candidates,
  ];
  const prompt = buildCanonicalizationPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    extractedCandidates,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CanonicalCandidateBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    return repairCanonicalization({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const errors = validateCanonical(parsed.data);
  if (errors.length > 0) {
    return repairCanonicalization({
      ...input,
      previousPayload: parsed.data,
      validationErrors: errors,
    });
  }
  return parsed.data;
}
