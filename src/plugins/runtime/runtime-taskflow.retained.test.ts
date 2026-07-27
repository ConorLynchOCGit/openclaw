import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installRuntimeTaskDeliveryMock,
  resetRuntimeTaskTestState,
} from "./runtime-task-test-harness.js";
import { createRuntimeTaskFlow } from "./runtime-taskflow.js";

function requireFlow<T>(flow: T | null): T {
  if (!flow) {
    throw new Error("expected managed TaskFlow creation to succeed");
  }
  return flow;
}

afterEach(() => {
  resetRuntimeTaskTestState({ persist: false });
});

describe("retained runtime TaskFlow continuity", () => {
  beforeEach(() => {
    installRuntimeTaskDeliveryMock();
  });

  it("finishes with the exact native terminal step and exposes active and terminal owners", () => {
    const taskFlow = createRuntimeTaskFlow().bindSession({ sessionKey: "agent:main:main" });
    const active = requireFlow(
      taskFlow.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Current continuity",
        status: "waiting",
      }),
    );
    const terminal = requireFlow(
      taskFlow.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Candidate closeout",
      }),
    );
    const finished = taskFlow.finish({
      flowId: terminal.flowId,
      expectedRevision: terminal.revision,
      currentStep: "closed_candidate_complete",
      stateJson: { state: "closed_candidate_complete" },
    });
    if (!finished.applied) {
      throw new Error("expected terminal TaskFlow to finish");
    }

    expect(finished.flow.currentStep).toBe("closed_candidate_complete");
    expect(taskFlow.findLatestActiveManaged()?.flowId).toBe(active.flowId);
    expect(taskFlow.findLatestTerminalManaged()?.flowId).toBe(finished.flow.flowId);
  });

  it("validates a terminal handoff after the physical context resets under the same owner", () => {
    const runtime = createRuntimeTaskFlow();
    const requesterOrigin = { channel: "telegram", to: "telegram:123" };
    const priorOwner = runtime.bindSession({
      sessionKey: "agent:main:subagent:prior",
      requesterOrigin,
    });
    const prior = requireFlow(
      priorOwner.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Original work",
      }),
    );
    const closed = priorOwner.finish({
      flowId: prior.flowId,
      expectedRevision: prior.revision,
      stateJson: { artifact: { ref: "candidate.md", digest: "digest-1" } },
    });
    if (!closed.applied) {
      throw new Error("expected terminal TaskFlow to finish");
    }
    const handoff = priorOwner.buildCloseoutHandoff(closed.flow.flowId);
    if (!handoff) {
      throw new Error("expected terminal handoff");
    }

    const resetOwner = runtime.bindSession({
      sessionKey: "agent:main:subagent:prior",
      requesterOrigin,
    });
    expect(resetOwner.validateCloseoutHandoff({ stateJson: handoff.stateJson })).toEqual({
      valid: true,
    });
    expect(handoff.governingArtifacts).toEqual([{ ref: "candidate.md", digest: "digest-1" }]);
    expect(
      runtime
        .bindSession({
          sessionKey: "agent:main:subagent:unrelated",
          requesterOrigin,
        })
        .validateCloseoutHandoff({ stateJson: handoff.stateJson }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
  });
});
