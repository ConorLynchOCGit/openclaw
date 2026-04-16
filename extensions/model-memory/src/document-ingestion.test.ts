import { describe, expect, it } from "vitest";
import { ingestDocument } from "./document-ingestion.ts";
import { JsonModelOutputError } from "./model-execution.ts";
import { summarizeModelMemoryPayload } from "./payload-summary.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "./semantic-interpreter.ts";

type DocumentProofCase = {
  id: string;
  text: string;
  expectedAction: "capture" | "ignore";
  buildResult: (input: SemanticInterpreterInput) => SemanticInterpreterResult;
};

function createScriptedInterpreter(
  script: (
    input: SemanticInterpreterInput,
  ) => SemanticInterpreterResult | Promise<SemanticInterpreterResult>,
): SemanticInterpreter {
  return {
    interpret(input) {
      return Promise.resolve(script(input));
    },
  };
}

function firstProvenance(input: SemanticInterpreterInput) {
  const firstBlock = input.sourceWindow.blockDescriptors[0];
  return {
    sourceId: input.sourceWindow.id,
    blockId: firstBlock.id,
    lineStart: firstBlock.lineStart,
    lineEnd: firstBlock.lineEnd,
    headingPath: firstBlock.headingPath,
  };
}

function buildCandidateClaimFromResultObject(
  rawObject: Record<string, unknown> & { kind: string; payload: Record<string, unknown> },
): string {
  return summarizeModelMemoryPayload(rawObject) || "candidate";
}

function buildCandidateResultFromSemanticResult(
  input: SemanticInterpreterInput,
  result: SemanticInterpreterResult,
): SemanticInterpreterResult {
  if (result.action === "ignore") {
    return result;
  }

  const provenance = firstProvenance(input);
  return {
    action: "capture",
    objects: result.objects.map((rawObject) => {
      const object = rawObject as {
        kind: "preference" | "fact" | "rule" | "procedure" | "reference";
        payload: Record<string, unknown>;
        confidence?: "weak" | "medium" | "strong";
      };
      return {
        candidateType: object.kind,
        claim: buildCandidateClaimFromResultObject(object),
        supportingSpans: [
          {
            blockId: provenance.blockId,
            lineStart: provenance.lineStart,
            lineEnd: provenance.lineEnd,
            headingPath: provenance.headingPath,
          },
        ],
        confidence: object.confidence ?? "strong",
        shouldStore: true,
      };
    }),
  };
}

