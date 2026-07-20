/** Config preflight for doctor: legacy config/state migration, recovery, and snapshot loading. */
import fs from "node:fs/promises";
import path from "node:path";
import { note } from "../../packages/terminal-core/src/note.js";
import type { PluginPayloadSmokeFailure } from "../cli/update-cli/plugin-payload-validation.js";
import {
  readConfigFileSnapshot,
  recoverConfigFromJsonRootSuffix,
  recoverConfigFromLastKnownGood,
} from "../config/io.js";
import { formatConfigIssueLines } from "../config/issue-format.js";
import type { LegacyConfigIssue } from "../config/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { normalizePluginsConfig, resolveEffectiveEnableState } from "../plugins/config-state.js";
import { loadInstalledPluginIndexInstallRecordsSync } from "../plugins/installed-plugin-index-records.js";
import {
  buildDegradedPluginsFromVerificationFailures,
  formatPluginVerificationDiagnostic,
  setActiveDegradedPlugins,
  type DegradedPlugin,
} from "../plugins/runtime-degraded-state.js";
import { resolveHomeDir } from "../utils.js";
import { noteIncludeConfinementWarning } from "./doctor-config-analysis.js";
import { findDoctorLegacyConfigIssues } from "./doctor/shared/legacy-config-issues.js";

type DoctorStateMigrationsModule = typeof import("./doctor-state-migrations.js");
type DoctorCronModule = typeof import("./doctor/cron/index.js");

let doctorStateMigrationsPromise: Promise<DoctorStateMigrationsModule> | null = null;
let doctorCronPromise: Promise<DoctorCronModule> | null = null;

function loadDoctorStateMigrations(): Promise<DoctorStateMigrationsModule> {
  doctorStateMigrationsPromise ??= import("./doctor-state-migrations.js");
  return doctorStateMigrationsPromise;
}

function loadDoctorCron(): Promise<DoctorCronModule> {
  doctorCronPromise ??= import("./doctor/cron/index.js");
  return doctorCronPromise;
}

async function maybeMigrateLegacyConfig(): Promise<string[]> {
  const changes: string[] = [];
  const home = resolveHomeDir();
  if (!home) {
    return changes;
  }

  const targetDir = path.join(home, ".openclaw");
  const targetPath = path.join(targetDir, "openclaw.json");
  try {
    await fs.access(targetPath);
    return changes;
  } catch {
    // missing config
  }

  const legacyCandidates = [path.join(home, ".clawdbot", "clawdbot.json")];

  let legacyPath: string | null = null;
  for (const candidate of legacyCandidates) {
    try {
      await fs.access(candidate);
      legacyPath = candidate;
      break;
    } catch {
      // continue
    }
  }
  if (!legacyPath) {
    return changes;
  }

  await fs.mkdir(targetDir, { recursive: true });
  try {
    await fs.copyFile(legacyPath, targetPath, fs.constants.COPYFILE_EXCL);
    changes.push(`Migrated legacy config: ${legacyPath} -> ${targetPath}`);
  } catch {
    // If it already exists, skip silently.
  }

  return changes;
}

export type DoctorConfigPreflightResult = {
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>;
  baseConfig: OpenClawConfig;
};

function isStartupPluginVerificationFailureActive(params: {
  cfg: OpenClawConfig;
  failure: PluginPayloadSmokeFailure;
}): boolean {
  return resolveEffectiveEnableState({
    id: params.failure.pluginId,
    origin: "global",
    config: normalizePluginsConfig(params.cfg.plugins),
    rootConfig: params.cfg,
  }).enabled;
}

function buildStartupPluginQuarantine(params: {
  cfg: OpenClawConfig;
  failures: readonly PluginPayloadSmokeFailure[];
}): DegradedPlugin[] {
  return buildDegradedPluginsFromVerificationFailures(
    params.failures.filter(
      (failure) =>
        Boolean(failure.installPath) &&
        isStartupPluginVerificationFailureActive({ cfg: params.cfg, failure }),
    ),
  );
}

