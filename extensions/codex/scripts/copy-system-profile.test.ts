import fs from "node:fs/promises";
import path from "node:path";
import { resolvePreferredOpenClawTmpDir, withTempWorkspace } from "openclaw/plugin-sdk/temp-path";
import { describe, expect, it } from "vitest";
import { copyCodexSystemProfile } from "./copy-system-profile.mjs";

describe("Codex system profile copy", () => {
  it("copies hidden project config and capability roots", async () => {
    await withTempWorkspace(
      { rootDir: resolvePreferredOpenClawTmpDir(), prefix: "openclaw-codex-system-profile-" },
      async ({ dir }) => {
        const srcDir = path.join(dir, "src");
        const outDir = path.join(dir, "dist");
        await fs.mkdir(path.join(srcDir, "project", ".codex"), { recursive: true });
        await fs.mkdir(path.join(srcDir, "skills", "fixture"), { recursive: true });
        await fs.writeFile(
          path.join(srcDir, "project", ".codex", "config.toml"),
          "model = 'fixture'\n",
        );
        await fs.writeFile(path.join(srcDir, "skills", "fixture", "SKILL.md"), "# Fixture\n");

        await copyCodexSystemProfile({ srcDir, outDir });

        await expect(
          fs.readFile(path.join(outDir, "project", ".codex", "config.toml"), "utf8"),
        ).resolves.toBe("model = 'fixture'\n");
        await expect(
          fs.readFile(path.join(outDir, "skills", "fixture", "SKILL.md"), "utf8"),
        ).resolves.toBe("# Fixture\n");
      },
    );
  });

  it("rejects an incomplete source profile", async () => {
    await withTempWorkspace(
      { rootDir: resolvePreferredOpenClawTmpDir(), prefix: "openclaw-codex-system-profile-" },
      async ({ dir }) => {
        await expect(
          copyCodexSystemProfile({ srcDir: dir, outDir: path.join(dir, "dist") }),
        ).rejects.toThrow();
      },
    );
  });
});
