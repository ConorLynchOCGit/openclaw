import type {
  MemoryProvenanceRegion,
  MemorySourceEnvelope,
} from "./memory-source-normalization.js";
import type { NormalizedMemorySourceWindow } from "./memory-source-windowing.js";
import {
  isSupportedRecurringProcedureKey,
  type RecurringProcedureKey,
} from "./recurring-procedure-semantic.js";

export type MemorySemanticInterpretationLane = "document_ingestion" | "ordinary_turn_capture";
export type MemorySemanticClass = MemorySemanticObjectKind | "ignore";

export type MemorySemanticReviewModeHint =
  | "direct"
  | "pending_confirmation"
  | "hold_for_more_evidence";

export type MemorySemanticConfidence = "strong" | "medium" | "weak";
export type MemoryCanonicalClass = "user" | "feedback" | "project" | "reference";

export type MemorySemanticObjectKind =
  | "preference"
  | "correction"
  | "procedure"
  | "project_fact"
  | "routing";

export type MemorySemanticDurability = "durable" | "conditional";

export type MemorySemanticScopeInterpretation = {
  projectId?: string;
  projectScope?: string;
  workflowScope?: string;
  userScope?: string;
  contextualDependencies: string[];
};

export type MemorySemanticProvenanceSpan = {
  blockIds?: string[];
  segmentIndexes?: number[];
  lineStart?: number;
  lineEnd?: number;
  headingPath?: string[];
};

// Compatibility aliases retained for runtime-api consumers while the runtime moves to object-native semantics.
export type MemorySemanticCaptureCategoryHint =
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "workflow_improvement"
  | "project_rule"
  | "unmet_need"
  | "reference_routing";

export type MemorySemanticCanonicalProcedure = {
  name: string;
  steps: string[];
  successShape?: string;
  failureShape?: string;
};

export type MemorySemanticProvenanceReference = MemorySemanticProvenanceSpan;

export type MemorySemanticPreferenceObject = {
  id?: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: "preference";
  operation: "capture" | "forget";
  subject: string;
  instruction: string;
  value?: string;
  preferenceProfile?:
    | "concise"
    | "bullets"
    | "plain_english"
    | "no_tables"
    | "numbered_steps"
    | "generalized_guidance";
  scope?: MemorySemanticScopeInterpretation;
  durability: MemorySemanticDurability;
  confidence: MemorySemanticConfidence;
  rationale: string[];
  provenanceSpans: MemorySemanticProvenanceSpan[];
};

export type MemorySemanticCorrectionObject = {
  id?: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: "correction";
  correctionKind:
    | "response_preference"
    | "workflow_guidance"
    | "project_rule"
    | "missing_capability";
  subject: string;
  recommendedAction?: string;
  avoidAction?: string;
  guidancePattern?: "use_instead_of" | "trust_for_scope" | "avoid_only";
  workflowProfile?: "general_guidance" | "environment_constraint" | "api_workaround";
  rationaleText?: string;
  neededCapability?: string;
  scope?: MemorySemanticScopeInterpretation;
  durability: MemorySemanticDurability;
  confidence: MemorySemanticConfidence;
  rationale: string[];
  provenanceSpans: MemorySemanticProvenanceSpan[];
};

export type MemorySemanticProcedureObject = {
  id?: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: "procedure";
  title: string;
  steps: string[];
  procedureKey?: RecurringProcedureKey;
  successShape?: string;
  failureShape?: string;
  scope?: MemorySemanticScopeInterpretation;
  durability: MemorySemanticDurability;
  confidence: MemorySemanticConfidence;
  rationale: string[];
  provenanceSpans: MemorySemanticProvenanceSpan[];
};

export type MemorySemanticProjectFactObject = {
  id?: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: "project_fact";
  subject: string;
  value: string;
  scope?: MemorySemanticScopeInterpretation;
  factFieldKey?:
    | "default_branch"
    | "staging_branch"
    | "repository_url"
    | "deployment_url"
    | "documentation_url"
    | "runbook_url"
    | "primary_package_manager"
    | "primary_environment_name";
  durability: MemorySemanticDurability;
  confidence: MemorySemanticConfidence;
  rationale: string[];
  provenanceSpans: MemorySemanticProvenanceSpan[];
};

