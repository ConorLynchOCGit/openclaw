import { createModelContractMetadata } from "../prompt-contracts.ts";
import type { SemanticExtractionPrompt } from "../semantic-interpreter.ts";
import type {
  AtomicCandidate,
  CanonicalCandidate,
  RawIngestEvent,
  SegmentedIngestEvent,
} from "./contracts.ts";

const CLASSIFIER_BASELINE = [
  'Do not use "preference" as a top-level kind.',
  "",
  "Classify by semantic role:",
  "- claim: describes something true/false.",
  "- directive: tells the assistant/system/user how to behave in the future.",
  "- source_ref: points to a resource to consult.",
  "- episode: records something that happened.",
  "- composite: contains multiple dependent components and must be represented as an artifact.",
  "",
  'A user preference stated as "I like/prefer/want X" is usually a claim about the user.',
  'A user preference stated as "Use/default/always/avoid X" is a directive.',
  "If a descriptive preference should guide behavior, emit a claim and optionally a derived directive, linked by derived_from.",
  "",
  "Never emit child steps of a procedure as standalone global memories unless the child is useful outside the procedure.",
  "For composite spans, create a parent artifact and mark child components as embedded_only, global, both, or blocked.",
].join("\n");

function buildPrompt(
  modelId: string,
  contractVersion: string,
  systemPrompt: string,
  userPayload: unknown,
): SemanticExtractionPrompt {
  return {
    contract: createModelContractMetadata({
      contractName: "semantic_extraction",
      contractVersion,
      modelId,
    }),
    responseFormat: "json",
    systemPrompt,
    userPrompt: JSON.stringify(userPayload),
  };
}

export function buildCaptureRoutingPrompt(input: {
  modelId: string;
  rawEvent: RawIngestEvent;
  segmented: SegmentedIngestEvent;
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-capture-routing-v1",
    [
      CLASSIFIER_BASELINE,
      "You are Durable Memory Capture Router v1.",
      "Your job is to decide whether each provided text segment should be routed for durable memory extraction.",
      "Return only JSON matching the supplied schema.",
      "",
      "Definitions:",
      "ignore: no durable memory value.",
      "atomic_candidate: one or more standalone durable memory candidates.",
      "composite_candidate: a multi-part artifact such as a procedure, checklist, workflow, runbook, project state, decision record, source bundle, profile, or lesson pack.",
      "needs_more_context: may contain durable memory but text alone is insufficient.",
      "",
      "Routing rules:",
      "1. Prefer composite_candidate over atomic_candidate for ordered, dependent, or grouped components.",
      "2. Do not extract memory content in this step.",
      "3. Do not infer facts not explicitly supported by the segment.",
      "4. evidence_quote must be an exact substring from the segment text.",
      "5. If a segment is a step inside a larger list, route the larger list as composite_candidate and the isolated step as ignore unless independently useful.",
      '6. A user preference stated as "I like/prefer/want X" is an atomic_candidate, not automatically a rule.',
      '7. An instruction stated as "always/default/use/avoid/do not X" is an atomic_candidate.',
      '8. Temporary statements like "today I am tired" or "for this answer use bullets" are usually ignore unless the text clearly says they should persist.',
      "9. Use confidence below 0.6 when uncertain.",
    ].join("\n"),
    {
      raw_event: input.rawEvent,
      segments: input.segmented.segments,
    },
  );
}

export function buildAtomicExtractionPrompt(input: {
  modelId: string;
  rawEvent: RawIngestEvent;
  segments: SegmentedIngestEvent["segments"];
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-atomic-extraction-v1",
    [
      CLASSIFIER_BASELINE,
      "You are Atomic Durable Memory Extractor v1.",
      "Extract atomic durable memory candidates from routed text segments.",
      "Return only JSON matching the supplied schema.",
      "",
      "Allowed atomic kinds:",
      'claim: a truth-evaluable statement. Test: "It is true that ..."',
      'directive: a prescriptive instruction. Test: "The assistant/user/system should/must/default to ..."',
      "source_ref: a pointer to a resource, file, URL, document, repo path, person, ticket, or source to consult.",
      "episode: a time-bounded event, decision, outcome, task result, or interaction.",
      "",
      "Important classification rules:",
      '1. Do not use "user preference" as a kind.',
      '2. "I prefer X", "I like X", "I usually want X" are usually claim with claim_type = preference_state.',
      '3. "Use X", "Default to X", "Always X", "Never X", "Do not X" are directive.',
      "4. A descriptive preference may optionally produce both a claim and a derived directive only when future assistant behavior is clear.",
      "5. A directive must contain an action and a trigger.",
      "6. A claim must be truth-evaluable.",
      "7. A source_ref must primarily be valuable as a locator.",
      "8. An episode must describe something that happened, changed, was decided, completed, or failed.",
      "9. Do not extract temporary, one-turn instructions unless the text says they should persist.",
      "10. Do not extract secrets, credentials, or highly sensitive content as durable memory.",
      "11. evidence_quote must be an exact substring from the source segment.",
      "12. normalized_statement must be a single sentence.",
      "13. If a segment contains multiple independent atomic memories, emit multiple candidates.",
      "14. If a candidate requires unstated inference, do not emit it.",
      "15. If uncertain, lower confidence instead of over-extracting.",
    ].join("\n"),
    {
      raw_event: input.rawEvent,
      segments: input.segments,
    },
  );
}

