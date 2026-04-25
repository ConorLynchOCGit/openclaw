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
import { parseExplicitMemoryCommand } from "./explicit-memory-command.ts";
import {
  buildCaptureRoutingPrompt,
  buildPromptRawEventMetadata,
  buildRepairPrompt,
  type MmV2PromptResponseMode,
} from "./prompt-contracts.ts";
import { assessStructuredArtifactIntent, isSchemaLikeText } from "./structural-artifact-intent.ts";
import { parseStructuredList, stripListMarker } from "./structural-markdown.ts";

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

function nonBlankLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function startsWithListMarker(text: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(text);
}

function isPrimaryRoutingSegment(segment: SegmentedIngestSegment): boolean {
  return segment.detected_shape !== "sentence";
}

function isFrontMatterSegment(segment: SegmentedIngestSegment): boolean {
  const trimmed = segment.text.trim();
  return segment.start_char === 0 && /^---\s*\n[\s\S]*\n---$/.test(trimmed);
}

function isLabelOnlySegment(segment: SegmentedIngestSegment): boolean {
  const lines = nonBlankLines(segment.text);
  return (
    lines.length === 1 &&
    lines[0].endsWith(":") &&
    !lines[0].startsWith("#") &&
    !lines[0].startsWith("-") &&
    !/^\d+[.)]\s/.test(lines[0])
  );
}

function isBacktickOnlyItem(line: string): boolean {
  return /^`[^`]+`$/.test(line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim());
}

function isObviousFileListSegment(segment: SegmentedIngestSegment): boolean {
  if (
    segment.detected_shape !== "bullet_list_block" &&
    segment.detected_shape !== "numbered_list_block"
  ) {
    return false;
  }
  const lines = segment.text.split("\n").filter((line) => line.trim().length > 0);
  return lines.length > 0 && lines.every((line) => isBacktickOnlyItem(line));
}

function isFencedCodeSegment(segment: SegmentedIngestSegment): boolean {
  const trimmed = segment.text.trim();
  return trimmed.startsWith("```") && trimmed.endsWith("```");
}

function extractFenceBody(segment: SegmentedIngestSegment): string {
  return segment.text
    .trim()
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n```$/, "")
    .trim();
}

