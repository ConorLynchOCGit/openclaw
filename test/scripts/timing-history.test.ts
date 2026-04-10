import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadLocalTimingHistory,
  mergeTimingManifest,
  resolveLocalTimingHistoryPath,
  writeObservedTimingHistory,
} from "../../scripts/test-planner/timing-history.mjs";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("timing history", () => {
  it("persists observed durations under .local/test-runner-history", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-timing-history-"));
    cleanupDirs.push(rootDir);

    const { historyPath, payload } = writeObservedTimingHistory(
      "vitest.unit.config.ts",
      [{ file: "src/example.test.ts", durationMs: 2000, testCount: 4 }],
      { rootDir },
    );

    expect(historyPath).toBe(resolveLocalTimingHistoryPath("vitest.unit.config.ts", { rootDir }));
    expect(fs.existsSync(historyPath)).toBe(true);
    expect(payload.files["src/example.test.ts"]).toMatchObject({
      durationMs: 2000,
      testCount: 4,
      runs: 1,
    });
    expect(loadLocalTimingHistory("vitest.unit.config.ts", { rootDir })?.files).toHaveProperty(
      "src/example.test.ts",
    );
  });

  it("merges local history on top of checked-in timing manifests", () => {
    const merged = mergeTimingManifest(
      {
        config: "vitest.unit.config.ts",
        generatedAt: "old",
        defaultDurationMs: 250,
        files: {
          "src/example.test.ts": { durationMs: 1000, testCount: 2 },
          "src/kept.test.ts": { durationMs: 700, testCount: 1 },
        },
      },
      {
        generatedAt: "new",
        files: {
          "src/example.test.ts": { durationMs: 2200, testCount: 5, runs: 3 },
          "src/new.test.ts": { durationMs: 900, testCount: 1, runs: 1 },
        },
      },
    );

    expect(merged.generatedAt).toBe("new");
    expect(merged.files["src/example.test.ts"]).toMatchObject({
      durationMs: 2200,
      testCount: 5,
      runs: 3,
    });
    expect(merged.files["src/kept.test.ts"]).toMatchObject({ durationMs: 700, testCount: 1 });
    expect(merged.files["src/new.test.ts"]).toMatchObject({ durationMs: 900, testCount: 1 });
  });
});
