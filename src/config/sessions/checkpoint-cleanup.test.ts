import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../../test-helpers/temp-dir.js";
import {
  applyCompactionCheckpointCleanup,
  planCompactionCheckpointCleanupFromStore,
} from "./checkpoint-cleanup.js";
import type { SessionEntry } from "./types.js";

describe("compaction checkpoint cleanup", () => {
  it("plans unreferenced generated checkpoints plus over-retained referenced checkpoints", async () => {
    await withTempDir({ prefix: "openclaw-checkpoint-cleanup-" }, async (dir) => {
      const storePath = path.join(dir, "sessions.json");
      const referenced = Array.from({ length: 7 }, (_, index) =>
        path.join(dir, `main.checkpoint.${index}.jsonl`),
      );
      const orphan = path.join(dir, "main.checkpoint.orphan.jsonl");
      const primaryTranscript = path.join(dir, "main.jsonl");
      const store: Record<string, SessionEntry> = {
        "agent:main:main": {
          sessionId: "main",
          updatedAt: 1,
          sessionFile: primaryTranscript,
          compactionCheckpoints: referenced.map((sessionFile, index) => ({
            checkpointId: `checkpoint-${index}`,
            sessionKey: "agent:main:main",
            sessionId: "main",
            createdAt: index,
            reason: "manual",
            preCompaction: {
              sessionId: `snapshot-${index}`,
              sessionFile,
              leafId: `leaf-${index}`,
            },
            postCompaction: {
              sessionId: "main",
            },
          })),
        },
      };
      await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
      await fs.writeFile(primaryTranscript, "primary", "utf-8");
      for (const [index, filePath] of referenced.entries()) {
        await fs.writeFile(filePath, "r".repeat((index + 1) * 10), "utf-8");
      }
      await fs.writeFile(orphan, "o".repeat(500), "utf-8");

      const plan = await planCompactionCheckpointCleanupFromStore({
        storePath,
        maxCheckpointsPerSession: 5,
      });

      expect(plan.checkpointFiles).toBe(8);
      expect(plan.referencedCheckpointFiles).toBe(7);
      expect(plan.retainedCheckpointFiles).toBe(5);
      expect(plan.unreferencedCheckpointFiles).toBe(1);
      expect(plan.overRetainedCheckpointFiles).toBe(2);
      expect(plan.filesToDelete.map((file) => path.basename(file.path)).toSorted()).toEqual([
        "main.checkpoint.0.jsonl",
        "main.checkpoint.1.jsonl",
        "main.checkpoint.orphan.jsonl",
      ]);
      expect(plan.entryUpdates).toEqual([
        expect.objectContaining({
          sessionKey: "agent:main:main",
          beforeCount: 7,
          afterCount: 5,
          prunedCount: 2,
        }),
      ]);
    });
  });

  it("applies checkpoint-only cleanup without deleting primary transcripts", async () => {
    await withTempDir({ prefix: "openclaw-checkpoint-cleanup-" }, async (dir) => {
      const storePath = path.join(dir, "sessions.json");
      const primaryTranscript = path.join(dir, "main.jsonl");
      const keep = path.join(dir, "main.checkpoint.keep.jsonl");
      const prune = path.join(dir, "main.checkpoint.prune.jsonl");
      const orphan = path.join(dir, "main.checkpoint.orphan.jsonl");
      const store: Record<string, SessionEntry> = {
        "agent:main:main": {
          sessionId: "main",
          updatedAt: 1,
          sessionFile: primaryTranscript,
          compactionCheckpoints: [prune, keep].map((sessionFile, index) => ({
            checkpointId: `checkpoint-${index}`,
            sessionKey: "agent:main:main",
            sessionId: "main",
            createdAt: index,
            reason: "manual",
            preCompaction: {
              sessionId: `snapshot-${index}`,
              sessionFile,
              leafId: `leaf-${index}`,
            },
            postCompaction: {
              sessionId: "main",
            },
          })),
        },
      };
      await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
      await fs.writeFile(primaryTranscript, "primary", "utf-8");
      await fs.writeFile(keep, "keep", "utf-8");
      await fs.writeFile(prune, "prune", "utf-8");
      await fs.writeFile(orphan, "orphan", "utf-8");

      const result = await applyCompactionCheckpointCleanup({
        storePath,
        maxCheckpointsPerSession: 1,
        backupNowMs: 123,
      });

      expect(result.backupStorePath).toBe(`${storePath}.bak.123`);
      expect(result.deletedFiles).toBe(2);
      expect(result.failedDeletes).toEqual([]);
      await expect(fs.stat(primaryTranscript)).resolves.toBeTruthy();
      await expect(fs.stat(keep)).resolves.toBeTruthy();
      await expect(fs.stat(prune)).rejects.toThrow();
      await expect(fs.stat(orphan)).rejects.toThrow();
      await expect(fs.stat(`${storePath}.bak.123`)).resolves.toBeTruthy();

      const nextStore = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        SessionEntry
      >;
      expect(nextStore["agent:main:main"]?.compactionCheckpoints).toHaveLength(1);
      expect(
        nextStore["agent:main:main"]?.compactionCheckpoints?.[0]?.preCompaction.sessionFile,
      ).toBe(keep);
    });
  });
});
