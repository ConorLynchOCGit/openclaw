import { describe, expect, it, vi } from "vitest";
import type { SkillCandidateCreateResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createSkillCandidateCreateTool,
  normalizeSkillCandidateCreateInput,
} from "./skill-candidate-create.js";

function createCreateResult(): SkillCandidateCreateResult {
  return {
    accepted: true,
    status: "created",
    procedureId: "procedure-1",
    skillCandidateId: "skill-candidate-1",
    skillCandidateStatus: "candidate",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    skillCandidate: {
      create: vi.fn(async () => createCreateResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory skill candidate create tool", () => {
  it("normalizes a skill-candidate creation payload", () => {
    expect(
      normalizeSkillCandidateCreateInput({
        rawParams: {
          procedureId: " procedure-1 ",
          name: " Bounded Skill Candidate ",
          summary: " Candidate summary ",
          rationale: " Reviewed for manual skill-candidate creation ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      procedureId: "procedure-1",
      name: "Bounded Skill Candidate",
      summary: "Candidate summary",
      rationale: "Reviewed for manual skill-candidate creation",
      creatorAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes skill-candidate creation through the bounded creation seam", async () => {
    const runtime = createRuntime();
    const tool = createSkillCandidateCreateTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      procedureId: "procedure-1",
      rationale: "Manual skill-candidate creation approved.",
    });

    expect(runtime.skillCandidate.create).toHaveBeenCalledWith({
      procedureId: "procedure-1",
      rationale: "Manual skill-candidate creation approved.",
      creatorAgentId: "agent-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createCreateResult(), null, 2),
        },
      ],
      details: createCreateResult(),
    });
  });

  it("surfaces ineligible skill-candidate creation results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: SkillCandidateCreateResult = {
      accepted: false,
      status: "ineligible",
      reason: "validated procedure is missing source candidate provenance",
    };
    runtime.skillCandidate.create = vi.fn(async () => ineligibleResult);
    const tool = createSkillCandidateCreateTool({ runtime });

    const result = await tool.execute("call-2", {
      procedureId: "procedure-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("rejects missing procedure ids", () => {
    expect(() =>
      normalizeSkillCandidateCreateInput({
        rawParams: {
          procedureId: "   ",
        },
      }),
    ).toThrow("procedureId required");
  });
});
