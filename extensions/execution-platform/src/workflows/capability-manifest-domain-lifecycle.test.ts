import { describe, expect, it } from "vitest";
import {
  CAPABILITY_DOMAIN_LIFECYCLE_MANIFEST_MAX_BYTES,
  compileCapabilityManifestRuntimeToolOutput,
} from "./capability-manifest-domain-lifecycle.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  runtimeNodeCapabilityManifestForModel,
} from "./runtime-node-capability-registry.ts";

describe("capability manifest domain lifecycle", () => {
  it("keeps the model-facing capability menu compact and lookup-backed", () => {
    const menu = runtimeNodeCapabilityManifestForModel();
    const byteCount = JSON.stringify(menu).length;

    expect(byteCount).toBeLessThanOrEqual(CAPABILITY_DOMAIN_LIFECYCLE_MANIFEST_MAX_BYTES);
    expect(menu).toMatchObject({
      projectionKind: "runtime_node_capability_model_menu",
      fullProfileLookupToolId: "capability.lookup",
      lifecycleToolLookupToolId: "capability.list_legal_transitions",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });

    const capabilities = (menu as { capabilities: Array<Record<string, unknown>> }).capabilities;
    expect(capabilities.length).toBe(buildRuntimeNodeCapabilityManifest().capabilities.length);
    expect(capabilities[0]).toHaveProperty("capabilityId");
    expect(capabilities[0]).toHaveProperty("providerCapabilityProfileId");
    expect(capabilities[0]).not.toHaveProperty("executorKey");
    expect(capabilities[0]).not.toHaveProperty("graphNodeKind");
    expect(capabilities[0]).not.toHaveProperty("workerRef");
    expect(capabilities[0]).not.toHaveProperty("allowedLifecycleTransitions");
    expect(capabilities[0]).not.toHaveProperty("requiredAuthorityScopes");
  });

  it("returns manifest-backed capability tool outputs instead of generic scheduler traces", () => {
    for (const toolId of [
      "capability.lookup",
      "capability.validate_intent",
      "capability.require_resources",
      "capability.require_validation",
      "capability.require_evidence",
      "capability.list_legal_transitions",
    ] as const) {
      const output = compileCapabilityManifestRuntimeToolOutput({
        toolId,
        metadata: {
          capabilityId: "architecture_mapper",
          workflowId: "agent_team.architecture_red_team",
          phase: "execution",
          executionIntent: "domain_action",
          requiredSourceMaterialKinds: ["source_prompt_section"],
          requiredEvidenceKinds: ["planning_capsule"],
        },
      });

      expect(output.status).toBe("succeeded");
      expect(output.outputRef).toMatch(/^runtime-tool:\/\/capability-domain-lifecycle\//u);
      expect(output.outputHash).toMatch(/^sha256:/u);
      expect(output.reasonCodes.join(",")).not.toContain("recorded");
      expect(output.metadata).toMatchObject({
        artifactKind: "capability_domain_lifecycle_tool_output",
        schemaVersion: "execution-platform.capability-domain-lifecycle.v1",
        toolId,
        semanticRoutingPerformed: false,
        runtimeSemanticJudgmentAllowed: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });
    }
  });

  it("blocks structurally invalid intent without semantic routing", () => {
    const output = compileCapabilityManifestRuntimeToolOutput({
      toolId: "capability.validate_intent",
      metadata: {
        capabilityId: "architecture_mapper",
        workflowId: "agent_team.architecture_red_team",
        executionIntent: "source_edit",
        requiredSourceMaterialKinds: ["target_snapshot"],
        requiredEvidenceKinds: ["source_change"],
      },
    });

    expect(output.status).toBe("needs_review");
    expect(output.reasonCodes).toEqual(
      expect.arrayContaining([
        "capability_validate_intent_blocked",
        "capability_validate_intent_execution_intent_unsupported",
        "capability_validate_intent_required_resource_kind_missing:target_snapshot",
        "capability_validate_intent_required_evidence_kind_missing:source_change",
      ]),
    );
    expect(output.metadata).toMatchObject({
      runtimeSemanticJudgmentAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });
});
