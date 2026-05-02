import { describe, expect, it } from "vitest";
import {
  DEFAULT_MMV2_PROMPT_RESPONSE_MODE,
  buildCanonicalizationPrompt,
  buildAdmissionPrompt,
  buildAtomicExtractionPrompt,
  buildCaptureRoutingPrompt,
  buildCompositeExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildReconciliationPrompt,
  buildRepairPrompt,
} from "./prompt-contracts.ts";
import {
  buildAtomicRoutedCandidate,
  buildAtomicCandidate,
  buildCanonicalCandidate,
  buildCompositeCandidate,
  buildCompositeRoutedCandidate,
  createMmV2TestSource,
} from "./test-helpers.ts";

describe("mmv2/prompt-contracts", () => {
  it("includes the expected routing, atomic, and composite instructions", () => {
    const source = createMmV2TestSource("I prefer concise answers.");

    const routingPrompt = buildCaptureRoutingPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      segmented: source.segmented,
    });
    const atomicPrompt = buildAtomicExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      routedCandidates: [buildAtomicRoutedCandidate(source.segmented.segments[0])],
    });
    const compositePrompt = buildCompositeExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      routedCandidates: [buildCompositeRoutedCandidate(source.segmented.segments[0])],
    });

    expect(routingPrompt.systemPrompt).toContain('Do not use "preference" as a top-level kind.');
    expect(atomicPrompt.systemPrompt).toContain("You are Atomic Durable Memory Extractor v1.");
    expect(atomicPrompt.systemPrompt).toContain(
      "4. A descriptive preference may optionally produce both:",
    );
    expect(atomicPrompt.systemPrompt).toContain(
      "Do not emit more than one top-level atomic candidate for the same routed span",
    );
    expect(atomicPrompt.systemPrompt).toContain(
      "routing evidence_quote is provenance for why the span was routed",
    );
    expect(atomicPrompt.systemPrompt).toContain(
      "cite the exact supporting substring from routed_candidate.text",
    );
    expect(atomicPrompt.systemPrompt).toContain(
      'explicit "remember", "store", "capture", or "save" request',
    );
    expect(atomicPrompt.systemPrompt).toContain(
      "proof marker, timestamp, run id, branch name, or source id",
    );
    expect(atomicPrompt.systemPrompt).toContain("no tools, no commits, or acknowledge-only");
    expect(atomicPrompt.systemPrompt).toContain("Positive extraction examples:");
    expect(atomicPrompt.systemPrompt).toContain(
      "marker ABC means future validation should prove Y",
    );
    expect(compositePrompt.systemPrompt).toContain(
      "You are Composite Durable Memory Extractor v1.",
    );
    expect(compositePrompt.systemPrompt).toContain(
      "Default for steps, examples, local facts, and details that only make sense inside the artifact.",
    );
    expect(routingPrompt.systemPrompt).toContain("Required output JSON schema:");
    expect(routingPrompt.systemPrompt).toContain('"$id": "CaptureRoutingBatch.schema.json"');
    expect(routingPrompt.systemPrompt).toContain(
      'explicit operational rules phrased with "must", "should", "may", "cannot"',
    );
    expect(routingPrompt.systemPrompt).toContain("Do not require the document to say");
    expect(routingPrompt.systemPrompt).toContain(
      "one durable memory statement with a proof marker/source id/run id",
    );
    expect(routingPrompt.systemPrompt).toContain(
      "multiple independent durable preferences/facts/directives",
    );
    expect(atomicPrompt.userPrompt).toContain("Atomic routed candidates:");
    expect(atomicPrompt.systemPrompt).toContain("Required output JSON schema:");
    expect(atomicPrompt.systemPrompt).toContain('"$id": "AtomicExtractionBatch.schema.json"');
    expect(compositePrompt.userPrompt).toContain("Composite routed candidates:");
    expect(compositePrompt.systemPrompt).toContain("Required output JSON schema:");
    expect(compositePrompt.systemPrompt).toContain('"$id": "CompositeExtractionBatch.schema.json"');
    expect(atomicPrompt.userPrompt).not.toContain("Required JSON schema:");
    expect(compositePrompt.userPrompt).not.toContain("Required JSON schema:");
    expect(routingPrompt.userPrompt).not.toContain("Required JSON schema:");
    expect(routingPrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_object",
      },
    });
    expect(DEFAULT_MMV2_PROMPT_RESPONSE_MODE).toBe("prompt_schema_json_object");
  });

  it("returns expected contract versions", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const prompt = buildAdmissionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      canonicalCandidates: [],
    });

    expect(prompt.contract.contractName).toBe("semantic_extraction");
    expect(prompt.contract.contractVersion).toBe("mmv2-admission-v1");
    expect(prompt.promptPayload).toEqual({
      raw_event: source.rawEvent,
      canonical_candidates: [],
    });
  });

  it("uses the supplied canonicalization and admission rule text", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const canonicalPrompt = buildCanonicalizationPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      extractedCandidates: [],
    });
    const admissionPrompt = buildAdmissionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      canonicalCandidates: [],
    });

    expect(canonicalPrompt.systemPrompt).toContain("Canonicalization rules:");
    expect(canonicalPrompt.systemPrompt).toContain("4. For preference claims, use wording like:");
    expect(canonicalPrompt.systemPrompt).toContain(
      "15. Never convert an embedded_only procedure step into a global memory.",
    );
    expect(admissionPrompt.systemPrompt).toContain("Admission decisions:");
    expect(admissionPrompt.systemPrompt).toContain("Scoring rules:");
    expect(admissionPrompt.systemPrompt).toContain(
      "10. Do not invent novelty; if unsure, set requires_reconciliation = true.",
    );
    expect(admissionPrompt.systemPrompt).toContain(
      '20. If the user explicitly asks to "remember", "store", "capture", or "save" a safe durable preference, directive, project fact, user fact, or source reference, admit it when the candidate is grounded and concrete.',
    );
    expect(admissionPrompt.systemPrompt).toContain(
      '21. Treat phrases like "for project X", project_id metadata, current workspace/project metadata, or source document scope as clear scope unless the candidate itself conflicts with that scope.',
    );
    expect(admissionPrompt.systemPrompt).toContain("24. Admission is not global-only.");
    expect(admissionPrompt.systemPrompt).toContain(
      "28. Use a bounded TTL for pass-specific, run-specific, branch-specific, validation-specific, proof-marker, current-dirty-state, or one-repair-pass facts",
    );
    expect(canonicalPrompt.systemPrompt).toContain('"$id": "CanonicalCandidateBatch.schema.json"');
    expect(admissionPrompt.systemPrompt).toContain('"$id": "AdmissionDecisionBatch.schema.json"');
  });

  it("passes structured extracted candidates into canonicalization, not raw text", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const atomicCandidate = buildAtomicCandidate(segment.segment_id, "I prefer concise answers.");
    const compositeCandidate = buildCompositeCandidate(
      segment.segment_id,
      "I prefer concise answers.",
      {
        candidate_id: "composite-structured-001",
        title: "Preference profile",
      },
    );
    const prompt = buildCanonicalizationPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      extractedCandidates: [atomicCandidate, compositeCandidate],
    });

    expect(prompt.userPrompt).toContain("Extracted candidates:");
    expect(prompt.userPrompt).toContain('"candidate_id": "candidate-001"');
    expect(prompt.userPrompt).toContain('"candidate_id": "composite-structured-001"');
    expect(prompt.userPrompt).not.toContain("Required JSON schema:");
    expect(prompt.systemPrompt).toContain('"$id": "CanonicalCandidateBatch.schema.json"');
    expect(prompt.promptPayload).toEqual({
      raw_event: source.rawEvent,
      extracted_candidates: [atomicCandidate, compositeCandidate],
    });
  });

  it("passes structured canonical candidates into admission, not raw text", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const canonicalCandidate = buildCanonicalCandidate(
      source.rawEvent,
      segment.segment_id,
      "I prefer concise answers.",
    );
    const prompt = buildAdmissionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      canonicalCandidates: [canonicalCandidate],
    });

    expect(prompt.userPrompt).toContain("Canonical candidates:");
    expect(prompt.userPrompt).toContain('"candidate_id": "canonical-001"');
    expect(prompt.userPrompt).toContain('"canonical_text": "The user prefers concise answers."');
    expect(prompt.userPrompt).not.toContain("Required JSON schema:");
    expect(prompt.systemPrompt).toContain('"$id": "AdmissionDecisionBatch.schema.json"');
    expect(prompt.promptPayload).toEqual({
      raw_event: source.rawEvent,
      canonical_candidates: [canonicalCandidate],
    });
  });

  it("includes reconciliation input and output contracts in the prompt-visible path", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const candidate = buildCanonicalCandidate(
      source.rawEvent,
      source.segmented.segments[0].segment_id,
      "I prefer concise answers.",
    );
    const prompt = buildReconciliationPrompt({
      modelId: "model-001",
      reconciliationInput: {
        schema_version: "reconciliation_input.v1",
        event_id: source.rawEvent.event_id,
        candidate,
        neighbors: [],
      },
    });

    expect(prompt.systemPrompt).toContain("Decision meanings:");
    expect(prompt.systemPrompt).toContain("10. If uncertain, quarantine.");
    expect(prompt.systemPrompt).toContain("Reconciliation input schema:");
    expect(prompt.userPrompt).toContain("Reconciliation input:");
    expect(prompt.userPrompt).toContain('"schema_version"');
    expect(prompt.userPrompt).toContain('"candidate_id": "canonical-001"');
    expect(prompt.userPrompt).toContain('"neighbors": []');
    expect(prompt.userPrompt).not.toContain("Required JSON schema:");
    expect(prompt.systemPrompt).toContain('"$id": "ReconciliationInput.schema.json"');
    expect(prompt.systemPrompt).toContain('"$id": "ReconciliationDecision.schema.json"');
    expect(prompt.responseOptions).toMatchObject({
      transport: {
        type: "json_object",
      },
    });
  });

  it("can request strict json_schema transport explicitly", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const prompt = buildCaptureRoutingPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      segmented: source.segmented,
      responseMode: "strict_json_schema",
    });

    expect(prompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "capture_routing_batch",
        strict: true,
      },
      provider: {
        requireParameters: true,
      },
    });
  });

  it("uses the exact canonical atomic and composite schema objects when strict transport is requested", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const atomicPrompt = buildAtomicExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      routedCandidates: [buildAtomicRoutedCandidate(source.segmented.segments[0])],
      responseMode: "strict_json_schema",
    });
    const compositePrompt = buildCompositeExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      routedCandidates: [buildCompositeRoutedCandidate(source.segmented.segments[0])],
      responseMode: "strict_json_schema",
    });

    expect(atomicPrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "atomic_extraction_batch",
        strict: true,
        schema: {
          $id: "AtomicExtractionBatch.schema.json",
        },
      },
    });
    expect(compositePrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "composite_extraction_batch",
        strict: true,
        schema: {
          $id: "CompositeExtractionBatch.schema.json",
        },
      },
    });
  });

  it("uses the exact canonical downstream schema objects when strict transport is requested", () => {
    const source = createMmV2TestSource("I prefer concise answers.");
    const segment = source.segmented.segments[0];
    const canonicalCandidate = buildCanonicalCandidate(
      source.rawEvent,
      segment.segment_id,
      "I prefer concise answers.",
    );
    const canonicalPrompt = buildCanonicalizationPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      extractedCandidates: [],
      responseMode: "strict_json_schema",
    });
    const admissionPrompt = buildAdmissionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      canonicalCandidates: [canonicalCandidate],
      responseMode: "strict_json_schema",
    });
    const reconciliationPrompt = buildReconciliationPrompt({
      modelId: "model-001",
      reconciliationInput: {
        schema_version: "reconciliation_input.v1",
        event_id: source.rawEvent.event_id,
        candidate: canonicalCandidate,
        neighbors: [],
      },
      responseMode: "strict_json_schema",
    });

    expect(canonicalPrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "canonical_candidate_batch",
        strict: true,
        schema: {
          $id: "CanonicalCandidateBatch.schema.json",
        },
      },
    });
    expect(admissionPrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "admission_decision_batch",
        strict: true,
        schema: {
          $id: "AdmissionDecisionBatch.schema.json",
        },
      },
    });
    expect(reconciliationPrompt.responseOptions).toMatchObject({
      transport: {
        type: "json_schema",
        name: "reconciliation_decision",
        strict: true,
        schema: {
          $id: "ReconciliationDecision.schema.json",
        },
      },
    });
  });

  it("preserves repair placeholders in repair prompts", () => {
    const repairPrompt = buildRepairPrompt({
      modelId: "model-001",
      contractVersion: "mmv2-repair-v1",
      originalPayload: { previous: true },
      validationErrors: [{ path: "field", message: "bad field" }],
    });
    const evidencePrompt = buildEvidenceRepairPrompt({
      modelId: "model-001",
      contractVersion: "mmv2-evidence-repair-v1",
      originalPayload: { previous: true },
    });

    expect(repairPrompt.systemPrompt).toContain("failed validation");
    expect(repairPrompt.userPrompt).toContain("Validation errors:");
    expect(repairPrompt.systemPrompt).toContain("Required output JSON schema:");
    expect(repairPrompt.userPrompt).not.toContain("Required JSON schema:");
    expect(evidencePrompt.systemPrompt).toContain("exact substrings");
    expect(evidencePrompt.userPrompt).toContain("Original payload:");
    expect(evidencePrompt.systemPrompt).toContain("Required output JSON schema:");
  });
});
