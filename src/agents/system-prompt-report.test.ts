import { describe, expect, it } from "vitest";
import { buildSystemPromptReport } from "./system-prompt-report.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

function makeBootstrapFile(overrides: Partial<WorkspaceBootstrapFile>): WorkspaceBootstrapFile {
  return {
    name: "AGENTS.md",
    path: "/tmp/workspace/AGENTS.md",
    content: "alpha",
    missing: false,
    ...overrides,
  };
}

describe("buildSystemPromptReport", () => {
  const makeReport = (params: {
    file: WorkspaceBootstrapFile;
    injectedPath: string;
    injectedContent: string;
    bootstrapMaxChars?: number;
    bootstrapTotalMaxChars?: number;
  }) =>
    buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: params.bootstrapMaxChars ?? 20_000,
      bootstrapTotalMaxChars: params.bootstrapTotalMaxChars,
      systemPrompt: "system",
      bootstrapFiles: [params.file],
      injectedFiles: [{ path: params.injectedPath, content: params.injectedContent }],
      skillsPrompt: "",
      tools: [],
    });

  it("counts injected chars when injected file paths are absolute", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });

  it("keeps legacy basename matching for injected files", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });

  it("marks workspace files truncated when injected chars are smaller than raw chars", () => {
    const file = makeBootstrapFile({
      path: "/tmp/workspace/policies/AGENTS.md",
      content: "abcdefghijklmnopqrstuvwxyz",
    });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.truncated).toBe(true);
  });

  it("includes both bootstrap caps in the report payload", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "AGENTS.md",
      injectedContent: "trimmed",
      bootstrapMaxChars: 11_111,
      bootstrapTotalMaxChars: 22_222,
    });

    expect(report.bootstrapMaxChars).toBe(11_111);
    expect(report.bootstrapTotalMaxChars).toBe(22_222);
  });

  it("reports injectedChars=0 when injected file does not match by path or basename", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/policies/OTHER.md",
      injectedContent: "trimmed",
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe(0);
    expect(report.injectedWorkspaceFiles[0]?.truncated).toBe(true);
  });

  it("ignores malformed injected file paths and still matches valid entries", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [
        { path: 123 as unknown as string, content: "bad" },
        { path: "/tmp/workspace/policies/AGENTS.md", content: "trimmed" },
      ],
      skillsPrompt: "",
      tools: [],
    });

    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe("trimmed".length);
  });

  it("includes runtime build and main memory routing diagnostics when provided", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [{ path: "/tmp/workspace/policies/AGENTS.md", content: "trimmed" }],
      skillsPrompt: "",
      tools: [],
      runtimeBuild: {
        version: "2026.4.8-test",
        commit: "abc1234",
      },
      mainMemoryRouting: {
        version: "2026.4.8-test",
        commit: "abc1234",
        provider: "openai-codex",
        api: "openai-codex-responses",
        agentId: "main",
        availableTools: {
          memoryLearnedGuidancePlan: false,
          memoryObjectSearchHybrid: true,
          memorySearch: true,
        },
        promptClass: "workflow_preflight",
        canonicalPlan: {
          requestedKinds: ["feedback", "project"],
          derivedViews: ["workflow_guidance", "project_rule"],
          facetFilters: [{ key: "workflow_guidance", value: true }],
          matchedSignals: ["preflight_check"],
        },
        selectedTarget: "memory_object_search_hybrid",
        reasonCode: "learned_guidance_unavailable",
        skillSuppressionRequested: true,
        applicationReasonCode: "pinned_selected_target",
        toolChoiceBeforePatch: "auto",
        toolChoiceAfterPatch: {
          type: "function",
          name: "memory_object_search_hybrid",
        },
        finalToolChoice: {
          type: "function",
          name: "memory_object_search_hybrid",
        },
        finalToolChoiceChanged: false,
      },
    });

    expect(report.runtimeBuild).toEqual({
      version: "2026.4.8-test",
      commit: "abc1234",
    });
    expect(report.mainMemoryRouting?.selectedTarget).toBe("memory_object_search_hybrid");
    expect(report.mainMemoryRouting?.reasonCode).toBe("learned_guidance_unavailable");
    expect(report.mainMemoryRouting?.canonicalPlan.requestedKinds).toEqual(["feedback", "project"]);
    expect(report.mainMemoryRouting?.finalToolChoice).toEqual({
      type: "function",
      name: "memory_object_search_hybrid",
    });
  });
});
