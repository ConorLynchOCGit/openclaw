import { callGatewayCli } from "../gateway/call.js";
import type { RuntimeEnv } from "../runtime.js";
import { writeRuntimeJson } from "../runtime.js";
import { GBrainSignalDetectorCoverageCheckName } from "../tasks/task-execution-check-run.js";

export type ChecksRunCommandOptions = {
  json?: boolean;
  check: string;
  agents?: string;
  checkRunId?: string;
  timeoutMs?: number;
  submitTimeoutMs?: number;
  laneTimeoutMs?: number;
  pollIntervalMs?: number;
};

function parseAgents(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function checksRunCommand(
  opts: ChecksRunCommandOptions,
  runtime: RuntimeEnv,
): Promise<void> {
  const check = opts.check.trim();
  if (check !== GBrainSignalDetectorCoverageCheckName) {
    const payload = {
      check,
      status: "failed",
      failures: [
        {
          code: "unknown_check",
          detail: `unknown check run: ${check || "missing"}`,
        },
      ],
    };
    if (opts.json) {
      writeRuntimeJson(runtime, payload);
    } else {
      runtime.error(payload.failures[0]?.detail ?? "unknown check run");
    }
    runtime.exit(1);
    return;
  }

  const result = await callGatewayCli<{
    status?: string;
    checkRunId?: string;
    passedCount?: number;
    failedCount?: number;
  }>({
    method: "checks.run",
    params: {
      check,
      agents: parseAgents(opts.agents),
      checkRunId: opts.checkRunId,
      submitTimeoutMs: opts.submitTimeoutMs,
      laneTimeoutMs: opts.laneTimeoutMs,
      pollIntervalMs: opts.pollIntervalMs,
    },
    timeoutMs: opts.timeoutMs ?? 300_000,
  });

  if (opts.json) {
    writeRuntimeJson(runtime, result);
  } else if (result.status === "passed") {
    runtime.log(
      `CheckRun ${result.checkRunId ?? check} passed (${result.passedCount ?? "?"} passed, ${result.failedCount ?? 0} failed).`,
    );
  } else {
    runtime.error(
      `CheckRun ${result.checkRunId ?? check} failed (${result.passedCount ?? 0} passed, ${result.failedCount ?? "?"} failed).`,
    );
  }

  if (result.status !== "passed") {
    runtime.exit(1);
  }
}
