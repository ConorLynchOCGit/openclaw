import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import type { SecretInput } from "openclaw/plugin-sdk/secret-input";
import { resolveConfiguredSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type OpenClawConfigSnapshot = DeepReadonly<OpenClawConfig>;

export const X_BEARER_TOKEN_ENV = "X_BEARER_TOKEN";
export const X_OWNED_METRICS_TOKEN_ENV = "X_OWNED_METRICS_TOKEN";

export type XCredentialSource = "config" | "env" | "secret_ref";

export type XCredentialResolution =
  | { status: "available"; value: string; source: XCredentialSource }
  | { status: "missing" | "unavailable" };

export class XCredentialError extends Error {
  readonly code = "credential_unavailable";

  constructor(kind: "public" | "owned_metrics") {
    super(
      kind === "public"
        ? "X public read credential is unavailable."
        : "X owned-metrics credential is unavailable.",
    );
    this.name = "XCredentialError";
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

type SecretReference = {
  source: string;
  provider: string;
  id: string;
};

function normalize(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isSecretReference(value: unknown): value is SecretReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SecretReference>;
  return (
    typeof candidate.source === "string" &&
    typeof candidate.provider === "string" &&
    typeof candidate.id === "string"
  );
}

/**
 * Resolve the only environment-backed public credential this extension accepts.
 * Explicit references that cannot be resolved intentionally block env fallback.
 */
export function resolvePublicCredential(
  configured: SecretInput | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): XCredentialResolution {
  const literal = normalize(configured);
  if (literal) {
    return { status: "available", value: literal, source: "config" };
  }

  if (configured !== undefined) {
    if (!isSecretReference(configured)) {
      return { status: "unavailable" };
    }
    if (configured.source !== "env" || configured.id !== X_BEARER_TOKEN_ENV) {
      return { status: "unavailable" };
    }
    const value = normalize(env[X_BEARER_TOKEN_ENV]);
    return value ? { status: "available", value, source: "env" } : { status: "unavailable" };
  }

  const value = normalize(env[X_BEARER_TOKEN_ENV]);
  return value ? { status: "available", value, source: "env" } : { status: "missing" };
}

/**
 * Resolve the dedicated owned-metrics credential without ever considering the
 * public bearer token. This synchronous path supports literals and the fixed
 * owned-metrics environment reference; other SecretRefs use the native async
 * runtime resolver below.
 */
export function resolveOwnedMetricsCredential(
  configured: SecretInput | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): XCredentialResolution {
  const literal = normalize(configured);
  if (literal) {
    return { status: "available", value: literal, source: "config" };
  }
  if (configured !== undefined) {
    if (
      !isSecretReference(configured) ||
      configured.source !== "env" ||
      configured.id !== X_OWNED_METRICS_TOKEN_ENV
    ) {
      return { status: "unavailable" };
    }
    const value = normalize(env[X_OWNED_METRICS_TOKEN_ENV]);
    return value ? { status: "available", value, source: "env" } : { status: "unavailable" };
  }
  const value = normalize(env[X_OWNED_METRICS_TOKEN_ENV]);
  return value ? { status: "available", value, source: "env" } : { status: "missing" };
}

/** Resolve any configured OpenClaw SecretRef immediately before an owned call. */
export async function resolveOwnedMetricsCredentialAtRuntime(params: {
  configured: SecretInput | undefined;
  config: OpenClawConfigSnapshot;
  env?: NodeJS.ProcessEnv;
}): Promise<XCredentialResolution> {
  const env = params.env ?? process.env;
  if (params.configured === undefined) {
    return resolveOwnedMetricsCredential(undefined, env);
  }
  if (
    isSecretReference(params.configured) &&
    params.configured.source === "env" &&
    params.configured.id !== X_OWNED_METRICS_TOKEN_ENV
  ) {
    return { status: "unavailable" };
  }
  const resolved = await resolveConfiguredSecretInputString({
    // The native resolver only reads config, but its public signature predates
    // readonly runtime snapshots. Keep the compatibility cast at that boundary.
    config: params.config as OpenClawConfig,
    env,
    value: params.configured,
    path: "plugins.entries.x-intelligence.config.ownedMetricsApiKey",
    unresolvedReasonStyle: "detailed",
  });
  if (resolved.unresolvedRefReason) {
    return { status: "unavailable" };
  }
  const value = normalize(resolved.value);
  if (!value) {
    return { status: "unavailable" };
  }
  return {
    status: "available",
    value,
    source: isSecretReference(params.configured) ? "secret_ref" : "config",
  };
}

export function requirePublicCredential(
  configured: SecretInput | undefined,
  env?: Readonly<Record<string, string | undefined>>,
): string {
  const resolved = resolvePublicCredential(configured, env);
  if (resolved.status !== "available") {
    throw new XCredentialError("public");
  }
  return resolved.value;
}

export function requireOwnedMetricsCredential(
  configured: SecretInput | undefined,
  env?: Readonly<Record<string, string | undefined>>,
): string {
  const resolved = resolveOwnedMetricsCredential(configured, env);
  if (resolved.status !== "available") {
    throw new XCredentialError("owned_metrics");
  }
  return resolved.value;
}

export async function requireOwnedMetricsCredentialAtRuntime(params: {
  configured: SecretInput | undefined;
  config: OpenClawConfigSnapshot;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const resolved = await resolveOwnedMetricsCredentialAtRuntime(params);
  if (resolved.status !== "available") {
    throw new XCredentialError("owned_metrics");
  }
  return resolved.value;
}
