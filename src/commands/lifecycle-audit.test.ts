import { describe, expect, it } from "vitest";
import { createEmptyInstallChecks } from "../cli/requirements-test-fixtures.js";
import type { SkillStatusEntry, SkillStatusReport } from "../skills/discovery/status.js";
import { buildLifecycleAuditReport } from "./lifecycle-audit.js";

function skill(overrides: Partial<SkillStatusEntry> = {}): SkillStatusEntry {
  return {
    name: "calendar",
    description: "Calendar helpers",
    source: "workspace",
    bundled: false,
    filePath: "/tmp/workspace/skills/calendar/SKILL.md",
    baseDir: "/tmp/workspace/skills/calendar",
    skillKey: "calendar",
    always: false,
    disabled: false,
    blockedByAllowlist: false,
    blockedByAgentFilter: false,
    eligible: true,
    modelVisible: true,
    userInvocable: true,
    commandVisible: true,
    ...createEmptyInstallChecks(),
    ...overrides,
  };
}

function report(skills: SkillStatusEntry[]): SkillStatusReport {
  return {
    workspaceDir: "/tmp/workspace",
    managedSkillsDir: "/tmp/workspace/skills",
    agentId: "coding",
    agentSkillFilter: ["calendar", "missing-skill"],
    skills,
  };
}

describe("buildLifecycleAuditReport", () => {
  it("builds advisory-only lifecycle evidence with unknowns instead of inferred state", () => {
    const payload = buildLifecycleAuditReport({
      now: Date.UTC(2026, 6, 1, 5, 30, 0),
      config: {
        agents: {
          defaults: {
            workspace: "/tmp/workspace",
            skills: ["calendar", "missing-skill"],
          },
          list: [
            {
              id: "coding",
              workspace: "/tmp/workspace",
              contractPack: "docs/agents/coding",
              runtimePromptFiles: ["AGENTS.md", "TOOLS.md", "SOUL.md", "USER.md", "MEMORY.md"],
              bootstrapTotalMaxChars: 100_000,
            },
          ],
        },
        plugins: {
          allow: ["missing-plugin"],
        },
      },
      skillReport: report([
        skill(),
        skill({
          name: "Calendar",
          skillKey: "calendar-copy",
          filePath: "/tmp/workspace/skills/calendar-copy/SKILL.md",
        }),
      ]),
      pluginReport: null,
      agent: "coding",
    });

    expect(payload.schema).toBe("openclaw.lifecycle_audit.v1");
    expect(payload.generatedAt).toBe("2026-07-01T05:30:00.000Z");
    expect(payload.advisory.semantics).toContain("not lifecycle truth");
    expect(payload.advisory.missingEvidenceLanguage).toContain("unknown");
    expect(payload.advisory.caveats).toContain(
      "Findings are advisory evidence only and must not decide agent routing, skill activation, proof pass/fail, or release eligibility.",
    );
    expect(payload.advisory.caveats).toContain(
      "This command does not judge skill or canonical-doc content quality; use model-reviewed GBrain/Reviewer/Skill Workshop flows for semantic review or mutation.",
    );
    expect(payload.summary).toMatchObject({
      agents: 1,
      skills: 2,
      modelVisibleSkills: 2,
      plugins: null,
    });
    expect(payload.unknowns.map((unknown) => unknown.surface)).toContain("plugins");
    expect(payload.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "missing_runtime_prompt_file",
        "skill_agent_filter_missing",
        "duplicate_skill_name",
        "configured_plugin_unknown",
        "duplicate_canonical_surface",
      ]),
    );
    expect(payload.alignment).toMatchObject({
      defaultWorkspace: "/tmp/workspace",
      selectedAgentWorkspace: "/tmp/workspace",
      selectedAgentConfigured: true,
    });
    expect(payload.alignment.duplicateCanonicalSurfaces.map((surface) => surface.surface)).toEqual(
      expect.arrayContaining(["agents.md", "tools.md", "soul.md", "user.md", "memory.md"]),
    );
    expect(payload.cleanupSuggestions.map((suggestion) => suggestion.code)).toEqual(
      expect.arrayContaining(["missing_runtime_prompt_file", "duplicate_skill_name"]),
    );
    expect(payload.promptBootstrapFootprint).toMatchObject({
      runtimePromptFileCount: 5,
      totalBootstrapMaxChars: 100_000,
    });
    expect(payload.evidencePointers).toEqual(
      expect.arrayContaining([
        "openclaw skills check --json",
        "openclaw skills audit-lifecycle --json",
        "/tmp/workspace/docs/agents/coding/AGENTS.md",
      ]),
    );
  });
});
