import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CODEX_APP_SERVER_CONFIG_KEYS,
  readCodexPluginConfig,
  resolveCodexAppServerRuntimeOptions,
} from "./config.js";

describe("Codex app-server config", () => {
  it("parses typed plugin config before falling back to environment knobs", () => {
    const runtime = resolveCodexAppServerRuntimeOptions({
      pluginConfig: {
        appServer: {
          transport: "websocket",
          url: "ws://127.0.0.1:39175",
          headers: { "X-Test": "yes" },
          approvalPolicy: "on-request",
          sandbox: "danger-full-access",
          approvalsReviewer: "guardian_subagent",
          serviceTier: "priority",
        },
      },
      env: {
        OPENCLAW_CODEX_APP_SERVER_APPROVAL_POLICY: "never",
        OPENCLAW_CODEX_APP_SERVER_SANDBOX: "read-only",
      },
    });

    expect(runtime).toEqual(
      expect.objectContaining({
        approvalPolicy: "on-request",
        sandbox: "danger-full-access",
        approvalsReviewer: "guardian_subagent",
        serviceTier: "priority",
        start: expect.objectContaining({
          transport: "websocket",
          url: "ws://127.0.0.1:39175",
          headers: { "X-Test": "yes" },
        }),
      }),
    );
  });

  it("rejects malformed plugin config instead of treating freeform strings as control values", () => {
    expect(
      readCodexPluginConfig({
        appServer: {
          approvalPolicy: "always",
        },
      }),
    ).toEqual({});
  });

  it("reads service tier from the environment when plugin config does not set one", () => {
    const runtime = resolveCodexAppServerRuntimeOptions({
      pluginConfig: {
        appServer: {
          approvalPolicy: "never",
          sandbox: "workspace-write",
        },
      },
      env: {
        OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER: "priority",
      },
    });

    expect(runtime.serviceTier).toBe("priority");
  });

  it("runs the Codex app-server inside the OpenClaw-owned runtime home", () => {
    const runtime = resolveCodexAppServerRuntimeOptions({
      env: {
        HOME: "/home/node",
        OPENCLAW_RUNTIME_HOME: "/home/node/.openclaw/runtime",
        CODEX_HOME: "/root/.codex",
      },
    });

    expect(runtime.start.env).toEqual(
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

  it("requires a websocket url when websocket transport is configured", () => {
    expect(() =>
      resolveCodexAppServerRuntimeOptions({
        pluginConfig: { appServer: { transport: "websocket" } },
        env: {},
      }),
    ).toThrow("appServer.url is required");
  });

  it("keeps runtime config keys aligned with manifest schema and UI hints", async () => {
    const manifest = JSON.parse(
      await fs.readFile(new URL("../../openclaw.plugin.json", import.meta.url), "utf8"),
    ) as {
      configSchema: {
        properties: {
          appServer: { properties: Record<string, unknown> };
        };
      };
      uiHints: Record<string, unknown>;
    };
    const manifestKeys = Object.keys(
      manifest.configSchema.properties.appServer.properties,
    ).toSorted();

    expect(manifestKeys).toEqual([...CODEX_APP_SERVER_CONFIG_KEYS].toSorted());
    for (const key of CODEX_APP_SERVER_CONFIG_KEYS) {
      expect(manifest.uiHints[`appServer.${key}`]).toBeTruthy();
    }
  });
});
