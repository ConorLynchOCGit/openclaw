import { describe, expect, it } from "vitest";
import {
  buildRuntimeNodeCapabilityManifest,
  runtimeNodeCapabilityManifestForModel,
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
    expect(kimi?.validationResponsibilities).toContain("request_bounded_context");
    expect(kimi?.validationResponsibilities).toContain("search_allowed_repo_scope");
    expect(kimi?.validationResponsibilities).toContain("inspect_related_tests");
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
    }
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
  });
});
