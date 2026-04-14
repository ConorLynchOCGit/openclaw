import { createModelContractMetadata, type ModelContractMetadata } from "./prompt-contracts.ts";
import type { InterpreterSourceWindow, SemanticExtractionPrompt } from "./semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "./storage-database-contract.ts";

export type BuildSemanticExtractionPromptInput = {
  sourceKind: ModelMemorySourceKind;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  contractVersion?: string;
  candidates?: Array<{
    candidateId: string;
    candidateType: "preference" | "fact" | "rule" | "procedure" | "reference";
    claim: string;
    confidence: "weak" | "medium" | "strong";
    supportingEvidence: Array<{
      blockId?: string;
      lineStart?: number;
      lineEnd?: number;
      headingPath: string[];
      excerpt: string;
    }>;
  }>;
};

export type BuildSemanticExtractionRepairPromptInput = {
  sourceKind: ModelMemorySourceKind;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  previousObjects: unknown[];
  validationErrors: Array<{
    path: string;
    message: string;
  }>;
  contractVersion?: string;
};

export type BuildSemanticCandidateExtractionRepairPromptInput = {
  sourceKind: ModelMemorySourceKind;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  previousObjects: unknown[];
  validationErrors: Array<{
    path: string;
    message: string;
  }>;
  contractVersion?: string;
};

export type BuildSemanticCandidateExtractionPromptInput = {
  sourceKind: ModelMemorySourceKind;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  contractVersion?: string;
};

export function createSemanticCandidateExtractionContractMetadata(
  modelId: string,
  contractVersion = "v2-candidate",
): ModelContractMetadata {
  return createModelContractMetadata({
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  });
}

export function createSemanticExtractionContractMetadata(
  modelId: string,
  contractVersion = "v2-canonicalization",
): ModelContractMetadata {
  return createModelContractMetadata({
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  });
}

export function createSemanticCandidateExtractionRepairContractMetadata(
  modelId: string,
  contractVersion = "v2-candidate-repair",
): ModelContractMetadata {
  return createModelContractMetadata({
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  });
}

export function createSemanticExtractionRepairContractMetadata(
  modelId: string,
  contractVersion = "v2-canonicalization-repair",
): ModelContractMetadata {
  return createModelContractMetadata({
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  });
}

function buildNumberedWindowText(sourceWindow: InterpreterSourceWindow): string {
  const startLine = sourceWindow.lineStart ?? 1;
  return sourceWindow.normalizedText
    .split("\n")
    .map((line, index) => `${startLine + index}| ${line}`)
    .join("\n");
}

function buildSourceWindowPromptValue(sourceWindow: InterpreterSourceWindow) {
  return {
    id: sourceWindow.id,
    headingPath: sourceWindow.headingPath,
    lineStart: sourceWindow.lineStart,
    lineEnd: sourceWindow.lineEnd,
    numberedText: buildNumberedWindowText(sourceWindow),
    availableHeadingPaths: Array.from(
      new Set(sourceWindow.blockDescriptors.map((block) => JSON.stringify(block.headingPath))),
    ).map((serialized) => JSON.parse(serialized) as string[]),
  };
}

function buildCanonicalSourceWindowPromptValue(sourceWindow: InterpreterSourceWindow) {
  return {
    id: sourceWindow.id,
    headingPath: sourceWindow.headingPath,
    lineStart: sourceWindow.lineStart,
    lineEnd: sourceWindow.lineEnd,
    availableHeadingPaths: Array.from(
      new Set(sourceWindow.blockDescriptors.map((block) => JSON.stringify(block.headingPath))),
    ).map((serialized) => JSON.parse(serialized) as string[]),
  };
}

function buildSourceKindSpecificSystemPromptLines(sourceKind: ModelMemorySourceKind): string[] {
  if (sourceKind === "document") {
    return [
      "For sourceKind=document, default to project, feedback, or reference objects rooted in the document itself.",
      "Emit user/preference only when the source window explicitly states a durable user-owned standing preference or standing instruction.",
      "Do not emit multiple objects that restate the same durable point at different granularity.",
      "If both a descriptive fact and a normative rule express the same durable point, prefer the normative rule and omit the paraphrase.",
    ];
  }

  return [
    "For sourceKind=ordinary_turn, user-owned standing preferences or user-facing durable rules are allowed when they are explicitly stated in the turn.",
  ];
}

