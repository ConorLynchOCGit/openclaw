import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerSkillsCli } from "./skills-cli.js";

const mocks = vi.hoisted(() => {
  const runtimeLogs: string[] = [];
  const runtimeStdout: string[] = [];
  const runtimeErrors: string[] = [];
  const stringifyArgs = (args: unknown[]) => args.map((value) => String(value)).join(" ");
  const skillStatusReportFixture = {
    workspaceDir: "/tmp/workspace",
    managedSkillsDir: "/tmp/workspace/skills",
    configuredSkillDirs: [{ kind: "workspace", path: "/tmp/workspace/skills" }],
    discoveredSkillNames: ["calendar"],
    activatableSkillNames: ["calendar"],
    modelVisibleSkillNames: ["calendar"],
    loadedSkillNames: null,
    loadedState: "not_available",
    loadedStateReason: "test fixture",
    hotReloadState: "not_available",
    skills: [
      {
        name: "calendar",
        description: "Calendar helpers",
        source: "bundled",
        bundled: false,
        filePath: "/tmp/workspace/skills/calendar/SKILL.md",
        baseDir: "/tmp/workspace/skills/calendar",
        skillKey: "calendar",
        emoji: "📅",
        homepage: "https://example.com/calendar",
        always: false,
        disabled: false,
        blockedByAllowlist: false,
        blockedByPermissions: false,
        blockedByTrustVetting: false,
        activatable: true,
        eligible: true,
        modelVisible: true,
        loadedInCurrentSession: null,
        newSessionRequired: null,
        availabilityState: "activatable",
        availabilityReason: "test fixture",
        primaryEnv: "CALENDAR_API_KEY",
        requirements: {
          bins: [],
          anyBins: [],
          env: ["CALENDAR_API_KEY"],
          config: [],
          os: [],
        },
        missing: {
          bins: [],
          anyBins: [],
          env: [],
          config: [],
          os: [],
        },
        configChecks: [],
        install: [],
      },
    ],
  };
  const defaultRuntime = {
    log: vi.fn((...args: unknown[]) => {
      runtimeLogs.push(stringifyArgs(args));
    }),
    error: vi.fn((...args: unknown[]) => {
      runtimeErrors.push(stringifyArgs(args));
    }),
    writeStdout: vi.fn((value: string) => {
      runtimeStdout.push(value.endsWith("\n") ? value.slice(0, -1) : value);
    }),
    writeJson: vi.fn((value: unknown, space = 2) => {
      runtimeStdout.push(JSON.stringify(value, null, space > 0 ? space : undefined));
    }),
    exit: vi.fn((code: number) => {
      throw new Error(`__exit__:${code}`);
    }),
  };
  const buildWorkspaceSkillStatusMock = vi.fn((workspaceDir: string, options?: unknown) => {
    void workspaceDir;
    void options;
    return skillStatusReportFixture;
  });
  return {
    loadConfigMock: vi.fn(() => ({})),
    resolveDefaultAgentIdMock: vi.fn(() => "main"),
    resolveAgentWorkspaceDirMock: vi.fn(() => "/tmp/workspace"),
    searchSkillsFromClawHubMock: vi.fn(),
    fetchSkillDetailFromClawHubMock: vi.fn(),
    installSkillFromClawHubMock: vi.fn(),
    updateSkillsFromClawHubMock: vi.fn(),
    readTrackedClawHubSkillSlugsMock: vi.fn(),
    buildWorkspaceSkillStatusMock,
    buildSkillsDoctorReportMock: vi.fn(),
    skillStatusReportFixture,
    defaultRuntime,
    runtimeLogs,
    runtimeStdout,
    runtimeErrors,
  };
});

const {
  loadConfigMock,
  resolveDefaultAgentIdMock,
  resolveAgentWorkspaceDirMock,
  searchSkillsFromClawHubMock,
  fetchSkillDetailFromClawHubMock,
  installSkillFromClawHubMock,
  updateSkillsFromClawHubMock,
  readTrackedClawHubSkillSlugsMock,
  buildWorkspaceSkillStatusMock,
  buildSkillsDoctorReportMock,
  skillStatusReportFixture,
  defaultRuntime,
  runtimeLogs,
  runtimeStdout,
  runtimeErrors,
} = mocks;

vi.mock("../runtime.js", () => ({
  defaultRuntime: mocks.defaultRuntime,
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => mocks.loadConfigMock(),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: () => mocks.resolveDefaultAgentIdMock(),
  resolveAgentWorkspaceDir: () => mocks.resolveAgentWorkspaceDirMock(),
}));

vi.mock("../agents/skills-clawhub.js", () => ({
  searchSkillsFromClawHub: (...args: unknown[]) => mocks.searchSkillsFromClawHubMock(...args),
  fetchSkillDetailFromClawHub: (...args: unknown[]) =>
    mocks.fetchSkillDetailFromClawHubMock(...args),
  installSkillFromClawHub: (...args: unknown[]) => mocks.installSkillFromClawHubMock(...args),
  updateSkillsFromClawHub: (...args: unknown[]) => mocks.updateSkillsFromClawHubMock(...args),
  readTrackedClawHubSkillSlugs: (...args: unknown[]) =>
    mocks.readTrackedClawHubSkillSlugsMock(...args),
}));

