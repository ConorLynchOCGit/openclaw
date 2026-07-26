import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { SYSTEM_SOURCE_ANCHOR_ENV, resolveLoadedSystemSource } from "./system-change-source.js";

const execFileAsync = promisify(execFile);
const cleanupRoots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function createSourceAnchor(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-system-source-"));
  cleanupRoots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "OpenClaw Test");
  await git(root, "config", "user.email", "openclaw-test@example.invalid");
  await fs.writeFile(path.join(root, "README.md"), "source\n");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "source");
  return root;
}

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true })));
});

describe("system-change source", () => {
  it("uses the package commit independent of source-anchor HEAD", async () => {
    const sourceAnchorPath = await createSourceAnchor();
    const loadedSourceCommit = await git(sourceAnchorPath, "rev-parse", "HEAD");
    await fs.writeFile(path.join(sourceAnchorPath, "README.md"), "later source\n");
    await git(sourceAnchorPath, "add", "README.md");
    await git(sourceAnchorPath, "commit", "-m", "later source");
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-loaded-package-"));
    cleanupRoots.push(packageRoot);
    await fs.mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(packageRoot, "dist", "build-info.json"),
      `${JSON.stringify({ commit: loadedSourceCommit })}\n`,
    );

    await expect(
      resolveLoadedSystemSource({
        env: { [SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
        packageRoot,
      }),
    ).resolves.toEqual({ sourceAnchorPath, sourceCommit: loadedSourceCommit });
  });

  it("leaves local object validation to the native worktree transaction", async () => {
    const sourceAnchorPath = await createSourceAnchor();
    await expect(
      resolveLoadedSystemSource({
        env: { [SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
        packageRoot: "/unused",
        readLoadedSourceCommit: () => "a".repeat(40),
      }),
    ).resolves.toEqual({
      sourceAnchorPath,
      sourceCommit: "a".repeat(40),
    });
  });

  it("rejects invalid source-anchor inputs", async () => {
    await expect(resolveLoadedSystemSource({ env: {} })).rejects.toThrow(
      "must name an absolute source anchor",
    );
    await expect(
      resolveLoadedSystemSource({
        env: { [SYSTEM_SOURCE_ANCHOR_ENV]: "relative/source" },
      }),
    ).rejects.toThrow("must name an absolute source anchor");
  });

  it("rejects missing or abbreviated package build identity", async () => {
    const sourceAnchorPath = await createSourceAnchor();
    const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-loaded-package-"));
    cleanupRoots.push(packageRoot);
    await fs.mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(packageRoot, "dist", "build-info.json"),
      `${JSON.stringify({ commit: "abcdef0" })}\n`,
    );

    await expect(
      resolveLoadedSystemSource({
        env: { [SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
        packageRoot,
      }),
    ).rejects.toThrow("does not contain an exact source commit");
  });
});
