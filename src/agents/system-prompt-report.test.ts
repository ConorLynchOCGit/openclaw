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
        sourceResolution: {
          questionKind: "continuity",
          domain: "none",
          candidates: ["workspace_continuity", "workspace_project"],
          authoritativeSource: "workspace_continuity",
          supportingSources: ["workspace_project"],
          workspaceEntrypoints: ["MEMORY.md"],
          canonicalEntrypoints: [],
          coverageRequirement: "not_required",
          coverageState: "not_required",
          escalationReasons: [],
        },
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
    expect(report.mainMemoryRouting?.sourceResolution.questionKind).toBe("continuity");
    expect(report.mainMemoryRouting?.canonicalPlan.requestedKinds).toEqual(["feedback", "project"]);
    expect(report.mainMemoryRouting?.finalToolChoice).toEqual({
      type: "function",
      name: "memory_object_search_hybrid",
    });
    expect(report.injectedWorkspaceFiles[0]?.priorityTier).toBe("must_survive");
  });

  it("extracts compiled memory pack diagnostics from the final system prompt", () => {
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
      segmentPlanInput: {
        promptPrependContext: [
          "## Approved Durable Memory Context",
          "",
          "## User Memory Pack",
          "",
          "- Prefer concise answers.",
          "- Prefer plain English.",
          "",
          "## Project Memory Pack",
          "",
          "- default branch: main",
        ].join("\n"),
      },
    });

    expect(report.memoryPacks?.entries.map((entry) => entry.kind)).toEqual(["user", "project"]);
    expect(report.memoryPacks?.entries[0]).toMatchObject({
      title: "User Memory Pack",
      itemCount: 2,
      omittedItemCount: 0,
    });
    expect(report.memoryPacks?.entries[0]?.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(report.memoryPacks?.entries[0]?.approxTokens).toBeGreaterThan(0);
    expect(report.memoryPacks?.promptChars).toBeGreaterThan(0);
    expect(report.promptArtifacts).toMatchObject({
      fullSystemPromptChars: expect.any(Number),
      baseSystemPromptChars: expect.any(Number),
      memoryPackPromptChars: expect.any(Number),
      injectedFilesChars: "trimmed".length,
      skillsChars: 0,
      toolsListChars: 0,
      toolsSchemaChars: 0,
    });
    expect(report.promptArtifacts?.fullSystemPromptHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(report.promptArtifacts?.baseSystemPromptHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(report.promptArtifacts?.memoryPackPromptHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(report.promptArtifacts?.fullSystemPromptHash).not.toBe(
      report.promptArtifacts?.memoryPackPromptHash,
    );
    expect(report.promptArtifacts?.baseSystemPromptChars).toBe(
      report.promptArtifacts?.fullSystemPromptChars,
    );
    expect(report.contextSegments?.segments.map((segment) => segment.id)).toEqual([
      "base_system_prompt",
      "approved_memory_context_prompt",
    ]);
    expect(report.contextSegments?.totals.stableTokens).toBeGreaterThan(0);
    expect(report.contextSegments?.totals.semiStableTokens).toBeGreaterThan(0);
    expect(report.contextSegments?.totals.volatileTokens).toBe(0);
  });
});
