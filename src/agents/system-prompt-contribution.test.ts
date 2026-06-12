import { describe, expect, it } from "vitest";
import {
  buildProviderSystemPromptContributionReceipt,
  KIMI_IMPLEMENTATION_WORKER_EXECUTION_CONTRACT_SECTION,
  mergeProviderSystemPromptContributions,
  resolveBuiltInProviderSystemPromptContribution,
} from "./system-prompt-contribution.js";

describe("resolveBuiltInProviderSystemPromptContribution", () => {
  it("does not use the retired Kimi stablePrefix fallback without an execution_worker profile", () => {
    expect(
      resolveBuiltInProviderSystemPromptContribution({
        provider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        agentId: "execution-coding",
      }),
    ).toBeUndefined();
  });

  it("uses section overrides for Kimi execution workers with the execution_worker profile", () => {
    const contribution = resolveBuiltInProviderSystemPromptContribution({
      provider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      agentId: "execution-coding",
      promptProfile: "execution_worker",
    });

    expect(contribution?.stablePrefix).toBeUndefined();
    expect(contribution?.sectionOverrides?.identity).toContain("You are an implementation worker");
    expect(contribution?.sectionOverrides?.execution_contract).toContain(
      "largest currently-grounded coherent vertical edit batch",
    );
    expect(contribution?.sectionOverrides?.tool_call_style).toContain(
      "the next action should be edit",
    );
  });

  it("does not add Kimi implementation-worker guidance to scouts", () => {
    expect(
      resolveBuiltInProviderSystemPromptContribution({
        provider: "openrouter",
        modelId: "moonshotai/kimi-k2.6",
        agentId: "execution-context-scout",
      }),
    ).toBeUndefined();
  });
});

describe("buildProviderSystemPromptContributionReceipt", () => {
  it("shows required but absent when a Kimi execution worker prompt is missing the contribution", () => {
    const receipt = buildProviderSystemPromptContributionReceipt({
      systemPrompt: "## Core\n\nCore prompt text.",
      provider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      agentId: "execution-coding",
      promptProfile: "execution_worker",
    });

    expect(receipt.kimiImplementationWorkerPrompt).toMatchObject({
      required: true,
      present: false,
    });
  });

  it("does not require the Kimi implementation-worker contribution for non-Kimi workers", () => {
    const receipt = buildProviderSystemPromptContributionReceipt({
      systemPrompt: "## Core\n\nCore prompt text.",
      provider: "openrouter",
      modelId: "anthropic/claude-sonnet-4",
      agentId: "execution-coding",
    });

    expect(receipt.kimiImplementationWorkerPrompt).toEqual({
      required: false,
      present: false,
    });
  });

  it("reports section-level prompt receipt data for the execution_worker profile", () => {
    const systemPrompt = [
      "## Identity",
      "You are an implementation worker.",
      "",
      KIMI_IMPLEMENTATION_WORKER_EXECUTION_CONTRACT_SECTION,
    ].join("\n");

    const receipt = buildProviderSystemPromptContributionReceipt({
      systemPrompt,
      provider: "openrouter",
      modelId: "moonshotai/kimi-k2.6",
      agentId: "execution-coding",
      promptMode: "minimal",
      promptProfile: "execution_worker",
    });

    expect(receipt.promptMode).toBe("minimal");
    expect(receipt.promptProfile).toBe("execution_worker");
    expect(receipt.includedSectionIds).toContain("identity");
    expect(receipt.includedSectionIds).toContain("execution_contract");
    expect(receipt.genericAssistantBytes).toBe(0);
    expect(receipt.executionContractBytes).toBeGreaterThan(0);
    expect(receipt.kimiExecutionContractPresent).toBe(true);
    expect(receipt.kimiImplementationWorkerPrompt).toMatchObject({
      required: true,
      present: true,
    });
  });
});

describe("mergeProviderSystemPromptContributions", () => {
  it("merges built-in and plugin contribution blocks without storing prompt text elsewhere", () => {
    const merged = mergeProviderSystemPromptContributions(
      { stablePrefix: "## Built In\n\nBuilt in guidance." },
      {
        stablePrefix: "## Plugin\n\nPlugin guidance.",
        dynamicSuffix: "## Dynamic\n\nRuntime guidance.",
        sectionOverrides: { tool_call_style: "## Tool Call Style\nPlugin tool style." },
      },
    );

    expect(merged).toEqual({
      stablePrefix: "## Built In\n\nBuilt in guidance.\n\n## Plugin\n\nPlugin guidance.",
      dynamicSuffix: "## Dynamic\n\nRuntime guidance.",
      sectionOverrides: { tool_call_style: "## Tool Call Style\nPlugin tool style." },
    });
  });
});
