import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV,
  resolveLoadedSystemChangeSessionSource,
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
  it("uses the source anchor's exact checked-out commit", async () => {
    const sourceAnchorPath = await createSourceAnchor();
    const sourceCommit = await git(sourceAnchorPath, "rev-parse", "HEAD");

    await expect(
      resolveLoadedSystemChangeSessionSource({
        env: { [OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]: sourceAnchorPath },
      }),
    ).resolves.toEqual({ sourceAnchorPath, sourceCommit });
  });

  it("rejects a missing or relative source anchor before Git execution", async () => {
    await expect(resolveLoadedSystemChangeSessionSource({ env: {} })).rejects.toThrow(
      "must name an absolute source anchor",
    );
    await expect(
      resolveLoadedSystemChangeSessionSource({
        env: { [OPENCLAW_SYSTEM_SOURCE_ANCHOR_ENV]: "relative/source" },
      }),
    ).rejects.toThrow("must name an absolute source anchor");
  });
});
