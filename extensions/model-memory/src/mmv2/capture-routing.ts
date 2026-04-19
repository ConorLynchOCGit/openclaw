import { JsonModelOutputError } from "../model-execution.ts";
import type { SemanticInterpreter, InterpreterSourceWindow } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import {
  CaptureRoutingBatchSchema,
  type CaptureRoutingBatch,
  type RawIngestEvent,
  type SegmentedIngestEvent,
} from "./contracts.ts";
import { buildCaptureRoutingPrompt, buildRepairPrompt } from "./prompt-contracts.ts";

type RoutingInput = {
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
};

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

function applyDeterministicOverrides(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): CaptureRoutingBatch {
  const shapeById = new Map(
    segmented.segments.map((segment) => [segment.segment_id, segment.detected_shape]),
  );
  return {
    ...batch,
    routing_decisions: batch.routing_decisions.map((decision) => {
      const shape = shapeById.get(decision.segment_id);
      if (
        (shape === "numbered_list_block" || shape === "bullet_list_block") &&
        decision.route === "atomic_candidate" &&
        !(
          decision.confidence >= 0.9 &&
          !decision.reason_codes.some((code) =>
            ["ordered_steps", "checklist", "workflow_or_runbook"].includes(code),
          )
        )
      ) {
        return { ...decision, route: "composite_candidate" as const };
      }
      if (decision.confidence < 0.5 && decision.route !== "ignore") {
        return { ...decision, route: "needs_more_context" as const };
      }
      return decision;
    }),
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
      raw_event: input.rawEvent,
      segments: input.segmented.segments,
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
  const parsed = CaptureRoutingBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    throw new JsonModelOutputError(
      "invalid MMV2 capture routing repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return applyDeterministicOverrides(parsed.data, input.segmented);
}

export async function routeCaptureCandidates(input: RoutingInput): Promise<CaptureRoutingBatch> {
  const prompt = buildCaptureRoutingPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    segmented: input.segmented,
  });
  const result = await input.interpreter.interpret({
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceWindow: input.sourceWindow,
    prompt,
  });

  const parsed = CaptureRoutingBatchSchema.safeParse(extractBatch(result));
  if (!parsed.success) {
    return repairCaptureRouting({
      ...input,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const evidenceErrors = validateEvidence(parsed.data, input.segmented);
  if (evidenceErrors.length > 0) {
    return repairCaptureRouting({
      ...input,
      previousPayload: parsed.data,
      validationErrors: evidenceErrors,
    });
  }

  return applyDeterministicOverrides(parsed.data, input.segmented);
}
