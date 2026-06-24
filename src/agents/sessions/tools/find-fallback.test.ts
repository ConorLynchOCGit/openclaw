import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/tools-manager.js", () => ({
  ensureTool: vi.fn(async () => null),
}));

import { createFindToolDefinition } from "./find.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "openclaw-find-fallback-"));
  tempDirs.push(dir);
  return dir;
}

function textContent(
  result: Awaited<ReturnType<ReturnType<typeof createFindToolDefinition>["execute"]>>,
): string {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("find tool local fallback", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("searches the local filesystem when fd is unavailable", async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(root, "src", "alpha.ts"), "export const alpha = true;\n");
    await writeFile(path.join(root, "src", "beta.test.ts"), "test('beta', () => {});\n");
    await writeFile(path.join(root, "node_modules", "dep", "ignored.ts"), "ignored\n");

    const tool = createFindToolDefinition(root);
    const result = await tool.execute(
      "call-1",
      { pattern: "src/**/*.ts", limit: 10 },
      undefined,
      undefined,
      {} as never,
    );

    expect(textContent(result)).toBe("src/alpha.ts\nsrc/beta.test.ts");
  });
});
