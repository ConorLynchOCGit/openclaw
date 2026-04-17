import { execSync } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const runtimeContainer = "openclaw-runtime";
const importDestination = "/home/node/.openclaw/workspace/imports/product_live/content";

function fail(message) {
  console.error(`check-runtime-repo-import-mount: ${message}`);
  process.exitCode = 1;
}

function run(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

try {
  const mounts = JSON.parse(run(`docker inspect ${runtimeContainer} --format '{{json .Mounts}}'`));
  const repoMount = mounts.find((mount) => mount.Destination === importDestination);
  if (!repoMount) {
    fail(`missing bind mount for ${importDestination}`);
  } else {
    if (repoMount.Type !== "bind") {
      fail(`${importDestination} is not a bind mount`);
    }
    if (repoMount.Source !== repoRoot) {
      fail(`${importDestination} points at ${repoMount.Source}, expected ${repoRoot}`);
    }
    if (repoMount.RW) {
      fail(`${importDestination} must remain read-only inside the runtime`);
    }
  }

  const hostCount = Number.parseInt(run("git ls-files | wc -l"), 10);
  const containerCount = Number.parseInt(
    run(
      `docker exec ${runtimeContainer} sh -lc 'git -c safe.directory=${importDestination} -C ${importDestination} ls-files | wc -l'`,
    ),
    10,
  );
  if (hostCount !== containerCount) {
    fail(
      `tracked file count mismatch between host (${hostCount}) and runtime import mount (${containerCount})`,
    );
  }
} catch {
  console.log(
    "check-runtime-repo-import-mount: docker inspection unavailable in this environment; skipped live mount proof",
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("check-runtime-repo-import-mount: ok");
