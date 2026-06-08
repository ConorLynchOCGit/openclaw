import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getRuntimeConfigSourceSnapshot,
  projectConfigOntoRuntimeSourceSnapshot,
  type OpenClawConfig,
  loadConfig,
} from "../config/config.js";
import { createConfigRuntimeEnv } from "../config/env-vars.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { MODELS_JSON_STATE } from "./models-config-state.js";
import { planOpenClawModelsJson } from "./models-config.plan.js";

export { resetModelsJsonReadyCacheForTest } from "./models-config-state.js";

async function readFileMtimeMs(pathname: string): Promise<number | null> {
  try {
    const stat = await fs.stat(pathname);
    return Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function logModelsJsonTiming(
  label: string,
  startedAt: number,
  details: Record<string, unknown> = {},
) {
  if (process.env.OPENCLAW_MODELS_JSON_TIMING !== "1") {
    return;
  }
  process.stderr.write(
    `${JSON.stringify({
      event: "models_json_timing",
      label,
      elapsedMs: Date.now() - startedAt,
      ...details,
    })}\n`,
  );
}

async function buildModelsJsonSourceFingerprint(params: {
  config: OpenClawConfig;
  sourceConfigForSecrets: OpenClawConfig;
  agentDir: string;
}): Promise<string> {
  const authProfilesMtimeMs = await readFileMtimeMs(
    path.join(params.agentDir, "auth-profiles.json"),
  );
  const envShape = createConfigRuntimeEnv(params.config, {});
  return stableStringify({
    config: params.config,
    sourceConfigForSecrets: params.sourceConfigForSecrets,
    envShape,
    authProfilesMtimeMs,
  });
}

function buildModelsJsonReadinessFingerprint(params: {
  sourceFingerprint: string;
  modelsHash: string;
}): string {
  return stableStringify({
    sourceFingerprint: params.sourceFingerprint,
    modelsHash: params.modelsHash,
  });
}

async function readExistingModelsFile(pathname: string): Promise<{
  raw: string;
  parsed: unknown;
}> {
  try {
    const raw = await fs.readFile(pathname, "utf8");
    return {
      raw,
      parsed: JSON.parse(raw) as unknown,
    };
  } catch {
    return {
      raw: "",
      parsed: null,
    };
  }
}

export async function ensureModelsFileModeForModelsJson(pathname: string): Promise<void> {
  await fs.chmod(pathname, 0o600).catch(() => {
    // best-effort
  });
}

export async function writeModelsFileAtomicForModelsJson(
  targetPath: string,
  contents: string,
): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, contents, { mode: 0o600 });
  await fs.rename(tempPath, targetPath);
}

type ModelsJsonReadinessSidecar = {
  schema: "openclaw.modelsJsonReadiness.v1";
  sourceFingerprint: string;
  modelsHash: string;
};

function modelsJsonReadinessPath(targetPath: string): string {
  return `${targetPath}.ready.json`;
}

function parseModelsJsonReadinessSidecar(value: unknown): ModelsJsonReadinessSidecar | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return record.schema === "openclaw.modelsJsonReadiness.v1" &&
    typeof record.sourceFingerprint === "string" &&
    typeof record.modelsHash === "string"
    ? {
        schema: "openclaw.modelsJsonReadiness.v1",
        sourceFingerprint: record.sourceFingerprint,
        modelsHash: record.modelsHash,
      }
    : null;
}

async function readModelsJsonReadinessSidecar(
  targetPath: string,
): Promise<ModelsJsonReadinessSidecar | null> {
  try {
    return parseModelsJsonReadinessSidecar(
      JSON.parse(await fs.readFile(modelsJsonReadinessPath(targetPath), "utf8")) as unknown,
    );
  } catch {
    return null;
  }
}