export type MemorySemanticRoutingObject = {
  id?: string;
  canonicalClass?: MemoryCanonicalClass;
  kind: "routing";
  task: string;
  primaryResource: string;
  companionResources?: string[];
  rationaleText?: string;
  scope?: MemorySemanticScopeInterpretation;
  durability: MemorySemanticDurability;
  confidence: MemorySemanticConfidence;
  rationale: string[];
  provenanceSpans: MemorySemanticProvenanceSpan[];
};

export type MemorySemanticObject =
  | MemorySemanticPreferenceObject
  | MemorySemanticCorrectionObject
  | MemorySemanticProcedureObject
  | MemorySemanticProjectFactObject
  | MemorySemanticRoutingObject;

export type MemorySemanticInterpretationDecision =
  | {
      action: "ignore";
      confidence: MemorySemanticConfidence;
      rationale: string[];
      ignoreRationale?: string[];
      provenance?: MemorySemanticProvenanceSpan[];
    }
  | {
      action: "capture";
      objects: MemorySemanticObject[];
    };

export type MemorySemanticInterpretationInput = {
  lane: MemorySemanticInterpretationLane;
  source: MemorySourceEnvelope;
  window: NormalizedMemorySourceWindow;
};

export type MemorySemanticInterpretationResult = {
  decision: MemorySemanticInterpretationDecision;
  modelId: string;
  promptVersion: string;
};

export type MemorySemanticInterpreterPort = {
  interpretSourceWindow(
    input: MemorySemanticInterpretationInput,
  ): Promise<MemorySemanticInterpretationResult>;
};

export const MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION = "memory-semantic-v5";

function isCanonicalClass(value: unknown): value is MemoryCanonicalClass {
  return value === "user" || value === "feedback" || value === "project" || value === "reference";
}

function resolveCanonicalClassForCorrectionKind(
  correctionKind: MemorySemanticCorrectionObject["correctionKind"],
): MemoryCanonicalClass {
  switch (correctionKind) {
    case "response_preference":
      return "user";
    case "workflow_guidance":
    case "project_rule":
      return "feedback";
    case "missing_capability":
      return "project";
  }
}

export function resolveCanonicalMemoryClassForSemanticObject(
  object: MemorySemanticObject,
): MemoryCanonicalClass {
  switch (object.kind) {
    case "preference":
      return "user";
    case "correction":
      return resolveCanonicalClassForCorrectionKind(object.correctionKind);
    case "procedure":
      return "feedback";
    case "project_fact":
      return "project";
    case "routing":
      return "reference";
  }
}

function quoteJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toSemanticProvenanceSpan(
  provenance: MemoryProvenanceRegion,
  blockIds?: string[],
): MemorySemanticProvenanceSpan {
  return {
    ...(blockIds && blockIds.length > 0 ? { blockIds } : {}),
    ...(typeof provenance.segmentIndex === "number"
      ? { segmentIndexes: [provenance.segmentIndex] }
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
    ...(input.window.scope.projectScope ? { projectScope: input.window.scope.projectScope } : {}),
    ...(input.window.scope.workflowScope
      ? { workflowScope: input.window.scope.workflowScope }
      : {}),
    contextualDependencies: [
      ...input.window.scope.explicitScopeMarkers,
      ...input.window.scope.contextualScopeMarkers,
      ...input.window.scope.parentContext.map((entry) => entry.text).filter(Boolean),
    ].slice(0, 12),
  };
}

export function buildModelSemanticInterpretationPrompt(
  input: MemorySemanticInterpretationInput,
): string {
  const instructions = [
    "You are a memory semantic interpreter.",
    "Read the structurally normalized source window and extract durable memory objects.",
    "Return JSON only.",
    "Do not include markdown fences.",
    "Do not invent facts outside the source window and its explicit structural context.",
    "Prefer ignore over speculative capture.",
    "Normalization is structural only. You own semantic interpretation.",
    "Your job is to decide what durable memory objects exist, not which old detector bucket they fit.",
    "Output either action=ignore or action=capture with objects=[...].",
    "The top-level canonical memory classes are user, feedback, project, and reference.",
    "Use internal object kinds only as the semantic decomposition under those canonical classes.",
    "Canonical class mapping: preference => user; correction(response_preference) => user; correction(workflow_guidance | project_rule) => feedback; correction(missing_capability) => project; procedure => feedback; project_fact => project; routing => reference.",
    "Each object must include canonicalClass, kind, scope when needed, durability, provenanceSpans, confidence, and rationale.",
    "Treat canonicalClass as the top-level business contract and kind as the internal semantic decomposition under it.",
    "Allowed object kinds: preference, correction, procedure, project_fact, routing.",
    "Use preference objects for stable user/output preferences. Use operation=forget only when the source clearly revokes a durable preference.",
    "Use correction objects for durable operator guidance, workflow corrections, project-rule corrections, or missing-capability corrections.",
    "Use correctionKind=project_rule for durable normative rules or constraints that should be followed consistently inside a project workflow.",
    "Use correctionKind=workflow_guidance for durable tactical guidance or better ways to work that are helpful but not the project's rulebook.",
    "A single instruction that says what to trust, use, or avoid in future work is a correction, not a procedure.",
    "Use procedure objects for reusable ordered procedures or checklists.",
    "Do not emit procedure objects for single references to another document or for unordered reference pointers.",
    "Use project_fact objects for durable factual project or workflow facts that matter later.",
    "For project_fact objects, keep subject as the field label and value as the factual value. Do not collapse both into one sentence.",
    "Use routing objects for durable document-routing or context-routing guidance.",
    "Use routing objects when the durable meaning is 'for task X, consult resource Y'; do not emit routing when the source is actually teaching a procedure or rule.",
    "Reject filler, narration, one-off commentary, and generic references that do not shape future action.",
    "Ground every object in one or more provenance spans that point into the source window.",
  ].join("\n");

  const schemaHint = {
    action: "ignore | capture",
    confidence: "strong | medium | weak",
    rationale: ["string"],
    ignoreRationale: ["string"],
    objects: [
      {
        id: "string",
        canonicalClass: "user | feedback | project | reference",
        kind: "preference | correction | procedure | project_fact | routing",
        operation: "capture | forget",
        subject: "string",
        instruction: "string",
        preferenceProfile:
          "concise | bullets | plain_english | no_tables | numbered_steps | generalized_guidance",
        correctionKind:
          "response_preference | workflow_guidance | project_rule | missing_capability",
        recommendedAction: "string",
        avoidAction: "string",
        guidancePattern: "use_instead_of | trust_for_scope | avoid_only",
        workflowProfile: "general_guidance | environment_constraint | api_workaround",
        rationaleText: "string",
        neededCapability: "string",
        title: "string",
        steps: ["string"],
        procedureKey: "deploy_checklist | release_checklist | ...",
        successShape: "string",
        failureShape: "string",
        value: "string",
        factFieldKey:
          "default_branch | staging_branch | repository_url | deployment_url | documentation_url | runbook_url | primary_package_manager | primary_environment_name",
        task: "string",
        primaryResource: "string",
        companionResources: ["string"],
        scope: {
          projectId: "string",
          projectScope: "string",
          workflowScope: "string",
          userScope: "string",
          contextualDependencies: ["string"],
        },
        durability: "durable | conditional",
        confidence: "strong | medium | weak",
        rationale: ["string"],
        provenanceSpans: [
          {
            blockIds: ["string"],
            segmentIndexes: ["number"],
            lineStart: "number",
            lineEnd: "number",
            headingPath: ["string"],
          },
        ],
      },
    ],
  };

  const examples = [
    {
      canonicalClass: "project",
      kind: "project_fact",
      subject: "default branch",
      value: "atlas-main",
      factFieldKey: "default_branch",
    },
    {
      canonicalClass: "feedback",
      kind: "correction",
      correctionKind: "project_rule",
      subject: "docs workflow",
      recommendedAction: "Update the English docs first, then rerun docs i18n.",
      avoidAction: "Do not edit docs/zh-CN directly.",
      guidancePattern: "use_instead_of",
    },
    {
      canonicalClass: "reference",
      kind: "routing",
      task: "When deciding the repo's default landing bar",
      primaryResource: "Landing Gate Tiers",
      companionResources: ["Testing", "Release Policy"],
    },
    {
      canonicalClass: "feedback",
      kind: "correction",
      correctionKind: "workflow_guidance",
      subject: "readiness gate",
      recommendedAction: "Use /readyz as the readiness gate.",
      avoidAction: "Do not treat /healthz as the readiness gate.",
      guidancePattern: "use_instead_of",
    },
  ];

  return [
    instructions,
    "",
    "OUTPUT_SCHEMA:",
    quoteJson(schemaHint),
    "",
    "SEMANTIC_EXAMPLES:",
    quoteJson(examples),
    "",
    "NORMALIZED_INPUT:",
    quoteJson({
      lane: input.lane,
      source: input.source,
      scopeDefaults: buildDefaultScopeInterpretation(input),
      window: {
        id: input.window.id,
        headingPath: input.window.headingPath,
        listKinds: input.window.listKinds,
        provenance: input.window.provenance,
        scope: input.window.scope,
        text: input.window.windowText,
        blocks: input.window.blocks.map((block) => ({
          id: block.id,
          text: block.blockText,
          headingPath: block.headingPath,
          listKind: block.listKind,
          structuredChildren: block.structuredChildren,
          scope: block.scope,
          provenance: block.provenance,
        })),
      },
    }),
  ].join("\n");
}

function isConfidence(value: unknown): value is MemorySemanticConfidence {
  return value === "strong" || value === "medium" || value === "weak";
}

function isDurability(value: unknown): value is MemorySemanticDurability {
  return value === "durable" || value === "conditional";
}

function isGuidancePattern(
  value: unknown,
): value is Extract<MemorySemanticCorrectionObject["guidancePattern"], string> {
  return value === "use_instead_of" || value === "trust_for_scope" || value === "avoid_only";
}

function isPreferenceProfile(
  value: unknown,
): value is Extract<MemorySemanticPreferenceObject["preferenceProfile"], string> {
  return (
    value === "concise" ||
    value === "bullets" ||
    value === "plain_english" ||
    value === "no_tables" ||
    value === "numbered_steps" ||
    value === "generalized_guidance"
  );
}

function isWorkflowProfile(
  value: unknown,
): value is Extract<MemorySemanticCorrectionObject["workflowProfile"], string> {
  return (
    value === "general_guidance" || value === "environment_constraint" || value === "api_workaround"
  );
}

function isProjectFactFieldKey(
  value: unknown,
): value is Extract<MemorySemanticProjectFactObject["factFieldKey"], string> {
  return (
    value === "default_branch" ||
    value === "staging_branch" ||
    value === "repository_url" ||
    value === "deployment_url" ||
    value === "documentation_url" ||
    value === "runbook_url" ||
    value === "primary_package_manager" ||
    value === "primary_environment_name"
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    ...(readString(candidate.projectId) ? { projectId: readString(candidate.projectId) } : {}),
    ...(readString(candidate.projectScope)
      ? { projectScope: readString(candidate.projectScope) }
      : {}),
    ...(readString(candidate.workflowScope)
      ? { workflowScope: readString(candidate.workflowScope) }
      : {}),
    ...(readString(candidate.userScope) ? { userScope: readString(candidate.userScope) } : {}),
    contextualDependencies,
  };
}

function parseProvenanceSpans(value: unknown): MemorySemanticProvenanceSpan[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      const blockIds = readStringArray(candidate.blockIds);
      const segmentIndexes = Array.isArray(candidate.segmentIndexes)
        ? candidate.segmentIndexes.filter(
            (segmentIndex): segmentIndex is number => typeof segmentIndex === "number",
          )
        : [];
      return {
        ...(blockIds.length > 0 ? { blockIds } : {}),
        ...(segmentIndexes.length > 0 ? { segmentIndexes } : {}),
        ...(typeof candidate.lineStart === "number" ? { lineStart: candidate.lineStart } : {}),
        ...(typeof candidate.lineEnd === "number" ? { lineEnd: candidate.lineEnd } : {}),
        ...(Array.isArray(candidate.headingPath)
          ? {
              headingPath: candidate.headingPath.filter(
                (segment): segment is string =>
                  typeof segment === "string" && segment.trim().length > 0,
              ),
            }
          : {}),
      };
    })
    .filter((entry): entry is MemorySemanticProvenanceSpan => entry !== null);
}

