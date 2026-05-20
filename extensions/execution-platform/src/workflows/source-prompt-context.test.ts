import { describe, expect, it } from "vitest";
import {
  buildSourcePromptContextIndex,
  fulfillSourcePromptExcerptRequest,
  normalizeSourcePromptExcerptRequests,
} from "./source-prompt-context.ts";

const resolution = {
  status: "resolved" as const,
  reasonCodes: ["source_prompt_ref_resolved_from_native_submit_file"],
  promptHash: "abc123",
  promptLength: 0,
  rawPromptStored: false as const,
  rawResponseStored: false as const,
  rawProviderLogStored: false as const,
};

describe("source prompt context", () => {
  it("builds a bounded section index without raw prompt storage", () => {
    const index = buildSourcePromptContextIndex({
      promptText: [
        "Goal:\nImplement the Product/Spec Planning workflow.",
        "Requirements:\nAdd workflow registry, planning capsule, validation, readback.",
      ].join("\n\n"),
      resolution,
    });

    expect(index.artifactKind).toBe("source_prompt_context_index");
    expect(index.sections.length).toBeGreaterThan(0);
    expect(index.sections[0]?.sectionRef).toContain("source-prompt://");
    expect(index.rawPromptStored).toBe(false);
    expect(index.rawResponseStored).toBe(false);
    expect(index.rawProviderLogStored).toBe(false);
    expect(index.sections[0]?.boundedSummary).toContain("Goal");
    expect(index.contextSnapshotRefs.length).toBeGreaterThan(0);
    expect(index.contextSnapshotRefs[0]).toMatchObject({
      artifactKind: "context_snapshot_ref",
      sourceKind: "source_prompt_index",
      freshnessStatus: "fresh",
      sourcePromptHash: "abc123",
    });
  });

  it("normalizes excerpt requests and fulfills bounded excerpts as volatile input only", () => {
    const promptText = "Goal:\n".concat("Implement robust worker handoffs. ".repeat(60));
    const index = buildSourcePromptContextIndex({ promptText, resolution });
    const [request] = normalizeSourcePromptExcerptRequests({
      sourcePromptExcerptRequests: [
        {
          requestId: "req-1",
          commitmentId: "commitment-1",
          sectionRef: index.sections[0]?.sectionRef,
          reason: "Need exact owner wording for implementation handoff.",
          maxChars: 500,
          downstreamConsumer: "implementation_worker",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      ],
    });

    const result = fulfillSourcePromptExcerptRequest({ index, promptText, request: request! });
    expect(result.decision.status).toBe("provided");
    expect(result.decision.excerptHash).toMatch(/[a-f0-9]{64}/u);
    expect(result.volatileExcerptText).toContain("Implement robust worker handoffs");
    expect(result.decision.boundedExcerptSummary.length).toBeLessThanOrEqual(700);
    expect(result.decision.contextSnapshotRefs[0]).toMatchObject({
      sourceKind: "source_prompt_excerpt",
      freshnessStatus: "fresh",
      sourcePromptHash: "abc123",
    });
    expect(result.decision.rawPromptStored).toBe(false);
  });

  it("denies excerpt requests for unresolved prompt refs", () => {
    const index = buildSourcePromptContextIndex({
      promptText: null,
      resolution: {
        ...resolution,
        status: "unresolved",
        promptHash: null,
        promptLength: null,
      },
    });
    const [request] = normalizeSourcePromptExcerptRequests({
      sourcePromptExcerptRequests: [
        {
          requestId: "req-2",
          commitmentId: "commitment-2",
          sectionRef: "source-prompt://missing/section-001/0-10",
          reason: "Need unavailable context.",
          maxChars: 500,
          downstreamConsumer: "context_scout",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      ],
    });

    const result = fulfillSourcePromptExcerptRequest({
      index,
      promptText: null,
      request: request!,
    });
    expect(result.decision.status).toBe("denied");
    expect(result.volatileExcerptText).toBeNull();
    expect(result.decision.reasonCodes).toContain("source_prompt_excerpt_section_unavailable");
    expect(result.decision.contextSnapshotRefs[0]).toMatchObject({
      sourceKind: "source_prompt_excerpt",
      freshnessStatus: "missing",
      refreshAction: "request_excerpt",
    });
  });
});
