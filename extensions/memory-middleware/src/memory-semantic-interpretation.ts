import type {
  MemoryProvenanceRegion,
  MemorySourceEnvelope,
  NormalizedMemoryBlock,
} from "./memory-source-normalization.js";

export type MemorySemanticInterpretationLane = "document_ingestion" | "ordinary_turn_capture";

export type MemorySemanticClass =
  | "stable_user_preference"
  | "durable_operator_correction"
  | "reusable_procedure"
  | "recurring_project_or_workflow_fact"
  | "durable_routing_or_context_memory"
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

export type MemorySemanticScopeInterpretation = {
  projectId?: string;
  projectScope?: string;
  workflowScope?: string;
  userScope?: string;
  contextualDependencies: string[];
};

export type MemorySemanticCanonicalProcedure = {
  name: string;
  steps: string[];
  successShape?: string;
  failureShape?: string;
};

export type MemorySemanticProvenanceReference = {
  segmentIndex?: number;
  lineStart?: number;
  lineEnd?: number;
  headingPath?: string[];
};

export type MemorySemanticInterpretationDecision =
  | {
      action: "ignore";
      semanticClass: "ignore";
      confidence: "strong" | "medium" | "weak";
      rationale: string[];
      ignoreRationale?: string[];
      provenance?: MemorySemanticProvenanceReference[];
    }
  | {
      action: "candidate";
      semanticClass: Exclude<MemorySemanticClass, "ignore">;
      captureCategoryHint: MemorySemanticCaptureCategoryHint;
      candidateText?: string;
      canonicalStatement?: string;
      canonicalProcedure?: MemorySemanticCanonicalProcedure;
      confidence: "strong" | "medium" | "weak";
      reviewModeHint?: MemorySemanticReviewModeHint;
      rationale: string[];
      durabilityRationale?: string[];
      scopeInterpretation?: MemorySemanticScopeInterpretation;
      provenance?: MemorySemanticProvenanceReference[];
    }
  | {
      action: "forget";
      semanticClass: "stable_user_preference";
      captureCategoryHint: "response_style";
      candidateText?: string;
      canonicalStatement: string;
      confidence: "strong" | "medium" | "weak";
      rationale: string[];
      scopeInterpretation?: MemorySemanticScopeInterpretation;
      provenance?: MemorySemanticProvenanceReference[];
    };

