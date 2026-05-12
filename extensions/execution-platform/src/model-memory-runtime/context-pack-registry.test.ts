import { describe, expect, it } from "vitest";
import {
  CANONICAL_CONTEXT_PACK_REGISTRY,
  buildContextPackRegistryProof,
  packsForRouteAndWorkflow,
} from "./context-pack-registry.ts";

describe("context pack registry", () => {
  it("defines the canonical context packs with safe defaults", () => {
    const proof = buildContextPackRegistryProof();

    expect(proof.status).toBe("passed");
    expect(proof.totalPacks).toBe(8);
    expect(proof.packIds).toEqual(
      expect.arrayContaining([
        "context-pack.retrieval.v1",
        "context-pack.projection.v1",
        "context-pack.stable-memory.v1",
        "context-pack.tool-result-summary.v1",
        "context-pack.closeout-capsule.v1",
        "context-pack.workflow-runtime-state.v1",
        "context-pack.work-queue-readback.v1",
        "context-pack.skill-context.v1",
      ]),
    );
  });

  it("does not allow protocol or triage to receive context packs", () => {
    for (const definition of CANONICAL_CONTEXT_PACK_REGISTRY) {
      expect(definition.routeEligibility).not.toContain("protocol");
      expect(definition.routeEligibility).not.toContain("triage");
    }
    expect(packsForRouteAndWorkflow({ route: "protocol" })).toHaveLength(0);
    expect(packsForRouteAndWorkflow({ route: "triage" })).toHaveLength(0);
  });

  it("keeps chat packs smaller than workflow runtime packs", () => {
    const chatPacks = packsForRouteAndWorkflow({ route: "chat_send", workflow: "ordinary_chat" });
    const workflowPacks = packsForRouteAndWorkflow({
      route: "workflow_execution",
      workflow: "agent_team.coding",
    });

    expect(chatPacks.some((pack) => pack.kind === "retrieval_pack")).toBe(true);
    expect(workflowPacks.some((pack) => pack.kind === "workflow_runtime_state_pack")).toBe(true);
    expect(Math.max(...chatPacks.map((pack) => pack.maxTokens))).toBeLessThanOrEqual(
      Math.max(...workflowPacks.map((pack) => pack.maxTokens)),
    );
  });

  it("never lets context packs grant authority or lifecycle success", () => {
    for (const definition of CANONICAL_CONTEXT_PACK_REGISTRY) {
      expect(definition.rawStorageAllowed).toBe(false);
      expect(definition.grantsAuthority).toBe(false);
      expect(definition.grantsRuntimeSuccess).toBe(false);
      expect(definition.mutatesWorkQueueLifecycle).toBe(false);
    }
  });
});