const documentProofCases: DocumentProofCase[] = [
  {
    id: "doc-001-user-preferences",
    text: "User profile for user-001:\n- Keep answers concise.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "user",
          kind: "preference",
          payload: {
            subject: "response style",
            instruction: "keep answers concise",
            operation: "prefer",
          },
          scope: {
            userScope: "user-001",
          },
          provenance: [firstProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "doc-002-project-facts",
    text: "Project notes for project-001:\n- Deployment region: region-001.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "project",
          kind: "fact",
          payload: {
            subject: "deployment region",
            value: "region-001",
          },
          scope: {
            projectId: "project-001",
            projectScope: "project-001",
          },
          provenance: [firstProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "doc-003-standing-rule",
    text: "Operating rule for project-001:\n- Use gate-command-001 before landing.\n- Do not use manual-command-001 for that step.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "feedback",
          kind: "rule",
          payload: {
            subject: "landing gate",
            recommendedAction: "use gate-command-001 before landing",
            avoidAction: "use manual-command-001 for that step",
          },
          scope: {
            projectId: "project-001",
            projectScope: "project-001",
          },
          provenance: [firstProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "doc-004-procedure",
    text: "Checklist procedure-001:\n1. Run check-001.\n2. Record artifact-001.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "feedback",
          kind: "procedure",
          payload: {
            title: "procedure-001",
            steps: ["run check-001", "record artifact-001"],
          },
          provenance: [firstProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "doc-005-reference",
    text: "When working on task-001, start with resource-001 and then consult resource-002 if needed.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "reference",
          kind: "reference",
          payload: {
            task: "task-001",
            primaryResource: "resource-001",
            companionResources: ["resource-002"],
          },
          provenance: [firstProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "doc-006-ignore",
    text: "Status chatter:\n- Thanks\n- Sounds good\n- Talk later",
    expectedAction: "ignore",
    buildResult: () => ({
      action: "ignore",
    }),
  },
];

describe("document-ingestion", () => {
  it.each(documentProofCases)("converts $id into validated canonical output", async (proofCase) => {
    const result = await ingestDocument({
      document: {
        externalSourceId: proofCase.id,
        text: proofCase.text,
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) =>
        input.prompt.contract.contractVersion === "v2-candidate"
          ? buildCandidateResultFromSemanticResult(input, proofCase.buildResult(input))
          : proofCase.buildResult(input),
      ),
    });

    expect(result.source.sourceKind).toBe("document");
    expect(result.windowResults).toHaveLength(1);

    if (proofCase.expectedAction === "ignore") {
      expect(result.windowResults[0]).toEqual({
        sourceWindowId: result.windows[0].id,
        action: "ignore",
      });
      expect(result.capturedObjects).toEqual([]);
      return;
    }

    expect(result.windowResults[0].action).toBe("capture");
    expect(result.capturedObjects).toHaveLength(1);
    expect(result.capturedObjects[0].contractName).toBe("semantic_extraction");
    expect(result.capturedObjects[0].contractVersion).toBe("v2-canonicalization");
    expect(result.capturedObjects[0].modelId).toBe("model-doc-001");
  });

  it("rejects invalid extracted objects instead of treating them as runtime truth", async () => {
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-invalid",
        text: "Project notes for project-001:\n- Deployment region: region-001.",
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => ({
        action: "capture",
        objects:
          input.prompt.contract.contractVersion === "v2-candidate"
            ? [
                {
                  candidateType: "fact",
                  claim: "deployment region: region-001",
                  supportingSpans: [
                    {
                      blockId: firstProvenance(input).blockId,
                      lineStart: firstProvenance(input).lineStart,
                      lineEnd: firstProvenance(input).lineEnd,
                      headingPath: firstProvenance(input).headingPath,
                    },
                  ],
                  confidence: "strong",
                  shouldStore: true,
                },
              ]
            : [
                {
                  canonicalClass: "project",
                  kind: "fact",
                  payload: {
                    subject: "deployment region",
                    factFieldKey: "deployment_region",
                  },
                  provenance: [firstProvenance(input)],
                  confidence: "strong",
                  durability: "durable",
                  reviewMode: "auto_accept",
                },
              ],
      })),
    });

    expect(result.windowResults[0].action).toBe("reject");
    expect(result.capturedObjects).toEqual([]);
  });

  it("attempts one structural repair pass before rejecting malformed extracted objects", async () => {
    const calls: SemanticInterpreterInput[] = [];
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-repairable",
        text: "Configuration notes for project-001:\n- Use resource-001 for task-001.",
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => {
        calls.push(input);
        if (calls.length === 1) {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "reference",
                claim: "task-001 -> resource-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        if (calls.length === 2) {
          return {
            action: "capture",
            objects: [
              {
                canonicalClass: "reference",
                kind: "reference",
                payload: {
                  task: "task-001",
                  primaryResource: "resource-001",
                  "optional companionResources": [],
                },
                "optional scope": {
                  projectId: "project-001",
                },
                provenance: [firstProvenance(input)],
                confidence: "strong",
                durability: "durable",
                reviewMode: "auto_accept",
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "reference",
              kind: "reference",
              payload: {
                task: "task-001",
                primaryResource: "resource-001",
              },
              scope: {
                projectId: "project-001",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.prompt.contract.contractVersion).toBe("v2-candidate");
    expect(calls[1]?.prompt.contract.contractVersion).toBe("v2-canonicalization");
    expect(calls[2]?.prompt.contract.contractVersion).toBe("v2-canonicalization-repair");
    expect(result.windowResults[0]?.action).toBe("capture");
    expect(result.capturedObjects).toHaveLength(1);
    expect(result.capturedObjects[0]?.contractVersion).toBe("v2-canonicalization-repair");
  });

  it("skips candidate repair when at least one valid candidate survives", async () => {
    const calls: SemanticInterpreterInput[] = [];
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-candidate-partial",
        text: "Project notes for project-001:\n- Deployment region: region-001.",
      },
      modelId: "model-doc-canonical-001",
      candidateModelId: "model-doc-candidate-001",
      interpreter: createScriptedInterpreter((input) => {
        calls.push(input);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "deployment region: region-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
              {
                candidateType: "fact",
                claim: "broken duplicate",
                supportingSpans: [],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "fact",
              payload: {
                subject: "deployment region",
                value: "region-001",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.prompt.contract.contractVersion).toBe("v2-candidate");
    expect(calls[1]?.prompt.contract.contractVersion).toBe("v2-canonicalization");
    expect(result.windowResults[0]?.action).toBe("capture");
    expect(result.capturedObjects).toHaveLength(1);
  });

  it("attempts one structural repair pass for malformed candidate extraction before canonicalization", async () => {
    const calls: SemanticInterpreterInput[] = [];
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-candidate-repairable",
        text: "Project notes for project-001:\n- Deployment region: region-001.",
      },
      modelId: "model-doc-canonical-001",
      candidateModelId: "model-doc-candidate-001",
      interpreter: createScriptedInterpreter((input) => {
        calls.push(input);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "deployment region: region-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "high",
                shouldStore: true,
              },
            ],
          };
        }
        if (input.prompt.contract.contractVersion === "v2-candidate-repair") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "deployment region: region-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }
        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "fact",
              payload: {
                subject: "deployment region",
                value: "region-001",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.prompt.contract.contractVersion).toBe("v2-candidate");
    expect(calls[1]?.prompt.contract.contractVersion).toBe("v2-candidate-repair");
    expect(calls[2]?.prompt.contract.contractVersion).toBe("v2-canonicalization");
    expect(result.windowResults[0]?.action).toBe("capture");
    expect(result.capturedObjects).toHaveLength(1);
    expect(result.capturedObjects[0]?.modelId).toBe("model-doc-canonical-001");
  });

  it("skips canonical repair when at least one valid canonical object survives", async () => {
    const calls: SemanticInterpreterInput[] = [];
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-canonical-partial",
        text: "Configuration notes for project-001:\n- Use resource-001 for task-001.",
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => {
        calls.push(input);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "reference",
                claim: "task-001 -> resource-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "reference",
              kind: "reference",
              payload: {
                task: "task-001",
                primaryResource: "resource-001",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
            {
              canonicalClass: "reference",
              kind: "reference",
              payload: {
                task: "task-001",
                primaryResource: {
                  invalid: true,
                },
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.prompt.contract.contractVersion).toBe("v2-candidate");
    expect(calls[1]?.prompt.contract.contractVersion).toBe("v2-canonicalization");
    expect(result.windowResults[0]?.action).toBe("capture");
    expect(result.capturedObjects).toHaveLength(1);
    expect(result.capturedObjects[0]?.contractVersion).toBe("v2-canonicalization");
  });

  it("uses the candidate model for pass 1 and the canonicalization model for pass 2", async () => {
    const calls: SemanticInterpreterInput[] = [];
    await ingestDocument({
      document: {
        externalSourceId: "doc-two-pass-models",
        text: "Project notes for project-001:\n- Deployment region: region-001.",
      },
      modelId: "model-doc-canonical-001",
      candidateModelId: "model-doc-candidate-001",
      interpreter: createScriptedInterpreter((input) => {
        calls.push(input);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "deployment region: region-001",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "fact",
              payload: {
                subject: "deployment region",
                value: "region-001",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.prompt.contract.modelId).toBe("model-doc-candidate-001");
    expect(calls[1]?.prompt.contract.modelId).toBe("model-doc-canonical-001");
  });

  it("retries transient interpreter errors and still captures the window", async () => {
    const attempts = new Map<string, number>();
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-transient-retry",
        text: [
          "# Alpha",
          "Alpha setting is value-a.",
          "",
          "# Beta",
          "Beta setting is value-b.",
        ].join("\n"),
        maxWordsPerWindow: 4,
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => {
        const key = `${input.sourceWindow.id}:${input.prompt.contract.contractVersion}`;
        attempts.set(key, (attempts.get(key) ?? 0) + 1);

        if (
          input.sourceWindow.windowIndex === 0 &&
          input.prompt.contract.contractVersion === "v2-candidate" &&
          attempts.get(key) === 1
        ) {
          const error = new Error("timed out");
          error.name = "AbortError";
          throw error;
        }

        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: `${input.sourceWindow.headingPath.join(" ")} setting`,
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "fact",
              payload: {
                subject: `${input.sourceWindow.headingPath.join(" ")} setting`,
                value: `value-${input.sourceWindow.windowIndex + 1}`,
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(result.windowResults.length).toBeGreaterThanOrEqual(2);
    expect(result.windowResults.every((entry) => entry.action === "capture")).toBe(true);
    expect(result.capturedObjects.length).toBeGreaterThanOrEqual(2);
    expect(
      [...attempts.entries()].find(([key]) => key.includes(":v2-candidate"))?.[1],
    ).toBeGreaterThanOrEqual(1);
  });

  it("contains interpreter failures to one window instead of aborting the source", async () => {
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-window-containment",
        text: [
          "# Alpha",
          "Alpha setting is value-a.",
          "",
          "# Beta",
          "Beta setting is value-b.",
        ].join("\n"),
        maxWordsPerWindow: 4,
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => {
        if (
          input.sourceWindow.windowIndex === 0 &&
          input.prompt.contract.contractVersion === "v2-candidate"
        ) {
          throw new JsonModelOutputError(
            "invalid JSON model output for semantic_extraction",
            input.prompt.contract,
            "not-json",
          );
        }

        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "beta setting",
                supportingSpans: [
                  {
                    blockId: firstProvenance(input).blockId,
                    lineStart: firstProvenance(input).lineStart,
                    lineEnd: firstProvenance(input).lineEnd,
                    headingPath: firstProvenance(input).headingPath,
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "fact",
              payload: {
                subject: "beta setting",
                value: "value-b",
              },
              provenance: [firstProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(result.windowResults.length).toBeGreaterThanOrEqual(2);
    expect(result.windowResults.some((entry) => entry.action === "reject")).toBe(true);
    expect(result.windowResults.some((entry) => entry.action === "capture")).toBe(true);
    expect(result.windowResults).toContainEqual(
      expect.objectContaining({
        action: "reject",
        errors: [
          expect.objectContaining({
            path: "pass_1_candidate",
          }),
        ],
      }),
    );
    expect(result.capturedObjects.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves headingPathRef values into exact heading paths before validation", async () => {
    const result = await ingestDocument({
      document: {
        externalSourceId: "doc-heading-ref",
        text: ["# Gateway runbook", "## Port and bind precedence", "Bind loopback only."].join(
          "\n",
        ),
      },
      modelId: "model-doc-001",
      interpreter: createScriptedInterpreter((input) => {
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "rule",
                claim: "bind loopback only",
                supportingSpans: [
                  {
                    lineStart: 3,
                    lineEnd: 3,
                    headingPathRef: "hp_2",
                  },
                ],
                confidence: "strong",
                shouldStore: true,
              },
            ],
          };
        }

        return {
          action: "capture",
          objects: [
            {
              canonicalClass: "project",
              kind: "rule",
              payload: {
                subject: "gateway bind",
                recommendedAction: "bind loopback only",
              },
              provenance: [
                {
                  sourceId: input.sourceWindow.id,
                  lineStart: 3,
                  lineEnd: 3,
                  headingPathRef: "hp_2",
                },
              ],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(result.windowResults[0]?.action).toBe("capture");
    expect(result.capturedObjects[0]?.object.provenance[0]?.headingPath).toEqual([
      "Gateway runbook",
      "Port and bind precedence",
    ]);
  });
});
