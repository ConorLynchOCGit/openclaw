import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyCodexSystemProfileAssets } from "./copy-system-profile.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-codex-profile-assets-"));
  tempDirs.push(dir);
  return dir;
}

describe("Codex system profile assets", () => {
  it("replaces the output with the complete immutable profile, including hidden paths", async () => {
    const root = await makeTempDir();
    const sourceDir = path.join(root, "source");
    const outputDir = path.join(root, "dist", "extensions", "codex", "system-profile");
    await fs.mkdir(path.join(sourceDir, "project", ".codex", "agents"), { recursive: true });
    await fs.mkdir(path.join(sourceDir, "tools"), { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "project", ".codex", "config.toml"), 'model = "x"\n');
    await fs.writeFile(
      path.join(sourceDir, "project", ".codex", "agents", "implementer.toml"),
      'name = "implementer"\n',
    );
    await fs.writeFile(
      path.join(sourceDir, "tools", "openclaw-repo-workbench.mjs"),
      "export {};\n",
    );
    await fs.writeFile(path.join(outputDir, "stale.txt"), "stale\n");

    await copyCodexSystemProfileAssets({ sourceDir, outputDir });

    await expect(fs.readFile(path.join(outputDir, "stale.txt"), "utf8")).rejects.toThrow();
    await expect(
      fs.readFile(path.join(outputDir, "project", ".codex", "config.toml"), "utf8"),
    ).resolves.toBe('model = "x"\n');
    await expect(
      fs.readFile(path.join(outputDir, "project", ".codex", "agents", "implementer.toml"), "utf8"),
    ).resolves.toBe('name = "implementer"\n');
  });

  it("rejects overlapping source and output trees", async () => {
    const root = await makeTempDir();
    await expect(
      copyCodexSystemProfileAssets({
        sourceDir: root,
        outputDir: path.join(root, "dist"),
      }),
    ).rejects.toThrow("must not overlap");
  });
});
