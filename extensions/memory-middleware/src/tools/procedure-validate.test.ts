import { describe, expect, it, vi } from "vitest";
import type { ProcedureValidationResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createProcedureValidateTool,
  normalizeProcedureValidationInput,
} from "./procedure-validate.js";

const storeValidatedProcedureSemanticEmbedding = vi.hoisted(() => vi.fn(async () => true));
const createSemanticFallbackSharedState = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("../semantic-retrieval-routing.js", () => ({
  createSemanticFallbackSharedState,
  storeValidatedProcedureSemanticEmbedding,
}));

function createValidationResult(): ProcedureValidationResult {
  return {
    accepted: true,
    status: "validated",
    procedureId: "procedure-1",
    procedureStatus: "validated",
    procedureRunId: "run-1",
    sourceCandidateId: "candidate-1",
  };
}

function createRuntime() {
  return {
    config: {
      database: {
        driver: "postgres",
        url: "postgres://example.test/openclaw",
      },
    },
    procedureValidation: {
      validate: vi.fn(async () => createValidationResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory procedure validate tool", () => {
  it("normalizes a procedure validation payload", () => {
    expect(
      normalizeProcedureValidationInput({
        rawParams: {
          procedureId: " procedure-1 ",
          rationale: " reviewed after bounded execution evidence ",
          metadata: { source: "unit-test" },
        },
        context: { agentId: "agent-1", sessionId: "session-1" },
      }),
    ).toEqual({
      procedureId: "procedure-1",
      rationale: "reviewed after bounded execution evidence",
      validatorAgentId: "agent-1",
      metadata: { source: "unit-test" },
    });
  });

  it("routes validation requests through the procedure validation seam", async () => {
    const runtime = createRuntime();
    const tool = createProcedureValidateTool({
      runtime,
      context: { agentId: "agent-1", sessionId: "session-1" },
    });

    const result = await tool.execute("call-1", {
      procedureId: "procedure-1",
      rationale: "Manual validation approved.",
    });

    expect(runtime.procedureValidation.validate).toHaveBeenCalledWith({
      procedureId: "procedure-1",
      rationale: "Manual validation approved.",
      validatorAgentId: "agent-1",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createValidationResult(), null, 2),
        },
      ],
      details: createValidationResult(),
    });
  });

  it("surfaces ineligible validation results without side effects", async () => {
    const runtime = createRuntime();
    const ineligibleResult: ProcedureValidationResult = {
      accepted: false,
      status: "ineligible",
      reason: "procedure draft is missing candidate source-memory provenance",
    };
    runtime.procedureValidation.validate = vi.fn(async () => ineligibleResult);
    const tool = createProcedureValidateTool({ runtime });

    const result = await tool.execute("call-2", {
      procedureId: "procedure-1",
    });

    expect(result.details).toEqual(ineligibleResult);
  });

  it("stores a validated procedure embedding when runtime config and session context are available", async () => {
    storeValidatedProcedureSemanticEmbedding.mockClear();
    const runtime = createRuntime();
    const tool = createProcedureValidateTool({
      runtime,
      context: {
        agentId: "agent-1",
        sessionKey: "agent:main:main",
        config: { plugins: {} },
      } as never,
    });

    await tool.execute("call-3", {
      procedureId: "procedure-1",
    });

    expect(storeValidatedProcedureSemanticEmbedding).toHaveBeenCalledWith({
      config: runtime.config,
      cfg: { plugins: {} },
      agentId: "agent-1",
      sessionKey: "agent:main:main",
      procedureId: "procedure-1",
    });
  });

  it("rejects missing procedure ids", () => {
    expect(() =>
      normalizeProcedureValidationInput({
        rawParams: {
          procedureId: "   ",
        },
      }),
    ).toThrow("procedureId required");
  });
});
