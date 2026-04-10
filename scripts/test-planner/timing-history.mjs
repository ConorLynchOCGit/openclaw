import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../lib/repo-heavy-task.mjs";
import { normalizeTrackedRepoPath } from "../test-report-utils.mjs";

const DEFAULT_FILE_NAMES = {
  "vitest.unit.config.ts": "test-timings.unit.json",
  "vitest.channels.config.ts": "test-timings.channels.json",
  "vitest.extensions.config.ts": "test-timings.extensions.json",
};

const DEFAULT_SMOOTHING = 0.35;

function resolveHistoryFileName(config) {
  if (typeof config === "string" && DEFAULT_FILE_NAMES[config]) {
    return DEFAULT_FILE_NAMES[config];
  }
  const sanitized = String(config ?? "unknown")
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return `${sanitized || "unknown"}.json`;
}

export function resolveLocalTimingHistoryPath(config, options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  return path.join(rootDir, ".local", "test-runner-history", resolveHistoryFileName(config));
}

export function loadLocalTimingHistory(config, options = {}) {
  const historyPath = resolveLocalTimingHistoryPath(config, options);
  if (!fs.existsSync(historyPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(historyPath, "utf8"));
  } catch {
    return null;
  }
}

export function mergeTimingManifest(baseManifest, localManifest) {
  if (!localManifest?.files || typeof localManifest.files !== "object") {
    return baseManifest;
  }
  const files = { ...baseManifest.files };
  for (const [file, value] of Object.entries(localManifest.files)) {
    const normalizedFile = normalizeTrackedRepoPath(file);
    const durationMs =
      Number.isFinite(value?.durationMs) && value.durationMs > 0
        ? Math.round(value.durationMs)
        : null;
    if (durationMs === null) {
      continue;
    }
    const testCount =
      Number.isFinite(value?.testCount) && value.testCount >= 0
        ? Math.round(value.testCount)
        : null;
    const runs = Number.isFinite(value?.runs) && value.runs > 0 ? Math.round(value.runs) : null;
    files[normalizedFile] = {
      durationMs,
      ...(testCount !== null ? { testCount } : {}),
      ...(runs !== null ? { runs } : {}),
    };
  }
  return {
    ...baseManifest,
    generatedAt:
      typeof localManifest.generatedAt === "string" && localManifest.generatedAt.length > 0
        ? localManifest.generatedAt
        : baseManifest.generatedAt,
    files,
  };
}

export function writeObservedTimingHistory(config, observedEntries, options = {}) {
  const historyPath = resolveLocalTimingHistoryPath(config, options);
  const existing = loadLocalTimingHistory(config, options) ?? {
    config,
    generatedAt: "",
    defaultDurationMs: 0,
    files: {},
  };
  const smoothing =
    Number.isFinite(options.smoothing) && options.smoothing > 0 && options.smoothing <= 1
      ? options.smoothing
      : DEFAULT_SMOOTHING;
  const files = { ...existing.files };

  for (const entry of observedEntries) {
    const normalizedFile = normalizeTrackedRepoPath(entry?.file ?? "");
    const durationMs =
      Number.isFinite(entry?.durationMs) && entry.durationMs > 0
        ? Math.round(entry.durationMs)
        : null;
    if (!normalizedFile || durationMs === null) {
      continue;
    }
    const previous = files[normalizedFile];
    const previousDuration =
      Number.isFinite(previous?.durationMs) && previous.durationMs > 0
        ? Math.round(previous.durationMs)
        : null;
    const runs =
      Number.isFinite(previous?.runs) && previous.runs > 0 ? Math.round(previous.runs) : 0;
    const nextDuration =
      previousDuration === null
        ? durationMs
        : Math.round(previousDuration * (1 - smoothing) + durationMs * smoothing);
    const testCount =
      Number.isFinite(entry?.testCount) && entry.testCount >= 0
        ? Math.round(entry.testCount)
        : previous?.testCount;
    files[normalizedFile] = {
      durationMs: nextDuration,
      ...(Number.isFinite(testCount) ? { testCount } : {}),
      runs: runs + 1,
      observedAt: new Date().toISOString(),
    };
  }

  const payload = {
    config,
    generatedAt: new Date().toISOString(),
    defaultDurationMs:
      Number.isFinite(existing.defaultDurationMs) && existing.defaultDurationMs > 0
        ? existing.defaultDurationMs
        : 0,
    files,
  };
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    historyPath,
    payload,
  };
}
