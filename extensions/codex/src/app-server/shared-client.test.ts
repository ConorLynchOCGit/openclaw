// Codex tests cover shared client plugin behavior.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocketServer, type RawData } from "ws";
import { CodexAppServerClient, MIN_CODEX_APP_SERVER_VERSION } from "./client.js";
import { codexAppServerStartOptionsKey } from "./config.js";
import { createClientHarness } from "./test-support.js";

const mocks = vi.hoisted(() => ({
  bridgeCodexAppServerStartOptions: vi.fn(async ({ startOptions }) => startOptions),
  applyCodexAppServerAuthProfile: vi.fn(
    async (_params?: { agentDir?: string; authProfileId?: string; config?: unknown }) => undefined,
  ),
  resolveCodexAppServerAuthProfileIdForAgent: vi.fn(
    (params?: { authProfileId?: string }) => params?.authProfileId,
  ),
  resolveCodexAppServerFallbackApiKeyCacheKey: vi.fn(() => undefined as string | undefined),
  resolveManagedCodexAppServerStartOptions: vi.fn(async (startOptions) => startOptions),
  embeddedAgentLog: { debug: vi.fn(), warn: vi.fn() },
  resolveDefaultAgentDir: vi.fn(() => "/tmp/openclaw-agent"),
}));

vi.mock("./auth-bridge.js", () => ({
  applyCodexAppServerAuthProfile: mocks.applyCodexAppServerAuthProfile,
  bridgeCodexAppServerStartOptions: mocks.bridgeCodexAppServerStartOptions,
  resolveCodexAppServerAuthProfileIdForAgent: mocks.resolveCodexAppServerAuthProfileIdForAgent,
  resolveCodexAppServerFallbackApiKeyCacheKey: mocks.resolveCodexAppServerFallbackApiKeyCacheKey,
}));

vi.mock("./managed-binary.js", () => ({
  resolveManagedCodexAppServerStartOptions: mocks.resolveManagedCodexAppServerStartOptions,
}));

vi.mock("openclaw/plugin-sdk/agent-harness-runtime", () => ({
  embeddedAgentLog: mocks.embeddedAgentLog,
  OPENCLAW_VERSION: "test",
}));

vi.mock("openclaw/plugin-sdk/agent-runtime", () => ({
  resolveDefaultAgentDir: mocks.resolveDefaultAgentDir,
}));

let listCodexAppServerModels: typeof import("./models.js").listCodexAppServerModels;
let clearSharedCodexAppServerClient: typeof import("./shared-client.js").clearSharedCodexAppServerClient;
let clearSharedCodexAppServerClientIfCurrent: typeof import("./shared-client.js").clearSharedCodexAppServerClientIfCurrent;
let clearSharedCodexAppServerClientIfCurrentAndWait: typeof import("./shared-client.js").clearSharedCodexAppServerClientIfCurrentAndWait;
let createIsolatedCodexAppServerClient: typeof import("./shared-client.js").createIsolatedCodexAppServerClient;
let detachSharedCodexAppServerClientIfCurrent: typeof import("./shared-client.js").detachSharedCodexAppServerClientIfCurrent;
let getLeasedSharedCodexAppServerClient: typeof import("./shared-client.js").getLeasedSharedCodexAppServerClient;
let getSharedCodexAppServerClient: typeof import("./shared-client.js").getSharedCodexAppServerClient;
let retainSharedCodexAppServerClientIfCurrent: typeof import("./shared-client.js").retainSharedCodexAppServerClientIfCurrent;
let releaseLeasedSharedCodexAppServerClient: typeof import("./shared-client.js").releaseLeasedSharedCodexAppServerClient;
let retireSharedCodexAppServerClientIfCurrent: typeof import("./shared-client.js").retireSharedCodexAppServerClientIfCurrent;
let resetSharedCodexAppServerClientForTests: typeof import("./shared-client.js").resetSharedCodexAppServerClientForTests;

async function sendInitializeResult(
  harness: ReturnType<typeof createClientHarness>,
  userAgent: string,
): Promise<void> {
  await vi.waitFor(() => expect(harness.writes.length).toBeGreaterThanOrEqual(1));
  const initialize = JSON.parse(harness.writes[0] ?? "{}") as { id?: number };
  harness.send({ id: initialize.id, result: { userAgent } });
}

