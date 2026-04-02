import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateProcurementRecordResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateProcurementRecordCreateTool,
  normalizeSkillCandidateProcurementRecordCreateInput,
} from "./skill-candidate-procurement-record-create.js";

function createProcurementRecordResult(): SkillCandidateProcurementRecordResult {
  return {
    accepted: true,
    status: "created",
    skillCandidateId: "skill-candidate-1",
    procurementRecordId: "record-1",
    skillCandidateStatus: "candidate",
    sourceProcedureId: "procedure-1",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    skillCandidateProcurementRecord: {
      create: vi.fn(async () => createProcurementRecordResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate procurement record create tool", () => {
  it("normalizes a procurement-record creation payload", () => {
    expect(
      normalizeSkillCandidateProcurementRecordCreateInput({
        rawParams: {
          skillCandidateId: " skill-candidate-1 ",
          rationale: " Persist bounded procurement handoff context ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      skillCandidateId: "skill-candidate-1",
      rationale: "Persist bounded procurement handoff context",
      recorderAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes procurement-record creation through the bounded write seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateProcurementRecordCreateTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      skillCandidateId: "skill-candidate-1",
      rationale: "Manual procurement record creation approved.",
    });

    expect(runtime.skillCandidateProcurementRecord.create).toHaveBeenCalledWith({
      skillCandidateId: "skill-candidate-1",
      rationale: "Manual procurement record creation approved.",
      recorderAgentId: "agent-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createProcurementRecordResult(), null, 2),
        },
      ],
      details: createProcurementRecordResult(),
    });
  });

  it("surfaces ineligible procurement-record results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateProcurementRecordResult = {
      accepted: false,
      status: "ineligible",
      reason:
        "skill candidate is missing source procedure provenance procurement handoff planning requires a bounded skill candidate linked to a validated procedure",
    };
    runtime.skillCandidateProcurementRecord.create = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateProcurementRecordCreateTool({ runtime });

    const result = await tool.execute("call-2", {
      skillCandidateId: "skill-candidate-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing skill-candidate ids", () => {
    expect(() =>
      normalizeSkillCandidateProcurementRecordCreateInput({
        rawParams: {
          skillCandidateId: "   ",
        },
      }),
    ).toThrow("skillCandidateId required");
  });
});
