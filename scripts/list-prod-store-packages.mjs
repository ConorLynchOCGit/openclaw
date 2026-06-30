// Lists current-target production packages for Docker's offline prune store seed.
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const specs = new Set();
const target = {
  cpu: process.arch,
  libc: detectLibc(),
  os: process.platform,
};

function parseArgs(argv) {
  const args = {
    fromLockfile: false,
  };
  for (const arg of argv) {
    if (arg === "--from-lockfile") {
      args.fromLockfile = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  pnpm list --prod --depth Infinity --json | node scripts/list-prod-store-packages.mjs",
          "  node scripts/list-prod-store-packages.mjs --from-lockfile",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function stripPeerSuffix(version) {
  return version.replace(/\(.+\)$/, "");
}

function packageSpecFromRawSpec(rawSpec) {
  const spec = stripPeerSuffix(rawSpec);
  if (spec.startsWith("npm:")) {
    return packageSpecFromRawSpec(spec.slice("npm:".length));
  }
  if (
    !spec ||
    !looksLikePackageSpec(spec) ||
    spec.startsWith("file:") ||
    spec.startsWith("link:") ||
    spec.startsWith("workspace:")
  ) {
    return undefined;
  }
  return spec;
}

function looksLikePackageSpec(value) {
  return /^@[^/]+\/[^@]+@.+/u.test(value) || /^[^/@][^@/]*@.+/u.test(value);
}

function packageSpec(name, version) {
  if (!name || !version || typeof version !== "string") {
    return undefined;
  }
  const normalizedVersion = stripPeerSuffix(version);
  if (
    normalizedVersion.startsWith("file:") ||
    normalizedVersion.startsWith("link:") ||
    normalizedVersion.startsWith("workspace:")
  ) {
    return undefined;
  }
  if (normalizedVersion.startsWith("npm:")) {
    return packageSpecFromRawSpec(normalizedVersion.slice("npm:".length));
  }
  if (looksLikePackageSpec(normalizedVersion)) {
    return normalizedVersion;
  }
  return `${name}@${normalizedVersion}`;
}

function detectLibc() {
  if (process.platform !== "linux") {
    return undefined;
  }
  const report = process.report?.getReport?.();
  return report?.header?.glibcVersionRuntime ? "glibc" : "musl";
}

function matchesTargetSelector(selector, value) {
  if (!Array.isArray(selector) || !value) {
    return true;
  }
  const blocked = selector.some((entry) => entry === `!${value}`);
  if (blocked) {
    return false;
  }
  const allowed = selector.filter((entry) => typeof entry === "string" && !entry.startsWith("!"));
  return allowed.length === 0 || allowed.includes(value);
}

function packageEntryForSpec(lockfile, spec) {
  return lockfile?.packages?.[spec] ?? lockfile?.packages?.[`/${spec}`];
}

function normalizeLockfilePackageKey(key) {
  if (typeof key !== "string") {
    return undefined;
  }
  return (key.startsWith("/") ? key.slice(1) : key).replace(/\(.+\)$/, "");
}

function snapshotForSpec(lockfile, spec) {
  const snapshots = lockfile?.snapshots;
  if (!snapshots) {
    return undefined;
  }
  return (
    snapshots[spec] ??
    snapshots[`/${spec}`] ??
    Object.entries(snapshots).find(([key]) => normalizeLockfilePackageKey(key) === spec)?.[1]
  );
}

function snapshotsForSpec(lockfile, spec) {
  const snapshots = lockfile?.snapshots;
  if (!snapshots) {
    return [];
  }
  return Object.entries(snapshots).filter(([key]) => normalizeLockfilePackageKey(key) === spec);
}

function packageSupportsTarget(lockfile, spec) {
  const entry = packageEntryForSpec(lockfile, spec);
  return (
    matchesTargetSelector(entry?.os, target.os) &&
    matchesTargetSelector(entry?.cpu, target.cpu) &&
    matchesTargetSelector(entry?.libc, target.libc)
  );
}

function addSpec(lockfile, spec) {
  if (spec && packageSupportsTarget(lockfile, spec)) {
    const wasMissing = !specs.has(spec);
    specs.add(spec);
    return wasMissing;
  }
  return false;
}

function addImporterRuntimeSpecs(lockfile, importer) {
  for (const section of ["dependencies", "optionalDependencies"]) {
    for (const [name, entry] of Object.entries(importer?.[section] ?? {})) {
      addSpec(lockfile, packageSpec(name, typeof entry === "string" ? entry : entry?.version));
    }
  }
}

function visitListNode(lockfile, node) {
  for (const dep of Object.values(node.dependencies ?? {})) {
    const name = dep.from || dep.name;
    const spec = packageSpec(name, dep.version);
    if (spec && dep.resolved?.startsWith("https://registry.npmjs.org/")) {
      addSpec(lockfile, spec);
    }
    visitListNode(lockfile, dep);
  }
}

function addPeerContextSpecs(lockfile, pending, snapshotKey) {
  const matches = snapshotKey.matchAll(/\(([^()]+)\)/gu);
  for (const match of matches) {
    const spec = packageSpecFromRawSpec(match[1] ?? "");
    if (addSpec(lockfile, spec)) {
      pending.push(spec);
    }
  }
}

function readLockfile() {
  const lockfilePath = path.join(process.cwd(), "pnpm-lock.yaml");
  if (!fs.existsSync(lockfilePath)) {
    return undefined;
  }
  return parse(fs.readFileSync(lockfilePath, "utf8"));
}

function addSnapshotClosure(lockfile) {
  const snapshots = lockfile?.snapshots;
  const packages = lockfile?.packages;
  if (!snapshots || !packages) {
    return;
  }
  const pending = [...specs];
  const visited = new Set();
  while (pending.length > 0) {
    const spec = pending.pop();
    if (!spec || visited.has(spec)) {
      continue;
    }
    visited.add(spec);
    const matchingSnapshots = snapshotsForSpec(lockfile, spec);
    if (matchingSnapshots.length === 0) {
      const snapshot = snapshotForSpec(lockfile, spec);
      if (!snapshot) {
        continue;
      }
      matchingSnapshots.push([spec, snapshot]);
    }
    for (const [snapshotKey, snapshot] of matchingSnapshots) {
      addPeerContextSpecs(lockfile, pending, snapshotKey);
      addSnapshotDependencies(lockfile, packages, pending, snapshot);
    }
  }
}

function addSnapshotDependencies(lockfile, packages, pending, snapshot) {
  if (!snapshot) {
    return;
  }
  const addDependencySpec = (name, version) => {
    const depSpec = packageSpec(name, typeof version === "string" ? version : version?.version);
    if (!depSpec || !packages[depSpec] || specs.has(depSpec)) {
      return;
    }
    if (!packageSupportsTarget(lockfile, depSpec)) {
      addSupportedDependenciesOfUnsupportedOptionalSnapshot(lockfile, packages, pending, depSpec);
      return;
    }
    specs.add(depSpec);
    pending.push(depSpec);
  };
  for (const [name, version] of Object.entries(snapshot.dependencies ?? {})) {
    addDependencySpec(name, version);
  }
  for (const [name, version] of Object.entries(snapshot.optionalDependencies ?? {})) {
    addDependencySpec(name, version);
  }
}

function addSupportedDependenciesOfUnsupportedOptionalSnapshot(lockfile, packages, pending, spec) {
  const snapshots = snapshotsForSpec(lockfile, spec);
  for (const [, snapshot] of snapshots) {
    if (snapshot?.optional !== true) {
      continue;
    }
    for (const section of ["dependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(snapshot[section] ?? {})) {
        const depSpec = packageSpec(name, typeof version === "string" ? version : version?.version);
        if (
          depSpec &&
          packages[depSpec] &&
          !specs.has(depSpec) &&
          packageSupportsTarget(lockfile, depSpec)
        ) {
          specs.add(depSpec);
          pending.push(depSpec);
        }
      }
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const lockfile = readLockfile();
if (args.fromLockfile) {
  for (const importer of Object.values(lockfile?.importers ?? {})) {
    addImporterRuntimeSpecs(lockfile, importer);
  }
} else {
  const parsed = JSON.parse(fs.readFileSync(0, "utf8"));
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  for (const root of roots) {
    visitListNode(lockfile, root);
  }
}
addSnapshotClosure(lockfile);

process.stdout.write([...specs].toSorted((a, b) => a.localeCompare(b)).join("\n"));
