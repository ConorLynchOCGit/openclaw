import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchClawHubSkillDetailMock = vi.fn();
const downloadClawHubSkillArchiveMock = vi.fn();
const listClawHubSkillsMock = vi.fn();
const resolveClawHubBaseUrlMock = vi.fn(() => "https://clawhub.ai");
const searchClawHubSkillsMock = vi.fn();
const archiveCleanupMock = vi.fn();
const withExtractedArchiveRootMock = vi.fn();
const installPackageDirMock = vi.fn();
const fileExistsMock = vi.fn();
const scanSkillInstallSourceMock = vi.fn();

vi.mock("../infra/clawhub.js", () => ({
  fetchClawHubSkillDetail: fetchClawHubSkillDetailMock,
  downloadClawHubSkillArchive: downloadClawHubSkillArchiveMock,
  listClawHubSkills: listClawHubSkillsMock,
  resolveClawHubBaseUrl: resolveClawHubBaseUrlMock,
  searchClawHubSkills: searchClawHubSkillsMock,
}));

vi.mock("../infra/install-flow.js", () => ({
  withExtractedArchiveRoot: withExtractedArchiveRootMock,
}));

vi.mock("../infra/install-package-dir.js", () => ({
  installPackageDir: installPackageDirMock,
}));

vi.mock("../infra/archive.js", () => ({
  fileExists: fileExistsMock,
}));

vi.mock("../plugins/install-security-scan.js", () => ({
  scanSkillInstallSource: (...args: unknown[]) => scanSkillInstallSourceMock(...args),
}));

const { installSkillFromClawHub, searchSkillsFromClawHub, updateSkillsFromClawHub } =
  await import("./skills-clawhub.js");
const { vetClawHubSkill } = await import("./skills-vetting.js");

