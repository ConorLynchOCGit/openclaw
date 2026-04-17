import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = process.cwd();
const projectsRegistryPath = path.join(repoRoot, "docs/system/registries/projects.yaml");

const requiredPackFiles = [
  "index.md",
  "STARTUP.md",
  "STATUS.md",
  "CURRENT_SLICE.md",
  "DECISIONS.md",
  "roadmap.md",
  "specs/index.md",
];

function fail(message) {
  console.error(`check-doc-packs: ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(projectsRegistryPath)) {
  fail("missing docs/system/registries/projects.yaml");
  process.exit(process.exitCode ?? 1);
}

const parsed = YAML.parse(fs.readFileSync(projectsRegistryPath, "utf8"));
const allowedStatuses = new Set(parsed?.allowedStatuses ?? []);
const projects = parsed?.projects;

if (!Array.isArray(projects) || projects.length === 0) {
  fail("projects registry has no projects");
  process.exit(process.exitCode ?? 1);
}

const seenIds = new Set();

for (const project of projects) {
  if (!project?.id) {
    fail("project entry missing id");
    continue;
  }
  if (seenIds.has(project.id)) {
    fail(`duplicate project id ${project.id}`);
    continue;
  }
  seenIds.add(project.id);

  if (!allowedStatuses.has(project.status)) {
    fail(`project ${project.id} has invalid status ${String(project.status)}`);
  }

  const workspacePath = project.workspacePath;
  if (typeof workspacePath !== "string" || workspacePath.length === 0) {
    fail(`project ${project.id} missing workspacePath`);
    continue;
  }

  const absoluteWorkspacePath = path.join(repoRoot, workspacePath);
  if (!fs.existsSync(absoluteWorkspacePath)) {
    fail(`project ${project.id} workspace missing at ${workspacePath}`);
    continue;
  }

  for (const relativeFile of requiredPackFiles) {
    const absoluteFilePath = path.join(absoluteWorkspacePath, relativeFile);
    if (!fs.existsSync(absoluteFilePath)) {
      fail(`project ${project.id} missing required file ${workspacePath}/${relativeFile}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `check-doc-packs: ok (${projects.length} projects, ${requiredPackFiles.length} required pack paths each)`,
);
