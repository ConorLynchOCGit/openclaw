import { describe, expect, it } from "vitest";
import {
  assertNodeResourceDemandManifestMetadata,
  closeNodeResourceDemandSession,
  compileNodeResourceDemandToolOutput,
  compileWorkerContextRequestDemand,
  fulfillExactNodeResourceDemandHandles,
  openNodeResourceDemandSession,
  requestNodeResourceDemand,
} from "./node-resource-demand-session.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";

function acceptedFocus(input?: { authorityScope?: string[] }) {
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    refs: (input?.authorityScope ?? ["src/product-spec.ts"]).map((ref) => ({
      ref,
      kind: ref.includes("test") ? "validation_ref" : "target_ref",
      boundedLabel: ref,
      authorityScopeRefs: input?.authorityScope ?? ["src/product-spec.ts"],
    })),
    maxSelectableHandles: 4,
    maxSemanticQuestions: 2,
  });
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    currentObjectiveSlot: "local implementation context",
    resourceUseKind: "resource_grounding",
    nextUnknown: "Which bounded file windows are needed before target selection?",
    expectedUse: "Use selected legal refs to open node-local node resource demand.",
    legalRefUniverse,
    selectedRefHandles: [legalRefUniverse.handles[0]!.handle],
    selectedSemanticQuestions: ["What source window is needed for this node?"],
  });
  return { focus, legalRefUniverse };
}

function exactFileWindowFocus() {
  const ref = "file-window://src/product-spec.ts#L10-L80";
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    refs: [
      {
        ref,
        kind: "bounded_file_window",
        boundedLabel: "src/product-spec.ts lines 10-80",
        authorityScopeRefs: ["src/product-spec.ts"],
        byteEstimate: 8_000,
      },
    ],
    maxSelectableHandles: 2,
    maxSemanticQuestions: 2,
  });
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    currentObjectiveSlot: "exact file window context",
    resourceUseKind: "resource_grounding",
    nextUnknown: "Which exact source window is needed?",
    expectedUse: "Use the exact model-selected window for target selection.",
    legalRefUniverse,
    selectedRefHandles: [legalRefUniverse.handles[0]!.handle],
    selectedSemanticQuestions: ["What matters in this exact window?"],
  });
  return { focus, legalRefUniverse };
}

function exactPlanningFocus() {
  const ref = "prompt-section://product-spec/acceptance-criteria";
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.product_spec_planning",
    graphId: "graph-1",
    consumerNodeId: "planning-1",
    workIntentRef: "work-intent://planning-1",
    nodeExecutionContractRef: "contract://planning-1",
    refs: [
      {
        ref,
        kind: "source_prompt_section",
        boundedLabel: "Product spec acceptance criteria section",
        authorityScopeRefs: [ref],
        byteEstimate: 4_000,
      },
    ],
    maxSelectableHandles: 2,
    maxSemanticQuestions: 2,
  });
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.product_spec_planning",
    graphId: "graph-1",
    consumerNodeId: "planning-1",
    workIntentRef: "work-intent://planning-1",
    nodeExecutionContractRef: "contract://planning-1",
    currentObjectiveSlot: "planning source section",
    resourceUseKind: "domain_action_planning",
    nextUnknown: "Which prompt section constrains the planning capsule?",
    expectedUse: "Use the selected section as planning-domain resource input.",
    legalRefUniverse,
    selectedRefHandles: [legalRefUniverse.handles[0]!.handle],
    selectedSemanticQuestions: ["What owner constraints matter for the planning capsule?"],
  });
  return { focus, legalRefUniverse, ref };
}

