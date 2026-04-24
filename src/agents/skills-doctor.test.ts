import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSkillsDoctorReport } from "./skills-doctor.js";
import { resolveBundledSkillsContext } from "./skills/bundled-context.js";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-doctor-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSkill(rootDir: string, name: string, description = "Test skill") {
  const skillDir = path.join(rootDir, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("buildSkillsDoctorReport", () => {
  it("reports collisions with precedence winner", async () => {
    const workspaceDir = await createWorkspace();
    await writeSkill(
      path.join(workspaceDir, ".agents", "skills"),
      "calendar",
      "Project agent skill",
    );
    await writeSkill(path.join(workspaceDir, "skills"), "calendar", "Workspace skill");

    const report = await buildSkillsDoctorReport({
      workspaceDir,
      config: {},
      managedSkillsDir: path.join(workspaceDir, ".managed"),
      loadedSession: {
        currentSnapshotVersion: 1,
        unavailableReason: "test fixture",
      },
    });

    expect(report.collisions).toEqual([
      {
        skillName: "calendar",
        winner: expect.objectContaining({ kind: "workspace" }),
        shadowed: [expect.objectContaining({ kind: "workspace_agents" })],
      },
    ]);
    expect(report.writableSurfaces.some((entry) => entry.kind === "workspace")).toBe(true);
    expect(report.restartRequired).toBeNull();
    expect(report.restartRequiredReason).toContain("warm-session snapshot");
  });

  it("detects tracked ClawHub fingerprint drift", async () => {
    const workspaceDir = await createWorkspace();
    const skillDir = path.join(workspaceDir, "skills", "agentreceipt");
    await writeSkill(path.join(workspaceDir, "skills"), "agentreceipt", "Tracked skill");
    await fs.mkdir(path.join(workspaceDir, ".clawhub"), { recursive: true });
    await fs.mkdir(path.join(skillDir, ".clawhub"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, ".clawhub", "lock.json"),
      `${JSON.stringify(
        {
          version: 1,
          skills: {
            agentreceipt: {
              version: "1.0.0",
              installedAt: 123,
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(skillDir, ".clawhub", "origin.json"),
      `${JSON.stringify(
        {
          version: 2,
          source: "clawhub",
          registry: "https://clawhub.ai",
          catalogId: "clawhub:agentreceipt",
          slug: "agentreceipt",
          installedSkillKey: "agentreceipt",
          installedVersion: "1.0.0",
          installedAt: 123,
          fingerprint: "deadbeef",
          review: {
            gate: "install_scan",
            reviewedAt: 123,
            reviewedVersion: "1.0.0",
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const report = await buildSkillsDoctorReport({
      workspaceDir,
      config: {},
      managedSkillsDir: path.join(workspaceDir, ".managed"),
      loadedSession: {
        currentSnapshotVersion: 1,
        unavailableReason: "test fixture",
      },
    });

    expect(report.trackedClawHubInstalls).toHaveLength(1);
    expect(report.conformanceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "tracked_origin_integrity_missing",
          skillName: "agentreceipt",
        }),
        expect.objectContaining({
          code: "tracked_origin_fingerprint_drift",
          skillName: "agentreceipt",
        }),
      ]),
    );
  });

  it("marks restart as not required when the warm-session snapshot is current", async () => {
    const workspaceDir = await createWorkspace();
    await writeSkill(path.join(workspaceDir, "skills"), "calendar", "Workspace skill");
    const loadedSkillNames = ["calendar", ...resolveBundledSkillsContext().names].toSorted();

    const report = await buildSkillsDoctorReport({
      workspaceDir,
      config: {},
      managedSkillsDir: path.join(workspaceDir, ".managed"),
      loadedSession: {
        currentSnapshotVersion: 1,
        updatedAt: 123,
        skillsSnapshot: {
          prompt: "",
          version: 1,
          skills: loadedSkillNames.map((name) => ({ name })),
        },
      },
    });

    expect(report.loadedState).toBe("available");
    expect(report.hotReloadState).toBe("current");
    expect(report.restartRequired).toBe(false);
    expect(report.restartRequiredReason).toContain("matches the current discovered skill set");
  });
});
