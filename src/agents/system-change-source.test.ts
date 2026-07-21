import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV,
  resolveLoadedSystemSource,
} from "./system-change-source.js";

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
  it("uses the exact commit embedded in the loaded package, independent of anchor HEAD", async () => {
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
        env: { [OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
        packageRoot,
      }),
    ).resolves.toEqual({ sourceAnchorPath, sourceCommit: loadedSourceCommit });
  });

  it("rejects a loaded commit that is absent from the source store", async () => {
    const sourceAnchorPath = await createSourceAnchor();
    await expect(
      resolveLoadedSystemSource({
        env: { [OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
        packageRoot: "/unused",
        readLoadedSourceCommit: () => "a".repeat(40),
      }),
    ).rejects.toThrow("loaded source commit is unavailable in the source store");
  });

  it("rejects a missing or relative source anchor before Git execution", async () => {
    await expect(resolveLoadedSystemSource({ env: {} })).rejects.toThrow(
      "must name an absolute source anchor",
    );
    await expect(
      resolveLoadedSystemSource({
        env: { [OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]: "relative/source" },
      }),
    ).rejects.toThrow("must name an absolute source anchor");
  });
});
