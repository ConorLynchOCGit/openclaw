import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../lib/repo-heavy-task.mjs";
import { normalizeTrackedRepoPath } from "../test-report-utils.mjs";

const DEFAULT_FILE_NAMES = {
  "vitest.unit.config.ts": "test-timings.unit.json",
  "vitest.channels.config.ts": "test-timings.channels.json",
  "vitest.extensions.config.ts": "test-timings.extensions.json",
};
const DEFAULT_MEMORY_FILE_NAMES = {
  "vitest.unit.config.ts": "test-memory-hotspots.unit.json",
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

function resolveMemoryHistoryFileName(config) {
  if (typeof config === "string" && DEFAULT_MEMORY_FILE_NAMES[config]) {
    return DEFAULT_MEMORY_FILE_NAMES[config];
  }
  const sanitized = String(config ?? "unknown")
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return `${sanitized || "unknown"}-memory.json`;
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

export function resolveLocalMemoryHistoryPath(config, options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  return path.join(rootDir, ".local", "test-runner-history", resolveMemoryHistoryFileName(config));
}

export function loadLocalMemoryHistory(config, options = {}) {
  const historyPath = resolveLocalMemoryHistoryPath(config, options);
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
    const observationMode =
      value?.observationMode === "batch-coarse" || value?.observationMode === "per-file"
        ? value.observationMode
        : null;
    files[normalizedFile] = {
      durationMs,
      ...(testCount !== null ? { testCount } : {}),
      ...(observationMode ? { observationMode } : {}),
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

export function mergeMemoryHotspotManifest(baseManifest, localManifest) {
  if (!localManifest?.files || typeof localManifest.files !== "object") {
    return baseManifest;
  }
  const files = { ...baseManifest.files };
  for (const [file, value] of Object.entries(localManifest.files)) {
    const normalizedFile = normalizeTrackedRepoPath(file);
    const deltaKb =
      Number.isFinite(value?.deltaKb) && value.deltaKb > 0 ? Math.round(value.deltaKb) : null;
    const peakRssKb =
      Number.isFinite(value?.peakRssKb) && value.peakRssKb > 0 ? Math.round(value.peakRssKb) : null;
    if (deltaKb === null && peakRssKb === null) {
      continue;
    }
    const runs = Number.isFinite(value?.runs) && value.runs > 0 ? Math.round(value.runs) : null;
    const sources = Array.isArray(value?.sources)
      ? value.sources.filter((source) => typeof source === "string" && source.length > 0)
      : files[normalizedFile]?.sources;
    files[normalizedFile] = {
      ...files[normalizedFile],
      ...(deltaKb !== null ? { deltaKb } : {}),
      ...(peakRssKb !== null ? { peakRssKb } : {}),
      ...(Array.isArray(sources) && sources.length > 0 ? { sources } : {}),
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
    const observationMode =
      entry?.observationMode === "batch-coarse" || entry?.observationMode === "per-file"
        ? entry.observationMode
        : previous?.observationMode;
    files[normalizedFile] = {
      durationMs: nextDuration,
      ...(Number.isFinite(testCount) ? { testCount } : {}),
      ...(observationMode ? { observationMode } : {}),
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

export function writeObservedMemoryHistory(config, observedEntries, options = {}) {
  const historyPath = resolveLocalMemoryHistoryPath(config, options);
  const existing = loadLocalMemoryHistory(config, options) ?? {
    config,
    generatedAt: "",
    defaultMinDeltaKb: 0,
    files: {},
  };
  const smoothing =
    Number.isFinite(options.smoothing) && options.smoothing > 0 && options.smoothing <= 1
      ? options.smoothing
      : DEFAULT_SMOOTHING;
  const files = { ...existing.files };

  for (const entry of observedEntries) {
    const normalizedFile = normalizeTrackedRepoPath(entry?.file ?? "");
    const deltaKb =
      Number.isFinite(entry?.deltaKb) && entry.deltaKb > 0 ? Math.round(entry.deltaKb) : null;
    const peakRssKb =
      Number.isFinite(entry?.peakRssKb) && entry.peakRssKb > 0 ? Math.round(entry.peakRssKb) : null;
    if (!normalizedFile || (deltaKb === null && peakRssKb === null)) {
      continue;
    }
    const previous = files[normalizedFile];
    const previousDeltaKb =
      Number.isFinite(previous?.deltaKb) && previous.deltaKb > 0
        ? Math.round(previous.deltaKb)
        : null;
    const previousPeakRssKb =
      Number.isFinite(previous?.peakRssKb) && previous.peakRssKb > 0
        ? Math.round(previous.peakRssKb)
        : null;
    const runs =
      Number.isFinite(previous?.runs) && previous.runs > 0 ? Math.round(previous.runs) : 0;
    const nextDeltaKb =
      deltaKb === null
        ? previousDeltaKb
        : previousDeltaKb === null
          ? deltaKb
          : Math.round(previousDeltaKb * (1 - smoothing) + deltaKb * smoothing);
    const nextPeakRssKb =
      peakRssKb === null
        ? previousPeakRssKb
        : previousPeakRssKb === null
          ? peakRssKb
          : Math.round(previousPeakRssKb * (1 - smoothing) + peakRssKb * smoothing);
    const sources = Array.isArray(entry?.sources)
      ? entry.sources.filter((source) => typeof source === "string" && source.length > 0)
      : previous?.sources;
    files[normalizedFile] = {
      ...(nextDeltaKb !== null ? { deltaKb: nextDeltaKb } : {}),
      ...(nextPeakRssKb !== null ? { peakRssKb: nextPeakRssKb } : {}),
      ...(Array.isArray(sources) && sources.length > 0 ? { sources } : {}),
      runs: runs + 1,
      observedAt: new Date().toISOString(),
    };
  }

  const payload = {
    config,
    generatedAt: new Date().toISOString(),
    defaultMinDeltaKb:
      Number.isFinite(existing.defaultMinDeltaKb) && existing.defaultMinDeltaKb > 0
        ? existing.defaultMinDeltaKb
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
