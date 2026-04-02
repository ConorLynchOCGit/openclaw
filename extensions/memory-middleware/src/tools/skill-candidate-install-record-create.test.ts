import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateInstallRecordResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateInstallRecordCreateTool,
  normalizeSkillCandidateInstallRecordCreateInput,
} from "./skill-candidate-install-record-create.js";

function createInstallRecordResult(): SkillCandidateInstallRecordResult {
  return {
    accepted: true,
    status: "created",
    skillCandidateId: "skill-candidate-1",
    installRecordId: "install-record-1",
    installedScope: "limited",
    skillCandidateStatus: "approved_limited",
    approvalRecordId: "approval-1",
    procurementRecordId: "procurement-1",
    vettingResultRecordId: "vetting-1",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    skillCandidateInstallRecord: {
      create: vi.fn(async () => createInstallRecordResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate install record create tool", () => {
  it("normalizes an install-record creation payload", () => {
    expect(
      normalizeSkillCandidateInstallRecordCreateInput({
        rawParams: {
          skillCandidateId: " skill-candidate-1 ",
          installNotes: " Manual installation completed separately ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
      installNotes: "Manual installation completed separately",
      installerAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes install-record creation through the bounded write seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateInstallRecordCreateTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
      installNotes: "Manual install completed by operator.",
    });

    expect(runtime.skillCandidateInstallRecord.create).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
      installNotes: "Manual install completed by operator.",
      installerAgentId: "agent-1",
    });
    expect(result.details).toEqual(createInstallRecordResult());
  });

  it("surfaces ineligible install-record results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateInstallRecordResult = {
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing a bounded approval record manual install handoff requires an internal approval artifact before any separate install step",
    };
    runtime.skillCandidateInstallRecord.create = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateInstallRecordCreateTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateInstallRecordCreateInput({
        rawParams: {
          skillCandidateId: "   ",
        },
      }),
    ).toThrow("skillCandidateId required");
  });
});
