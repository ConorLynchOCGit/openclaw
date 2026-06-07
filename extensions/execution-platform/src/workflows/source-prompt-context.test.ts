import { describe, expect, it } from "vitest";
import {
  buildSourcePromptArtifact,
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
  it("builds a source prompt artifact as bounded addressing, not semantic sectioning", () => {
    const artifact = buildSourcePromptArtifact({
      promptText: "Implement a workflow.\n\nValidate it with runtime evidence.",
      resolution,
    });

    expect(artifact.artifactKind).toBe("source_prompt_artifact");
    expect(artifact.sourcePromptBodyRef).toBe("source-prompt://abc123/body");
    expect(artifact.boundedPreview).toContain("Implement a workflow");
    expect("sections" in artifact).toBe(false);
    expect(artifact.rawPromptStored).toBe(false);
    expect(artifact.rawResponseStored).toBe(false);
    expect(artifact.rawProviderLogStored).toBe(false);
  });

  it("normalizes excerpt requests and fulfills bounded excerpts as volatile input only", () => {
    const promptText = "Goal:\n".concat("Implement robust worker handoffs. ".repeat(60));
    const artifact = buildSourcePromptArtifact({ promptText, resolution });
    const [request] = normalizeSourcePromptExcerptRequests({
      sourcePromptExcerptRequests: [
        {
          requestId: "req-1",
          commitmentId: "commitment-1",
          sourcePromptBodyRef: artifact.sourcePromptBodyRef,
          reason: "Need exact owner wording for implementation handoff.",
          maxChars: 500,
          downstreamConsumer: "implementation_worker",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      ],
    });

    const result = fulfillSourcePromptExcerptRequest({ artifact, promptText, request: request! });
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

  it("denies excerpt requests for unresolved prompt body refs", () => {
    const artifact = buildSourcePromptArtifact({
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
          sourcePromptBodyRef: "source-prompt://missing/body",
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
      artifact,
      promptText: null,
      request: request!,
    });
    expect(result.decision.status).toBe("denied");
    expect(result.volatileExcerptText).toBeNull();
    expect(result.decision.reasonCodes).toContain("source_prompt_excerpt_body_unavailable");
    expect(result.decision.contextSnapshotRefs[0]).toMatchObject({
      sourceKind: "source_prompt_excerpt",
      freshnessStatus: "missing",
      refreshAction: "request_excerpt",
    });
  });
});
