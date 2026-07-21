import path from "node:path";
// Bundled health checks define built-in doctor checks for runtime readiness.
import { asOptionalObjectRecord as readRecord } from "@openclaw/normalization-core/record-coerce";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { tryLoadActivatedBundledPluginPublicSurfaceModuleSync } from "../plugin-sdk/facade-runtime.js";
import { normalizePluginsConfig } from "../plugins/config-state.js";
import { passesManifestOwnerBasePolicy } from "../plugins/manifest-owner-policy.js";
import {
  loadBundledPluginPublicArtifactModuleSync,
  resolveBundledPluginPublicArtifactPath,
} from "../plugins/public-surface-loader.js";
import { registerHealthCheck } from "./health-check-registry.js";
import type { HealthCheck, HealthCheckPluginContext } from "./health-checks.js";

// Bridges bundled plugin doctor checks into the core health registry.
type BundledHealthRegistrationHost = {
  readonly registerHealthCheck: typeof registerHealthCheck;
  readonly plugin?: HealthCheckPluginContext;
};

type BundledHealthApi = {
  registerPolicyDoctorChecks?: (host: BundledHealthRegistrationHost) => void;
  registerCodexDoctorChecks?: (host: BundledHealthRegistrationHost) => void;
};

/** Registers bundled health checks that are explicitly enabled by config and owner policy. */
export function registerBundledHealthChecks(params: { cfg: OpenClawConfig; cwd?: string }): void {
  const registerPolicy = shouldRegisterPolicyHealth(params);
  const registerCodex = shouldRegisterCodexHealth(params);

  if (registerPolicy) {
    loadBundledPluginPublicArtifactModuleSync<BundledHealthApi>({
      dirName: "policy",
      artifactBasename: "api.js",
    }).registerPolicyDoctorChecks?.(createBundledPluginHealthRegistrationHost("policy"));
  }
  if (registerCodex) {
    tryLoadActivatedBundledPluginPublicSurfaceModuleSync<BundledHealthApi>({
      dirName: "codex",
      artifactBasename: "api.js",
    })?.registerCodexDoctorChecks?.({ registerHealthCheck });
  }
}

function createBundledPluginHealthRegistrationHost(
  pluginId: string,
): BundledHealthRegistrationHost {
  const source =
    resolveBundledPluginPublicArtifactPath({
      dirName: pluginId,
      artifactBasename: "api.js",
    }) ?? "";
  const plugin: HealthCheckPluginContext = {
    id: pluginId,
    origin: "bundled",
    rootDir: source ? path.dirname(source) : "",
    source,
  };
  return {
    plugin,
    registerHealthCheck(check: HealthCheck): void {
      registerHealthCheck(bindHealthCheckPluginContext(check, plugin));
    },
  };
}

function bindHealthCheckPluginContext(
  check: HealthCheck,
  plugin: HealthCheckPluginContext,
): HealthCheck {
  const repair = check.repair;
  return {
    ...check,
    async detect(ctx, scope) {
      return check.detect({ ...ctx, plugin }, scope);
    },
    ...(repair
      ? {
          async repair(ctx, findings) {
            return repair({ ...ctx, plugin }, findings);
          },
        }
      : {}),
  };
}

function shouldRegisterPolicyHealth(params: { cfg: OpenClawConfig; cwd?: string }): boolean {
  const entry = params.cfg.plugins?.entries?.policy;
  const config = readRecord(entry?.config) ?? {};
  if (entry === undefined || entry.enabled === false || config.enabled === false) {
    return false;
  }
  // Policy doctor checks are bundled, but still respect the same manifest owner gate as runtime.
  if (
    !passesManifestOwnerBasePolicy({
      plugin: { id: "policy" },
      normalizedConfig: normalizePluginsConfig(params.cfg.plugins),
    })
  ) {
    return false;
  }
  return entry.enabled === true || config.enabled === true;
}

function shouldRegisterCodexHealth(params: { cfg: OpenClawConfig; cwd?: string }): boolean {
  const entry = params.cfg.plugins?.entries?.codex;
  if (entry === undefined || entry.enabled === false) {
    return false;
  }
  if (
    !passesManifestOwnerBasePolicy({
      plugin: { id: "codex" },
      normalizedConfig: normalizePluginsConfig(params.cfg.plugins),
    })
  ) {
    return false;
  }
  return true;
}