async function sendEmptyModelList(harness: ReturnType<typeof createClientHarness>): Promise<void> {
  await vi.waitFor(() => expect(harness.writes.length).toBeGreaterThanOrEqual(3));
  const modelList = JSON.parse(harness.writes[2] ?? "{}") as { id?: number };
  harness.send({ id: modelList.id, result: { data: [] } });
}

function firstMockArg(mock: unknown, label: string): unknown {
  const call = (mock as { mock?: { calls?: unknown[][] } }).mock?.calls?.at(0);
  if (!call) {
    throw new Error(`Expected ${label} first call`);
  }
  return call[0];
}

function bridgeStartOptionsCall() {
  return firstMockArg(mocks.bridgeCodexAppServerStartOptions, "bridge start options") as {
    agentDir?: string;
    authProfileId?: string;
    config?: unknown;
    startOptions: { command?: string; commandSource?: string };
  };
}

function applyAuthProfileCall() {
  return firstMockArg(mocks.applyCodexAppServerAuthProfile, "apply auth profile") as {
    agentDir?: string;
    authProfileId?: string;
    config?: unknown;
  };
}

function resolveAuthProfileCall() {
  return firstMockArg(mocks.resolveCodexAppServerAuthProfileIdForAgent, "resolve auth profile") as {
    agentDir?: string;
    authProfileId?: string;
    config?: unknown;
  };
}

function managedStartOptionsCall() {
  return firstMockArg(mocks.resolveManagedCodexAppServerStartOptions, "managed start options") as {
    command?: string;
    commandSource?: string;
  };
}

function clientStartCall(startSpy: unknown) {
  return firstMockArg(startSpy, "CodexAppServerClient.start") as {
    command?: string;
    commandSource?: string;
    env?: Record<string, string>;
    clearEnv?: string[];
  };
}

