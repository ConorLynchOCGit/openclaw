import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";

const { resolveModelMemoryLiveRuntimeStatusMock, warmModelMemoryLiveRuntimeMock } = vi.hoisted(
  () => ({
    resolveModelMemoryLiveRuntimeStatusMock: vi.fn(),
    warmModelMemoryLiveRuntimeMock: vi.fn(),
  }),
);

vi.mock("../agents/model-memory.live-runtime.js", () => ({
  resolveModelMemoryLiveRuntimeStatus: resolveModelMemoryLiveRuntimeStatusMock,
  warmModelMemoryLiveRuntime: warmModelMemoryLiveRuntimeMock,
}));

import { startGatewayMemoryBackend } from "./server-startup-memory.js";

function createGatewayLogMock() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe("startGatewayMemoryBackend", () => {
  beforeEach(() => {
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

    expect(warmModelMemoryLiveRuntimeMock).not.toHaveBeenCalled();
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
      'model-memory live runtime is enabled while legacy compatibility memory surfaces remain configured; keep plugins.slots.memory="none" and agents.defaults.memorySearch.enabled=false for MMV2-native mode',
    );
  });
});
