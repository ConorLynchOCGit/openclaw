import { describe, expect, it } from "vitest";
import {
  buildChildRunObservation,
  buildSessionReadbackEvidenceView,
  buildSkillUseObservation,
  buildTaskReadbackEvidenceView,
} from "./evidence-adapter.js";
import { selectActiveWork, selectFinality, selectSkillUse } from "./evidence-selectors.js";

describe("readback evidence adapter", () => {
  it("derives finality from native session final assistant evidence", () => {
    const view = buildSessionReadbackEvidenceView({
      key: "agent:planning:proof",
      sessionId: "sess-planning",
      status: "done",
      agentId: "planning",
      finalAssistantText: "Final Planning artifact.",
      activeProgress: {
        source: "task-run-event",
        ref: "task:task-planning",
        currentPhase: "succeeded",
        outputSummary: "approval packet text must not become waitReason",
        derivedBy: "test",
        bounded: true,
      },
      readbackProvenance: {
        status: {
          source: "session-store",
          ref: "session:agent:planning:proof",
          derivedBy: "test",
          bounded: true,
        },
        finalAssistantText: {
          source: "session-transcript",
          ref: "transcript:sess-planning",
          derivedBy: "test",
          bounded: true,
        },
      },
    });

    expect(selectFinality(view)).toMatchObject({
      type: "finality",
      state: "succeeded",
      payload: {
        finalAssistantTextPresent: true,
        finalAssistantText: "Final Planning artifact.",
        finalAssistantTextChars: "Final Planning artifact.".length,
        resultPresent: true,
        ownerAgentId: "planning",
      },
    });
    expect(selectActiveWork(view)).toMatchObject({
      type: "active_work",
      state: "succeeded",
      payload: {
        phase: "succeeded",
        activeToolEvidence: "unavailable",
        resultPreview: "approval packet text must not become waitReason",
      },
    });
    expect(selectActiveWork(view)?.payload.waitReason).toBeUndefined();
  });

  it("keeps wait reason scoped to actual waiting phases", () => {
    const view = buildTaskReadbackEvidenceView({
      taskId: "task-parent",
      status: "running",
      agentId: "planning",
      requesterSessionKey: "agent:main:proof",
      ownerKey: "agent:planning:proof",
      childSessionKey: "agent:codebase-researcher:subagent:child",
      activeProgress: {
        source: "subagent-registry",
        ref: "subagent:child",
        currentPhase: "waiting_on_child",
        note: "waiting for codebase-researcher child",
        toolName: "task",
        pointer: {
          kind: "session",
          ref: "agent:codebase-researcher:subagent:child",
        },
        derivedBy: "test",
        bounded: true,
      },
    });

    expect(selectActiveWork(view)).toMatchObject({
      state: "active",
      payload: {
        phase: "waiting_on_child",
        activeTool: "task",
        activeToolEvidence: "available",
        waitReason: "waiting for codebase-researcher child",
      },
    });
  });

  it("points task finality at related session transcript evidence without making task rows truth", () => {
    const view = buildTaskReadbackEvidenceView({
      taskId: "task-planning",
      status: "succeeded",
      agentId: "planning",
      requesterSessionKey: "agent:main:proof",
      ownerKey: "agent:main:proof",
      childSessionKey: "agent:planning:proof",
      resultSession: {
        sessionKey: "agent:planning:proof",
        agentId: "planning",
        finalAssistantText: "Planning-authored final artifact.",
        readbackProvenance: {
          finalAssistantText: {
            source: "session-transcript",
            ref: "transcript:planning-proof",
            derivedBy: "test",
            bounded: true,
          },
        },
      },
    });

    expect(selectFinality(view)).toMatchObject({
      type: "finality",
      state: "succeeded",
      payload: {
        finalAssistantTextPresent: true,
        finalAssistantTextChars: "Planning-authored final artifact.".length,
        resultPresent: true,
        finalAssistantTextRef: {
          kind: "session",
          ref: "openclaw sessions show agent:planning:proof --agent planning",
        },
      },
    });
    expect(selectFinality(view)?.payload.finalAssistantText).toBeUndefined();
  });

  it("normalizes child runs only when stable ids exist", () => {
    expect(
      buildChildRunObservation({
        subject: {
          kind: "task",
          taskId: "task-parent",
          sessionKey: "agent:planning:proof",
          agentId: "planning",
        },
        child: {
          runId: "run-child",
          executionTaskId: "task-child",
          childSessionKey: "agent:codebase-researcher:subagent:child",
          agentId: "codebase-researcher",
          status: "done",
          handoffKind: "context_pack",
          handoffDeliveryState: "model_visible_full",
        },
      }),
    ).toMatchObject({
      type: "child_run",
      state: "succeeded",
      payload: {
        childAgentId: "codebase-researcher",
        childSessionKey: "agent:codebase-researcher:subagent:child",
        mergeConfidence: "exact",
        handoffKind: "context_pack",
        delivery: "model_visible_full",
      },
    });

    expect(
      buildChildRunObservation({
        subject: { kind: "task", taskId: "task-parent", agentId: "planning" },
        child: {
          agentId: "codebase-researcher",
          status: "running",
        },
      }).payload.mergeConfidence,
    ).toBe("none");
  });

  it("treats visible skill catalog separately from skill-used activation evidence", () => {
    const observation = buildSkillUseObservation({
      agentId: "planning",
      skillName: "comprehensive-plan-record",
      skillPath: "/repo/.agents/skills/comprehensive-plan-record/SKILL.md",
      sessionKey: "agent:planning:proof",
      eventId: "42",
      createdAt: "2026-07-05T00:00:00Z",
    });

    expect(observation).toMatchObject({
      type: "skill_use",
      state: "succeeded",
      payload: {
        agentId: "planning",
        skillName: "comprehensive-plan-record",
        readStatus: "full",
        evidenceSource: "skill.used",
      },
    });
    expect(
      selectSkillUse({
        subject: observation!.subject,
        observations: [observation!],
        mismatches: [],
      }),
    ).toHaveLength(1);
  });
});
