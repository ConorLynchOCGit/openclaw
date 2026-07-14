import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ensureToolMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/tools-manager.js", () => ({
  ensureTool: ensureToolMock,
}));

import { createGrepToolDefinition } from "./grep.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "openclaw-grep-partial-"));
  tempDirs.push(dir);
  return dir;
}

async function makeFakeRipgrep(root: string, body: string): Promise<string> {
  const executable = path.join(root, "fake-rg.mjs");
  await writeFile(executable, `#!/usr/bin/env node\n${body}\n`);
  await chmod(executable, 0o755);
  return executable;
}

describe("grep tool incomplete traversal", () => {
  afterEach(async () => {
    ensureToolMock.mockReset();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("preserves valid matches and labels incomplete search coverage", async () => {
    const root = await makeTempDir();
    const source = path.join(root, "scripts", "validator.mjs");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, "needle here\n");
    const fakeRg = await makeFakeRipgrep(
      root,
      `const source = ${JSON.stringify(source)};
console.log(JSON.stringify({ type: "match", data: { path: { text: source }, lines: { text: "needle here\\n" }, line_number: 1 } }));
console.error("unreadable-artifact: Permission denied (os error 13)");
process.exit(2);`,
    );
    ensureToolMock.mockResolvedValue(fakeRg);

    const result = await createGrepToolDefinition(root).execute(
      "call-partial",
      { pattern: "needle", path: "." },
      undefined,
      undefined,
      {} as never,
    );

    expect(result.content[0]).toMatchObject({ type: "text" });
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("scripts/validator.mjs:1: needle here");
    expect(text).toContain("Search coverage incomplete");
    expect(result.details?.searchIncomplete).toBe(true);
  });

  it("rejects an incomplete search with no valid matches", async () => {
    const root = await makeTempDir();
    const fakeRg = await makeFakeRipgrep(
      root,
      `console.error("unreadable-artifact: Permission denied (os error 13)");
process.exit(2);`,
    );
    ensureToolMock.mockResolvedValue(fakeRg);

    await expect(
      createGrepToolDefinition(root).execute(
        "call-incomplete-empty",
        { pattern: "needle", path: "." },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("Permission denied");
  });
});
