import { describe, expect, it } from "vitest";
import { withTempHome, writeStateDirDotEnv } from "../config/test-helpers.js";
import { asConfig, setupSecretsRuntimeSnapshotTestHooks } from "./runtime.test-support.ts";

const EMPTY_LOADABLE_PLUGIN_ORIGINS = new Map();
const { prepareSecretsRuntimeSnapshot } = setupSecretsRuntimeSnapshotTestHooks();

describe("secrets runtime snapshot", () => {
  it("resolves sandbox ssh secret refs for active ssh backends", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        agents: {
          defaults: {
            sandbox: {
              mode: "all",
              backend: "ssh",
              ssh: {
                target: "peter@example.com:22",
                identityData: { source: "env", provider: "default", id: "SSH_IDENTITY_DATA" },
                certificateData: {
                  source: "env",
                  provider: "default",
                  id: "SSH_CERTIFICATE_DATA",
                },
                knownHostsData: {
                  source: "env",
                  provider: "default",
                  id: "SSH_KNOWN_HOSTS_DATA",
                },
              },
            },
          },
        },
      }),
      env: {
        SSH_IDENTITY_DATA: "PRIVATE KEY",
        SSH_CERTIFICATE_DATA: "SSH CERT",
        SSH_KNOWN_HOSTS_DATA: "example.com ssh-ed25519 AAAATEST",
      },
      includeAuthStoreRefs: false,
      loadablePluginOrigins: EMPTY_LOADABLE_PLUGIN_ORIGINS,
    });

    expect(snapshot.config.agents?.defaults?.sandbox?.ssh).toMatchObject({
      identityData: "PRIVATE KEY",
      certificateData: "SSH CERT",
      knownHostsData: "example.com ssh-ed25519 AAAATEST",
    });
  });

  it("treats sandbox ssh secret refs as inactive when ssh backend is not selected", async () => {
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        agents: {
          defaults: {
            sandbox: {
              mode: "all",
              backend: "docker",
              ssh: {
                identityData: { source: "env", provider: "default", id: "SSH_IDENTITY_DATA" },
              },
            },
          },
        },
      }),
      env: {},
      includeAuthStoreRefs: false,
      loadablePluginOrigins: EMPTY_LOADABLE_PLUGIN_ORIGINS,
    });

    expect(snapshot.config.agents?.defaults?.sandbox?.ssh?.identityData).toEqual({
      source: "env",
      provider: "default",
      id: "SSH_IDENTITY_DATA",
    });
    expect(snapshot.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SECRETS_REF_IGNORED_INACTIVE_SURFACE",
          path: "agents.defaults.sandbox.ssh.identityData",
        }),
      ]),
    );
  });

  it("fails when an active exec ref id contains traversal segments", async () => {
    await expect(
      prepareSecretsRuntimeSnapshot({
        config: asConfig({
          talk: {
            apiKey: { source: "exec", provider: "vault", id: "a/../b" },
          },
          secrets: {
            providers: {
              vault: {
                source: "exec",
                command: process.execPath,
              },
            },
          },
        }),
        env: {},
        includeAuthStoreRefs: false,
        agentDirs: ["/tmp/openclaw-agent-main"],
        loadAuthStore: () => ({ version: 1, profiles: {} }),
        loadablePluginOrigins: EMPTY_LOADABLE_PLUGIN_ORIGINS,
      }),
    ).rejects.toThrow(/must not include "\." or "\.\." path segments/i);
  });

  it("loads state-dir dotenv vars when explicit env is omitted", async () => {
    await withTempHome(async () => {
      await writeStateDirDotEnv("BRAVE_API_KEY=brave-key-from-state-dir\n", {
        env: process.env,
      });

      const snapshot = await prepareSecretsRuntimeSnapshot({
        config: asConfig({
          tools: {
            web: {
              search: {
                provider: "brave",
              },
            },
          },
          plugins: {
            entries: {
              brave: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: { source: "env", provider: "default", id: "BRAVE_API_KEY" },
                  },
                },
              },
            },
          },
        }),
        includeAuthStoreRefs: false,
        loadablePluginOrigins: EMPTY_LOADABLE_PLUGIN_ORIGINS,
      });

      expect(
        (
          snapshot.config.plugins?.entries?.brave?.config as
            | { webSearch?: { apiKey?: unknown } }
            | undefined
        )?.webSearch?.apiKey,
      ).toBe("brave-key-from-state-dir");
      expect(snapshot.webTools.search.selectedProvider).toBe("brave");
      expect(snapshot.webTools.search.selectedProviderKeySource).toBe("secretRef");
    });
  });
});