export type MemorySemanticInterpretationInput = {
  lane: MemorySemanticInterpretationLane;
  source: MemorySourceEnvelope;
  block: NormalizedMemoryBlock;
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

export const MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION = "memory-semantic-v2";

function quoteJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toSemanticProvenanceReference(
  provenance: MemoryProvenanceRegion,
): MemorySemanticProvenanceReference {
  return {
    ...(typeof provenance.segmentIndex === "number"
      ? { segmentIndex: provenance.segmentIndex }
      : {}),
    ...(typeof provenance.lineStart === "number" ? { lineStart: provenance.lineStart } : {}),
    ...(typeof provenance.lineEnd === "number" ? { lineEnd: provenance.lineEnd } : {}),
    ...(provenance.headingPath.length > 0 ? { headingPath: provenance.headingPath } : {}),
  };
}

function buildDefaultScopeInterpretation(
  input: MemorySemanticInterpretationInput,
): MemorySemanticScopeInterpretation {
  return {
    ...(input.source.projectId ? { projectId: input.source.projectId } : {}),
    ...(input.block.scope.projectScope ? { projectScope: input.block.scope.projectScope } : {}),
    ...(input.block.scope.workflowScope ? { workflowScope: input.block.scope.workflowScope } : {}),
    contextualDependencies: [
      ...input.block.scope.explicitScopeMarkers,
      ...input.block.scope.contextualScopeMarkers,
      ...input.block.scope.parentContext.map((entry) => entry.text).filter(Boolean),
    ].slice(0, 8),
  };
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
    "Normalization is structural only. You own the semantic decision.",
    "If scope is implied through headings, source metadata, or parent context, make it explicit in the canonical output.",
    "Available semantic classes: stable_user_preference, durable_operator_correction, reusable_procedure, recurring_project_or_workflow_fact, durable_routing_or_context_memory, ignore.",
    "Available captureCategoryHint values: response_style, project_fact, recurring_procedure, workflow_improvement, project_rule, unmet_need, reference_routing.",
    "Use canonicalStatement for statement-like outputs.",
    "Use canonicalProcedure for reusable procedure outputs.",
    "Use action=forget only for durable response-style removals.",
    "Reject filler, narrative glue, and one-off historical commentary.",
    "Only emit durable routing/context guidance when it is action-shaping and likely to matter later.",
    "Ground the decision in the provided provenance and scope.",
  ].join("\n");

  const schemaHint = {
    action: "ignore | candidate | forget",
    semanticClass:
      "stable_user_preference | durable_operator_correction | reusable_procedure | recurring_project_or_workflow_fact | durable_routing_or_context_memory | ignore",
    captureCategoryHint:
      "response_style | project_fact | recurring_procedure | workflow_improvement | project_rule | unmet_need | reference_routing",
    canonicalStatement: "string",
    canonicalProcedure: {
      name: "string",
      steps: ["string"],
      successShape: "string",
      failureShape: "string",
    },
    confidence: "strong | medium | weak",
    reviewModeHint: "direct | pending_confirmation | hold_for_more_evidence",
    rationale: ["string"],
    durabilityRationale: ["string"],
    scopeInterpretation: {
      projectId: "string",
      projectScope: "string",
      workflowScope: "string",
      userScope: "string",
      contextualDependencies: ["string"],
    },
    provenance: [
      {
        segmentIndex: "number",
        lineStart: "number",
        lineEnd: "number",
        headingPath: ["string"],
      },
    ],
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
      scopeDefaults: buildDefaultScopeInterpretation(input),
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
    value === "durable_routing_or_context_memory" ||
    value === "ignore"
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function parseScopeInterpretation(value: unknown): MemorySemanticScopeInterpretation | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const contextualDependencies = readStringArray(candidate.contextualDependencies);
  return {
    ...(typeof candidate.projectId === "string" && candidate.projectId.trim()
      ? { projectId: candidate.projectId.trim() }
      : {}),
    ...(typeof candidate.projectScope === "string" && candidate.projectScope.trim()
      ? { projectScope: candidate.projectScope.trim() }
      : {}),
    ...(typeof candidate.workflowScope === "string" && candidate.workflowScope.trim()
      ? { workflowScope: candidate.workflowScope.trim() }
      : {}),
    ...(typeof candidate.userScope === "string" && candidate.userScope.trim()
      ? { userScope: candidate.userScope.trim() }
      : {}),
    contextualDependencies,
  };
}

function parseProvenanceReferences(
  value: unknown,
): MemorySemanticProvenanceReference[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const references = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      return {
        ...(typeof candidate.segmentIndex === "number"
          ? { segmentIndex: candidate.segmentIndex }
          : {}),
        ...(typeof candidate.lineStart === "number" ? { lineStart: candidate.lineStart } : {}),
        ...(typeof candidate.lineEnd === "number" ? { lineEnd: candidate.lineEnd } : {}),
        ...(Array.isArray(candidate.headingPath)
          ? {
              headingPath: candidate.headingPath.filter(
                (pathEntry): pathEntry is string =>
                  typeof pathEntry === "string" && pathEntry.trim().length > 0,
              ),
            }
          : {}),
      };
    })
    .filter((entry): entry is MemorySemanticProvenanceReference => entry !== null);
  return references.length > 0 ? references : undefined;
}

