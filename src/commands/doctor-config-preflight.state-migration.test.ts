// Doctor config preflight tests cover state migration preflight behavior before config repair.
import { describe, expect, it, vi } from "vitest";
import {
  listActiveDegradedPlugins,
  setActiveDegradedPlugins,
} from "../plugins/runtime-degraded-state.js";

const autoMigrateLegacyStateDir = vi.hoisted(() =>
  vi.fn(async () => ({ migrated: false, skipped: false, changes: [], warnings: [] })),
);
const autoMigrateLegacyState = vi.hoisted(() =>
  vi.fn(async () => ({ migrated: true, skipped: false, changes: ["imported"], warnings: [] })),
);
const autoMigrateLegacyTaskStateSidecars = vi.hoisted(() =>
  vi.fn(async () => ({ migrated: true, skipped: false, changes: ["task-imported"], warnings: [] })),
);
const repairLegacyCronStoreWithoutPrompt = vi.hoisted(() =>
  vi.fn(async () => ({ changes: ["cron-imported"], warnings: [] })),
);
const readConfigFileSnapshot = vi.hoisted(() =>
  vi.fn(async () => ({
    exists: true,
    valid: true,
    config: { gateway: { mode: "local", port: 19091 } } as Record<string, unknown>,
    sourceConfig: { gateway: { mode: "local", port: 19091 } } as Record<string, unknown>,
    legacyIssues: [] as Array<{ path: string; message: string }>,
    warnings: [] as Array<{ path: string; message: string }>,
    issues: [] as Array<{ path: string; message: string }>,
  })),
);
const note = vi.hoisted(() => vi.fn());
const loadInstalledPluginIndexInstallRecordsSync = vi.hoisted(() => vi.fn(() => ({})));
const runActivePluginPayloadSmokeCheck = vi.hoisted(() =>
  vi.fn(async () => ({ checked: [] as string[], failures: [] as Array<Record<string, unknown>> })),
);

vi.mock("./doctor-state-migrations.js", () => ({
  autoMigrateLegacyState,
  autoMigrateLegacyStateDir,
  autoMigrateLegacyTaskStateSidecars,
}));

vi.mock("./doctor/cron/index.js", () => ({
  repairLegacyCronStoreWithoutPrompt,
}));

vi.mock("../config/io.js", () => ({
  readConfigFileSnapshot,
  recoverConfigFromJsonRootSuffix: vi.fn(),
  recoverConfigFromLastKnownGood: vi.fn(),
}));

vi.mock("../../packages/terminal-core/src/note.js", () => ({ note }));

vi.mock("../plugins/installed-plugin-index-records.js", () => ({
  loadInstalledPluginIndexInstallRecordsSync,
}));

vi.mock("../cli/update-cli/active-plugin-payload-validation.js", () => ({
  runActivePluginPayloadSmokeCheck,
}));

const { refreshStartupPluginQuarantine, runDoctorConfigPreflight } =
  await import("./doctor-config-preflight.js");

describe("runDoctorConfigPreflight state migration", () => {
  it("runs full state migrations after reading the config snapshot", async () => {
    await runDoctorConfigPreflight({
      migrateLegacyConfig: false,
      invalidConfigNote: false,
    });

    expect(autoMigrateLegacyStateDir).toHaveBeenCalledOnce();
    expect(readConfigFileSnapshot).toHaveBeenCalledOnce();
    expect(repairLegacyCronStoreWithoutPrompt).toHaveBeenCalledWith({
      cfg: { gateway: { mode: "local", port: 19091 } },
    });
    expect(autoMigrateLegacyState).toHaveBeenCalledWith({
      cfg: { gateway: { mode: "local", port: 19091 } },
      env: process.env,
      recoverCorruptTargetStore: undefined,
    });
    expect(note).toHaveBeenCalledWith("- cron-imported", "Doctor changes");
    expect(note).toHaveBeenCalledWith("- imported", "Doctor changes");
  });

  it("passes explicit corrupt-target recovery to state migrations", async () => {
    vi.clearAllMocks();

    await runDoctorConfigPreflight({
      migrateLegacyConfig: false,
      invalidConfigNote: false,
      recoverCorruptTargetStore: true,
    });

    expect(autoMigrateLegacyState).toHaveBeenCalledWith({
      cfg: { gateway: { mode: "local", port: 19091 } },
      env: process.env,
      recoverCorruptTargetStore: true,
    });
  });

  it("limits invalid-config preflight to config-independent state migration", async () => {
    vi.clearAllMocks();
    readConfigFileSnapshot.mockResolvedValueOnce({
      exists: true,
      valid: false,
      config: {},
      sourceConfig: {},
      legacyIssues: [],
      warnings: [],
      issues: [{ path: "gateway", message: "invalid" }],
    });

    await runDoctorConfigPreflight({
      migrateLegacyConfig: false,
      invalidConfigNote: false,
    });

    expect(autoMigrateLegacyState).not.toHaveBeenCalled();
    expect(repairLegacyCronStoreWithoutPrompt).not.toHaveBeenCalled();
    expect(autoMigrateLegacyTaskStateSidecars).toHaveBeenCalledWith({ env: process.env });
    expect(note).toHaveBeenCalledWith("- task-imported", "Doctor changes");
  });

  it("refreshes startup quarantine with static verification only", async () => {
    vi.clearAllMocks();
    setActiveDegradedPlugins([]);
    const cfg = {
      plugins: { entries: { discord: { enabled: true } } },
    };
    const records = {
      discord: { source: "npm" as const, installPath: "/plugins/discord" },
    };
    loadInstalledPluginIndexInstallRecordsSync.mockReturnValueOnce(records);
    runActivePluginPayloadSmokeCheck.mockResolvedValueOnce({
      checked: ["discord"],
      failures: [
        {
          pluginId: "discord",
          installPath: "/plugins/discord",
          reason: "missing-main-entry",
          detail: "dist/index.js is missing",
        },
      ],
    });

    const result = await refreshStartupPluginQuarantine({ cfg, env: { OPENCLAW_STATE_DIR: "/s" } });

    expect(loadInstalledPluginIndexInstallRecordsSync).toHaveBeenCalledWith({
      env: { OPENCLAW_STATE_DIR: "/s" },
    });
    expect(runActivePluginPayloadSmokeCheck).toHaveBeenCalledWith({
      cfg,
      records,
      env: { OPENCLAW_STATE_DIR: "/s" },
    });
    expect(result.blockingFailures).toEqual([]);
    expect(listActiveDegradedPlugins()).toMatchObject([
      {
        pluginId: "discord",
        state: "configured-unavailable",
        diagnostic: { reason: "missing-main-entry" },
      },
    ]);
    expect(autoMigrateLegacyState).not.toHaveBeenCalled();
    expect(repairLegacyCronStoreWithoutPrompt).not.toHaveBeenCalled();
    setActiveDegradedPlugins([]);
  });
});
