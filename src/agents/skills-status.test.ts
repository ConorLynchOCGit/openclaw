import { describe, expect, it } from "vitest";
import { buildWorkspaceSkillStatus } from "./skills-status.js";
import { createCanonicalFixtureSkill } from "./skills.test-helpers.js";
import type { SkillEntry } from "./skills/types.js";

describe("buildWorkspaceSkillStatus", () => {
  it("reports loaded skills from a persisted session snapshot", () => {
    const report = buildWorkspaceSkillStatus("/tmp/ws", {
      entries: [],
      loadedSession: {
        sessionKey: "agent:main:main",
        sessionId: "session-001",
        updatedAt: 1_000,
        currentSnapshotVersion: 7,
        skillsSnapshot: {
          prompt: "skills prompt",
          skills: [{ name: "writer" }],
          resolvedSkills: [
            createFixtureSkill({
              name: "researcher",
              description: "test",
              filePath: "/tmp/researcher/SKILL.md",
              baseDir: "/tmp/researcher",
              source: "test",
            }),
          ],
          version: 7,
        },
      },
    });

    expect(report.loadedState).toBe("available");
    expect(report.hotReloadState).toBe("current");
    expect(report.loadedSkillNames).toEqual(["researcher", "writer"]);
    expect(report.loadedSessionKey).toBe("agent:main:main");
    expect(report.loadedSnapshotVersion).toBe(7);
    expect(report.currentSnapshotVersion).toBe(7);
  });

  it("classifies stale persisted session skill snapshots", () => {
    const report = buildWorkspaceSkillStatus("/tmp/ws", {
      entries: [],
      loadedSession: {
        sessionKey: "agent:writer:main",
        currentSnapshotVersion: 10,
        skillsSnapshot: {
          prompt: "skills prompt",
          skills: [{ name: "writer" }],
          version: 3,
        },
      },
    });

    expect(report.loadedState).toBe("available");
    expect(report.hotReloadState).toBe("stale");
    expect(report.loadedStateReason).toContain("stale");
  });

  it("explains when warm-session loaded state is unavailable", () => {
    const report = buildWorkspaceSkillStatus("/tmp/ws", {
      entries: [],
      loadedSession: {
        sessionKey: "agent:main:main",
        currentSnapshotVersion: 1,
        unavailableReason: "no persisted main-session entry was found for this agent",
      },
    });

    expect(report.loadedState).toBe("not_available");
    expect(report.hotReloadState).toBe("not_available");
    expect(report.loadedSkillNames).toBeNull();
    expect(report.loadedStateReason).toContain("no persisted main-session entry");
  });

  it("does not surface install options for OS-scoped skills on unsupported platforms", () => {
    if (process.platform === "win32") {
      // Keep this simple; win32 platform naming is already explicitly handled elsewhere.
      return;
    }

    const mismatchedOs = process.platform === "darwin" ? "linux" : "darwin";

    const entry: SkillEntry = {
      skill: createFixtureSkill({
        name: "os-scoped",
        description: "test",
        filePath: "/tmp/os-scoped",
        baseDir: "/tmp",
        source: "test",
      }),
      frontmatter: {},
      metadata: {
        os: [mismatchedOs],
        requires: { bins: ["fakebin"] },
        install: [
          {
            id: "brew",
            kind: "brew",
            formula: "fake",
            bins: ["fakebin"],
            label: "Install fake (brew)",
          },
        ],
      },
    };

    const report = buildWorkspaceSkillStatus("/tmp/ws", { entries: [entry] });
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]?.install).toEqual([]);
  });

  it("does not expose raw config values in config checks", () => {
    const secret = "discord-token-secret-abc"; // pragma: allowlist secret
    const entry: SkillEntry = {
      skill: createFixtureSkill({
        name: "discord",
        description: "test",
        filePath: "/tmp/discord/SKILL.md",
        baseDir: "/tmp/discord",
        source: "test",
      }),
      frontmatter: {},
      metadata: {
        requires: { config: ["channels.discord.token"] },
      },
    };

    const report = buildWorkspaceSkillStatus("/tmp/ws", {
      entries: [entry],
      config: {
        channels: {
          discord: {
            token: secret,
          },
        },
      },
    });

    expect(JSON.stringify(report)).not.toContain(secret);
    const discord = report.skills.find((skill) => skill.name === "discord");
    const check = discord?.configChecks.find((entry) => entry.path === "channels.discord.token");
    expect(check).toEqual({ path: "channels.discord.token", satisfied: true });
    expect(check && "value" in check).toBe(false);
  });
});

function createFixtureSkill(params: {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
}): SkillEntry["skill"] {
  return createCanonicalFixtureSkill(params);
}
