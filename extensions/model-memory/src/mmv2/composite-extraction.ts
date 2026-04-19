import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  CompositeExtractionBatchSchema,
  type AtomicExtractionBatch,
  type CompositeCandidate,
  type CompositeExtractionBatch,
  type RawIngestEvent,
  type SegmentedIngestEvent,
} from "./contracts.ts";
import {
  buildCompositeExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildRepairPrompt,
} from "./prompt-contracts.ts";

type CompositeInput = {
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
      schema_version: "composite_extraction.v1",
      event_id: "",
      composite_candidates: [],
    };
  }
  return result.objects.length === 1 ? result.objects[0] : result.objects;
}

function validateComposite(
  batch: CompositeExtractionBatch,
  segments: SegmentedIngestEvent["segments"],
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const byId = new Map(segments.map((segment) => [segment.segment_id, segment]));
  batch.composite_candidates.forEach((candidate, index) => {
    const segment = byId.get(candidate.source_segment_id);
    if (!segment) {
      errors.push({
        path: `composite_candidates.${index}.source_segment_id`,
        message: "source_segment_id does not exist",
      });
      return;
    }
    if (!segment.text.includes(candidate.evidence_quote)) {
      errors.push({
        path: `composite_candidates.${index}.evidence_quote`,
        message: "evidence_quote must be an exact substring of the source segment",
      });
    }
    const orderIndexes = candidate.components
      .map((component) => component.order_index)
      .toSorted((a, b) => a - b);
    orderIndexes.forEach((value, orderIndex) => {
      if (value !== orderIndex) {
        errors.push({
          path: `composite_candidates.${index}.components.${orderIndex}.order_index`,
          message: "order_index must be contiguous from 0",
        });
      }
    });
    candidate.components.forEach((component, componentIndex) => {
      if (!segment.text.includes(component.evidence_quote)) {
        errors.push({
          path: `composite_candidates.${index}.components.${componentIndex}.evidence_quote`,
          message: "component evidence_quote must be an exact substring of the source segment",
        });
      }
    });
  });
  return errors;
}

function normalizeCompositeCandidate(candidate: CompositeCandidate): CompositeCandidate {
  return {
    ...candidate,
    components: candidate.components.map((component) => {
      if (
        ["step", "substep", "example", "rationale"].includes(component.role) &&
        component.promotion === "global"
      ) {
        return { ...component, promotion: "embedded_only" as const };
      }
      return component;
    }),
  };
}

export function suppressAtomicCandidatesOwnedByComposites(
  atomicBatch: AtomicExtractionBatch,
  compositeBatch: CompositeExtractionBatch,
): AtomicExtractionBatch {
  const ownedSegmentIds = new Set(
    compositeBatch.composite_candidates.map((candidate) => candidate.source_segment_id),
  );
  const promotedEvidence = new Set<string>();
  for (const candidate of compositeBatch.composite_candidates) {
    for (const component of candidate.components) {
      if (component.promotion === "global" || component.promotion === "both") {
        promotedEvidence.add(component.evidence_quote);
      }
    }
  }

  return {
    ...atomicBatch,
    atomic_candidates: atomicBatch.atomic_candidates.filter((candidate) => {
      if (!ownedSegmentIds.has(candidate.source_segment_id)) {
        return true;
      }
      return promotedEvidence.has(candidate.evidence_quote);
    }),
  };
}

export async function repairCompositeExtraction(
  input: CompositeInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<CompositeExtractionBatch> {
  const useEvidenceRepair = input.validationErrors.some((entry) =>
    entry.path.includes("evidence_quote"),
  );
  const prompt = useEvidenceRepair
    ? buildEvidenceRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-composite-evidence-repair-v1",
        originalPayload: {
          raw_event: input.rawEvent,
          segments: input.segments,
          previous_payload: input.previousPayload,
        },
      })
    : buildRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-composite-repair-v1",
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
  const parsed = CompositeExtractionBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 composite extraction repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return {
    ...parsed.data,
    composite_candidates: parsed.data.composite_candidates.map(normalizeCompositeCandidate),
  };
}

export async function extractCompositeCandidates(
  input: CompositeInput,
): Promise<CompositeExtractionBatch> {
  const prompt = buildCompositeExtractionPrompt({
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
  const parsed = CompositeExtractionBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    return repairCompositeExtraction({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const errors = validateComposite(parsed.data, input.segments);
  if (errors.length > 0) {
    return repairCompositeExtraction({
      ...input,
      previousPayload: parsed.data,
      validationErrors: errors,
    });
  }
  return {
    ...parsed.data,
    composite_candidates: parsed.data.composite_candidates.map(normalizeCompositeCandidate),
  };
}
