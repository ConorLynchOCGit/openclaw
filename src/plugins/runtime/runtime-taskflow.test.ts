// Runtime task-flow tests cover plugin task-flow registration and execution behavior.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTaskFlowById } from "../../tasks/task-flow-registry.js";
import { getTaskById } from "../../tasks/task-registry.js";
import {
  installRuntimeTaskDeliveryMock,
  resetRuntimeTaskTestState,
} from "./runtime-task-test-harness.js";
import { createRuntimeTaskFlow } from "./runtime-taskflow.js";

function requireCreatedFlow<T>(flow: T | null): T {
  if (!flow) {
    throw new Error("expected managed TaskFlow creation to succeed");
  }
  return flow;
}

afterEach(() => {
  resetRuntimeTaskTestState({ persist: false });
});

describe("runtime TaskFlow", () => {
  beforeEach(() => {
    installRuntimeTaskDeliveryMock();
  });

  it("binds managed TaskFlow operations to a session key", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
      requesterOrigin: {
        channel: "telegram",
        to: "telegram:123",
      },
    });

    const created = requireCreatedFlow(
      taskFlow.createManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Triage inbox",
        currentStep: "classify",
        stateJson: { lane: "inbox" },
      }),
    );

    expect(created.syncMode).toBe("managed");
    expect(created.ownerKey).toBe("agent:main:main");
    expect(created.controllerId).toBe("tests/runtime-taskflow");
    expect(created.requesterOrigin?.channel).toBe("telegram");
    expect(created.requesterOrigin?.to).toBe("telegram:123");
    expect(created.goal).toBe("Triage inbox");
    expect(taskFlow.get(created.flowId)?.flowId).toBe(created.flowId);
    expect(taskFlow.findLatest()?.flowId).toBe(created.flowId);
    expect(taskFlow.resolve("agent:main:main")?.flowId).toBe(created.flowId);
  });

  it("binds TaskFlows from trusted tool context", () => {
    const runtime = createRuntimeTaskFlow();
    const taskFlow = runtime.fromToolContext({
      sessionKey: "agent:main:main",
      deliveryContext: {
        channel: "discord",
        to: "channel:123",
        threadId: "thread:456",
      },
    });

    const created = requireCreatedFlow(
      taskFlow.createManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Review queue",
      }),
    );

    expect(created.requesterOrigin?.channel).toBe("discord");
    expect(created.requesterOrigin?.to).toBe("channel:123");
    expect(created.requesterOrigin?.threadId).toBe("thread:456");
  });

  it("selects active managed continuity separately from newer terminal flows", () => {
    const taskFlow = createRuntimeTaskFlow().bindSession({ sessionKey: "agent:main:main" });
    const active = requireCreatedFlow(
      taskFlow.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Current continuity",
        status: "waiting",
      }),
    );
    const terminal = requireCreatedFlow(
      taskFlow.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Newer terminal flow",
      }),
    );
    const finished = taskFlow.finish({
      flowId: terminal.flowId,
      expectedRevision: terminal.revision,
    });
    if (!finished.applied) {
      throw new Error("expected terminal TaskFlow to finish");
    }

    expect(taskFlow.findLatestActiveManaged()?.flowId).toBe(active.flowId);
    expect(taskFlow.findLatestTerminalManaged()?.flowId).toBe(finished.flow.flowId);
  });

  it("validates an exact terminal handoff after a fresh physical session retains the owner key", () => {
    const runtime = createRuntimeTaskFlow();
    const requesterOrigin = { channel: "telegram", to: "telegram:123" };
    const priorOwner = runtime.bindSession({
      sessionKey: "agent:main:subagent:prior",
      requesterOrigin,
    });
    const prior = requireCreatedFlow(
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
    const correctionState = handoff.stateJson;
    const resetOwner = runtime.bindSession({
      sessionKey: "agent:main:subagent:prior",
      requesterOrigin,
    });

    expect(resetOwner.validateCloseoutHandoff({ stateJson: correctionState })).toEqual({
      valid: true,
    });
    expect(handoff.governingArtifacts).toEqual([{ ref: "candidate.md", digest: "digest-1" }]);
    const correction = requireCreatedFlow(
      resetOwner.tryCreateManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Correct original work",
        stateJson: correctionState,
      }),
    );
    expect(correction.ownerKey).toBe("agent:main:subagent:prior");
    expect(correction.stateJson).toEqual(correctionState);
    expect(
      runtime
        .bindSession({
          sessionKey: "agent:main:subagent:unrelated",
          requesterOrigin,
        })
        .validateCloseoutHandoff({ stateJson: correctionState }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
    expect(
      runtime
        .bindSession({
          sessionKey: "agent:main:subagent:prior",
          requesterOrigin: { channel: "telegram", to: "telegram:other" },
        })
        .validateCloseoutHandoff({ stateJson: correctionState }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
    expect(
      resetOwner.validateCloseoutHandoff({
        stateJson: { ...correctionState, priorFlowRevision: closed.flow.revision - 1 },
      }),
    ).toEqual({ valid: false, code: "revision_conflict" });
  });

  it("rejects tool contexts without a bound session key", () => {
    const runtime = createRuntimeTaskFlow();
    expect(() =>
      runtime.fromToolContext({
        sessionKey: undefined,
        deliveryContext: undefined,
      }),
    ).toThrow("TaskFlow runtime requires tool context with a sessionKey.");
  });

  it("keeps TaskFlow reads owner-scoped and runs child tasks under the bound TaskFlow", () => {
    const runtime = createRuntimeTaskFlow();
    const ownerTaskFlow = runtime.bindSession({
      sessionKey: "agent:main:main",
    });
    const otherTaskFlow = runtime.bindSession({
      sessionKey: "agent:main:other",
    });

    const created = requireCreatedFlow(
      ownerTaskFlow.createManaged({
        controllerId: "tests/runtime-taskflow",
        goal: "Inspect PR batch",
      }),
    );

    expect(otherTaskFlow.get(created.flowId)).toBeUndefined();
    expect(otherTaskFlow.list()).toStrictEqual([]);

    const child = ownerTaskFlow.runTask({
      flowId: created.flowId,
      runtime: "acp",
      childSessionKey: "agent:main:subagent:child",
      runId: "runtime-taskflow-child",
      task: "Inspect PR 1",
      status: "running",
      startedAt: 10,
      lastEventAt: 10,
    });

    expect(child.created).toBe(true);
    if (!child.created) {
      throw new Error("expected child task creation to succeed");
    }
    expect(child.flow.flowId).toBe(created.flowId);
    expect(child.task.parentFlowId).toBe(created.flowId);
    expect(child.task.ownerKey).toBe("agent:main:main");
    expect(child.task.runId).toBe("runtime-taskflow-child");

    const storedTask = getTaskById(child.task.taskId);
    expect(storedTask?.parentFlowId).toBe(created.flowId);
    expect(storedTask?.ownerKey).toBe("agent:main:main");
    expect(getTaskFlowById(created.flowId)?.flowId).toBe(created.flowId);
    const summary = ownerTaskFlow.getTaskSummary(created.flowId);
    if (!summary) {
      throw new Error("expected task summary for created flow");
    }
    expect(summary.total).toBe(1);
    expect(summary.active).toBe(1);
  });
});