function formatStartupPluginSmokeFailure(failure: PluginPayloadSmokeFailure): string {
  return `Plugin "${failure.pluginId}": ${formatPluginVerificationDiagnostic({
    kind: "plugin-verification",
    reason: failure.reason,
    detail: failure.detail,
    ...(failure.installPath ? { installPath: failure.installPath } : {}),
  })}. Run \`openclaw update repair\` to retry plugin repair.`;
}

/** Refresh boot-local quarantine using only static reads of native install records and payloads. */
export async function refreshStartupPluginQuarantine(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  quarantinedPlugins: DegradedPlugin[];
  blockingFailures: PluginPayloadSmokeFailure[];
}> {
  const env = params.env ?? process.env;
  setActiveDegradedPlugins([]);
  const { runActivePluginPayloadSmokeCheck } =
    await import("../cli/update-cli/active-plugin-payload-validation.js");
  const smoke = await runActivePluginPayloadSmokeCheck({
    cfg: params.cfg,
    records: loadInstalledPluginIndexInstallRecordsSync({ env }),
    env,
  });
  const quarantinedPlugins = buildStartupPluginQuarantine({
    cfg: params.cfg,
    failures: smoke.failures,
  });
  const blockingFailures = smoke.failures.filter(
    (failure) =>
      !failure.installPath &&
      isStartupPluginVerificationFailureActive({ cfg: params.cfg, failure }),
  );
  setActiveDegradedPlugins(quarantinedPlugins);
  return { quarantinedPlugins, blockingFailures };
}

function collectDoctorLegacyIssues(
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>,
): LegacyConfigIssue[] {
  if (!snapshot.exists) {
    return [];
  }
  const resolvedRaw = snapshot.sourceConfig ?? snapshot.config ?? {};
  const sourceRaw = snapshot.parsed ?? resolvedRaw;
  return findDoctorLegacyConfigIssues(resolvedRaw, sourceRaw);
}

function addDoctorLegacyIssues(
  snapshot: Awaited<ReturnType<typeof readConfigFileSnapshot>>,
): Awaited<ReturnType<typeof readConfigFileSnapshot>> {
  const legacyIssues = collectDoctorLegacyIssues(snapshot);
  if (legacyIssues.length === 0) {
    return snapshot;
  }
  return { ...snapshot, legacyIssues };
}

/** Returns true during updater-managed config rewrites where plugin validation may be stale. */
export function shouldSkipPluginValidationForDoctorConfigPreflight(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isTruthyEnvValue(env.OPENCLAW_UPDATE_IN_PROGRESS);
}

function noteStateMigrationResult(result: { changes: string[]; warnings: string[] }): void {
  if (result.changes.length > 0) {
    note(result.changes.map((entry) => `- ${entry}`).join("\n"), "Doctor changes");
  }
  if (result.warnings.length > 0) {
    note(result.warnings.map((entry) => `- ${entry}`).join("\n"), "Doctor warnings");
  }
}

/**
 * Runs early doctor config checks before the main config repair flow.
 *
 * It may migrate legacy state/config paths, recover corrupt target config when requested, and
 * returns the best-effort config snapshot used by later doctor checks.
 */