describe("skills-clawhub", () => {
  beforeEach(() => {
    fetchClawHubSkillDetailMock.mockReset();
    downloadClawHubSkillArchiveMock.mockReset();
    listClawHubSkillsMock.mockReset();
    resolveClawHubBaseUrlMock.mockReset();
    searchClawHubSkillsMock.mockReset();
    archiveCleanupMock.mockReset();
    withExtractedArchiveRootMock.mockReset();
    installPackageDirMock.mockReset();
    fileExistsMock.mockReset();
    scanSkillInstallSourceMock.mockReset();

    resolveClawHubBaseUrlMock.mockReturnValue("https://clawhub.ai");
    fileExistsMock.mockImplementation(async (input: string) => input.endsWith("SKILL.md"));
    fetchClawHubSkillDetailMock.mockResolvedValue({
      skill: {
        slug: "agentreceipt",
        displayName: "AgentReceipt",
        createdAt: 1,
        updatedAt: 2,
      },
      latestVersion: {
        version: "1.0.0",
        createdAt: 3,
      },
    });
    downloadClawHubSkillArchiveMock.mockResolvedValue({
      archivePath: "/tmp/agentreceipt.zip",
      integrity: "sha256-test",
      cleanup: archiveCleanupMock,
    });
    archiveCleanupMock.mockResolvedValue(undefined);
    searchClawHubSkillsMock.mockResolvedValue([]);
    withExtractedArchiveRootMock.mockImplementation(async (params) => {
      expect(params.rootMarkers).toEqual(["SKILL.md"]);
      const extractedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-clawhub-extract-"));
      await fs.writeFile(
        path.join(extractedRoot, "SKILL.md"),
        "---\nname: agentreceipt\ndescription: Test skill\n---\n\n# agentreceipt\n",
        "utf8",
      );
      return await params.onExtracted(extractedRoot);
    });
    scanSkillInstallSourceMock.mockResolvedValue(undefined);
    installPackageDirMock.mockImplementation(
      async (params: { sourceDir: string; targetDir: string }) => {
        void params.sourceDir;
        await fs.mkdir(params.targetDir, { recursive: true });
        await fs.writeFile(
          path.join(params.targetDir, "SKILL.md"),
          "---\nname: agentreceipt\ndescription: Test skill\n---\n\n# agentreceipt\n",
          "utf8",
        );
        return {
          ok: true,
          targetDir: params.targetDir,
        };
      },
    );
  });

  it("installs ClawHub skills only from a vetted staged workspace copy", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workspace-"));

    try {
      const result = await installSkillFromClawHub({
        workspaceDir,
        slug: "agentreceipt",
      });

      expect(downloadClawHubSkillArchiveMock).toHaveBeenCalledWith({
        slug: "agentreceipt",
        version: "1.0.0",
        baseUrl: undefined,
      });
      expect(installPackageDirMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDir: expect.stringContaining(
            "/.artifacts/skills/quarantine/agentreceipt/1.0.0/skill",
          ),
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        source: "clawhub",
        catalogId: "clawhub:agentreceipt",
        slug: "agentreceipt",
        version: "1.0.0",
        targetDir: path.join(workspaceDir, "skills", "agentreceipt"),
        installedSkillKey: "agentreceipt",
      });
      expect(scanSkillInstallSourceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: "clawhub",
          skillName: "agentreceipt",
          installId: "clawhub-vet",
        }),
      );
      const origin = JSON.parse(
        await fs.readFile(
          path.join(workspaceDir, "skills", "agentreceipt", ".clawhub", "origin.json"),
          "utf8",
        ),
      ) as { trustTier?: string; review?: { gate?: string; reportPath?: string } };
      expect(origin.trustTier).toBe("local_trusted");
      expect(origin.review?.gate).toBe("vet_scan");
      expect(origin.review?.reportPath).toContain(
        "/docs/projects/skills-system/skill-vetting/reports/",
      );
      expect(archiveCleanupMock).toHaveBeenCalledTimes(1);
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("vets ClawHub skills into workspace quarantine and report roots", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workspace-"));

    try {
      const result = await vetClawHubSkill({
        workspaceDir,
        slug: "agentreceipt",
      });

      expect(result).toMatchObject({
        ok: true,
        slug: "agentreceipt",
        version: "1.0.0",
        trustTier: "third_party_staged",
        outcome: "install",
      });
      if (!result.ok) {
        throw new Error("expected successful vet result");
      }
      expect(result.reportPath).toContain(
        "/docs/projects/skills-system/skill-vetting/reports/",
      );
      expect(result.quarantineDir).toContain(
        "/.artifacts/skills/quarantine/agentreceipt/1.0.0",
      );
      const manifest = JSON.parse(
        await fs.readFile(path.join(result.quarantineDir, "stage.json"), "utf8"),
      ) as { outcome?: string; trustTier?: string };
      expect(manifest.outcome).toBe("install");
      expect(manifest.trustTier).toBe("third_party_staged");
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("rejects staged skills when the vet scan blocks them", async () => {
    scanSkillInstallSourceMock.mockResolvedValueOnce({
      blocked: {
        code: "security_scan_blocked",
        reason: "shell execution not allowed",
      },
    });
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-workspace-"));

    try {
      const result = await vetClawHubSkill({
        workspaceDir,
        slug: "agentreceipt",
      });

      expect(result).toMatchObject({
        ok: true,
        outcome: "reject",
        trustTier: "quarantined_rejected",
      });
      if (!result.ok) {
        throw new Error("expected successful vet result");
      }
      const report = await fs.readFile(result.reportPath, "utf8");
      expect(report).toContain("Outcome: reject");
      expect(report).toContain("shell execution not allowed");
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  describe("legacy tracked slugs remain updatable", () => {
    async function createLegacyTrackedSkillFixture(slug: string) {
      const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-clawhub-"));
      const skillDir = path.join(workspaceDir, "skills", slug);
      await fs.mkdir(path.join(skillDir, ".clawhub"), { recursive: true });
      await fs.mkdir(path.join(workspaceDir, ".clawhub"), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, ".clawhub", "origin.json"),
        `${JSON.stringify(
          {
            version: 1,
            registry: "https://legacy.clawhub.ai",
            slug,
            installedVersion: "0.9.0",
            installedAt: 123,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.writeFile(
        path.join(workspaceDir, ".clawhub", "lock.json"),
        `${JSON.stringify(
          {
            version: 1,
            skills: {
              [slug]: {
                version: "0.9.0",
                installedAt: 123,
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      return { workspaceDir, skillDir };
    }

    it("updates all tracked legacy Unicode slugs in place", async () => {
      const slug = "re\u0430ct";
      const { workspaceDir } = await createLegacyTrackedSkillFixture(slug);
      installPackageDirMock.mockResolvedValueOnce({
        ok: true,
        targetDir: path.join(workspaceDir, "skills", slug),
      });

      try {
        const results = await updateSkillsFromClawHub({
          workspaceDir,
        });

        expect(fetchClawHubSkillDetailMock).toHaveBeenCalledWith({
          slug,
          baseUrl: "https://legacy.clawhub.ai",
        });
        expect(downloadClawHubSkillArchiveMock).toHaveBeenCalledWith({
          slug,
          version: "1.0.0",
          baseUrl: "https://legacy.clawhub.ai",
        });
        expect(results).toMatchObject([
          {
            ok: true,
            slug,
            previousVersion: "0.9.0",
            version: "1.0.0",
            targetDir: path.join(workspaceDir, "skills", slug),
          },
        ]);
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    });

    it("updates a legacy Unicode slug when requested explicitly", async () => {
      const slug = "re\u0430ct";
      const { workspaceDir } = await createLegacyTrackedSkillFixture(slug);
      installPackageDirMock.mockResolvedValueOnce({
        ok: true,
        targetDir: path.join(workspaceDir, "skills", slug),
      });

      try {
        const results = await updateSkillsFromClawHub({
          workspaceDir,
          slug,
        });

        expect(results).toMatchObject([
          {
            ok: true,
            slug,
            previousVersion: "0.9.0",
            version: "1.0.0",
            targetDir: path.join(workspaceDir, "skills", slug),
          },
        ]);
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    });

    it("still rejects an untracked Unicode slug passed to update", async () => {
      const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skills-clawhub-"));

      try {
        await expect(
          updateSkillsFromClawHub({
            workspaceDir,
            slug: "re\u0430ct",
          }),
        ).rejects.toThrow("Invalid skill slug");
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    });
  });

  describe("normalizeSlug rejects non-ASCII homograph slugs", () => {
    it("rejects Cyrillic homograph 'а' (U+0430) in slug", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "re\u0430ct",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects Cyrillic homograph 'е' (U+0435) in slug", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "r\u0435act",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects Cyrillic homograph 'о' (U+043E) in slug", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "t\u043Edo",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects slug with mixed Unicode and ASCII", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "cаlеndаr",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects slug with non-Latin scripts", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "技能",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects Unicode that case-folds to ASCII (Kelvin sign U+212A)", async () => {
      // "\u212A" (Kelvin sign) lowercases to "k" — must be caught before lowercasing
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "\u212Aalendar",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects slug starting with a hyphen", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "-calendar",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("rejects slug ending with a hyphen", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "calendar-",
      });
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("Invalid skill slug"),
      });
    });

    it("accepts uppercase ASCII slugs (preserves original casing behavior)", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "React",
      });
      expect(result).toMatchObject({ ok: true });
    });

    it("accepts valid lowercase ASCII slugs", async () => {
      const result = await installSkillFromClawHub({
        workspaceDir: "/tmp/workspace",
        slug: "calendar-2",
      });
      expect(result).toMatchObject({ ok: true });
    });
  });

  it("uses search for browse-all skill discovery", async () => {
    searchClawHubSkillsMock.mockResolvedValueOnce([
      {
        score: 1,
        slug: "calendar",
        displayName: "Calendar",
        summary: "Calendar skill",
        version: "1.2.3",
        updatedAt: 123,
      },
    ]);

    await expect(searchSkillsFromClawHub({ limit: 20 })).resolves.toEqual([
      {
        source: "clawhub",
        catalogId: "clawhub:calendar",
        score: 1,
        slug: "calendar",
        displayName: "Calendar",
        summary: "Calendar skill",
        version: "1.2.3",
        updatedAt: 123,
      },
    ]);
    expect(searchClawHubSkillsMock).toHaveBeenCalledWith({
      query: "*",
      limit: 20,
      baseUrl: undefined,
    });
    expect(listClawHubSkillsMock).not.toHaveBeenCalled();
  });
});