export function buildCompositeExtractionPrompt(input: {
  modelId: string;
  rawEvent: RawIngestEvent;
  segments: SegmentedIngestEvent["segments"];
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-composite-extraction-v1",
    [
      CLASSIFIER_BASELINE,
      "You are Composite Durable Memory Extractor v1.",
      "Extract composite durable memory candidates from routed text segments.",
      "Return only JSON matching the supplied schema.",
      "",
      "Composite artifact types: procedure, checklist, profile, project_state, decision_record, source_bundle, lesson_pack.",
      "Component roles include step, guardrail, precondition, postcondition, decision_point, reference, fact, rationale, example, owner, open_question, other.",
      "Promotion rules: embedded_only, global, both, blocked.",
      "",
      "Extraction rules:",
      "1. Do not emit child steps as separate top-level atomic candidates here.",
      "2. Preserve order using order_index.",
      "3. Every component evidence_quote must be an exact substring from the source segment.",
      "4. The parent evidence_quote must be an exact substring from the source segment.",
      "5. If the text is ordered or stepwise, prefer artifact_type = procedure.",
      "6. If the text is a verification list, prefer artifact_type = checklist.",
      "7. If a component is a rule inside a procedure, keep it embedded_only unless it clearly applies outside the procedure.",
      "8. If a component contains a file path, URL, repo path, document title, or source pointer, embedded_atomic_kind should be source_ref.",
      "9. If uncertain whether to promote a component globally, choose embedded_only.",
      "10. Do not invent missing steps.",
      "11. Do not persist secrets or credentials.",
    ].join("\n"),
    {
      raw_event: input.rawEvent,
      segments: input.segments,
    },
  );
}

export function buildCanonicalizationPrompt(input: {
  modelId: string;
  rawEvent: RawIngestEvent;
  extractedCandidates: Array<AtomicCandidate | Record<string, unknown>>;
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-canonicalization-v1",
    [
      "You are Durable Memory Canonicalizer v1.",
      "Convert extracted memory candidates into concise canonical memory statements.",
      "Return only JSON matching the supplied schema.",
      "Preserve the distinction between descriptive and prescriptive memory.",
      'For preference claims, use wording like "The user prefers ...".',
      'For soft directives, use wording like "Default to ... when ...".',
      'For hard directives, use wording like "Do not ..." or "Always ...".',
      "Do not add information not present in the candidate or evidence.",
      "Never invent validity dates.",
      "Never convert an embedded_only procedure step into a global memory.",
    ].join("\n"),
    {
      raw_event: input.rawEvent,
      extracted_candidates: input.extractedCandidates,
    },
  );
}

export function buildAdmissionPrompt(input: {
  modelId: string;
  rawEvent: RawIngestEvent;
  canonicalCandidates: CanonicalCandidate[];
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-admission-v1",
    [
      "You are Durable Memory Admission Judge v1.",
      "Decide whether each canonical candidate should be admitted to durable memory.",
      "Return only JSON matching the supplied schema.",
      "Admission decisions: admit, reject, quarantine, embed_only.",
      "Reject temporary one-turn instructions.",
      'Reject vague memories like "the user likes good answers."',
      "Quarantine secrets, credentials, sensitive personal data, or safety-sensitive content.",
      "embed_only for procedure steps and local artifact details unless promotion is global or both.",
      "Admit clear hard directives unless unsafe or superseded.",
      "Admit explicit stable user preferences as claims.",
      "Admit derived soft directives only when directly supported by a preference claim.",
      "Admit source_ref only when locator is useful and sufficiently specific.",
      "Admit episodes only when they capture important decisions, completions, changes, or outcomes.",
    ].join("\n"),
    {
      raw_event: input.rawEvent,
      canonical_candidates: input.canonicalCandidates,
    },
  );
}

export function buildReconciliationPrompt(input: {
  modelId: string;
  reconciliationInput: unknown;
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    "mmv2-reconciliation-v1",
    [
      "You are Durable Memory Reconciliation Judge v1.",
      "Compare one admitted candidate against existing memory neighbors.",
      "Return only JSON matching the supplied schema.",
      "Decision meanings: insert_new, merge_with_existing, supersede_existing, keep_existing_ignore_candidate, record_as_conflict, quarantine.",
      "Prefer exact existing memory when candidate is a duplicate.",
      "Supersede older preference claims when the user explicitly changes their preference.",
      "Do not treat project-scoped and global memories as duplicates unless scope is equivalent.",
      "Do not merge hard constraints with soft preferences.",
      "Do not merge descriptive claims with directives unless one is explicitly derived from the other.",
      "If uncertain, quarantine.",
    ].join("\n"),
    input.reconciliationInput,
  );
}

export function buildRepairPrompt(input: {
  modelId: string;
  contractVersion: string;
  originalPayload: unknown;
  validationErrors: Array<{ path: string; message: string }>;
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    input.contractVersion,
    [
      "Your previous response failed validation.",
      "Repair the JSON. Do not add new segment IDs.",
      "Return only valid JSON matching the schema.",
      "Do not add fields. Do not remove required fields. Do not invent evidence.",
    ].join("\n"),
    {
      validation_errors: input.validationErrors,
      original_payload: input.originalPayload,
    },
  );
}

export function buildEvidenceRepairPrompt(input: {
  modelId: string;
  contractVersion: string;
  originalPayload: unknown;
}): SemanticExtractionPrompt {
  return buildPrompt(
    input.modelId,
    input.contractVersion,
    [
      "Some evidence_quote values were not exact substrings.",
      "For each invalid candidate, either replace evidence_quote with an exact substring from the source, or remove the candidate if no exact evidence exists.",
      "Return only repaired JSON.",
    ].join("\n"),
    input.originalPayload,
  );
}