export async function runDoctorConfigPreflight(
  options: {
    migrateState?: boolean;
    migrateLegacyConfig?: boolean;
    repairPrefixedConfig?: boolean;
    recoverCorruptTargetStore?: boolean;
    invalidConfigNote?: string | false;
    verifyStartupPluginPayloads?: boolean;
  } = {},
): Promise<DoctorConfigPreflightResult> {
  if (options.migrateState !== false) {
    const { autoMigrateLegacyStateDir } = await loadDoctorStateMigrations();
    const stateDirResult = await autoMigrateLegacyStateDir({ env: process.env });
    noteStateMigrationResult(stateDirResult);
  }

  if (options.migrateLegacyConfig !== false) {
    const legacyConfigChanges = await maybeMigrateLegacyConfig();
    if (legacyConfigChanges.length > 0) {
      note(legacyConfigChanges.map((entry) => `- ${entry}`).join("\n"), "Doctor changes");
    }
  }

  const readOptions = {
    skipPluginValidation: shouldSkipPluginValidationForDoctorConfigPreflight(),
  };
  let snapshot = addDoctorLegacyIssues(await readConfigFileSnapshot(readOptions));
  if (options.repairPrefixedConfig === true && snapshot.exists && !snapshot.valid) {
    if (await recoverConfigFromJsonRootSuffix(snapshot)) {
      note("Removed non-JSON prefix from openclaw.json; original saved as .clobbered.*.", "Config");
      snapshot = addDoctorLegacyIssues(await readConfigFileSnapshot(readOptions));
    } else if (
      await recoverConfigFromLastKnownGood({ snapshot, reason: "doctor-invalid-config" })
    ) {
      note(
        "Restored openclaw.json from last-known-good; original saved as .clobbered.*.",
        "Config",
      );
      snapshot = addDoctorLegacyIssues(await readConfigFileSnapshot(readOptions));
    }
  }
  const invalidConfigNote =
    options.invalidConfigNote ?? "Config invalid; doctor will run with best-effort config.";
  if (
    invalidConfigNote &&
    snapshot.exists &&
    !snapshot.valid &&
    snapshot.legacyIssues.length === 0
  ) {
    note(invalidConfigNote, "Config");
    noteIncludeConfinementWarning(snapshot);
  }

  const warnings = snapshot.warnings ?? [];
  if (warnings.length > 0) {
    note(formatConfigIssueLines(warnings, "-").join("\n"), "Config warnings");
  }

  const baseConfig = snapshot.sourceConfig ?? snapshot.config ?? {};
  if (options.migrateState !== false) {
    if (snapshot.valid) {
      const { repairLegacyCronStoreWithoutPrompt } = await loadDoctorCron();
      const cronResult = await repairLegacyCronStoreWithoutPrompt({ cfg: baseConfig });
      noteStateMigrationResult(cronResult);
    }
    const { autoMigrateLegacyState, autoMigrateLegacyTaskStateSidecars } =
      await loadDoctorStateMigrations();
    const stateResult = snapshot.valid
      ? await autoMigrateLegacyState({
          cfg: baseConfig,
          env: process.env,
          recoverCorruptTargetStore: options.recoverCorruptTargetStore,
        })
      : await autoMigrateLegacyTaskStateSidecars({ env: process.env });
    noteStateMigrationResult(stateResult);
  }

  if (options.verifyStartupPluginPayloads === true && snapshot.valid) {
    const pluginVerification = await refreshStartupPluginQuarantine({
      cfg: baseConfig,
      env: process.env,
    });
    if (pluginVerification.quarantinedPlugins.length > 0) {
      note(
        pluginVerification.quarantinedPlugins
          .map(
            (plugin) =>
              `- ${formatStartupPluginSmokeFailure({
                pluginId: plugin.pluginId,
                reason: plugin.diagnostic.reason,
                detail: plugin.diagnostic.detail,
                ...(plugin.diagnostic.installPath
                  ? { installPath: plugin.diagnostic.installPath }
                  : {}),
              })}`,
          )
          .join("\n"),
        "Doctor warnings",
      );
    }
    if (pluginVerification.blockingFailures.length > 0) {
      throw new Error(
        [
          "OpenClaw plugin verification failed; refusing to report the gateway ready.",
          ...pluginVerification.blockingFailures.map(
            (failure) => `- ${formatStartupPluginSmokeFailure(failure)}`,
          ),
        ].join("\n"),
      );
    }
  }

  return {
    snapshot,
    baseConfig,
  };
}
