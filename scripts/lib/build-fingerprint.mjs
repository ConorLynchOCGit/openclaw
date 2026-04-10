import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function updateHashForFile(hash, filePath) {
  hash.update("file\0");
  hash.update(filePath);
  hash.update("\0");
  hash.update(fs.readFileSync(filePath));
  hash.update("\0");
}

function walkPath(rootDir, absolutePath, hash, options) {
  const relativePath = toPortablePath(path.relative(rootDir, absolutePath));
  if (options.ignorePath?.(absolutePath, relativePath)) {
    return;
  }

  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch {
    hash.update("missing\0");
    hash.update(relativePath);
    hash.update("\0");
    return;
  }

  if (stat.isSymbolicLink()) {
    hash.update("symlink\0");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readlinkSync(absolutePath));
    hash.update("\0");
    return;
  }

  if (stat.isDirectory()) {
    hash.update("dir\0");
    hash.update(relativePath);
    hash.update("\0");
    const children = fs
      .readdirSync(absolutePath)
      .map((name) => path.join(absolutePath, name))
      .toSorted((left, right) => left.localeCompare(right));
    for (const childPath of children) {
      walkPath(rootDir, childPath, hash, options);
    }
    return;
  }

  if (stat.isFile()) {
    updateHashForFile(hash, absolutePath);
  }
}

export function hashInputs(rootDir, inputs, options = {}) {
  const hash = createHash("sha256");
  for (const input of [...inputs].toSorted((left, right) => left.localeCompare(right))) {
    const absoluteInput = path.resolve(rootDir, input);
    walkPath(rootDir, absoluteInput, hash, options);
  }
  return hash.digest("hex");
}

export function outputsExist(rootDir, outputs) {
  return outputs.every((output) => fs.existsSync(path.resolve(rootDir, output)));
}

export function resolveBuildStampPath(rootDir, ...segments) {
  return path.join(rootDir, ".local", "build-stamps", ...segments);
}

export function readBuildStamp(stampPath) {
  if (!fs.existsSync(stampPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(stampPath, "utf8"));
  } catch {
    return null;
  }
}

export function writeBuildStamp(stampPath, payload) {
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
