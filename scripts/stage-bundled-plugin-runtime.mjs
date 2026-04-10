import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  hashInputs,
  readBuildStamp,
  resolveBuildStampPath,
  writeBuildStamp,
} from "./lib/build-fingerprint.mjs";
import { removePathIfExists } from "./runtime-postbuild-shared.mjs";

const OVERLAY_STAMP = ".openclaw-runtime-overlay-stamp.json";

function symlinkType() {
  return process.platform === "win32" ? "junction" : "dir";
}

function relativeSymlinkTarget(sourcePath, targetPath) {
  const relativeTarget = path.relative(path.dirname(targetPath), sourcePath);
  return relativeTarget || ".";
}

function ensureSymlink(targetValue, targetPath, type) {
  try {
    fs.symlinkSync(targetValue, targetPath, type);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }

  try {
    if (fs.lstatSync(targetPath).isSymbolicLink() && fs.readlinkSync(targetPath) === targetValue) {
      return;
    }
  } catch {
    // Fall through and recreate the target when inspection fails.
  }

  removePathIfExists(targetPath);
  fs.symlinkSync(targetValue, targetPath, type);
}

function symlinkPath(sourcePath, targetPath, type) {
  ensureSymlink(relativeSymlinkTarget(sourcePath, targetPath), targetPath, type);
}

function shouldWrapRuntimeJsFile(sourcePath) {
  return path.extname(sourcePath) === ".js";
}

function shouldCopyRuntimeFile(sourcePath) {
  const relativePath = sourcePath.replace(/\\/g, "/");
  return (
    relativePath.endsWith("/package.json") ||
    relativePath.endsWith("/openclaw.plugin.json") ||
    relativePath.endsWith("/.codex-plugin/plugin.json") ||
    relativePath.endsWith("/.claude-plugin/plugin.json") ||
    relativePath.endsWith("/.cursor-plugin/plugin.json")
  );
}

function writeRuntimeModuleWrapper(sourcePath, targetPath) {
  const specifier = relativeSymlinkTarget(sourcePath, targetPath).replace(/\\/g, "/");
  const normalizedSpecifier = specifier.startsWith(".") ? specifier : `./${specifier}`;
  fs.writeFileSync(
    targetPath,
    [
      `export * from ${JSON.stringify(normalizedSpecifier)};`,
      `import * as module from ${JSON.stringify(normalizedSpecifier)};`,
      "export default module.default;",
      "",
    ].join("\n"),
    "utf8",
  );
}

function stagePluginRuntimeOverlay(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const dirent of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (dirent.name === "node_modules") {
      continue;
    }

    const sourcePath = path.join(sourceDir, dirent.name);
    const targetPath = path.join(targetDir, dirent.name);

    if (dirent.isDirectory()) {
      stagePluginRuntimeOverlay(sourcePath, targetPath);
      continue;
    }

    if (dirent.isSymbolicLink()) {
      ensureSymlink(fs.readlinkSync(sourcePath), targetPath);
      continue;
    }

    if (!dirent.isFile()) {
      continue;
    }

    if (shouldWrapRuntimeJsFile(sourcePath)) {
      writeRuntimeModuleWrapper(sourcePath, targetPath);
      continue;
    }

    if (shouldCopyRuntimeFile(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      continue;
    }

    symlinkPath(sourcePath, targetPath);
  }
}

function linkPluginNodeModules(params) {
  const runtimeNodeModulesDir = path.join(params.runtimePluginDir, "node_modules");
  removePathIfExists(runtimeNodeModulesDir);
  if (!fs.existsSync(params.sourcePluginNodeModulesDir)) {
    return;
  }
  ensureSymlink(params.sourcePluginNodeModulesDir, runtimeNodeModulesDir, symlinkType());
}

function createPluginRuntimeOverlayFingerprint(repoRoot, distPluginDir) {
  const relativePluginDir = path.relative(repoRoot, distPluginDir);
  return hashInputs(repoRoot, [relativePluginDir], {
    ignorePath(absolutePath, relativePath) {
      const baseName = path.basename(absolutePath);
      if (baseName === "node_modules" || baseName === OVERLAY_STAMP) {
        return true;
      }
      return relativePath.endsWith("/.openclaw-runtime-deps-stamp.json");
    },
  });
}

export function stageBundledPluginRuntime(params = {}) {
  const repoRoot = params.cwd ?? params.repoRoot ?? process.cwd();
  const distRoot = path.join(repoRoot, "dist");
  const runtimeRoot = path.join(repoRoot, "dist-runtime");
  const distExtensionsRoot = path.join(distRoot, "extensions");
  const runtimeExtensionsRoot = path.join(runtimeRoot, "extensions");

  if (!fs.existsSync(distExtensionsRoot)) {
    removePathIfExists(runtimeRoot);
    return;
  }

  fs.mkdirSync(runtimeExtensionsRoot, { recursive: true });
  const livePluginNames = new Set();

  for (const dirent of fs.readdirSync(distExtensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    livePluginNames.add(dirent.name);
    const distPluginDir = path.join(distExtensionsRoot, dirent.name);
    const runtimePluginDir = path.join(runtimeExtensionsRoot, dirent.name);
    const distPluginNodeModulesDir = path.join(distPluginDir, "node_modules");
    const overlayFingerprint = createPluginRuntimeOverlayFingerprint(repoRoot, distPluginDir);
    const stampPath = resolveBuildStampPath(repoRoot, "runtime-overlay", `${dirent.name}.json`);
    const existingStamp = readBuildStamp(stampPath);

    if (
      existingStamp?.fingerprint !== overlayFingerprint ||
      !fs.existsSync(runtimePluginDir) ||
      !fs.existsSync(path.join(runtimePluginDir, "index.js"))
    ) {
      removePathIfExists(runtimePluginDir);
      stagePluginRuntimeOverlay(distPluginDir, runtimePluginDir);
      writeBuildStamp(stampPath, {
        fingerprint: overlayFingerprint,
        generatedAt: new Date().toISOString(),
      });
    }
    linkPluginNodeModules({
      runtimePluginDir,
      sourcePluginNodeModulesDir: distPluginNodeModulesDir,
    });
  }

  for (const dirent of fs.readdirSync(runtimeExtensionsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    if (!livePluginNames.has(dirent.name)) {
      removePathIfExists(path.join(runtimeExtensionsRoot, dirent.name));
    }
  }

  const stampDir = resolveBuildStampPath(repoRoot, "runtime-overlay");
  if (fs.existsSync(stampDir)) {
    for (const dirent of fs.readdirSync(stampDir, { withFileTypes: true })) {
      if (!dirent.isFile() || !dirent.name.endsWith(".json")) {
        continue;
      }
      const pluginId = dirent.name.replace(/\.json$/u, "");
      if (!livePluginNames.has(pluginId)) {
        removePathIfExists(path.join(stampDir, dirent.name));
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  stageBundledPluginRuntime();
}
