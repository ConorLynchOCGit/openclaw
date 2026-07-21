// Bundled health check tests cover built-in doctor checks and repair advice.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerBundledHealthChecks } from "./bundled-health-checks.js";
import { clearHealthChecksForTest, listHealthChecks } from "./health-check-registry.js";
import type { HealthCheckContext } from "./health-checks.js";

const mocks = vi.hoisted(() => ({
  registerPolicyDoctorChecks: vi.fn(),
  registerCodexDoctorChecks: vi.fn(),
  tryLoadActivatedBundledPluginPublicSurfaceModuleSync: vi.fn(() => ({
    registerCodexDoctorChecks: mocks.registerCodexDoctorChecks,
  })),
  resolveBundledPluginPublicArtifactPath: vi.fn(
    (params: { dirName: string; artifactBasename: string }) =>
      `/bundled/${params.dirName}/${params.artifactBasename}`,
  ),
  loadBundledPluginPublicArtifactModuleSync: vi.fn(
    (params: { dirName: string; artifactBasename: string }) =>
      params.dirName === "codex"
        ? {
            registerCodexDoctorChecks: mocks.registerCodexDoctorChecks,
          }
        : {
            registerPolicyDoctorChecks: mocks.registerPolicyDoctorChecks,
          },
  ),
}));

vi.mock("../plugins/public-surface-loader.js", () => ({
  loadBundledPluginPublicArtifactModuleSync: mocks.loadBundledPluginPublicArtifactModuleSync,
  resolveBundledPluginPublicArtifactPath: mocks.resolveBundledPluginPublicArtifactPath,
}));

vi.mock("../plugin-sdk/facade-runtime.js", () => ({
  tryLoadActivatedBundledPluginPublicSurfaceModuleSync:
    mocks.tryLoadActivatedBundledPluginPublicSurfaceModuleSync,
}));

let workspaceDir: string;

describe("registerBundledHealthChecks", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
    vi.clearAllMocks();
    workspaceDir = join(tmpdir(), `bundled-health-${process.pid}-${Date.now()}`);
    mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    clearHealthChecksForTest();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("does not load bundled policy health checks without policy opt-in", () => {
    registerBundledHealthChecks({ cfg: {}, cwd: workspaceDir });

    expect(mocks.loadBundledPluginPublicArtifactModuleSync).not.toHaveBeenCalled();
  });

  it("loads bundled policy health checks when policy extension is enabled", () => {
    registerBundledHealthChecks({
      cfg: { plugins: { entries: { policy: { enabled: true } } } },
      cwd: workspaceDir,
    });

    expect(mocks.loadBundledPluginPublicArtifactModuleSync).toHaveBeenCalledWith({
      dirName: "policy",
      artifactBasename: "api.js",
    });
    expect(mocks.registerPolicyDoctorChecks).toHaveBeenCalledWith({
      registerHealthCheck: expect.any(Function),
      plugin: expect.objectContaining({
        id: "policy",
        origin: "bundled",
        rootDir: "/bundled/policy",
        source: "/bundled/policy/api.js",
      }),
    });
    expect(mocks.registerCodexDoctorChecks).not.toHaveBeenCalled();
  });

  it("loads managed Codex health checks when Codex extension is enabled", () => {
    registerBundledHealthChecks({
      cfg: { plugins: { entries: { codex: { enabled: true } } } },
      cwd: workspaceDir,
    });

    expect(mocks.tryLoadActivatedBundledPluginPublicSurfaceModuleSync).toHaveBeenCalledWith({
      dirName: "codex",
      artifactBasename: "api.js",
    });
    expect(mocks.registerCodexDoctorChecks).toHaveBeenCalledWith({
      registerHealthCheck: expect.any(Function),
    });
  });

  it("lets the managed Codex module retain its own package root", async () => {
    let observedPlugin: unknown;
    mocks.registerCodexDoctorChecks.mockImplementationOnce((host) => {
      host.registerHealthCheck({
        id: "codex/test-plugin-context",
        kind: "plugin",
        description: "test",
        source: "codex",
        async detect(ctx: HealthCheckContext) {
          observedPlugin = ctx.plugin;
          return [];
        },
      });
    });

    registerBundledHealthChecks({
      cfg: { plugins: { entries: { codex: { enabled: true } } } },
      cwd: workspaceDir,
    });

    const check = listHealthChecks().find((entry) => entry.id === "codex/test-plugin-context");
    await check?.detect({
      mode: "doctor",
      runtime: {} as never,
      cfg: { plugins: { entries: { codex: { enabled: true } } } },
    });

    expect(observedPlugin).toBeUndefined();
  });

  it("skips Codex health registration when no activated plugin facade is available", () => {
    mocks.tryLoadActivatedBundledPluginPublicSurfaceModuleSync.mockReturnValueOnce(null);

    registerBundledHealthChecks({
      cfg: { plugins: { entries: { codex: { enabled: true } } } },
      cwd: workspaceDir,
    });

    expect(mocks.registerCodexDoctorChecks).not.toHaveBeenCalled();
  });

  it("does not use policy.jsonc existence as extension activation", () => {
    writeFileSync(join(workspaceDir, "policy.jsonc"), "{}\n", "utf-8");

    registerBundledHealthChecks({ cfg: {}, cwd: workspaceDir });

    expect(mocks.loadBundledPluginPublicArtifactModuleSync).not.toHaveBeenCalled();
  });

  it("honors explicit policy disablement", () => {
    registerBundledHealthChecks({
      cfg: { plugins: { entries: { policy: { enabled: true, config: { enabled: false } } } } },
      cwd: workspaceDir,
    });

    expect(mocks.loadBundledPluginPublicArtifactModuleSync).not.toHaveBeenCalled();
  });

  it("honors plugin control-plane disablement for policy checks", () => {
    for (const plugins of [
      { enabled: false, entries: { policy: { enabled: true } } },
      { deny: ["policy"], entries: { policy: { enabled: true } } },
      { allow: ["telegram"], entries: { policy: { enabled: true } } },
    ]) {
      vi.clearAllMocks();

      registerBundledHealthChecks({ cfg: { plugins }, cwd: workspaceDir });

      expect(mocks.loadBundledPluginPublicArtifactModuleSync).not.toHaveBeenCalled();
      expect(mocks.tryLoadActivatedBundledPluginPublicSurfaceModuleSync).not.toHaveBeenCalled();
    }
  });

  it("honors plugin control-plane disablement for Codex checks", () => {
    for (const plugins of [
      { enabled: false, entries: { codex: { enabled: true } } },
      { deny: ["codex"], entries: { codex: { enabled: true } } },
      { allow: ["policy"], entries: { codex: { enabled: true } } },
      { entries: { codex: { enabled: false } } },
    ]) {
      vi.clearAllMocks();

      registerBundledHealthChecks({ cfg: { plugins }, cwd: workspaceDir });

      expect(mocks.loadBundledPluginPublicArtifactModuleSync).not.toHaveBeenCalled();
    }
  });
});