describe("shared Codex app-server client", () => {
  beforeAll(async () => {
    ({ listCodexAppServerModels } = await import("./models.js"));
    ({
      clearSharedCodexAppServerClient,
      clearSharedCodexAppServerClientIfCurrent,
      clearSharedCodexAppServerClientIfCurrentAndWait,
      createIsolatedCodexAppServerClient,
      detachSharedCodexAppServerClientIfCurrent,
      getLeasedSharedCodexAppServerClient,
      getSharedCodexAppServerClient,
      retainSharedCodexAppServerClientIfCurrent,
      releaseLeasedSharedCodexAppServerClient,
      retireSharedCodexAppServerClientIfCurrent,
      resetSharedCodexAppServerClientForTests,
    } = await import("./shared-client.js"));
  });

  afterEach(() => {
    resetSharedCodexAppServerClientForTests();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    mocks.bridgeCodexAppServerStartOptions.mockClear();
    mocks.applyCodexAppServerAuthProfile.mockClear();
    mocks.resolveCodexAppServerAuthProfileIdForAgent.mockClear();
    mocks.resolveCodexAppServerAuthProfileIdForAgent.mockImplementation(
      (params?: { authProfileId?: string }) => params?.authProfileId,
    );
    mocks.resolveCodexAppServerFallbackApiKeyCacheKey.mockClear();
    mocks.resolveCodexAppServerFallbackApiKeyCacheKey.mockReturnValue(undefined);
    mocks.resolveManagedCodexAppServerStartOptions.mockClear();
    mocks.resolveManagedCodexAppServerStartOptions.mockImplementation(
      async (startOptions) => startOptions,
    );
    mocks.embeddedAgentLog.debug.mockClear();
    mocks.embeddedAgentLog.warn.mockClear();
    mocks.resolveDefaultAgentDir.mockClear();
  });

  it("closes the shared app-server when the version gate fails", async () => {
    const harness = createClientHarness();
    const startSpy = vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);

    // Model discovery uses the shared-client path, which owns child teardown
    // when initialize discovers an unsupported app-server.
    const listPromise = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(harness, "openclaw/0.117.9 (macOS; test)");

    await expect(listPromise).rejects.toThrow(
      `Codex app-server ${MIN_CODEX_APP_SERVER_VERSION} or newer is required`,
    );
    expect(harness.process.stdin.destroyed).toBe(true);
    startSpy.mockRestore();
  });

  it("closes and clears a shared app-server when initialize times out", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    const startSpy = vi
      .spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    await expect(listCodexAppServerModels({ timeoutMs: 5 })).rejects.toThrow(
      "codex app-server initialize timed out",
    );
    expect(first.process.stdin.destroyed).toBe(true);

    const secondList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);

    await expect(secondList).resolves.toEqual({ models: [] });
    expect(startSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps a pending shared app-server alive when another acquire still owns startup", async () => {
    const harness = createClientHarness();
    const abandonController = new AbortController();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);

    const abandonedAcquire = getSharedCodexAppServerClient({
      timeoutMs: 1000,
      abandonSignal: abandonController.signal,
    });
    const activeAcquire = getSharedCodexAppServerClient({ timeoutMs: 1000 });
    await vi.waitFor(() => expect(harness.writes.length).toBeGreaterThanOrEqual(1));

    abandonController.abort();
    expect(harness.process.stdin.destroyed).toBe(false);

    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");

    await expect(abandonedAcquire).resolves.toBe(harness.client);
    await expect(activeAcquire).resolves.toBe(harness.client);
    expect(harness.process.stdin.destroyed).toBe(false);
  });

  it("does not wait for isolated initialize after a timeout closes the client", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);

    await expect(createIsolatedCodexAppServerClient({ timeoutMs: 5 })).rejects.toThrow(
      "codex app-server initialize timed out",
    );
    expect(harness.process.stdin.destroyed).toBe(true);
  });

  it("passes the selected auth profile through the bridge helper", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);

    const listPromise = listCodexAppServerModels({
      timeoutMs: 1000,
      authProfileId: "openai:work",
    });
    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(harness);

    await expect(listPromise).resolves.toEqual({ models: [] });
    const bridgeCall = bridgeStartOptionsCall();
    expect(bridgeCall?.authProfileId).toBe("openai:work");
    const applyCall = applyAuthProfileCall();
    expect(applyCall?.authProfileId).toBe("openai:work");
  });

  it("starts system Codex with a generation-scoped home and default-deny environment", async () => {
    const harness = createClientHarness();
    const startSpy = vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-system-codex-home-"));
    const codexHome = path.join(tempRoot, "generation-a");
    const packageCacheRoot = path.join(codexHome, "package-cache");
    const npmCache = path.join(packageCacheRoot, "npm");
    const pnpmStore = path.join(packageCacheRoot, "pnpm-store");
    const ambientNpmCache = "/srv/openclaw-next/.npm";
    vi.stubEnv("LANG", "C.UTF-8");
    vi.stubEnv("OPENAI_API_KEY", "provider-secret");
    vi.stubEnv("OPENCLAW_GATEWAY_TOKEN", "gateway-secret");
    vi.stubEnv("DATABASE_URL", "database-secret");
    vi.stubEnv("NPM_CONFIG_CACHE", ambientNpmCache);
    vi.stubEnv("npm_config_cache", ambientNpmCache);
    vi.stubEnv("COREPACK_HOME", "/srv/openclaw-next/.corepack");

    try {
      const clientPromise = getSharedCodexAppServerClient({
        timeoutMs: 1000,
        startOptions: {
          transport: "stdio",
          command: "codex",
          args: ["app-server"],
          headers: {},
          env: {
            OPENROUTER_API_KEY: "unrelated-provider-secret",
            OPENCLAW_GATEWAY_TOKEN: "configured-gateway-secret",
            NPM_CONFIG_CACHE: ambientNpmCache,
          },
          clearEnv: ["PATH", "HOME", "LANG"],
        },
        processProfile: {
          key: "generation-a:auth-a:sandbox-a:env-a",
          expectedServerVersion: "0.144.1",
          codexHome,
        },
      });
      await sendInitializeResult(harness, "openclaw/0.144.1 (linux; test)");

      await expect(clientPromise).resolves.toBe(harness.client);
      const startCall = clientStartCall(startSpy);
      expect(startCall.env).toMatchObject({
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        CODEX_HOME: codexHome,
        HOME: codexHome,
        LANG: "C.UTF-8",
        OPENCLAW_HEAVY_CHECK_LOCK_SCOPE: "worktree",
        XDG_CACHE_HOME: path.join(packageCacheRoot, "xdg"),
        COREPACK_HOME: path.join(packageCacheRoot, "corepack"),
        NPM_CONFIG_CACHE: npmCache,
        npm_config_cache: npmCache,
        PNPM_HOME: path.join(packageCacheRoot, "pnpm-home"),
        PNPM_CONFIG_STORE_DIR: pnpmStore,
        npm_config_store_dir: pnpmStore,
        pnpm_config_store_dir: pnpmStore,
        PNPM_STORE_PATH: pnpmStore,
      });
      expect(startCall.clearEnv).toEqual(
        expect.arrayContaining([
          "DATABASE_URL",
          "OPENAI_API_KEY",
          "OPENCLAW_GATEWAY_TOKEN",
          "OPENROUTER_API_KEY",
        ]),
      );
      expect(startCall.clearEnv).not.toEqual(expect.arrayContaining(["PATH", "HOME", "LANG"]));
      expect(JSON.stringify(startCall.env)).not.toContain("secret");
      expect(Object.values(startCall.env ?? {})).not.toContain(ambientNpmCache);

      for (const directory of [
        codexHome,
        packageCacheRoot,
        path.join(packageCacheRoot, "xdg"),
        path.join(packageCacheRoot, "corepack"),
        npmCache,
        path.join(packageCacheRoot, "pnpm-home"),
        pnpmStore,
      ]) {
        expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
        await fs.writeFile(path.join(directory, ".writable-cache-proof"), "ok");
      }
      expect(harness.writes.some((line) => line.includes("skills/extraRoots/set"))).toBe(false);
    } finally {
      resetSharedCodexAppServerClientForTests();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects a system process whose initialized server version is not exact", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-system-version-home-"));
    try {
      const clientPromise = getSharedCodexAppServerClient({
        timeoutMs: 1000,
        processProfile: {
          key: "generation-a:auth-a:sandbox-a:env-a",
          expectedServerVersion: "0.144.1",
          codexHome: path.join(tempRoot, "generation-a"),
        },
      });
      await sendInitializeResult(harness, "openclaw/0.144.0 (linux; test)");

      await expect(clientPromise).rejects.toThrow(
        "Codex app-server version mismatch: expected 0.144.1, observed 0.144.0",
      );
      expect(harness.process.stdin.destroyed).toBe(true);
    } finally {
      resetSharedCodexAppServerClientForTests();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("skips target auth resolution when native source auth is requested", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);
    const config = { auth: { order: { openai: ["openai:target"] } } };

    const clientPromise = getSharedCodexAppServerClient({
      timeoutMs: 1000,
      authProfileId: null,
      agentDir: "/tmp/openclaw-target-agent",
      config,
    });
    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");

    await expect(clientPromise).resolves.toBe(harness.client);
    expect(mocks.resolveCodexAppServerAuthProfileIdForAgent).not.toHaveBeenCalled();
    const bridgeCall = bridgeStartOptionsCall();
    expect(bridgeCall.agentDir).toBe("/tmp/openclaw-target-agent");
    expect(bridgeCall.authProfileId).toBeNull();
    expect(bridgeCall.config).toBe(config);
    const applyCall = applyAuthProfileCall();
    expect(applyCall.agentDir).toBe("/tmp/openclaw-target-agent");
    expect(applyCall.authProfileId).toBeNull();
    expect(applyCall.config).toBe(config);
  });

  it("resolves the configured implicit auth profile before sharing a client", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);
    const config = { auth: { order: { openai: ["openai:work"] } } };
    mocks.resolveCodexAppServerAuthProfileIdForAgent.mockReturnValue("openai:work");

    const listPromise = listCodexAppServerModels({
      timeoutMs: 1000,
      config,
    });
    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(harness);

    await expect(listPromise).resolves.toEqual({ models: [] });
    const resolveCall = resolveAuthProfileCall();
    expect(resolveCall).toStrictEqual({
      authProfileId: undefined,
      agentDir: "/tmp/openclaw-agent",
      config,
    });
    const bridgeCall = bridgeStartOptionsCall();
    expect(bridgeCall?.authProfileId).toBe("openai:work");
    expect(bridgeCall?.config).toBe(config);
    const applyCall = applyAuthProfileCall();
    expect(applyCall?.authProfileId).toBe("openai:work");
    expect(applyCall?.config).toBe(config);
  });

  it("uses the selected agent dir for shared app-server auth bridging", async () => {
    const harness = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);

    const listPromise = listCodexAppServerModels({
      timeoutMs: 1000,
      authProfileId: "openai:work",
      agentDir: "/tmp/openclaw-agent-nova",
    });
    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(harness);

    await expect(listPromise).resolves.toEqual({ models: [] });
    const bridgeCall = bridgeStartOptionsCall();
    expect(bridgeCall?.agentDir).toBe("/tmp/openclaw-agent-nova");
    expect(bridgeCall?.authProfileId).toBe("openai:work");
    const applyCall = applyAuthProfileCall();
    expect(applyCall?.agentDir).toBe("/tmp/openclaw-agent-nova");
    expect(applyCall?.authProfileId).toBe("openai:work");
  });

  it("migrates legacy singleton global state into the keyed registry", async () => {
    const legacy = createClientHarness();
    const next = createClientHarness();
    const startOptions = {
      transport: "websocket" as const,
      command: "codex",
      args: [],
      url: "ws://127.0.0.1:39175",
      authToken: "tok-legacy",
      headers: {},
    };
    const key = codexAppServerStartOptionsKey(startOptions, {
      agentDir: "/tmp/openclaw-agent",
    });
    const globalState = globalThis as typeof globalThis & {
      [key: symbol]: unknown;
    };
    globalState[Symbol.for("openclaw.codexAppServerClientState")] = {
      key,
      client: legacy.client,
      promise: Promise.resolve(legacy.client),
    };

    await expect(getSharedCodexAppServerClient({ startOptions })).resolves.toBe(legacy.client);

    legacy.client.close();
    const startSpy = vi.spyOn(CodexAppServerClient, "start").mockReturnValue(next.client);
    const list = listCodexAppServerModels({ timeoutMs: 1000, startOptions });
    await sendInitializeResult(next, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(next);

    await expect(list).resolves.toEqual({ models: [] });
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves keyed shared-client state when adding lease metadata", async () => {
    const legacy = createClientHarness();
    const startOptions = {
      transport: "websocket" as const,
      command: "codex",
      args: [],
      url: "ws://127.0.0.1:39176",
      authToken: "tok-keyed",
      headers: {},
    };
    const key = codexAppServerStartOptionsKey(startOptions, {
      agentDir: "/tmp/openclaw-agent",
    });
    const globalState = globalThis as typeof globalThis & {
      [key: symbol]: unknown;
    };
    globalState[Symbol.for("openclaw.codexAppServerClientState")] = {
      clients: new Map([[key, { client: legacy.client, promise: Promise.resolve(legacy.client) }]]),
    };

    await expect(getLeasedSharedCodexAppServerClient({ startOptions })).resolves.toBe(
      legacy.client,
    );
    expect(retireSharedCodexAppServerClientIfCurrent(legacy.client)).toEqual({
      activeLeases: 1,
      closed: false,
    });
    expect(legacy.process.stdin.destroyed).toBe(false);

    expect(releaseLeasedSharedCodexAppServerClient(legacy.client)).toBe(true);
    expect(legacy.process.stdin.destroyed).toBe(true);
  });

  it("keeps an active shared client alive when another agent dir uses a different key", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    const startSpy = vi
      .spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({
      timeoutMs: 1000,
      agentDir: "/tmp/openclaw-agent-one",
    });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    const secondList = listCodexAppServerModels({
      timeoutMs: 1000,
      agentDir: "/tmp/openclaw-agent-two",
    });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(first.process.stdin.destroyed).toBe(false);
    expect(second.process.stdin.destroyed).toBe(false);
  });

  it("resolves the managed binary before bridging and spawning the shared client", async () => {
    const harness = createClientHarness();
    const startSpy = vi.spyOn(CodexAppServerClient, "start").mockReturnValue(harness.client);
    mocks.resolveManagedCodexAppServerStartOptions.mockImplementationOnce(async (startOptions) => ({
      ...startOptions,
      command: "/cache/openclaw/codex",
      commandSource: "resolved-managed",
    }));

    const listPromise = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(harness, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(harness);

    await expect(listPromise).resolves.toEqual({ models: [] });
    const managedCall = managedStartOptionsCall();
    expect(managedCall?.command).toBe("codex");
    expect(managedCall?.commandSource).toBe("managed");
    const bridgeCall = bridgeStartOptionsCall();
    expect(bridgeCall?.startOptions.command).toBe("/cache/openclaw/codex");
    expect(bridgeCall?.startOptions.commandSource).toBe("resolved-managed");
    const startCall = clientStartCall(startSpy);
    expect(startCall?.command).toBe("/cache/openclaw/codex");
    expect(startCall?.commandSource).toBe("resolved-managed");
  });

  it("starts an independent shared client when the bridged auth token changes", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    const startSpy = vi
      .spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({
      timeoutMs: 1000,
      startOptions: {
        transport: "websocket",
        command: "codex",
        args: [],
        url: "ws://127.0.0.1:39175",
        authToken: "tok-first",
        headers: {},
      },
    });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    const secondList = listCodexAppServerModels({
      timeoutMs: 1000,
      startOptions: {
        transport: "websocket",
        command: "codex",
        args: [],
        url: "ws://127.0.0.1:39175",
        authToken: "tok-second",
        headers: {},
      },
    });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(first.process.stdin.destroyed).toBe(false);
  });

  it("starts an independent shared client when fallback api-key auth changes", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    const startSpy = vi
      .spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);
    mocks.resolveCodexAppServerFallbackApiKeyCacheKey
      .mockReturnValueOnce("api-key:first")
      .mockReturnValueOnce("api-key:second");

    const firstList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    const secondList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(first.process.stdin.destroyed).toBe(false);
    expect(second.process.stdin.destroyed).toBe(false);
  });

  it("does not let one shared-client failure tear down another keyed client", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({
      timeoutMs: 1000,
      startOptions: {
        transport: "websocket",
        command: "codex",
        args: [],
        url: "ws://127.0.0.1:39175",
        authToken: "tok-first",
        headers: {},
      },
    });
    const firstFailure = firstList.catch((error: unknown) => error);
    await vi.waitFor(() => expect(first.writes.length).toBeGreaterThanOrEqual(1));

    const secondList = listCodexAppServerModels({
      timeoutMs: 1000,
      startOptions: {
        transport: "websocket",
        command: "codex",
        args: [],
        url: "ws://127.0.0.1:39175",
        authToken: "tok-second",
        headers: {},
      },
    });
    await vi.waitFor(() => expect(second.writes.length).toBeGreaterThanOrEqual(1));

    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    first.client.close();
    await expect(firstFailure).resolves.toBeInstanceOf(Error);

    expect(second.process.kill).not.toHaveBeenCalled();
  });

  it("only clears the shared client that is still current", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    expect(clearSharedCodexAppServerClientIfCurrent(first.client)).toBe(true);
    expect(first.process.stdin.destroyed).toBe(true);

    const secondList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    expect(clearSharedCodexAppServerClientIfCurrent(first.client)).toBe(false);
    expect(second.process.kill).not.toHaveBeenCalled();
    expect(clearSharedCodexAppServerClientIfCurrent(second.client)).toBe(true);
    expect(second.process.stdin.destroyed).toBe(true);
  });

  it("can detach the current shared client without closing it", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    expect(detachSharedCodexAppServerClientIfCurrent(first.client)).toBe(true);
    expect(first.process.stdin.destroyed).toBe(false);

    const secondList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    expect(detachSharedCodexAppServerClientIfCurrent(first.client)).toBe(false);
    first.client.close();
    expect(first.process.stdin.destroyed).toBe(true);
    expect(second.process.kill).not.toHaveBeenCalled();
    expect(detachSharedCodexAppServerClientIfCurrent(second.client)).toBe(true);
    second.client.close();
    expect(second.process.stdin.destroyed).toBe(true);
  });

  it("closes a retired shared app-server after all active leases release", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);

    const firstList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    const releaseFirst = retainSharedCodexAppServerClientIfCurrent(first.client);
    const releaseSecond = retainSharedCodexAppServerClientIfCurrent(first.client);
    expect(releaseFirst).toBeTypeOf("function");
    expect(releaseSecond).toBeTypeOf("function");
    expect(retireSharedCodexAppServerClientIfCurrent(first.client)).toEqual({
      activeLeases: 2,
      closed: false,
    });
    expect(first.process.stdin.destroyed).toBe(false);

    const secondList = listCodexAppServerModels({ timeoutMs: 1000 });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    releaseFirst?.();
    expect(first.process.stdin.destroyed).toBe(false);
    releaseSecond?.();
    expect(first.process.stdin.destroyed).toBe(true);
    expect(second.process.kill).not.toHaveBeenCalled();
    expect(retireSharedCodexAppServerClientIfCurrent(second.client)).toEqual({
      activeLeases: 0,
      closed: true,
    });
    expect(second.process.stdin.destroyed).toBe(true);
  });

  it("leases shared app-server clients before returning concurrent acquirers", async () => {
    const first = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start").mockReturnValueOnce(first.client);

    const firstLease = getLeasedSharedCodexAppServerClient({ timeoutMs: 1000 });
    const secondLease = getLeasedSharedCodexAppServerClient({ timeoutMs: 1000 });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await expect(firstLease).resolves.toBe(first.client);
    await expect(secondLease).resolves.toBe(first.client);

    expect(retireSharedCodexAppServerClientIfCurrent(first.client)).toEqual({
      activeLeases: 2,
      closed: false,
    });
    expect(retireSharedCodexAppServerClientIfCurrent(first.client)).toEqual({
      activeLeases: 2,
      closed: false,
    });
    expect(first.process.stdin.destroyed).toBe(false);

    expect(releaseLeasedSharedCodexAppServerClient(first.client)).toBe(true);
    expect(first.process.stdin.destroyed).toBe(false);
    expect(releaseLeasedSharedCodexAppServerClient(first.client)).toBe(true);
    expect(first.process.stdin.destroyed).toBe(true);
    expect(releaseLeasedSharedCodexAppServerClient(first.client)).toBe(false);
  });

  it("waits only for the shared client that is still current", async () => {
    const first = createClientHarness();
    const second = createClientHarness();
    vi.spyOn(CodexAppServerClient, "start")
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);
    const firstCloseAndWait = vi.spyOn(first.client, "closeAndWait");
    const secondCloseAndWait = vi.spyOn(second.client, "closeAndWait");

    const firstList = listCodexAppServerModels({
      timeoutMs: 1000,
      agentDir: "/tmp/openclaw-agent-one",
    });
    await sendInitializeResult(first, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(first);
    await expect(firstList).resolves.toEqual({ models: [] });

    const secondList = listCodexAppServerModels({
      timeoutMs: 1000,
      agentDir: "/tmp/openclaw-agent-two",
    });
    await sendInitializeResult(second, "openclaw/0.125.0 (macOS; test)");
    await sendEmptyModelList(second);
    await expect(secondList).resolves.toEqual({ models: [] });

    await expect(
      clearSharedCodexAppServerClientIfCurrentAndWait(first.client, {
        exitTimeoutMs: 25,
        forceKillDelayMs: 5,
      }),
    ).resolves.toBe(true);

    expect(firstCloseAndWait).toHaveBeenCalledTimes(1);
    expect(secondCloseAndWait).not.toHaveBeenCalled();
    expect(first.process.stdin.destroyed).toBe(true);
    expect(second.process.stdin.destroyed).toBe(false);
  });

  it("uses a fresh websocket Authorization header after shared-client token rotation", async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const authHeaders: Array<string | undefined> = [];
    server.on("connection", (socket, request) => {
      authHeaders.push(request.headers.authorization);
      socket.on("message", (data) => {
        const message = JSON.parse(rawDataToText(data)) as { id?: number; method?: string };
        if (message.method === "initialize") {
          socket.send(
            JSON.stringify({ id: message.id, result: { userAgent: "openclaw/0.125.0" } }),
          );
          return;
        }
        if (message.method === "model/list") {
          socket.send(JSON.stringify({ id: message.id, result: { data: [] } }));
        }
      });
    });

    try {
      await new Promise<void>((resolve) => {
        server.once("listening", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected websocket test server port");
      }
      const url = `ws://127.0.0.1:${address.port}`;

      await expect(
        listCodexAppServerModels({
          timeoutMs: 1000,
          startOptions: {
            transport: "websocket",
            command: "codex",
            args: [],
            url,
            authToken: "tok-first",
            headers: {},
          },
        }),
      ).resolves.toEqual({ models: [] });
      await expect(
        listCodexAppServerModels({
          timeoutMs: 1000,
          startOptions: {
            transport: "websocket",
            command: "codex",
            args: [],
            url,
            authToken: "tok-second",
            headers: {},
          },
        }),
      ).resolves.toEqual({ models: [] });

      expect(authHeaders).toEqual(["Bearer tok-first", "Bearer tok-second"]);
    } finally {
      clearSharedCodexAppServerClient();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

function rawDataToText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data)).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}
