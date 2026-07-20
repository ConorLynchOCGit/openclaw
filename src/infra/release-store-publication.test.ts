import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishReleaseArtifact, publishReleaseMetadata } from "./release-store-publication.js";

describe("release store publication", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "openclaw-release-store-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("publishes one immutable content-addressed artifact idempotently", async () => {
    const source = path.join(root, "package.tgz");
    await fs.writeFile(source, "exact package bytes\n");

    const first = await publishReleaseArtifact({
      releaseStoreRoot: root,
      sourcePath: source,
      fileName: "openclaw-test.tgz",
    });
    const second = await publishReleaseArtifact({
      releaseStoreRoot: root,
      sourcePath: source,
      fileName: "openclaw-test.tgz",
    });

    expect(second).toEqual(first);
    expect(first.relativePath).toBe(
      path.join("artifacts", "sha256", first.sha256, "openclaw-test.tgz"),
    );
    expect((await fs.stat(first.filePath)).mode & 0o222).toBe(0);
    await expect(fs.readFile(first.filePath, "utf8")).resolves.toBe("exact package bytes\n");
  });

  it("publishes exact manifest bytes under their digest", async () => {
    const published = await publishReleaseMetadata({
      releaseStoreRoot: root,
      namespace: "manifests",
      bytes: Buffer.from('{"schema":"test"}\n'),
    });
    expect(published.relativePath).toBe(
      path.join("manifests", "sha256", `${published.sha256}.json`),
    );
  });

  it("rejects a symbolic-link namespace instead of following it", async () => {
    const outside = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "outside-store-"));
    try {
      await fs.symlink(outside, path.join(root, "artifacts"));
      const source = path.join(root, "package.tgz");
      await fs.writeFile(source, "bytes\n");
      await expect(
        publishReleaseArtifact({ releaseStoreRoot: root, sourcePath: source }),
      ).rejects.toThrow("real directory");
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