vi.mock("../agents/skills-status.js", () => ({
  buildWorkspaceSkillStatus: (workspaceDir: string, options?: unknown) =>
    mocks.buildWorkspaceSkillStatusMock(workspaceDir, options),
  resolveAgentLoadedSkillSnapshotStatus: vi.fn(() => ({
    currentSnapshotVersion: 1,
    unavailableReason: "test fixture",
  })),
}));

vi.mock("../agents/skills-doctor.js", () => ({
  buildSkillsDoctorReport: (...args: unknown[]) => mocks.buildSkillsDoctorReportMock(...args),
}));

describe("skills cli commands", () => {
  const createProgram = () => {
    const program = new Command();
    program.exitOverride();
    registerSkillsCli(program);
    return program;
  };

  const runCommand = (argv: string[]) => createProgram().parseAsync(argv, { from: "user" });

  beforeEach(() => {
    runtimeLogs.length = 0;
    runtimeStdout.length = 0;
    runtimeErrors.length = 0;
    loadConfigMock.mockReset();
    resolveDefaultAgentIdMock.mockReset();
    resolveAgentWorkspaceDirMock.mockReset();
    searchSkillsFromClawHubMock.mockReset();
    fetchSkillDetailFromClawHubMock.mockReset();
    installSkillFromClawHubMock.mockReset();
    updateSkillsFromClawHubMock.mockReset();
    readTrackedClawHubSkillSlugsMock.mockReset();
    buildWorkspaceSkillStatusMock.mockReset();
    buildSkillsDoctorReportMock.mockReset();

    loadConfigMock.mockReturnValue({});
    resolveDefaultAgentIdMock.mockReturnValue("main");
    resolveAgentWorkspaceDirMock.mockReturnValue("/tmp/workspace");
    searchSkillsFromClawHubMock.mockResolvedValue([]);
    fetchSkillDetailFromClawHubMock.mockResolvedValue({
      source: "clawhub",
      catalogId: "clawhub:calendar",
      slug: "calendar",
      skill: {
        slug: "calendar",
        displayName: "Calendar",
        summary: "CalDAV helpers",
        createdAt: 1,
        updatedAt: 2,
      },
      latestVersion: {
        version: "1.2.3",
        createdAt: 3,
      },
    });
    installSkillFromClawHubMock.mockResolvedValue({
      ok: true,
      source: "clawhub",
      catalogId: "clawhub:calendar",
      slug: "calendar",
      version: "1.2.3",
      installedSkillKey: "calendar",
      targetDir: "/tmp/workspace/skills/calendar",
    });
    updateSkillsFromClawHubMock.mockResolvedValue([]);
    readTrackedClawHubSkillSlugsMock.mockResolvedValue([]);
    buildWorkspaceSkillStatusMock.mockReturnValue(skillStatusReportFixture);
    buildSkillsDoctorReportMock.mockResolvedValue({
      workspaceDir: "/tmp/workspace",
      managedSkillsDir: "/tmp/workspace/.managed",
      configuredSkillDirs: [{ kind: "workspace", path: "/tmp/workspace/skills" }],
      discoveredSkillNames: ["calendar"],
      activatableSkillNames: ["calendar"],
      modelVisibleSkillNames: ["calendar"],
      loadedSkillNames: null,
      loadedState: "not_available",
      loadedStateReason: "test fixture",
      hotReloadState: "not_available",
      watchState: "enabled",
      watchStateReason: "test fixture",
      newSessionRequired: null,
      newSessionRequiredReason: "test fixture",
      restartRequired: null,
      restartRequiredReason: "test fixture",
      skills: [],
      trackedClawHubInstalls: [],
      writableSurfaces: [{ kind: "workspace", path: "/tmp/workspace/skills", state: "writable" }],
      collisions: [],
      conformanceIssues: [],
    });
    defaultRuntime.log.mockClear();
    defaultRuntime.error.mockClear();
    defaultRuntime.writeStdout.mockClear();
    defaultRuntime.writeJson.mockClear();
    defaultRuntime.exit.mockClear();
  });

  it("searches ClawHub skills from the native CLI", async () => {
    searchSkillsFromClawHubMock.mockResolvedValue([
      {
        source: "clawhub",
        catalogId: "clawhub:calendar",
        slug: "calendar",
        displayName: "Calendar",
        summary: "CalDAV helpers",
        version: "1.2.3",
      },
    ]);

    await runCommand(["skills", "search", "calendar"]);

    expect(searchSkillsFromClawHubMock).toHaveBeenCalledWith({
      query: "calendar",
      limit: undefined,
    });
    expect(
      runtimeLogs.some((line) =>
        line.includes("calendar v1.2.3  Calendar  [catalogId=clawhub:calendar]"),
      ),
    ).toBe(true);
    expect(
      runtimeLogs.some((line) => line.includes("Remote search returns ClawHub catalog ids")),
    ).toBe(true);
  });

  it("installs a skill from ClawHub into the active workspace", async () => {
    installSkillFromClawHubMock.mockResolvedValue({
      ok: true,
      source: "clawhub",
      catalogId: "clawhub:calendar",
      slug: "calendar",
      version: "1.2.3",
      installedSkillKey: "calendar",
      targetDir: "/tmp/workspace/skills/calendar",
    });

    await runCommand(["skills", "install", "calendar", "--version", "1.2.3"]);

    expect(installSkillFromClawHubMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace",
      slug: "calendar",
      catalogId: undefined,
      version: "1.2.3",
      force: false,
      logger: expect.any(Object),
    });
    expect(
      runtimeLogs.some((line) =>
        line.includes(
          "Installed calendar@1.2.3 [catalogId=clawhub:calendar] -> /tmp/workspace/skills/calendar",
        ),
      ),
    ).toBe(true);
  });

  it("fetches remote info for a catalog id", async () => {
    await runCommand(["skills", "info", "--source", "clawhub", "--catalog-id", "clawhub:calendar"]);

    expect(fetchSkillDetailFromClawHubMock).toHaveBeenCalledWith({
      slug: undefined,
      catalogId: "clawhub:calendar",
    });
    expect(
      runtimeLogs.some((line) => line.includes("source=clawhub catalogId=clawhub:calendar")),
    ).toBe(true);
  });

  it("prints doctor output", async () => {
    await runCommand(["skills", "doctor"]);

    expect(buildSkillsDoctorReportMock).toHaveBeenCalled();
    expect(runtimeStdout.some((line) => line.includes("Skills doctor:"))).toBe(true);
    expect(runtimeStdout.some((line) => line.includes("Activatable skills: 1"))).toBe(true);
    expect(runtimeStdout.some((line) => line.includes("Watch state: enabled"))).toBe(true);
  });

  it("updates all tracked ClawHub skills", async () => {
    readTrackedClawHubSkillSlugsMock.mockResolvedValue(["calendar"]);
    updateSkillsFromClawHubMock.mockResolvedValue([
      {
        ok: true,
        slug: "calendar",
        previousVersion: "1.2.2",
        version: "1.2.3",
        changed: true,
        targetDir: "/tmp/workspace/skills/calendar",
      },
    ]);

    await runCommand(["skills", "update", "--all"]);

    expect(readTrackedClawHubSkillSlugsMock).toHaveBeenCalledWith("/tmp/workspace");
    expect(updateSkillsFromClawHubMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/workspace",
      slug: undefined,
      logger: expect.any(Object),
    });
    expect(runtimeLogs.some((line) => line.includes("Updated calendar: 1.2.2 -> 1.2.3"))).toBe(
      true,
    );
    expect(runtimeErrors).toEqual([]);
  });

  it.each([
    {
      label: "list",
      argv: ["skills", "list", "--json"],
      assert: (payload: Record<string, unknown>) => {
        const skills = payload.skills as Array<Record<string, unknown>>;
        expect(skills).toHaveLength(1);
        expect(skills[0]?.name).toBe("calendar");
      },
    },
    {
      label: "info",
      argv: ["skills", "info", "calendar", "--json"],
      assert: (payload: Record<string, unknown>) => {
        expect(payload.name).toBe("calendar");
        expect(payload.primaryEnv).toBe("CALENDAR_API_KEY");
      },
    },
    {
      label: "check",
      argv: ["skills", "check", "--json"],
      assert: (payload: Record<string, unknown>) => {
        expect(payload.summary).toMatchObject({
          total: 1,
          eligible: 1,
        });
      },
    },
  ])("routes skills $label JSON output through stdout", async ({ argv, assert }) => {
    await runCommand(argv);

    expect(buildWorkspaceSkillStatusMock).toHaveBeenCalledWith("/tmp/workspace", {
      config: {},
    });
    expect(
      defaultRuntime.writeStdout.mock.calls.length + defaultRuntime.writeJson.mock.calls.length,
    ).toBeGreaterThan(0);
    expect(defaultRuntime.log).not.toHaveBeenCalled();
    expect(runtimeErrors).toEqual([]);
    expect(runtimeStdout.length).toBeGreaterThan(0);

    const payload = JSON.parse(runtimeStdout.at(-1) ?? "{}") as Record<string, unknown>;
    assert(payload);
  });

  it("keeps non-JSON skills list output on stdout with human-readable formatting", async () => {
    await runCommand(["skills", "list"]);

    expect(defaultRuntime.writeStdout).toHaveBeenCalledTimes(1);
    expect(defaultRuntime.log).not.toHaveBeenCalled();
    expect(runtimeErrors).toEqual([]);
    expect(runtimeStdout.at(-1)).toContain("calendar");
    expect(runtimeStdout.at(-1)).toContain("openclaw skills search");
  });
});
