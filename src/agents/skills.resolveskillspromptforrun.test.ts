import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRequiredActiveSkillSnapshot, resolveSkillsPromptForRun } from "./skills.js";
import { createCanonicalFixtureSkill, writeSkill } from "./skills.test-helpers.js";
import type { SkillEntry } from "./skills/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveSkillsPromptForRun", () => {
  it("prefers snapshot prompt when available", () => {
    const prompt = resolveSkillsPromptForRun({
      skillsSnapshot: { prompt: "SNAPSHOT", skills: [] },
      workspaceDir: "/tmp/openclaw",
    });
    expect(prompt).toBe("SNAPSHOT");
  });
  it("builds prompt from entries when snapshot is missing", () => {
    const entry: SkillEntry = {
      skill: createFixtureSkill({
        name: "demo-skill",
        description: "Demo",
        filePath: "/app/skills/demo-skill/SKILL.md",
        baseDir: "/app/skills/demo-skill",
        source: "openclaw-bundled",
      }),
      frontmatter: {},
    };
    const prompt = resolveSkillsPromptForRun({
      entries: [entry],
      workspaceDir: "/tmp/openclaw",
    });
    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("skills/demo-skill/SKILL.md");
  });

  it("keeps legacy entries with disableModelInvocation hidden when exposure metadata is absent", () => {
    const hidden: SkillEntry = {
      skill: createFixtureSkill({
        name: "hidden-skill",
        description: "Hidden",
        filePath: "/app/skills/hidden-skill/SKILL.md",
        baseDir: "/app/skills/hidden-skill",
        source: "openclaw-workspace",
        disableModelInvocation: true,
      }),
      frontmatter: {},
    };

    const prompt = resolveSkillsPromptForRun({
      entries: [hidden],
      workspaceDir: "/tmp/openclaw",
    });

    expect(prompt).not.toContain("/app/skills/hidden-skill/SKILL.md");
  });

  it("inherits agents.defaults.skills when rebuilding prompt for an agent", () => {
    const visible: SkillEntry = {
      skill: createFixtureSkill({
        name: "github",
        description: "GitHub",
        filePath: "/app/skills/github/SKILL.md",
        baseDir: "/app/skills/github",
        source: "openclaw-workspace",
      }),
      frontmatter: {},
    };
    const hidden: SkillEntry = {
      skill: createFixtureSkill({
        name: "hidden-skill",
        description: "Hidden",
        filePath: "/app/skills/hidden-skill/SKILL.md",
        baseDir: "/app/skills/hidden-skill",
        source: "openclaw-workspace",
      }),
      frontmatter: {},
    };

    const prompt = resolveSkillsPromptForRun({
      entries: [visible, hidden],
      config: {
        agents: {
          defaults: {
            skills: ["github"],
          },
          list: [{ id: "writer" }],
        },
      },
      workspaceDir: "/tmp/openclaw",
      agentId: "writer",
    });

    expect(prompt).toContain("/app/skills/github/SKILL.md");
    expect(prompt).not.toContain("/app/skills/hidden-skill/SKILL.md");
  });

  it("uses agents.list[].skills as a full replacement for defaults", () => {
    const inheritedEntry: SkillEntry = {
      skill: createFixtureSkill({
        name: "weather",
        description: "Weather",
        filePath: "/app/skills/weather/SKILL.md",
        baseDir: "/app/skills/weather",
        source: "openclaw-workspace",
      }),
      frontmatter: {},
    };
    const explicitEntry: SkillEntry = {
      skill: createFixtureSkill({
        name: "docs-search",
        description: "Docs",
        filePath: "/app/skills/docs-search/SKILL.md",
        baseDir: "/app/skills/docs-search",
        source: "openclaw-workspace",
      }),
      frontmatter: {},
    };

    const prompt = resolveSkillsPromptForRun({
      entries: [inheritedEntry, explicitEntry],
      config: {
        agents: {
          defaults: {
            skills: ["weather"],
          },
          list: [{ id: "writer", skills: ["docs-search"] }],
        },
      },
      workspaceDir: "/tmp/openclaw",
      agentId: "writer",
    });

    expect(prompt).not.toContain("/app/skills/weather/SKILL.md");
    expect(prompt).toContain("/app/skills/docs-search/SKILL.md");
  });

  it("hides trust-blocked third-party skills from the model-facing catalog", async () => {
    const skillDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-prompt-trust-"));
    tempDirs.push(skillDir);
    await fs.mkdir(path.join(skillDir, ".clawhub"), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, ".clawhub", "origin.json"),
      `${JSON.stringify({ version: 2, source: "clawhub" }, null, 2)}\n`,
      "utf8",
    );

    const blocked: SkillEntry = {
      skill: createFixtureSkill({
        name: "third-party",
        description: "Third-party",
        filePath: path.join(skillDir, "SKILL.md"),
        baseDir: skillDir,
        source: "openclaw-workspace",
      }),
      frontmatter: {},
    };

    const prompt = resolveSkillsPromptForRun({
      entries: [blocked],
      workspaceDir: "/tmp/openclaw",
    });

    expect(prompt).toBe("");
  });

  it("builds required active skill context with source refs through the native snapshot surface", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-active-skill-"));
    tempDirs.push(workspace);
    await writeSkill({
      dir: path.join(workspace, "skills", "execution-node-workflow"),
      name: "execution-node-workflow",
      description: "Execution node workflow",
      body: "Follow the execution-node-workflow workflow.",
    });

    const snapshot = buildRequiredActiveSkillSnapshot(workspace, {
      requiredSkillNames: ["execution-node-workflow"],
      skillFilter: ["ignored-by-required-builder"],
    });

    expect(snapshot.skillFilter).toEqual(["execution-node-workflow"]);
    expect(snapshot.prompt).toContain("<active_skills>");
    expect(snapshot.prompt).toContain('<active_skill name="execution-node-workflow"');
    expect(snapshot.prompt).toContain('source_ref="openclaw-skill-file://');
    expect(snapshot.prompt).toContain("Follow the execution-node-workflow workflow.");
    expect(snapshot.prompt).not.toContain("<available_skills>");
    expect(snapshot.activeContextSources).toEqual([
      expect.objectContaining({
        kind: "required_skill",
        name: "execution-node-workflow",
        missing: false,
        truncated: false,
        sourceHash: expect.any(String),
      }),
    ]);
  });
});

function createFixtureSkill(params: {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  disableModelInvocation?: boolean;
}): SkillEntry["skill"] {
  return createCanonicalFixtureSkill(params);
}
