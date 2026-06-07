import { describe, expect, it } from "vitest";
import type { DynamicCodingTeamModelClient } from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import { IntakeStageRunner } from "./intake-stage-runner.ts";
import {
  REQUIREMENT_MAP_ARTIFACT_TYPE,
  buildRequirementPromptWindows,
  requirementNativeToolDefinitions,
  requirementProviderToolName,
  type RequirementNativeToolId,
} from "./requirement-map.ts";
import { SOURCE_PROMPT_ARTIFACT_TYPE } from "./source-prompt-context.ts";

type NativeToolFixture = {
  tool: RequirementNativeToolId | "unknown.tool";
  input: Record<string, unknown>;
};

function resolvedSourcePrompt(): JsonValue {
  return {
    status: "resolved",
    reasonCodes: ["source_prompt_body_ref_resolved_for_test"],
    promptHash: null,
    promptLength: null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function unresolvedLongPrompt(): JsonValue {
  return {
    status: "unresolved",
    reasonCodes: ["source_prompt_body_unavailable_for_test"],
    promptHash: null,
    promptLength: 12_000,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function candidateTools(): NativeToolFixture[] {
  return [
    {
      tool: "requirement.record_candidate",
      input: {
        text: "Implement RequirementMap intake as the canonical pre-scheduler decomposition product.",
        evidenceExcerpt:
          "Implement RequirementMap intake as the canonical pre-scheduler decomposition product.",
      },
    },
    {
      tool: "requirement.record_candidate",
      input: {
        text: "Run replay after routing and validate scheduler handoff.",
        evidenceExcerpt: "Run replay after routing and validate scheduler handoff.",
      },
    },
  ];
}

function promotionTools(): NativeToolFixture[] {
  return [
    {
      tool: "requirement.promote",
      input: {
        candidateIds: ["cand-0001"],
        text: "Implement RequirementMap intake as the canonical pre-scheduler decomposition product.",
        role: "runnable_work",
      },
    },
    {
      tool: "requirement.promote",
      input: {
        candidateIds: ["cand-0002"],
        text: "Run replay after routing and validate scheduler handoff.",
        role: "validation",
      },
    },
  ];
}

function processArtifactCandidateTools(): NativeToolFixture[] {
  return [
    {
      tool: "requirement.record_candidate",
      input: {
        text: "Produce a RequirementMap artifact.",
        evidenceExcerpt: "Produce a RequirementMap artifact.",
      },
    },
  ];
}

function processArtifactPromotionTools(): NativeToolFixture[] {
  return [
    {
      tool: "requirement.promote",
      input: {
        candidateIds: ["cand-0001"],
        text: "Produce a RequirementMap artifact.",
        role: "runnable_work",
      },
    },
  ];
}

function oversizedPromotionTools(): NativeToolFixture[] {
  return [
    {
      tool: "requirement.promote",
      input: {
        candidateIds: ["cand-0001"],
        text: "Oversized requirement text. ".repeat(120),
        role: "runnable_work",
      },
    },
  ];
}

function runnerWithToolBatches(
  batches: NativeToolFixture[][],
  options: { executeProviderToolTurn?: boolean } = {},
) {
  const progress: Array<Record<string, unknown>> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  const checkpoints: Array<Record<string, unknown>> = [];
  const calls: Array<Record<string, unknown>> = [];
  const queuedBatches = batches.slice();
  const modelClient: DynamicCodingTeamModelClient = {
    runJson: async () => {
      throw new Error("test_model_client_runJson_for_requirement_map_forbidden");
    },
    ...(options.executeProviderToolTurn === false
      ? {}
      : {
          executeProviderToolTurn: async (input) => {
            calls.push(input as unknown as Record<string, unknown>);
            const batch = queuedBatches.shift() ?? [];
            return {
              modelRunRef: `model-run-${calls.length}`,
              toolCalls: batch.map((toolCall, index) => ({
                toolName:
                  toolCall.tool === "unknown.tool"
                    ? "unknown_tool"
                    : requirementProviderToolName(toolCall.tool),
                toolArguments: toolCall.input,
                callId: `tool-call-${calls.length}-${index + 1}`,
              })),
              responseHash: `response-hash-${calls.length}`,
              latencyMs: 12,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            };
          },
        }),
  } as DynamicCodingTeamModelClient;
  const runtimeJobs = {
    listArtifacts: async () =>
      artifacts.map((artifact, index) => ({
        artifactId: `artifact-${index + 1}`,
        jobId: typeof artifact.jobId === "string" ? artifact.jobId : "job-intake",
        artifactType: String(artifact.artifactType),
        storageKind: "runtime-artifact-payload",
        uri: String(artifact.uri),
        contentType: "application/json",
        sizeBytes: null,
        sha256: null,
        metadata: artifact.body ?? artifact.metadata ?? null,
        createdAt: new Date(`2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`),
      })),
    attachRuntimeArtifactByContract: async (input: Record<string, unknown>) => {
      artifacts.push(input);
      return input;
    },
    hydrateRuntimeArtifactByContract: async (artifact: { metadata?: unknown }) => ({
      status: "payload_hydrated",
      body: artifact.metadata ?? null,
      payload: null,
      reasonCodes: ["runtime_artifact_contract_payload_hydrated"],
      legacyHydrated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    }),
  };
  const runner = new IntakeStageRunner({
    runtimeJobs: runtimeJobs as never,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    missionModelClient: modelClient,
    attachProgress: async (input) => {
      progress.push(input as Record<string, unknown>);
      return `progress-${progress.length}`;
    },
    recordBoundaryCheckpoint: async (input) => {
      checkpoints.push(input as Record<string, unknown>);
      return `checkpoint-${checkpoints.length}`;
    },
    attachModelCallProgress: async () => undefined,
  });
  return { runner, progress, artifacts, checkpoints, calls };
}

const baseRunInput = {
  runtimeJobId: "job-intake",
  workItemId: null,
  graphId: "graph-intake",
  teamRunId: "team-intake",
  objective: "Implement RequirementMap intake.",
  objectiveForModel: [
    "Implement RequirementMap intake as the canonical pre-scheduler decomposition product.",
    "Run replay after routing and validate scheduler handoff.",
  ].join("\n\n"),
  sourcePromptResolution: resolvedSourcePrompt(),
  repoScopeRefs: ["extensions/execution-platform/src/"],
  validationCommandRefs: ["pnpm test:file intake-stage-runner.test.ts"],
  checkpointReplay: null,
};

describe("IntakeStageRunner RequirementMap", () => {
  it("blocks long-prompt execution before RequirementMap when source prompt body is unresolved", async () => {
    const { runner, progress, calls } = runnerWithToolBatches([candidateTools(), promotionTools()]);

    await expect(
      runner.run({
        ...baseRunInput,
        objectiveForModel: "Long prompt body. ".repeat(900),
        sourcePromptResolution: unresolvedLongPrompt(),
      }),
    ).rejects.toThrow("source_prompt_artifact_body_missing_for_long_prompt_execution");

    expect(calls).toHaveLength(0);
    expect(progress.some((item) => item.currentPhase === "source_prompt_unresolved")).toBe(true);
  });

  it("requires provider-native RequirementMap tools and forbids prompt-only JSON fallback", async () => {
    const { runner } = runnerWithToolBatches([], { executeProviderToolTurn: false });

    await expect(runner.run(baseRunInput)).rejects.toThrow(
      "requirement_map_native_tool_client_missing",
    );
  });

  it("creates a RequirementMap through native window extraction and consolidation tools", async () => {
    const { runner, progress, artifacts, checkpoints, calls } = runnerWithToolBatches([
      candidateTools(),
      promotionTools(),
    ]);

    const result = await runner.run(baseRunInput);

    expect(result.requirementMap?.requirements).toHaveLength(2);
    expect(
      result.requirementMap?.requirements.map((requirement) => requirement.requirementId),
    ).toEqual(["req-001", "req-002"]);
    expect(result.requirementMap?.coverage).toMatchObject({
      status: "complete",
      windowCount: 1,
      coveredWindowCount: 1,
      candidateCount: 2,
      requirementCount: 2,
    });
    expect(result.requirementMap?.requirements[0]).toMatchObject({
      text: expect.stringContaining("RequirementMap intake"),
      role: "runnable_work",
    });
    expect(JSON.stringify(result.requirementMap)).not.toContain("doneWhen");
    expect(JSON.stringify(calls)).not.toContain("doneWhen");
    expect(result.requirementMap?.requirements[0]?.sourceRefs[0]).toMatch(/^source-prompt:\/\//u);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.modelTaskCallSite).toBe("intake.requirement_map.window_extraction");
    expect(calls[0]?.allowedToolNames).toEqual(
      expect.arrayContaining([requirementProviderToolName("requirement.record_candidate")]),
    );
    expect(calls[0]?.maxAttempts).toBe(1);
    const extractionPayload = calls[0]?.userPayload as Record<string, unknown>;
    expect(extractionPayload).toMatchObject({
      windowIndex: 0,
      windowCount: 1,
      promptWindowRef: expect.stringMatching(/^source-prompt:\/\//u),
      promptWindowStart: 0,
      visiblePromptWindowText: expect.stringContaining("RequirementMap intake"),
      roleGuide: expect.any(Object),
    });
    expect(extractionPayload).not.toHaveProperty("artifactKind");
    expect(extractionPayload).not.toHaveProperty("schemaVersion");
    expect(extractionPayload).not.toHaveProperty("mapId");
    expect(extractionPayload).not.toHaveProperty("sourcePromptBodyRef");
    expect(extractionPayload).not.toHaveProperty("sourcePromptHash");
    expect(extractionPayload).not.toHaveProperty("globalObjectiveHint");
    expect(extractionPayload).not.toHaveProperty("rawPromptStored");
    expect(extractionPayload).not.toHaveProperty("rawResponseStored");
    expect(extractionPayload).not.toHaveProperty("rawProviderLogStored");
    expect(calls[1]?.modelTaskCallSite).toBe("intake.requirement_map.native_tool_batch");
    expect(calls[1]?.allowedToolNames).toEqual(
      expect.arrayContaining([requirementProviderToolName("requirement.promote")]),
    );
    expect(calls[1]?.userPayload).toEqual(
      expect.objectContaining({
        candidateClusterCount: 1,
        candidateCluster: expect.objectContaining({
          candidateCount: 2,
          candidates: expect.arrayContaining([
            expect.objectContaining({ candidateId: "cand-0001" }),
            expect.objectContaining({ candidateId: "cand-0002" }),
          ]),
        }),
      }),
    );
    expect(JSON.stringify(calls)).not.toContain("requirement_add_batch");
    expect(JSON.stringify(calls)).not.toContain("mission_ledger");
    expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
      expect.arrayContaining([SOURCE_PROMPT_ARTIFACT_TYPE, REQUIREMENT_MAP_ARTIFACT_TYPE]),
    );
    const requirementArtifact = artifacts.find(
      (artifact) => artifact.artifactType === REQUIREMENT_MAP_ARTIFACT_TYPE,
    );
    expect(JSON.stringify(requirementArtifact?.metadata ?? {})).not.toContain(
      "Implement RequirementMap intake as the canonical pre-scheduler decomposition product.",
    );
    expect(JSON.stringify(requirementArtifact?.metadata ?? {}).length).toBeLessThan(8_000);
    expect(checkpoints).toEqual([
      expect.objectContaining({
        checkpointKind: "requirement_map",
        acceptedArtifactRefs: [result.requirementMap?.mapRef],
      }),
    ]);
    expect(progress.find((item) => item.currentPhase === "requirement_map_accepted")).toBeTruthy();
  });

  it("runtime owns canonical requirement ids, refs, and hashes instead of model handles", async () => {
    const { runner } = runnerWithToolBatches([candidateTools(), promotionTools()]);

    const result = await runner.run(baseRunInput);

    expect(result.requirementMap?.requirements[0]?.requirementId).toBe("req-001");
    expect(result.requirementMap?.mapRef).toMatch(
      /^runtime-job:\/\/job-intake\/requirement-map\//u,
    );
    expect(result.requirementMap?.mapHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.requirementMap?.sourcePromptBodyRef).toMatch(/^source-prompt:\/\//u);
    expect(JSON.stringify(result.requirementMap)).not.toContain("sourceEvidence");
    expect(JSON.stringify(result.requirementMap)).not.toContain("evidenceContract");
  });

  it("walks every bounded source-prompt window before accepting a long RequirementMap", async () => {
    const previousWindowChars = process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_CHARS;
    const previousOverlapChars = process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_OVERLAP_CHARS;
    process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_CHARS = "2000";
    process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_OVERLAP_CHARS = "200";
    try {
      const longPrompt = [
        "First requirement: implement the canonical intake coverage loop.",
        "A".repeat(1800),
        "Second requirement: scheduler must receive RequirementMap, not mission ledger.",
        "B".repeat(1800),
        "Third requirement: workers must keep source prompt refs for grounding.",
        "C".repeat(1800),
      ].join("\n\n");
      const windows = buildRequirementPromptWindows({
        promptText: longPrompt,
        promptHash: "sha256:fixture",
        sourcePromptBodyRef: "source-prompt://fixture/body",
        windowChars: 2000,
        overlapChars: 200,
      });
      expect(windows.length).toBeGreaterThan(1);
      const extractionBatches = windows.map((window, index): NativeToolFixture[] => [
        {
          tool: "requirement.record_candidate",
          input: {
            text: `Requirement candidate from prompt window ${index + 1}.`,
            evidenceExcerpt: window.text.slice(0, 120).trim(),
          },
        },
      ]);
      const { runner, calls } = runnerWithToolBatches([
        ...extractionBatches,
        [
          {
            tool: "requirement.promote",
            input: {
              candidateIds: windows.map((_, index) => `cand-${String(index + 1).padStart(4, "0")}`),
              text: "Implement the canonical intake coverage loop, scheduler handoff, and source prompt grounding.",
              role: "runnable_work",
            },
          },
        ],
      ]);

      const result = await runner.run({
        ...baseRunInput,
        objectiveForModel: longPrompt,
      });

      expect(calls).toHaveLength(windows.length * 2);
      expect(result.requirementMap?.coverage.windowCount).toBe(windows.length);
      expect(result.requirementMap?.coverage.coveredWindowCount).toBe(windows.length);
      expect(result.requirementMap?.coverage.candidateCount).toBe(windows.length);
    } finally {
      if (previousWindowChars === undefined) {
        delete process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_CHARS;
      } else {
        process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_CHARS = previousWindowChars;
      }
      if (previousOverlapChars === undefined) {
        delete process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_OVERLAP_CHARS;
      } else {
        process.env.OPENCLAW_REQUIREMENT_MAP_WINDOW_OVERLAP_CHARS = previousOverlapChars;
      }
    }
  });

  it("defaults RequirementMap prompt windows to smaller raw-prompt ranges", () => {
    const prompt = [
      "First requirement: keep source prompt windows raw and bounded.",
      "A".repeat(2_900),
      "Second requirement: keep extraction focused.",
      "B".repeat(2_900),
      "Third requirement: preserve overlap for boundary recovery.",
    ].join("\n\n");

    const windows = buildRequirementPromptWindows({
      promptText: prompt,
      promptHash: "sha256:fixture",
      sourcePromptBodyRef: "source-prompt://fixture/body",
    });

    expect(windows.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...windows.map((window) => window.text.length))).toBeLessThanOrEqual(3_000);
    expect(windows.every((window) => window.windowRef.startsWith("source-prompt://"))).toBe(true);
  });

  it("keeps RequirementMap provider tool schemas soft while runtime owns hard validation", () => {
    const [recordCandidate] = requirementNativeToolDefinitions(["requirement.record_candidate"]);
    const schema = recordCandidate?.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.additionalProperties).toBe(true);
    expect(schema).not.toHaveProperty("required");
    expect(properties.text).not.toHaveProperty("minLength");
    expect(properties.text).not.toHaveProperty("maxLength");
    expect(properties.evidenceExcerpt).not.toHaveProperty("minLength");
    expect(properties.evidenceExcerpt).not.toHaveProperty("maxLength");
    expect(recordCandidate?.description).toContain("Prefer fields text and evidenceExcerpt");
    expect(recordCandidate?.description).toContain("Runtime owns hard validation");
  });

  it("blocks with typed diagnostics when prompt windows are not covered", async () => {
    const { runner, progress } = runnerWithToolBatches([
      [{ tool: "unknown.tool", input: {} }],
      [],
      [],
      [],
    ]);

    await expect(runner.run(baseRunInput)).rejects.toThrow("requirement_map_no_progress_collapsed");

    const blocked = progress.find((item) => item.currentPhase === "requirement_repair_no_progress");
    expect(blocked?.reasonCodes).toEqual(
      expect.arrayContaining([
        "requirement_map_no_progress_collapsed",
        "requirement_map_uncovered_prompt_windows",
        "requirement_map_no_promoted_requirements",
      ]),
    );
  });

  it("rejects runtime process artifacts as runnable operator requirements", async () => {
    const { runner, progress } = runnerWithToolBatches([
      processArtifactCandidateTools(),
      processArtifactPromotionTools(),
      [],
      [],
    ]);

    await expect(
      runner.run({
        ...baseRunInput,
        objectiveForModel: "Produce a RequirementMap artifact.",
      }),
    ).rejects.toThrow("requirement_map_no_progress_collapsed");

    const blocked = progress.find((item) => item.currentPhase === "requirement_repair_no_progress");
    expect(JSON.stringify(blocked?.toolCallTelemetry ?? {})).toContain(
      "requirement_rejected_runtime_process_artifact",
    );
  });

  it("blocks oversized requirement fields with typed RequirementMap diagnostics", async () => {
    const { runner, progress } = runnerWithToolBatches([
      candidateTools(),
      oversizedPromotionTools(),
      [],
      [],
    ]);

    await expect(runner.run(baseRunInput)).rejects.toThrow("requirement_map_no_progress_collapsed");

    const compile = progress.find((item) => item.currentPhase === "requirement_map_compile");
    expect(compile?.reasonCodes).toEqual(
      expect.arrayContaining([
        "requirement_map_compile_blocked_before_repair",
        "requirement_map_field_too_long",
        "requirement_missing:promo-0001:text_too_long",
      ]),
    );
    expect(JSON.stringify(compile?.toolCallTelemetry ?? {})).not.toContain("doneWhen");
  });
});
