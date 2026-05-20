import { describe, expect, it } from "vitest";
import type { RuntimeJobEvent } from "../runtime-job-repository.ts";
import {
  buildRuntimeExecutionSpan,
  runtimeExecutionSpanReadback,
} from "./runtime-execution-span.ts";

describe("runtime execution spans", () => {
  it("rejects raw storage flags", () => {
    expect(() =>
      buildRuntimeExecutionSpan({
        spanId: "span-raw",
        spanKind: "model_call",
        status: "running",
        rawPromptStored: true as false,
      } as Parameters<typeof buildRuntimeExecutionSpan>[0]),
    ).toThrow("runtime_execution_span_rejected_raw_storage_flag:rawPromptStored");
  });

  it("summarizes active, stale, and blocked spans from runtime events", () => {
    const staleSpan = buildRuntimeExecutionSpan({
      spanId: "span-stale",
      spanKind: "model_call",
      status: "heartbeat",
      phase: "heartbeat",
      modelRef: "openai/gpt-5.5",
      objective: "Generate graph.",
      lastHeartbeatAt: "2026-05-19T00:00:00.000Z",
      staleAfterMs: 1_000,
    });
    const blockedSpan = buildRuntimeExecutionSpan({
      spanId: "span-blocked",
      spanKind: "context_scout",
      status: "needs_review",
      phase: "context_scout_review",
      blockerSummary: "Context handoff missing repo refs.",
      nextAction: "Repair context scout packet.",
    });
    const events: RuntimeJobEvent[] = [staleSpan, blockedSpan].map((span, index) => ({
      eventId: `event-${index}`,
      jobId: "job-span",
      eventType: "runtime_execution.span",
      eventTime: new Date(`2026-05-19T00:00:0${index}.000Z`),
      workerId: null,
      leaseId: null,
      data: { executionSpan: span },
    }));

    const readback = runtimeExecutionSpanReadback({
      events,
      now: new Date("2026-05-19T00:00:03.000Z"),
    });

    expect(readback).toMatchObject({
      state: "present",
      currentSpanId: "span-stale",
      currentSpanKind: "model_call",
      currentModelRef: "openai/gpt-5.5",
      staleSpanIds: ["span-stale"],
      blockedSpanIds: ["span-blocked"],
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });
});
