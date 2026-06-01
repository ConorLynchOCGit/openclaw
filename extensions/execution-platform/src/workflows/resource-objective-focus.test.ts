import { describe, expect, it } from "vitest";
import {
  assertResourceObjectiveFocusManifestMetadata,
  buildResourceObjectiveFocusLegalRefUniverse,
  buildResourceObjectiveFocusLegalRefUniverseManifest,
  buildResourceObjectiveFocusManifest,
  compileResourceObjectiveFocus,
  compileResourceObjectiveFocusToolOutput,
  normalizeResourceObjectiveFocusSelectedRefHandles,
  selectedRefsFromResourceObjectiveFocus,
} from "./resource-objective-focus.ts";

function legalRefUniverse() {
  return buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "job-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
    nodeExecutionContractRef: "runtime-work-graph://graph-1/node-contract/impl-1",
    sourceContextBrokerRequestRef: "runtime-job://job-1/context-broker/request-1",
    refs: [
      {
        ref: "extensions/execution-platform/src/workflows/resource-requirement-packet.ts",
        kind: "candidate_resource_ref",
        boundedLabel: "resource requirement compiler",
        byteEstimate: 8_000,
      },
      {
        ref: "extensions/execution-platform/src/workflows/context-scout-execution-packet.ts",
        kind: "repo_area",
        boundedLabel: "resource scout packet compiler",
        byteEstimate: 9_000,
      },
      {
        ref: "pnpm test:file extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts",
        kind: "validation_ref",
        boundedLabel: "Focused requirement tests",
      },
    ],
    maxSelectableHandles: 3,
    maxSemanticQuestions: 3,
  });
}