function parseSemanticObject(value: unknown): MemorySemanticObject {
  if (!value || typeof value !== "object") {
    throw new Error("semantic object must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const durability = candidate.durability;
  const confidence = candidate.confidence;
  const rationale = readStringArray(candidate.rationale);
  const provenanceSpans = parseProvenanceSpans(candidate.provenanceSpans);

  if (
    (kind !== "preference" &&
      kind !== "correction" &&
      kind !== "procedure" &&
      kind !== "project_fact" &&
      kind !== "routing") ||
    !isDurability(durability) ||
    !isConfidence(confidence) ||
    rationale.length === 0 ||
    provenanceSpans.length === 0
  ) {
    throw new Error("semantic object payload is missing required fields");
  }

  const base = {
    ...(readString(candidate.id) ? { id: readString(candidate.id) } : {}),
    durability,
    confidence,
    rationale,
    provenanceSpans,
    ...(parseScopeInterpretation(candidate.scope)
      ? { scope: parseScopeInterpretation(candidate.scope) }
      : {}),
  };

  if (kind === "preference") {
    const canonicalClass = "user" satisfies MemoryCanonicalClass;
    if (
      candidate.canonicalClass !== undefined &&
      (!isCanonicalClass(candidate.canonicalClass) || candidate.canonicalClass !== canonicalClass)
    ) {
      throw new Error("preference object canonicalClass must be user");
    }
    const operation = candidate.operation;
    const subject = readString(candidate.subject);
    const instruction = readString(candidate.instruction);
    if ((operation !== "capture" && operation !== "forget") || !subject || !instruction) {
      throw new Error("preference object is missing operation, subject, or instruction");
    }
    return {
      ...base,
      canonicalClass,
      kind,
      operation,
      subject,
      instruction,
      ...(isPreferenceProfile(candidate.preferenceProfile)
        ? { preferenceProfile: candidate.preferenceProfile }
        : {}),
    };
  }

  if (kind === "correction") {
    const correctionKind = candidate.correctionKind;
    const subject = readString(candidate.subject);
    if (
      (correctionKind !== "response_preference" &&
        correctionKind !== "workflow_guidance" &&
        correctionKind !== "project_rule" &&
        correctionKind !== "missing_capability") ||
      !subject
    ) {
      throw new Error("correction object is missing correctionKind or subject");
    }
    const canonicalClass = resolveCanonicalClassForCorrectionKind(correctionKind);
    if (
      candidate.canonicalClass !== undefined &&
      (!isCanonicalClass(candidate.canonicalClass) || candidate.canonicalClass !== canonicalClass)
    ) {
      throw new Error("correction object canonicalClass does not match correctionKind");
    }
    return {
      ...base,
      canonicalClass,
      kind,
      correctionKind,
      subject,
      ...(readString(candidate.recommendedAction)
        ? { recommendedAction: readString(candidate.recommendedAction) }
        : {}),
      ...(readString(candidate.avoidAction)
        ? { avoidAction: readString(candidate.avoidAction) }
        : {}),
      ...(isGuidancePattern(candidate.guidancePattern)
        ? { guidancePattern: candidate.guidancePattern }
        : {}),
      ...(isWorkflowProfile(candidate.workflowProfile)
        ? { workflowProfile: candidate.workflowProfile }
        : {}),
      ...(readString(candidate.rationaleText)
        ? { rationaleText: readString(candidate.rationaleText) }
        : {}),
      ...(readString(candidate.neededCapability)
        ? { neededCapability: readString(candidate.neededCapability) }
        : {}),
    };
  }

  if (kind === "procedure") {
    const canonicalClass = "feedback" satisfies MemoryCanonicalClass;
    if (
      candidate.canonicalClass !== undefined &&
      (!isCanonicalClass(candidate.canonicalClass) || candidate.canonicalClass !== canonicalClass)
    ) {
      throw new Error("procedure object canonicalClass must be feedback");
    }
    const title = readString(candidate.title);
    const steps = readStringArray(candidate.steps);
    if (!title || steps.length < 2) {
      throw new Error("procedure object is missing title or steps");
    }
    return {
      ...base,
      canonicalClass,
      kind,
      title,
      steps,
      ...(readString(candidate.procedureKey) &&
      isSupportedRecurringProcedureKey(readString(candidate.procedureKey)!)
        ? { procedureKey: readString(candidate.procedureKey) as RecurringProcedureKey }
        : {}),
      ...(readString(candidate.successShape)
        ? { successShape: readString(candidate.successShape) }
        : {}),
      ...(readString(candidate.failureShape)
        ? { failureShape: readString(candidate.failureShape) }
        : {}),
    };
  }

  if (kind === "project_fact") {
    const canonicalClass = "project" satisfies MemoryCanonicalClass;
    if (
      candidate.canonicalClass !== undefined &&
      (!isCanonicalClass(candidate.canonicalClass) || candidate.canonicalClass !== canonicalClass)
    ) {
      throw new Error("project_fact object canonicalClass must be project");
    }
    const subject = readString(candidate.subject);
    const valueText = readString(candidate.value);
    if (!subject || !valueText) {
      throw new Error("project_fact object is missing subject or value");
    }
    return {
      ...base,
      canonicalClass,
      kind,
      subject,
      value: valueText,
      ...(isProjectFactFieldKey(candidate.factFieldKey)
        ? {
            factFieldKey: candidate.factFieldKey,
          }
        : {}),
    };
  }

  const task = readString(candidate.task);
  const primaryResource = readString(candidate.primaryResource);
  if (!task || !primaryResource) {
    throw new Error("routing object is missing task or primaryResource");
  }
  const canonicalClass = "reference" satisfies MemoryCanonicalClass;
  if (
    candidate.canonicalClass !== undefined &&
    (!isCanonicalClass(candidate.canonicalClass) || candidate.canonicalClass !== canonicalClass)
  ) {
    throw new Error("routing object canonicalClass must be reference");
  }
  return {
    ...base,
    canonicalClass,
    kind: "routing",
    task,
    primaryResource,
    ...(readStringArray(candidate.companionResources).length > 0
      ? { companionResources: readStringArray(candidate.companionResources) }
      : {}),
    ...(readString(candidate.rationaleText)
      ? { rationaleText: readString(candidate.rationaleText) }
      : {}),
  };
}

export function defaultDecisionProvenance(
  input: MemorySemanticInterpretationInput,
): MemorySemanticProvenanceSpan[] {
  return [
    toSemanticProvenanceSpan(
      input.window.provenance,
      input.window.blocks.map((block) => block.id),
    ),
  ];
}

export function renderMemorySemanticDecisionText(
  decision:
    | Extract<MemorySemanticInterpretationDecision, { action: "capture" }>
    | MemorySemanticObject,
): string | null {
  if ("action" in decision) {
    const primaryObject = decision.objects[0];
    return primaryObject ? renderMemorySemanticDecisionText(primaryObject) : null;
  }
  switch (decision.kind) {
    case "preference":
      return `For ${decision.subject}, ${decision.instruction}.`;
    case "correction":
      if (decision.neededCapability) {
        return `For ${decision.subject}, we need ${decision.neededCapability}.`;
      }
      if (decision.recommendedAction && decision.avoidAction) {
        return `For ${decision.subject}, use ${decision.recommendedAction} instead of ${decision.avoidAction}.`;
      }
      if (decision.recommendedAction) {
        return `For ${decision.subject}, use ${decision.recommendedAction}.`;
      }
      if (decision.avoidAction) {
        return `For ${decision.subject}, avoid ${decision.avoidAction}.`;
      }
      return decision.subject;
    case "procedure":
      return `${decision.title}:\n${decision.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`;
    case "project_fact":
      return `For project ${decision.scope?.projectScope ?? "current project"}, ${decision.subject} is ${decision.value}.`;
    case "routing":
      return `For ${decision.task}, use ${[decision.primaryResource, ...(decision.companionResources ?? [])].join(" with ")}.`;
  }
}

export function parseMemorySemanticInterpretationDecision(
  value: unknown,
): MemorySemanticInterpretationDecision {
  if (!value || typeof value !== "object") {
    throw new Error("semantic interpretation must be an object");
  }
  const candidate = value as Record<string, unknown>;
  const action = candidate.action;
  if (action !== "ignore" && action !== "capture") {
    throw new Error("semantic interpretation payload is missing action");
  }

  if (action === "ignore") {
    const confidence = candidate.confidence;
    const rationale = readStringArray(candidate.rationale);
    if (!isConfidence(confidence) || rationale.length === 0) {
      throw new Error("ignore payload is missing confidence or rationale");
    }
    return {
      action,
      confidence,
      rationale,
      ...(readStringArray(candidate.ignoreRationale).length > 0
        ? { ignoreRationale: readStringArray(candidate.ignoreRationale) }
        : {}),
      ...(parseProvenanceSpans(candidate.provenance).length > 0
        ? { provenance: parseProvenanceSpans(candidate.provenance) }
        : {}),
    };
  }

  if (!Array.isArray(candidate.objects) || candidate.objects.length === 0) {
    throw new Error("capture payload is missing semantic objects");
  }

  return {
    action,
    objects: candidate.objects.map((object) => parseSemanticObject(object)),
  };
}