function parseCanonicalProcedure(value: unknown): MemorySemanticCanonicalProcedure | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const steps = readStringArray(candidate.steps);
  if (typeof candidate.name !== "string" || !candidate.name.trim() || steps.length < 2) {
    return undefined;
  }
  return {
    name: candidate.name.trim(),
    steps: steps.map((step) => step.trim()),
    ...(typeof candidate.successShape === "string" && candidate.successShape.trim()
      ? { successShape: candidate.successShape.trim() }
      : {}),
    ...(typeof candidate.failureShape === "string" && candidate.failureShape.trim()
      ? { failureShape: candidate.failureShape.trim() }
      : {}),
  };
}

export function renderMemorySemanticDecisionText(
  decision: Extract<MemorySemanticInterpretationDecision, { action: "candidate" | "forget" }>,
): string | null {
  const procedure = "canonicalProcedure" in decision ? decision.canonicalProcedure : undefined;
  if (procedure) {
    return `${procedure.name}:\n${procedure.steps
      .map((step: string, index: number) => `${index + 1}. ${step}`)
      .join("\n")}`;
  }
  const canonicalStatement =
    "canonicalStatement" in decision ? decision.canonicalStatement?.trim() : undefined;
  if (canonicalStatement) {
    return canonicalStatement;
  }
  return typeof decision.candidateText === "string" && decision.candidateText.trim()
    ? decision.candidateText.trim()
    : null;
}

export function defaultDecisionProvenance(
  input: MemorySemanticInterpretationInput,
): MemorySemanticProvenanceReference[] {
  return [toSemanticProvenanceReference(input.block.provenance)];
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
  const rationale = readStringArray(candidate.rationale);

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
      ...(readStringArray(candidate.ignoreRationale).length > 0
        ? { ignoreRationale: readStringArray(candidate.ignoreRationale) }
        : {}),
      ...(parseProvenanceReferences(candidate.provenance)
        ? { provenance: parseProvenanceReferences(candidate.provenance) }
        : {}),
    };
  }

  const captureCategoryHint = candidate.captureCategoryHint;
  if (!isCategoryHint(captureCategoryHint)) {
    throw new Error("semantic interpretation candidate payload is missing captureCategoryHint");
  }

  const canonicalProcedure = parseCanonicalProcedure(candidate.canonicalProcedure);
  const legacyCandidateText =
    typeof candidate.candidateText === "string" && candidate.candidateText.trim()
      ? candidate.candidateText.trim()
      : undefined;
  const canonicalStatement =
    typeof candidate.canonicalStatement === "string" && candidate.canonicalStatement.trim()
      ? candidate.canonicalStatement.trim()
      : legacyCandidateText;

  const scopeInterpretation = parseScopeInterpretation(candidate.scopeInterpretation);
  const provenance = parseProvenanceReferences(candidate.provenance);

  if (action === "forget") {
    if (!canonicalStatement) {
      throw new Error("forget decision is missing canonicalStatement");
    }
    return {
      action,
      semanticClass: "stable_user_preference",
      captureCategoryHint: "response_style",
      canonicalStatement,
      confidence,
      rationale,
      ...(scopeInterpretation ? { scopeInterpretation } : {}),
      ...(provenance ? { provenance } : {}),
    };
  }

  if (semanticClass === "ignore") {
    throw new Error("capture decisions cannot use semanticClass=ignore");
  }
  if (!canonicalStatement && !canonicalProcedure) {
    throw new Error(
      "semantic interpretation candidate payload is missing canonicalStatement or canonicalProcedure",
    );
  }

  return {
    action,
    semanticClass,
    captureCategoryHint,
    ...(canonicalStatement ? { canonicalStatement } : {}),
    ...(canonicalProcedure ? { canonicalProcedure } : {}),
    confidence,
    ...(isReviewModeHint(candidate.reviewModeHint)
      ? { reviewModeHint: candidate.reviewModeHint }
      : {}),
    rationale,
    ...(readStringArray(candidate.durabilityRationale).length > 0
      ? { durabilityRationale: readStringArray(candidate.durabilityRationale) }
      : {}),
    ...(scopeInterpretation ? { scopeInterpretation } : {}),
    ...(provenance ? { provenance } : {}),
  };
}
