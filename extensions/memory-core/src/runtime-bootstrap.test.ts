import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type MockProvider = { id: string };

const memoryEmbeddingProviders = vi.hoisted<MockProvider[]>(() => []);
const listMemoryEmbeddingProviders = vi.hoisted(() => vi.fn(() => [...memoryEmbeddingProviders]));
const registerMemoryEmbeddingProvider = vi.hoisted(() =>
  vi.fn((adapter: MockProvider) => {
    if (!memoryEmbeddingProviders.some((entry) => entry.id === adapter.id)) {
      memoryEmbeddingProviders.push(adapter);
    }
  }),
);
const loadConfig = vi.hoisted(() => vi.fn(() => ({ from: "loadConfig" })));
const resolveCommandSecretRefsViaGateway = vi.hoisted(() =>
  vi.fn(async ({ config }: { config: unknown }) => ({
    resolvedConfig: { ...((config as Record<string, unknown>) ?? {}), resolved: true },
    diagnostics: ["resolved via gateway"] as string[],
  })),
);
const registerBuiltInMemoryEmbeddingProviders = vi.hoisted(() =>
  vi.fn(
    ({
      registerMemoryEmbeddingProvider,
    }: {
      registerMemoryEmbeddingProvider: (adapter: { id: string }) => void;
    }) => {
      registerMemoryEmbeddingProvider({ id: "openai" });
      registerMemoryEmbeddingProvider({ id: "voyage" });
    },
  ),
);

vi.mock("openclaw/plugin-sdk/memory-core-host-runtime-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("openclaw/plugin-sdk/memory-core-host-runtime-core")>();
  return {
    ...actual,
    listMemoryEmbeddingProviders,
    loadConfig,
    registerMemoryEmbeddingProvider,
  };
});

vi.mock("openclaw/plugin-sdk/memory-core-host-runtime-cli", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("openclaw/plugin-sdk/memory-core-host-runtime-cli")>();
  return {
    ...actual,
    resolveCommandSecretRefsViaGateway,
  };
});

vi.mock("./memory/provider-adapters.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./memory/provider-adapters.js")>();
  return {
    ...actual,
    builtinMemoryEmbeddingProviderAdapters: [{ id: "openai" }, { id: "voyage" }],
    registerBuiltInMemoryEmbeddingProviders,
  };
});

let bootstrapMemoryCoreRuntime: typeof import("./runtime-bootstrap.js").bootstrapMemoryCoreRuntime;
let getMemoryRuntimeSecretTargetIds: typeof import("./runtime-bootstrap.js").getMemoryRuntimeSecretTargetIds;

beforeAll(async () => {
  ({ bootstrapMemoryCoreRuntime, getMemoryRuntimeSecretTargetIds } =
    await import("./runtime-bootstrap.js"));
});

beforeEach(() => {
  memoryEmbeddingProviders.length = 0;
  listMemoryEmbeddingProviders.mockClear();
  registerMemoryEmbeddingProvider.mockClear();
  loadConfig.mockReset().mockReturnValue({ from: "loadConfig" });
  resolveCommandSecretRefsViaGateway.mockReset().mockImplementation(async ({ config }) => ({
    resolvedConfig: { ...((config as Record<string, unknown>) ?? {}), resolved: true },
    diagnostics: ["resolved via gateway"] as string[],
  }));
  registerBuiltInMemoryEmbeddingProviders.mockClear();
});

describe("bootstrapMemoryCoreRuntime", () => {
  it("resolves memory command secrets and registers built-in providers", async () => {
    const result = await bootstrapMemoryCoreRuntime({
      commandName: "memory proof",
      config: { from: "provided" } as never,
    });

    expect(resolveCommandSecretRefsViaGateway).toHaveBeenCalledWith({
      config: { from: "provided" },
      commandName: "memory proof",
      targetIds: new Set([
        "agents.defaults.memorySearch.remote.apiKey",
        "agents.list[].memorySearch.remote.apiKey",
      ]),
    });
    expect(registerBuiltInMemoryEmbeddingProviders).toHaveBeenCalledTimes(1);
    expect(registerMemoryEmbeddingProvider).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      config: { from: "provided", resolved: true },
      diagnostics: ["resolved via gateway"],
      registeredBuiltinProviderIds: ["openai", "voyage"],
      availableBuiltinProviderIds: ["openai", "voyage"],
    });
  });

  it("loads config and treats existing built-ins as already registered", async () => {
    memoryEmbeddingProviders.push({ id: "openai" });

    const result = await bootstrapMemoryCoreRuntime({
      commandName: "memory status",
    });

    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(result.config).toEqual({ from: "loadConfig", resolved: true });
    expect(result.registeredBuiltinProviderIds).toEqual(["voyage"]);
    expect(result.availableBuiltinProviderIds).toEqual(["openai", "voyage"]);
  });

  it("returns a defensive copy of the secret target ids", () => {
    const first = getMemoryRuntimeSecretTargetIds();
    first.add("extra");

    expect(getMemoryRuntimeSecretTargetIds()).toEqual(
      new Set([
        "agents.defaults.memorySearch.remote.apiKey",
        "agents.list[].memorySearch.remote.apiKey",
      ]),
    );
  });
});
