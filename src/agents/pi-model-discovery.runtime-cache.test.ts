import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearDiscoveredAgentModelRuntimeCacheForTest,
  discoverAgentModelRuntimeForTest,
} from "./pi-model-discovery.js";

describe("discoverAgentModelRuntime cache", () => {
  let tmpDir = "";

  afterEach(async () => {
    clearDiscoveredAgentModelRuntimeCacheForTest();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("reuses the admitted auth/model runtime for a matching agent directory", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-pi-runtime-cache-"));
    let factoryCallCount = 0;
    const factory = () => {
      factoryCallCount += 1;
      return {
        authStorage: { kind: "auth", factoryCallCount } as never,
        modelRegistry: { kind: "models", factoryCallCount } as never,
      };
    };

    const first = discoverAgentModelRuntimeForTest(tmpDir, { syncExternalCli: false }, factory);
    const second = discoverAgentModelRuntimeForTest(tmpDir, { syncExternalCli: false }, factory);

    expect(second).toBe(first);
    expect(second.authStorage).toBe(first.authStorage);
    expect(second.modelRegistry).toBe(first.modelRegistry);
    expect(factoryCallCount).toBe(1);

    clearDiscoveredAgentModelRuntimeCacheForTest();
    const afterClear = discoverAgentModelRuntimeForTest(
      tmpDir,
      { syncExternalCli: false },
      factory,
    );
    expect(afterClear).not.toBe(first);
    expect(factoryCallCount).toBe(2);
  });
});
