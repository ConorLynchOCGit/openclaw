import { describe, expect, it } from "vitest";
import {
  buildProviderCapabilityProfileRegistry,
  buildRuntimeNodeCapabilityManifest,
  findProviderCapabilityProfile,
  runtimeNodeCapabilityManifestForModel,
  validateProviderCapabilityProfileRegistry,
  validateRuntimeCapabilityExecutorCoverage,
} from "./runtime-node-capability-registry.ts";
import { NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS } from "./node-lifecycle-transition-runner.ts";
import { TEAM_GRAPH_NODE_KINDS } from "./runtime-work-graph.ts";

describe("runtime node capability registry", () => {
  it("exposes bounded node capabilities without semantic routing or authority grants", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();

    expect(manifest.semanticRoutingPerformed).toBe(false);
    expect(manifest.authorityGranted).toBe(false);
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawResponseStored).toBe(false);
    expect(manifest.schemaVersion).toBe("execution-platform.runtime-node-capabilities.v2");
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual(
      expect.arrayContaining([
        "orchestrator_decision",
        "implementation_microtask",
        "implementation_complex",
        "test_authoring",
        "human_decision",
      ]),
    );
  });

  it("describes Kimi as non-Codex worker-loop implementation and Codex as complex escalation", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const kimi = manifest.capabilities.find(
      (capability) => capability.capabilityId === "implementation_microtask",
    );
    const codex = manifest.capabilities.find(
      (capability) => capability.capabilityId === "implementation_complex",
    );

    expect(kimi).toMatchObject({
      graphNodeKind: "implementation",
      executorKey: "kind:implementation",
      workerRef: "worker.kimi.file-implementation",
      roleId: "implementation_engineer",
      writable: true,
      canEditSource: true,
      canWriteTests: true,
      preferredTaskSize: "small",
      costClass: "cheap",
      productionSelectionRequiresQualification: true,
    });
    expect(kimi?.allowedAdapters).toContain("worker.kimi.file-implementation");
    expect(kimi?.modelQualificationProfileIds).toContain("openrouter.moonshotai.kimi-k2.6");
    expect(kimi?.modelQualificationProfileIds).toContain("openrouter.qwen.qwen3-coder-next");
    expect(kimi?.modelPolicyRefs).toEqual(
      expect.arrayContaining([
        "policy://codex-parity/openclaw-role/implementation-standard/qwen-controller",
        "policy://codex-parity/openclaw-role/implementation-standard/kimi-patch-reasoning-none",
        "policy://codex-parity/openclaw-role/implementation-standard/qwen-validation-repair",
      ]),
    );
    expect(kimi?.validationResponsibilities).toContain("request_bounded_context");
    expect(kimi?.validationResponsibilities).toContain("search_allowed_repo_scope");
    expect(kimi?.validationResponsibilities).toContain("inspect_related_tests");
    expect(kimi?.validationResponsibilities).toContain(
      "select_compound_coding_tool_when_context_is_sufficient",
    );
    expect(kimi?.validationResponsibilities).toContain(
      "execute_compound_inspect_edit_validate_evidence_operation",
    );
    expect(kimi?.validationResponsibilities).toContain("execute_ordered_edit_steps");
    expect(kimi?.validationResponsibilities).toContain("emit_commitment_evidence_claims");
    expect(kimi?.lifecycleTransitionProfileRef).toBe(
      "lifecycle-profile://agent_team.coding/implementation_microtask.v1",
    );
    expect(kimi?.allowedLifecycleTransitions).toEqual(
      expect.arrayContaining([
        "resource.scout.submit_exact_handles",
        "worker.context.request_more",
        "worker.context.search",
        "worker.context.open_around_match",
        "worker.context.accept_window",
        "resource.selection.propose",
        "node.execution_packet.promote_worker_action_ready",
        "worker.edit.plan",
        "worker.validation.run_structural_default",
      ]),
    );
    expect(kimi?.requiredLifecycleTools).toEqual(
      expect.arrayContaining([
        "node.execution_packet.promote_worker_action_ready",
        "worker.context.request_more",
        "worker.context.search",
        "worker.context.open_around_match",
        "worker.context.accept_window",
      ]),
    );
    expect(kimi).toMatchObject({
      domainProfileId: "coding",
      resourceSelectionProfileRef:
        "resource-selection-profile://agent_team.coding/implementation_microtask/coding.v1",
      domainActionGateProfileRef:
        "domain-action-gate-profile://agent_team.coding/implementation_microtask/coding.v1",
    });
    expect(kimi?.domainResourceKinds).toEqual(
      expect.arrayContaining(["repo_file", "bounded_file_window", "target_snapshot", "diff"]),
    );
    expect(kimi?.domainWorkerActionToolIds).toEqual(
      expect.arrayContaining(["worker.edit.plan", "worker.validation.run_structural_default"]),
    );
    expect(kimi?.domainWorkerActionToolIds).not.toContain("worker.patch.force_author_from_plan");
    expect(codex).toMatchObject({
      roleId: "implementation_engineer",
      writable: true,
      preferredTaskSize: "large",
      costClass: "premium",
      productionSelectionRequiresQualification: false,
    });
    expect(codex?.modelPolicyRefs).toContain(
      "policy://codex-parity/openclaw-role/implementation-complex/openai-codex/gpt-5.5",
    );
  });

  it("lets test engineer author tests without granting lifecycle authority", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const testAuthoring = manifest.capabilities.find(
      (capability) => capability.capabilityId === "test_authoring",
    );

    expect(testAuthoring).toMatchObject({
      roleId: "test_engineer",
      writable: true,
      canWriteTests: true,
      canRunValidation: true,
    });
    expect(testAuthoring?.authorityBoundaries).toContain("no_test_weakening_without_review");
  });

  it("derives support-role execution intent from role class before repo-inspection ability", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();

    expect(
      manifest.capabilities.find((capability) => capability.capabilityId === "reviewer"),
    ).toMatchObject({
      roleClass: "review",
      canInspectRepo: true,
      defaultExecutionIntent: "review",
    });
    expect(
      manifest.capabilities.find(
        (capability) => capability.capabilityId === "observability_readback",
      ),
    ).toMatchObject({
      roleClass: "observability",
      canInspectRepo: true,
      defaultExecutionIntent: "readback",
    });
    expect(
      manifest.capabilities.find((capability) => capability.capabilityId === "coding_closeout"),
    ).toMatchObject({
      roleClass: "closeout",
      canInspectRepo: true,
      defaultExecutionIntent: "closeout",
    });
  });

  it("maps every capability to an executable graph node kind and executor metadata", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    for (const capability of manifest.capabilities) {
      expect(TEAM_GRAPH_NODE_KINDS).toContain(capability.graphNodeKind);
      expect(capability.executorKey).toMatch(/^(kind|role):/u);
      expect(capability.workerRef).not.toHaveLength(0);
      expect(capability.requiredMetadataSchemaRef).toMatch(/^schema:\/\//u);
      expect(capability.nodeType).toBe(capability.capabilityId);
      expect(capability.supportedPhases.length).toBeGreaterThan(0);
    }
  });

  it("derives canonical Provider Capability Profiles from the runtime capability manifest", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const registry = buildProviderCapabilityProfileRegistry(manifest);
    const validation = validateProviderCapabilityProfileRegistry(registry);

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).toEqual(["provider_capability_profile_registry_valid"]);
    expect(registry.runtimeDerivedFromCapabilityManifest).toBe(true);
    expect(registry.rawPromptStored).toBe(false);
    expect(registry.profiles).toHaveLength(manifest.capabilities.length);

    const implementation = findProviderCapabilityProfile("implementation_microtask", registry);
    expect(implementation).toMatchObject({
      artifactKind: "provider_capability_profile",
      profileId: "capability-profile://agent_team.coding/implementation_microtask.v1",
      capabilityId: "implementation_microtask",
      graphNodeKind: "implementation",
      executorKey: "kind:implementation",
      workerRef: "worker.kimi.file-implementation",
      roleClass: "implementation",
      costClass: "cheap",
      latencyClass: "medium",
      contextCapacity: "medium",
      productionSelectable: true,
      productionSelectionRequiresQualification: true,
      qualificationEvidenceRequired: true,
      runtimeDerivedFromCapabilityManifest: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(implementation?.toolProfileRefs).toEqual(
      expect.arrayContaining([
        "tool-profile://model_agnostic_file_edit_worker",
        "tool-profile://non_codex_tool_using_worker_loop",
      ]),
    );
    expect(implementation?.qualifiedEvidenceKinds).toEqual(
      expect.arrayContaining(["source_change", "test_validation", "resource_handoff"]),
    );

    const contractOnly = findProviderCapabilityProfile("non_codex_frontend_editor", registry);
    expect(contractOnly?.productionSelectable).toBe(false);
    expect(validation.diagnosticOnlyProfileIds).toContain(
      "capability-profile://agent_team.coding/non_codex_frontend_editor.v1",
    );
  });

  it("includes product/spec planning capabilities in the same manifest contract", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual(
      expect.arrayContaining([
        "planning_orchestrator",
        "web_research",
        "planning_capsule_draft",
        "planning_capsule_revision",
        "human_planning_decision",
        "action_graph_proposal",
        "compile_runtime_plan",
        "planning_closeout",
      ]),
    );
    const compileRuntimePlan = manifest.capabilities.find(
      (capability) => capability.capabilityId === "compile_runtime_plan",
    );
    expect(compileRuntimePlan).toMatchObject({
      graphNodeKind: "compiler",
      canRunValidation: true,
      canCompileRuntimeJobs: false,
    });
    expect(compileRuntimePlan?.authorityBoundaries).toContain(
      "no_runtime_job_creation_without_later_authority",
    );
    const planningCapsule = manifest.capabilities.find(
      (capability) => capability.capabilityId === "planning_capsule_draft",
    );
    expect(planningCapsule).toMatchObject({
      domainProfileId: "product_spec_planning",
      requiredResourcePacketKind: "planning_domain_resource_packet",
    });
    expect(planningCapsule?.domainResourceKinds).toEqual(
      expect.arrayContaining([
        "source_prompt_section",
        "owner_constraint",
        "planning_framework_contract",
        "planning_capsule",
        "action_graph_candidate",
      ]),
    );
    expect(planningCapsule?.domainActionGateKinds).toEqual(
      expect.arrayContaining([
        "planning_framework_contract_gate",
        "planning_capsule_gate",
        "action_graph_proposal_gate",
      ]),
    );
    expect(planningCapsule?.domainWorkerActionToolIds).toEqual(
      expect.arrayContaining([
        "planning.framework_contract.record",
        "planning.capsule.draft",
        "planning.action_graph.propose",
      ]),
    );
    expect(planningCapsule?.requiredSnapshotKinds).not.toContain("target_file_snapshot");
    expect(planningCapsule?.domainWorkerActionToolIds).not.toContain("worker.edit.plan");
    for (const capability of manifest.capabilities.filter(
      (entry) => entry.workflowId === "agent_team.product_spec_planning",
    )) {
      if (capability.requiresResources) {
        expect(capability.supportedExecutionIntents).toContain("resource_demand");
      }
      expect(capability.supportedExecutionIntents).not.toContain("resource_fulfillment");
      expect(capability.supportedExecutionIntents).not.toContain("source_edit");
      expect(capability.supportedExecutionIntents).not.toContain("resource_materialization");
      expect(capability.domainProfileId).toBe("product_spec_planning");
      expect(capability.allowedLifecycleTransitions).not.toContain("worker.edit.plan");
      expect(capability.allowedLifecycleTransitions).not.toContain("worker.patch.author_edit");
      expect(capability.allowedLifecycleTransitions).not.toContain(
        "worker.patch.force_author_from_plan",
      );
      expect(capability.domainWorkerActionToolIds).not.toContain("worker.edit.plan");
    }
  });

  it("can filter the model-visible manifest to only executable scheduler capabilities", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: ["kind:implementation", "role:orchestrator"],
      workflowId: "agent_team.coding",
      phase: "execution",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual(
      expect.arrayContaining([
        "implementation_microtask",
        "implementation_complex",
      ]),
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "web_research",
    );
    expect(manifest.capabilities[0]).not.toHaveProperty("executorKey");
    expect(manifest.capabilities[0]).not.toHaveProperty("graphNodeKind");
    expect(manifest.capabilities[0]).not.toHaveProperty("workerRef");
    expect(manifest.capabilities[0]).toHaveProperty("providerCapabilityProfileId");
    expect(manifest.capabilities[0]).toHaveProperty("productionSelectable");
  });

  it("does not expose capabilities whose exact executor is not registered", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: ["kind:implementation", "role:orchestrator"],
      workflowId: "agent_team.coding",
      phase: "execution",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_resource_scout",
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_test_writer",
    );
  });

  it("hides broad Codex escalation during complex decomposition while keeping scoped workers selectable", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: [
        "kind:implementation",
        "role:orchestrator",
        "kind:validation",
        "kind:reviewer",
      ],
      workflowId: "agent_team.coding",
      phase: "decomposition",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;
    const capabilityIds = manifest.capabilities.map((capability) => capability.capabilityId);

    expect(capabilityIds).toEqual(
      expect.arrayContaining(["orchestrator_decision", "implementation_microtask", "validation_run"]),
    );
    expect(capabilityIds).not.toContain("implementation_complex");
  });

  it("hides broad Codex escalation during first post-synthesis capability selection", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: [
        "kind:implementation",
        "kind:validation",
        "kind:reviewer",
        "kind:observability_readback",
        "kind:closeout",
      ],
      workflowId: "agent_team.coding",
      phase: "capability_selection",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;
    const capabilityIds = manifest.capabilities.map((capability) => capability.capabilityId);

    expect(capabilityIds).toEqual(
      expect.arrayContaining([
        "implementation_microtask",
        "validation_run",
        "reviewer",
        "observability_readback",
        "coding_closeout",
      ]),
    );
    expect(capabilityIds).not.toContain("implementation_complex");
  });

  it("does not expose retired context synthesis as a selectable capability", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: [
        "kind:implementation",
        "role:orchestrator",
        "kind:validation",
        "kind:reviewer",
      ],
      workflowId: "agent_team.coding",
      phase: "capability_selection",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    const capabilityIds = manifest.capabilities.map((capability) => capability.capabilityId);
    expect(capabilityIds).not.toContain("context_synthesis");
    expect(manifest.capabilities.map((capability) => capability.executorKey)).not.toContain(
      "kind:context_synthesis",
    );
  });

  it("reports exact Product/Spec Planning executor coverage before live proof", () => {
    const incomplete = validateRuntimeCapabilityExecutorCoverage({
      workflowId: "agent_team.product_spec_planning",
      executableExecutorKeys: ["role:planning_orchestrator", "kind:web_research"],
    });

    expect(incomplete.valid).toBe(false);
    expect(incomplete.coveredCapabilityIds).toEqual(
      expect.arrayContaining(["planning_orchestrator", "web_research"]),
    );
    expect(incomplete.missingCapabilityIds).toEqual(
      expect.arrayContaining([
        "planning_capsule_draft",
        "planning_capsule_revision",
        "human_planning_decision",
        "action_graph_proposal",
        "compile_runtime_plan",
        "planning_closeout",
      ]),
    );
    expect(incomplete.reasonCodes).toContain("runtime_capability_executor_coverage_missing");
    expect(incomplete.reasonCodes).toContain("missing_executor:kind:planning_capsule");
    expect(incomplete.rawPromptStored).toBe(false);
    expect(incomplete.rawResponseStored).toBe(false);

    const complete = validateRuntimeCapabilityExecutorCoverage({
      workflowId: "agent_team.product_spec_planning",
      executableExecutorKeys: [
        "role:planning_orchestrator",
        "kind:web_research",
        "kind:planning_capsule",
        "kind:human_task",
        "kind:action_graph_compile",
        "kind:compiler",
        "kind:closeout",
      ],
    });

    expect(complete.valid).toBe(true);
    expect(complete.missingCapabilityIds).toEqual([]);
    expect(complete.missingExecutorKeys).toEqual([]);
    expect(complete.reasonCodes).toEqual(["runtime_capability_executor_coverage_complete"]);
  });

  it("derives lifecycle profile tools from the runner descriptor registry", () => {
    const descriptorToolIds = new Set(NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS);
    const allowedNonLifecycleTools = new Set([
      "artifact.create",
      "approval.request",
      "review.add_issue",
      "review.approve",
    ]);
    const manifest = buildRuntimeNodeCapabilityManifest();

    for (const capability of manifest.capabilities) {
      for (const toolId of capability.allowedLifecycleTransitions) {
        expect(
          descriptorToolIds.has(toolId) || allowedNonLifecycleTools.has(toolId),
        ).toBe(true);
      }
      for (const toolId of capability.requiredLifecycleTools) {
        expect(descriptorToolIds.has(toolId)).toBe(true);
      }
    }

    const implementation = manifest.capabilities.find(
      (capability) => capability.capabilityId === "implementation_microtask",
    );
    expect(implementation?.allowedLifecycleTransitions).toEqual(
      expect.arrayContaining([
        "resource.scout.submit_exact_handles",
        "worker.context.request_more",
        "worker.context.search",
        "worker.context.open_around_match",
        "worker.context.accept_window",
        "resource.selection.propose",
        "node.execution_packet.promote_worker_action_ready",
        "worker.edit.plan",
        "worker.validation.run_structural_default",
        "worker.evidence.claim_from_validation",
      ]),
    );
  });
});
