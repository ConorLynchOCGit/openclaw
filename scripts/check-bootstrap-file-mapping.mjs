import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, "docs/system/registries/bootstrap-files.yaml");
const requiredIds = new Set([
  "agents_md",
  "soul_md",
  "identity_md",
  "user_md",
  "tools_md",
  "bootstrap_md",
  "memory_md",
  "daily_memory_files",
]);

function fail(message) {
  console.error(`check-bootstrap-file-mapping: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(registryPath)) {
  fail("missing docs/system/registries/bootstrap-files.yaml");
  process.exit(process.exitCode ?? 1);
}

const parsed = YAML.parse(fs.readFileSync(registryPath, "utf8"));
const fileClasses = parsed?.fileClasses;

if (!Array.isArray(fileClasses) || fileClasses.length === 0) {
  fail("bootstrap file registry has no fileClasses");
  process.exit(process.exitCode ?? 1);
}

const seen = new Set();

for (const entry of fileClasses) {
  if (!entry?.id || typeof entry.id !== "string") {
    fail("bootstrap file entry missing id");
    continue;
  }
  if (seen.has(entry.id)) {
    fail(`duplicate bootstrap file id ${entry.id}`);
    continue;
  }
  seen.add(entry.id);

  for (const field of [
    "runtimePath",
    "structuralMode",
    "currentOwnership",
    "targetOwnership",
    "projectionMode",
  ]) {
    if (typeof entry[field] !== "string" || entry[field].length === 0) {
      fail(`bootstrap file ${entry.id} missing ${field}`);
    }
  }

  if (!Array.isArray(entry.canonicalSourceClass) || entry.canonicalSourceClass.length === 0) {
    fail(`bootstrap file ${entry.id} missing canonicalSourceClass`);
  }
}

for (const id of requiredIds) {
  if (!seen.has(id)) {
    fail(`bootstrap file registry missing required id ${id}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`check-bootstrap-file-mapping: ok (${fileClasses.length} file classes)`);
