import { describe, expect, it } from "vitest";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import { compileWorkIntent } from "./work-intent.ts";

describe("WorkIntent contract compiler", () => {
  const capabilityManifest = buildRuntimeNodeCapabilityManifest();

  it("compiles explicit source-edit intent into a non-runnable WorkIntent node", () => {
    const compiled = compileWorkIntent({
      decisionId: "decision-work-intent",
      workUnitId: "implementation-edit",
      title: "Implementation edit",
      objective: "Apply a scoped workflow registration edit.",
      commitmentIds: ["workflow-registration"],
      executionIntent: "source_edit",
      selectedCapabilityId: "implementation_microtask",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      capabilityRationale: "The edit is bounded after context is available.",
      costRationale: "Try the cheaper bounded file-edit worker first.",
      expectedOutput: "Changed-file refs and validation refs.",
      successCriteria: ["Edits approved files.", "Runs focused validation."],
      downstreamConsumer: "validation",
      targetRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
      capabilityManifest,
    });

    expect(compiled.workIntent).not.toBeNull();
    expect(compiled.node).toMatchObject({
      nodeKind: "work_intent",
      assignedRole: "work_intent",
      modelOrWorkerRef: null,
      commitmentIdsAdvanced: ["workflow-registration"],
    });
    expect(compiled.node?.metadata).toMatchObject({
      workIntentCompiled: true,
      stagedSchedulerProtocolCompiled: true,
      genericSchedulerProtocolCompiled: true,
      executionIntent: "source_edit",
      selectedCapabilityId: "implementation_microtask",
      targetCapabilityGraphNodeKind: "implementation",
      targetCapabilityExecutorKey: "kind:implementation",
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      semanticQualityJudgedByDeterministicCode: false,
    });
    expect(
      compiled.workIntent?.resourceRequirements.map((requirement) => requirement.requirementKind),
    ).toEqual(
      expect.arrayContaining([
        "context_handoff",
        "target_refs",
        "file_snapshots",
        "validation_refs",
      ]),
    );
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects missing execution intent instead of deriving semantics from capability", () => {
    const compiled = compileWorkIntent({
      decisionId: "decision-work-intent",
      workUnitId: "implementation-edit",
      objective: "Apply a scoped workflow registration edit.",
      commitmentIds: ["workflow-registration"],
      executionIntent: undefined,
      selectedCapabilityId: "implementation_microtask",
      capabilityRationale: "The edit is bounded after context is available.",
      expectedOutput: "Changed-file refs.",
      successCriteria: ["Edits approved files."],
      downstreamConsumer: "validation",
      capabilityManifest,
    });

    expect(compiled.node).toBeNull();
    expect(compiled.reasonCodes).toContain("work_intent_required_model_field_missing");
    expect(compiled.repairRequest.missingFields[0]?.path).toBe("workIntent.executionIntent");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects read-only intent selected for an edit-capable implementation capability", () => {
    const compiled = compileWorkIntent({
      decisionId: "decision-work-intent",
      workUnitId: "source-grounding",
      objective: "Read source specs before any edits.",
      commitmentIds: ["source-specs-read-first"],
      executionIntent: "source_grounding",
      selectedCapabilityId: "implementation_microtask",
      capabilityRationale: "This deliberately selects the wrong capability.",
      expectedOutput: "Read-only notes.",
      successCriteria: ["No source edits occur."],
      downstreamConsumer: "orchestrator",
      capabilityManifest,
    });

    expect(compiled.node).toBeNull();
    expect(compiled.reasonCodes).toContain(
      "work_intent_execution_intent_capability_conflict:execution_intent_read_only_conflicts_with_edit_capability",
    );
    expect(compiled.diagnostics[0]).toMatchObject({
      errorCode: "work_intent_execution_intent_capability_conflict",
      path: "workIntent.executionIntent",
    });
  });

  it("rejects model-authored runtime envelope fields at the WorkIntent boundary", () => {
    const compiled = compileWorkIntent({
      decisionId: "decision-work-intent",
      workUnitId: "context-map",
      objective: "Find target files.",
      commitmentIds: ["workflow-registration"],
      executionIntent: "context_supply",
      selectedCapabilityId: "context_scout",
      capabilityRationale: "Context should be gathered before implementation.",
      expectedOutput: "Context handoff refs.",
      successCriteria: ["Names target refs."],
      downstreamConsumer: "implementation",
      capabilityManifest,
      sourceRecord: {
        workUnit: { workUnitId: "context-map", nodeKind: "context_scout" },
        capabilitySelection: { workUnitId: "context-map", executorKey: "role:context_scout" },
      },
    });

    expect(compiled.node).toBeNull();
    expect(compiled.reasonCodes.join("|")).toContain("work_intent_runtime_owned_field_rejected");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });
});
