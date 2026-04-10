import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "./repo-heavy-task.mjs";

export const GATE_METRICS_ROOT = path.join(ROOT_DIR, ".local", "gate-metrics");

function sanitizeSegment(value) {
  const normalized = String(value)
    .trim()
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return normalized || "metric";
}

function formatHistoryTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace(/[:.]/gu, "-");
}

export function resolveGateMetricArtifactPaths(kind, options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const latestKey = sanitizeSegment(options.latestKey ?? kind);
  const historyKey = sanitizeSegment(options.historyKey ?? kind);
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  return {
    latestPath: path.join(rootDir, ".local", "gate-metrics", "latest", `${latestKey}.json`),
    historyPath: path.join(
      rootDir,
      ".local",
      "gate-metrics",
      "history",
      `${formatHistoryTimestamp(recordedAt)}-${historyKey}.json`,
    ),
  };
}

export function writeGateMetricArtifact(kind, payload, options = {}) {
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    kind,
    recordedAt,
    ...payload,
  };
  const paths = resolveGateMetricArtifactPaths(kind, { ...options, recordedAt });
  fs.mkdirSync(path.dirname(paths.latestPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.historyPath), { recursive: true });
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  fs.writeFileSync(paths.latestPath, serialized, "utf8");
  fs.writeFileSync(paths.historyPath, serialized, "utf8");
  return {
    ...paths,
    artifact,
  };
}
