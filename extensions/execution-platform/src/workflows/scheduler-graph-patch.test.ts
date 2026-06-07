import { describe, expect, it } from "vitest";
import type { OrchestratorGraphNodeSpec } from "./orchestrator-graph-decision.ts";
import type { RequirementMap, RequirementRole } from "./requirement-map.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import { validateSchedulerGraphAdmission } from "./scheduler-graph-admission.ts";
import {
  compileSchedulerGraphPatch,
  type SchedulerGraphPatchCompileInput,
} from "./scheduler-graph-patch.ts";

function requirement(
  requirementId: string,
  role: RequirementRole,
): RequirementMap["requirements"][number] {
  return {
    requirementId,
    role,
    text: `Requirement ${requirementId}`,
    sourceRefs: [`source-prompt://scheduler-graph-patch/${requirementId}`],
  };
}

function requirementMap(): RequirementMap {
  return {
    artifactKind: "requirement_map",
    schemaVersion: "execution-platform.requirement-map.v2",
    mapId: "scheduler-graph-patch-map",
    mapRef: "runtime-job://scheduler-graph-patch/requirement-map",
    mapHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourcePromptBodyRef: "source-prompt://scheduler-graph-patch/body",
    sourcePromptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    sourcePromptLength: 8192,
    requirements: [
      requirement("req-impl", "runnable_work"),
      requirement("req-test", "runnable_work"),
      requirement("req-validation", "validation"),
      requirement("req-review", "review"),
      requirement("req-closeout", "closeout"),
      requirement("req-context", "context"),
      requirement("req-constraint", "constraint"),
    ],
    coverage: {
      status: "complete",
      promptLength: 8192,
      windowCount: 4,
      coveredWindowCount: 4,
      candidateCount: 7,
      requirementCount: 7,
      retiredCandidateCount: 0,
      coverageHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
    reasonCodes: ["requirement_map_fixture"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function compileInput(
  closureRunMode: SchedulerGraphPatchCompileInput["closureRunMode"],
): SchedulerGraphPatchCompileInput {
  return {
    graphId: "scheduler-graph-patch-regression",
    iteration: 1,
    requirementMap: requirementMap(),
    capabilityManifest: buildRuntimeNodeCapabilityManifest(),
    patchMode: "initial_graph",
    closureRunMode,
    workUnits: [
      {
        workUnitId: "wu-impl",
        requirementIds: ["req-impl"],
        commitmentIds: ["req-impl"],
        objective: "Implement the main source change.",
        executionIntent: "source_edit",
        expectedOutcome: "Source change evidence.",
        successCriteria: ["Source change evidence exists."],
      },
      {
        workUnitId: "wu-test",
        requirementIds: ["req-test"],
        commitmentIds: ["req-test"],
        objective: "Author focused tests for the source change.",
        executionIntent: "test_authoring",
        expectedOutcome: "Test authoring evidence.",
        successCriteria: ["Test evidence exists."],
      },
    ],
    capabilitySelections: [
      {
        workUnitId: "wu-impl",
        selectedCapabilityId: "implementation_microtask",
      },
      {
        workUnitId: "wu-test",
        selectedCapabilityId: "test_authoring",
      },
    ],
    nodeContracts: [
      {
        workUnitId: "wu-impl",
        executionIntent: "source_edit",
        objective: "Implement the main source change.",
        expectedOutput: "Source change evidence.",
        successCriteria: ["Source change evidence exists."],
      },
      {
        workUnitId: "wu-test",
        executionIntent: "test_authoring",
        objective: "Author focused tests for the source change.",
        expectedOutput: "Test authoring evidence.",
        successCriteria: ["Test evidence exists."],
      },
    ],
    dependencyEdges: [],
  };
}

describe("compileSchedulerGraphPatch mission tail derivation", () => {
  it("derives tail nodes and admitted edges from core implementation and test-authoring work", () => {
    const result = compileSchedulerGraphPatch(compileInput("proof"));

    expect(result.valid).toBe(true);
    expect(
      result.nodeSpecs
        .map((node) => node.capabilityId)
        .filter((capabilityId): capabilityId is string => typeof capabilityId === "string")
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      "coding_closeout",
      "implementation_microtask",
      "reviewer",
      "test_authoring",
      "validation_run",
    ]);
    expect(result.nodeSpecs.map((node) => node.nodeId).toSorted()).toEqual([
      "seed-mission-closeout",
      "seed-mission-review",
      "seed-mission-validation",
      "seed-wu-impl",
      "seed-wu-test",
    ]);
    expect(result.patch?.nodeSeeds.some((seed) => "runtimeNodeId" in seed)).toBe(false);
    expect(result.reasonCodes).toContain("scheduler_graph_patch_semantic_seed_identity");
    const validationNode = result.nodeSpecs.find((node) => node.capabilityId === "validation_run");
    const reviewNode = result.nodeSpecs.find((node) => node.capabilityId === "reviewer");
    const closeoutNode = result.nodeSpecs.find((node) => node.capabilityId === "coding_closeout");
    expect(validationNode?.metadata).toEqual(
      expect.objectContaining({
        missionTailKind: "validation",
        validationPhase: "final_proof_validation",
      }),
    );
    expect(reviewNode?.metadata).toEqual(expect.objectContaining({ missionTailKind: "review" }));
    expect(closeoutNode?.metadata).toEqual(
      expect.objectContaining({ missionTailKind: "closeout" }),
    );
    expect(reviewNode?.metadata).not.toEqual(
      expect.objectContaining({ validationPhase: expect.anything() }),
    );
    expect(closeoutNode?.metadata).not.toEqual(
      expect.objectContaining({ validationPhase: expect.anything() }),
    );
    expect(result.edgeSpecs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: "seed-wu-impl",
          toNodeId: "seed-mission-validation",
          edgeKind: "validation_depends_on",
        }),
        expect.objectContaining({
          fromNodeId: "seed-wu-test",
          toNodeId: "seed-mission-validation",
          edgeKind: "validation_depends_on",
        }),
        expect.objectContaining({
          fromNodeId: "seed-mission-validation",
          toNodeId: "seed-mission-review",
          edgeKind: "review_depends_on",
        }),
        expect.objectContaining({
          fromNodeId: "seed-mission-review",
          toNodeId: "seed-mission-closeout",
          edgeKind: "closeout_depends_on",
        }),
      ]),
    );
    expect(result.patch?.requirementCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requirementId: "req-validation",
          disposition: "covered_by_node",
        }),
        expect.objectContaining({ requirementId: "req-review", disposition: "covered_by_node" }),
        expect.objectContaining({ requirementId: "req-closeout", disposition: "covered_by_node" }),
        expect.objectContaining({ requirementId: "req-context", disposition: "prompt_context" }),
        expect.objectContaining({
          requirementId: "req-constraint",
          disposition: "carried_as_constraint",
        }),
      ]),
    );
    expect(
      validateSchedulerGraphAdmission({
        nodes: result.nodeSpecs,
        edges: result.edgeSpecs,
        closureRunMode: "proof",
      }).valid,
    ).toBe(true);
  });

  it("derives standard validation phase in standard closure mode", () => {
    const result = compileSchedulerGraphPatch(compileInput("standard"));
    const validationNode = result.nodeSpecs.find((node) => node.capabilityId === "validation_run");

    expect(result.valid).toBe(true);
    expect(validationNode?.metadata).toEqual(
      expect.objectContaining({
        missionTailKind: "validation",
        validationPhase: "integration_validation",
      }),
    );
  });

  it("rejects graph admission when validation tail phase is missing or worker-local", () => {
    const result = compileSchedulerGraphPatch(compileInput("proof"));
    const missingPhaseNodes = result.nodeSpecs.map((node) => {
      if (node.nodeId !== "seed-mission-validation") {
        return node;
      }
      const metadata = { ...(node.metadata as Record<string, unknown>) };
      delete metadata.validationPhase;
      return { ...node, metadata: metadata as OrchestratorGraphNodeSpec["metadata"] };
    });
    const workerLocalNodes = result.nodeSpecs.map((node) =>
      node.nodeId === "seed-mission-validation"
        ? {
            ...node,
            metadata: {
              ...(node.metadata as Record<string, unknown>),
              validationPhase: "worker_post_edit_validation",
            },
          }
        : node,
    );

    expect(
      validateSchedulerGraphAdmission({
        nodes: missingPhaseNodes,
        edges: result.edgeSpecs,
        closureRunMode: "proof",
      }).reasonCodes,
    ).toContain("scheduler_graph_admission_tail_validation_phase_mismatch:seed-mission-validation");
    expect(
      validateSchedulerGraphAdmission({
        nodes: workerLocalNodes,
        edges: result.edgeSpecs,
        closureRunMode: "proof",
      }).reasonCodes,
    ).toEqual(
      expect.arrayContaining([
        "scheduler_graph_admission_tail_validation_phase_mismatch:seed-mission-validation",
        "scheduler_graph_admission_worker_local_validation_phase_on_graph_tail:seed-mission-validation",
      ]),
    );
  });
});
