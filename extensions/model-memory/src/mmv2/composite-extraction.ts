import { JsonModelOutputError } from "../model-execution.ts";
import type { InterpreterSourceWindow, SemanticInterpreter } from "../semantic-interpreter.ts";
import type { ModelMemorySourceKind } from "../storage-database-contract.ts";
import { tryParseFencedJsonBlock } from "../structured-json.ts";
import {
  CompositeCandidateSchema,
  CompositeRoutedCandidateSchema,
  CompositeExtractionBatchSchema,
  type AtomicExtractionBatch,
  type CompositeCandidate,
  type CompositeExtractionBatch,
  type CompositeRoutedCandidate,
  type RawIngestEvent,
} from "./contracts.ts";
import {
  buildCompositeExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import {
  assessStructuredArtifactIntent,
  isCodeLikeTitle,
  isExplanatoryTitle,
  parseShortLabelContext,
} from "./structural-artifact-intent.ts";
import { extractHeadingText, isHeadingLine, parseStructuredList } from "./structural-markdown.ts";

type CompositeInput = {
  rawEvent: RawIngestEvent;
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  modelId: string;
  interpreter: SemanticInterpreter;
  routedCandidates: CompositeRoutedCandidate[];
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

const COMPOSITE_ARTIFACT_TYPES = new Set<CompositeCandidate["artifact_type"]>([
  "procedure",
  "checklist",
  "profile",
  "project_state",
  "decision_record",
  "source_bundle",
  "lesson_pack",
]);

const COMPOSITE_COMPONENT_ROLES = new Set<CompositeCandidate["components"][number]["role"]>([
  "step",
  "substep",
  "guardrail",
  "precondition",
  "postcondition",
  "decision_point",
  "reference",
  "fact",
  "rationale",
  "example",
  "owner",
  "open_question",
  "other",
]);

const EMBEDDED_ATOMIC_KINDS = new Set<
  CompositeCandidate["components"][number]["embedded_atomic_kind"]
>(["claim", "directive", "source_ref", "episode", "none"]);

const PROMOTION_VALUES = new Set<CompositeCandidate["components"][number]["promotion"]>([
  "embedded_only",
  "global",
  "both",
  "blocked",
]);

function defaultCompositeScope() {
  return {
    subject_type: "unknown" as const,
    subject_id: null,
    project_id: null,
    workspace_id: null,
    applies_to: "unknown" as const,
  };
}

function coerceCompositeScope(raw: unknown): CompositeCandidate["scope"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultCompositeScope();
  }
  const source = raw as Record<string, unknown>;
  return {
    subject_type:
      source.subject_type === "user" ||
      source.subject_type === "assistant" ||
      source.subject_type === "project" ||
      source.subject_type === "workspace" ||
      source.subject_type === "organization" ||
      source.subject_type === "external_entity" ||
      source.subject_type === "system" ||
      source.subject_type === "unknown"
        ? source.subject_type
        : "unknown",
    subject_id: typeof source.subject_id === "string" ? source.subject_id : null,
    project_id: typeof source.project_id === "string" ? source.project_id : null,
    workspace_id: typeof source.workspace_id === "string" ? source.workspace_id : null,
    applies_to:
      source.applies_to === "global" ||
      source.applies_to === "current_project" ||
      source.applies_to === "current_workspace" ||
      source.applies_to === "specific_entity" ||
      source.applies_to === "current_session_only" ||
      source.applies_to === "unknown"
        ? source.applies_to
        : "unknown",
  };
}

function inferComponentEvidenceQuote(
  segmentText: string,
  component: Record<string, unknown>,
): string {
  const candidates = [
    typeof component.evidence_quote === "string" ? component.evidence_quote : null,
    typeof component.content === "string" ? component.content : null,
    typeof component.component_id === "string" ? component.component_id : null,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (segmentText.includes(candidate)) {
      return candidate;
    }
  }
  return segmentText;
}

function nonBlankLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractStructuredListItems(routedCandidate: CompositeRoutedCandidate): {
  artifactType: CompositeCandidate["artifact_type"];
  title: string | null;
  items: Array<{ content: string; evidenceQuote: string }>;
} | null {
  const parsedList = parseStructuredList(routedCandidate.text);
  if (!parsedList) {
    return null;
  }

  const lines = nonBlankLines(routedCandidate.text);
  const titleLine = lines.find((line) => isHeadingLine(line)) ?? null;
  const title = titleLine
    ? extractHeadingText(titleLine)
    : isHeadingLine(routedCandidate.local_context_before)
      ? extractHeadingText(routedCandidate.local_context_before)
      : null;

  return {
    artifactType: parsedList.kind === "numbered" ? "procedure" : "checklist",
    title,
    items: parsedList.items.map((item) => ({
      content: item.content,
      evidenceQuote: item.rawText,
    })),
  };
}

function inferStructuredComponentRole(
  content: string,
): CompositeCandidate["components"][number]["role"] {
  if (/^(?:do not|never|without approval|without user approval)\b/iu.test(content)) {
    return "guardrail";
  }
  if (/https?:\/\/|\/[A-Za-z0-9._/-]+|`[^`]+`/u.test(content)) {
    return "reference";
  }
  return "step";
}

function inferStructuredEmbeddedAtomicKind(
  role: CompositeCandidate["components"][number]["role"],
): CompositeCandidate["components"][number]["embedded_atomic_kind"] {
  if (role === "reference") {
    return "source_ref";
  }
  if (role === "guardrail" || role === "step") {
    return "directive";
  }
  return "none";
}

function deriveStructuredTitle(
  routedCandidate: CompositeRoutedCandidate,
  structured: NonNullable<ReturnType<typeof extractStructuredListItems>>,
): string {
  const explicitTitle = structured.title?.trim();
  if (explicitTitle && !isCodeLikeTitle(explicitTitle) && !isExplanatoryTitle(explicitTitle)) {
    return explicitTitle;
  }

  const labelFromContext = parseShortLabelContext(routedCandidate.local_context_before);
  if (labelFromContext) {
    return labelFromContext;
  }

  return structured.items[0]?.content.slice(0, 72) ?? `Structured ${structured.artifactType}`;
}

function hasStrongDeterministicArtifactIntent(
  routedCandidate: CompositeRoutedCandidate,
  structured: NonNullable<ReturnType<typeof extractStructuredListItems>>,
): boolean {
  const assessment = assessStructuredArtifactIntent(routedCandidate);
  return assessment?.decision === "promote" && assessment.artifactType === structured.artifactType;
}

function tryDeterministicCompositeCandidate(
  routedCandidate: CompositeRoutedCandidate,
): CompositeCandidate | null {
  const structured = extractStructuredListItems(routedCandidate);
  if (structured && hasStrongDeterministicArtifactIntent(routedCandidate, structured)) {
    const title = deriveStructuredTitle(routedCandidate, structured);
    const summary =
      structured.artifactType === "procedure"
        ? `Ordered workflow with ${structured.items.length} steps.`
        : `Checklist with ${structured.items.length} items.`;
    return {
      candidate_id: `det-structured:${routedCandidate.segment_id}`,
      source_segment_id: routedCandidate.segment_id,
      artifact_type: structured.artifactType,
      title,
      purpose:
        structured.artifactType === "procedure"
          ? `Follow the procedure described by ${title}.`
          : `Track the checklist described by ${title}.`,
      activation_triggers: [],
      summary,
      evidence_quote: routedCandidate.text,
      components: structured.items.map((item, index) => {
        const role = inferStructuredComponentRole(item.content);
        return {
          component_id: `component_${index}`,
          order_index: index,
          role,
          content: item.content,
          embedded_atomic_kind: inferStructuredEmbeddedAtomicKind(role),
          promotion: "embedded_only",
          evidence_quote: item.evidenceQuote,
          required: true,
          conditions: [],
          outputs: [],
        };
      }),
      scope: defaultCompositeScope(),
      confidence: Math.max(routedCandidate.confidence, 0.88),
      risk_flags: ["none"],
    };
  }

  const parsed = tryParseFencedJsonBlock(routedCandidate.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const source = parsed as Record<string, unknown>;
  const artifactType =
    typeof source.artifact_type === "string" &&
    COMPOSITE_ARTIFACT_TYPES.has(source.artifact_type as CompositeCandidate["artifact_type"])
      ? (source.artifact_type as CompositeCandidate["artifact_type"])
      : null;
  const rawComponents = Array.isArray(source.components) ? source.components : [];
  if (
    (source.unit_type !== "composite" && artifactType === null) ||
    rawComponents.length === 0 ||
    artifactType === null
  ) {
    return null;
  }

  const candidate = CompositeCandidateSchema.safeParse({
    candidate_id:
      typeof source.candidate_id === "string"
        ? source.candidate_id
        : `det-composite:${routedCandidate.segment_id}`,
    source_segment_id: routedCandidate.segment_id,
    artifact_type: artifactType,
    title:
      typeof source.title === "string" && source.title.trim().length > 0
        ? source.title
        : `Structured ${artifactType} example`,
    purpose:
      typeof source.purpose === "string"
        ? source.purpose
        : `Structured ${artifactType} example extracted deterministically from a fenced JSON block.`,
    activation_triggers:
      rawComponents.length > 0 && Array.isArray(source.activation_triggers)
        ? source.activation_triggers.filter((entry): entry is string => typeof entry === "string")
        : [],
    summary:
      typeof source.summary === "string" && source.summary.trim().length > 0
        ? source.summary
        : typeof source.purpose === "string" && source.purpose.trim().length > 0
          ? source.purpose
          : `Structured ${artifactType} example.`,
    evidence_quote: routedCandidate.text,
    components: rawComponents.map((rawComponent, index) => {
      const component =
        rawComponent && typeof rawComponent === "object" && !Array.isArray(rawComponent)
          ? (rawComponent as Record<string, unknown>)
          : {};
      const role =
        typeof component.role === "string" &&
        COMPOSITE_COMPONENT_ROLES.has(
          component.role as CompositeCandidate["components"][number]["role"],
        )
          ? (component.role as CompositeCandidate["components"][number]["role"])
          : "other";
      const promotion =
        typeof component.promotion === "string" &&
        PROMOTION_VALUES.has(
          component.promotion as CompositeCandidate["components"][number]["promotion"],
        )
          ? (component.promotion as CompositeCandidate["components"][number]["promotion"])
          : "embedded_only";
      const embeddedAtomicKind =
        typeof component.embedded_atomic_kind === "string" &&
        EMBEDDED_ATOMIC_KINDS.has(
          component.embedded_atomic_kind as CompositeCandidate["components"][number]["embedded_atomic_kind"],
        )
          ? (component.embedded_atomic_kind as CompositeCandidate["components"][number]["embedded_atomic_kind"])
          : "none";
      return {
        component_id:
          typeof component.component_id === "string"
            ? component.component_id
            : `component_${index}`,
        order_index: index,
        role,
        content:
          typeof component.content === "string"
            ? component.content
            : `Structured ${role} component`,
        embedded_atomic_kind: embeddedAtomicKind,
        promotion,
        evidence_quote: inferComponentEvidenceQuote(routedCandidate.text, component),
        required:
          typeof component.required === "boolean"
            ? component.required
            : role === "step" || role === "guardrail" || role === "precondition",
        conditions: Array.isArray(component.conditions)
          ? component.conditions.filter((entry): entry is string => typeof entry === "string")
          : [],
        outputs: Array.isArray(component.outputs)
          ? component.outputs.filter((entry): entry is string => typeof entry === "string")
          : [],
      };
    }),
    scope: coerceCompositeScope(source.scope),
    confidence: Math.max(routedCandidate.confidence, 0.9),
    risk_flags: Array.isArray(source.risk_flags)
      ? source.risk_flags.filter(
          (entry): entry is CompositeCandidate["risk_flags"][number] =>
            entry === "contains_pii" ||
            entry === "contains_secret" ||
            entry === "health_data" ||
            entry === "financial_data" ||
            entry === "legal_data" ||
            entry === "credential_like" ||
            entry === "safety_sensitive" ||
            entry === "low_confidence" ||
            entry === "none",
        )
      : ["none"],
  });

  return candidate.success ? candidate.data : null;
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
      if (!routedCandidate.text.includes(component.evidence_quote)) {
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
          'Each component must include "component_id", "order_index", "role", "content", "embedded_atomic_kind", "promotion", "evidence_quote", "required", "conditions", and "outputs".',
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
  const normalized = {
    ...parsed.data,
    composite_candidates: parsed.data.composite_candidates.map(normalizeCompositeCandidate),
  };
  const repairedErrors = validateComposite(normalized, input.routedCandidates);
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

  const deterministicCandidates: CompositeCandidate[] = [];
  const modelRoutedCandidates: CompositeRoutedCandidate[] = [];
  for (const routedCandidate of input.routedCandidates) {
    const deterministic = tryDeterministicCompositeCandidate(routedCandidate);
    if (deterministic) {
      deterministicCandidates.push(normalizeCompositeCandidate(deterministic));
      continue;
    }
    modelRoutedCandidates.push(routedCandidate);
  }

  if (modelRoutedCandidates.length === 0) {
    return {
      schema_version: "composite_extraction.v1",
      event_id: input.rawEvent.event_id,
      composite_candidates: deterministicCandidates,
    };
  }

  const prompt = buildCompositeExtractionPrompt({
    modelId: input.modelId,
    rawEvent: input.rawEvent,
    routedCandidates: modelRoutedCandidates,
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
      routedCandidates: modelRoutedCandidates,
      previousPayload: extractBatch(result),
      validationErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return {
      ...repaired,
      composite_candidates: [...deterministicCandidates, ...repaired.composite_candidates],
    };
  }
  const normalized = parsed.data.composite_candidates.map(normalizeCompositeCandidate);
  const combined = {
    ...parsed.data,
    composite_candidates: [...deterministicCandidates, ...normalized],
  };
  const errors = validateComposite(combined, input.routedCandidates);
  if (errors.length > 0) {
    const repaired = await repairCompositeExtraction({
      ...input,
      routedCandidates: modelRoutedCandidates,
      previousPayload: {
        ...parsed.data,
        composite_candidates: normalized,
      },
      validationErrors: errors,
    });
    return {
      ...repaired,
      composite_candidates: [...deterministicCandidates, ...repaired.composite_candidates],
    };
  }
  return combined;
}
