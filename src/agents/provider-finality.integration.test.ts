import { describe, expect, it } from "vitest";
import { buildTaskLifecycleReadback } from "../gateway/task-lifecycle-readback.js";
import type { TaskRecord } from "../tasks/task-registry.types.js";
import { resolveProviderLifecycleCause } from "./embedded-agent-error-observation.js";
import {
  classifyFailoverReason,
  classifyProviderRuntimeFailureKind,
} from "./embedded-agent-helpers/errors.js";

type ProviderCase = {
  label: string;
  signal: Parameters<typeof classifyProviderRuntimeFailureKind>[0];
  expectedCause: string;
};

const PROVIDER_CASES: ProviderCase[] = [
  {
    label: "connection establishment",
    signal: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:443" },
    expectedCause: "connection",
  },
  {
    label: "socket disconnect",
    signal: { code: "ECONNRESET", message: "socket hang up" },
    expectedCause: "disconnect",
  },
  {
    label: "provider overload",
    signal: {
      message: '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      provider: "anthropic",
    },
    expectedCause: "overloaded",
  },
  {
    label: "provider timeout",
    signal: { code: "ETIMEDOUT", message: "provider request timed out" },
    expectedCause: "provider_timeout",
  },
  {
    label: "rate limit",
    signal: { status: 429, message: "429 Too Many Requests" },
    expectedCause: "rate_limit",
  },
  {
    label: "malformed provider response",
    signal: { status: 422, message: "422 INVALID_REQUEST_ERROR: string should match pattern" },
    expectedCause: "malformed_response",
  },
];

function taskWithProviderMetadata(params: {
  status: TaskRecord["status"];
  state: string;
  cause: string;
  attemptStatus: string;
}): TaskRecord {
  return {
    taskId: `provider-${params.cause}`,
    runtime: "cli",
    ownerKey: "agent:main:main",
    requesterSessionKey: "agent:main:main",
    scopeKind: "session",
    task: "Exercise provider finality.",
    status: params.status,
    deliveryStatus: "not_applicable",
    notifyPolicy: "done_only",
    createdAt: 1,
    executionReceipt: {
      schema: "openclaw.task.execution_receipt.v1",
      eventCount: 1,
      updatedAt: 2,
      latestEvent: {
        at: 2,
        kind: params.status,
        metadata: {
          providerState: params.state,
          providerCause: params.cause,
          providerAttemptStatus: params.attemptStatus,
        },
      },
    },
  };
}

describe("provider finality", () => {
  it.each(PROVIDER_CASES)(
    "preserves $label as a distinct native cause",
    ({ signal, expectedCause }) => {
      const failoverReason = classifyFailoverReason(signal.message ?? "", {
        provider: signal.provider,
      });
      const runtimeFailureKind = classifyProviderRuntimeFailureKind(signal);

      expect(
        resolveProviderLifecycleCause({
          failoverReason,
          runtimeFailureKind,
        }),
      ).toBe(expectedCause);
    },
  );

  it.each([
    {
      label: "local cancellation",
      status: "cancelled" as const,
      state: "cancelled",
      cause: "local_cancellation",
      attemptStatus: "cancelled",
    },
    {
      label: "explicit outer deadline",
      status: "timed_out" as const,
      state: "failed",
      cause: "outer_deadline",
      attemptStatus: "failed",
    },
    {
      label: "successful fallback after overload",
      status: "succeeded" as const,
      state: "fallback_recovered",
      cause: "overloaded",
      attemptStatus: "succeeded",
    },
    {
      label: "successful provider output with local postprocessing failure",
      status: "failed" as const,
      state: "postprocessing_failed",
      cause: "local_postprocessing",
      attemptStatus: "succeeded",
    },
  ])("projects $label without replacing the primary cause", (fixture) => {
    const readback = buildTaskLifecycleReadback(taskWithProviderMetadata(fixture), {
      tasks: [],
      readSessionEntry: () => undefined,
      readTaskFlow: () => undefined,
    });

    expect(readback.provider).toEqual({
      state: fixture.state,
      cause: fixture.cause,
    });
    expect(readback.physical.attemptStatus).toBe(fixture.attemptStatus);
    expect(readback.logicalStatus).toBe(
      fixture.status === "succeeded"
        ? "completed"
        : fixture.status === "timed_out"
          ? "timed_out"
          : fixture.status,
    );
  });
});
