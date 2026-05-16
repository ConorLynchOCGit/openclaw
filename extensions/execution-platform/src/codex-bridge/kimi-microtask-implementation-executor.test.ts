import { describe, expect, it } from "vitest";
import type { KimiFileImplementationAdapterResult } from "./kimi-file-implementation-adapter.ts";
import {
  buildKimiMicrotaskSummary,
  KimiMicrotaskImplementationExecutor,
} from "./kimi-microtask-implementation-executor.ts";

function adapterResult(
  overrides: Partial<KimiFileImplementationAdapterResult> = {},
): KimiFileImplementationAdapterResult {
  return {
    artifactKind: "kimi_file_implementation_adapter_result",
    status: "completed",
    modelRef: "moonshotai/kimi-k2.6",
    providerPath: "openrouter",
    modelRunRef: "openrouter://moonshotai/kimi-k2.6/test",
    changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
    diffHash: "sha256:diff",
    validationRefs: ["validation://passed"],
    artifactRefs: ["runtime-work-graph://kimi-file-adapter/test"],
    limitations: [],
    attemptDiagnostics: [
      {
        attempt: 1,
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        modelRunRef: "openrouter://moonshotai/kimi-k2.6/test",
        responseHash: "sha256:response",
        responsePresent: true,
        responseLength: 300,
        latencyMs: 50,
        maxOutputTokens: 6_000,
        timeoutMs: 180_000,
        hadFencedJson: false,
        hadJsonObject: true,
        topLevelKeys: ["fileEdits"],
        hadFileEditsKey: true,
        parsedStatus: "patch_proposed",
        parsedNeedsReview: null,
        parsedFileEditCount: 1,
        boundedBlockerSummary: null,
        hadPatchLikeContent: false,
        schemaParseState: "valid",
        schemaFailureCategories: [],
        normalizedEditCount: 1,
        rejectionStage: null,
        reasonCodes: ["kimi_patch_response_normalized"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    reasonCodes: ["kimi_patch_applied_and_validated"],
    escalatedToCodexBridgeRecommended: false,
    contextExpansionRequests: [],
    editPlanSteps: [],
    evidenceClaims: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}

describe("KimiMicrotaskImplementationExecutor", () => {
  it("builds a narrow microtask summary instead of a broad implementation brief", () => {
    const summary = buildKimiMicrotaskSummary({
      microtaskId: "microtask-1",
      microtaskTitle: "Improve readback labels",
      exactEditObjective: "Add one bounded reason code to readback.",
      rationaleForCallingThisRole:
        "The orchestrator selected Kimi because this is a one-file standard implementation packet.",
      downstreamConsumer: "reviewer",
      expectedOutput: "A changed-file ref, validation ref, and bounded limitation summary.",
      contextScoutHandoff:
        "The context scout identified buildExecutionReadModel as the exact readback builder to adjust.",
      recommendedEditPoints: [
        {
          path: "extensions/execution-platform/src/work-queue/execution-read-model.ts",
          symbolOrRegion: "buildExecutionReadModel",
          reason: "This is where owner-facing readback labels are assembled.",
        },
      ],
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      targetFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      contextPackRefs: ["runtime-work-graph://context"],
      validationCommandRefs: ["pnpm test:file readback.test.ts"],
      acceptanceCriteria: ["one file changes", "validation ref recorded"],
    });

    expect(summary).toContain("one bounded standard implementation microtask");
    expect(summary).toContain("Exact edit objective");
    expect(summary).toContain("Why the orchestrator called you now");
    expect(summary).toContain("Context scout handoff");
    expect(summary).toContain("buildExecutionReadModel");
    expect(summary).toContain("Do not broaden scope");
    expect(summary).not.toContain("Context reinforcement");
  });

  it("passes microtask budgets and maps successful adapter output", async () => {
    let maxOutputTokens = 0;
    let timeoutMs = 0;
    const result = await new KimiMicrotaskImplementationExecutor({
      adapter: {
        async run(input) {
          maxOutputTokens = input.budgetPolicy.maxOutputTokens;
          timeoutMs = input.budgetPolicy.timeoutMs;
          expect(input.taskSummary).toContain("Context scout handoff");
          expect(input.taskSummary).toContain("owner readback section");
          return adapterResult();
        },
      },
    }).run({
      microtaskId: "microtask-1",
      microtaskTitle: "Improve readback labels",
      exactEditObjective: "Add one bounded reason code to readback.",
      contextScoutHandoff: "Update the owner readback section and avoid lifecycle mutation.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      targetFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file readback.test.ts"],
      acceptanceCriteria: ["one file changes"],
    });

    expect(maxOutputTokens).toBe(8_000);
    expect(timeoutMs).toBe(480_000);
    expect(result.status).toBe("completed");
    expect(result.reasonCodes).toContain("kimi_microtask_completed");
    expect(result.changedFileRefs).toHaveLength(1);
  });

  it("maps failed parser diagnostics to bounded escalation", async () => {
    const result = await new KimiMicrotaskImplementationExecutor({
      adapter: {
        async run() {
          return adapterResult({
            status: "needs_review",
            changedFileRefs: [],
            diffHash: null,
            validationRefs: [],
            limitations: ["Kimi returned prose instead of JSON."],
            attemptDiagnostics: [
              {
                ...adapterResult().attemptDiagnostics[0]!,
                hadJsonObject: false,
                normalizedEditCount: 0,
                rejectionStage: "json_parse",
                reasonCodes: ["kimi_patch_rejected_at_json_parse"],
              },
            ],
            reasonCodes: ["kimi_no_json_object"],
            escalatedToCodexBridgeRecommended: true,
          });
        },
      },
    }).run({
      microtaskId: "microtask-1",
      microtaskTitle: "Improve readback labels",
      exactEditObjective: "Add one bounded reason code to readback.",
      repoRoot: "/repo",
      allowedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      targetFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      contextPackRefs: [],
      validationCommandRefs: ["pnpm test:file readback.test.ts"],
      acceptanceCriteria: ["one file changes"],
    });

    expect(result.status).toBe("escalated");
    expect(result.attemptDiagnostics[0]?.rejectionStage).toBe("json_parse");
    expect(result.escalatedToCodexBridgeRecommended).toBe(true);
  });
});
