// Export trajectory tests cover trajectory export command output and file selection.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import { exportTrajectoryCommand } from "./export-trajectory.js";

const mocks = vi.hoisted(() => ({
  exportTrajectoryForCommand: vi.fn(),
  loadSessionStore: vi.fn(),
  pathExists: vi.fn(),
  resolveDefaultSessionStorePath: vi.fn(),
}));

vi.mock("../infra/fs-safe.js", () => ({
  pathExists: mocks.pathExists,
}));

vi.mock("../trajectory/command-export.js", () => ({
  exportTrajectoryForCommand: mocks.exportTrajectoryForCommand,
  formatTrajectoryCommandExportSummary: () => "trajectory exported",
}));

vi.mock("../config/sessions/store.js", () => ({
  loadSessionStore: mocks.loadSessionStore,
}));

vi.mock("../config/sessions/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions/paths.js")>();
  return {
    ...actual,
    resolveDefaultSessionStorePath: mocks.resolveDefaultSessionStorePath,
  };
});

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as RuntimeEnv;
}

describe("exportTrajectoryCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.exportTrajectoryForCommand.mockResolvedValue({
      outputDir: "/tmp/workspace/.openclaw/trajectory-exports/export",
      displayPath: ".openclaw/trajectory-exports/export",
      sessionId: "session-1",
      eventCount: 1,
      runtimeEventCount: 0,
      transcriptEventCount: 1,
      files: ["manifest.json"],
    });
    mocks.resolveDefaultSessionStorePath.mockReturnValue("/tmp/openclaw/sessions.json");
    mocks.loadSessionStore.mockReturnValue({});
    mocks.pathExists.mockResolvedValue(false);
  });

  it("points missing session key users at the sessions command", async () => {
    const runtime = createRuntime();

    await exportTrajectoryCommand({}, runtime);

    expect(runtime.error).toHaveBeenCalledWith(
      "--session-key is required. Run openclaw sessions to choose a session.",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("reports malformed encoded request JSON without leaking parser output", async () => {
    const runtime = createRuntime();
    const requestJsonBase64 = Buffer.from("not json", "utf8").toString("base64url");

    await exportTrajectoryCommand({ requestJsonBase64 }, runtime);

    expect(runtime.error).toHaveBeenCalledWith(
      "Failed to decode trajectory export request: Encoded trajectory export request is invalid JSON",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("preserves direct options when an encoded request omits them", async () => {
    const runtime = createRuntime();
    const requestJsonBase64 = Buffer.from(
      JSON.stringify({ output: "/tmp/export.json" }),
      "utf8",
    ).toString("base64url");

    await exportTrajectoryCommand(
      {
        requestJsonBase64,
        sessionKey: "agent:main:telegram:direct:123",
        store: "/tmp/direct-store.json",
      },
      runtime,
    );

    expect(mocks.resolveDefaultSessionStorePath).not.toHaveBeenCalled();
    expect(mocks.loadSessionStore).toHaveBeenCalledWith("/tmp/direct-store.json", {
      skipCache: true,
    });
    expect(runtime.error).toHaveBeenCalledWith(
      "Session not found: agent:main:telegram:direct:123. Run openclaw sessions to see available sessions.",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("points missing session users at the sessions command", async () => {
    const runtime = createRuntime();

    await exportTrajectoryCommand({ sessionKey: "agent:main:telegram:direct:123" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith(
      "Session not found: agent:main:telegram:direct:123. Run openclaw sessions to see available sessions.",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("defaults trajectory exports to the configured OpenClaw workspace, not cwd", async () => {
    const runtime = createRuntime();
    vi.stubEnv("OPENCLAW_WORKSPACE_DIR", "/tmp/openclaw-workspace");
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:telegram:direct:123": { sessionId: "session-1" },
    });
    mocks.pathExists.mockResolvedValue(true);

    await exportTrajectoryCommand({ sessionKey: "agent:main:telegram:direct:123" }, runtime);

    expect(mocks.exportTrajectoryForCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionKey: "agent:main:telegram:direct:123",
        workspaceDir: "/tmp/openclaw-workspace",
      }),
    );
    expect(runtime.error).not.toHaveBeenCalled();
    expect(runtime.log).toHaveBeenCalledWith("trajectory exported");
  });

  it("prefers the stored spawned session workspace when workspace is omitted", async () => {
    const runtime = createRuntime();
    vi.stubEnv("OPENCLAW_WORKSPACE_DIR", "/tmp/openclaw-workspace");
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:subagent:123": {
        sessionId: "session-1",
        spawnedWorkspaceDir: "/tmp/spawned-workspace",
      },
    });
    mocks.pathExists.mockResolvedValue(true);

    await exportTrajectoryCommand({ sessionKey: "agent:main:subagent:123" }, runtime);

    expect(mocks.exportTrajectoryForCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceDir: "/tmp/spawned-workspace",
      }),
    );
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("adds an actionable hint when the default export workspace is not writable", async () => {
    const runtime = createRuntime();
    vi.stubEnv("OPENCLAW_WORKSPACE_DIR", "/tmp/openclaw-workspace");
    mocks.loadSessionStore.mockReturnValue({
      "agent:main:telegram:direct:123": { sessionId: "session-1" },
    });
    mocks.pathExists.mockResolvedValue(true);
    mocks.exportTrajectoryForCommand.mockRejectedValue(
      Object.assign(
        new Error("EACCES: permission denied, mkdir '/tmp/openclaw-workspace/.openclaw'"),
        {
          code: "EACCES",
        },
      ),
    );

    await exportTrajectoryCommand({ sessionKey: "agent:main:telegram:direct:123" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith(
      "Failed to export trajectory: EACCES: permission denied, mkdir '/tmp/openclaw-workspace/.openclaw'. Default export workspace resolved to /tmp/openclaw-workspace. Pass --workspace <writable-workspace> or set OPENCLAW_WORKSPACE_DIR.",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });
});
