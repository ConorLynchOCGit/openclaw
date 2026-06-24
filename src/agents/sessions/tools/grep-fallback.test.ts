import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/tools-manager.js", () => ({
  ensureTool: vi.fn(async () => null),
}));

import { createGrepToolDefinition } from "./grep.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "openclaw-grep-fallback-"));
  tempDirs.push(dir);
  return dir;
}

function textContent(
  result: Awaited<ReturnType<ReturnType<typeof createGrepToolDefinition>["execute"]>>,
): string {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("grep tool local fallback", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("searches bounded local files when ripgrep is unavailable", async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(root, "src", "alpha.ts"), "first\nneedle here\n");
    await writeFile(path.join(root, "src", "beta.ts"), "no match\n");
    await writeFile(path.join(root, "node_modules", "dep", "ignored.ts"), "needle ignored\n");

    const tool = createGrepToolDefinition(root);
    const result = await tool.execute(
      "call-1",
      { pattern: "needle", glob: "**/*.ts", literal: true, limit: 10 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("src/alpha.ts:2: needle here");
  });
});