export function buildSemanticCandidateExtractionPrompt(
  input: BuildSemanticCandidateExtractionPromptInput,
): SemanticExtractionPrompt {
  const contract = createSemanticCandidateExtractionContractMetadata(
    input.modelId,
    input.contractVersion,
  );

  return {
    contract,
    responseFormat: "json",
    systemPrompt: [
      "Identify durable memory candidates from the provided source window.",
      'Return JSON only with either {"action":"ignore"} or {"action":"capture","objects":[...]}.',
      "This pass is candidate discovery only, not final canonical formatting.",
      "Each candidate object must use this exact envelope: candidateType, claim, supportingSpans, confidence, shouldStore.",
      "Allowed candidateType values: preference, fact, rule, procedure, reference.",
      "claim must be one short normalized statement of the candidate memory.",
      "supportingSpans must be an array of spans from the provided source window. Each span must include headingPath and should normally include lineStart/lineEnd.",
      "Use lineStart/lineEnd from sourceWindow.numberedText for supportingSpans.",
      "Omit blockId in this pass unless an exact blockId is explicitly provided elsewhere.",
      "shouldStore must be true only for durable, cross-turn or cross-session useful candidates.",
      "Do not emit canonicalClass, kind, payload, scope, provenance, durability, reviewMode, or other final-schema fields in this pass.",
      "Do not emit long explanation text or repo-lore examples.",
      "Do not restate the same durable point at multiple granularities.",
      "If a rule subsumes a fact, prefer the rule and omit the paraphrase.",
      "If an item is transient operational detail with no durable value, drop it.",
      "Prefer fewer, higher-signal candidates over exhaustive extraction.",
      "Prefer ignore over weak or noisy candidates.",
      ...buildSourceKindSpecificSystemPromptLines(input.sourceKind),
      "Copy supportingSpans only from the provided sourceWindow.numberedText and sourceWindow.availableHeadingPaths.",
      "Do not invent heading paths or line numbers outside the provided source window.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      sourceKind: input.sourceKind,
      sourceWindow: buildSourceWindowPromptValue(input.sourceWindow),
    }),
  };
}

export function buildSemanticCandidateExtractionRepairPrompt(
  input: BuildSemanticCandidateExtractionRepairPromptInput,
): SemanticExtractionPrompt {
  const contract = createSemanticCandidateExtractionRepairContractMetadata(
    input.modelId,
    input.contractVersion,
  );

  return {
    contract,
    responseFormat: "json",
    systemPrompt: [
      "Repair the structure of previously extracted durable memory candidates.",
      'Return JSON only with either {"action":"ignore"} or {"action":"capture","objects":[...]}.',
      "Do not invent new candidates.",
      "Do not broaden meaning or add semantic content that was not already present.",
      "This pass is candidate repair only, not final canonical formatting.",
      "Each candidate object must use this exact envelope: candidateType, claim, supportingSpans, confidence, shouldStore.",
      "Allowed candidateType values: preference, fact, rule, procedure, reference.",
      "confidence must be one of weak, medium, strong.",
      "supportingSpans must be an array of spans from the provided source window. Each span must include headingPath and should normally include lineStart/lineEnd.",
      "Use lineStart/lineEnd from sourceWindow.numberedText for supportingSpans.",
      "Omit blockId in this pass unless an exact blockId is explicitly provided elsewhere.",
      "Do not emit canonicalClass, kind, payload, scope, provenance, durability, reviewMode, or other final-schema fields in this pass.",
      "Copy supportingSpans only from the provided sourceWindow.numberedText and sourceWindow.availableHeadingPaths.",
      "Do not invent heading paths or line numbers outside the provided source window.",
      "If a candidate cannot be repaired into the exact candidate envelope, drop it instead of guessing.",
      ...buildSourceKindSpecificSystemPromptLines(input.sourceKind),
    ].join("\n"),
    userPrompt: JSON.stringify({
      sourceKind: input.sourceKind,
      sourceWindow: buildSourceWindowPromptValue(input.sourceWindow),
      previousObjects: input.previousObjects,
      validationErrors: input.validationErrors,
    }),
  };
}

