// Agent-job lifecycle tests prove attempt observations cannot settle logical runs.
import { describe, expect, it } from "vitest";
import { emitAgentEvent } from "../../infra/agent-events.js";
import { waitForAgentJob } from "./agent-job.js";

describe("waitForAgentJob logical finality", () => {
  it("ignores a deferred attempt error until the outer run emits terminal end", async () => {
    const runId = `deferred-attempt-error-${Date.now()}`;
    let settled = false;
    const wait = waitForAgentJob({ runId, timeoutMs: 1_000 }).then((result) => {
      settled = true;
      return result;
    });

    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: { phase: "start", startedAt: Date.now() },
    });
    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: {
        phase: "finishing",
        attemptStatus: "error",
        attemptError: "LLM request failed.",
      },
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: { phase: "end", endedAt: Date.now() },
    });

    await expect(wait).resolves.toMatchObject({ status: "ok" });
  });
});
