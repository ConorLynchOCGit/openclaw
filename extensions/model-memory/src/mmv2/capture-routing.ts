import { JsonModelOutputError } from "../model-execution.ts";
import type { SemanticInterpreter, InterpreterSourceWindow } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  CaptureRoutingBatchSchema,
  type CaptureRoutingBatch,
  type CaptureRoutingDecision,
  type RoutedCandidate,
  type RoutedCandidateBatch,
  type RawIngestEvent,
  type SegmentedIngestEvent,
  type SegmentedIngestSegment,
} from "./contracts.ts";
import { anchorEvidenceQuoteToSourceSpan } from "./evidence-span-anchoring.ts";
import {
  buildCaptureRoutingPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";

type RoutingInput = {
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  responseMode?: MmV2PromptResponseMode;
};

const ROUTING_BATCH_SIZE = 16;

function extractBatch(result: Awaited<ReturnType<SemanticInterpreter["interpret"]>>): unknown {
  if (result.action === "ignore") {
    return {
      schema_version: "capture_routing.v1",
      event_id: "",
      routing_decisions: [],
    };
  }
  if (result.objects.length === 1) {
    return result.objects[0];
  }
  return result.objects;
}

function normalizeRoutingPayload(raw: unknown, eventId: string): unknown {
  if (Array.isArray(raw)) {
    return {
      schema_version: "capture_routing.v1",
      event_id: eventId,
      routing_decisions: raw,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      schema_version: "capture_routing.v1",
      event_id: eventId,
      ...raw,
    };
  }
  return raw;
}

const ALLOWED_ROUTING_REASON_CODES = new Set<CaptureRoutingDecision["reason_codes"][number]>([
  "explicit_user_preference",
  "assistant_behavior_instruction",
  "durable_project_fact",
  "durable_user_fact",
  "source_pointer",
  "decision_or_commitment",
  "event_or_outcome",
  "ordered_steps",
  "checklist",
  "workflow_or_runbook",
  "temporary_context",
  "explicit_no_store",
  "privacy_opt_out",
  "smalltalk",
  "ambiguous",
  "sensitive",
  "not_memory",
]);

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function sanitizeRoutingBatchUnknown(
  raw: unknown,
  input: { eventId: string; segmented: SegmentedIngestEvent },
): CaptureRoutingBatch | null {
  let candidate = raw;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  const normalized = normalizeRoutingPayload(candidate, input.eventId);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null;
  }
  const rawDecisions = Array.isArray(
    (normalized as { routing_decisions?: unknown }).routing_decisions,
  )
    ? (normalized as { routing_decisions: unknown[] }).routing_decisions
    : [];
  const segmentById = new Map(
    input.segmented.segments.map((segment) => [segment.segment_id, segment]),
  );
  const decisions: CaptureRoutingDecision[] = [];

  for (const rawDecision of rawDecisions) {
    if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
      continue;
    }
    const source = rawDecision as Record<string, unknown>;
    const segmentId = typeof source.segment_id === "string" ? source.segment_id : null;
    const segment = segmentId ? segmentById.get(segmentId) : undefined;
    if (!segmentId || !segment) {
      continue;
    }
    const route =
      source.route === "ignore" ||
      source.route === "atomic_candidate" ||
      source.route === "composite_candidate" ||
      source.route === "needs_more_context"
        ? source.route
        : "needs_more_context";
    const evidenceQuote =
      typeof source.evidence_quote === "string" &&
      source.evidence_quote.length > 0 &&
      segment.text.includes(source.evidence_quote)
        ? source.evidence_quote
        : segment.text;
    const reasonCodes = Array.from(
      new Set(
        Array.isArray(source.reason_codes)
          ? source.reason_codes.filter(
              (entry): entry is CaptureRoutingDecision["reason_codes"][number] =>
                typeof entry === "string" &&
                ALLOWED_ROUTING_REASON_CODES.has(
                  entry as CaptureRoutingDecision["reason_codes"][number],
                ),
            )
          : [],
      ),
    );
    decisions.push({
      segment_id: segmentId,
      route,
      candidate_summary:
        typeof source.candidate_summary === "string" && source.candidate_summary.trim().length > 0
          ? source.candidate_summary.trim().slice(0, 280)
          : segment.text.replace(/\s+/gu, " ").trim().slice(0, 280),
      memory_likelihood: clamp01(source.memory_likelihood, route === "ignore" ? 0.05 : 0.5),
      durability_likelihood: clamp01(source.durability_likelihood, route === "ignore" ? 0.05 : 0.5),
      composite_likelihood: clamp01(
        source.composite_likelihood,
        route === "composite_candidate" ? 0.8 : 0.2,
      ),
      reason_codes:
        reasonCodes.length > 0 ? reasonCodes : [route === "ignore" ? "not_memory" : "ambiguous"],
      evidence_quote: evidenceQuote,
      confidence: clamp01(source.confidence, route === "ignore" ? 0.9 : 0.5),
      allow_multiple_top_level_atomic: source.allow_multiple_top_level_atomic === true,
    });
  }

  const parsed = CaptureRoutingBatchSchema.safeParse({
    schema_version: "capture_routing.v1",
    event_id: input.eventId,
    routing_decisions: decisions,
  });
  return parsed.success ? parsed.data : null;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function isPrimaryRoutingSegment(segment: SegmentedIngestSegment): boolean {
  return segment.detected_shape !== "sentence";
}

