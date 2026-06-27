import type { HealthCheck } from "openclaw/plugin-sdk/health";
// Codex public API tests cover bundled doctor health registration.
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildCodexRuntimeReadinessReport: vi.fn(),
}));

vi.mock("./src/app-server/readiness.js", () => ({
  buildCodexRuntimeReadinessReport: mocks.buildCodexRuntimeReadinessReport,
}));

describe("Codex public API", () => {
  it("registers app-server runtime readiness as a bundled doctor check", async () => {
    const checks: HealthCheck[] = [];
    const { registerCodexDoctorChecks } = await import("./api.js");

    registerCodexDoctorChecks({ registerHealthCheck: (check) => checks.push(check) });

    expect(checks.map((check) => check.id)).toContain("codex/doctor/app-server-runtime");
  });

  it("maps readiness failures into doctor health findings", async () => {
    vi.resetModules();
    mocks.buildCodexRuntimeReadinessReport.mockResolvedValueOnce({
      ok: false,
      pluginRoot: "/app/dist/extensions/codex",
      start: {
        transport: "stdio",
        command: "codex",
        commandSource: "managed",
        args: ["app-server", "--listen", "stdio://"],
      },
      appServer: {
        requestTimeoutMs: 60_000,
        turnCompletionIdleTimeoutMs: 60_000,
        sandbox: "danger-full-access",
        approvalsReviewer: "user",
      },
      checks: [
        {
          id: "codex.app_server.managed_runtime",
          status: "error",
          message: "Managed Codex app-server runtime dependency is missing.",
        },
        {
          id: "codex.app_server.command_override",
          status: "warning",
          message: "Codex app-server is using an explicit operator command override.",
          path: "plugins.entries.codex.config.appServer.command",
        },
      ],
    });
    const checks: HealthCheck[] = [];
    const { registerCodexDoctorChecks } = await import("./api.js");
    registerCodexDoctorChecks({ registerHealthCheck: (check) => checks.push(check) });

    const findings = await checks[0]?.detect({
      mode: "doctor",
      runtime: {} as never,
      cfg: {
        plugins: {
          entries: {
            codex: {
              enabled: true,
              config: { appServer: {} },
            },
          },
        },
      },
      plugin: {
        id: "codex",
        origin: "bundled",
        rootDir: "/loader-owned/codex",
        source: "/loader-owned/codex/api.js",
      },
    });

    expect(mocks.buildCodexRuntimeReadinessReport).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginRoot: "/loader-owned/codex",
      }),
    );
    expect(findings).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "codex.app_server.managed_runtime",
      }),
      expect.objectContaining({
        severity: "warning",
        source: "codex.app_server.command_override",
        path: "plugins.entries.codex.config.appServer.command",
      }),
    ]);
  });
});
