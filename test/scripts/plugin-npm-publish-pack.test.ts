import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

function createHarness(): {
  env: NodeJS.ProcessEnv;
  npmLog: string;
  nodeLog: string;
  packageDir: string;
  outputDir: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-plugin-pack-mode-"));
  tempDirs.push(root);
  const binDir = path.join(root, "bin");
  const packageDir = path.join(root, "plugin");
  const outputDir = path.join(root, "packed");
  const npmLog = path.join(root, "npm.log");
  const nodeLog = path.join(root, "node.log");
  fs.mkdirSync(binDir);
  fs.mkdirSync(packageDir);
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@openclaw/test-pack", version: "2026.7.19" })}\n`,
  );

  writeExecutable(
    path.join(binDir, "npm"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$OPENCLAW_TEST_NPM_LOG"
if [[ "\${1:-}" == "view" ]]; then
  printf '%s\\n' '2026.7.18-beta.1'
fi
`,
  );
  writeExecutable(
    path.join(binDir, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$OPENCLAW_TEST_NODE_LOG"
case "\${1:-}" in
  scripts/generate-npm-shrinkwrap.mjs|scripts/lib/plugin-npm-package-manifest.mjs)
    exit 0
    ;;
esac
exec "$OPENCLAW_REAL_NODE" "$@"
`,
  );

  return {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      OPENCLAW_REAL_NODE: process.execPath,
      OPENCLAW_TEST_NPM_LOG: npmLog,
      OPENCLAW_TEST_NODE_LOG: nodeLog,
      OPENCLAW_PLUGIN_NPM_RUNTIME_BUILD: "0",
      OPENCLAW_PLUGIN_NPM_PACK_OUTPUT_DIR: outputDir,
    },
    npmLog,
    nodeLog,
    packageDir,
    outputDir,
  };
}

function runPublishScript(
  harness: ReturnType<typeof createHarness>,
  mode: "--dry-run" | "--pack" | "--pack-dry-run",
): ReturnType<typeof spawnSync> {
  return spawnSync("bash", ["scripts/plugin-npm-publish.sh", mode, harness.packageDir], {
    cwd: process.cwd(),
    env: harness.env,
    encoding: "utf8",
  });
}

describe("plugin npm pack modes", () => {
  it.each(["--pack", "--pack-dry-run"] as const)(
    "%s never resolves mutable beta dist-tag state",
    (mode) => {
      const harness = createHarness();
      const result = runPublishScript(harness, mode);

      expect(result.status, result.stderr).toBe(0);
      const npmCalls = fs.existsSync(harness.npmLog) ? fs.readFileSync(harness.npmLog, "utf8") : "";
      expect(npmCalls).not.toContain("view @openclaw/test-pack dist-tags.beta");
      const nodeCalls = fs.readFileSync(harness.nodeLog, "utf8");
      expect(nodeCalls).toContain("scripts/lib/plugin-npm-package-manifest.mjs");
      expect(nodeCalls).toContain("npm pack --json --ignore-scripts");
      expect(nodeCalls.includes("--dry-run")).toBe(mode === "--pack-dry-run");
      if (mode === "--pack") {
        expect(fs.statSync(harness.outputDir).isDirectory()).toBe(true);
      }
    },
  );

  it("leaves publish-channel lookup in the non-pack planning path", () => {
    const harness = createHarness();
    const result = runPublishScript(harness, "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(harness.npmLog, "utf8")).toContain(
      "view @openclaw/test-pack dist-tags.beta",
    );
  });
});
