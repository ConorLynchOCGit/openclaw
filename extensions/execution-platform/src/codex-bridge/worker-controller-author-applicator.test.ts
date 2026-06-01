import { describe, expect, it } from "vitest";
import {
  enforceWorkerPhaseAuthority,
  splitPhaseForTool,
} from "./worker-controller-author-applicator.ts";
import type { NonCodexToolCall } from "./non-codex-worker-contracts.ts";

function call(toolId: NonCodexToolCall["toolId"]): NonCodexToolCall {
  return {
    callId: `call-${toolId}`,
    toolId,
    reason: "test",
    input: {},
  };
}

describe("worker controller/author/applicator phase authority", () => {
  it("lets the controller own edit planning without owning patch authoring", () => {
    const editPlan = call("worker.edit.plan");
    const patchAuthor = call("worker.patch.author_edit");

    expect(splitPhaseForTool(editPlan.toolId)).toBe("controller");
    expect(splitPhaseForTool(patchAuthor.toolId)).toBe("applicator");

    const authority = enforceWorkerPhaseAuthority({
      toolCalls: [editPlan, patchAuthor],
      modelSlot: "controller",
      mode: "strict",
    });

    expect(authority.acceptedToolCalls.map((item) => item.toolId)).toEqual(["worker.edit.plan"]);
    expect(authority.blockedToolCalls.map((item) => item.toolId)).toEqual([
      "worker.patch.author_edit",
    ]);
    expect(authority.reasonCodes).toContain(
      "worker_phase_authority_blocked:controller:applicator:worker.patch.author_edit",
    );
  });
});
