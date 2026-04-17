import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const requiredRoots = ["docs/system", "docs/projects"];

const requiredSystemFiles = [
  "docs/system/index.md",
  "docs/system/memory.md",
  "docs/system/roadmap.md",
  "docs/system/roadmap-ideas.md",
  "docs/system/build-plan.md",
  "docs/system/projects.md",
  "docs/system/agents.md",
  "docs/system/decisions.md",
  "docs/system/deployment.md",
  "docs/system/policies/durable-generated-ownership.md",
  "docs/system/registries/projects.yaml",
  "docs/system/registries/agents.yaml",
  "docs/system/registries/runtime-inventory.yaml",
  "docs/system/registries/bootstrap-files.yaml",
  "docs/system/registries/bootstrap-files.md",
  "docs/projects/workspace-topology/scattered-material-inventory.md",
  "docs/projects/workspace-topology/roadmap-pointer-gaps.md",
  "docs/projects/workspace-topology/roadmap-surface-inventory.md",
  "docs/projects/workspace-topology/runtime-bootstrap-file-inventory.md",
  "docs/projects/workspace-topology/memory-surface-inventory.md",
  "docs/projects/workspace-topology/specs/bootstrap-file-canonical-mapping.md",
];

const inventoryCoveragePaths = [
  "VISION.md",
  "CONTRIBUTING.md",
  "docs.acp.md",
  "qa/README.md",
  "qa/scenarios.md",
  "qa/frontier-harness-plan.md",
  "qa/new-scenarios-2026-04.md",
  "docs/refactor/qa.md",
  ".agents/maintainers.md",
];

function fail(message) {
  console.error(`check-doc-topology: ${message}`);
  process.exitCode = 1;
}

for (const relativePath of requiredRoots) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing required root ${relativePath}`);
  }
}

for (const relativePath of requiredSystemFiles) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    fail(`missing required topology file ${relativePath}`);
  }
}

const inventoryDocPath = path.join(
  repoRoot,
  "docs/projects/workspace-topology/scattered-material-inventory.md",
);
const roadmapInventoryDocPath = path.join(
  repoRoot,
  "docs/projects/workspace-topology/roadmap-surface-inventory.md",
);

if (fs.existsSync(inventoryDocPath)) {
  const inventoryText = fs.readFileSync(inventoryDocPath, "utf8");
  for (const candidatePath of inventoryCoveragePaths) {
    if (!inventoryText.includes(`\`${candidatePath}\``)) {
      fail(`scattered-material inventory is missing ${candidatePath}`);
    }
  }
}

if (fs.existsSync(roadmapInventoryDocPath)) {
  const inventoryText = fs.readFileSync(roadmapInventoryDocPath, "utf8");
  for (const candidatePath of [
    "VISION.md",
    "CONTRIBUTING.md",
    "docs/refactor/qa.md",
    "qa/frontier-harness-plan.md",
    "qa/new-scenarios-2026-04.md",
  ]) {
    if (!inventoryText.includes(`\`${candidatePath}\``)) {
      fail(`roadmap-surface inventory is missing ${candidatePath}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `check-doc-topology: ok (${requiredRoots.length} roots, ${requiredSystemFiles.length} required files)`,
);
