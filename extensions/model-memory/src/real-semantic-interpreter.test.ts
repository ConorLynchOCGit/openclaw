import { describe, expect, it } from "vitest";
import { buildCaptureRoutingPrompt } from "./mmv2/prompt-contracts.ts";
import { createMmV2TestSource } from "./mmv2/test-helpers.ts";
import { JsonModelOutputError } from "./model-execution.ts";
import { ExecutorBackedSemanticInterpreter } from "./real-semantic-interpreter.ts";
import {
  buildSemanticCandidateExtractionPrompt,
  buildSemanticExtractionPrompt,
} from "./semantic-extraction-prompt.ts";

function buildSourceWindow() {
  return {
    id: "window-001",
    sourceId: "source-001",
    windowIndex: 0,
    normalizedText: "Project-001 deployment region is region-001.",
    normalizedFingerprint: "fingerprint-001",
    tokenEstimate: 6,
    headingPath: ["Project"],
    lineStart: 1,
    lineEnd: 1,
    blockDescriptors: [
      {
        id: "block-001",
        headingPath: ["Project"],
        lineStart: 1,
        lineEnd: 1,
        text: "Project-001 deployment region is region-001.",
      },
    ],
  };
}

describe("real-semantic-interpreter", () => {
  it("executes candidate extraction through the model boundary", async () => {
    const requests: Array<{ systemPrompt: string; userPrompt: string; contractVersion: string }> =
      [];
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute(request) {
        requests.push({
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          contractVersion: request.contract.contractVersion,
        });
        return {
          outputText: JSON.stringify({
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "deployment region: region-001",
                supportingSpans: [
                  {
                    blockId: "block-001",
                    lineStart: 1,
                    lineEnd: 1,
                    headingPath: ["Project"],
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          }),
        };
      },
    });

    const result = await interpreter.interpret({
      sourceKind: "document",
      sourceId: "source-001",
      sourceWindow: buildSourceWindow(),
      prompt: buildSemanticCandidateExtractionPrompt({
        sourceKind: "document",
        sourceWindow: buildSourceWindow(),
        modelId: "model-doc-candidate-001",
      }),
    });

    expect(result.action).toBe("capture");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.contractVersion).toBe("v2-candidate");
    expect(requests[0]?.systemPrompt).toContain(
      "This pass is candidate discovery only, not final canonical formatting.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Do not emit canonicalClass, kind, payload, scope, provenance, durability, reviewMode, or other final-schema fields in this pass.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "When sourceWindow.availableHeadingPathOptions is present, prefer headingPathRef using one exact ref from that list instead of rewriting long heading arrays.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Emit user/preference only when the source window explicitly states a durable user-owned standing preference or standing instruction.",
    );
    expect(requests[0]?.systemPrompt).toContain("Classify by kind first, not by canonicalClass");
    expect(requests[0]?.systemPrompt).toContain(
      "If text is normative and durable, prefer rule over fact.",
    );
    const promptPayload = JSON.parse(requests[0]?.userPrompt ?? "{}") as {
      sourceWindow?: {
        availableHeadingPaths?: string[][];
        availableHeadingPathOptions?: Array<{ ref: string; headingPath: string[] }>;
        numberedText?: string;
      };
    };
    expect(promptPayload.sourceWindow?.availableHeadingPaths).toEqual([["Project"]]);
    expect(promptPayload.sourceWindow?.availableHeadingPathOptions).toEqual([
      { ref: "hp_1", headingPath: ["Project"] },
    ]);
    expect(promptPayload.sourceWindow?.numberedText).toContain(
      "1| Project-001 deployment region is region-001.",
    );
  });

  it("executes canonicalization through the model boundary", async () => {
    const requests: Array<{ systemPrompt: string; userPrompt: string; contractName: string }> = [];
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute(request) {
        requests.push({
          systemPrompt: request.systemPrompt,
          userPrompt: request.userPrompt,
          contractName: request.contract.contractName,
        });
        return {
          outputText: JSON.stringify({
            action: "capture",
            objects: [
              {
                canonicalClass: "project",
                kind: "fact",
              },
            ],
          }),
        };
      },
    });

    const result = await interpreter.interpret({
      sourceKind: "document",
      sourceId: "source-001",
      sourceWindow: buildSourceWindow(),
      prompt: buildSemanticExtractionPrompt({
        sourceKind: "document",
        sourceWindow: buildSourceWindow(),
        modelId: "model-doc-001",
        candidates: [
          {
            candidateId: "candidate-001",
            candidateType: "fact",
            claim: "deployment region: region-001",
            confidence: "strong",
            supportingEvidence: [
              {
                blockId: "block-001",
                lineStart: 1,
                lineEnd: 1,
                headingPath: ["Project"],
                excerpt: "Project-001 deployment region is region-001.",
              },
            ],
          },
        ],
      }),
    });

    expect(result.action).toBe("capture");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.contractName).toBe("semantic_extraction");
    expect(requests[0]?.systemPrompt).not.toContain("atlas forge");
    expect(requests[0]?.systemPrompt).toContain("<subject>");
    expect(requests[0]?.systemPrompt).toContain("user + preference");
    expect(requests[0]?.systemPrompt).toContain(
      "Do not emit any other canonicalClass/kind pairing.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Canonicalize durable memory candidates into final canonical memory objects.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "You may only use the provided candidates and cited source evidence.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "When sourceWindow.availableHeadingPathOptions is present, prefer provenance.headingPathRef using one exact ref from that list instead of rewriting long heading arrays.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Final kind must match the candidateType for the candidate being canonicalized.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Choose kind first and treat canonicalClass as secondary bookkeeping.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "If candidateType=rule and the cited evidence is normative, imperative, prohibitive, default-setting, or gate-setting, keep kind=rule.",
    );
    expect(requests[0]?.systemPrompt).toContain(
      "Do not emit keys such as optional scope or optional companionResources.",
    );
    expect(requests[0]?.systemPrompt).not.toContain(
      "- reference payload: task, primaryResource, optional companionResources",
    );
    const promptPayload = JSON.parse(requests[0]?.userPrompt ?? "{}") as {
      sourceWindow?: {
        availableHeadingPaths?: string[][];
        availableHeadingPathOptions?: Array<{ ref: string; headingPath: string[] }>;
        numberedText?: string;
      };
      candidates?: Array<{ candidateId: string; claim: string }>;
    };
    expect(promptPayload.sourceWindow?.availableHeadingPaths).toEqual([["Project"]]);
    expect(promptPayload.sourceWindow?.availableHeadingPathOptions).toEqual([
      { ref: "hp_1", headingPath: ["Project"] },
    ]);
    expect(promptPayload.sourceWindow?.numberedText).toBeUndefined();
    expect(promptPayload.candidates).toEqual([
      expect.objectContaining({
        candidateId: "candidate-001",
        candidateType: "fact",
        claim: "deployment region: region-001",
        confidence: "strong",
      }),
    ]);
  });

  it("rejects malformed model output instead of reinterpreting it locally", async () => {
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute() {
        return {
          outputText: '{"action":"capture","objects":"not-an-array"}',
        };
      },
    });

    await expect(
      interpreter.interpret({
        sourceKind: "ordinary_turn",
        sourceId: "source-001",
        sourceWindow: {
          id: "window-001",
          sourceId: "source-001",
          windowIndex: 0,
          normalizedText: "Keep answers short.",
          normalizedFingerprint: "fingerprint-001",
          tokenEstimate: 3,
          headingPath: [],
          lineStart: 1,
          lineEnd: 1,
          blockDescriptors: [
            {
              id: "block-001",
              headingPath: [],
              lineStart: 1,
              lineEnd: 1,
              text: "Keep answers short.",
            },
          ],
        },
        prompt: buildSemanticExtractionPrompt({
          sourceKind: "ordinary_turn",
          sourceWindow: {
            id: "window-001",
            sourceId: "source-001",
            windowIndex: 0,
            normalizedText: "Keep answers short.",
            normalizedFingerprint: "fingerprint-001",
            tokenEstimate: 3,
            headingPath: [],
            lineStart: 1,
            lineEnd: 1,
            blockDescriptors: [
              {
                id: "block-001",
                headingPath: [],
                lineStart: 1,
                lineEnd: 1,
                text: "Keep answers short.",
              },
            ],
          },
          modelId: "model-turn-001",
          candidates: [],
        }),
      }),
    ).rejects.toBeInstanceOf(JsonModelOutputError);
  });

  it("accepts raw MMV2 schema output without requiring the legacy capture wrapper", async () => {
    const source = createMmV2TestSource("Please remember that MMV2 live output is raw schema.");
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute() {
        return {
          outputText: JSON.stringify({
            schema_version: "capture_routing.v1",
            event_id: source.rawEvent.event_id,
            routing_decisions: source.segmented.segments.map((segment) => ({
              segment_id: segment.segment_id,
              route: "atomic_candidate",
              candidate_summary: "MMV2 live output contract.",
              memory_likelihood: 0.9,
              durability_likelihood: 0.88,
              composite_likelihood: 0.05,
              reason_codes: ["durable_project_fact"],
              evidence_quote: segment.text,
              confidence: 0.92,
            })),
          }),
        };
      },
    });

    const result = await interpreter.interpret({
      sourceKind: "document",
      sourceId: source.sourceId,
      sourceWindow: source.sourceWindow,
      prompt: buildCaptureRoutingPrompt({
        modelId: "openai-codex/gpt-5.4-mini",
        rawEvent: source.rawEvent,
        segmented: source.segmented,
      }),
    });

    expect(result).toMatchObject({
      action: "capture",
      objects: [
        {
          schema_version: "capture_routing.v1",
          event_id: source.rawEvent.event_id,
        },
      ],
    });
  });

  it("accepts fenced JSON without treating the fence as semantic content", async () => {
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute() {
        return {
          outputText: ["```json", '{"action":"capture","objects":[]}', "```"].join("\n"),
        };
      },
    });

    const result = await interpreter.interpret({
      sourceKind: "document",
      sourceId: "source-001",
      sourceWindow: {
        id: "window-001",
        sourceId: "source-001",
        windowIndex: 0,
        normalizedText: "No durable memory here.",
        normalizedFingerprint: "fingerprint-001",
        tokenEstimate: 4,
        headingPath: [],
        lineStart: 1,
        lineEnd: 1,
        blockDescriptors: [
          {
            id: "block-001",
            headingPath: [],
            lineStart: 1,
            lineEnd: 1,
            text: "No durable memory here.",
          },
        ],
      },
      prompt: buildSemanticExtractionPrompt({
        sourceKind: "document",
        sourceWindow: {
          id: "window-001",
          sourceId: "source-001",
          windowIndex: 0,
          normalizedText: "No durable memory here.",
          normalizedFingerprint: "fingerprint-001",
          tokenEstimate: 4,
          headingPath: [],
          lineStart: 1,
          lineEnd: 1,
          blockDescriptors: [
            {
              id: "block-001",
              headingPath: [],
              lineStart: 1,
              lineEnd: 1,
              text: "No durable memory here.",
            },
          ],
        },
        modelId: "model-doc-001",
        candidates: [],
      }),
    });

    expect(result).toEqual({
      action: "capture",
      objects: [],
    });
  });

  it("accepts leading prose when a fenced JSON block follows", async () => {
    const interpreter = new ExecutorBackedSemanticInterpreter({
      async execute() {
        return {
          outputText: [
            "This source mostly contains proof policy.",
            "",
            "```json",
            '{"action":"ignore"}',
            "```",
          ].join("\n"),
        };
      },
    });

    const result = await interpreter.interpret({
      sourceKind: "document",
      sourceId: "source-001",
      sourceWindow: {
        id: "window-001",
        sourceId: "source-001",
        windowIndex: 0,
        normalizedText: "Proof corpus policy",
        normalizedFingerprint: "fingerprint-001",
        tokenEstimate: 3,
        headingPath: [],
        lineStart: 1,
        lineEnd: 1,
        blockDescriptors: [
          {
            id: "block-001",
            headingPath: [],
            lineStart: 1,
            lineEnd: 1,
            text: "Proof corpus policy",
          },
        ],
      },
      prompt: buildSemanticExtractionPrompt({
        sourceKind: "document",
        sourceWindow: {
          id: "window-001",
          sourceId: "source-001",
          windowIndex: 0,
          normalizedText: "Proof corpus policy",
          normalizedFingerprint: "fingerprint-001",
          tokenEstimate: 3,
          headingPath: [],
          lineStart: 1,
          lineEnd: 1,
          blockDescriptors: [
            {
              id: "block-001",
              headingPath: [],
              lineStart: 1,
              lineEnd: 1,
              text: "Proof corpus policy",
            },
          ],
        },
        modelId: "model-doc-001",
        candidates: [],
      }),
    });

    expect(result).toEqual({ action: "ignore" });
  });
});
