#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { collectBuildRuntimeInventory } from "./build_runtime_inventory.mjs";

const REPO_ROOT = "/root/services/openclaw-roles/live";

const REQUIRED_REPO_FILES = [
  "ops/host/docker_hygiene_cleanup.sh",
  "ops/host/cache_hygiene.sh",
  "ops/host/build_runtime_hygiene_report.sh",
  "ops/host/disk_maintenance.sh",
  "scripts/build_runtime_inventory.mjs",
  "scripts/verify_build_runtime_hygiene.mjs",
  "scripts/docker/hygiene.sh",
  "scripts/docker/rebuild-gateway.sh",
];

const REQUIRED_CRON_SNIPPETS = [
  "/root/services/openclaw-roles/live/ops/host/disk_maintenance.sh",
  "/root/services/openclaw-roles/live/ops/host/build_runtime_hygiene_report.sh",
  "/root/services/openclaw-roles/live/ops/host/docker_hygiene_cleanup.sh --apply",
  "/root/services/openclaw-roles/live/ops/host/cache_hygiene.sh --apply",
];

function assertCondition(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

const inventory = await collectBuildRuntimeInventory();
const failures = [];

for (const requiredPath of REQUIRED_REPO_FILES) {
  assertCondition(
    fs.existsSync(path.join(REPO_ROOT, requiredPath)),
    `missing repo file: ${requiredPath}`,
    failures,
  );
}

assertCondition(
  inventory.liveRuntime?.containerName === "openclaw-runtime",
  `expected live runtime container_name openclaw-runtime, got ${inventory.liveRuntime?.containerName ?? "missing"}`,
  failures,
);
assertCondition(
  inventory.liveRuntime?.service === "openclaw-gateway",
  `expected live runtime service openclaw-gateway, got ${inventory.liveRuntime?.service ?? "missing"}`,
  failures,
);
assertCondition(
  inventory.liveRuntime?.status === "running",
  `expected live runtime status running, got ${inventory.liveRuntime?.status ?? "missing"}`,
  failures,
);
assertCondition(
  inventory.liveRuntime?.health === "healthy",
  `expected live runtime health healthy, got ${inventory.liveRuntime?.health ?? "missing"}`,
  failures,
);
assertCondition(
  inventory.liveRuntime?.labels?.["io.openclaw.role"] === "runtime",
  "expected io.openclaw.role=runtime on live runtime container",
  failures,
);
assertCondition(
  inventory.liveRuntime?.labels?.["io.openclaw.stack"] === "live",
  "expected io.openclaw.stack=live on live runtime container",
  failures,
);
assertCondition(
  inventory.docker.volumes.danglingAnonymousCount === 0,
  `expected zero dangling anonymous docker volumes, found ${inventory.docker.volumes.danglingAnonymousCount}`,
  failures,
);

for (const snippet of REQUIRED_CRON_SNIPPETS) {
  assertCondition(
    inventory.cron.rootCrontab.some((line) => line.includes(snippet)),
    `missing root crontab entry containing: ${snippet}`,
    failures,
  );
}

assertCondition(
  !inventory.cron.cronDOpenClawOperator.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#") && !/^[A-Z_][A-Z0-9_]*=/.test(trimmed);
  }),
  "expected /etc/cron.d/openclaw-operator to contain only env declarations and comments to avoid duplicate host jobs",
  failures,
);

const unusedNetworks = inventory.docker.networks.filter(
  (network) => network.containerCount === 0 && !["bridge", "host", "none"].includes(network.name),
);
assertCondition(
  unusedNetworks.length === 0,
  `expected no unused non-default docker networks, found ${unusedNetworks.map((network) => network.name).join(", ")}`,
  failures,
);

if (failures.length > 0) {
  process.stderr.write("build/runtime hygiene verification failed:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write("build/runtime hygiene verification passed\n");
