import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  AtomicExtractionBatchSchema,
  AtomicCandidateSchema,
  AtomicRoutedCandidateSchema,
  type AtomicCandidate,
  type AtomicExtractionBatch,
  type AtomicRoutedCandidate,
  type RawIngestEvent,
} from "./contracts.ts";
import { anchorEvidenceQuoteToSourceSpan } from "./evidence-span-anchoring.ts";
import {
  buildAtomicExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import { ensureSentence } from "./text-normalization.ts";

type AtomicInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  routedCandidates: AtomicRoutedCandidate[];
  responseMode?: MmV2PromptResponseMode;
};

function emptyAtomicBatch(eventId: string): AtomicExtractionBatch {
  return {
    schema_version: "atomic_extraction.v1",
    event_id: eventId,
    atomic_candidates: [],
  };
}

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

function normalizeAtomicPayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "atomic_extraction.v1",
      event_id: eventId,
      atomic_candidates: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "atomic_extraction.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

function validateAtomic(
  batch: AtomicExtractionBatch,
  routedCandidates: AtomicRoutedCandidate[],
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const byId = new Map(routedCandidates.map((candidate) => [candidate.segment_id, candidate]));
  const countsBySegmentId = new Map<string, number>();
  batch.atomic_candidates.forEach((candidate, index) => {
    const routedCandidate = byId.get(candidate.source_segment_id);
    if (!routedCandidate) {
      errors.push({
        path: `atomic_candidates.${index}.source_segment_id`,
        message: "source_segment_id does not exist",
      });
      return;
    }
    if (!routedCandidate.text.includes(candidate.evidence_quote)) {
      errors.push({
        path: `atomic_candidates.${index}.evidence_quote`,
        message: "evidence_quote must be an exact substring of the source segment",
      });
    }
    if (routedCandidate.source_route !== "atomic_candidate") {
      errors.push({
        path: `atomic_candidates.${index}.source_segment_id`,
        message: "atomic extractor cannot run on non-atomic routed candidates",
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
    countsBySegmentId.set(
      candidate.source_segment_id,
      (countsBySegmentId.get(candidate.source_segment_id) ?? 0) + 1,
    );
  });
  for (const [segmentId, count] of countsBySegmentId.entries()) {
    const routedCandidate = byId.get(segmentId);
    if (routedCandidate && !routedCandidate.allow_multiple_top_level_atomic && count > 1) {
      errors.push({
        path: "atomic_candidates",
        message: `source segment ${segmentId} emitted ${count} top-level atomic candidates without allow_multiple_top_level_atomic`,
      });
    }
  }
  return errors;
}

function normalizeEvidenceQuote(
  routedCandidate: AtomicRoutedCandidate,
  evidenceQuote: string,
): string {
  const anchored = anchorEvidenceQuoteToSourceSpan({
    sourceText: routedCandidate.text,
    evidenceQuote,
  });
  return anchored.status === "anchored" ? anchored.quote : evidenceQuote;
}

function normalizePayloadForKind(candidate: AtomicCandidate): AtomicCandidate["payload"] {
  switch (candidate.kind) {
    case "claim":
      return AtomicCandidateSchema.shape.payload.parse({
        ...candidate.payload,
        payload_type: "claim",
      });
    case "directive":
      return AtomicCandidateSchema.shape.payload.parse({
        ...candidate.payload,
        payload_type: "directive",
      });
    case "source_ref":
      return AtomicCandidateSchema.shape.payload.parse({
        ...candidate.payload,
        payload_type: "source_ref",
      });
    case "episode":
      return AtomicCandidateSchema.shape.payload.parse({
        ...candidate.payload,
        payload_type: "episode",
      });
  }
  return AtomicCandidateSchema.shape.payload.parse(candidate.payload);
}

function normalizeRepairedAtomicBatch(
  batch: AtomicExtractionBatch,
  routedCandidates: AtomicRoutedCandidate[],
): AtomicExtractionBatch {
  const routedById = new Map(
    routedCandidates.map((candidate) => [candidate.segment_id, candidate]),
  );
  const seenSingleCandidateSegments = new Set<string>();
  const atomicCandidates: AtomicCandidate[] = [];

  for (const candidate of batch.atomic_candidates) {
    const routedCandidate = routedById.get(candidate.source_segment_id);
    if (
      routedCandidate &&
      !routedCandidate.allow_multiple_top_level_atomic &&
      seenSingleCandidateSegments.has(candidate.source_segment_id)
    ) {
      continue;
    }
    if (routedCandidate && !routedCandidate.allow_multiple_top_level_atomic) {
      seenSingleCandidateSegments.add(candidate.source_segment_id);
    }
    atomicCandidates.push({
      ...candidate,
      normalized_statement: ensureSentence(candidate.normalized_statement),
      evidence_quote: routedCandidate
        ? normalizeEvidenceQuote(routedCandidate, candidate.evidence_quote)
        : candidate.evidence_quote,
      confidence:
        candidate.source_grounding === "weakly_implied" && candidate.confidence > 0.65
          ? 0.65
          : candidate.confidence,
      payload: normalizePayloadForKind(candidate),
    });
  }

  return {
    ...batch,
    atomic_candidates: atomicCandidates,
  };
}

function anchorAtomicEvidenceBatch(
  batch: AtomicExtractionBatch,
  routedCandidates: AtomicRoutedCandidate[],
): AtomicExtractionBatch {
  const routedById = new Map(
    routedCandidates.map((candidate) => [candidate.segment_id, candidate]),
  );
  return {
    ...batch,
    atomic_candidates: batch.atomic_candidates.map((candidate) => {
      const routedCandidate = routedById.get(candidate.source_segment_id);
      return {
        ...candidate,
        evidence_quote: routedCandidate
          ? normalizeEvidenceQuote(routedCandidate, candidate.evidence_quote)
          : candidate.evidence_quote,
      };
    }),
  };
}

function emptyAtomicBatchForRepairFailure(eventId: string): AtomicExtractionBatch {
  return {
    schema_version: "atomic_extraction.v1",
    event_id: eventId,
    atomic_candidates: [],
  };
}

export async function repairAtomicExtraction(
  input: AtomicInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<AtomicExtractionBatch> {
  if (input.routedCandidates.length === 0) {
    return emptyAtomicBatch(input.rawEvent.event_id);
  }
  input.routedCandidates.forEach((candidate, index) => {
    AtomicRoutedCandidateSchema.parse(candidate);
    if (candidate.source_route !== "atomic_candidate") {
      const sourceRoute = (candidate as { source_route?: string }).source_route ?? "unknown";
      throw new Error(
        `Atomic extractor received non-atomic routed candidate at index ${index}: ${sourceRoute}`,
      );
    }
  });
  const useEvidenceRepair = input.validationErrors.some((entry) =>
    entry.path.includes("evidence_quote"),
  );
  const prompt = useEvidenceRepair
    ? buildEvidenceRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-atomic-evidence-repair-v1",
        originalPayload: {
          raw_event_metadata: buildPromptRawEventMetadata(input.rawEvent),
          routed_candidates: input.routedCandidates,
          previous_payload: input.previousPayload,
        },
        expectedOutputShape: [
          'Top-level keys: "schema_version", "event_id", "atomic_candidates".',
          '"schema_version" must be "atomic_extraction.v1".',
          "Preserve valid candidates and repair only exact-substring evidence drift where possible.",
        ].join("\n"),
        responseSchemaName: "atomic_extraction_batch",
        responseSchema: AtomicExtractionBatchSchema,
        responseMode: input.responseMode,
      })
    : buildRepairPrompt({
        modelId: input.modelId,
        contractVersion: "mmv2-atomic-repair-v1",
        originalPayload: {
          raw_event_metadata: buildPromptRawEventMetadata(input.rawEvent),
          routed_candidates: input.routedCandidates,
          previous_payload: input.previousPayload,
        },
        validationErrors: input.validationErrors,
        expectedOutputShape: [
          'Top-level keys: "schema_version", "event_id", "atomic_candidates".',
          '"schema_version" must be "atomic_extraction.v1".',
          'Each atomic candidate must include "candidate_id", "source_segment_id", "kind", "raw_statement", "normalized_statement", "evidence_quote", "source_grounding", "scope", "payload", "confidence", and "risk_flags".',
          '"payload.payload_type" must match "kind".',
        ].join("\n"),
        responseSchemaName: "atomic_extraction_batch",
        responseSchema: AtomicExtractionBatchSchema,
        responseMode: input.responseMode,
      });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = AtomicExtractionBatchSchema.safeParse(
    normalizeAtomicPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 atomic extraction repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  const normalizedRepair = normalizeRepairedAtomicBatch(parsed.data, input.routedCandidates);
  const repairedErrors = validateAtomic(normalizedRepair, input.routedCandidates);
  if (repairedErrors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 atomic extraction repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return normalizedRepair;
}

export async function extractAtomicCandidates(input: AtomicInput): Promise<AtomicExtractionBatch> {
  if (input.routedCandidates.length === 0) {
    return emptyAtomicBatch(input.rawEvent.event_id);
  }
  input.routedCandidates.forEach((candidate, index) => {
    AtomicRoutedCandidateSchema.parse(candidate);
    if (candidate.source_route !== "atomic_candidate") {
      const sourceRoute = (candidate as { source_route?: string }).source_route ?? "unknown";
      throw new Error(
        `Atomic extractor received non-atomic routed candidate at index ${index}: ${sourceRoute}`,
      );
    }
  });
  const prompt = buildAtomicExtractionPrompt({
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
  const parsed = AtomicExtractionBatchSchema.safeParse(
    normalizeAtomicPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const repaired = await repairAtomicExtraction({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }).catch((error) => {
      if (
        error instanceof JsonModelOutputError &&
        /^invalid MMV2 atomic extraction repair (?:output|semantics)$/u.test(error.message)
      ) {
        return emptyAtomicBatchForRepairFailure(input.rawEvent.event_id);
      }
      throw error;
    });
    return repaired;
  }
  const combined = {
    ...anchorAtomicEvidenceBatch(parsed.data, input.routedCandidates),
  };
  const errors = validateAtomic(combined, input.routedCandidates);
  if (errors.length > 0) {
    const repaired = await repairAtomicExtraction({
      ...input,
      previousPayload: parsed.data,
      validationErrors: errors,
    }).catch((error) => {
      if (
        error instanceof JsonModelOutputError &&
        /^invalid MMV2 atomic extraction repair (?:output|semantics)$/u.test(error.message)
      ) {
        return emptyAtomicBatchForRepairFailure(input.rawEvent.event_id);
      }
      throw error;
    });
    return repaired;
  }
  return combined;
}
