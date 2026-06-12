import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  makeAttemptResult,
  makeCompactionSuccess,
  makeOverflowError,
  mockOverflowRetrySuccess,
  queueOverflowAttemptWithOversizedToolOutput,
} from "./run.overflow-compaction.fixture.js";
import {
  loadRunOverflowCompactionHarness,
  mockedContextEngine,
  mockedCompactDirect,
  mockedIsCompactionFailureError,
  mockedIsLikelyContextOverflowError,
  mockedLog,
  mockedRunEmbeddedAttempt,
  mockedSessionLikelyHasOversizedToolResults,
  mockedTruncateOversizedToolResultsInSession,
  overflowBaseRunParams as baseParams,
} from "./run.overflow-compaction.harness.js";
import type { EmbeddedRunAttemptResult } from "./run/types.js";

let runEmbeddedPiAgent: typeof import("./run.js").runEmbeddedPiAgent;

function makePreflightPressureOutcome(params: {
  action: "prune_retry" | "summary_retry";
  truncatedCount?: number;
  pruneReducibleChars?: number;
}): NonNullable<EmbeddedRunAttemptResult["contextPressureOutcome"]> {
  const budget = {
    contextWindowTokens: 200_000,
    reserveTokens: 20_000,
    usableTokens: 180_000,
  };
  const decision = {
    trigger: "preflight_emergency_estimate" as const,
    action: params.action,
    diagId: "ctxp_test",
    budget,
    prune: {
      attempted: params.action === "prune_retry",
      truncatedCount: params.truncatedCount ?? 0,
      reducibleChars: params.pruneReducibleChars ?? 0,
    },
  };
  if (params.action === "prune_retry") {
    return {
      action: "prune_retry",
      decision,
      prune: {
        truncated: true,
        truncatedCount: params.truncatedCount ?? 0,
      },
    };
  }
  return {
    action: "summary_retry",
    decision,
  };
}

