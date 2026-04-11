import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadReusableLatestArtifact,
  resolveLatestArtifactKeyForStep,
  stripArtifactEnvelope,
} from "../../scripts/lib/unchanged-tree-reuse.mjs";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("unchanged tree reuse helpers", () => {
  it("maps reusable pnpm steps to durable artifact keys", () => {
    expect(resolveLatestArtifactKeyForStep("pnpm", ["check:fast"])).toBe("gate-check-fast");
    expect(resolveLatestArtifactKeyForStep("pnpm", ["check"])).toBe("gate-check");
    expect(resolveLatestArtifactKeyForStep("pnpm", ["test"])).toBe("test");
    expect(resolveLatestArtifactKeyForStep("pnpm", ["build"])).toBe("build");
    expect(resolveLatestArtifactKeyForStep("node", ["scripts/run-gate.mjs", "build"])).toBeNull();
  });

  it("drops artifact-envelope fields before reuse metadata is rebuilt", () => {
    expect(
      stripArtifactEnvelope({
        schemaVersion: 1,
        kind: "gate",
        recordedAt: "2026-04-11T00:00:00.000Z",
        status: "success",
        elapsedMs: 123,
        treeFingerprint: "abc",
      }),
    ).toEqual({
      status: "success",
      elapsedMs: 123,
      treeFingerprint: "abc",
    });
  });

  it("reuses unchanged-tree build artifacts only when outputs still exist", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-unchanged-tree-reuse-"));
    cleanupDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, ".local", "gate-metrics", "latest"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, ".local", "build-stamps"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "dist", "control-ui"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "dist", "index.js"), "export {};\n", "utf8");
    fs.writeFileSync(
      path.join(rootDir, "dist", "control-ui", "index.html"),
      "<html></html>\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(rootDir, ".local", "build-stamps", "plugin-sdk-dts.json"),
      "{}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(rootDir, ".local", "gate-metrics", "latest", "build.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: "build",
          recordedAt: "2026-04-11T00:00:00.000Z",
          status: "success",
          treeFingerprint: "same-tree",
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(loadReusableLatestArtifact("build", "same-tree", rootDir)).resolves.toMatchObject({
      status: "success",
      treeFingerprint: "same-tree",
    });

    fs.rmSync(path.join(rootDir, "dist", "index.js"));

    await expect(loadReusableLatestArtifact("build", "same-tree", rootDir)).resolves.toBeNull();
  });

  it("reuses unchanged-tree test artifacts only when they are full-suite results on the same tree", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-unchanged-tree-test-"));
    cleanupDirs.push(rootDir);
    fs.mkdirSync(path.join(rootDir, ".local", "gate-metrics", "latest"), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, ".local", "gate-metrics", "latest", "test.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: "test",
          recordedAt: "2026-04-11T00:00:00.000Z",
          status: "success",
          treeFingerprint: "same-tree",
          scope: {
            kind: "targeted",
            reusableForLanding: false,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(loadReusableLatestArtifact("test", "same-tree", rootDir)).resolves.toBeNull();

    fs.writeFileSync(
      path.join(rootDir, ".local", "gate-metrics", "latest", "test.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: "test",
          recordedAt: "2026-04-11T00:00:00.000Z",
          status: "success",
          treeFingerprint: "same-tree",
          scope: {
            kind: "full-suite",
            reusableForLanding: true,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await expect(loadReusableLatestArtifact("test", "same-tree", rootDir)).resolves.toMatchObject({
      status: "success",
      treeFingerprint: "same-tree",
      scope: {
        kind: "full-suite",
        reusableForLanding: true,
      },
    });
    await expect(loadReusableLatestArtifact("test", "other-tree", rootDir)).resolves.toBeNull();
  });
});
