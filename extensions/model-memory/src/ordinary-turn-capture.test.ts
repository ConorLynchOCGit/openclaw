import { afterEach, describe, expect, it } from "vitest";
import { DOCUMENT_INGEST_ENGINE_ENV } from "./document-ingestion.ts";
import { captureOrdinaryTurn } from "./ordinary-turn-capture.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "./semantic-interpreter.ts";

type TurnProofCase = {
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

function lastProvenance(input: SemanticInterpreterInput) {
  const lastBlock =
    input.sourceWindow.blockDescriptors[input.sourceWindow.blockDescriptors.length - 1];
  return {
    sourceId: input.sourceWindow.id,
    blockId: lastBlock.id,
    lineStart: lastBlock.lineStart,
    lineEnd: lastBlock.lineEnd,
    headingPath: lastBlock.headingPath,
  };
}

const turnProofCases: TurnProofCase[] = [
  {
    id: "turn-001-explicit-preference",
    text: "Please keep explanations high level by default.",
    expectedAction: "capture",
    buildResult: (input) => ({
      action: "capture",
      objects: [
        {
          canonicalClass: "user",
          kind: "preference",
          payload: {
            subject: "response detail",
            instruction: "keep explanations high level",
            operation: "prefer",
          },
          provenance: [lastProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "turn-002-explicit-fact",
    text: "For project-001, the deployment region is region-001.",
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
          provenance: [lastProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "turn-003-explicit-rule",
    text: "Before landing in project-001, use gate-command-001 and do not use manual-command-001 for that step.",
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
          provenance: [lastProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "turn-004-explicit-procedure",
    text: "Procedure-001 is: first run check-001, then record artifact-001.",
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
          provenance: [lastProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "turn-005-explicit-reference",
    text: "For task-001, start with resource-001 and consult resource-002 if needed.",
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
          provenance: [lastProvenance(input)],
          confidence: "strong",
          durability: "durable",
          reviewMode: "auto_accept",
        },
      ],
    }),
  },
  {
    id: "turn-006-no-durable-memory",
    text: "Thanks, that looks good for now.",
    expectedAction: "ignore",
    buildResult: () => ({ action: "ignore" }),
  },
];

describe("ordinary-turn-capture", () => {
  afterEach(() => {
    delete process.env[DOCUMENT_INGEST_ENGINE_ENV];
  });

  it.each(turnProofCases)(
    "captures $id through the shared semantic contract",
    async (proofCase) => {
      const contractVersions: string[] = [];
      const result = await captureOrdinaryTurn({
        turn: {
          currentTurnText: proofCase.text,
        },
        modelId: "model-turn-001",
        candidateModelId: "model-turn-001",
        interpreter: createScriptedInterpreter((input) => {
          contractVersions.push(input.prompt.contract.contractVersion);
          if (input.prompt.contract.contractVersion === "v2-candidate") {
            if (proofCase.expectedAction === "ignore") {
              return { action: "ignore" };
            }
            return {
              action: "capture",
              objects: [
                {
                  candidateType: input.sourceWindow.normalizedText.includes("Procedure-001")
                    ? "procedure"
                    : input.sourceWindow.normalizedText.includes("resource-001")
                      ? "reference"
                      : input.sourceWindow.normalizedText.includes("deployment region")
                        ? "fact"
                        : input.sourceWindow.normalizedText.includes("use gate-command-001")
                          ? "rule"
                          : "preference",
                  claim: proofCase.text,
                  supportingSpans: [
                    {
                      blockId: input.sourceWindow.blockDescriptors.at(-1)?.id,
                      lineStart: input.sourceWindow.lineStart,
                      lineEnd: input.sourceWindow.lineEnd,
                      headingPath: input.sourceWindow.headingPath,
                    },
                  ],
                  confidence: "strong",
                  shouldStore: true,
                },
              ],
            };
          }
          return proofCase.buildResult(input);
        }),
      });

      expect(result.source.sourceKind).toBe("ordinary_turn");
      expect(result.windowResults).toHaveLength(1);

      if (proofCase.expectedAction === "ignore") {
        expect(result.windowResults[0]).toEqual({
          sourceWindowId: result.windows[0].id,
          action: "ignore",
        });
        expect(result.capturedObjects).toEqual([]);
        expect(contractVersions).toEqual(["v2-candidate"]);
        return;
      }

      expect(result.windowResults[0].action).toBe("capture");
      expect(result.capturedObjects).toHaveLength(1);
      expect(result.capturedObjects[0].contractName).toBe("semantic_extraction");
      expect(result.capturedObjects[0].modelId).toBe("model-turn-001");
      expect(contractVersions).toEqual(["v2-candidate", "v2-canonicalization"]);
      expect(result.capturedObjects[0].contractVersion).toBe("v2-canonicalization");
    },
  );

  it("does not switch ordinary turns onto MMV2 document contracts when document ingest defaults to MMV2", async () => {
    process.env[DOCUMENT_INGEST_ENGINE_ENV] = "mmv2";
    const contractVersions: string[] = [];

    const result = await captureOrdinaryTurn({
      turn: {
        currentTurnText: "For project-001, the deployment region is region-001.",
      },
      modelId: "model-turn-keep-v1",
      candidateModelId: "model-turn-keep-v1",
      interpreter: createScriptedInterpreter((input) => {
        contractVersions.push(input.prompt.contract.contractVersion);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "For project-001, the deployment region is region-001.",
                supportingSpans: [
                  {
                    blockId: input.sourceWindow.blockDescriptors.at(-1)?.id,
                    lineStart: input.sourceWindow.lineStart,
                    lineEnd: input.sourceWindow.lineEnd,
                    headingPath: input.sourceWindow.headingPath,
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
              scope: {
                projectId: "project-001",
                projectScope: "project-001",
              },
              provenance: [lastProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(result.capturedObjects).toHaveLength(1);
    expect(contractVersions).toEqual(["v2-candidate", "v2-canonicalization"]);
    expect(contractVersions.some((version) => version.startsWith("mmv2-"))).toBe(false);
  });

  it("rejects invalid ordinary-turn outputs instead of silently backfilling meaning", async () => {
    const contractVersions: string[] = [];
    const result = await captureOrdinaryTurn({
      turn: {
        currentTurnText: "For project-001, the deployment region is region-001.",
      },
      modelId: "model-turn-001",
      candidateModelId: "model-turn-001",
      interpreter: createScriptedInterpreter((input) => {
        contractVersions.push(input.prompt.contract.contractVersion);
        if (input.prompt.contract.contractVersion === "v2-candidate") {
          return {
            action: "capture",
            objects: [
              {
                candidateType: "fact",
                claim: "For project-001, the deployment region is region-001.",
                supportingSpans: [
                  {
                    blockId: input.sourceWindow.blockDescriptors.at(-1)?.id,
                    lineStart: input.sourceWindow.lineStart,
                    lineEnd: input.sourceWindow.lineEnd,
                    headingPath: input.sourceWindow.headingPath,
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
                fieldKey: "deployment_region",
                value: "region-001",
              },
              provenance: [lastProvenance(input)],
              confidence: "strong",
              durability: "durable",
              reviewMode: "auto_accept",
            },
          ],
        };
      }),
    });

    expect(result.windowResults[0].action).toBe("reject");
    expect(result.capturedObjects).toEqual([]);
    expect(contractVersions).toEqual([
      "v2-candidate",
      "v2-canonicalization",
      "v2-canonicalization-repair",
    ]);
  });
});
