import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const pkgPath = path.join(rootDir, "package.json");

const readPackageVersion = () => {
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
};

const FINGERPRINT_ROOTS = [
  "src",
  "scripts",
  "extensions",
  "skills",
  "docs",
  "qa",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "openclaw.mjs",
  "Dockerfile",
  "ui/package.json",
] as const;

const WALK_SKIP_SEGMENTS = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "coverage",
  ".cache",
  ".generated",
]);

const resolveCommit = () => {
  const envCommit = process.env.GIT_COMMIT?.trim() || process.env.GIT_SHA?.trim();
  if (envCommit) {
    return envCommit;
  }
  try {
    return execSync("git rev-parse HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const walkFingerprintFiles = (targetPath: string, out: string[]) => {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    out.push(targetPath);
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (WALK_SKIP_SEGMENTS.has(entry.name)) {
      continue;
    }
    walkFingerprintFiles(path.join(targetPath, entry.name), out);
  }
};

const resolveSourceFingerprint = () => {
  const hash = crypto.createHash("sha256");
  const files: string[] = [];
  for (const relative of FINGERPRINT_ROOTS) {
    const absolute = path.join(rootDir, relative);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    walkFingerprintFiles(absolute, files);
  }
  files.sort((a, b) => a.localeCompare(b));
  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
    hash.update(relative);
    hash.update("\n");
    hash.update(fs.readFileSync(filePath));
    hash.update("\n");
  }
  return hash.digest("hex");
};

const version = readPackageVersion();
const commit = resolveCommit();
const commitShort = commit?.slice(0, 12) ?? null;
const sourceFingerprint = resolveSourceFingerprint();
const sourceFingerprintShort = sourceFingerprint.slice(0, 12);
const buildSignature =
  [version ?? "unknown", sourceFingerprintShort].filter(Boolean).join("+") || null;

const buildInfo = {
  version,
  commit,
  commitShort,
  sourceFingerprint,
  buildSignature,
  sourceTree: process.env.OPENCLAW_SOURCE_TREE?.trim() || "live-checkout",
  builtAt: new Date().toISOString(),
};

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
