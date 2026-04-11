import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathExists, readJson, ROOT_DIR } from "./repo-heavy-task.mjs";

const LATEST_ARTIFACT_OUTPUTS = {
  build: ["dist/index.js", "dist/control-ui/index.html", ".local/build-stamps/plugin-sdk-dts.json"],
  "build-runtime-fast": ["dist/index.js", ".local/build-stamps/plugin-sdk-dts.json"],
};

function isReusableLandingTestArtifact(artifact) {
  return (
    artifact?.kind === "test" &&
    artifact?.status === "success" &&
    artifact?.scope?.kind === "full-suite" &&
    artifact?.scope?.reusableForLanding === true
  );
}

function resolveLatestArtifactPath(latestKey, rootDir = ROOT_DIR) {
  return path.join(rootDir, ".local", "gate-metrics", "latest", `${latestKey}.json`);
}

function capture(command, args, rootDir = ROOT_DIR) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`));
    });
  });
}

export async function currentTreeFingerprint(rootDir = ROOT_DIR) {
  const hash = createHash("sha256");
  hash.update(await capture("git", ["rev-parse", "HEAD"], rootDir));
  hash.update(await capture("git", ["status", "--porcelain=v1", "--untracked-files=all"], rootDir));
  hash.update(
    await capture("git", ["diff", "--no-ext-diff", "--binary", "HEAD", "--", "."], rootDir),
  );

  const untrackedRaw = await capture(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    rootDir,
  );
  const untrackedFiles = untrackedRaw.split("\u0000").filter((value) => value.length > 0);
  for (const relativePath of untrackedFiles) {
    hash.update(relativePath);
    hash.update(await fs.readFile(path.join(rootDir, relativePath)));
  }

  return hash.digest("hex");
}

export function resolveLatestArtifactKeyForStep(command, args) {
  const normalizedArgs = Array.isArray(args) ? args.join(" ") : "";
  if (command !== "pnpm") {
    return null;
  }
  switch (normalizedArgs) {
    case "check:fast":
      return "gate-check-fast";
    case "check:types":
      return "gate-check-types";
    case "check":
      return "gate-check";
    case "build":
      return "build";
    case "build:runtime:fast":
      return "build-runtime-fast";
    case "runtime:proof:fast":
      return "runtime-proof";
    case "test":
      return "test";
    case "gate:feature":
      return "landing-gate-feature";
    case "gate:integration":
      return "landing-gate-integration";
    case "gate:production":
      return "landing-gate-production";
    default:
      return null;
  }
}

export async function loadLatestArtifact(latestKey, rootDir = ROOT_DIR) {
  if (!latestKey) {
    return null;
  }
  const latestPath = resolveLatestArtifactPath(latestKey, rootDir);
  if (!(await pathExists(latestPath))) {
    return null;
  }
  try {
    return await readJson(latestPath);
  } catch {
    return null;
  }
}

export async function hasReusableOutputsForLatestKey(latestKey, rootDir = ROOT_DIR) {
  const requiredPaths = LATEST_ARTIFACT_OUTPUTS[latestKey];
  if (!Array.isArray(requiredPaths) || requiredPaths.length === 0) {
    return true;
  }
  for (const relativePath of requiredPaths) {
    if (!(await pathExists(path.join(rootDir, relativePath)))) {
      return false;
    }
  }
  return true;
}

export async function loadReusableLatestArtifact(latestKey, treeFingerprint, rootDir = ROOT_DIR) {
  const artifact = await loadLatestArtifact(latestKey, rootDir);
  if (!artifact || artifact.status !== "success") {
    return null;
  }
  if (latestKey === "test" && !isReusableLandingTestArtifact(artifact)) {
    return null;
  }
  if (artifact.treeFingerprint !== treeFingerprint) {
    return null;
  }
  if (!(await hasReusableOutputsForLatestKey(latestKey, rootDir))) {
    return null;
  }
  return artifact;
}

export function stripArtifactEnvelope(artifact) {
  if (!artifact || typeof artifact !== "object") {
    return {};
  }
  const {
    schemaVersion: _schemaVersion,
    kind: _kind,
    recordedAt: _recordedAt,
    ...payload
  } = artifact;
  return payload;
}
