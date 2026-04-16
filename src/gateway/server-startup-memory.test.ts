import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const { getMemorySearchManagerMock } = vi.hoisted(() => ({
  getMemorySearchManagerMock: vi.fn(),
}));
const { resolveModelMemoryLiveRuntimeStatusMock, warmModelMemoryLiveRuntimeMock } = vi.hoisted(
  () => ({
    resolveModelMemoryLiveRuntimeStatusMock: vi.fn(),
    warmModelMemoryLiveRuntimeMock: vi.fn(),
  }),
);

vi.mock("../plugins/memory-runtime.js", () => ({
  getActiveMemorySearchManager: getMemorySearchManagerMock,
  resolveActiveMemoryBackendConfig: vi.fn(({ cfg }: { cfg: OpenClawConfig; agentId: string }) => {
    const backend = cfg.memory?.backend ?? "builtin";
    return backend === "qmd" ? { backend: "qmd", qmd: {} } : { backend };
  }),
}));

vi.mock("../agents/model-memory.live-runtime.js", () => ({
  resolveModelMemoryLiveRuntimeStatus: resolveModelMemoryLiveRuntimeStatusMock,
  warmModelMemoryLiveRuntime: warmModelMemoryLiveRuntimeMock,
}));

import { startGatewayMemoryBackend } from "./server-startup-memory.js";

function createQmdConfig(agents: OpenClawConfig["agents"]): OpenClawConfig {
  return {
    agents,
    memory: { backend: "qmd", qmd: {} },
  } as OpenClawConfig;
}

