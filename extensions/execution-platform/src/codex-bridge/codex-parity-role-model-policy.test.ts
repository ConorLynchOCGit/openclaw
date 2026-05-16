import { describe, expect, it } from "vitest";
import { buildCodexParityRoleModelPolicy, selectCodexParityRoleModel } from "./index.ts";

describe("Codex parity role/model policy", () => {
  it("selects GPT 5.5 for orchestrator when configured", () => {
    const selection = selectCodexParityRoleModel("orchestrator", {
      availableModelRefs: ["openai-codex/gpt-5.5"],
    });

    expect(selection.modelRef).toBe("openai-codex/gpt-5.5");
    expect(selection.providerPath).toBe("codex_app_server");
    expect(selection.reasoningEffort).toBe("xhigh");
    expect(selection.openClawRoleEvidenceRequired).toBe(true);
    expect(selection.codexNativeSubagentsAllowed).toBe(false);
  });

  it("uses cheaper large-context role workers for context scout", () => {
    const selection = selectCodexParityRoleModel("context_scout", {
      availableModelRefs: ["moonshotai/kimi-k2.6"],
    });

    expect(selection.modelRef).toBe("moonshotai/kimi-k2.6");
    expect(selection.providerPath).toBe("openrouter");
    expect(selection.missingConfigBlocker).toBeNull();
  });

  it("allows Codex-native subagents only inside complex implementation adapter", () => {
    const policy = buildCodexParityRoleModelPolicy({
      availableModelRefs: ["openai-codex/gpt-5.5", "moonshotai/kimi-k2.6"],
    });

    expect(
      policy.filter((selection) => selection.codexNativeSubagentsAllowed).map((s) => s.roleId),
    ).toEqual(["implementation_complex"]);
    expect(
      policy.find((selection) => selection.roleId === "implementation_complex")?.modelRef,
    ).toBe("openai-codex/gpt-5.5");
    expect(policy.every((selection) => selection.openClawRoleEvidenceRequired)).toBe(true);
    expect(policy.every((selection) => !selection.rawProviderLogStored)).toBe(true);
  });

  it("records explicit legacy Codex 5.3 selection instead of silently defaulting to it", () => {
    const selection = selectCodexParityRoleModel("implementation_complex", {
      codexCodingModelRef: "openai-codex/gpt-5.3-codex",
    });

    expect(selection.modelRef).toBe("openai-codex/gpt-5.3-codex");
    expect(selection.reasonCodes).toContain("explicit_legacy_codex_5_3_selection_recorded");
  });

  it("records exact blockers instead of silently falling back", () => {
    const selection = selectCodexParityRoleModel("orchestrator", {});

    expect(selection.missingConfigBlocker).toBe("codex_gpt_5_5_orchestrator_not_configured");
    expect(selection.reasonCodes).toContain("orchestrator_gpt_5_5_missing");
  });
});
