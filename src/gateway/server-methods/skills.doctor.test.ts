import { beforeEach, describe, expect, it, vi } from "vitest";

const buildSkillsDoctorReportMock = vi.fn();
const resolveAgentLoadedSkillSnapshotStatusMock = vi.fn();

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({})),
  writeConfigFile: vi.fn(),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  listAgentIds: vi.fn(() => ["main", "writer"]),
  resolveDefaultAgentId: vi.fn(() => "main"),
  resolveAgentWorkspaceDir: vi.fn((_cfg, agentId: string) => `/tmp/${agentId}`),
}));

vi.mock("../../agents/skills-doctor.js", () => ({
  buildSkillsDoctorReport: (...args: unknown[]) => buildSkillsDoctorReportMock(...args),
}));

vi.mock("../../agents/skills-status.js", () => ({
  buildWorkspaceSkillStatus: vi.fn(),
  resolveAgentLoadedSkillSnapshotStatus: (...args: unknown[]) =>
    resolveAgentLoadedSkillSnapshotStatusMock(...args),
}));

vi.mock("../../agents/skills-clawhub.js", () => ({
  installSkillFromClawHub: vi.fn(),
  updateSkillsFromClawHub: vi.fn(),
  searchSkillsFromClawHub: vi.fn(),
  fetchSkillDetailFromClawHub: vi.fn(),
}));

vi.mock("../../agents/skills-install.js", () => ({
  installSkill: vi.fn(),
}));

const { skillsHandlers } = await import("./skills.js");

function callHandler(method: string, params: Record<string, unknown>) {
  let ok: boolean | null = null;
  let response: unknown;
  let error: unknown;
  const result = skillsHandlers[method]({
    params,
    req: {} as never,
    client: null as never,
    isWebchatConnect: () => false,
    context: {} as never,
    respond: (success: boolean, res: unknown, err: unknown) => {
      ok = success;
      response = res;
      error = err;
    },
  });
  return Promise.resolve(result).then(() => ({ ok, response, error }));
}

describe("skills.doctor handler", () => {
  beforeEach(() => {
    buildSkillsDoctorReportMock.mockReset();
    resolveAgentLoadedSkillSnapshotStatusMock.mockReset();
  });

  it("returns the doctor report for the selected agent workspace", async () => {
    resolveAgentLoadedSkillSnapshotStatusMock.mockReturnValue({
      currentSnapshotVersion: 2,
      skillsSnapshot: {
        prompt: "",
        version: 1,
        skills: [{ name: "calendar" }],
      },
    });
    buildSkillsDoctorReportMock.mockResolvedValue({
      workspaceDir: "/tmp/writer",
      managedSkillsDir: "/tmp/writer/.managed",
      configuredSkillDirs: [],
      discoveredSkillNames: ["calendar"],
      loadedSkillNames: ["calendar"],
      loadedState: "available",
      hotReloadState: "current",
      watchState: "not_available",
      restartRequired: false,
      restartRequiredReason: "current",
      trackedClawHubInstalls: [],
      writableSurfaces: [],
      collisions: [],
      conformanceIssues: [],
    });

    const { ok, response, error } = await callHandler("skills.doctor", {
      agentId: "writer",
    });

    expect(ok).toBe(true);
    expect(error).toBeUndefined();
    expect(resolveAgentLoadedSkillSnapshotStatusMock).toHaveBeenCalledWith({
      config: {},
      agentId: "writer",
      workspaceDir: "/tmp/writer",
    });
    expect(buildSkillsDoctorReportMock).toHaveBeenCalledWith({
      workspaceDir: "/tmp/writer",
      config: {},
      loadedSession: expect.objectContaining({ currentSnapshotVersion: 2 }),
    });
    expect(response).toMatchObject({
      workspaceDir: "/tmp/writer",
      loadedState: "available",
      restartRequired: false,
    });
  });

  it("rejects unknown agent ids", async () => {
    const { ok, error } = await callHandler("skills.doctor", {
      agentId: "missing",
    });

    expect(ok).toBe(false);
    expect(error).toMatchObject({
      code: "INVALID_REQUEST",
      message: 'unknown agent id "missing"',
    });
    expect(buildSkillsDoctorReportMock).not.toHaveBeenCalled();
  });
});
