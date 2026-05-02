import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  CompositeRoutedCandidateSchema,
  CompositeExtractionBatchSchema,
  type AtomicExtractionBatch,
  type CompositeCandidate,
  type CompositeExtractionBatch,
  type CompositeRoutedCandidate,
  type RawIngestEvent,
} from "./contracts.ts";
import { anchorEvidenceQuoteToSourceSpan } from "./evidence-span-anchoring.ts";
import {
  buildCompositeExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";

type CompositeInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  routedCandidates: CompositeRoutedCandidate[];
  anchoringCandidates?: CompositeRoutedCandidate[];
  responseMode?: MmV2PromptResponseMode;
};

function emptyCompositeBatch(eventId: string): CompositeExtractionBatch {
  return {
    schema_version: "composite_extraction.v1",
    event_id: eventId,
    composite_candidates: [],
  };
}

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

function normalizeCompositePayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "composite_extraction.v1",
      event_id: eventId,
      composite_candidates: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "composite_extraction.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

function validateComposite(
  batch: CompositeExtractionBatch,
  routedCandidates: CompositeRoutedCandidate[],
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const byId = new Map(routedCandidates.map((candidate) => [candidate.segment_id, candidate]));
  const countsBySegmentId = new Map<string, number>();
  batch.composite_candidates.forEach((candidate, index) => {
    const routedCandidate = byId.get(candidate.source_segment_id);
    if (!routedCandidate) {
      errors.push({
        path: `composite_candidates.${index}.source_segment_id`,
        message: "source_segment_id does not exist",
      });
      return;
    }
    if (!routedCandidate.text.includes(candidate.evidence_quote)) {
      errors.push({
        path: `composite_candidates.${index}.evidence_quote`,
        message: "evidence_quote must be an exact substring of the source segment",
      });
    }
    if (routedCandidate.source_route !== "composite_candidate") {
      errors.push({
        path: `composite_candidates.${index}.source_segment_id`,
        message: "composite extractor cannot run on non-composite routed candidates",
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
      const componentSourceSegmentId = component.source_segment_id ?? candidate.source_segment_id;
      const componentRoutedCandidate = byId.get(componentSourceSegmentId);
      if (!componentRoutedCandidate) {
        errors.push({
          path: `composite_candidates.${index}.components.${componentIndex}.source_segment_id`,
          message: "component source_segment_id does not exist",
        });
        return;
      }
      if (!componentRoutedCandidate.text.includes(component.evidence_quote)) {
        errors.push({
          path: `composite_candidates.${index}.components.${componentIndex}.evidence_quote`,
          message: "component evidence_quote must be an exact substring of the source segment",
        });
      }
    });
    countsBySegmentId.set(
      candidate.source_segment_id,
      (countsBySegmentId.get(candidate.source_segment_id) ?? 0) + 1,
    );
  });
  for (const [segmentId, count] of countsBySegmentId.entries()) {
    if (count > 1) {
      errors.push({
        path: "composite_candidates",
        message: `source segment ${segmentId} emitted ${count} top-level composite candidates`,
      });
    }
  }
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

function anchorEvidenceToUniqueRoutedSegment(input: {
  routedCandidates: CompositeRoutedCandidate[];
  evidenceQuote: string;
}):
  | {
      status: "anchored";
      sourceSegmentId: string;
      quote: string;
    }
  | { status: "unanchored" } {
  const matches = input.routedCandidates.flatMap((candidate) => {
    const anchored = anchorEvidenceQuoteToSourceSpan({
      sourceText: candidate.text,
      evidenceQuote: input.evidenceQuote,
    });
    return anchored.status === "anchored"
      ? [{ sourceSegmentId: candidate.segment_id, quote: anchored.quote }]
      : [];
  });
  return matches.length === 1 ? { status: "anchored", ...matches[0] } : { status: "unanchored" };
}

function anchorCompositeEvidenceBatch(
  batch: CompositeExtractionBatch,
  routedCandidates: CompositeRoutedCandidate[],
  anchoringCandidates = routedCandidates,
): CompositeExtractionBatch {
  return {
    ...batch,
    composite_candidates: batch.composite_candidates.map((candidate) => {
      const topLevelAnchor = anchorEvidenceToUniqueRoutedSegment({
        routedCandidates: anchoringCandidates,
        evidenceQuote: candidate.evidence_quote,
      });
      const sourceSegmentId =
        topLevelAnchor.status === "anchored"
          ? topLevelAnchor.sourceSegmentId
          : candidate.source_segment_id;
      return {
        ...candidate,
        source_segment_id: sourceSegmentId,
        evidence_quote:
          topLevelAnchor.status === "anchored" ? topLevelAnchor.quote : candidate.evidence_quote,
        components: candidate.components.map((component) => {
          const componentAnchor = anchorEvidenceToUniqueRoutedSegment({
            routedCandidates: anchoringCandidates,
            evidenceQuote: component.evidence_quote,
          });
          return {
            ...component,
            source_segment_id:
              componentAnchor.status === "anchored"
                ? componentAnchor.sourceSegmentId
                : component.source_segment_id,
            evidence_quote:
              componentAnchor.status === "anchored"
                ? componentAnchor.quote
                : component.evidence_quote,
          };
        }),
      };
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
  if (input.routedCandidates.length === 0) {
    return emptyCompositeBatch(input.rawEvent.event_id);
  }
  input.routedCandidates.forEach((candidate, index) => {
    CompositeRoutedCandidateSchema.parse(candidate);
    if (candidate.source_route !== "composite_candidate") {
      const sourceRoute = (candidate as { source_route?: string }).source_route ?? "unknown";
      throw new Error(
        `Composite extractor received non-composite routed candidate at index ${index}: ${sourceRoute}`,
      );
    }
  });
  const useEvidenceRepair = input.validationErrors.some((entry) =>
    entry.path.includes("evidence_quote"),
  );
  const prompt = useEvidenceRepair
    ? buildEvidenceRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-composite-evidence-repair-v1",
        originalPayload: {
          raw_event_metadata: buildPromptRawEventMetadata(input.rawEvent),
          routed_candidates: input.routedCandidates,
          previous_payload: input.previousPayload,
        },
        expectedOutputShape: [
          'Top-level keys: "schema_version", "event_id", "composite_candidates".',
          '"schema_version" must be "composite_extraction.v1".',
          "Preserve valid components and repair only exact-substring evidence drift where possible.",
        ].join("\n"),
        responseSchemaName: "composite_extraction_batch",
        responseSchema: CompositeExtractionBatchSchema,
        responseMode: input.responseMode,
      })
    : buildRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-composite-repair-v1",
        originalPayload: {
          raw_event_metadata: buildPromptRawEventMetadata(input.rawEvent),
          routed_candidates: input.routedCandidates,
          previous_payload: input.previousPayload,
        },
        validationErrors: input.validationErrors,
        expectedOutputShape: [
          'Top-level keys: "schema_version", "event_id", "composite_candidates".',
          '"schema_version" must be "composite_extraction.v1".',
          'Each composite candidate must include "candidate_id", "source_segment_id", "artifact_type", "title", "purpose", "activation_triggers", "summary", "evidence_quote", "components", "scope", "confidence", and "risk_flags".',
          'Each component must include "component_id", "order_index", "role", "content", "embedded_atomic_kind", "promotion", "evidence_quote", "required", "conditions", and "outputs"; it may include "source_segment_id" when evidence belongs to a different routed segment than the parent.',
        ].join("\n"),
        responseSchemaName: "composite_extraction_batch",
        responseSchema: CompositeExtractionBatchSchema,
        responseMode: input.responseMode,
      });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CompositeExtractionBatchSchema.safeParse(
    normalizeCompositePayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 composite extraction repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  const normalized = anchorCompositeEvidenceBatch(
    {
      ...parsed.data,
      composite_candidates: parsed.data.composite_candidates.map(normalizeCompositeCandidate),
    },
    input.routedCandidates,
    input.anchoringCandidates,
  );
  const repairedErrors = validateComposite(
    normalized,
    input.anchoringCandidates ?? input.routedCandidates,
  );
  if (repairedErrors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 composite extraction repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return {
    ...normalized,
  };
}

export async function extractCompositeCandidates(
  input: CompositeInput,
): Promise<CompositeExtractionBatch> {
  if (input.routedCandidates.length === 0) {
    return emptyCompositeBatch(input.rawEvent.event_id);
  }
  input.routedCandidates.forEach((candidate, index) => {
    CompositeRoutedCandidateSchema.parse(candidate);
    if (candidate.source_route !== "composite_candidate") {
      const sourceRoute = (candidate as { source_route?: string }).source_route ?? "unknown";
      throw new Error(
        `Composite extractor received non-composite routed candidate at index ${index}: ${sourceRoute}`,
      );
    }
  });

  const prompt = buildCompositeExtractionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    routedCandidates: input.routedCandidates,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CompositeExtractionBatchSchema.safeParse(
    normalizeCompositePayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const repaired = await repairCompositeExtraction({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }).catch((error) => {
      if (
        error instanceof JsonModelOutputError &&
        /^invalid MMV2 composite extraction repair (?:output|semantics)$/u.test(error.message)
      ) {
        return emptyCompositeBatch(input.rawEvent.event_id);
      }
      throw error;
    });
    return repaired;
  }
  const normalized = parsed.data.composite_candidates.map(normalizeCompositeCandidate);
  const combined = anchorCompositeEvidenceBatch(
    {
      ...parsed.data,
      composite_candidates: normalized,
    },
    input.routedCandidates,
    input.anchoringCandidates,
  );
  const errors = validateComposite(combined, input.anchoringCandidates ?? input.routedCandidates);
  if (errors.length > 0) {
    const repaired = await repairCompositeExtraction({
      ...input,
      previousPayload: {
        ...parsed.data,
        composite_candidates: normalized,
      },
      validationErrors: errors,
    }).catch((error) => {
      if (
        error instanceof JsonModelOutputError &&
        /^invalid MMV2 composite extraction repair (?:output|semantics)$/u.test(error.message)
      ) {
        return emptyCompositeBatch(input.rawEvent.event_id);
      }
      throw error;
    });
    return repaired;
  }
  return combined;
}
