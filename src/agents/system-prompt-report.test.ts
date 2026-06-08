import { describe, expect, it } from "vitest";
import {
  buildSystemPromptReport,
  evaluateRequiredProviderContextAdmission,
} from "./system-prompt-report.js";
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

  it("parses active required skill blocks as admitted skill context", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [{ path: "/tmp/workspace/policies/AGENTS.md", content: "trimmed" }],
      skillsPrompt: [
        "<active_skills>",
        '<active_skill name="execution-node-workflow" location="/tmp/workspace/skills/execution-node-workflow/SKILL.md" source_ref="openclaw-skill-file://proof" source_hash="hash-1">',
        "Follow the active workflow.",
        "</active_skill>",
        "</active_skills>",
      ].join("\n"),
      tools: [],
    });

    expect(report.skills.entries).toEqual([
      {
        name: "execution-node-workflow",
        blockChars: expect.any(Number),
        location: "/tmp/workspace/skills/execution-node-workflow/SKILL.md",
        sourceRef: "openclaw-skill-file://proof",
        sourceHash: "hash-1",
      },
    ]);
    expect(report.skills.entries[0]?.blockChars).toBeGreaterThan(0);
  });

  it("reports zero in-band tool list chars when tool info stays structured", () => {
    const file = makeBootstrapFile({ path: "/tmp/workspace/policies/AGENTS.md" });
    const report = makeReport({
      file,
      injectedPath: "AGENTS.md",
      injectedContent: "trimmed",
    });

    expect(report.tools.listChars).toBe(0);
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

  it("does not mark MEMORY.md truncated when only generated bootstrap blocks were stripped", () => {
    const curatedContent = ["# MEMORY.md", "", "## Long-Term Context", "- durable note"].join("\n");
    const file = makeBootstrapFile({
      name: "MEMORY.md",
      path: "/tmp/workspace/MEMORY.md",
      content: [
        "<!-- BEGIN GENERATED: openclaw-canonical -->",
        "## Workspace Recall Index",
        "- generated",
        "<!-- END GENERATED: openclaw-canonical -->",
        "",
        curatedContent,
      ].join("\n"),
    });
    const report = makeReport({
      file,
      injectedPath: "/tmp/workspace/MEMORY.md",
      injectedContent: curatedContent,
    });

    expect(report.injectedWorkspaceFiles[0]?.rawChars).toBe(curatedContent.length);
    expect(report.injectedWorkspaceFiles[0]?.injectedChars).toBe(curatedContent.length);
    expect(report.injectedWorkspaceFiles[0]?.truncated).toBe(false);
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

  it("admits required provider context when required files and active skills are present", () => {
    const file = makeBootstrapFile({
      name: "IDENTITY.md",
      path: "/tmp/workspace/agent/IDENTITY.md",
      content: "identity",
    });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [{ path: "/tmp/workspace/agent/IDENTITY.md", content: "identity" }],
      skillsPrompt: [
        "<active_skills>",
        '<active_skill name="execution-node-workflow">',
        "Follow the active workflow.",
        "</active_skill>",
        "</active_skills>",
      ].join("\n"),
      tools: [],
    });

    const admission = evaluateRequiredProviderContextAdmission({
      report,
      required: {
        workspaceFileNames: ["/tmp/workspace/agent/IDENTITY.md"],
        skillNames: ["execution-node-workflow"],
      },
    });

    expect(admission).toMatchObject({
      admitted: true,
      missingWorkspaceFileNames: [],
      missingSkillNames: [],
      truncatedWorkspaceFileNames: [],
      reasonCodes: ["provider_context_required_admission_accepted"],
      message: null,
    });
  });

  it("requires exact active skill source when source-backed skill admission is specified", () => {
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [],
      injectedFiles: [],
      skillsPrompt: [
        "<active_skills>",
        '<active_skill name="execution-node-workflow" location="/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md" source_ref="openclaw-skill-file%3A%2F%2Fruntime" source_hash="runtime-hash">',
        "Follow the active workflow.",
        "</active_skill>",
        "</active_skills>",
      ].join("\n"),
      tools: [],
    });

    const admission = evaluateRequiredProviderContextAdmission({
      report,
      required: {
        skillSources: [
          {
            name: "execution-node-workflow",
            path: "/root/services/openclaw-roles/live/skills/execution-node-workflow/SKILL.md",
            sourceRef: "openclaw-skill-file%3A%2F%2Frepo",
            sourceHash: "repo-hash",
          },
        ],
      },
    });

    expect(admission.admitted).toBe(false);
    expect(admission.missingSkillNames).toEqual(["execution-node-workflow"]);
    expect(admission.reasonCodes).toEqual(
      expect.arrayContaining([
        "provider_context_required_admission_blocked",
        "provider_context_required_skill_sources_mismatched",
        "provider_context_required_skills_missing",
      ]),
    );
    expect(admission.message).toContain("Missing or mismatched skills");
  });

  it("does not satisfy a path-specific required file with the same basename from another location", () => {
    const file = makeBootstrapFile({
      name: "AGENTS.md",
      path: "/tmp/workspace/repo/AGENTS.md",
      content: "repo instructions",
    });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [{ path: "/tmp/workspace/repo/AGENTS.md", content: "repo instructions" }],
      skillsPrompt: "",
      tools: [],
    });

    const admission = evaluateRequiredProviderContextAdmission({
      report,
      required: {
        workspaceFileNames: ["/tmp/workspace/agents/execution-coding/agent/AGENTS.md"],
      },
    });

    expect(admission.admitted).toBe(false);
    expect(admission.missingWorkspaceFileNames).toEqual([
      "/tmp/workspace/agents/execution-coding/agent/AGENTS.md",
    ]);
  });

  it("blocks required provider context when required files are truncated or skills are missing", () => {
    const file = makeBootstrapFile({
      name: "BOOTSTRAP.md",
      path: "/tmp/workspace/agent/BOOTSTRAP.md",
      content: "abcdefghijklmnopqrstuvwxyz",
    });
    const report = buildSystemPromptReport({
      source: "run",
      generatedAt: 0,
      bootstrapMaxChars: 20_000,
      systemPrompt: "system",
      bootstrapFiles: [file],
      injectedFiles: [{ path: "/tmp/workspace/agent/BOOTSTRAP.md", content: "short" }],
      skillsPrompt: "",
      tools: [],
    });

    const admission = evaluateRequiredProviderContextAdmission({
      report,
      required: {
        workspaceFileNames: ["BOOTSTRAP.md", "TOOLS.md"],
        skillNames: ["execution-node-workflow"],
      },
    });

    expect(admission.admitted).toBe(false);
    expect(admission.missingWorkspaceFileNames).toEqual(["TOOLS.md"]);
    expect(admission.truncatedWorkspaceFileNames).toEqual(["BOOTSTRAP.md"]);
    expect(admission.missingSkillNames).toEqual(["execution-node-workflow"]);
    expect(admission.reasonCodes).toEqual(
      expect.arrayContaining([
        "provider_context_required_admission_blocked",
        "provider_context_required_workspace_files_missing",
        "provider_context_required_workspace_files_truncated",
        "provider_context_required_skills_missing",
      ]),
    );
    expect(admission.message).toContain(
      "Provider context admission failed before model invocation",
    );
  });
});