describe("ResourceObjectiveFocus", () => {
  it("accepts model-authored focus over legal handles without runtime semantic ranking", () => {
    const universe = legalRefUniverse();
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      nodeExecutionContractRef: "runtime-work-graph://graph-1/node-contract/impl-1",
      currentObjectiveSlot: "domain-resource-selection-context",
      resourceUseKind: "domain_resource_selection",
      nextUnknown: "Which compiler files should the implementation inspect first?",
      expectedUse: "Compile a focused resource requirement without broad scout payloads.",
      legalRefUniverse: universe,
      selectedRefHandles: universe.handles.slice(0, 2).map((handle) => handle.handle),
      selectedSemanticQuestions: [
        "Which compiler boundary currently copies broad context into scout packets?",
      ],
      stopWhenAnswered: "Stop once exact compiler and scout packet files are known.",
    });

    expect(focus.status).toBe("accepted");
    expect(focus.semanticQualityJudgedByDeterministicCode).toBe(false);
    expect(focus.reasonCodes).toContain(
      "resource_objective_focus_runtime_validated_legal_ref_handles",
    );
    expect(selectedRefsFromResourceObjectiveFocus({ focus, legalRefUniverse: universe })).toEqual(
      [
        "extensions/execution-platform/src/workflows/resource-requirement-packet.ts",
        "extensions/execution-platform/src/workflows/context-scout-execution-packet.ts",
      ],
    );
  });

  it("blocks selected refs outside the legal universe", () => {
    const universe = legalRefUniverse();
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      currentObjectiveSlot: "domain-resource-selection-context",
      resourceUseKind: "domain_resource_selection",
      nextUnknown: "Which files matter?",
      expectedUse: "Build a focused resource requirement.",
      legalRefUniverse: universe,
      selectedRefHandles: ["candidate_resource_ref:not-in-universe"],
      selectedSemanticQuestions: ["Which files matter?"],
    });

    expect(focus.status).toBe("blocked");
    expect(focus.reasonCodes).toContain("resource_objective_focus_selected_ref_not_legal");
  });

  it("defaults invalid model resource-use wording to shared resource grounding", () => {
    const universe = legalRefUniverse();
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "job-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-planning",
      currentObjectiveSlot: "planning-resource-focus",
      resourceUseKind: "planning_context",
      nextUnknown: "Which planning resource should be opened?",
      expectedUse: "Use selected planning resources for capsule drafting.",
      legalRefUniverse: universe,
      selectedRefHandles: [universe.handles[0].handle],
      selectedSemanticQuestions: ["Which resource constrains the planning capsule?"],
    });

    expect(focus.status).toBe("accepted");
    expect(focus.resourceUseKind).toBe("resource_grounding");
    expect(focus.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("normalizes exact legal refs into handles without selecting or ranking refs", () => {
    const universe = legalRefUniverse();
    const selectedRefHandles = normalizeResourceObjectiveFocusSelectedRefHandles({
      legalRefUniverse: universe,
      selectedRefHandles: [universe.handles[0].ref],
      selectedRefs: [universe.handles[1].ref],
    });
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      currentObjectiveSlot: "domain-resource-selection-context",
      resourceUseKind: "domain_resource_selection",
      nextUnknown: "Which files matter?",
      expectedUse: "Build a focused resource requirement.",
      legalRefUniverse: universe,
      selectedRefHandles,
      selectedSemanticQuestions: ["Which files matter?"],
    });

    expect(selectedRefHandles).toEqual([
      universe.handles[0].handle,
      universe.handles[1].handle,
    ]);
    expect(focus.status).toBe("accepted");
  });

  it("projects bounded manifests without focus body fields", () => {
    const universe = legalRefUniverse();
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
      currentObjectiveSlot: "validation-context",
      resourceUseKind: "validation_planning",
      nextUnknown: "Which validation command should prove the requirement compiler?",
      expectedUse: "Compile a focused validation requirement.",
      legalRefUniverse: universe,
      selectedRefHandles: [universe.handles[2].handle],
      selectedSemanticQuestions: ["Which focused validation proves the compiler boundary?"],
    });

    const focusManifest = buildResourceObjectiveFocusManifest(focus);
    const universeManifest = buildResourceObjectiveFocusLegalRefUniverseManifest(universe);

    expect(focusManifest).not.toHaveProperty("selectedSemanticQuestions");
    expect(universeManifest).not.toHaveProperty("handles");
    expect(() => assertResourceObjectiveFocusManifestMetadata(focusManifest)).not.toThrow();
    expect(() => assertResourceObjectiveFocusManifestMetadata(universeManifest)).not.toThrow();
  });

  it("exposes small-verb tool output with bounded metadata", () => {
    const universe = legalRefUniverse();
    const output = compileResourceObjectiveFocusToolOutput({
      toolId: "resource.scout.submit_exact_handles",
      volatileInput: {
        legalRefUniverse: universe,
        workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
        currentObjectiveSlot: "edit-planning-context",
        resourceUseKind: "domain_action_planning",
        nextUnknown: "Which edit boundary should be inspected?",
        expectedUse: "Prepare edit planning for the consumer node.",
        selectedRefHandles: [universe.handles[0].handle],
        selectedSemanticQuestions: ["Where does the current broad payload enter the compiler?"],
      },
    });

    expect(output.status).toBe("succeeded");
    expect(output.reasonCodes).toContain("resource_objective_focus_accepted");
    expect(JSON.stringify(output.metadata)).not.toContain("selectedSemanticQuestions");
  });

  it("accepts exact legal refs in small-verb output as handle aliases", () => {
    const universe = legalRefUniverse();
    const output = compileResourceObjectiveFocusToolOutput({
      toolId: "resource.scout.submit_exact_handles",
      volatileInput: {
        legalRefUniverse: universe,
        workIntentRef: "runtime-work-graph://graph-1/node/work-intent-1",
        currentObjectiveSlot: "edit-planning-context",
        resourceUseKind: "domain_action_planning",
        nextUnknown: "Which edit boundary should be inspected?",
        expectedUse: "Prepare edit planning for the consumer node.",
        selectedRefHandles: [universe.handles[0].ref],
        selectedSemanticQuestions: ["Where does the current broad payload enter the compiler?"],
      },
    });

    expect(output.status).toBe("succeeded");
    expect(output.focus?.selectedRefHandles).toEqual([universe.handles[0].handle]);
  });
});
