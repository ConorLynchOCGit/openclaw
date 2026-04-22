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
import { parseExplicitMemoryCommand } from "./explicit-memory-command.ts";
import {
  buildAtomicExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import { isSchemaLikeText } from "./structural-artifact-intent.ts";

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

type ParsedJsonValue =
  | null
  | boolean
  | number
  | string
  | ParsedJsonValue[]
  | { [key: string]: ParsedJsonValue };

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

function parseFencedJson(text: string): ParsedJsonValue {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) {
    return null;
  }
  const lines = trimmed.split("\n");
  if (lines.length < 2) {
    return null;
  }
  const body = lines.slice(1, -1).join("\n").trim();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function coerceConfidence(value: unknown, fallback = 0.86): number {
  if (typeof value === "number" && value >= 0 && value <= 1) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "high") {
      return 0.92;
    }
    if (normalized === "medium") {
      return 0.72;
    }
    if (normalized === "low") {
      return 0.45;
    }
  }
  return fallback;
}

function ensureSentence(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    return normalized;
  }
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function defaultScope(subjectType: AtomicCandidate["scope"]["subject_type"] = "unknown") {
  return {
    subject_type: subjectType,
    subject_id: null,
    project_id: null,
    workspace_id: null,
    applies_to: "global" as const,
  };
}

function parseProjectFactStatement(statement: string): {
  subject: string;
  predicate: string;
  object: string;
} {
  const normalized = statement
    .replace(/^that\s+/iu, "")
    .replace(/^the\s+/iu, "")
    .trim();
  const match = normalized.match(
    /^(.+?)\s+(is|are|was|were|uses|use|validates|validate|includes|include|focuses on|focused on)\s+(.+)$/iu,
  );
  if (!match) {
    return {
      subject: "current project",
      predicate: "has durable fact",
      object: normalized,
    };
  }
  return {
    subject: match[1].trim(),
    predicate: match[2].trim(),
    object: match[3].trim(),
  };
}

function buildExplicitProjectFactCandidate(
  routedCandidate: AtomicRoutedCandidate,
): AtomicCandidate | null {
  const command = parseExplicitMemoryCommand(routedCandidate.text);
  if (command?.commandType !== "project_fact") {
    return null;
  }
  const parsed = parseProjectFactStatement(command.statement);
  return AtomicCandidateSchema.parse({
    candidate_id: `det-project-fact:${routedCandidate.segment_id}`,
    source_segment_id: routedCandidate.segment_id,
    kind: "claim",
    raw_statement: ensureSentence(command.statement),
    normalized_statement: ensureSentence(command.statement),
    evidence_quote: routedCandidate.text,
    source_grounding: "explicit",
    scope: {
      subject_type: "project",
      subject_id: "current_project",
      project_id: null,
      workspace_id: null,
      applies_to: "current_workspace",
    },
    payload: {
      payload_type: "claim",
      claim_type: "project_fact",
      subject: parsed.subject,
      predicate: parsed.predicate,
      object: parsed.object,
      qualifiers: [],
      temporal_status: "currently_true",
    },
    confidence: 0.9,
    risk_flags: ["none"],
  });
}

function buildExplicitCorrectionPreferenceCandidate(
  routedCandidate: AtomicRoutedCandidate,
): AtomicCandidate | null {
  const command = parseExplicitMemoryCommand(routedCandidate.text);
  if (command?.commandType !== "correction_preference") {
    return null;
  }
  return AtomicCandidateSchema.parse({
    candidate_id: `det-correction-preference:${routedCandidate.segment_id}`,
    source_segment_id: routedCandidate.segment_id,
    kind: "claim",
    raw_statement: ensureSentence(`The user prefers ${command.preferenceObject}`),
    normalized_statement: ensureSentence(`The user prefers ${command.preferenceObject}`),
    evidence_quote: routedCandidate.text,
    source_grounding: "explicit",
    scope: {
      subject_type: "user",
      subject_id: "user",
      project_id: null,
      workspace_id: null,
      applies_to: "current_workspace",
    },
    payload: {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: command.preferenceObject,
      qualifiers: [],
      temporal_status: "currently_true",
    },
    confidence: 0.9,
    risk_flags: ["none"],
  });
}

