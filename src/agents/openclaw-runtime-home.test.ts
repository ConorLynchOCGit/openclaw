import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOpenClawProviderProcessEnv,
  ensureOpenClawRuntimeProviderHome,
  resolveOpenClawRuntimeHome,
  resolveOpenClawRuntimeProviderHome,
} from "./openclaw-runtime-home.js";

let tempDir: string;

describe("OpenClaw runtime home", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-home-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("resolves one runtime-owned home for shared runtime state", () => {
    expect(
      resolveOpenClawRuntimeHome({
        HOME: "/home/node",
        OPENCLAW_RUNTIME_HOME: "/home/node/.openclaw/runtime",
      }),
    ).toEqual({
      runtimeHome: "/home/node/.openclaw/runtime",
      providersRoot: "/home/node/.openclaw/runtime/providers",
      stateHome: "/home/node/.openclaw/runtime/state",
      configHome: "/home/node/.openclaw/runtime/config",
      cacheHome: "/home/node/.openclaw/runtime/cache",
      tmpDir: "/home/node/.openclaw/runtime/tmp",
    });
  });

  it("places provider executable state under the runtime-owned provider home", () => {
    expect(
      resolveOpenClawRuntimeProviderHome("Codex App Server", {
        OPENCLAW_RUNTIME_HOME: "/home/node/.openclaw/runtime",
      }),
    ).toEqual(
      expect.objectContaining({
        providerId: "codex-app-server",
        providerHome: "/home/node/.openclaw/runtime/providers/codex-app-server",
      }),
    );
  });

  it("creates provider runtime directories with private permissions", async () => {
    const provider = ensureOpenClawRuntimeProviderHome("codex", {
      OPENCLAW_RUNTIME_HOME: tempDir,
    });

    await expect(fs.stat(provider.runtimeHome)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    await expect(fs.stat(provider.providersRoot)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
    await expect(fs.stat(provider.providerHome)).resolves.toMatchObject({
      mode: expect.any(Number),
    });
  });

  it("builds process env that overrides stale external Codex homes", () => {
    expect(
      buildOpenClawProviderProcessEnv("codex", {
        HOME: "/home/node",
        OPENCLAW_RUNTIME_HOME: "/home/node/.openclaw/runtime",
        CODEX_HOME: "/root/.codex",
      }),
    ).toEqual(
      expect.objectContaining({
        OPENCLAW_RUNTIME_HOME: "/home/node/.openclaw/runtime",
        HOME: "/home/node/.openclaw/runtime",
        XDG_STATE_HOME: "/home/node/.openclaw/runtime/state",
        XDG_CONFIG_HOME: "/home/node/.openclaw/runtime/config",
        XDG_CACHE_HOME: "/home/node/.openclaw/runtime/cache",
        TMPDIR: "/home/node/.openclaw/runtime/tmp",
        CODEX_HOME: "/home/node/.openclaw/runtime/providers/codex",
      }),
    );
  });
});
