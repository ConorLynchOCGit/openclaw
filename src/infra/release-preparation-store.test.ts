import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  deriveReleasePreparationOperationId,
  ensureReleasePreparationOperationRoot,
  readOperationJson,
  resolveReleasePreparationOperationPaths,
  writeImmutableOperationJson,
} from "./release-preparation-store.js";

describe("release preparation operation store", () => {
  it("derives a stable identity and writes immutable fsynced evidence", async () => {
    await withTempDir({ prefix: "release-operation-store-" }, async (root) => {
      const operationId = deriveReleasePreparationOperationId({
        codingTaskId: "coding-task",
        worktreeId: "worktree-1",
        loadedReleaseManifestDigest: "a".repeat(64),
      });
      const paths = resolveReleasePreparationOperationPaths({
        releaseStoreRoot: root,
        operationId,
      });
      await ensureReleasePreparationOperationRoot({ releaseStoreRoot: root, paths });
      const value = { schema: "openclaw.release.prepare.test.v1", accepted: true };
      const first = await writeImmutableOperationJson({
        operationRoot: paths.operationRoot,
        filePath: paths.admissionPath,
        value,
      });
      const second = await writeImmutableOperationJson({
        operationRoot: paths.operationRoot,
        filePath: paths.admissionPath,
        value,
      });
      expect(second.equals(first)).toBe(true);
      expect(await readOperationJson(paths.admissionPath)).toEqual(value);
      expect((await fs.stat(paths.admissionPath)).mode & 0o222).toBe(0);
    });
  });

  it("rejects drift instead of overwriting existing evidence", async () => {
    await withTempDir({ prefix: "release-operation-drift-" }, async (root) => {
      const paths = resolveReleasePreparationOperationPaths({
        releaseStoreRoot: root,
        operationId: "b".repeat(64),
      });
      await ensureReleasePreparationOperationRoot({ releaseStoreRoot: root, paths });
      await writeImmutableOperationJson({
        operationRoot: paths.operationRoot,
        filePath: paths.resultPath,
        value: { status: "accepted" },
      });
      await expect(
        writeImmutableOperationJson({
          operationRoot: paths.operationRoot,
          filePath: paths.resultPath,
          value: { status: "rejected" },
        }),
      ).rejects.toThrow("already differs");
    });
  });

  it("rejects an operation path outside the content-addressed release store", async () => {
    await withTempDir({ prefix: "release-operation-escape-" }, async (root) => {
      const paths = resolveReleasePreparationOperationPaths({
        releaseStoreRoot: root,
        operationId: "c".repeat(64),
      });
      await ensureReleasePreparationOperationRoot({ releaseStoreRoot: root, paths });
      await expect(
        writeImmutableOperationJson({
          operationRoot: paths.operationRoot,
          filePath: path.join(root, "outside.json"),
          value: {},
        }),
      ).rejects.toThrow("escapes its operation root");
    });
  });
});
