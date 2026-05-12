import { describe, expect, it } from "vitest";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";

const activeQueueDefinitions = [
  {
    sliceId: "openclaw-convergence.active-queue-08",
    trackerKind: "active_queue_item" as const,
    title: "Skillifier Runtime Job Migration",
    track: "openclaw-platform-convergence",
    wave: "wave-7-active-execution-queue",
    ownerSystemArea: "model-memory",
    priority: 8,
    legacySliceId: "openclaw-convergence.slice-48",
    previousSliceId: "openclaw-convergence.active-queue-07",
    historicalSliceId: "openclaw-convergence.slice-48",
    activeQueueId: "openclaw-convergence.active-queue-08",
    activeQueuePosition: 8,
    supersededByActiveQueueId: null,
    dependsOnSliceIds: ["openclaw-convergence.active-queue-07"],
    dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-07"],
    dependsOnHistoricalSliceIds: [],
    sourceDocRefs: ["docs/projects/model-memory/STATUS.md"],
    artifactRefs: [],
    planningStatus: "planned" as const,
    nextAction: "Migrate Skillifier into runtime jobs.",
    blockerReasonCodes: [],
  },
];

describe("coding-team objective scope", () => {
  it("prefers the requested target slice over prior and next-slice references", () => {
    const scope = resolveCodingTeamObjectiveScope({
      objectiveForModel: [
        "Continue OpenClaw Platform Convergence after active-queue-07.",
        "Goal for this pass: complete active-queue-08, Skillifier Runtime Job Migration.",
        "Prefer source from active-queue-07 closeout evidence.",
        "Set next active queue item to active-queue-09 after closeout.",
      ].join("\n"),
      objectiveForEvidence: "Complete active-queue-08.",
      fallbackRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
      activeQueueDefinitions: [
        {
          ...activeQueueDefinitions[0],
          activeQueueId: "openclaw-convergence.active-queue-07",
          sliceId: "openclaw-convergence.active-queue-07",
          title: "Core OpenClaw Loop Simplification",
          ownerSystemArea: "core-openclaw",
          activeQueuePosition: 7,
        },
        activeQueueDefinitions[0],
        {
          ...activeQueueDefinitions[0],
          activeQueueId: "openclaw-convergence.active-queue-09",
          sliceId: "openclaw-convergence.active-queue-09",
          title: "Proactivity Work Queue Quality Soak",
          ownerSystemArea: "model-memory",
          activeQueuePosition: 9,
        },
      ],
    });

    expect(scope.targetActiveQueueId).toBe("openclaw-convergence.active-queue-08");
    expect(scope.targetTitle).toBe("Skillifier Runtime Job Migration");
    expect(scope.ownerSystemArea).toBe("model-memory");
  });

  it("resolves active queue ids into tracker-owned model-memory scope", () => {
    const scope = resolveCodingTeamObjectiveScope({
      objectiveForModel: "Complete active-queue-08 Skillifier Runtime Job Migration.",
      objectiveForEvidence: "Complete active-queue-08.",
      fallbackRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
      activeQueueDefinitions,
    });

    expect(scope).toMatchObject({
      targetActiveQueueId: "openclaw-convergence.active-queue-08",
      targetTitle: "Skillifier Runtime Job Migration",
      ownerSystemArea: "model-memory",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(scope.approvedRepoScopePaths).toEqual(
      expect.arrayContaining([
        "extensions/model-memory/",
        "extensions/execution-platform/src/model-memory-runtime/",
        "src/infra/model-memory-proactivity-runtime.ts",
        "docs/projects/model-memory/",
      ]),
    );
    expect(scope.approvedRepoScopePaths).not.toEqual(
      expect.arrayContaining(["extensions/execution-platform/src/codex-bridge/"]),
    );
    expect(scope.approvedValidationCommands).toEqual(
      expect.arrayContaining([
        "pnpm test:file extensions/model-memory/src/middleware-adoption.test.ts",
        "pnpm test:file src/infra/model-memory-proactivity-runtime.test.ts",
      ]),
    );
  });

  it("falls back conservatively when no structured active queue id is present", () => {
    const scope = resolveCodingTeamObjectiveScope({
      objectiveForModel: "Make a small coding-team bridge repair.",
      objectiveForEvidence: "Make a small bridge repair.",
      fallbackRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
      activeQueueDefinitions,
    });

    expect(scope.targetActiveQueueId).toBeNull();
    expect(scope.approvedRepoScopePaths).toEqual([
      "extensions/execution-platform/src/codex-bridge/",
    ]);
    expect(scope.reasonCodes).toContain("fallback_repo_scope_used");
  });

  it("keeps work queue and UI validations as separate project commands", () => {
    const scope = resolveCodingTeamObjectiveScope({
      objectiveForModel:
        "Improve work-queue owner readback in extensions/execution-platform/src/work-queue/ and ui/src/ui/ for the active coding job.",
      objectiveForEvidence:
        "Improve Work Queue owner readback in extensions/execution-platform/src/work-queue/ and ui/src/ui/.",
      fallbackRepoScopePaths: ["extensions/execution-platform/src/codex-bridge/"],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      ],
      activeQueueDefinitions,
    });

    expect(scope.approvedValidationCommands).toEqual([
      "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
      "pnpm test:file ui/src/ui/views/work-queue.test.ts",
    ]);
  });
});
