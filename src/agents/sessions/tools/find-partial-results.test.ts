import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ensureToolMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/tools-manager.js", () => ({
  ensureTool: ensureToolMock,
}));

import { createFindToolDefinition } from "./find.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "openclaw-find-partial-"));
  tempDirs.push(dir);
  return dir;
}

async function makeFakeFd(root: string, body: string): Promise<string> {
  const executable = path.join(root, "fake-fd.mjs");
  await writeFile(executable, `#!/usr/bin/env node\n${body}\n`);
  await chmod(executable, 0o755);
  return executable;
}

describe("find tool incomplete traversal", () => {
  afterEach(async () => {
    ensureToolMock.mockReset();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("preserves valid paths and labels incomplete search coverage", async () => {
    const root = await makeTempDir();
    const fakeFd = await makeFakeFd(
      root,
      `console.log(${JSON.stringify(path.join(root, "scripts", "validator.mjs"))});
console.error("unreadable-artifact: Permission denied (os error 13)");
process.exit(1);`,
    );
    ensureToolMock.mockResolvedValue(fakeFd);

    const result = await createFindToolDefinition(root).execute(
      "call-partial",
      { pattern: "*validator*" },
      undefined,
      undefined,
      {} as never,
    );

    expect(result.content[0]).toMatchObject({ type: "text" });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("scripts/validator.mjs");
    expect(text).toContain("Search coverage incomplete");
    expect(result.details?.searchIncomplete).toBe(true);
  });

  it("rejects an incomplete search with no valid paths", async () => {
    const root = await makeTempDir();
    const fakeFd = await makeFakeFd(
      root,
      `console.error("unreadable-artifact: Permission denied (os error 13)");
process.exit(1);`,
    );
    ensureToolMock.mockResolvedValue(fakeFd);

    await expect(
      createFindToolDefinition(root).execute(
        "call-incomplete-empty",
        { pattern: "*validator*" },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("Permission denied");
  });
});