function createGatewayLogMock() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe("startGatewayMemoryBackend", () => {
  beforeEach(() => {
    getMemorySearchManagerMock.mockClear();
    resolveModelMemoryLiveRuntimeStatusMock.mockReset();
    resolveModelMemoryLiveRuntimeStatusMock.mockReturnValue({
      enabled: false,
      source: "disabled",
      reason: "model-memory live runtime disabled",
      includeRetrievalPacks: false,
      contextInjectionEnabled: false,
      captureWritesEnabled: false,
      legacyMemorySlotDisabled: false,
      legacyMemorySearchDisabled: false,
      databaseConfigured: false,
    });
    warmModelMemoryLiveRuntimeMock.mockReset();
  });

  it("skips initialization when memory backend is not qmd", async () => {
    const cfg = {
      agents: { list: [{ id: "main", default: true }] },
      memory: { backend: "builtin" },
    } as OpenClawConfig;
    const log = { info: vi.fn(), warn: vi.fn() };

    await startGatewayMemoryBackend({ cfg, log });

    expect(getMemorySearchManagerMock).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("arms model-memory live runtime and skips legacy qmd startup when enabled", async () => {
    const cfg = {
      plugins: {
        slots: {
          memory: "none",
        },
      },
      agents: {
        defaults: {
          memorySearch: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;
    const log = createGatewayLogMock();
    resolveModelMemoryLiveRuntimeStatusMock.mockReturnValue({
      enabled: true,
      source: "config:plugins.entries.model-memory.config.live.enabled",
      includeRetrievalPacks: false,
      contextInjectionEnabled: true,
      captureWritesEnabled: true,
      legacyMemorySlotDisabled: true,
      legacyMemorySearchDisabled: true,
      databaseConfigured: true,
      databaseName: "model_memory_live",
    });
    warmModelMemoryLiveRuntimeMock.mockResolvedValue({
      status: {
        enabled: true,
        source: "config:plugins.entries.model-memory.config.live.enabled",
        includeRetrievalPacks: false,
        contextInjectionEnabled: true,
        captureWritesEnabled: true,
        legacyMemorySlotDisabled: true,
        legacyMemorySearchDisabled: true,
        databaseConfigured: true,
        databaseName: "model_memory_live",
      },
      memoryObjectCount: 12,
      projectionTargetCount: 4,
    });

    await startGatewayMemoryBackend({ cfg, log });

    expect(warmModelMemoryLiveRuntimeMock).toHaveBeenCalledWith({ config: cfg });
    expect(getMemorySearchManagerMock).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      "model-memory live runtime armed (12 objects, 4 projection targets, db=model_memory_live)",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("warns when model-memory live runtime is enabled but legacy memory config remains on", async () => {
    const cfg = {
      plugins: {
        slots: {
          memory: "memory-core",
        },
      },
      agents: {
        defaults: {
          memorySearch: {
            enabled: true,
          },
        },
      },
    } as OpenClawConfig;
    const log = createGatewayLogMock();
    resolveModelMemoryLiveRuntimeStatusMock.mockReturnValue({
      enabled: true,
      source: "config:plugins.entries.model-memory.config.live.enabled",
      includeRetrievalPacks: false,
      contextInjectionEnabled: true,
      captureWritesEnabled: true,
      legacyMemorySlotDisabled: false,
      legacyMemorySearchDisabled: false,
      databaseConfigured: true,
      databaseName: "model_memory_live",
    });
    warmModelMemoryLiveRuntimeMock.mockResolvedValue({
      status: {
        enabled: true,
        source: "config:plugins.entries.model-memory.config.live.enabled",
        includeRetrievalPacks: false,
        contextInjectionEnabled: true,
        captureWritesEnabled: true,
        legacyMemorySlotDisabled: false,
        legacyMemorySearchDisabled: false,
        databaseConfigured: true,
        databaseName: "model_memory_live",
      },
      memoryObjectCount: 4,
      projectionTargetCount: 4,
    });

    await startGatewayMemoryBackend({ cfg, log });

    expect(log.warn).toHaveBeenCalledWith(
      'model-memory live runtime is enabled while legacy memory surfaces remain configured; keep plugins.slots.memory="none" and agents.defaults.memorySearch.enabled=false for cutover mode',
    );
    expect(getMemorySearchManagerMock).not.toHaveBeenCalled();
  });

  it("initializes qmd backend for each configured agent", async () => {
    const cfg = createQmdConfig({ list: [{ id: "ops", default: true }, { id: "main" }] });
    const log = createGatewayLogMock();
    getMemorySearchManagerMock.mockResolvedValue({ manager: { search: vi.fn() } });

    await startGatewayMemoryBackend({ cfg, log });

    expect(getMemorySearchManagerMock).toHaveBeenCalledTimes(2);
    expect(getMemorySearchManagerMock).toHaveBeenNthCalledWith(1, { cfg, agentId: "ops" });
    expect(getMemorySearchManagerMock).toHaveBeenNthCalledWith(2, { cfg, agentId: "main" });
    expect(log.info).toHaveBeenNthCalledWith(
      1,
      'qmd memory startup initialization armed for agent "ops"',
    );
    expect(log.info).toHaveBeenNthCalledWith(
      2,
      'qmd memory startup initialization armed for agent "main"',
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("logs a warning when qmd manager init fails and continues with other agents", async () => {
    const cfg = createQmdConfig({ list: [{ id: "main", default: true }, { id: "ops" }] });
    const log = createGatewayLogMock();
    getMemorySearchManagerMock
      .mockResolvedValueOnce({ manager: null, error: "qmd missing" })
      .mockResolvedValueOnce({ manager: { search: vi.fn() } });

    await startGatewayMemoryBackend({ cfg, log });

    expect(log.warn).toHaveBeenCalledWith(
      'qmd memory startup initialization failed for agent "main": qmd missing',
    );
    expect(log.info).toHaveBeenCalledWith(
      'qmd memory startup initialization armed for agent "ops"',
    );
  });

  it("skips agents with memory search disabled", async () => {
    const cfg = createQmdConfig({
      defaults: { memorySearch: { enabled: true } },
      list: [
        { id: "main", default: true },
        { id: "ops", memorySearch: { enabled: false } },
      ],
    });
    const log = createGatewayLogMock();
    getMemorySearchManagerMock.mockResolvedValue({ manager: { search: vi.fn() } });

    await startGatewayMemoryBackend({ cfg, log });

    expect(getMemorySearchManagerMock).toHaveBeenCalledTimes(1);
    expect(getMemorySearchManagerMock).toHaveBeenCalledWith({ cfg, agentId: "main" });
    expect(log.info).toHaveBeenCalledWith(
      'qmd memory startup initialization armed for agent "main"',
    );
    expect(log.warn).not.toHaveBeenCalled();
  });
});