export function buildSemanticExtractionPrompt(
  input: BuildSemanticExtractionPromptInput,
): SemanticExtractionPrompt {
  const contract = createSemanticExtractionContractMetadata(input.modelId, input.contractVersion);

  return {
    contract,
    responseFormat: "json",
    systemPrompt: [
      "Canonicalize durable memory candidates into final canonical memory objects.",
      'Return JSON only with either {"action":"ignore"} or {"action":"capture","objects":[...]}.',
      "You may only use the provided candidates and cited source evidence.",
      "You may drop candidates.",
      "You may not invent new memories.",
      "You may not expand beyond the cited source evidence.",
      "This pass is canonicalization and formatting only, not fresh discovery.",
      "Allowed canonicalClass values: user, feedback, project, reference.",
      "Allowed kind values: preference, fact, rule, procedure, reference.",
      "Valid canonicalClass/kind pairs only:",
      "- user + preference",
      "- project + fact",
      "- user or feedback or project + rule",
      "- feedback + procedure",
      "- reference + reference",
      "Do not emit any other canonicalClass/kind pairing.",
      "Final kind must match the candidateType for the candidate being canonicalized.",
      "Each captured object must use this exact envelope: canonicalClass, kind, payload, optional scope, provenance, confidence, durability, reviewMode.",
      "Do not emit legacy top-level semantic fields such as subject, instruction, value, title, task, recommendedAction, avoidAction, key, rationale, or family. Those belong inside payload or are forbidden.",
      "Payload requirements by kind:",
      "- preference payload: subject, instruction, operation",
      "- fact payload: subject, value",
      "- rule payload: subject plus at least one of recommendedAction, avoidAction, neededCapability",
      "- procedure payload: title, steps",
      "- reference payload: task, primaryResource, companionResources when present",
      "Do not emit payload keys other than the allowed keys for the selected kind.",
      "Payload field values must be plain strings except for procedure.steps and reference.companionResources, which must be arrays of strings.",
      "Do not emit nested payload objects, numbers, booleans, or arrays of objects.",
      "Scope may be omitted. If present, the key name must be exactly scope and its value must be an object.",
      "Scope may include only: projectId, projectScope, workflowScope, userScope, contextualDependencies.",
      "The word optional in these instructions is descriptive text, never part of a field name.",
      "Do not emit keys such as optional scope or optional companionResources.",
      "Provenance must be an array of spans. Each span must include sourceId and headingPath, plus lineStart/lineEnd when available.",
      "Prefer lineStart/lineEnd plus headingPath from the cited candidate supportingEvidence.",
      "Use the cited candidate supportingEvidence as the primary source for provenance.",
      "Omit blockId unless the candidate supportingEvidence already includes an exact blockId.",
      "Do not invent heading paths, block IDs, or line numbers outside the cited candidate evidence or allowed heading paths.",
      "Confidence must be one of weak, medium, strong.",
      "Durability must be one of ephemeral, durable.",
      "ReviewMode must be one of auto_accept, manual_review, suppress.",
      "Every captured object must include provenance spans from the provided source window.",
      "If a candidate cannot be expressed as a valid object under this contract, omit it.",
      "Prefer ignore over speculation.",
      "Use structure, not predeclared memories.",
      "Placeholder-only example fields are permitted internally: <subject>, <value>, <resource>, <recommended-action>.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      sourceKind: input.sourceKind,
      sourceWindow: buildCanonicalSourceWindowPromptValue(input.sourceWindow),
      candidates: input.candidates ?? [],
    }),
  };
}

export function buildSemanticExtractionRepairPrompt(
  input: BuildSemanticExtractionRepairPromptInput,
): SemanticExtractionPrompt {
  const contract = createSemanticExtractionRepairContractMetadata(
    input.modelId,
    input.contractVersion,
  );

  return {
    contract,
    responseFormat: "json",
    systemPrompt: [
      "Repair the structure of previously extracted durable memory objects.",
      'Return JSON only with either {"action":"ignore"} or {"action":"capture","objects":[...]}.',
      "Do not invent new memories.",
      "Do not broaden meaning or add semantic content that was not already present.",
      "If a candidate cannot be expressed as a valid object under the contract, drop it instead of guessing.",
      "Valid canonicalClass/kind pairs only:",
      "- user + preference",
      "- project + fact",
      "- user or feedback or project + rule",
      "- feedback + procedure",
      "- reference + reference",
      "Each captured object must use this exact envelope: canonicalClass, kind, payload, provenance, confidence, durability, reviewMode, and optional scope.",
      "The word optional is descriptive text, never part of a field name.",
      "Do not emit keys such as optional scope or optional companionResources.",
      "Payload keys by kind:",
      "- preference: subject, instruction, operation",
      "- fact: subject, value",
      "- rule: subject plus at least one of recommendedAction, avoidAction, neededCapability",
      "- procedure: title, steps",
      "- reference: task, primaryResource, companionResources when present",
      "Do not emit payload keys other than the allowed keys for the selected kind.",
      "Payload field values must be plain strings except for procedure.steps and reference.companionResources, which must be arrays of strings.",
      "Scope may be omitted. If present, the key name must be exactly scope and its value must be an object with only: projectId, projectScope, workflowScope, userScope, contextualDependencies.",
      "Prefer provenance with sourceId, headingPath, and exact lineStart/lineEnd from the cited evidence.",
      "Omit blockId unless the cited evidence already includes an exact blockId.",
      "Do not invent heading paths, block IDs, or line numbers outside the cited evidence or allowed heading paths.",
      "Preserve sourceId, confidence, durability, and reviewMode unless they are invalid under the contract.",
    ].join("\n"),
    userPrompt: JSON.stringify({
      sourceKind: input.sourceKind,
      sourceWindow: buildCanonicalSourceWindowPromptValue(input.sourceWindow),
      previousObjects: input.previousObjects,
      validationErrors: input.validationErrors,
    }),
  };
}
