import type {
  MemoryBlockType,
  NormalizedMemoryBlock,
  NormalizedMemorySource,
} from "./memory-source-normalization.js";

export type MemorySemanticInterpretationLane = "document_ingestion" | "ordinary_turn_capture";

export type MemorySemanticClass =
  | "stable_user_preference"
  | "durable_operator_correction"
  | "reusable_procedure"
  | "recurring_project_or_workflow_fact"
  | "ignore";

export type MemorySemanticCaptureCategoryHint =
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need"
  | "reference_routing";

export type MemorySemanticReviewModeHint =
  | "direct"
  | "pending_confirmation"
  | "hold_for_more_evidence";

export type MemorySemanticInterpretationDecision =
  | {
      action: "ignore";
      semanticClass: "ignore";
      confidence: "strong" | "medium" | "weak";
      rationale: string[];
    }
  | {
      action: "candidate";
      semanticClass: Exclude<MemorySemanticClass, "ignore">;
      captureCategoryHint: MemorySemanticCaptureCategoryHint;
      candidateText: string;
      confidence: "strong" | "medium" | "weak";
      reviewModeHint?: MemorySemanticReviewModeHint;
      rationale: string[];
    }
  | {
      action: "forget";
      semanticClass: "stable_user_preference";
      captureCategoryHint: "response_style";
      candidateText: string;
      confidence: "strong" | "medium" | "weak";
      rationale: string[];
    };

export type MemorySemanticInterpretationInput = {
  lane: MemorySemanticInterpretationLane;
  source: NormalizedMemorySource;
  block: NormalizedMemoryBlock;
  blockType: MemoryBlockType;
};

export type MemorySemanticInterpretationResult = {
  decision: MemorySemanticInterpretationDecision;
  modelId: string;
  promptVersion: string;
};

export type MemorySemanticInterpreterPort = {
  interpretBlock(
    input: MemorySemanticInterpretationInput,
  ): Promise<MemorySemanticInterpretationResult>;
};

export const MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION = "memory-semantic-v1";

function quoteJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildModelSemanticInterpretationPrompt(
  input: MemorySemanticInterpretationInput,
): string {
  const instructions = [
    "You are a memory semantic interpreter.",
    "Decide whether a normalized block contains durable reusable memory.",
    "Return JSON only.",
    "Do not include markdown fences.",
    "Do not invent facts outside the block and context.",
    "Prefer ignore over speculative capture.",
    "If the block implies scope through headings or parent context, convert that into an explicit candidateText.",
    "candidateText must use one of the exact deterministic contract shapes below.",
    "Use action=forget only for stable user-preference removals.",
    "Available semantic classes: stable_user_preference, durable_operator_correction, reusable_procedure, recurring_project_or_workflow_fact, ignore.",
    "Available captureCategoryHint values: response_style, project_fact, recurring_procedure, workflow_improvement, project_rule, unmet_need, reference_routing.",
    "If action=candidate or action=forget, candidateText is required.",
    "If action=ignore, candidateText must be omitted.",
    "Deterministic candidateText shapes:",
    "- response_style: 'Use plain English.' | 'Keep responses concise.' | 'Use bullet points when listing items.' | 'Do not use tables unless the user asks.' | 'Use numbered steps when giving instructions.' | 'For <subject>, use <directive>.'",
    "- forget: 'Forget response preference: <one supported response_style statement>.'",
    "- project_fact: 'For project <scope>, <subject> is <value>.'",
    "- recurring_procedure: '<Title>:\\n1. <step>\\n2. <step>'",
    "- workflow_improvement or reference_routing: 'For <subject>, use <action>.' | 'For <subject>, use <action> instead of <avoid>.' | 'For <subject>, avoid <avoid>.' | 'For <subject>, trust <action>; <other> is only <scope>.'",
    "- project_rule: 'For project <scope>, use <action> for <subject>.' | 'For project <scope>, use <action> for <subject> instead of <avoid>.' | 'For project <scope>, trust <action> for <subject>; <other> is only <scope>.'",
    "- unmet_need: 'For project <scope>, we need <capability> for <subject>.'",
    "Do not output a candidateText shape outside those contracts.",
  ].join("\n");

  const schemaHint = {
    action: "ignore | candidate | forget",
    semanticClass:
      "stable_user_preference | durable_operator_correction | reusable_procedure | recurring_project_or_workflow_fact | ignore",
    captureCategoryHint:
      "response_style | project_fact | recurring_procedure | workflow_improvement | project_rule | unmet_need | reference_routing",
    candidateText: "string",
    confidence: "strong | medium | weak",
    reviewModeHint: "direct | pending_confirmation | hold_for_more_evidence",
    rationale: ["string"],
  };

  return [
    instructions,
    "",
    "OUTPUT_SCHEMA:",
    quoteJson(schemaHint),
    "",
    "NORMALIZED_INPUT:",
    quoteJson({
      lane: input.lane,
      source: input.source,
      blockType: input.blockType,
      block: {
        blockText: input.block.blockText,
        headingPath: input.block.headingPath,
        listKind: input.block.listKind,
        structuredChildren: input.block.structuredChildren,
        scope: input.block.scope,
        provenance: input.block.provenance,
      },
    }),
  ].join("\n");
}