function validateEvidence(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];
  const byId = new Map(segmented.segments.map((segment) => [segment.segment_id, segment]));
  batch.routing_decisions.forEach((decision, index) => {
    const segment = byId.get(decision.segment_id);
    if (!segment) {
      errors.push({
        path: `routing_decisions.${index}.segment_id`,
        message: "segment_id does not exist",
      });
      return;
    }
    if (!segment.text.includes(decision.evidence_quote)) {
      errors.push({
        path: `routing_decisions.${index}.evidence_quote`,
        message: "evidence_quote must be an exact substring of the source segment",
      });
    }
  });
  return errors;
}

function anchorRoutingEvidence(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): CaptureRoutingBatch {
  const byId = new Map(segmented.segments.map((segment) => [segment.segment_id, segment]));
  return {
    ...batch,
    routing_decisions: batch.routing_decisions.map((decision) => {
      const segment = byId.get(decision.segment_id);
      if (!segment) {
        return decision;
      }
      const anchored = anchorEvidenceQuoteToSourceSpan({
        sourceText: segment.text,
        evidenceQuote: decision.evidence_quote,
      });
      return anchored.status === "anchored"
        ? { ...decision, evidence_quote: anchored.quote }
        : decision;
    }),
  };
}

function validateCoverage(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): Array<{ path: string; message: string }> {
  const returned = new Set(batch.routing_decisions.map((decision) => decision.segment_id));
  return segmented.segments.flatMap((segment) =>
    returned.has(segment.segment_id)
      ? []
      : [
          {
            path: "routing_decisions",
            message: `missing routing decision for segment_id ${segment.segment_id}`,
          },
        ],
  );
}

function keepStructurallyValidRoutingDecisions(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): CaptureRoutingBatch {
  const byId = new Map(segmented.segments.map((segment) => [segment.segment_id, segment]));
  return {
    ...batch,
    routing_decisions: batch.routing_decisions.filter((decision) => {
      const segment = byId.get(decision.segment_id);
      if (!segment) {
        return false;
      }
      return segment.text.includes(decision.evidence_quote);
    }),
  };
}

