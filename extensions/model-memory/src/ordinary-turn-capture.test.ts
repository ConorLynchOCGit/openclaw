import { describe, expect, it } from "vitest";
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
  it.each(turnProofCases)(
    "captures $id through the shared semantic contract",
    async (proofCase) => {
      const result = await captureOrdinaryTurn({
        turn: {
          currentTurnText: proofCase.text,
        },
        modelId: "model-turn-001",
        interpreter: createScriptedInterpreter((input) => proofCase.buildResult(input)),
      });

      expect(result.source.sourceKind).toBe("ordinary_turn");
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
      expect(result.capturedObjects[0].modelId).toBe("model-turn-001");
    },
  );

  it("rejects invalid ordinary-turn outputs instead of silently backfilling meaning", async () => {
    const result = await captureOrdinaryTurn({
      turn: {
        currentTurnText: "For project-001, the deployment region is region-001.",
      },
      modelId: "model-turn-001",
      interpreter: createScriptedInterpreter((input) => ({
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
      })),
    });

    expect(result.windowResults[0].action).toBe("reject");
    expect(result.capturedObjects).toEqual([]);
  });
});
