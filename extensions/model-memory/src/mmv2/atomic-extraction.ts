import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  AtomicExtractionBatchSchema,
  type AtomicExtractionBatch,
  type RawIngestEvent,
  type SegmentedIngestEvent,
} from "./contracts.ts";
import {
  buildAtomicExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildRepairPrompt,
} from "./prompt-contracts.ts";

type AtomicInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  segments: SegmentedIngestEvent["segments"];
};

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "atomic_extraction.v1",
      event_id: "",
      atomic_candidates: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function validateAtomic(
  batch: AtomicExtractionBatch,
  segments: SegmentedIngestEvent["segments"],
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const byId = new Map(segments.map((segment) => [segment.segment_id, segment]));
  batch.atomic_candidates.forEach((candidate, index) => {
    const segment = byId.get(candidate.source_segment_id);
    if (!segment) {
      errors.push({
        path: `atomic_candidates.${index}.source_segment_id`,
        message: "source_segment_id does not exist",
      });
      return;
    }
    if (!segment.text.includes(candidate.evidence_quote)) {
      errors.push({
        path: `atomic_candidates.${index}.evidence_quote`,
        message: "evidence_quote must be an exact substring of the source segment",
      });
    }
    if (!/[.!?]$/.test(candidate.normalized_statement.trim())) {
      errors.push({
        path: `atomic_candidates.${index}.normalized_statement`,
        message: "normalized_statement must be a single sentence",
      });
    }
    if (candidate.payload.payload_type !== candidate.kind) {
      errors.push({
        path: `atomic_candidates.${index}.payload.payload_type`,
        message: "payload_type must match kind",
      });
    }
    if (candidate.source_grounding === "weakly_implied" && candidate.confidence > 0.65) {
      errors.push({
        path: `atomic_candidates.${index}.confidence`,
        message: "weakly implied candidates cannot claim high confidence",
      });
    }
    if (
      candidate.kind === "directive" &&
      candidate.payload.payload_type === "directive" &&
      (!candidate.payload.trigger || !candidate.payload.action)
    ) {
      errors.push({
        path: `atomic_candidates.${index}.payload`,
        message: "directive requires trigger and action",
      });
    }
    if (
      candidate.kind === "source_ref" &&
      candidate.payload.payload_type === "source_ref" &&
      !candidate.payload.locator
    ) {
      errors.push({
        path: `atomic_candidates.${index}.payload.locator`,
        message: "source_ref requires a locator",
      });
    }
    if (
      candidate.kind === "episode" &&
      candidate.payload.payload_type === "episode" &&
      (!candidate.payload.action || !candidate.payload.outcome)
    ) {
      errors.push({
        path: `atomic_candidates.${index}.payload`,
        message: "episode requires action and outcome",
      });
    }
  });
  return errors;
}

export async function repairAtomicExtraction(
  input: AtomicInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<AtomicExtractionBatch> {
  const useEvidenceRepair = input.validationErrors.some((entry) =>
    entry.path.includes("evidence_quote"),
  );
  const prompt = useEvidenceRepair
    ? buildEvidenceRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-atomic-evidence-repair-v1",
        originalPayload: {
          raw_event: input.rawEvent,
          segments: input.segments,
          previous_payload: input.previousPayload,
        },
      })
    : buildRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-atomic-repair-v1",
        originalPayload: {
          raw_event: input.rawEvent,
          segments: input.segments,
          previous_payload: input.previousPayload,
        },
        validationErrors: input.validationErrors,
      });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = AtomicExtractionBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 atomic extraction repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return parsed.data;
}

export async function extractAtomicCandidates(input: AtomicInput): Promise<AtomicExtractionBatch> {
  const prompt = buildAtomicExtractionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    segments: input.segments,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = AtomicExtractionBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    return repairAtomicExtraction({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const errors = validateAtomic(parsed.data, input.segments);
  if (errors.length > 0) {
    return repairAtomicExtraction({
      ...input,
      previousPayload: parsed.data,
      validationErrors: errors,
    });
  }
  return parsed.data;
}