function isCommandLikeLine(line: string): boolean {
  return /^(?:[$>#]\s*)?(pnpm|npm|node|git|bash|sh|curl|yarn|npx)\b/.test(line.trim());
}

function isCommandBlockSegment(segment: SegmentedIngestSegment): boolean {
  const trimmed = segment.text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const lines = nonBlankLines(
    isFencedCodeSegment(segment) ? extractFenceBody(segment) : segment.text,
  );
  return lines.length > 0 && lines.every(isCommandLikeLine);
}

function containsStructuredList(text: string): boolean {
  return parseStructuredList(text) !== null;
}

function isShortListIntroParagraph(segment: SegmentedIngestSegment): boolean {
  const trimmed = segment.text.trim();
  return (
    segment.detected_shape === "paragraph" &&
    trimmed.endsWith(":") &&
    trimmed.length <= 140 &&
    startsWithListMarker(segment.local_context_after)
  );
}

function normalizedSegmentText(segment: SegmentedIngestSegment): string {
  return segment.text.replace(/\s+/gu, " ").trim();
}

function isSimpleProseShape(segment: SegmentedIngestSegment): boolean {
  return (
    segment.detected_shape === "paragraph" ||
    (segment.detected_shape === "heading_plus_body" && !containsStructuredList(segment.text))
  );
}

function isSmalltalkSegment(segment: SegmentedIngestSegment): boolean {
  if (!isSimpleProseShape(segment)) {
    return false;
  }
  return (
    /^(?:thanks|thank you)(?: for [^.?!]+)?[.!?]*$/iu.test(normalizedSegmentText(segment)) ||
    /^(?:sounds good|got it|okay|ok|cool)[.!?]*$/iu.test(normalizedSegmentText(segment))
  );
}

function isExplicitPreferenceStatement(segment: SegmentedIngestSegment): boolean {
  return (
    isSimpleProseShape(segment) &&
    /\bi (?:prefer|like|usually want|want)\b/iu.test(normalizedSegmentText(segment))
  );
}

function isTemporaryResponseInstructionSegment(segment: SegmentedIngestSegment): boolean {
  return (
    isSimpleProseShape(segment) &&
    /\b(?:for this answer|for this response|current session only|this session only)\b/iu.test(
      normalizedSegmentText(segment),
    )
  );
}

function isNoStoreOrPrivacyOptOutSegment(segment: SegmentedIngestSegment): boolean {
  if (!isSimpleProseShape(segment)) {
    return false;
  }
  const normalized = normalizedSegmentText(segment);
  return (
    /\b(?:do not|don't|never)\s+(?:store|remember|persist|save)\b/iu.test(normalized) ||
    /\bno[-\s]?store\b/iu.test(normalized) ||
    /\b(?:privacy|private)\s+(?:test|phrase|sentence|content|note)\b/iu.test(normalized)
  );
}

function isSourcePointerSegment(segment: SegmentedIngestSegment): boolean {
  if (!isSimpleProseShape(segment)) {
    return false;
  }
  return /https?:\/\/|\/[A-Za-z0-9._/-]+/u.test(normalizedSegmentText(segment));
}

function isAssistantBehaviorInstructionSegment(segment: SegmentedIngestSegment): boolean {
  if (!isSimpleProseShape(segment)) {
    return false;
  }
  const normalized = normalizedSegmentText(segment);
  const startsLikeInstruction =
    /^(?:use|avoid|do not|don't|never|always|keep|write|respond|format|give|ask|continue|figure|solve|inspect|check|when|if)\b/iu.test(
      normalized,
    ) || /\b(?:should|must|need to|prefer you to|want you to)\b/iu.test(normalized);
  if (!startsLikeInstruction) {
    return false;
  }
  return /\b(?:answer|response|instructions?|format|bullets?|numbered|steps?|ask|continue|blocker|blocked|schema|tool|permission|credentials?|migration|safe path|reasonable path|solvable)\b/iu.test(
    normalized,
  );
}

function isExplicitMemoryCommandSegment(segment: SegmentedIngestSegment): boolean {
  return isSimpleProseShape(segment) && parseExplicitMemoryCommand(segment.text) !== null;
}

function isAbstractExplanatoryListItem(line: string): boolean {
  const item = stripListMarker(line);
  return /^(?:how|why|what|whether|when)\b/i.test(item) && !/[.!?]$/.test(item);
}

function isExplanatoryBulletListSegment(segment: SegmentedIngestSegment): boolean {
  if (segment.detected_shape !== "bullet_list_block") {
    return false;
  }
  const items = nonBlankLines(segment.text);
  const intro = segment.local_context_before.trim();
  return (
    items.length >= 2 &&
    intro.endsWith(":") &&
    intro.length <= 140 &&
    items.every(isAbstractExplanatoryListItem)
  );
}

function isStrongDeterministicBulletArtifact(segment: SegmentedIngestSegment): boolean {
  const assessment = assessStructuredArtifactIntent(segment);
  return assessment?.parsedList.kind === "bullet" && assessment.decision === "promote";
}

function buildStructuredListDecision(
  segment: SegmentedIngestSegment,
): CaptureRoutingDecision | null {
  const assessment = assessStructuredArtifactIntent(segment);
  if (!assessment) {
    return null;
  }

  if (assessment.signals.itemCount < 2) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Single list item is not a durable composite artifact.",
      memoryLikelihood: 0.12,
      durabilityLikelihood: 0.08,
      compositeLikelihood: 0.04,
      reasonCodes: ["not_memory"],
      confidence: 0.95,
      evidenceQuote: segment.text,
    });
  }

  if (assessment.decision === "suppress") {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "List-shaped prose lacks strong reusable artifact intent.",
      memoryLikelihood: 0.08,
      durabilityLikelihood: 0.05,
      compositeLikelihood: Math.min(assessment.score, 0.18),
      reasonCodes: ["not_memory"],
      confidence: 0.92,
      evidenceQuote: segment.text,
    });
  }

  if (assessment.decision === "model") {
    return null;
  }

  if (assessment.parsedList.kind === "numbered") {
    return buildDeterministicDecision({
      segment,
      route: "composite_candidate",
      candidateSummary: "Ordered list likely represents a reusable procedure or checklist.",
      memoryLikelihood: 0.82,
      durabilityLikelihood: 0.66,
      compositeLikelihood: 0.98,
      reasonCodes: ["ordered_steps", "workflow_or_runbook"],
      confidence: Math.max(assessment.score, 0.9),
      evidenceQuote: segment.text,
    });
  }

  if (isStrongDeterministicBulletArtifact(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "composite_candidate",
      candidateSummary: "Structured bullet list with clear artifact framing.",
      memoryLikelihood: 0.74,
      durabilityLikelihood: 0.6,
      compositeLikelihood: 0.94,
      reasonCodes: ["checklist"],
      confidence: Math.max(assessment.score, 0.88),
      evidenceQuote: segment.text,
    });
  }
  return null;
}

