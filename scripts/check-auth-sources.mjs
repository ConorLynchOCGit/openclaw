import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = process.cwd();
const registryCandidates = [
  path.join(repoRoot, "docs/system/registries/auth-paths.yaml"),
  path.join(repoRoot, "docs/system/registries/auth-sources.yaml"),
];
const registryPath = registryCandidates.find((candidate) => fs.existsSync(candidate));

function fail(message) {
  console.error(`check-auth-sources: ${message}`);
  process.exitCode = 1;
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return process.argv[index + 1];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasNestedValue(root, selector) {
  if (!selector) {
    return true;
  }
  const parts = selector.split(".");
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  if (typeof current === "string") {
    return current.trim().length > 0;
  }
  return current !== undefined && current !== null;
}

function envFileContainsKey(filePath, selector) {
  if (!selector || !fs.existsSync(filePath)) {
    return false;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^${selector}=`, "m");
  return pattern.test(content);
}

function checkSource(source) {
  const exists = fs.existsSync(source.path);
  let status = exists ? "present" : "missing";

  if (source.type === "external_service_state") {
    try {
      const containerNames = execSync("docker ps --format '{{.Names}}'", {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      status = containerNames.includes(source.path) ? "present" : "missing";
    } catch {
      status = "unreadable";
    }
  } else if (source.type === "external_runtime_surface") {
    status = exists ? "present" : "missing";
  } else if (exists && source.type === "config_secret_ref") {
    try {
      status = hasNestedValue(readJson(source.path), source.selector) ? "present" : "missing";
    } catch {
      status = "unreadable";
    }
  } else if (exists && source.type === "config_value") {
    try {
      status = hasNestedValue(readJson(source.path), source.selector) ? "present" : "missing";
    } catch {
      status = "unreadable";
    }
  } else if (exists && source.type === "state_env") {
    status = envFileContainsKey(source.path, source.selector) ? "present" : "missing";
  } else if (exists && source.selector && source.path.endsWith(".json")) {
    try {
      status = hasNestedValue(readJson(source.path), source.selector) ? "present" : "missing";
    } catch {
      status = "unreadable";
    }
  }

  return {
    type: source.type,
    path: source.path,
    selector: source.selector,
    precedence: source.precedence,
    status,
  };
}

if (!registryPath) {
  fail("missing docs/system/registries/auth-paths.yaml");
  process.exit(process.exitCode ?? 1);
}

const parsed = YAML.parse(fs.readFileSync(registryPath, "utf8"));
const providers = Array.isArray(parsed?.providers) ? parsed.providers : [];
if (providers.length === 0) {
  fail("registry has no providers");
  process.exit(process.exitCode ?? 1);
}

const requestedProvider = readArg("--provider");
const selectedProviders = requestedProvider
  ? providers.filter((provider) => provider.id === requestedProvider)
  : providers;

if (requestedProvider && selectedProviders.length === 0) {
  fail(`provider not found: ${requestedProvider}`);
  process.exit(process.exitCode ?? 1);
}

const report = {
  registryPath,
  providers: selectedProviders.map((provider) => ({
    id: provider.id,
    kind: provider.kind,
    owner: provider.owner,
    status: provider.status,
    authSources: Array.isArray(provider.authSources)
      ? provider.authSources.map((source) => checkSource(source))
      : [],
  })),
};

console.log(JSON.stringify(report, null, 2));

if (process.exitCode) {
  process.exit(process.exitCode);
}