async function writeModelsJsonReadinessSidecar(params: {
  targetPath: string;
  sourceFingerprint: string;
  modelsHash: string;
}): Promise<void> {
  const contents = `${JSON.stringify(
    {
      schema: "openclaw.modelsJsonReadiness.v1",
      sourceFingerprint: params.sourceFingerprint,
      modelsHash: params.modelsHash,
    } satisfies ModelsJsonReadinessSidecar,
    null,
    2,
  )}\n`;
  const sidecarPath = modelsJsonReadinessPath(params.targetPath);
  const tempPath = `${sidecarPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, contents, { mode: 0o600 });
  await fs.rename(tempPath, sidecarPath);
  await ensureModelsFileModeForModelsJson(sidecarPath);
}

function modelsJsonReadinessMatches(params: {
  sidecar: ModelsJsonReadinessSidecar | null;
  sourceFingerprint: string;
  modelsHash: string;
  existingRaw: string;
}): boolean {
  return (
    Boolean(params.existingRaw.trim()) &&
    params.sidecar?.sourceFingerprint === params.sourceFingerprint &&
    params.sidecar.modelsHash === params.modelsHash
  );
}

function resolveModelsConfigInput(config?: OpenClawConfig): {
  config: OpenClawConfig;
  sourceConfigForSecrets: OpenClawConfig;
} {
  const runtimeSource = getRuntimeConfigSourceSnapshot();
  if (!config) {
    const loaded = loadConfig();
    return {
      config: runtimeSource ?? loaded,
      sourceConfigForSecrets: runtimeSource ?? loaded,
    };
  }
  if (!runtimeSource) {
    return {
      config,
      sourceConfigForSecrets: config,
    };
  }
  const projected = projectConfigOntoRuntimeSourceSnapshot(config);
  return {
    config: projected,
    // If projection is skipped (for example incompatible top-level shape),
    // keep managed secret persistence anchored to the active source snapshot.
    sourceConfigForSecrets: projected === config ? runtimeSource : projected,
  };
}

async function withModelsJsonWriteLock<T>(targetPath: string, run: () => Promise<T>): Promise<T> {
  const prior = MODELS_JSON_STATE.writeLocks.get(targetPath) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = prior.then(() => gate);
  MODELS_JSON_STATE.writeLocks.set(targetPath, pending);
  try {
    await prior;
    return await run();
  } finally {
    release();
    if (MODELS_JSON_STATE.writeLocks.get(targetPath) === pending) {
      MODELS_JSON_STATE.writeLocks.delete(targetPath);
    }
  }
}

export async function ensureOpenClawModelsJson(
  config?: OpenClawConfig,
  agentDirOverride?: string,
  options?: { policy?: "refresh" | "reuse-existing" },
): Promise<{ agentDir: string; wrote: boolean }> {
  const timingStartedAt = Date.now();
  const resolved = resolveModelsConfigInput(config);
  logModelsJsonTiming("config_resolved", timingStartedAt);
  const cfg = resolved.config;
  const agentDir = agentDirOverride?.trim() ? agentDirOverride.trim() : resolveOpenClawAgentDir();
  const targetPath = path.join(agentDir, "models.json");
  const sourceFingerprint = await buildModelsJsonSourceFingerprint({
    config: cfg,
    sourceConfigForSecrets: resolved.sourceConfigForSecrets,
    agentDir,
  });
  logModelsJsonTiming("source_fingerprint_built", timingStartedAt, {
    agentDir,
    policy: options?.policy ?? "refresh",
  });
  const existingModelsFile = await readExistingModelsFile(targetPath);
  logModelsJsonTiming("existing_models_read", timingStartedAt, {
    existingByteCount: Buffer.byteLength(existingModelsFile.raw, "utf8"),
  });
  const existingModelsHash = sha256Text(existingModelsFile.raw);
  const fingerprint = buildModelsJsonReadinessFingerprint({
    sourceFingerprint,
    modelsHash: existingModelsHash,
  });
  if (options?.policy === "reuse-existing" && existingModelsFile.raw.trim()) {
    const result = { agentDir, wrote: false };
    MODELS_JSON_STATE.readyCache.set(targetPath, Promise.resolve({ fingerprint, result }));
    await ensureModelsFileModeForModelsJson(targetPath);
    logModelsJsonTiming("existing_models_reused", timingStartedAt);
    return result;
  }
  const cached = MODELS_JSON_STATE.readyCache.get(targetPath);
  if (cached) {
    const settled = await cached;
    logModelsJsonTiming("memory_cache_checked", timingStartedAt, {
      matched: settled.fingerprint === fingerprint,
    });
    if (settled.fingerprint === fingerprint) {
      await ensureModelsFileModeForModelsJson(targetPath);
      return settled.result;
    }
  }
  if (
    modelsJsonReadinessMatches({
      sidecar: await readModelsJsonReadinessSidecar(targetPath),
      sourceFingerprint,
      modelsHash: existingModelsHash,
      existingRaw: existingModelsFile.raw,
    })
  ) {
    logModelsJsonTiming("disk_readiness_matched", timingStartedAt);
    const result = { agentDir, wrote: false };
    MODELS_JSON_STATE.readyCache.set(targetPath, Promise.resolve({ fingerprint, result }));
    await ensureModelsFileModeForModelsJson(targetPath);
    return result;
  }

  const pending = withModelsJsonWriteLock(targetPath, async () => {
    logModelsJsonTiming("write_lock_entered", timingStartedAt);
    const lockedExistingModelsFile = await readExistingModelsFile(targetPath);
    logModelsJsonTiming("locked_existing_models_read", timingStartedAt, {
      existingByteCount: Buffer.byteLength(lockedExistingModelsFile.raw, "utf8"),
    });
    const lockedExistingModelsHash = sha256Text(lockedExistingModelsFile.raw);
    const lockedFingerprint = buildModelsJsonReadinessFingerprint({
      sourceFingerprint,
      modelsHash: lockedExistingModelsHash,
    });
    const lockedCached = MODELS_JSON_STATE.readyCache.get(targetPath);
    if (lockedCached) {
      const settled = await lockedCached;
      if (settled.fingerprint === lockedFingerprint) {
        await ensureModelsFileModeForModelsJson(targetPath);
        return settled;
      }
    }
    if (
      modelsJsonReadinessMatches({
        sidecar: await readModelsJsonReadinessSidecar(targetPath),
        sourceFingerprint,
        modelsHash: lockedExistingModelsHash,
        existingRaw: lockedExistingModelsFile.raw,
      })
    ) {
      logModelsJsonTiming("locked_disk_readiness_matched", timingStartedAt);
      await ensureModelsFileModeForModelsJson(targetPath);
      return { fingerprint: lockedFingerprint, result: { agentDir, wrote: false } };
    }
    // Ensure config env vars (e.g. AWS_PROFILE, AWS_ACCESS_KEY_ID) are
    // are available to provider discovery without mutating process.env.
    const env = createConfigRuntimeEnv(cfg);
    const plan = await planOpenClawModelsJson({
      cfg,
      sourceConfigForSecrets: resolved.sourceConfigForSecrets,
      agentDir,
      env,
      existingRaw: lockedExistingModelsFile.raw,
      existingParsed: lockedExistingModelsFile.parsed,
      discoverImplicitProviders: options?.policy === "reuse-existing" ? false : undefined,
    });
    logModelsJsonTiming("plan_built", timingStartedAt, {
      action: plan.action,
    });

    if (plan.action === "skip") {
      logModelsJsonTiming("plan_skip", timingStartedAt);
      return { fingerprint: lockedFingerprint, result: { agentDir, wrote: false } };
    }

    if (plan.action === "noop") {
      await ensureModelsFileModeForModelsJson(targetPath);
      await writeModelsJsonReadinessSidecar({
        targetPath,
        sourceFingerprint,
        modelsHash: lockedExistingModelsHash,
      });
      logModelsJsonTiming("plan_noop_sidecar_written", timingStartedAt);
      return { fingerprint: lockedFingerprint, result: { agentDir, wrote: false } };
    }

    await fs.mkdir(agentDir, { recursive: true, mode: 0o700 });
    await writeModelsFileAtomicForModelsJson(targetPath, plan.contents);
    await ensureModelsFileModeForModelsJson(targetPath);
    const nextModelsHash = sha256Text(plan.contents);
    await writeModelsJsonReadinessSidecar({
      targetPath,
      sourceFingerprint,
      modelsHash: nextModelsHash,
    });
    logModelsJsonTiming("models_written", timingStartedAt);
    return {
      fingerprint: buildModelsJsonReadinessFingerprint({
        sourceFingerprint,
        modelsHash: nextModelsHash,
      }),
      result: { agentDir, wrote: true },
    };
  });
  MODELS_JSON_STATE.readyCache.set(targetPath, pending);
  try {
    const settled = await pending;
    return settled.result;
  } catch (error) {
    if (MODELS_JSON_STATE.readyCache.get(targetPath) === pending) {
      MODELS_JSON_STATE.readyCache.delete(targetPath);
    }
    throw error;
  }
}
