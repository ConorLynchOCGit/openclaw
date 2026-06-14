import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type OpenClawRuntimeHome = {
  runtimeHome: string;
  providersRoot: string;
  stateHome: string;
  configHome: string;
  cacheHome: string;
  tmpDir: string;
};

export type OpenClawRuntimeProviderHome = OpenClawRuntimeHome & {
  providerId: string;
  providerHome: string;
};

function normalizePathValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveOpenClawRuntimeHome(
  env: NodeJS.ProcessEnv = process.env,
): OpenClawRuntimeHome {
  const configured = normalizePathValue(env.OPENCLAW_RUNTIME_HOME);
  const home = normalizePathValue(env.HOME) ?? os.homedir();
  const runtimeHome = path.resolve(configured ?? path.join(home, ".openclaw", "runtime"));
  return {
    runtimeHome,
    providersRoot: path.join(runtimeHome, "providers"),
    stateHome: path.join(runtimeHome, "state"),
    configHome: path.join(runtimeHome, "config"),
    cacheHome: path.join(runtimeHome, "cache"),
    tmpDir: path.join(runtimeHome, "tmp"),
  };
}

export function resolveOpenClawRuntimeProviderHome(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawRuntimeProviderHome {
  const runtimeHome = resolveOpenClawRuntimeHome(env);
  const safeProviderId = providerId
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .toLowerCase();
  return {
    ...runtimeHome,
    providerId: safeProviderId,
    providerHome: path.join(runtimeHome.providersRoot, safeProviderId),
  };
}

export function ensureOpenClawRuntimeProviderHome(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawRuntimeProviderHome {
  const resolved = resolveOpenClawRuntimeProviderHome(providerId, env);
  for (const dir of [
    resolved.runtimeHome,
    resolved.providersRoot,
    resolved.stateHome,
    resolved.configHome,
    resolved.cacheHome,
    resolved.tmpDir,
    resolved.providerHome,
  ]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return resolved;
}

export function buildOpenClawProviderProcessEnv(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const resolved =
    process.env.VITEST === "true"
      ? resolveOpenClawRuntimeProviderHome(providerId, env)
      : ensureOpenClawRuntimeProviderHome(providerId, env);
  return {
    OPENCLAW_RUNTIME_HOME: resolved.runtimeHome,
    HOME: resolved.runtimeHome,
    XDG_STATE_HOME: resolved.stateHome,
    XDG_CONFIG_HOME: resolved.configHome,
    XDG_CACHE_HOME: resolved.cacheHome,
    TMPDIR: resolved.tmpDir,
    ...(resolved.providerId === "codex" ? { CODEX_HOME: resolved.providerHome } : {}),
  };
}
