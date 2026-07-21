import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildInstallPlan,
  deriveReleaseVersion,
  normalizeMigration,
  parseArgs,
  requiredBundledPluginsToEnable,
  resolveRequestedWorkspacePackages,
} from "../../scripts/prepare-native-release-set.mjs";
import { RESOLVED_OBJECT_SET_ALGORITHM } from "../../src/release-manifest.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("prepare-native-release-set", () => {
  it("projects rebuilt and reused lock bytes into the current manifest protocol", () => {
    const integrity = `sha512-${Buffer.alloc(64, 7).toString("base64")}`;
    const lock = Buffer.from(
      JSON.stringify({
        name: "gbrain",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: {
          "": { name: "gbrain", version: "1.0.0" },
          "node_modules/example": {
            version: "2.0.0",
            resolved: "https://registry.npmjs.org/example/-/example-2.0.0.tgz",
            integrity,
          },
        },
      }),
    );

    expect(buildInstallPlan(lock, "https://registry.npmjs.org/")).toMatchObject({
      resolvedObjectSetAlgorithm: RESOLVED_OBJECT_SET_ALGORITHM,
      resolvedObjectCount: 1,
    });
  });

  it("derives one deterministic npm-valid correction version from release inputs", () => {
    const first = deriveReleaseVersion("2026.7.1", "a".repeat(40), "b".repeat(64));
    const repeated = deriveReleaseVersion("2026.7.1", "a".repeat(40), "b".repeat(64));
    const changed = deriveReleaseVersion("2026.7.1", "c".repeat(40), "b".repeat(64));

    expect(first).toBe(repeated);
    expect(first).not.toBe(changed);
    expect(first.startsWith("2026.7.1-")).toBe(true);
    expect(
      first
        .slice("2026.7.1-".length)
        .split("")
        .every((char) => char >= "0" && char <= "9"),
    ).toBe(true);
  });

  it("requires exact input and output paths", () => {
    expect(parseArgs(["--input", "in.json", "--output", "out.json"])).toMatchObject({
      inputPath: expect.stringContaining("in.json"),
      outputPath: expect.stringContaining("out.json"),
    });
    expect(() => parseArgs(["--input", "in.json"])).toThrow("usage:");
    expect(() => parseArgs(["--unknown", "value"])).toThrow("unknown argument");
  });

  it("defaults routine releases to migration-free and preserves explicit migration scope", () => {
    expect(normalizeMigration(undefined)).toEqual({
      class: "migration_free",
      affectedPersistentRoots: [],
    });
    expect(
      normalizeMigration({
        class: "migration_bearing",
        affectedPersistentRoots: ["/srv/openclaw-next/state/state/openclaw.sqlite"],
      }),
    ).toEqual({
      class: "migration_bearing",
      affectedPersistentRoots: ["/srv/openclaw-next/state/state/openclaw.sqlite"],
    });
    expect(() =>
      normalizeMigration({
        class: "migration_free",
        affectedPersistentRoots: ["/srv/openclaw-next/state"],
      }),
    ).toThrow("cannot name affected persistent roots");
  });

  it("rejects non-native base versions", () => {
    expect(() => deriveReleaseVersion("latest", "a".repeat(40), "b".repeat(64))).toThrow(
      "cannot derive",
    );
  });

  it("enables only required bundled plugins reported as disabled", () => {
    expect(
      requiredBundledPluginsToEnable(
        [
          { id: "agency-data", origin: "bundled", status: "disabled" },
          { id: "codex", origin: "managed", status: "loaded" },
          { id: "unrelated", origin: "bundled", status: "disabled" },
          { id: "workboard", origin: "bundled", status: "error" },
        ],
        ["agency-data", "codex", "workboard"],
      ),
    ).toEqual(["agency-data"]);
  });

  it("resolves only accepted external packages through the native pnpm workspace", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-release-workspace-"));
    tempDirs.push(root);
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - extensions/*\n");
    writeJson(path.join(root, "package.json"), {
      name: "release-shape-fixture",
      version: "1.0.0",
      private: true,
    });
    writeJson(path.join(root, "extensions", "codex", "package.json"), {
      name: "@openclaw/codex",
      version: "1.0.0",
    });
    writeJson(path.join(root, "extensions", "bundled", "package.json"), {
      name: "@openclaw/bundled",
      version: "1.0.0",
    });
    fs.mkdirSync(path.join(root, "extensions", "package-less"), { recursive: true });

    const resolved = await resolveRequestedWorkspacePackages(root, ["@openclaw/codex", "gbrain"]);

    expect([...resolved.keys()]).toEqual(["@openclaw/codex"]);
    expect(resolved.get("@openclaw/codex")).toBe(path.join(root, "extensions", "codex"));
    expect(resolved.has("@openclaw/bundled")).toBe(false);
  });
});
