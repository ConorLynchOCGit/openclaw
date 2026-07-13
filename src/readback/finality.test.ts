import { describe, expect, it } from "vitest";
import { buildSessionReadbackProjection, buildTaskReadbackProjection } from "./finality.js";

describe("readback finality", () => {
  it("lets a current running turn outrank final text from an earlier turn", () => {
    const projection = buildSessionReadbackProjection({
      key: "agent:main:main",
      sessionId: "session-1",
      agentId: "main",
      status: "running",
      finalAssistantText: "Previous turn final.",
    });

    expect(projection.finality).toMatchObject({
      status: "running",
      finalAssistantTextPresent: true,
      finalAssistantTextChars: "Previous turn final.".length,
      mismatch: null,
    });
  });

  it("lets an explicit settled active-run flag override a stale running store status", () => {
    const projection = buildSessionReadbackProjection({
      key: "agent:main:main",
      sessionId: "session-1",
      agentId: "main",
      status: "running",
      hasActiveRun: false,
      finalAssistantText: "Current turn final.",
    });

    expect(projection.finality.status).toBe("done");
    expect(projection.finality.finalAssistantTextPresent).toBe(true);
    expect(projection.finality.mismatch).toMatchObject({ kind: "status_conflict" });
  });

  it("lets transcript finality outrank contradictory session compatibility status", () => {
    const projection = buildSessionReadbackProjection({
      key: "agent:planning:proof",
      sessionId: "session-1",
      agentId: "planning",
      status: "failed",
      finalAssistantText: "Planning final packet.",
    });

    expect(projection.finality).toMatchObject({
      status: "done",
      finalAssistantTextPresent: true,
      finalAssistantTextChars: "Planning final packet.".length,
    });
    expect(projection.finality.mismatch).toMatchObject({
      kind: "status_conflict",
      label: "Compatibility status demoted because transcript final assistant evidence exists.",
    });
  });

  it("lets transcript finality outrank contradictory task compatibility status", () => {
    const projection = buildTaskReadbackProjection({
      taskId: "task-1",
      status: "failed",
      agentId: "codebase-researcher",
      requesterSessionKey: "agent:planning:proof",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      resultSession: {
        sessionKey: "agent:codebase-researcher:subagent:child",
        agentId: "codebase-researcher",
        finalAssistantText: "Context Pack\n\nP1. Useful evidence.",
      },
    });

    expect(projection.finality).toMatchObject({
      status: "done",
      finalAssistantTextPresent: true,
      finalAssistantTextChars: "Context Pack\n\nP1. Useful evidence.".length,
    });
    expect(projection.finality.mismatch).toMatchObject({
      kind: "status_conflict",
      label: "Compatibility status demoted because transcript final assistant evidence exists.",
    });
  });

  it("does not expose a second active-work compatibility object", () => {
    const projection = buildTaskReadbackProjection({
      taskId: "task-running-without-evidence",
      status: "running",
      agentId: "planning",
      requesterSessionKey: "agent:main:proof",
      childSessionKey: "agent:planning:subagent:child",
      resultSession: null,
    });

    expect(projection).not.toHaveProperty("activeWork");
  });
});
