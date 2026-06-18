import { describe, expect, it } from "vitest";
import {
  assertFreshExecutionPlanBinding,
  executionPlanAllowsModel,
  resolveExecutionPlan,
} from "./execution-plan.js";
import {
  createResolvedAgentRunReceiptFromPlan,
  finalizeAgentRunReceiptFromAttempt,
} from "./run-receipt.js";

describe("resolveExecutionPlan", () => {
  const cfg = {
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.5", fallbacks: [] },
      },
      list: [
        { id: "main", default: true },
        {
          id: "memory-curator",
          model: {
            primary: "openrouter/anthropic/claude-haiku-4.5",
            fallbacks: [
              "openrouter/google/gemini-2.5-flash-lite",
              "openrouter/google/gemini-2.0-flash-lite-001",
            ],
          },
          models: {
            "openrouter/anthropic/claude-haiku-4.5": {
              agentRuntime: { id: "openclaw" },
            },
            "openrouter/google/gemini-2.5-flash-lite": {
              agentRuntime: { id: "openclaw" },
            },
            "openrouter/google/gemini-2.0-flash-lite-001": {
              agentRuntime: { id: "openclaw" },
            },
          },
        },
      ],
    },
  };

  it("uses the target agent model for fresh targeted launches", () => {
    expect(
      resolveExecutionPlan({
        cfg,
        runId: "run-memory-curator-route",
        targetAgentId: "memory-curator",
        source: { kind: "plugin", id: "gbrain-context", hook: "message_received" },
        launchMode: "fresh",
        contextMode: "lightweight",
        sessionModel: {
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      }),
    ).toMatchObject({
      runId: "run-memory-curator-route",
      targetAgentId: "memory-curator",
      launchMode: "fresh",
      source: { kind: "plugin", id: "gbrain-context", hook: "message_received" },
      contextMode: "lightweight",
      model: {
        provider: "openrouter",
        model: "anthropic/claude-haiku-4.5",
      },
      runtime: "openclaw",
      fallbacks: [
        {
          provider: "openrouter",
          model: "google/gemini-2.5-flash-lite",
        },
        {
          provider: "openrouter",
          model: "google/gemini-2.0-flash-lite-001",
        },
      ],
      policy: { overrideAuthorized: false, resumeAuthorized: false },
    });
  });

  it("uses the session model only for resume launches", () => {
    expect(
      resolveExecutionPlan({
        cfg,
        runId: "run-memory-curator-resume",
        targetAgentId: "memory-curator",
        launchMode: "resume",
        sessionModel: {
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      }),
    ).toMatchObject({
      runId: "run-memory-curator-resume",
      launchMode: "resume",
      model: {
        provider: "openai",
        model: "gpt-5.5",
      },
      policy: { overrideAuthorized: false, resumeAuthorized: true },
    });
  });

  it("uses explicit request overrides only when authorized", () => {
    expect(
      resolveExecutionPlan({
        cfg,
        targetAgentId: "memory-curator",
        launchMode: "fresh",
        requestedProvider: "openrouter",
        requestedModel: "anthropic/claude-sonnet-4.6",
        allowRequestOverride: true,
      }).model,
    ).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.6",
    });

    expect(
      resolveExecutionPlan({
        cfg,
        targetAgentId: "memory-curator",
        launchMode: "fresh",
        requestedProvider: "openrouter",
        requestedModel: "anthropic/claude-sonnet-4.6",
        allowRequestOverride: false,
      }).model,
    ).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });
  });

  it("rejects stale model/runtime bindings for fresh targeted launches", () => {
    const plan = resolveExecutionPlan({
      cfg,
      runId: "run-memory-curator-route",
      targetAgentId: "memory-curator",
      source: { kind: "plugin", id: "gbrain-context", hook: "message_received" },
      launchMode: "fresh",
      contextMode: "lightweight",
      sessionModel: {
        modelProvider: "openai",
        model: "gpt-5.5",
      },
    });

    expect(
      executionPlanAllowsModel({
        plan,
        provider: "openrouter",
        model: "anthropic/claude-haiku-4.5",
      }),
    ).toBe(true);
    expect(
      executionPlanAllowsModel({
        plan,
        provider: "openrouter",
        model: "google/gemini-2.5-flash-lite",
      }),
    ).toBe(true);
    expect(
      executionPlanAllowsModel({
        plan,
        provider: "openai",
        model: "gpt-5.5",
      }),
    ).toBe(false);

    expect(() =>
      assertFreshExecutionPlanBinding({
        plan,
        runId: "run-memory-curator-route",
        agentId: "memory-curator",
        provider: "openrouter",
        model: "anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        stage: "test",
      }),
    ).not.toThrow();

    expect(() =>
      assertFreshExecutionPlanBinding({
        plan,
        runId: "run-memory-curator-route",
        agentId: "memory-curator",
        provider: "openai",
        model: "gpt-5.5",
        runtime: "codex",
        stage: "test",
      }),
    ).toThrow(/runtime drift|model drift/);
  });

  it("derives finalized receipts from attempt records", () => {
    const plan = resolveExecutionPlan({
      cfg,
      runId: "run-memory-curator-route",
      targetAgentId: "memory-curator",
      source: { kind: "plugin", id: "gbrain-context", hook: "message_received" },
      launchMode: "fresh",
      contextMode: "lightweight",
      sessionModel: {
        modelProvider: "openai",
        model: "gpt-5.5",
      },
    });
    const receipt = finalizeAgentRunReceiptFromAttempt(
      createResolvedAgentRunReceiptFromPlan(plan),
      {
        runId: "run-memory-curator-route",
        attemptId: "run-memory-curator-route:attempt:1",
        targetAgentId: "memory-curator",
        startedAt: "2026-06-18T00:00:00.000Z",
        endedAt: "2026-06-18T00:00:01.000Z",
        provider: "openrouter",
        model: "anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        harness: "openclaw",
        contextMode: "lightweight",
        status: "succeeded",
        fallback: { used: false },
      },
    );

    expect(receipt).toMatchObject({
      phase: "finalized",
      terminalStatus: "succeeded",
      source: { kind: "plugin", id: "gbrain-context", hook: "message_received" },
      targetAgentId: "memory-curator",
      resolved: {
        model: "openrouter/anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
      },
      final: {
        model: "openrouter/anthropic/claude-haiku-4.5",
        runtime: "openclaw",
        contextMode: "lightweight",
      },
      fallback: { used: false },
    });
  });
});
