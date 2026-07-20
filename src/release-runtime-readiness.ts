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
  ownerPackageName: string;
  ownerPackageVersion: string;
  pluginPackageName: string;
  pluginPackageVersion: string;
  pluginManifestVersion: string;
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
    sourceSnapshotRef: loaded.manifest.source.snapshotRef,
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
        const expectedOrigin = artifact.role === "core" ? "bundled" : "global";
        const pluginPackageName = plugin.packageName?.trim() ?? "";
        const pluginPackageVersion = plugin.packageVersion?.trim() ?? "";
        const pluginManifestVersion = plugin.version?.trim() ?? "";
        const ownerPackageName = artifact.role === "core" ? "openclaw" : pluginPackageName;
        const ownerPackageVersion =
          artifact.role === "core" ? loaded.manifest.package.version : pluginPackageVersion;
        if (ownerPackageName !== artifact.packageName) {
          errors.push(
            `${pluginId}.ownerPackageName mismatch: expected ${artifact.packageName}, observed ${ownerPackageName || "missing"}`,
          );
        }
        if (ownerPackageVersion !== artifact.packageVersion) {
          errors.push(
            `${pluginId}.ownerPackageVersion mismatch: expected ${artifact.packageVersion}, observed ${ownerPackageVersion || "missing"}`,
          );
        }
        if (plugin.origin !== expectedOrigin) {
          errors.push(
            `${pluginId}.origin mismatch: expected ${expectedOrigin}, observed ${plugin.origin}`,
          );
        }
        pluginOrigins.push({
          pluginId,
          ownerPackageName,
          ownerPackageVersion,
          pluginPackageName,
          pluginPackageVersion,
          pluginManifestVersion,
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