describe("overflow compaction in run loop", () => {
  beforeAll(async () => {
    ({ runEmbeddedPiAgent } = await loadRunOverflowCompactionHarness());
  });

  beforeEach(() => {
    mockedRunEmbeddedAttempt.mockReset();
    mockedCompactDirect.mockReset();
    mockedSessionLikelyHasOversizedToolResults.mockReset();
    mockedTruncateOversizedToolResultsInSession.mockReset();
    mockedContextEngine.info.ownsCompaction = false;
    mockedLog.debug.mockReset();
    mockedLog.info.mockReset();
    mockedLog.warn.mockReset();
    mockedLog.error.mockReset();
    mockedLog.isEnabled.mockReset();
    mockedLog.isEnabled.mockReturnValue(false);
    mockedIsCompactionFailureError.mockImplementation((msg?: string) => {
      if (!msg) {
        return false;
      }
      const lower = msg.toLowerCase();
      return lower.includes("request_too_large") && lower.includes("summarization failed");
    });
    mockedIsLikelyContextOverflowError.mockImplementation((msg?: string) => {
      if (!msg) {
        return false;
      }
      const lower = msg.toLowerCase();
      return (
        lower.includes("request_too_large") ||
        lower.includes("request size exceeds") ||
        lower.includes("context window exceeded") ||
        lower.includes("prompt too large")
      );
    });
    mockedCompactDirect.mockResolvedValue({
      ok: false,
      compacted: false,
      reason: "nothing to compact",
    });
    mockedSessionLikelyHasOversizedToolResults.mockReturnValue(false);
    mockedTruncateOversizedToolResultsInSession.mockResolvedValue({
      truncated: false,
      truncatedCount: 0,
      reason: "no oversized tool results",
    });
  });

  it("retries after successful compaction on context overflow promptError", async () => {
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
    });

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: expect.objectContaining({ authProfileId: "test-profile" }),
      }),
    );
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "context overflow detected (attempt 1/3); attempting auto-compaction",
      ),
    );
    expect(mockedLog.info).toHaveBeenCalledWith(
      expect.stringContaining("auto-compaction succeeded"),
    );
    // Should not be an error result
    expect(result.meta.error).toBeUndefined();
  });

  it("adds node-worker continuation instructions to overflow compaction", async () => {
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
    });

    await runEmbeddedPiAgent({
      ...baseParams,
      agentId: "execution-coding",
      sessionKey: "agent:execution-coding:node:nrun_test",
      customInstructions: "Preserve current changed files.",
    });

    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("Preserve current changed files."),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("Continue the current implementation."),
      }),
    );
  });

  it("adds source-shaped changed-file repair windows to node-worker compaction", async () => {
    const workspaceDir = path.join("/tmp", `openclaw-overflow-compaction-${Date.now()}`);
    const changedFile = "src/changed.ts";
    await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, changedFile),
      Array.from({ length: 120 }, (_, index) =>
        index + 1 === 50 ? "export const target = 1;" : `const value${index + 1} = ${index + 1};`,
      ).join("\n"),
      "utf8",
    );
    const overflowError = makeOverflowError();
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: overflowError,
        nodeAgentSessionTrace: {
          firstEditRef: "openclaw-tool-result://edit-1",
          changeSetRef: "openclaw-session-working-context://change-set-1",
          validationStateRef: "openclaw-session-working-context://validation-1",
          validationScoutResultRef: "openclaw-child-result://validation-1",
          firstEditChangedFilePaths: [changedFile],
          firstEditFirstChangedLine: 50,
          firstEditDiffAvailable: true,
          firstEditDiffByteCount: 512,
          firstEditDiagnosticSummaries: [`ERROR ${changedFile}:51:9 missing event delta field`],
        },
      }),
    );
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));
    mockedCompactDirect.mockResolvedValueOnce(
      makeCompactionSuccess({
        summary: "Compacted session",
        firstKeptEntryId: "entry-5",
      }),
    );

    await runEmbeddedPiAgent({
      ...baseParams,
      agentId: "execution-coding",
      sessionKey: "agent:execution-coding:node:nrun_test",
      workspaceDir,
    });

    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("<compaction_repair_context>"),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining(`<path>${changedFile}</path>`),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("50: export const target = 1;"),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("<changed_hunks>"),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("diffByteCount=512"),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("missing event delta field"),
      }),
    );
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("validationStateRef="),
      }),
    );
  });

  it("retries after successful compaction on likely-overflow promptError variants", async () => {
    const overflowHintError = new Error("Context window exceeded: requested 12000 tokens");

    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowHintError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce(
      makeCompactionSuccess({
        summary: "Compacted session",
        firstKeptEntryId: "entry-6",
        tokensBefore: 140000,
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.warn).toHaveBeenCalledWith(expect.stringContaining("source=promptError"));
    expect(result.meta.error).toBeUndefined();
  });

  it("returns error if compaction fails", async () => {
    const overflowError = makeOverflowError();

    mockedRunEmbeddedAttempt.mockResolvedValue(makeAttemptResult({ promptError: overflowError }));

    mockedCompactDirect.mockResolvedValueOnce({
      ok: false,
      compacted: false,
      reason: "nothing to compact",
    });

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(result.meta.error?.kind).toBe("context_overflow");
    expect(result.payloads?.[0]?.isError).toBe(true);
    expect(mockedLog.warn).toHaveBeenCalledWith(expect.stringContaining("auto-compaction failed"));
  });

  it("prunes tool results and retries before LLM compaction when oversized results are detected", async () => {
    queueOverflowAttemptWithOversizedToolOutput(mockedRunEmbeddedAttempt, makeOverflowError());
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce({
      ok: false,
      compacted: false,
      reason: "nothing to compact",
    });
    mockedSessionLikelyHasOversizedToolResults.mockReturnValue(true);
    mockedTruncateOversizedToolResultsInSession.mockResolvedValueOnce({
      truncated: true,
      truncatedCount: 1,
    });

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedTruncateOversizedToolResultsInSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionFile: "/tmp/session.json" }),
    );
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.info).toHaveBeenCalledWith(
      expect.stringContaining("deterministic prune succeeded before LLM compaction"),
    );
    expect(result.meta.error).toBeUndefined();
  });

  it("retries after prune-only recovery for a mixed oversized-plus-aggregate tool tail", async () => {
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(
        makeAttemptResult({
          promptError: makeOverflowError(),
          messagesSnapshot: [
            {
              role: "toolResult",
              content: [{ type: "text", text: "x".repeat(80_000) }],
            } as unknown as EmbeddedRunAttemptResult["messagesSnapshot"][number],
            {
              role: "toolResult",
              content: [{ type: "text", text: "alpha beta gamma delta ".repeat(800) }],
            } as unknown as EmbeddedRunAttemptResult["messagesSnapshot"][number],
            {
              role: "toolResult",
              content: [{ type: "text", text: "alpha beta gamma delta ".repeat(800) }],
            } as unknown as EmbeddedRunAttemptResult["messagesSnapshot"][number],
          ],
        }),
      )
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce({
      ok: false,
      compacted: false,
      reason: "nothing to compact",
    });
    mockedSessionLikelyHasOversizedToolResults.mockReturnValue(true);
    mockedTruncateOversizedToolResultsInSession.mockResolvedValueOnce({
      truncated: true,
      truncatedCount: 2,
    });

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedTruncateOversizedToolResultsInSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionFile: "/tmp/session.json" }),
    );
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.info).toHaveBeenCalledWith(
      expect.stringContaining("deterministic prune succeeded before LLM compaction"),
    );
    expect(result.meta.error).toBeUndefined();
  });

  it("retries without hitting compaction when attempt-level preflight truncation already handled the overflow", async () => {
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(
        makeAttemptResult({
          promptError: null,
          contextPressureOutcome: makePreflightPressureOutcome({
            action: "prune_retry",
            truncatedCount: 2,
          }),
        }),
      )
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedTruncateOversizedToolResultsInSession).not.toHaveBeenCalled();
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.info).toHaveBeenCalledWith(
      expect.stringContaining("early pressure action=prune_retry"),
    );
    expect(result.meta.error).toBeUndefined();
  });

  it("blocks provider-context admission precheck without retrying or compacting", async () => {
    const error = new Error(
      "Provider context admission failed before model invocation. Missing skills: execution-node-workflow.",
    );
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(
      makeAttemptResult({
        promptError: error,
        promptErrorOrigin: "precheck",
        providerContextAdmissionBlock: {
          reason: error.message,
          reasonCodes: ["provider_context_required_admission_blocked"],
        },
        effectiveToolNames: ["task", "node_finish"],
        nodeAgentSessionTrace: {
          providerContextAdmission: "blocked",
        },
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedTruncateOversizedToolResultsInSession).not.toHaveBeenCalled();
    expect(result.payloads).toBeDefined();
    const payload = result.payloads?.[0];
    expect(payload?.isError).toBe(true);
    expect(payload?.text).toContain("Provider context admission failed");
    expect(result.meta.error).toMatchObject({
      kind: "provider_context_admission",
      reasonCodes: ["provider_context_required_admission_blocked"],
    });
    expect(result.meta.effectiveToolNames).toEqual(["task", "node_finish"]);
    expect(result.meta.nodeAgentSessionTrace).toEqual({
      providerContextAdmission: "blocked",
    });
  });

  it("falls back to compaction when early truncate-only recovery does not help", async () => {
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(
        makeAttemptResult({
          promptError: makeOverflowError(
            "Context overflow: prompt too large for the model (precheck).",
          ),
          contextPressureOutcome: makePreflightPressureOutcome({
            action: "summary_retry",
          }),
        }),
      )
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce(
      makeCompactionSuccess({
        summary: "Compacted after failed early truncation",
        firstKeptEntryId: "entry-7",
        tokensBefore: 155000,
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedTruncateOversizedToolResultsInSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionFile: "/tmp/session.json" }),
    );
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "context overflow detected (attempt 1/3); attempting auto-compaction",
      ),
    );
    expect(result.meta.error).toBeUndefined();
  });

  it("runs post-compaction tool-result truncation before retry for mixed precheck routes", async () => {
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(
        makeAttemptResult({
          promptError: makeOverflowError(
            "Context overflow: prompt too large for the model (precheck).",
          ),
          contextPressureOutcome: makePreflightPressureOutcome({
            action: "summary_retry",
            pruneReducibleChars: 10_000,
          }),
        }),
      )
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce(
      makeCompactionSuccess({
        summary: "Compacted session",
        firstKeptEntryId: "entry-5",
        tokensBefore: 150000,
      }),
    );
    mockedTruncateOversizedToolResultsInSession
      .mockResolvedValueOnce({
        truncated: false,
        truncatedCount: 0,
        reason: "no oversized tool results",
      })
      .mockResolvedValueOnce({
        truncated: true,
        truncatedCount: 2,
      });

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedTruncateOversizedToolResultsInSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionFile: "/tmp/session.json" }),
    );
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.info).toHaveBeenCalledWith(
      expect.stringContaining("post-compaction tool-result truncation succeeded"),
    );
    expect(result.meta.error).toBeUndefined();
  });

  it("retries compaction up to 3 times before giving up", async () => {
    const overflowError = makeOverflowError();

    // 4 overflow errors: 3 compaction retries + final failure
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }));

    mockedCompactDirect
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 1",
          firstKeptEntryId: "entry-3",
          tokensBefore: 180000,
        }),
      )
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 2",
          firstKeptEntryId: "entry-5",
          tokensBefore: 160000,
        }),
      )
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 3",
          firstKeptEntryId: "entry-7",
          tokensBefore: 140000,
        }),
      );

    const result = await runEmbeddedPiAgent(baseParams);

    // Compaction attempted 3 times (max)
    expect(mockedCompactDirect).toHaveBeenCalledTimes(3);
    // 4 attempts: 3 overflow+compact+retry cycles + final overflow → error
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(4);
    expect(result.meta.error?.kind).toBe("context_overflow");
    expect(result.payloads?.[0]?.isError).toBe(true);
  });

  it("succeeds after second compaction attempt", async () => {
    const overflowError = makeOverflowError();

    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 1",
          firstKeptEntryId: "entry-3",
          tokensBefore: 180000,
        }),
      )
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 2",
          firstKeptEntryId: "entry-5",
          tokensBefore: 160000,
        }),
      );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(2);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(3);
    expect(result.meta.error).toBeUndefined();
  });

  it("does not attempt compaction for compaction_failure errors", async () => {
    const compactionFailureError = new Error(
      "request_too_large: summarization failed - Request size exceeds model context window",
    );

    mockedRunEmbeddedAttempt.mockResolvedValue(
      makeAttemptResult({ promptError: compactionFailureError }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(1);
    expect(result.meta.error?.kind).toBe("compaction_failure");
  });

  it("retries after successful compaction on assistant context overflow errors", async () => {
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(
        makeAttemptResult({
          promptError: null,
          lastAssistant: {
            stopReason: "error",
            errorMessage: "request_too_large: Request size exceeds model context window",
          } as EmbeddedRunAttemptResult["lastAssistant"],
        }),
      )
      .mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    mockedCompactDirect.mockResolvedValueOnce(
      makeCompactionSuccess({
        summary: "Compacted session",
        firstKeptEntryId: "entry-5",
        tokensBefore: 150000,
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(2);
    expect(mockedLog.warn).toHaveBeenCalledWith(expect.stringContaining("source=assistantError"));
    expect(result.meta.error).toBeUndefined();
  });

  it("does not treat stale assistant overflow as current-attempt overflow when promptError is non-overflow", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValue(
      makeAttemptResult({
        promptError: new Error("transport disconnected"),
        lastAssistant: {
          stopReason: "error",
          errorMessage: "request_too_large: Request size exceeds model context window",
        } as EmbeddedRunAttemptResult["lastAssistant"],
      }),
    );

    await expect(runEmbeddedPiAgent(baseParams)).rejects.toThrow("transport disconnected");

    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(mockedLog.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("source=assistantError"),
    );
  });

  it("returns an explicit timeout payload when the run times out before producing any reply", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValue(
      makeAttemptResult({
        aborted: true,
        timedOut: true,
        timedOutDuringCompaction: false,
        assistantTexts: [],
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(result.payloads?.[0]?.isError).toBe(true);
    expect(result.payloads?.[0]?.text).toContain("timed out");
  });

  it("sets promptTokens from the latest model call usage, not accumulated attempt usage", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValue(
      makeAttemptResult({
        attemptUsage: {
          input: 4_000,
          cacheRead: 120_000,
          cacheWrite: 0,
          total: 124_000,
        },
        lastAssistant: {
          stopReason: "end_turn",
          usage: {
            input: 900,
            cacheRead: 1_100,
            cacheWrite: 0,
            total: 2_000,
          },
        } as unknown as EmbeddedRunAttemptResult["lastAssistant"],
      }),
    );

    const result = await runEmbeddedPiAgent(baseParams);

    expect(result.meta.agentMeta?.usage?.input).toBe(4_000);
    expect(result.meta.agentMeta?.promptTokens).toBe(2_000);
  });
});
