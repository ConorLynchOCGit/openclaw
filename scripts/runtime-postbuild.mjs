import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyBundledPluginMetadata } from "./copy-bundled-plugin-metadata.mjs";
import { copyPluginSdkRootAlias } from "./copy-plugin-sdk-root-alias.mjs";
import { writeTextFileIfChanged } from "./runtime-postbuild-shared.mjs";
import { stageBundledPluginRuntimeDeps } from "./stage-bundled-plugin-runtime-deps.mjs";
import { stageBundledPluginRuntime } from "./stage-bundled-plugin-runtime.mjs";
import { writeOfficialChannelCatalog } from "./write-official-channel-catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_RUNTIME_ALIAS_PATTERN = /^(?<base>.+\.(?:runtime|contract))-[A-Za-z0-9_-]+\.js$/u;

/**
 * Copy static (non-transpiled) runtime assets that are referenced by their
 * source-relative path inside bundled extension code.
 *
 * Each entry: { src: repo-root-relative source, dest: dist-relative dest }
 */
export const STATIC_EXTENSION_ASSETS = [
  // acpx MCP proxy — co-deployed alongside the acpx index bundle so that
  // `path.resolve(dirname(import.meta.url), "mcp-proxy.mjs")` resolves correctly
  // at runtime (see extensions/acpx/src/runtime-internals/mcp-agent-command.ts).
  {
    src: "extensions/acpx/src/runtime-internals/mcp-proxy.mjs",
    dest: "dist/extensions/acpx/mcp-proxy.mjs",
  },
];

export function copyStaticExtensionAssets(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const assets = params.assets ?? STATIC_EXTENSION_ASSETS;
  const fsImpl = params.fs ?? fs;
  const warn = params.warn ?? console.warn;
  for (const { src, dest } of assets) {
    const srcPath = path.join(rootDir, src);
    const destPath = path.join(rootDir, dest);
    if (fsImpl.existsSync(srcPath)) {
      fsImpl.mkdirSync(path.dirname(destPath), { recursive: true });
      fsImpl.copyFileSync(srcPath, destPath);
    } else {
      warn(`[runtime-postbuild] static asset not found, skipping: ${src}`);
    }
  }
}

export function writeStableRootRuntimeAliases(params = {}) {
  const rootDir = params.rootDir ?? ROOT;
  const distDir = path.join(rootDir, "dist");
  const fsImpl = params.fs ?? fs;
  let entries = [];
  try {
    entries = fsImpl.readdirSync(distDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(ROOT_RUNTIME_ALIAS_PATTERN);
    if (!match?.groups?.base) {
      continue;
    }
    const aliasPath = path.join(distDir, `${match.groups.base}.js`);
    writeTextFileIfChanged(aliasPath, `export * from "./${entry.name}";\n`);
  }
}

export function runRuntimePostBuild(params = {}) {
  const log = params.log ?? (() => {});
  const repoRoot = params.cwd ?? params.repoRoot ?? params.rootDir ?? process.cwd();
  const timingFilePath =
    params.timingFilePath ??
    (typeof process.env.OPENCLAW_RUNTIME_POSTBUILD_TIMINGS_FILE === "string"
      ? process.env.OPENCLAW_RUNTIME_POSTBUILD_TIMINGS_FILE
      : "");
  /** @type {Array<[string, (params?: Record<string, unknown>) => void]>} */
  const phases = params.phases ?? [
    ["plugin-sdk-root-alias", copyPluginSdkRootAlias],
    ["bundled-plugin-metadata", copyBundledPluginMetadata],
    ["official-channel-catalog", writeOfficialChannelCatalog],
    ["bundled-plugin-runtime-deps", stageBundledPluginRuntimeDeps],
    ["bundled-plugin-runtime", stageBundledPluginRuntime],
    ["stable-root-runtime-aliases", writeStableRootRuntimeAliases],
    ["static-extension-assets", copyStaticExtensionAssets],
  ];

  const timings = [];
  for (const [name, fn] of phases) {
    const startedAt = performance.now();
    log(`[runtime-postbuild] ${name} start`);
    fn({
      ...params,
      cwd: repoRoot,
      repoRoot,
      rootDir: repoRoot,
    });
    const elapsedMs = performance.now() - startedAt;
    timings.push({ name, elapsedMs });
    log(`[runtime-postbuild] ${name} done (${(elapsedMs / 1000).toFixed(2)}s)`);
  }
  if (timingFilePath) {
    fs.mkdirSync(path.dirname(timingFilePath), { recursive: true });
    fs.writeFileSync(
      timingFilePath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          phases: timings,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  return timings;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRuntimePostBuild({ log: (line) => process.stdout.write(`${line}\n`) });
}
