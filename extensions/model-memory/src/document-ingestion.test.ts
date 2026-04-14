import { describe, expect, it } from "vitest";
import { ingestDocument } from "./document-ingestion.ts";
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
  const readPayloadString = (key: string): string | undefined => {
    const value = rawObject.payload[key];
    return typeof value === "string" ? value : undefined;
  };

  switch (rawObject.kind) {
    case "preference":
      return readPayloadString("instruction") ?? readPayloadString("subject") ?? "candidate";
    case "fact":
      return `${readPayloadString("subject") ?? "fact"}: ${readPayloadString("value") ?? ""}`.trim();
    case "rule":
      return (
        readPayloadString("recommendedAction") ??
        readPayloadString("avoidAction") ??
        readPayloadString("neededCapability") ??
        readPayloadString("subject") ??
        "candidate"
      );
    case "procedure":
      return readPayloadString("title") ?? "candidate";
    case "reference":
      return readPayloadString("task") ?? readPayloadString("primaryResource") ?? "candidate";
    default:
      return "candidate";
  }
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
});
