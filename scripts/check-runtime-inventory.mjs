import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, "docs/system/registries/runtime-inventory.yaml");

function fail(message) {
  console.error(`check-runtime-inventory: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(registryPath)) {
  fail("missing docs/system/registries/runtime-inventory.yaml");
  process.exit(process.exitCode ?? 1);
}

const parsed = YAML.parse(fs.readFileSync(registryPath, "utf8"));
const canonical = parsed?.canonical ?? {};
const runtimeContainerNames = Array.isArray(canonical.runtimeContainerNames)
  ? canonical.runtimeContainerNames
  : [];

if (runtimeContainerNames.length === 0) {
  fail("runtime inventory registry missing canonical.runtimeContainerNames");
}

try {
  const output = execSync("docker ps --format '{{.Names}}'", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const runningNames = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const activeCanonicalNames = runningNames.filter((name) => runtimeContainerNames.includes(name));

  if (activeCanonicalNames.length > 1) {
    fail(
      `multiple canonical runtime containers active at once: ${activeCanonicalNames.join(", ")}`,
    );
  }

  const activeOpenClawNames = runningNames.filter((name) => /openclaw|claw/i.test(name));

  if (activeOpenClawNames.length > 1) {
    fail(`multiple active OpenClaw-like containers detected: ${activeOpenClawNames.join(", ")}`);
  }
} catch {
  console.log(
    "check-runtime-inventory: docker inspection unavailable in this environment; registry shape validated only",
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("check-runtime-inventory: ok");