async function routeModelBatch(
  input: RoutingInput,
  segmented: SegmentedIngestEvent,
): Promise<CaptureRoutingBatch> {
  const prompt = buildCaptureRoutingPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    segmented,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });

  const parsed = CaptureRoutingBatchSchema.safeParse(
    normalizeRoutingPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const sanitized = sanitizeRoutingBatchUnknown(extractBatch(result), {
      eventId: input.rawEvent.event_id,
      segmented,
    });
    if (sanitized) {
      const anchored = anchorRoutingEvidence(sanitized, segmented);
      const evidenceErrors = validateEvidence(anchored, segmented);
      if (evidenceErrors.length === 0) {
        return anchored;
      }
      const structurallyValid = keepStructurallyValidRoutingDecisions(anchored, segmented);
      if (structurallyValid.routing_decisions.length > 0) {
        return structurallyValid;
      }
    }
    try {
      return await repairCaptureRouting({
        ...input,
        segmented,
        previousPayload: extractBatch(result),
        validationErrors: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    } catch (error) {
      if (error instanceof JsonModelOutputError) {
        return buildEmptyRoutingBatch(input);
      }
      throw error;
    }
  }

  const anchored = anchorRoutingEvidence(parsed.data, segmented);
  const coverageErrors = validateCoverage(anchored, segmented);
  const evidenceErrors = validateEvidence(anchored, segmented);
  const validationErrors = [...coverageErrors, ...evidenceErrors];
  if (evidenceErrors.length > 0) {
    try {
      return await repairCaptureRouting({
        ...input,
        segmented,
        previousPayload: anchored,
        validationErrors,
      });
    } catch (error) {
      if (error instanceof JsonModelOutputError) {
        const structurallyValid = keepStructurallyValidRoutingDecisions(anchored, segmented);
        return structurallyValid.routing_decisions.length > 0
          ? structurallyValid
          : buildEmptyRoutingBatch(input);
      }
      throw error;
    }
  }

  if (coverageErrors.length > 0) {
    try {
      const repaired = await repairCaptureRouting({
        ...input,
        segmented,
        previousPayload: anchored,
        validationErrors: coverageErrors,
      });
      return repaired.routing_decisions.length > 0 ? repaired : anchored;
    } catch (error) {
      if (error instanceof JsonModelOutputError) {
        return anchored;
      }
      throw error;
    }
  }

  return anchored;
}

function sortRoutingDecisions(
  decisions: CaptureRoutingDecision[],
  segmented: SegmentedIngestEvent,
): CaptureRoutingDecision[] {
  const orderBySegmentId = new Map(
    segmented.segments.map((segment, index) => [segment.segment_id, index]),
  );
  return [...decisions].toSorted(
    (left, right) =>
      (orderBySegmentId.get(left.segment_id) ?? Number.MAX_SAFE_INTEGER) -
      (orderBySegmentId.get(right.segment_id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function buildEmptyRoutingBatch(input: RoutingInput): CaptureRoutingBatch {
  return {
    schema_version: "capture_routing.v1",
    event_id: input.rawEvent.event_id,
    routing_decisions: [],
  };
}

export async function repairCaptureRouting(
  input: RoutingInput & {
    previousPayload: unknown;
    validationErrors: Array<{ path: string; message: string }>;
  },
): Promise<CaptureRoutingBatch> {
  const prompt = buildRepairPrompt({
    modelId: input.modelId,
    contractVersion: "mmv2-capture-routing-repair-v1",
    originalPayload: {
      raw_event_metadata: buildPromptRawEventMetadata(input.rawEvent),
      segments: input.segmented.segments,
      previous_payload: input.previousPayload,
    },
    validationErrors: input.validationErrors,
    expectedOutputShape: [
      'Top-level keys: "schema_version", "event_id", "routing_decisions".',
      '"schema_version" must be "capture_routing.v1".',
      'Each routing decision must include "segment_id", "route", "candidate_summary", "memory_likelihood", "durability_likelihood", "composite_likelihood", "reason_codes", "evidence_quote", and "confidence".',
    ].join("\n"),
    responseSchemaName: "capture_routing_batch",
    responseSchema: CaptureRoutingBatchSchema,
    responseMode: input.responseMode,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });
  const parsed = CaptureRoutingBatchSchema.safeParse(
    normalizeRoutingPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const sanitized = sanitizeRoutingBatchUnknown(extractBatch(result), {
      eventId: input.rawEvent.event_id,
      segmented: input.segmented,
    });
    if (sanitized) {
      const anchored = anchorRoutingEvidence(sanitized, input.segmented);
      const evidenceErrors = validateEvidence(anchored, input.segmented);
      if (evidenceErrors.length === 0) {
        return anchored;
      }
      const structurallyValid = keepStructurallyValidRoutingDecisions(anchored, input.segmented);
      if (structurallyValid.routing_decisions.length > 0) {
        return structurallyValid;
      }
    }
    throw new JsonModelOutputError(
      "invalid MMV2 capture routing repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  const anchored = anchorRoutingEvidence(parsed.data, input.segmented);
  const coverageErrors = validateCoverage(anchored, input.segmented);
  const evidenceErrors = validateEvidence(anchored, input.segmented);
  if (evidenceErrors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 capture routing repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  if (coverageErrors.length > 0) {
    return anchored;
  }
  return anchored;
}

export async function routeCaptureCandidates(input: RoutingInput): Promise<CaptureRoutingBatch> {
  const primarySegments = input.segmented.segments.filter(isPrimaryRoutingSegment);
  const modelSegments = primarySegments;

  const modelDecisions: CaptureRoutingDecision[] = [];
  for (const batch of chunkArray(modelSegments, ROUTING_BATCH_SIZE)) {
    const batchSegmented = {
      ...input.segmented,
      segments: batch,
    } satisfies SegmentedIngestEvent;
    const routedBatch = await routeModelBatch(input, batchSegmented);
    modelDecisions.push(...routedBatch.routing_decisions);
  }

  return {
    schema_version: "capture_routing.v1",
    event_id: input.rawEvent.event_id,
    routing_decisions: sortRoutingDecisions(modelDecisions, input.segmented),
  };
}

export async function routeCaptureCandidatesRuntime(
  input: RoutingInput,
): Promise<CaptureRoutingBatch> {
  const primarySegments = input.segmented.segments.filter(isPrimaryRoutingSegment);
  const modelSegments = primarySegments;

  const modelDecisions: CaptureRoutingDecision[] = [];
  for (const batch of chunkArray(modelSegments, ROUTING_BATCH_SIZE)) {
    const batchSegmented = {
      ...input.segmented,
      segments: batch,
    } satisfies SegmentedIngestEvent;
    const routedBatch = await routeModelBatch(input, batchSegmented);
    modelDecisions.push(...routedBatch.routing_decisions);
  }

  return {
    schema_version: "capture_routing.v1",
    event_id: input.rawEvent.event_id,
    routing_decisions: sortRoutingDecisions(modelDecisions, input.segmented),
  };
}

export function materializeRoutedCandidates(input: {
  segmented: SegmentedIngestEvent;
  routing: CaptureRoutingBatch;
  allowMultipleTopLevelAtomicSegmentIds?: Iterable<string>;
}): RoutedCandidateBatch {
  const allowed = new Set(input.allowMultipleTopLevelAtomicSegmentIds ?? []);
  const segmentById = new Map(
    input.segmented.segments.map((segment) => [segment.segment_id, segment]),
  );
  const routedCandidates: RoutedCandidate[] = [];

  for (const decision of input.routing.routing_decisions) {
    if (decision.route !== "atomic_candidate" && decision.route !== "composite_candidate") {
      continue;
    }
    const segment = segmentById.get(decision.segment_id);
    if (!segment) {
      throw new Error(
        `Unable to materialize routed candidate for missing segment ${decision.segment_id}`,
      );
    }
    routedCandidates.push({
      ...segment,
      source_route: decision.route,
      candidate_summary: decision.candidate_summary,
      memory_likelihood: decision.memory_likelihood,
      durability_likelihood: decision.durability_likelihood,
      composite_likelihood: decision.composite_likelihood,
      reason_codes: decision.reason_codes,
      evidence_quote: decision.evidence_quote,
      confidence: decision.confidence,
      allow_multiple_top_level_atomic:
        decision.allow_multiple_top_level_atomic || allowed.has(segment.segment_id),
    });
  }

  return {
    schema_version: "capture_routing.v1",
    event_id: input.routing.event_id,
    routed_candidates: routedCandidates,
  };
}
