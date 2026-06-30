// List Prod Store Packages tests cover list prod store packages script behavior.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempRepoRoot } from "../helpers/temp-repo.js";

const scriptPath = resolve("scripts/list-prod-store-packages.mjs");
const tempDirs: string[] = [];

function runListProdStorePackages(input: unknown, cwd = process.cwd()) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    input: JSON.stringify(input),
  });
}

function runListProdStorePackagesFromLockfile(cwd = process.cwd()) {
  return spawnSync(process.execPath, [scriptPath, "--from-lockfile"], {
    cwd,
    encoding: "utf8",
  });
}

describe("list-prod-store-packages", () => {
  afterEach(() => {
    cleanupTempDirs(tempDirs);
  });

  it("accepts pnpm list array output", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    const result = runListProdStorePackages(
      [
        {
          dependencies: {
            sourceMap: {
              from: "source-map",
              resolved: "https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz",
              version: "0.6.1",
            },
          },
        },
      ],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("source-map@0.6.1");
  });

  it("accepts pnpm list object output", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    const result = runListProdStorePackages(
      {
        dependencies: {
          litSignals: {
            from: "@lit-labs/signals",
            resolved: "https://registry.npmjs.org/@lit-labs/signals/-/signals-0.1.3.tgz",
            version: "0.1.3",
          },
        },
      },
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("@lit-labs/signals@0.1.3");
  });

  it("adds lockfile snapshot dependencies missing from pnpm list output", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    mkdirSync(join(cwd, "scripts"));
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "packages:",
        "  source-map-support@0.5.21:",
        "    resolution: {integrity: sha512-test}",
        "  source-map@0.6.1:",
        "    resolution: {integrity: sha512-test}",
        "",
        "snapshots:",
        "  source-map-support@0.5.21:",
        "    dependencies:",
        "      source-map: 0.6.1",
        "  source-map@0.6.1: {}",
        "",
      ].join("\n"),
    );
    const result = runListProdStorePackages(
      {
        dependencies: {
          sourceMapSupport: {
            from: "source-map-support",
            resolved:
              "https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.21.tgz",
            version: "0.5.21",
          },
        },
      },
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("source-map-support@0.5.21\nsource-map@0.6.1");
  });

  it("adds target optional dependencies from peer-resolved lockfile snapshots", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    const platformPackages = [
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["linux", "arm64"],
      ["linux", "x64"],
      ["win32", "arm64"],
      ["win32", "x64"],
    ] as const;
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "packages:",
        "  native-wrapper@1.0.0:",
        "    resolution: {integrity: sha512-test}",
        ...platformPackages.flatMap(([os, cpu]) => [
          `  native-wrapper-${os}-${cpu}@1.0.0:`,
          "    resolution: {integrity: sha512-test}",
          `    cpu: [${cpu}]`,
          `    os: [${os}]`,
        ]),
        "",
        "snapshots:",
        "  native-wrapper@1.0.0(peer@1.0.0):",
        "    optionalDependencies:",
        ...platformPackages.map(([os, cpu]) => `      native-wrapper-${os}-${cpu}: 1.0.0`),
        ...platformPackages.flatMap(([os, cpu]) => [
          `  native-wrapper-${os}-${cpu}@1.0.0:`,
          "    optional: true",
        ]),
        "",
      ].join("\n"),
    );
    const result = runListProdStorePackages(
      {
        dependencies: {
          nativeWrapper: {
            from: "native-wrapper",
            resolved: "https://registry.npmjs.org/native-wrapper/-/native-wrapper-1.0.0.tgz",
            version: "1.0.0(peer@1.0.0)",
          },
        },
      },
      cwd,
    );

    expect(result.status).toBe(0);
    const expectedPlatformPackage = [`native-wrapper-${process.platform}-${process.arch}@1.0.0`];
    const supportedPlatformPackage = ["linux", "darwin", "win32"].includes(process.platform)
      ? expectedPlatformPackage
      : [];
    expect(result.stdout.split("\n").filter(Boolean)).toEqual(
      ["native-wrapper@1.0.0", "peer@1.0.0", ...supportedPlatformPackage].toSorted((a, b) =>
        a.localeCompare(b),
      ),
    );
  });

  it("does not add unrelated lockfile packages missing from pnpm list output", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "packages:",
        "  recma-jsx@1.0.1(acorn@8.16.0):",
        "    resolution: {integrity: sha512-test}",
        "",
        "snapshots: {}",
        "",
      ].join("\n"),
    );
    const result = runListProdStorePackages({ dependencies: {} }, cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("derives runtime specs directly from lockfile importers", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "importers:",
        "  .:",
        "    dependencies:",
        "      source-map-support:",
        "        specifier: 0.5.21",
        "        version: 0.5.21",
        "",
        "packages:",
        "  source-map-support@0.5.21:",
        "    resolution: {integrity: sha512-test}",
        "  source-map@0.6.1:",
        "    resolution: {integrity: sha512-test}",
        "",
        "snapshots:",
        "  source-map-support@0.5.21:",
        "    dependencies:",
        "      source-map: 0.6.1",
        "  source-map@0.6.1: {}",
        "",
      ].join("\n"),
    );

    const result = runListProdStorePackagesFromLockfile(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("source-map-support@0.5.21\nsource-map@0.6.1");
  });

  it("derives alias optional package specs from lockfile mode", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "importers:",
        "  .:",
        "    dependencies:",
        "      '@openai/codex':",
        "        specifier: 0.139.0",
        "        version: 0.139.0",
        "",
        "packages:",
        "  '@openai/codex@0.139.0':",
        "    resolution: {integrity: sha512-test}",
        "  '@openai/codex@0.139.0-linux-x64':",
        "    resolution: {integrity: sha512-test}",
        "    cpu: [x64]",
        "    os: [linux]",
        "",
        "snapshots:",
        "  '@openai/codex@0.139.0':",
        "    optionalDependencies:",
        "      '@openai/codex-linux-x64': '@openai/codex@0.139.0-linux-x64'",
        "  '@openai/codex@0.139.0-linux-x64':",
        "    optional: true",
        "",
      ].join("\n"),
    );

    const result = runListProdStorePackagesFromLockfile(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toEqual([
      "@openai/codex@0.139.0",
      "@openai/codex@0.139.0-linux-x64",
    ]);
  });

  it("derives peer-context dependencies from lockfile mode", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "importers:",
        "  .:",
        "    dependencies:",
        "      voice:",
        "        specifier: 1.0.0",
        "        version: 1.0.0(peer-helper@2.0.0)",
        "",
        "packages:",
        "  voice@1.0.0:",
        "    resolution: {integrity: sha512-test}",
        "  peer-helper@2.0.0:",
        "    resolution: {integrity: sha512-test}",
        "  peer-child@3.0.0:",
        "    resolution: {integrity: sha512-test}",
        "",
        "snapshots:",
        "  voice@1.0.0(peer-helper@2.0.0):",
        "    dependencies:",
        "      peer-child: 3.0.0",
        "  peer-helper@2.0.0: {}",
        "  peer-child@3.0.0: {}",
        "",
      ].join("\n"),
    );

    const result = runListProdStorePackagesFromLockfile(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toEqual([
      "peer-child@3.0.0",
      "peer-helper@2.0.0",
      "voice@1.0.0",
    ]);
  });

  it("keeps target-compatible helpers from unsupported optional package snapshots", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "importers:",
        "  .:",
        "    dependencies:",
        "      native-wrapper:",
        "        specifier: 1.0.0",
        "        version: 1.0.0",
        "",
        "packages:",
        "  native-wrapper@1.0.0:",
        "    resolution: {integrity: sha512-test}",
        "  native-wrapper-wasm32@1.0.0:",
        "    resolution: {integrity: sha512-test}",
        "    cpu: [wasm32]",
        "  wasm-helper@2.0.0:",
        "    resolution: {integrity: sha512-test}",
        "",
        "snapshots:",
        "  native-wrapper@1.0.0:",
        "    optionalDependencies:",
        "      native-wrapper-wasm32: 1.0.0",
        "  native-wrapper-wasm32@1.0.0:",
        "    optional: true",
        "    dependencies:",
        "      wasm-helper: 2.0.0",
        "  wasm-helper@2.0.0: {}",
        "",
      ].join("\n"),
    );

    const result = runListProdStorePackagesFromLockfile(cwd);

    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toEqual([
      "native-wrapper@1.0.0",
      "wasm-helper@2.0.0",
    ]);
  });

  it("only adds optional platform packages matching the current target", () => {
    const cwd = makeTempRepoRoot(tempDirs, "openclaw-prod-store-packages-");
    const platformPackages = [
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["linux", "arm64"],
      ["linux", "x64"],
      ["win32", "arm64"],
      ["win32", "x64"],
    ] as const;
    const expectedPlatformPackage = platformPackages
      .map(([os, cpu]) => `@zed-industries/codex-acp-${os}-${cpu}@0.15.0`)
      .find(
        (spec) => spec === `@zed-industries/codex-acp-${process.platform}-${process.arch}@0.15.0`,
      );
    writeFileSync(
      join(cwd, "pnpm-lock.yaml"),
      [
        "lockfileVersion: '10.0'",
        "",
        "packages:",
        "  '@zed-industries/codex-acp@0.15.0':",
        "    resolution: {integrity: sha512-test}",
        ...platformPackages.flatMap(([os, cpu]) => [
          `  '@zed-industries/codex-acp-${os}-${cpu}@0.15.0':`,
          "    resolution: {integrity: sha512-test}",
          `    cpu: [${cpu}]`,
          `    os: [${os}]`,
        ]),
        "",
        "snapshots:",
        "  '@zed-industries/codex-acp@0.15.0':",
        "    optionalDependencies:",
        ...platformPackages.map(
          ([os, cpu]) => `      '@zed-industries/codex-acp-${os}-${cpu}': 0.15.0`,
        ),
        ...platformPackages.flatMap(([os, cpu]) => [
          `  '@zed-industries/codex-acp-${os}-${cpu}@0.15.0':`,
          "    optional: true",
        ]),
        "",
      ].join("\n"),
    );
    const result = runListProdStorePackages(
      {
        dependencies: {
          codexAcp: {
            from: "@zed-industries/codex-acp",
            resolved: "https://registry.npmjs.org/@zed-industries/codex-acp/-/codex-acp-0.15.0.tgz",
            version: "0.15.0",
          },
        },
      },
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter(Boolean)).toEqual(
      [expectedPlatformPackage, "@zed-industries/codex-acp@0.15.0"].filter(Boolean),
    );
  });
});