function openValidSession() {
  const focus = acceptedFocus({
    authorityScope: ["src/product-spec.ts", "tests/product-spec.test.ts"],
  });
  const opened = openNodeResourceDemandSession({
    runtimeJobId: "runtime-1",
    workflowId: "workflow-1",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    nodeExecutionPacketRef: "packet://impl-1",
    capabilityId: "implementation_complex",
    evidenceMode: ["changed_file_evidence"],
    targetCommitmentIds: ["C-1"],
    authorityScope: ["src/product-spec.ts", "tests/product-spec.test.ts"],
    demandReason: "Need the current implementation file before patch planning.",
    expectedUse: "Use the bounded window to produce a file-specific edit plan.",
    resourceObjectiveFocus: focus.focus,
    legalRefUniverse: focus.legalRefUniverse,
  });
  expect(opened.session).not.toBeNull();
  return opened.session!;
}

describe("NodeResourceDemandSession", () => {
  it("blocks opening without consumer, capability, evidence, authority, reason, and expected use", () => {
    const result = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
    });

    expect(result.status).toBe("needs_review");
    expect(result.session).toBeNull();
    expect(result.blocker?.blockerKind).toBe("missing_required_field");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_resource_demand_consumerNodeId_missing",
        "node_resource_demand_capabilityId_missing",
        "node_resource_demand_evidenceMode_missing",
        "node_resource_demand_authorityScope_missing",
        "node_resource_demand_demandReason_missing",
        "node_resource_demand_expectedUse_missing",
        "node_resource_demand_resource_objective_focus_missing",
        "node_resource_demand_legal_ref_universe_missing",
      ]),
    );
    expect(result.metadata).toMatchObject({
      nodeResourceDemandBlockerManifest: {
        artifactKind: "node_resource_demand_blocker_manifest",
        semanticQualityJudgedByDeterministicCode: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(JSON.stringify(result.metadata)).not.toContain("blockerSummary");
  });

  it("opens a consumer-bound node-local session with bounded manifest metadata", () => {
    const session = openValidSession();

    expect(session).toMatchObject({
      artifactKind: "node_resource_demand_session",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      resourceObjectiveFocusRef: expect.stringContaining("runtime-job://runtime-1/resource-objective-focus"),
      selectedFocusRefHandles: expect.arrayContaining([expect.any(String)]),
      selectedFocusRefs: ["src/product-spec.ts"],
      capabilityId: "implementation_complex",
      status: "open",
      semanticJudgmentOwner: "model_or_human",
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    expect(session.nextLegalTransitions).toEqual(
      expect.arrayContaining([
        "resource.demand.request_file_window",
        "resource.demand.request_symbol",
        "resource.demand.close",
      ]),
    );
  });

  it("rejects node resource demand metadata that carries full body fields", () => {
    const focus = acceptedFocus({ authorityScope: ["src/product-spec.ts"] });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      authorityScope: ["src/product-spec.ts"],
      demandReason: "Need bounded file context before editing.",
      expectedUse: "Use it for a patch plan.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    expect(() => assertNodeResourceDemandManifestMetadata(opened.metadata)).not.toThrow();
    expect(() =>
      assertNodeResourceDemandManifestMetadata({
        ...(opened.metadata as Record<string, unknown>),
        demandReason: "This full semantic body belongs in payload storage.",
      }),
    ).toThrow("node_resource_demand_manifest_contains_body_fields");
  });

  it("fulfills simple authorized file-window demand structurally without widening authority", () => {
    const session = openValidSession();
    const result = requestNodeResourceDemand({
      session,
      requestKind: "file_window",
      fileRef: "src/product-spec.ts",
      lineStart: 10,
      lineEnd: 80,
      reason: "Inspect the route registration implementation.",
      expectedUse: "Use this range for target selection and edit planning.",
      boundedSnapshotRefs: ["snapshot://src/product-spec.ts#L10-L80"],
    });

    expect(result.status).toBe("succeeded");
    expect(result.request?.requestKind).toBe("file_window");
    expect(result.fulfillment?.providedRefs).toEqual(["src/product-spec.ts#L10-L80"]);
    expect(result.session?.status).toBe("fulfilled");
    expect(result.metadata).toMatchObject({
      nodeResourceDemandSessionManifest: {
        artifactKind: "node_resource_demand_session_manifest",
        requestCount: 1,
        fulfillmentCount: 1,
      },
      nodeResourceDemandRequestManifest: {
        requestedRefCount: 1,
      },
      nodeResourceDemandFulfillmentManifest: {
        providedRefCount: 1,
        boundedSnapshotRefCount: 1,
      },
    });
    expect(JSON.stringify(result.metadata)).not.toContain("Inspect the route registration");
  });

  it("fulfills only exact model-selected handles without runtime line selection", () => {
    const focus = exactFileWindowFocus();
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      targetCommitmentIds: ["C-1"],
      authorityScope: ["src/product-spec.ts"],
      demandReason: "Need exact source window.",
      expectedUse: "Use exact window for target selection.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    const fulfilled = fulfillExactNodeResourceDemandHandles({
      session: opened.session!,
      legalRefUniverse: focus.legalRefUniverse,
    });

    expect(fulfilled.status).toBe("succeeded");
    expect(fulfilled.request?.requestKind).toBe("file_window");
    expect(fulfilled.request?.requestedRefs).toEqual(["file-window://src/product-spec.ts#L10-L80"]);
    expect(fulfilled.request?.lineStart).toBe(10);
    expect(fulfilled.request?.lineEnd).toBe(80);
    expect(fulfilled.fulfillment?.providedRefs).toEqual([
      "file-window://src/product-spec.ts#L10-L80",
    ]);
    expect(JSON.stringify(fulfilled.metadata)).not.toContain("Use exact window");
  });

  it("fulfills exact planning-domain handles without file snapshots or line selection", () => {
    const focus = exactPlanningFocus();
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      workIntentRef: "work-intent://planning-1",
      nodeExecutionContractRef: "contract://planning-1",
      capabilityId: "planning_capsule_draft",
      evidenceMode: ["planning_artifact_evidence"],
      targetCommitmentIds: ["C-PLAN-1"],
      authorityScope: [focus.ref],
      demandReason: "Need the exact source prompt section before drafting a planning capsule.",
      expectedUse: "Use the selected planning-domain section to compile capsule inputs.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    const fulfilled = fulfillExactNodeResourceDemandHandles({
      session: opened.session!,
      legalRefUniverse: focus.legalRefUniverse,
    });

    expect(fulfilled.status).toBe("succeeded");
    expect(fulfilled.request?.requestKind).toBe("source_prompt_section");
    expect(fulfilled.request?.fileRef).toBeNull();
    expect(fulfilled.request?.lineStart).toBeNull();
    expect(fulfilled.fulfillment?.boundedSnapshotRefs).toEqual([]);
    expect(fulfilled.reasonCodes).toContain("node_resource_demand_exact_handles_fulfilled");
  });

  it("fulfills mixed exact planning-domain handles as generic resource refs", () => {
    const refs = [
      "prompt-section://product-spec/acceptance-criteria",
      "planning-capsule://product-spec/overview",
    ];
    const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      workIntentRef: "work-intent://planning-1",
      nodeExecutionContractRef: "contract://planning-1",
      refs: [
        {
          ref: refs[0],
          kind: "source_prompt_section",
          boundedLabel: "Product spec acceptance criteria",
          authorityScopeRefs: refs,
        },
        {
          ref: refs[1],
          kind: "planning_capsule",
          boundedLabel: "Existing planning capsule",
          authorityScopeRefs: refs,
        },
      ],
    });
    const focus = compileResourceObjectiveFocus({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      workIntentRef: "work-intent://planning-1",
      nodeExecutionContractRef: "contract://planning-1",
      currentObjectiveSlot: "planning mixed exact resources",
      resourceUseKind: "domain_action_planning",
      nextUnknown: "Which exact planning resources should be opened together?",
      expectedUse: "Use exact planning resources as a bundle for capsule drafting.",
      legalRefUniverse,
      selectedRefHandles: legalRefUniverse.handles.map((handle) => handle.handle),
      selectedSemanticQuestions: ["What do the selected planning resources constrain?"],
    });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.product_spec_planning",
      graphId: "graph-1",
      consumerNodeId: "planning-1",
      capabilityId: "planning_capsule_draft",
      evidenceMode: ["planning_artifact_evidence"],
      authorityScope: refs,
      demandReason: "Need exact planning resources.",
      expectedUse: "Use them for planning capsule drafting.",
      resourceObjectiveFocus: focus,
      legalRefUniverse,
    });

    const fulfilled = fulfillExactNodeResourceDemandHandles({
      session: opened.session!,
      legalRefUniverse,
    });

    expect(fulfilled.status).toBe("succeeded");
    expect(fulfilled.request?.requestKind).toBe("resource_ref");
    expect(fulfilled.fulfillment?.providedRefs).toEqual(refs);
    expect(fulfilled.reasonCodes).toContain(
      "node_resource_demand_mixed_exact_domain_resources_as_resource_refs",
    );
  });

  it("blocks broad selected handles and requires specialist narrowing", () => {
    const focus = acceptedFocus({ authorityScope: ["src/product-spec.ts"] });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      targetCommitmentIds: ["C-1"],
      authorityScope: ["src/product-spec.ts"],
      demandReason: "Need context before editing.",
      expectedUse: "Use exact context for target selection.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    const blocked = fulfillExactNodeResourceDemandHandles({
      session: opened.session!,
      legalRefUniverse: focus.legalRefUniverse,
    });

    expect(blocked.status).toBe("needs_review");
    expect(blocked.blocker?.blockerKind).toBe("no_direct_fulfillment");
    expect(blocked.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_resource_demand_specialist_narrowing_required",
        "node_resource_demand_selected_ref_not_exactly_fulfillable",
      ]),
    );
    expect(blocked.session?.nextLegalTransitions).toEqual(
      expect.arrayContaining(["resource.scout.narrow_scope"]),
    );
  });

  it("blocks refs outside authority instead of creating resource scout graph fanout", () => {
    const session = openValidSession();
    const result = requestNodeResourceDemand({
      session,
      requestKind: "file_window",
      fileRef: "src/auth/session.ts",
      reason: "Need a file outside scope.",
      expectedUse: "Would use it to widen context if authorized.",
    });

    expect(result.status).toBe("needs_review");
    expect(result.blocker?.blockerKind).toBe("authority_scope_violation");
    expect(result.reasonCodes).toContain("node_resource_demand_authority_scope_violation");
    expect(result.outputRef).toContain("node-resource-demand-blocker");
    expect(JSON.stringify(result)).not.toContain("resource_scout");
  });

  it("treats explicit directory authority as structural scope, not semantic file scoring", () => {
    const focus = acceptedFocus({ authorityScope: ["src/workflows/"] });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      authorityScope: ["src/workflows/"],
      demandReason: "Need a structurally authorized workflow file.",
      expectedUse: "Use the file window for local implementation context.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    const result = requestNodeResourceDemand({
      session: opened.session!,
      requestKind: "file_window",
      fileRef: "src/workflows/product-spec.ts",
      reason: "Open a file within the declared directory authority.",
      expectedUse: "Use it as bounded local context.",
    });

    expect(result.status).toBe("succeeded");
    expect(result.blocker).toBeNull();
    expect(result.reasonCodes).toContain("node_resource_demand_file_window_fulfilled_by_authorized_ref");
  });

  it("connects worker context requests to NodeResourceDemandSession manifests", () => {
    const focus = acceptedFocus({ authorityScope: ["src/product-spec.ts"] });
    const result = compileWorkerContextRequestDemand({
      runtimeJobId: "runtime-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      capabilityId: "implementation_complex",
      evidenceMode: ["changed_file_evidence"],
      authorityScope: ["src/product-spec.ts"],
      demandReason: "Worker needs a bounded file window before editing.",
      expectedUse: "Use this file to author the next patch.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
      requestedFileRefs: ["src/product-spec.ts"],
      boundedSnapshotRefs: ["snapshot://src/product-spec.ts#L1-L120"],
    });

    expect(result.status).toBe("succeeded");
    expect(result.metadata).toMatchObject({
      nodeResourceDemandSessionManifest: {
        consumerNodeId: "impl-1",
        capabilityId: "implementation_complex",
      },
      nodeResourceDemandRequestManifest: {
        requestKind: "file_window",
      },
    });
  });

  it("exposes resource.demand.* through bounded runtime tool outputs", () => {
    const focus = acceptedFocus({ authorityScope: ["src/product-spec.ts"] });
    const opened = compileNodeResourceDemandToolOutput({
      toolId: "resource.demand.open",
      metadata: {
        runtimeJobId: "runtime-1",
        workflowId: "workflow-1",
        graphId: "graph-1",
        consumerNodeId: "impl-1",
        capabilityId: "implementation_complex",
        evidenceMode: ["changed_file_evidence"],
        authorityScope: ["src/product-spec.ts"],
        demandReason: "Need bounded file context.",
        expectedUse: "Use it for a patch plan.",
        resourceObjectiveFocus: focus.focus,
        legalRefUniverse: focus.legalRefUniverse,
      },
    });
    expect(opened.status).toBe("succeeded");
    expect(opened.metadata).toMatchObject({
      nodeResourceDemandSessionManifest: {
        artifactKind: "node_resource_demand_session_manifest",
      },
    });

    const requested = compileNodeResourceDemandToolOutput({
      toolId: "resource.demand.request_file_window",
      volatileInput: { nodeResourceDemandSession: opened.session },
      metadata: {
        fileRef: "src/product-spec.ts",
        lineStart: 1,
        lineEnd: 120,
        reason: "Open the target file window.",
        expectedUse: "Use this window for the next worker plan.",
      },
    });

    expect(requested.status).toBe("succeeded");
    expect(requested.reasonCodes).toContain("node_resource_demand_file_window_request_accepted");
    expect(requested.metadata).toMatchObject({
      nodeResourceDemandFulfillmentManifest: {
        status: "fulfilled",
      },
    });

    const recompiled = compileNodeResourceDemandToolOutput({
      toolId: "resource.demand.recompile_from_scope_revision",
      metadata: {
        scopeRevisionRequestRef: "scope-revision://request-1",
        scopeRevisionDecisionRef: "scope-revision://decision-1",
        recompiledPacketRef: "context-scout-packet://narrowed-1",
        estimatedProviderInputBytes: 12_000,
        maxInputBytes: 32_000,
        reasonCodes: ["resource_scope_revision_model_selected_legal_subset_accepted"],
      },
    });

    expect(recompiled.status).toBe("succeeded");
    expect(recompiled.outputRef).toBe("context-scout-packet://narrowed-1");
    expect(recompiled.reasonCodes).toContain("node_resource_demand_recompiled_from_scope_revision");

    const executed = compileNodeResourceDemandToolOutput({
      toolId: "resource.demand.execute_recompiled_packet",
      metadata: {
        recompiledPacketRef: "context-scout-packet://narrowed-1",
        reasonCodes: ["resource_scope_revision_recompiled_packet_executed"],
      },
    });

    expect(executed.status).toBe("succeeded");
    expect(executed.reasonCodes).toContain(
      "node_resource_demand_executed_recompiled_scope_revision_packet",
    );
  });

  it("closes fulfilled demand sessions without turning them into write readiness", () => {
    const session = openValidSession();
    const requested = requestNodeResourceDemand({
      session,
      requestKind: "related_tests",
      requestedRefs: ["tests/product-spec.test.ts"],
      reason: "Find related tests before editing.",
      expectedUse: "Use related tests to choose validation refs.",
    });

    const closed = closeNodeResourceDemandSession({ session: requested.session! });
    expect(closed.status).toBe("succeeded");
    expect(closed.session?.status).toBe("closed");
    expect(closed.session?.nextLegalTransitions).toEqual([]);
    expect(JSON.stringify(closed.metadata)).not.toContain("worker_action_ready");
  });
});
