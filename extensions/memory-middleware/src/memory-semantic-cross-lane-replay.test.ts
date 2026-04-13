import { describe, expect, it } from "vitest";
import { resolveMemoryMiddlewareConfig } from "./config.js";
import { runMemorySemanticCrossLaneReplay } from "./memory-semantic-cross-lane-replay.js";
import { createReplayMemorySemanticInterpreter } from "./memory-semantic-interpreter.test-helpers.js";

const config = resolveMemoryMiddlewareConfig({});

describe("memory semantic cross-lane replay", () => {
  it("replays equivalent meaning through document and ordinary-turn lanes", async () => {
    const interpreter = createReplayMemorySemanticInterpreter([
      {
        sourceId: "workspace/atlas/OPERATING.md",
        windowTextIncludes: ["use scripts/committer for commits here"],
        result: (input) => ({
          action: "capture",
          objects: [
            {
              canonicalClass: "feedback",
              kind: "correction",
              correctionKind: "workflow_guidance",
              subject: "commit workflow",
              recommendedAction: "Use scripts/committer for commits here.",
              avoidAction: "Do not use manual git add and git commit.",
              guidancePattern: "use_instead_of",
              workflowProfile: "general_guidance",
              scope: {
                projectId: "atlas-forge",
                projectScope: "atlas forge",
                contextualDependencies: [],
              },
              durability: "durable",
              confidence: "strong",
              rationale: ["replayed workflow guidance"],
              provenanceSpans: [{ blockIds: input.window.blocks.map((block) => block.id) }],
            },
          ],
        }),
      },
      {
        sourceId: "turn:atlas-commits",
        windowTextIncludes: ["use scripts/committer for commits here"],
        result: (input) => ({
          action: "capture",
          objects: [
            {
              canonicalClass: "feedback",
              kind: "correction",
              correctionKind: "workflow_guidance",
              subject: "commit workflow",
              recommendedAction: "Use scripts/committer for commits here.",
              avoidAction: "Do not use manual git add and git commit.",
              guidancePattern: "use_instead_of",
              workflowProfile: "general_guidance",
              scope: {
                projectId: "atlas-forge",
                projectScope: "atlas forge",
                contextualDependencies: [],
              },
              durability: "durable",
              confidence: "strong",
              rationale: ["replayed workflow guidance"],
              provenanceSpans: [{ blockIds: input.window.blocks.map((block) => block.id) }],
            },
          ],
        }),
      },
    ]);

    const report = await runMemorySemanticCrossLaneReplay({
      config,
      interpreter,
      document: {
        source: {
          path: "workspace/atlas/OPERATING.md",
          projectId: "atlas-forge",
          sourceClass: "project",
        },
        content: "Use scripts/committer for commits here instead of manual git add and git commit.",
        projectScope: "atlas forge",
      },
      ordinaryTurn: {
        sourceId: "turn:atlas-commits",
        sessionKey: "atlas-session",
        text: "For atlas forge, use scripts/committer for commits here instead of manual git add and git commit.",
        projectId: "atlas-forge",
        projectScope: "atlas forge",
      },
    });

    expect(report.pass).toBe(true);
    expect(report.missingFromDocument).toEqual([]);
    expect(report.missingFromOrdinaryTurn).toEqual([]);
    expect(report.document).toHaveLength(1);
    expect(report.ordinaryTurn).toHaveLength(1);
    expect(report.document[0]).toMatchObject({
      canonicalClass: "feedback",
      kind: "correction",
      compatibilityCategory: "workflow_improvement",
      subject: "commit workflow",
    });
    expect(report.document[0]?.dedupeKey).toBe(report.ordinaryTurn[0]?.dedupeKey);
  });
});