function buildDeterministicDecision(input: {
  segment: SegmentedIngestSegment;
  route: CaptureRoutingDecision["route"];
  candidateSummary: string;
  memoryLikelihood: number;
  durabilityLikelihood: number;
  compositeLikelihood: number;
  reasonCodes: CaptureRoutingDecision["reason_codes"];
  confidence: number;
  evidenceQuote?: string;
}): CaptureRoutingDecision {
  return {
    segment_id: input.segment.segment_id,
    route: input.route,
    candidate_summary: input.candidateSummary,
    memory_likelihood: input.memoryLikelihood,
    durability_likelihood: input.durabilityLikelihood,
    composite_likelihood: input.compositeLikelihood,
    reason_codes: input.reasonCodes,
    evidence_quote: input.evidenceQuote ?? input.segment.text,
    confidence: input.confidence,
  };
}

function classifyDeterministically(segment: SegmentedIngestSegment): CaptureRoutingDecision | null {
  const trimmed = segment.text.trim();

  if (isFrontMatterSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Document front matter only.",
      memoryLikelihood: 0.02,
      durabilityLikelihood: 0.01,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 0.98,
      evidenceQuote: segment.text,
    });
  }

  if (isLabelOnlySegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Section label only.",
      memoryLikelihood: 0.05,
      durabilityLikelihood: 0.03,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 0.92,
      evidenceQuote: segment.text,
    });
  }

  if (isShortListIntroParagraph(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Short list-intro paragraph only.",
      memoryLikelihood: 0.06,
      durabilityLikelihood: 0.03,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 0.94,
      evidenceQuote: segment.text,
    });
  }

  if (isCommandBlockSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Command block used for execution, not durable memory.",
      memoryLikelihood: 0.05,
      durabilityLikelihood: 0.02,
      compositeLikelihood: 0,
      reasonCodes: ["temporary_context"],
      confidence: 0.96,
      evidenceQuote: segment.text,
    });
  }

  if (isFencedCodeSegment(segment)) {
    const body = extractFenceBody(segment);
    if (isSchemaLikeText(body)) {
      return buildDeterministicDecision({
        segment,
        route: "ignore",
        candidateSummary:
          "Schema-heavy fenced block treated as reference material, not prose extraction input.",
        memoryLikelihood: 0.04,
        durabilityLikelihood: 0.03,
        compositeLikelihood: 0.02,
        reasonCodes: ["not_memory"],
        confidence: 0.97,
        evidenceQuote: segment.text,
      });
    }
    if (
      /"unit_type"\s*:\s*"composite"|"artifact_type"\s*:\s*"(?:procedure|checklist|profile|project_state|decision_record|source_bundle|lesson_pack)"/.test(
        body,
      )
    ) {
      return buildDeterministicDecision({
        segment,
        route: "composite_candidate",
        candidateSummary: "Structured JSON example of a composite memory artifact.",
        memoryLikelihood: 0.82,
        durabilityLikelihood: 0.7,
        compositeLikelihood: 0.98,
        reasonCodes: ["workflow_or_runbook"],
        confidence: 0.94,
        evidenceQuote: segment.text,
      });
    }
    if (
      /"kind"\s*:\s*"(?:claim|directive|source_ref|episode)"|"payload_type"\s*:\s*"(?:claim|directive|source_ref|episode)"/.test(
        body,
      )
    ) {
      return buildDeterministicDecision({
        segment,
        route: "atomic_candidate",
        candidateSummary: "Structured JSON example of an atomic memory object.",
        memoryLikelihood: 0.8,
        durabilityLikelihood: 0.68,
        compositeLikelihood: 0.05,
        reasonCodes: ["durable_project_fact"],
        confidence: 0.93,
        evidenceQuote: segment.text,
      });
    }
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Unclassified code fence content.",
      memoryLikelihood: 0.08,
      durabilityLikelihood: 0.05,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 0.9,
      evidenceQuote: segment.text,
    });
  }

  if (isObviousFileListSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "File and symbol reference list only.",
      memoryLikelihood: 0.12,
      durabilityLikelihood: 0.08,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 0.95,
      evidenceQuote: segment.text,
    });
  }

  if (isExplanatoryBulletListSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Explanatory bullet list, not a reusable composite artifact.",
      memoryLikelihood: 0.08,
      durabilityLikelihood: 0.04,
      compositeLikelihood: 0.06,
      reasonCodes: ["not_memory"],
      confidence: 0.93,
      evidenceQuote: segment.text,
    });
  }

  if (isSmalltalkSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Short social acknowledgment only.",
      memoryLikelihood: 0.02,
      durabilityLikelihood: 0.01,
      compositeLikelihood: 0,
      reasonCodes: ["smalltalk"],
      confidence: 0.97,
      evidenceQuote: segment.text,
    });
  }

  if (isNoStoreOrPrivacyOptOutSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Explicit no-store or privacy opt-out instruction.",
      memoryLikelihood: 0.18,
      durabilityLikelihood: 0.01,
      compositeLikelihood: 0,
      reasonCodes: ["explicit_no_store", "privacy_opt_out", "ambiguous"],
      confidence: 0.98,
      evidenceQuote: segment.text,
    });
  }

  if (isExplicitMemoryCommandSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Explicit user memory command.",
      memoryLikelihood: 0.9,
      durabilityLikelihood: 0.82,
      compositeLikelihood: 0.04,
      reasonCodes: ["durable_project_fact", "explicit_user_preference"],
      confidence: 0.9,
      evidenceQuote: segment.text,
    });
  }

  if (isExplicitPreferenceStatement(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Explicit preference statement.",
      memoryLikelihood: 0.84,
      durabilityLikelihood: 0.72,
      compositeLikelihood: 0.04,
      reasonCodes: ["explicit_user_preference"],
      confidence: 0.82,
      evidenceQuote: segment.text,
    });
  }

  if (isTemporaryResponseInstructionSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Temporary response instruction.",
      memoryLikelihood: 0.62,
      durabilityLikelihood: 0.12,
      compositeLikelihood: 0.02,
      reasonCodes: ["temporary_context"],
      confidence: 0.8,
      evidenceQuote: segment.text,
    });
  }

  if (isAssistantBehaviorInstructionSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Assistant behavior instruction.",
      memoryLikelihood: 0.78,
      durabilityLikelihood: 0.65,
      compositeLikelihood: 0.04,
      reasonCodes: ["assistant_behavior_instruction", "explicit_user_preference"],
      confidence: 0.82,
      evidenceQuote: segment.text,
    });
  }

  if (isSourcePointerSegment(segment)) {
    return buildDeterministicDecision({
      segment,
      route: "atomic_candidate",
      candidateSummary: "Specific source pointer or locator.",
      memoryLikelihood: 0.78,
      durabilityLikelihood: 0.7,
      compositeLikelihood: 0.04,
      reasonCodes: ["source_pointer"],
      confidence: 0.84,
      evidenceQuote: segment.text,
    });
  }

  if (
    (segment.detected_shape === "paragraph" || segment.detected_shape === "heading_plus_body") &&
    isSchemaLikeText(segment.text) &&
    !containsStructuredList(segment.text)
  ) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Schema-dense reference material suppressed before prose extraction.",
      memoryLikelihood: 0.04,
      durabilityLikelihood: 0.03,
      compositeLikelihood: 0.02,
      reasonCodes: ["not_memory"],
      confidence: 0.95,
      evidenceQuote: segment.text,
    });
  }

  if (
    segment.detected_shape === "numbered_list_block" ||
    segment.detected_shape === "bullet_list_block" ||
    (segment.detected_shape === "heading_plus_body" && containsStructuredList(segment.text))
  ) {
    return buildStructuredListDecision(segment);
  }

  if (trimmed.length === 0) {
    return buildDeterministicDecision({
      segment,
      route: "ignore",
      candidateSummary: "Empty segment.",
      memoryLikelihood: 0,
      durabilityLikelihood: 0,
      compositeLikelihood: 0,
      reasonCodes: ["not_memory"],
      confidence: 1,
      evidenceQuote: segment.text,
    });
  }

  return null;
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

