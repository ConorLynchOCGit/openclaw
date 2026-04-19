import { describe, expect, it } from "vitest";
import {
  buildAdmissionPrompt,
  buildAtomicExtractionPrompt,
  buildCaptureRoutingPrompt,
  buildCompositeExtractionPrompt,
  buildEvidenceRepairPrompt,
  buildRepairPrompt,
} from "./prompt-contracts.ts";
import { createMmV2TestSource } from "./test-helpers.ts";

describe("mmv2/prompt-contracts", () => {
  it("includes the classifier baseline in routing and extraction prompts", () => {
    const source = createMmV2TestSource("I prefer concise answers.");

    const routingPrompt = buildCaptureRoutingPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      segmented: source.segmented,
    });
    const atomicPrompt = buildAtomicExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      segments: source.segmented.segments,
    });
    const compositePrompt = buildCompositeExtractionPrompt({
      modelId: "model-001",
      rawEvent: source.rawEvent,
      segments: source.segmented.segments,
    });

    expect(routingPrompt.systemPrompt).toContain('Do not use "preference" as a top-level kind.');
    expect(atomicPrompt.systemPrompt).toContain('Do not use "preference" as a top-level kind.');
    expect(compositePrompt.systemPrompt).toContain("embedded_only");
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
    expect(repairPrompt.userPrompt).toContain("validation_errors");
    expect(evidencePrompt.systemPrompt).toContain("exact substrings");
  });
});
