import { describe, expect, it } from "vitest";
import {
  buildProviderCapabilityProfileRegistry,
  buildRuntimeNodeCapabilityManifest,
  findProviderCapabilityProfile,
  runtimeNodeCapabilityManifestForModel,
  validateProviderCapabilityProfileRegistry,
  validateRuntimeCapabilityExecutorCoverage,
} from "./runtime-node-capability-registry.ts";
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
        "context_scout",
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
      expect.arrayContaining(["source_change", "test_validation", "context_handoff"]),
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
  });

  it("can filter the model-visible manifest to only executable scheduler capabilities", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: ["kind:implementation", "role:context_scout"],
      workflowId: "agent_team.coding",
      phase: "execution",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual(
      expect.arrayContaining([
        "implementation_microtask",
        "implementation_complex",
        "context_scout",
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
      executableExecutorKeys: ["kind:implementation", "role:context_scout"],
      workflowId: "agent_team.coding",
      phase: "execution",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_context_scout",
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_test_writer",
    );
  });

  it("hides broad Codex escalation during complex decomposition while keeping scoped workers selectable", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: [
        "kind:implementation",
        "role:context_scout",
        "kind:validation",
        "kind:reviewer",
      ],
      workflowId: "agent_team.coding",
      phase: "decomposition",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;
    const capabilityIds = manifest.capabilities.map((capability) => capability.capabilityId);

    expect(capabilityIds).toEqual(
      expect.arrayContaining(["context_scout", "implementation_microtask", "validation_run"]),
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

  it("exposes only context synthesis immediately after accepted context supply", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: [
        "kind:context_synthesis",
        "kind:implementation",
        "role:context_scout",
        "kind:validation",
        "kind:reviewer",
      ],
      workflowId: "agent_team.coding",
      phase: "context_synthesis",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual([
      "context_synthesis",
    ]);
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
});