function applyDeterministicOverrides(
  batch: CaptureRoutingBatch,
  segmented: SegmentedIngestEvent,
): CaptureRoutingBatch {
  const segmentById = new Map(segmented.segments.map((segment) => [segment.segment_id, segment]));
  return {
    ...batch,
    routing_decisions: batch.routing_decisions.map((decision) => {
      const segment = segmentById.get(decision.segment_id);
      const shape = segment?.detected_shape;
      const structuralDecision = segment ? buildStructuredListDecision(segment) : null;
      if (
        (shape === "numbered_list_block" ||
          shape === "bullet_list_block" ||
          shape === "heading_plus_body") &&
        decision.route === "atomic_candidate" &&
        (structuralDecision?.route === "composite_candidate" ||
          decision.reason_codes.some((code) =>
            ["ordered_steps", "checklist", "workflow_or_runbook"].includes(code),
          )) &&
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
      const coverageErrors = validateCoverage(sanitized, segmented);
      const evidenceErrors = validateEvidence(sanitized, segmented);
      if (coverageErrors.length === 0 && evidenceErrors.length === 0) {
        return applyDeterministicOverrides(sanitized, segmented);
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
        return buildRoutingRepairSkipBatch(input, segmented);
      }
      throw error;
    }
  }

  const coverageErrors = validateCoverage(parsed.data, segmented);
  const evidenceErrors = validateEvidence(parsed.data, segmented);
  const validationErrors = [...coverageErrors, ...evidenceErrors];
  if (validationErrors.length > 0) {
    try {
      return await repairCaptureRouting({
        ...input,
        segmented,
        previousPayload: parsed.data,
        validationErrors,
      });
    } catch (error) {
      if (error instanceof JsonModelOutputError) {
        return buildRoutingRepairSkipBatch(input, segmented);
      }
      throw error;
    }
  }

  return applyDeterministicOverrides(parsed.data, segmented);
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

function shouldRouteDirectlyToAtomicInRuntime(segment: SegmentedIngestSegment): boolean {
  return (
    (segment.detected_shape === "paragraph" ||
      (segment.detected_shape === "heading_plus_body" && !containsStructuredList(segment.text))) &&
    segment.text.trim().length > 0 &&
    !isSchemaLikeText(segment.text)
  );
}

function buildRoutingRepairSkipBatch(
  input: RoutingInput,
  segmented: SegmentedIngestEvent,
): CaptureRoutingBatch {
  return {
    schema_version: "capture_routing.v1",
    event_id: input.rawEvent.event_id,
    routing_decisions: segmented.segments.map((segment) =>
      buildDeterministicDecision({
        segment,
        route: "ignore",
        candidateSummary: "Capture routing repair failed; skipped capture safely.",
        memoryLikelihood: 0,
        durabilityLikelihood: 0,
        compositeLikelihood: 0,
        reasonCodes: ["not_memory"],
        confidence: 1,
        evidenceQuote: segment.text,
      }),
    ),
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
      const coverageErrors = validateCoverage(sanitized, input.segmented);
      const evidenceErrors = validateEvidence(sanitized, input.segmented);
      if (coverageErrors.length === 0 && evidenceErrors.length === 0) {
        return applyDeterministicOverrides(sanitized, input.segmented);
      }
    }
    throw new JsonModelOutputError(
      "invalid MMV2 capture routing repair output",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  const coverageErrors = validateCoverage(parsed.data, input.segmented);
  const evidenceErrors = validateEvidence(parsed.data, input.segmented);
  const validationErrors = [...coverageErrors, ...evidenceErrors];
  if (validationErrors.length > 0) {
    throw new JsonModelOutputError(
      "invalid MMV2 capture routing repair semantics",
      prompt.contract,
      JSON.stringify(extractBatch(result)),
    );
  }
  return applyDeterministicOverrides(parsed.data, input.segmented);
}

export async function routeCaptureCandidates(input: RoutingInput): Promise<CaptureRoutingBatch> {
  const primarySegments = input.segmented.segments.filter(isPrimaryRoutingSegment);
  const deterministicDecisions: CaptureRoutingDecision[] = [];
  const modelSegments: SegmentedIngestSegment[] = [];

  for (const segment of primarySegments) {
    const decision = classifyDeterministically(segment);
    if (decision) {
      deterministicDecisions.push(decision);
      continue;
    }
    modelSegments.push(segment);
  }

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
    routing_decisions: sortRoutingDecisions(
      [...deterministicDecisions, ...modelDecisions],
      input.segmented,
    ),
  };
}

export async function routeCaptureCandidatesRuntime(
  input: RoutingInput,
): Promise<CaptureRoutingBatch> {
  const primarySegments = input.segmented.segments.filter(isPrimaryRoutingSegment);
  const deterministicDecisions: CaptureRoutingDecision[] = [];
  const modelSegments: SegmentedIngestSegment[] = [];

  for (const segment of primarySegments) {
    const decision = classifyDeterministically(segment);
    if (decision) {
      deterministicDecisions.push(decision);
      continue;
    }
    if (shouldRouteDirectlyToAtomicInRuntime(segment)) {
      deterministicDecisions.push(
        buildDeterministicDecision({
          segment,
          route: "atomic_candidate",
          candidateSummary:
            "Primary prose block sent directly to atomic extraction in the runtime lane.",
          memoryLikelihood: 0.56,
          durabilityLikelihood: 0.48,
          compositeLikelihood: 0.08,
          reasonCodes: ["ambiguous"],
          confidence: 0.55,
          evidenceQuote: segment.text,
        }),
      );
      continue;
    }
    modelSegments.push(segment);
  }

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
    routing_decisions: sortRoutingDecisions(
      [...deterministicDecisions, ...modelDecisions],
      input.segmented,
    ),
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
      allow_multiple_top_level_atomic: allowed.has(segment.segment_id),
    });
  }

  return {
    schema_version: "capture_routing.v1",
    event_id: input.routing.event_id,
    routed_candidates: routedCandidates,
  };
}