function inferSubjectType(value: unknown): AtomicCandidate["scope"]["subject_type"] {
  if (
    value === "user" ||
    value === "assistant" ||
    value === "project" ||
    value === "workspace" ||
    value === "organization" ||
    value === "external_entity" ||
    value === "system"
  ) {
    return value;
  }
  return "unknown";
}

function buildDeterministicAtomicCandidate(
  routedCandidate: AtomicRoutedCandidate,
): AtomicCandidate | null {
  const explicitProjectFact = buildExplicitProjectFactCandidate(routedCandidate);
  if (explicitProjectFact) {
    return explicitProjectFact;
  }

  const explicitCorrectionPreference = buildExplicitCorrectionPreferenceCandidate(routedCandidate);
  if (explicitCorrectionPreference) {
    return explicitCorrectionPreference;
  }

  const parsed = parseFencedJson(routedCandidate.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const source = parsed as Record<string, unknown>;
  const kind =
    typeof source.kind === "string"
      ? source.kind
      : source.payload &&
          typeof source.payload === "object" &&
          !Array.isArray(source.payload) &&
          typeof (source.payload as Record<string, unknown>).payload_type === "string"
        ? (source.payload as Record<string, unknown>).payload_type
        : null;

  if (kind === "claim") {
    const subject =
      typeof source.subject === "string"
        ? source.subject
        : typeof source.payload === "object" &&
            source.payload !== null &&
            typeof (source.payload as Record<string, unknown>).subject === "string"
          ? ((source.payload as Record<string, unknown>).subject as string)
          : "unknown";
    const predicate =
      typeof source.predicate === "string"
        ? source.predicate
        : typeof source.payload === "object" &&
            source.payload !== null &&
            typeof (source.payload as Record<string, unknown>).predicate === "string"
          ? ((source.payload as Record<string, unknown>).predicate as string)
          : "states";
    const object =
      typeof source.object === "string"
        ? source.object
        : typeof source.payload === "object" &&
            source.payload !== null &&
            typeof (source.payload as Record<string, unknown>).object === "string"
          ? ((source.payload as Record<string, unknown>).object as string)
          : "";
    const rawStatement =
      typeof source.content === "string"
        ? source.content
        : `${subject} ${predicate} ${object}`.trim();
    return AtomicCandidateSchema.parse({
      candidate_id: `det-atomic:${routedCandidate.segment_id}`,
      source_segment_id: routedCandidate.segment_id,
      kind: "claim",
      raw_statement: ensureSentence(rawStatement),
      normalized_statement: ensureSentence(rawStatement),
      evidence_quote: routedCandidate.text,
      source_grounding: "explicit",
      scope: defaultScope(inferSubjectType(subject)),
      payload: {
        payload_type: "claim",
        claim_type:
          source.claim_type === "preference_state" ||
          source.claim_type === "identity" ||
          source.claim_type === "relationship" ||
          source.claim_type === "project_fact" ||
          source.claim_type === "tool_fact" ||
          source.claim_type === "environment_fact" ||
          source.claim_type === "decision" ||
          source.claim_type === "capability" ||
          source.claim_type === "constraint_state" ||
          source.claim_type === "other"
            ? source.claim_type
            : "other",
        subject,
        predicate,
        object,
        qualifiers: [],
        temporal_status: "currently_true",
      },
      confidence: coerceConfidence(source.confidence),
      risk_flags: ["none"],
    });
  }

  if (kind === "directive") {
    const payload =
      typeof source.payload === "object" &&
      source.payload !== null &&
      !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : source;
    const action =
      typeof payload.action === "string"
        ? payload.action
        : typeof source.content === "string"
          ? source.content
          : "Follow the directive";
    const trigger = typeof payload.trigger === "string" ? payload.trigger : "general_response";
    return AtomicCandidateSchema.parse({
      candidate_id: `det-atomic:${routedCandidate.segment_id}`,
      source_segment_id: routedCandidate.segment_id,
      kind: "directive",
      raw_statement: ensureSentence(typeof source.content === "string" ? source.content : action),
      normalized_statement: ensureSentence(
        typeof source.content === "string" ? source.content : action,
      ),
      evidence_quote: routedCandidate.text,
      source_grounding: "explicit",
      scope: defaultScope("assistant"),
      payload: {
        payload_type: "directive",
        directive_type:
          payload.directive_type === "response_style" ||
          payload.directive_type === "tool_use" ||
          payload.directive_type === "workflow_behavior" ||
          payload.directive_type === "safety_constraint" ||
          payload.directive_type === "communication" ||
          payload.directive_type === "coding_style" ||
          payload.directive_type === "formatting" ||
          payload.directive_type === "privacy" ||
          payload.directive_type === "project_rule" ||
          payload.directive_type === "other"
            ? payload.directive_type
            : "other",
        authority:
          payload.authority === "user" ||
          payload.authority === "system" ||
          payload.authority === "developer" ||
          payload.authority === "organization" ||
          payload.authority === "assistant_inferred" ||
          payload.authority === "unknown"
            ? payload.authority
            : "unknown",
        target:
          payload.target === "assistant" ||
          payload.target === "user" ||
          payload.target === "project" ||
          payload.target === "team" ||
          payload.target === "tool" ||
          payload.target === "system" ||
          payload.target === "unknown"
            ? payload.target
            : "assistant",
        strength:
          payload.strength === "hard_constraint" ||
          payload.strength === "soft_default" ||
          payload.strength === "situational_instruction" ||
          payload.strength === "style_preference" ||
          payload.strength === "unknown"
            ? payload.strength
            : "unknown",
        trigger,
        action,
        exceptions: Array.isArray(payload.exceptions)
          ? payload.exceptions.filter((value): value is string => typeof value === "string")
          : [],
        overridable: typeof payload.overridable === "boolean" ? payload.overridable : true,
        derived_from_claim_candidate_ids: Array.isArray(payload.derived_from_claim_candidate_ids)
          ? payload.derived_from_claim_candidate_ids.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      },
      confidence: coerceConfidence(source.confidence),
      risk_flags: ["none"],
    });
  }

  if (kind === "source_ref") {
    const payload =
      typeof source.payload === "object" &&
      source.payload !== null &&
      !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : source;
    const locator = typeof payload.locator === "string" ? payload.locator : "";
    const label = typeof payload.label === "string" ? payload.label : locator;
    const rawStatement = typeof source.content === "string" ? source.content : label || locator;
    return AtomicCandidateSchema.parse({
      candidate_id: `det-atomic:${routedCandidate.segment_id}`,
      source_segment_id: routedCandidate.segment_id,
      kind: "source_ref",
      raw_statement: ensureSentence(rawStatement),
      normalized_statement: ensureSentence(rawStatement),
      evidence_quote: routedCandidate.text,
      source_grounding: "explicit",
      scope: defaultScope("unknown"),
      payload: {
        payload_type: "source_ref",
        ref_type:
          payload.ref_type === "url" ||
          payload.ref_type === "file_path" ||
          payload.ref_type === "repo_path" ||
          payload.ref_type === "document_title" ||
          payload.ref_type === "ticket" ||
          payload.ref_type === "person" ||
          payload.ref_type === "email_thread" ||
          payload.ref_type === "calendar_event" ||
          payload.ref_type === "database_record" ||
          payload.ref_type === "unknown"
            ? payload.ref_type
            : "unknown",
        locator,
        label,
        access_hint: typeof payload.access_hint === "string" ? payload.access_hint : null,
        when_to_use:
          typeof payload.when_to_use === "string"
            ? payload.when_to_use
            : "Consult this reference when needed.",
      },
      confidence: coerceConfidence(source.confidence),
      risk_flags: ["none"],
    });
  }

  if (kind === "episode") {
    const payload =
      typeof source.payload === "object" &&
      source.payload !== null &&
      !Array.isArray(source.payload)
        ? (source.payload as Record<string, unknown>)
        : source;
    const actor = typeof payload.actor === "string" ? payload.actor : "unknown";
    const action = typeof payload.action === "string" ? payload.action : "acted";
    const object = typeof payload.object === "string" ? payload.object : "";
    const outcome = typeof payload.outcome === "string" ? payload.outcome : "unknown";
    const rawStatement =
      typeof source.content === "string" ? source.content : `${actor} ${action} ${object}`.trim();
    return AtomicCandidateSchema.parse({
      candidate_id: `det-atomic:${routedCandidate.segment_id}`,
      source_segment_id: routedCandidate.segment_id,
      kind: "episode",
      raw_statement: ensureSentence(rawStatement),
      normalized_statement: ensureSentence(rawStatement),
      evidence_quote: routedCandidate.text,
      source_grounding: "explicit",
      scope: defaultScope("unknown"),
      payload: {
        payload_type: "episode",
        event_type:
          payload.event_type === "decision_made" ||
          payload.event_type === "task_completed" ||
          payload.event_type === "task_failed" ||
          payload.event_type === "preference_changed" ||
          payload.event_type === "instruction_given" ||
          payload.event_type === "meeting_happened" ||
          payload.event_type === "artifact_created" ||
          payload.event_type === "artifact_updated" ||
          payload.event_type === "other"
            ? payload.event_type
            : "other",
        actor,
        action,
        object,
        outcome,
        event_time: typeof payload.event_time === "string" ? payload.event_time : null,
      },
      confidence: coerceConfidence(source.confidence),
      risk_flags: ["none"],
    });
  }

  return null;
}

function shouldSkipSchemaHeavyAtomicCandidate(routedCandidate: AtomicRoutedCandidate): boolean {
  if (routedCandidate.detected_shape === "code_block") {
    return true;
  }
  return isSchemaLikeText(routedCandidate.text);
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
  const repairedErrors = validateAtomic(parsed.data, input.routedCandidates);
  if (repairedErrors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 atomic extraction repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return parsed.data;
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
  const deterministicCandidates: AtomicCandidate[] = [];
  const modelRoutedCandidates: AtomicRoutedCandidate[] = [];
  for (const routedCandidate of input.routedCandidates) {
    const deterministic = buildDeterministicAtomicCandidate(routedCandidate);
    if (deterministic) {
      deterministicCandidates.push(deterministic);
      continue;
    }
    if (shouldSkipSchemaHeavyAtomicCandidate(routedCandidate)) {
      continue;
    }
    modelRoutedCandidates.push(routedCandidate);
  }
  if (modelRoutedCandidates.length === 0) {
    return {
      schema_version: "atomic_extraction.v1",
      event_id: input.rawEvent.event_id,
      atomic_candidates: deterministicCandidates,
    };
  }
  const prompt = buildAtomicExtractionPrompt({
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
  const parsed = AtomicExtractionBatchSchema.safeParse(
    normalizeAtomicPayload(extractBatch(result), input.rawEvent.event_id),
  );
  if (!parsed.success) {
    const repaired = await repairAtomicExtraction({
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
      atomic_candidates: [...deterministicCandidates, ...repaired.atomic_candidates],
    };
  }
  const combined = {
    ...parsed.data,
    atomic_candidates: [...deterministicCandidates, ...parsed.data.atomic_candidates],
  };
  const errors = validateAtomic(combined, input.routedCandidates);
  if (errors.length > 0) {
    const repaired = await repairAtomicExtraction({
      ...input,
      routedCandidates: modelRoutedCandidates,
      previousPayload: parsed.data,
      validationErrors: errors,
    });
    return {
      ...repaired,
      atomic_candidates: [...deterministicCandidates, ...repaired.atomic_candidates],
    };
  }
  return combined;
}