function isConfidence(value: unknown): value is "strong" | "medium" | "weak" {
  return value === "strong" || value === "medium" || value === "weak";
}

function isReviewModeHint(value: unknown): value is MemorySemanticReviewModeHint {
  return (
    value === "direct" || value === "pending_confirmation" || value === "hold_for_more_evidence"
  );
}

function isCategoryHint(value: unknown): value is MemorySemanticCaptureCategoryHint {
  return (
    value === "response_style" ||
    value === "project_fact" ||
    value === "recurring_procedure" ||
    value === "workflow_improvement" ||
    value === "project_rule" ||
    value === "unmet_need" ||
    value === "reference_routing"
  );
}

function isSemanticClass(value: unknown): value is MemorySemanticClass {
  return (
    value === "stable_user_preference" ||
    value === "durable_operator_correction" ||
    value === "reusable_procedure" ||
    value === "recurring_project_or_workflow_fact" ||
    value === "ignore"
  );
}

export function parseMemorySemanticInterpretationDecision(
  value: unknown,
): MemorySemanticInterpretationDecision {
  if (!value || typeof value !== "object") {
    throw new Error("semantic interpretation must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const action = candidate.action;
  const semanticClass = candidate.semanticClass;
  const confidence = candidate.confidence;
  const rationale = Array.isArray(candidate.rationale)
    ? candidate.rationale.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];

  if (
    (action !== "ignore" && action !== "candidate" && action !== "forget") ||
    !isSemanticClass(semanticClass) ||
    !isConfidence(confidence) ||
    rationale.length === 0
  ) {
    throw new Error("semantic interpretation payload is missing required fields");
  }

  if (action === "ignore") {
    return {
      action,
      semanticClass: "ignore",
      confidence,
      rationale,
    };
  }

  const captureCategoryHint = candidate.captureCategoryHint;
  const candidateText = candidate.candidateText;
  const reviewModeHint = candidate.reviewModeHint;
  if (
    !isCategoryHint(captureCategoryHint) ||
    typeof candidateText !== "string" ||
    !candidateText.trim()
  ) {
    throw new Error(
      "semantic interpretation candidate payload is missing candidateText or category",
    );
  }

  if (action === "forget") {
    return {
      action,
      semanticClass: "stable_user_preference",
      captureCategoryHint: "response_style",
      candidateText: candidateText.trim(),
      confidence,
      rationale,
    };
  }

  if (semanticClass === "ignore") {
    throw new Error("capture decisions cannot use semanticClass=ignore");
  }

  return {
    action,
    semanticClass,
    captureCategoryHint,
    candidateText: candidateText.trim(),
    confidence,
    ...(isReviewModeHint(reviewModeHint) ? { reviewModeHint } : {}),
    rationale,
  };
}
