import { describe, expect, it } from "vitest";
import {
  summarizeRequirementMapForScheduler,
  type RequirementMap,
  type RequirementRole,
} from "./requirement-map.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import {
  applySchedulerStageToolResults,
  createSchedulerDraftState,
  evaluateSchedulerStage,
  resolveSchedulerStageModelPolicy,
  schedulerStageMaxToolCalls,
  SchedulerStageRunner,
  type SchedulerRequirementInventory,
} from "./scheduler-stage-runner.ts";

function requirement(
  requirementId: string,
  text: string,
  role: RequirementRole,
): RequirementMap["requirements"][number] {
  return {
    requirementId,
    text,
    role,
    sourceRefs: [`source-prompt://scheduler-stage-regression/${requirementId}`],
  };
}

function schedulerRequirementMap(): RequirementMap {
  return {
    artifactKind: "requirement_map",
    schemaVersion: "execution-platform.requirement-map.v2",
    mapId: "scheduler-stage-regression-requirement-map",
    mapRef: "runtime-job://scheduler-stage-regression/requirement-map/fixture",
    mapHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    sourcePromptBodyRef: "source-prompt://scheduler-stage-regression/body",
    sourcePromptHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    sourcePromptLength: 4096,
    requirements: [
      requirement("req-impl-core", "Implement the product/spec plugin core.", "runnable_work"),
      requirement(
        "req-source-grounding",
        "Ground implementation in existing source and docs.",
        "context",
      ),
      requirement(
        "req-validation",
        "Validate the implementation after worker evidence.",
        "validation",
      ),
      requirement("req-review", "Review completed implementation evidence.", "review"),
      requirement("req-closeout", "Close out after accepted validation evidence.", "closeout"),
      requirement("req-constraint", "Do not weaken existing tests.", "constraint"),
    ],
    coverage: {
      status: "complete",
      promptLength: 4096,
      windowCount: 3,
      coveredWindowCount: 3,
      candidateCount: 6,
      requirementCount: 6,
      retiredCandidateCount: 0,
      coverageHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    },
    reasonCodes: ["requirement_map_fixture_accepted"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function schedulerRequirementInventory(): SchedulerRequirementInventory {
  const requirementMap = schedulerRequirementMap();
  return {
    artifactKind: "scheduler_requirement_inventory",
    schemaVersion: "execution-platform.scheduler-requirement-inventory.v1",
    inventoryId: "scheduler-stage-regression-requirements",
    inventoryRef: "runtime-job://scheduler-stage-regression/requirement-inventory/fixture",
    inventoryHash: "sha256:scheduler-stage-regression-fixture",
    graphId: "scheduler-stage-regression-requirements",
    graphRef: "runtime-job://scheduler-stage-regression/requirement-inventory/fixture",
    graphHash: "sha256:scheduler-stage-regression-fixture",
    sourceRequirementMapRef: requirementMap.mapRef,
    requirements: [
      {
        requirementId: "req-impl-core",
        requirementKind: "implementation",
        primaryMissionRole: "core_execution",
        commitmentIds: ["req-impl-core"],
        ownerIntentSummary: "Implement the product/spec plugin core.",
        successCondition: "Implementation evidence exists.",
        evidenceExpectation: "Changed files and validation evidence.",
        expectedEvidenceModes: ["changed_files", "validation_report"],
        authorityScopeRefs: ["repo-scope://extensions/execution-platform"],
        dependencyRefs: [],
        independentRootRationale: null,
        constraintRefs: [],
        sourceRefs: [requirementMap.sourcePromptBodyRef],
        targetSubjectRefs: ["workflow://agent_team.product_spec_planning"],
        riskRefs: [],
        selectedCapabilityHints: ["implementation_microtask"],
        executionIntentHint: "source_edit",
        sourceMaterialRequirementKinds: ["repo_source"],
      },
      {
        requirementId: "req-validation",
        requirementKind: "validation",
        primaryMissionRole: "validation",
        commitmentIds: ["req-validation"],
        ownerIntentSummary: "Validate the implementation after worker evidence.",
        successCondition: "Validation evidence exists.",
        evidenceExpectation: "Validation evidence.",
        expectedEvidenceModes: ["validation_report"],
        authorityScopeRefs: [],
        dependencyRefs: [],
        independentRootRationale: null,
        constraintRefs: [],
        sourceRefs: [requirementMap.sourcePromptBodyRef],
        targetSubjectRefs: [],
        riskRefs: [],
        selectedCapabilityHints: ["validation_run"],
        executionIntentHint: "validation",
        sourceMaterialRequirementKinds: [],
      },
      {
        requirementId: "req-review",
        requirementKind: "review",
        primaryMissionRole: "review",
        commitmentIds: ["req-review"],
        ownerIntentSummary: "Review completed implementation evidence.",
        successCondition: "Review evidence exists.",
        evidenceExpectation: "Review evidence.",
        expectedEvidenceModes: ["review_report"],
        authorityScopeRefs: [],
        dependencyRefs: [],
        independentRootRationale: null,
        constraintRefs: [],
        sourceRefs: [requirementMap.sourcePromptBodyRef],
        targetSubjectRefs: [],
        riskRefs: [],
        selectedCapabilityHints: ["reviewer"],
        executionIntentHint: "review",
        sourceMaterialRequirementKinds: [],
      },
      {
        requirementId: "req-closeout",
        requirementKind: "closeout",
        primaryMissionRole: "closeout",
        commitmentIds: ["req-closeout"],
        ownerIntentSummary: "Close out after accepted validation evidence.",
        successCondition: "Closeout evidence exists.",
        evidenceExpectation: "Closeout evidence.",
        expectedEvidenceModes: ["closeout"],
        authorityScopeRefs: [],
        dependencyRefs: [],
        independentRootRationale: null,
        constraintRefs: [],
        sourceRefs: [requirementMap.sourcePromptBodyRef],
        targetSubjectRefs: [],
        riskRefs: [],
        selectedCapabilityHints: ["coding_closeout"],
        executionIntentHint: "closeout",
        sourceMaterialRequirementKinds: [],
      },
    ],
    blockedRequirementIds: [],
    reasonCodes: ["requirement_inventory_fixture_accepted"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function implementationOnlySchedulerRequirementInventory(): SchedulerRequirementInventory {
  const inventory = schedulerRequirementInventory();
  return {
    ...inventory,
    requirements: inventory.requirements.filter(
      (requirement) => requirement.requirementKind === "implementation",
    ),
  };
}

const snapshotSummary = {
  graphId: "scheduler-stage-regression-graph",
  workflowId: "agent_team.coding",
  status: "running",
  nodeCount: 0,
  edgeCount: 0,
  roleInvocationCount: 0,
  nodeKinds: [],
  activeNodes: [],
  edges: [],
} as never;

describe("SchedulerStageRunner graph patch path", () => {
  it("uses high-reasoning Codex policy for scheduler work-unit coverage", () => {
    expect(resolveSchedulerStageModelPolicy("work_unit_coverage_required")).toMatchObject({
      modelRef: "openai-codex/gpt-5.5",
      providerPath: "codex_app_server",
      taskClass: "global_reasoning",
      reasoningEffort: "high",
      requiredTransport: "native_multi_tool_turn",
      parallelismPolicy: "single_turn_multi_tool",
    });
  });

  it("keeps Qwen capability fill as focused no-reasoning sessions", () => {
    expect(resolveSchedulerStageModelPolicy("capability_selection_required")).toMatchObject({
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      taskClass: "tool_selection",
      reasoningEffort: "none",
      requiredTransport: "native_single_tool",
      parallelismPolicy: "parallel_focused_sessions",
    });
  });

  it("accepts SchedulerGraphPatch node specs without submit phases or WorkIntent nodes", async () => {
    const requirementMap = schedulerRequirementMap();
    const result = await new SchedulerStageRunner().run({
      graphId: "scheduler-stage-patch-graph",
      iteration: 1,
      snapshotSummary,
      requirementMap,
      requirementMapSummary: summarizeRequirementMapForScheduler(requirementMap),
      requirementMapAccepted: true,
      requirementInventory: null,
      requirementInventorySummary: null,
      closureRunMode: "proof",
      recentNodeResultSummaries: [],
      capabilityRegistrySummary: null,
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      maxSchedulerToolTurns: 8,
      callSchedulerTool: async (input) => ({
        toolId: "scheduler.add_capability_selection",
        input: {
          workUnitId: "wu-impl-core",
          selectedCapabilityId: "implementation_microtask",
        },
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        providerToolName: "scheduler_add_capability_selection",
        latencyMs: 1,
        reasonCodes: ["fixture_capability_selected"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
      callSchedulerTools: async (input) => {
        expect(input.allowedToolNames.every((toolName) => !toolName.includes("_submit_"))).toBe(
          true,
        );
        if (input.phase === "work_unit_coverage_required") {
          return [
            {
              toolId: "scheduler.open_work_unit_from_requirement",
              input: { requirementId: "req-impl-core" },
              modelRef: input.modelRef,
              providerPath: input.providerPath,
              providerToolName: "scheduler_open_work_unit_from_requirement",
              latencyMs: 1,
              reasonCodes: ["fixture_implementation_unit_opened"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          ];
        }
        return [];
      },
      recordTool: async () => ({ refs: [], reasonCodes: [] }),
      recordCheckpoint: async () => {},
    });

    expect(result.status).toBe("accepted_graph");
    if (result.status !== "accepted_graph") {
      throw new Error(`expected_accepted_graph:${result.reasonCodes.join(",")}`);
    }
    expect(result.nodeSpecs).toHaveLength(4);
    expect(result.nodeSpecs.map((node) => node.nodeKind).toSorted()).toEqual([
      "closeout",
      "implementation",
      "reviewer",
      "validation",
    ]);
    expect(
      result.nodeSpecs
        .map((node) => node.capabilityId)
        .filter((capabilityId): capabilityId is string => typeof capabilityId === "string")
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["coding_closeout", "implementation_microtask", "reviewer", "validation_run"]);
    expect(result.nodeSpecs.every((node) => node.nodeKind !== "work_intent")).toBe(true);
    expect(result.edgeSpecs.length).toBeGreaterThanOrEqual(3);
    const validationTail = result.nodeSpecs.find((node) => node.capabilityId === "validation_run");
    const reviewTail = result.nodeSpecs.find((node) => node.capabilityId === "reviewer");
    const closeoutTail = result.nodeSpecs.find((node) => node.capabilityId === "coding_closeout");
    expect(validationTail?.metadata).toEqual(
      expect.objectContaining({
        missionTailKind: "validation",
        validationPhase: "final_proof_validation",
        nodeLifecycleRunnerOwnsExecution: true,
      }),
    );
    expect(reviewTail?.metadata).toEqual(
      expect.objectContaining({
        missionTailKind: "review",
        nodeLifecycleRunnerOwnsExecution: true,
      }),
    );
    expect(closeoutTail?.metadata).toEqual(
      expect.objectContaining({
        missionTailKind: "closeout",
        nodeLifecycleRunnerOwnsExecution: true,
      }),
    );
    expect(reviewTail?.metadata).not.toEqual(
      expect.objectContaining({ validationPhase: expect.anything() }),
    );
    expect(closeoutTail?.metadata).not.toEqual(
      expect.objectContaining({ validationPhase: expect.anything() }),
    );
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "scheduler_graph_patch_mission_tail_policy_applied",
        "scheduler_graph_patch_closure_run_mode:proof",
      ]),
    );
    expect(result.graphPatch.requirementCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementId: "req-validation",
          disposition: "covered_by_node",
        }),
        expect.objectContaining({ requirementId: "req-review", disposition: "covered_by_node" }),
        expect.objectContaining({ requirementId: "req-closeout", disposition: "covered_by_node" }),
        expect.objectContaining({
          requirementId: "req-constraint",
          disposition: "carried_as_constraint",
        }),
      ]),
    );
  });

  it("uses direct native tool result application without a structured-output envelope", () => {
    const requirementInventory = implementationOnlySchedulerRequirementInventory();
    const draft = createSchedulerDraftState(1);
    const projectionBefore = evaluateSchedulerStage({ state: draft, requirementInventory });
    const patch = applySchedulerStageToolResults({
      baseDraft: draft,
      requirementInventory,
      maxToolCalls: schedulerStageMaxToolCalls(projectionBefore),
      allowedToolIds: projectionBefore.allowedToolIds,
      toolCalls: [
        {
          toolId: "scheduler.open_work_unit_from_requirement",
          input: { requirementId: "req-impl-core" },
        },
      ],
    });
    const projectionAfter = evaluateSchedulerStage({ state: patch.draft, requirementInventory });

    expect(patch.modelToolCallCount).toBe(1);
    expect(patch.appliedToolIds).toEqual(["scheduler.open_work_unit_from_requirement"]);
    expect(projectionAfter.uncoveredRunnableRequirementIds).toEqual([]);
    expect(projectionAfter.phase).toBe("capability_selection_required");
  });

  it("auto-binds the only legal capability hint and compiles without a capability model turn", async () => {
    const requirementMap = schedulerRequirementMap();
    const requirementInventory = schedulerRequirementInventory();
    const singleCalls: string[] = [];
    const batchCalls: string[] = [];
    const result = await new SchedulerStageRunner().run({
      graphId: "scheduler-stage-auto-bind-graph",
      iteration: 1,
      snapshotSummary,
      requirementMap,
      requirementMapSummary: summarizeRequirementMapForScheduler(requirementMap),
      requirementMapAccepted: true,
      requirementInventory,
      requirementInventorySummary: {
        requirementCount: requirementInventory.requirements.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      recentNodeResultSummaries: [],
      capabilityRegistrySummary: null,
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      maxSchedulerToolTurns: 4,
      callSchedulerTool: async (input) => {
        singleCalls.push(input.phase);
        throw new Error("capability_auto_bind_should_avoid_single_capability_turn");
      },
      callSchedulerTools: async (input) => {
        batchCalls.push(input.phase);
        expect(input.requiredTransport).toBe("native_multi_tool_turn");
        return [
          {
            toolId: "scheduler.open_work_unit_from_requirement",
            input: { requirementId: "req-impl-core" },
            modelRef: input.modelRef,
            providerPath: input.providerPath,
            providerToolName: "scheduler_open_work_unit_from_requirement",
            latencyMs: 1,
            reasonCodes: ["fixture_batch_tool_transport_used"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ];
      },
      recordTool: async () => ({ refs: [], reasonCodes: [] }),
      recordCheckpoint: async () => {},
    });

    expect(batchCalls).toEqual(["work_unit_coverage_required"]);
    expect(singleCalls).toEqual([]);
    expect(result.status).toBe("accepted_graph");
    if (result.status !== "accepted_graph") {
      throw new Error(`expected_accepted_graph:${result.reasonCodes.join(",")}`);
    }
    expect(result.reasonCodes).toContain(
      "scheduler_capability_runtime_auto_bound:wu-impl-core:implementation_microtask",
    );
  });

  it("treats a complete patch state as compile-ready without submit phases", () => {
    const draft = createSchedulerDraftState(1);
    draft.workBreakdownUnitsById = {
      "wu-impl-core": {
        workUnitId: "wu-impl-core",
        objective: "Implement the core change.",
        executionIntent: "source_edit",
        commitmentIds: ["req-impl-core"],
        requirementIds: ["req-impl-core"],
        expectedOutcome: "Changed-file refs.",
        successCriteria: ["Implementation evidence exists."],
      },
    };
    draft.capabilitySelectionsByWorkUnitId = {
      "wu-impl-core": {
        workUnitId: "wu-impl-core",
        selectedCapabilityId: "implementation_microtask",
      },
    };
    draft.nodeContractDraftsByWorkUnitId = {
      "wu-impl-core": {
        workUnitId: "wu-impl-core",
        executionIntent: "source_edit",
        objective: "Implement the core change.",
        expectedOutput: "Changed-file refs.",
        successCriteria: ["Implementation evidence exists."],
      },
    };

    const projection = evaluateSchedulerStage({
      state: draft,
      requirementInventory: implementationOnlySchedulerRequirementInventory(),
    });

    expect(projection.phase).toBe("compiled_graph_ready");
    expect(projection.allowedToolIds).toEqual([]);
  });
});
