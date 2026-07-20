// Verifies that the running Gateway loaded the package-owned release generation it declares.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveOpenClawPackageRootSync } from "./infra/openclaw-root.js";
import type { PluginRecord, PluginRegistry } from "./plugins/registry-types.js";
import {
  loadEmbeddedReleaseManifest,
  packageDeclaresReleaseManifest,
  type LoadedReleaseIdentity,
} from "./release-manifest-readback.js";

export type LoadedReleasePluginOrigin = {
  pluginId: string;
  packageName: string;
  packageVersion: string;
  pluginManifestSha256: string;
  compatibilityRange: string;
  originKind: string;
  installedRoot: string;
};

export type LoadedReleaseReadiness = {
  ready: boolean;
  identity?: LoadedReleaseIdentity;
  pluginOrigins: LoadedReleasePluginOrigin[];
  errors: string[];
};

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function digestRegularFile(filePath: string, label: string): string {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  }
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolveInstalledRoot(plugin: PluginRecord): string {
  const root = plugin.rootDir?.trim();
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root) {
    throw new Error(`plugin ${plugin.id} has no absolute normalized installed root`);
  }
  const source = path.resolve(plugin.source);
  const relativeSource = path.relative(root, source);
  if (
    relativeSource === "" ||
    relativeSource === ".." ||
    relativeSource.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeSource)
  ) {
    throw new Error(`plugin ${plugin.id} source is outside its installed root`);
  }
  return root;
}

function buildLoadedReleaseIdentity(
  loaded: ReturnType<typeof loadEmbeddedReleaseManifest>,
): LoadedReleaseIdentity {
  return {
    releaseManifestDigest: loaded.releaseManifestDigest,
    sourceTreeObject: loaded.manifest.source.treeObject,
    packageVersion: loaded.manifest.package.version,
    packageShape: loaded.manifest.package.shape,
    predecessorReleaseManifestDigest: loaded.manifest.predecessor.releaseManifestDigest,
    predecessorSourceTreeObject: loaded.manifest.predecessor.sourceTreeObject,
    requiredPluginIds: [...loaded.manifest.loadedReadiness.requiredPluginIds],
    codexCapabilityDigest: loaded.manifest.codex.capabilityDigest,
  };
}

/**
 * Return package-owned generation readiness, or undefined for pre-bridge/dev
 * packages that do not declare the immutable release protocol.
 */
export function readLoadedReleaseReadiness(
  params: {
    packageRoot?: string | null;
    pluginRegistry?: PluginRegistry | null;
  } = {},
): LoadedReleaseReadiness | undefined {
  const packageRoot =
    params.packageRoot ??
    resolveOpenClawPackageRootSync({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    });
  if (!packageRoot) {
    return undefined;
  }

  try {
    if (!packageDeclaresReleaseManifest(packageRoot)) {
      return undefined;
    }
    const loaded = loadEmbeddedReleaseManifest(packageRoot);
    const registry = params.pluginRegistry;
    const errors: string[] = [];
    const pluginOrigins: LoadedReleasePluginOrigin[] = [];
    const artifactByPluginId = new Map(
      loaded.manifest.artifacts.flatMap((artifact) =>
        artifact.ownedPluginIds.map((pluginId) => [pluginId, artifact] as const),
      ),
    );
    const loadedById = new Map<string, PluginRecord>();
    for (const plugin of registry?.plugins ?? []) {
      if (plugin.status !== "loaded") {
        continue;
      }
      if (loadedById.has(plugin.id)) {
        errors.push(`loaded plugin registry contains duplicate ${plugin.id}`);
        continue;
      }
      loadedById.set(plugin.id, plugin);
    }

    const required = new Set(loaded.manifest.loadedReadiness.requiredPluginIds);
    for (const pluginId of loaded.manifest.loadedReadiness.requiredPluginIds) {
      const artifact = artifactByPluginId.get(pluginId);
      const plugin = loadedById.get(pluginId);
      if (!artifact) {
        errors.push(`required plugin ${pluginId} has no release artifact owner`);
        continue;
      }
      if (!plugin) {
        errors.push(`required plugin ${pluginId} is not loaded`);
        continue;
      }

      try {
        const installedRoot = resolveInstalledRoot(plugin);
        const packageName = plugin.packageName?.trim() ?? "";
        const packageVersion = plugin.version?.trim() ?? "";
        const expectedOrigin = artifact.role === "core" ? "bundled" : "global";
        if (packageName !== artifact.packageName) {
          errors.push(
            `${pluginId}.packageName mismatch: expected ${artifact.packageName}, observed ${packageName || "missing"}`,
          );
        }
        if (packageVersion !== artifact.packageVersion) {
          errors.push(
            `${pluginId}.packageVersion mismatch: expected ${artifact.packageVersion}, observed ${packageVersion || "missing"}`,
          );
        }
        if (plugin.origin !== expectedOrigin) {
          errors.push(
            `${pluginId}.origin mismatch: expected ${expectedOrigin}, observed ${plugin.origin}`,
          );
        }
        pluginOrigins.push({
          pluginId,
          packageName,
          packageVersion,
          pluginManifestSha256: digestRegularFile(
            path.join(installedRoot, "openclaw.plugin.json"),
            `${pluginId} manifest`,
          ),
          compatibilityRange: artifact.compatibilityRange,
          originKind: plugin.origin,
          installedRoot,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const pluginId of loadedById.keys()) {
      if (!required.has(pluginId)) {
        errors.push(`loaded plugin ${pluginId} is absent from release readiness`);
      }
    }

    return {
      ready: errors.length === 0,
      identity: buildLoadedReleaseIdentity(loaded),
      pluginOrigins: pluginOrigins.toSorted((left, right) =>
        compareUtf8(left.pluginId, right.pluginId),
      ),
      errors: errors.toSorted(compareUtf8),
    };
  } catch (error) {
    return {
      ready: false,
      pluginOrigins: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
