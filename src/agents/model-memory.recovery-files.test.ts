import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pruneRecoveryQuarantineFiles,
  readRecoveredJsonFile,
  readRecoveredJsonLines,
} from "./model-memory.recovery-files.js";

describe("model-memory recovery file helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies locked or busy JSON reads without throwing", async () => {
    const busyError = Object.assign(new Error("resource busy"), { code: "EBUSY" });
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(busyError);

    const result = await readRecoveredJsonFile({
      filePath: "/tmp/openclaw-busy.json",
      fallback: { ok: false },
    });

    expect(result.value).toEqual({ ok: false });
    expect(result.recoveries).toEqual([
      expect.objectContaining({
        recoveryClass: "locked_or_busy",
        originalPath: "/tmp/openclaw-busy.json",
      }),
    ]);
  });

  it("quarantines and repairs truncated JSONL while preserving valid entries", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-recovery-jsonl-"));
    try {
      const filePath = path.join(baseDir, "events.jsonl");
      const quarantineDir = path.join(baseDir, "quarantine");
      await fs.writeFile(filePath, `${JSON.stringify({ id: "one" })}\n{"id":"two"`, "utf8");

      const result = await readRecoveredJsonLines<{ id: string }>({
        filePath,
        quarantineDir,
      });

      expect(result.entries).toEqual([{ id: "one" }]);
      expect(result.recoveries).toEqual([
        expect.objectContaining({
          recoveryClass: "truncated_jsonl",
          quarantinedPath: expect.stringContaining(quarantineDir),
          preservedEntryCount: 1,
          droppedEntryCount: 1,
        }),
      ]);
      expect(await fs.readFile(filePath, "utf8")).toBe(`${JSON.stringify({ id: "one" })}\n`);
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });

  it("prunes only stale quarantine files during retention cleanup", async () => {
    const quarantineDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-recovery-quarantine-"));
    try {
      const oldPath = path.join(quarantineDir, "old.json");
      const freshPath = path.join(quarantineDir, "fresh.json");
      await fs.writeFile(oldPath, "{}\n", "utf8");
      await fs.writeFile(freshPath, "{}\n", "utf8");

      const oldTime = new Date("2026-04-20T00:00:00.000Z");
      const freshTime = new Date("2026-04-24T00:00:00.000Z");
      await fs.utimes(oldPath, oldTime, oldTime);
      await fs.utimes(freshPath, freshTime, freshTime);

      const result = await pruneRecoveryQuarantineFiles({
        quarantineDir,
        olderThanMs: 24 * 60 * 60 * 1000,
        now: new Date("2026-04-24T12:00:00.000Z"),
      });

      expect(result.deletedPaths).toEqual([oldPath]);
      expect(result.keptPaths).toEqual([freshPath]);
      await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(fs.stat(freshPath)).resolves.toBeTruthy();
    } finally {
      await fs.rm(quarantineDir, { recursive: true, force: true });
    }
  });
});
