import { describe, expect, it } from "vitest";
import { resolveExecutionPlan } from "./execution-plan.js";

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
            fallbacks: [],
          },
        },
      ],
    },
  };

  it("uses the target agent model for fresh targeted launches", () => {
    expect(
      resolveExecutionPlan({
        cfg,
        targetAgentId: "memory-curator",
        launchMode: "fresh",
        sessionModel: {
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      }).model,
    ).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });
  });

  it("uses the session model only for resume launches", () => {
    expect(
      resolveExecutionPlan({
        cfg,
        targetAgentId: "memory-curator",
        launchMode: "resume",
        sessionModel: {
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      }).model,
    ).toEqual({
      provider: "openai",
      model: "gpt-5.5",
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
});
