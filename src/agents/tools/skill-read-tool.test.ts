import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Skill } from "../../skills/loading/skill-contract.js";
import { createSyntheticSourceInfo } from "../../skills/loading/skill-contract.js";
import type { SkillSnapshot } from "../../skills/types.js";
import { createSkillReadTool } from "./skill-read-tool.js";

const tempDirs: string[] = [];

function makeSkill(root: string, name: string, body: string): Skill {
  const skillDir = path.join(root, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, "SKILL.md");
  fs.writeFileSync(filePath, body);
  return {
    name,
    description: `${name} description`,
    filePath,
    baseDir: skillDir,
    promptVersion: "sha256:test",
    source: "test",
    disableModelInvocation: false,
    sourceInfo: createSyntheticSourceInfo(filePath, {
      source: "test",
      baseDir: skillDir,
      scope: "temporary",
    }),
  };
}

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-skill-read-"));
  tempDirs.push(dir);
  return dir;
}

describe("skill_read tool", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads only skills present in the active resolved snapshot", async () => {
    const root = tempRoot();
    const allowed = makeSkill(root, "comprehensive-plan-record", "# Comprehensive Plan\n");
    makeSkill(root, "other-skill", "# Other\n");
    const snapshot: SkillSnapshot = {
      prompt: "",
      skills: [{ name: allowed.name }],
      resolvedSkills: [allowed],
    };

    const result = await createSkillReadTool({ skillsSnapshot: snapshot }).execute("call", {
      name: "comprehensive-plan-record",
    });

    expect(result.details).toMatchObject({
      name: "comprehensive-plan-record",
      content: "# Comprehensive Plan\n",
      truncated: false,
    });
    await expect(
      createSkillReadTool({ skillsSnapshot: snapshot }).execute("call", { name: "other-skill" }),
    ).rejects.toThrow(/not available/);
  });

  it("returns explicit truncation metadata when requested", async () => {
    const root = tempRoot();
    const skill = makeSkill(root, "long-skill", "abcdef");
    const result = await createSkillReadTool({
      skillsSnapshot: { prompt: "", skills: [{ name: skill.name }], resolvedSkills: [skill] },
    }).execute("call", {
      name: "long-skill",
      maxChars: 3,
    });

    expect(result.details).toMatchObject({
      name: "long-skill",
      content: "abc",
      chars: 6,
      truncated: true,
    });
  });
});
