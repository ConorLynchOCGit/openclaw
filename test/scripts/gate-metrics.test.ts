import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveGateMetricArtifactPaths,
  writeGateMetricArtifact,
} from "../../scripts/lib/gate-metrics.mjs";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("gate metrics", () => {
  it("writes both latest and history artifacts", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-gate-metrics-"));
    cleanupDirs.push(rootDir);

    const result = writeGateMetricArtifact(
      "build",
      {
        elapsedMs: 1234,
        status: "success",
      },
      {
        rootDir,
        latestKey: "build-runtime-fast",
        historyKey: "build-runtime-fast",
        recordedAt: "2026-04-10T12:34:56.000Z",
      },
    );

    expect(fs.existsSync(result.latestPath)).toBe(true);
    expect(fs.existsSync(result.historyPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(result.latestPath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      kind: "build",
      elapsedMs: 1234,
      status: "success",
    });
    expect(result.historyPath).toContain("2026-04-10T12-34-56-000Z-build-runtime-fast.json");
  });

  it("normalizes unsafe latest and history names", () => {
    const paths = resolveGateMetricArtifactPaths("test", {
      rootDir: "/tmp/openclaw-gate-metrics",
      latestKey: "feature landing gate",
      historyKey: "proof lane/run",
      recordedAt: "2026-04-10T12:34:56.000Z",
    });

    expect(paths.latestPath).toContain("feature-landing-gate.json");
    expect(paths.historyPath).toContain("proof-lane-run.json");
  });
});
