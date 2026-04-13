import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemorySemanticConfidence,
  MemorySemanticInterpretationDecision,
  MemorySemanticInterpretationLane,
  MemorySemanticObject,
  MemorySemanticProvenanceSpan,
} from "./memory-semantic-interpretation.js";
import { resolveCanonicalMemoryClassForSemanticObject } from "./memory-semantic-interpretation.js";
import type { NormalizedMemoryBlock } from "./memory-source-normalization.js";
import type { NormalizedMemorySourceWindow } from "./memory-source-windowing.js";

export type ValidatedMemorySemanticObject = {
  object: MemorySemanticObject;
  confidence: "high" | "medium";
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
  evidence: string[];
  supportingBlocks: NormalizedMemoryBlock[];
  observedText: string;
};

export type ValidatedMemorySemanticDecision =
  | {
      action: "ignore";
      reason: string;
    }
  | {
      action: "capture";
      objects: ValidatedMemorySemanticObject[];
    };

function mapInterpretationConfidence(value: MemorySemanticConfidence): "high" | "medium" | null {
  if (value === "strong") {
    return "high";
  }
  if (value === "medium") {
    return "medium";
  }
  return null;
}

function matchesProvenanceSpan(
  block: NormalizedMemoryBlock,
  span: MemorySemanticProvenanceSpan,
): boolean {
  if (span.blockIds?.length && span.blockIds.includes(block.id)) {
    return true;
  }
  if (
    span.segmentIndexes?.length &&
    typeof block.provenance.segmentIndex === "number" &&
    span.segmentIndexes.includes(block.provenance.segmentIndex)
  ) {
    return true;
  }
  if (
    typeof span.lineStart === "number" &&
    typeof span.lineEnd === "number" &&
    typeof block.provenance.lineStart === "number" &&
    typeof block.provenance.lineEnd === "number"
  ) {
    return !(
      block.provenance.lineEnd < span.lineStart || block.provenance.lineStart > span.lineEnd
    );
  }
  if (span.headingPath?.length) {
    return span.headingPath.every((entry, index) => block.headingPath[index] === entry);
  }
  return false;
}

function resolveSupportingBlocks(
  window: NormalizedMemorySourceWindow,
  spans: MemorySemanticProvenanceSpan[],
): NormalizedMemoryBlock[] {
  const matched: NormalizedMemoryBlock[] = [];
  for (const block of window.blocks) {
    if (spans.some((span) => matchesProvenanceSpan(block, span))) {
      matched.push(block);
    }
  }
  return matched;
}

function buildEvidence(object: MemorySemanticObject): string[] {
  const canonicalClass = resolveCanonicalMemoryClassForSemanticObject(object);
  return [
    "model_semantic_output",
    `canonical_class:${canonicalClass}`,
    `object_kind:${object.kind}`,
    ...object.rationale.map((entry) => `model_rationale:${entry}`),
  ];
}

function hasScopedContext(object: MemorySemanticObject): boolean {
  return Boolean(
    object.scope?.projectId || object.scope?.projectScope || object.scope?.workflowScope,
  );
}

function resolveReviewMode(
  object: MemorySemanticObject,
  confidence: "high" | "medium",
): "direct" | "pending_confirmation" | "hold_for_more_evidence" {
  if (confidence !== "high") {
    return "hold_for_more_evidence";
  }

  switch (object.kind) {
    case "preference":
      if (object.operation === "forget") {
        return "pending_confirmation";
      }
      return object.preferenceProfile &&
        object.preferenceProfile !== "generalized_guidance" &&
        !hasScopedContext(object)
        ? "direct"
        : "pending_confirmation";
    case "correction":
      return object.correctionKind === "workflow_guidance" &&
        object.workflowProfile !== "environment_constraint" &&
        object.workflowProfile !== "api_workaround"
        ? "hold_for_more_evidence"
        : "pending_confirmation";
    case "procedure":
      return object.procedureKey ? "pending_confirmation" : "hold_for_more_evidence";
    case "project_fact":
      return object.factFieldKey && hasScopedContext(object)
        ? "pending_confirmation"
        : "hold_for_more_evidence";
    case "routing":
      return "hold_for_more_evidence";
  }
}

function validateSemanticObject(params: {
  object: MemorySemanticObject;
  window: NormalizedMemorySourceWindow;
}): ValidatedMemorySemanticObject | null {
  const confidence = mapInterpretationConfidence(params.object.confidence);
  if (!confidence) {
    return null;
  }
  if (params.object.durability !== "durable") {
    return null;
  }
  const supportingBlocks = resolveSupportingBlocks(params.window, params.object.provenanceSpans);
  if (supportingBlocks.length === 0) {
    return null;
  }
  const observedText = supportingBlocks
    .map((block) => block.blockText)
    .join("\n\n")
    .trim();
  if (!observedText) {
    return null;
  }
  return {
    object: params.object,
    confidence,
    reviewMode: resolveReviewMode(params.object, confidence),
    evidence: buildEvidence(params.object),
    supportingBlocks,
    observedText,
  };
}

export async function validateMemorySemanticDecision(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  decision: MemorySemanticInterpretationDecision;
  window: NormalizedMemorySourceWindow;
  projectId?: string;
}): Promise<ValidatedMemorySemanticDecision> {
  void params.config;
  void params.lane;
  void params.projectId;

  if (params.decision.action === "ignore") {
    return {
      action: "ignore",
      reason: params.decision.rationale.join("; "),
    };
  }

  const objects = params.decision.objects
    .map((object) => validateSemanticObject({ object, window: params.window }))
    .filter((object): object is ValidatedMemorySemanticObject => object !== null);

  if (objects.length === 0) {
    return {
      action: "ignore",
      reason: "no durable semantic objects passed governance validation",
    };
  }

  return {
    action: "capture",
    objects,
  };
}
