// Codex readiness tests cover doctor-facing runtime reports.
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCodexRuntimeReadinessReport,
  resolveCodexPluginRootForReadiness,
} from "./readiness.js";

async function createManagedCodexRuntimeRoot(): Promise<{
  installRoot: string;
  pluginRoot: string;
  commandPath: string;
}> {
  const installRoot = await mkdtemp(path.join(os.tmpdir(), "openclaw-codex-ready-"));
  const pluginRoot = path.join(installRoot, "dist", "extensions", "codex");
  const packageRoot = path.join(installRoot, "node_modules", "@openai", "codex");
  const packageBin = path.join(packageRoot, "bin", "codex.js");
  await mkdir(path.dirname(packageBin), { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@openai/codex",
      bin: {
        codex: "bin/codex.js",
      },
    }),
  );
  await writeFile(packageBin, "#!/usr/bin/env node\n");
  return {
    installRoot,
    pluginRoot,
    commandPath: await realpath(packageBin),
  };
}

describe("Codex runtime readiness", () => {
  it("resolves source and built plugin roots", () => {
    expect(resolveCodexPluginRootForReadiness("/repo/extensions/codex/src/app-server")).toBe(
      "/repo/extensions/codex",
    );
    expect(
      resolveCodexPluginRootForReadiness("/app/dist/extensions/codex/dist/src/app-server"),
    ).toBe("/app/dist/extensions/codex");
    expect(resolveCodexPluginRootForReadiness("/app/dist/extensions/codex")).toBe(
      "/app/dist/extensions/codex",
    );
  });

  it("reports ready when managed package and binary are present", async () => {
    const runtime = await createManagedCodexRuntimeRoot();

    const report = await buildCodexRuntimeReadinessReport({
      pluginRoot: runtime.pluginRoot,
      platform: "linux",
      pathExists: vi.fn(async (filePath: string) => filePath === runtime.commandPath),
    });

    expect(report.ok).toBe(true);
    expect(report.start.commandSource).toBe("resolved-managed");
    expect(report.start.command).toBe(runtime.commandPath);
    expect(report.checks.map((check) => check.status)).not.toContain("error");
  });

  it("reports an error when the managed package or binary is missing", async () => {
    const report = await buildCodexRuntimeReadinessReport({
      pluginRoot: path.join("/missing", "dist", "extensions", "codex"),
      platform: "linux",
      pathExists: vi.fn(async () => false),
    });

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "codex.app_server.managed_runtime",
        status: "error",
      }),
    );
  });

  it("reports explicit command overrides as warnings instead of normal bundled readiness", async () => {
    const report = await buildCodexRuntimeReadinessReport({
      pluginConfig: {
        appServer: {
          command: "/opt/codex/bin/codex",
        },
      },
    });

    expect(report.ok).toBe(true);
    expect(report.start.commandSource).toBe("config");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "codex.app_server.command_override",
        status: "warning",
      }),
    );
  });
});
