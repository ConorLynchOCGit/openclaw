import { describe, expect, it } from "vitest";
import { NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS } from "./node-lifecycle-transition-runner.ts";
import {
  buildProviderCapabilityProfileRegistry,
  buildRuntimeNodeCapabilityManifest,
  findProviderCapabilityProfile,
  runtimeNodeCapabilityManifestForModel,
  validateProviderCapabilityProfileRegistry,
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
        "test_authoring",
        "human_decision",
      ]),
    );
    const manifestText = JSON.stringify(manifest.capabilities);
    expect(manifestText).not.toContain("model_agnostic_file_edit_worker");
    expect(manifestText).not.toContain("model_agnostic_tool_worker_loop");
    expect(manifestText).not.toContain("non_codex_tool_using_worker_loop");
    expect(manifestText).not.toContain("non_codex_test_writer");
    expect(manifestText).not.toContain("non_codex_docs_editor");
    expect(manifestText).not.toContain("non_codex_validation_failure_explainer");
  });

  it("describes implementation microtasks as native OpenClaw node-agent sessions and Codex as complex escalation", () => {
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
      workerRef: "agent.execution-coding.native-node-session",
      displayName: "OpenClaw-native execution-coding node agent session",
      roleId: "implementation_engineer",
      writable: true,
      canEditSource: true,
      canWriteTests: true,
      preferredTaskSize: "small",
      costClass: "cheap",
      productionSelectionRequiresQualification: true,
    });
    expect(kimi?.allowedAdapters).toEqual(["openclaw_native_node_agent_session"]);
    expect(kimi?.modelQualificationProfileIds).toContain("openrouter.moonshotai.kimi-k2.6");
    expect(kimi?.modelQualificationProfileIds).toContain("openrouter.qwen.qwen3-coder-next");
    expect(kimi?.modelPolicyRefs).toEqual(
      expect.arrayContaining([
        "policy://openclaw-native-node/execution-coding/kimi-k2.6-implementation-reasoning",
        "policy://openclaw-native-node/execution-context-scout/qwen-fast-search",
        "policy://openclaw-native-node/execution-validation-scout/qwen-fast-validation",
      ]),
    );
    expect(kimi?.validationResponsibilities).toEqual(
      expect.arrayContaining([
        "create_native_update_plan",
        "spawn_context_scout_when_target_mapping_is_weak",
        "synthesize_inline_context_windows",
        "spawn_validation_scout_when_validation_scope_or_failure_needs_help",
        "finish_with_node_finish_evidence",
      ]),
    );
    expect(kimi?.lifecycleTransitionProfileRef).toBe(
      "lifecycle-profile://agent_team.coding/implementation_microtask.v1",
    );
    expect(kimi?.allowedLifecycleTransitions).toEqual(
      expect.arrayContaining([
        "node.agent_session.invoke",
        "node.agent_session.invoke_high_capability",
      ]),
    );
    expect(kimi?.requiredLifecycleTools).toEqual(
      expect.arrayContaining(["node.agent_session.invoke"]),
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
      expect.arrayContaining(["node.agent_session.invoke"]),
    );
    expect(kimi?.domainWorkerActionToolIds).not.toContain("worker.edit.plan");
    expect(kimi?.domainWorkerActionToolIds).not.toContain(
      "worker.validation.run_structural_default",
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
      workerRef: "agent.execution-coding.native-node-session",
      canWriteTests: true,
      canRunValidation: true,
    });
    expect(testAuthoring?.allowedAdapters).toEqual(["openclaw_native_node_agent_session"]);
    expect(testAuthoring?.canEditSource).toBe(true);
    expect(testAuthoring?.validationResponsibilities).toEqual(
      expect.arrayContaining([
        "create_native_update_plan",
        "spawn_context_scout_when_target_mapping_is_weak",
        "spawn_validation_scout_when_validation_scope_or_failure_needs_help",
        "finish_with_node_finish_evidence",
      ]),
    );
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
      workerRef: "agent.execution-coding.native-node-session",
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
      expect.arrayContaining(["tool-profile://openclaw_native_node_agent_session"]),
    );
    expect(implementation?.qualifiedEvidenceKinds).toEqual(
      expect.arrayContaining(["source_change", "test_validation", "source_material"]),
    );

    const contractOnly = findProviderCapabilityProfile("non_codex_frontend_editor", registry);
    expect(contractOnly?.productionSelectable).toBe(false);
    expect(validation.diagnosticOnlyProfileIds).toContain(
      "capability-profile://agent_team.coding/non_codex_frontend_editor.v1",
    );
  });

  it("can filter the model-visible manifest to only executable scheduler capabilities", () => {
    const manifest = runtimeNodeCapabilityManifestForModel({
      executableExecutorKeys: ["kind:implementation", "role:orchestrator"],
      workflowId: "agent_team.coding",
      phase: "execution",
    }) as ReturnType<typeof buildRuntimeNodeCapabilityManifest>;

    expect(manifest.capabilities.map((capability) => capability.capabilityId)).toEqual(
      expect.arrayContaining(["implementation_microtask", "implementation_complex"]),
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
      "non_codex_context_scout",
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_test_writer",
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_docs_editor",
    );
    expect(manifest.capabilities.map((capability) => capability.capabilityId)).not.toContain(
      "non_codex_validation_failure_explainer",
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
      expect.arrayContaining([
        "orchestrator_decision",
        "implementation_microtask",
        "validation_run",
      ]),
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

  it("derives lifecycle profile tools from the runner descriptor registry", () => {
    const descriptorToolIds = new Set(NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS);
    const allowedNonLifecycleTools = new Set(["artifact.create", "approval.request"]);
    const manifest = buildRuntimeNodeCapabilityManifest();

    for (const capability of manifest.capabilities) {
      for (const toolId of capability.allowedLifecycleTransitions) {
        expect(descriptorToolIds.has(toolId) || allowedNonLifecycleTools.has(toolId)).toBe(true);
      }
      for (const toolId of capability.requiredLifecycleTools) {
        expect(descriptorToolIds.has(toolId) || allowedNonLifecycleTools.has(toolId)).toBe(true);
      }
    }

    const implementation = manifest.capabilities.find(
      (capability) => capability.capabilityId === "implementation_microtask",
    );
    expect(implementation?.allowedLifecycleTransitions).toEqual(
      expect.arrayContaining([
        "node.agent_session.invoke",
        "node.agent_session.invoke_high_capability",
      ]),
    );
    expect(implementation?.allowedLifecycleTransitions).not.toContain("resource.selection.propose");
    expect(implementation?.allowedLifecycleTransitions).not.toContain(
      "node.execution_packet.promote_worker_action_ready",
    );
  });
});
