#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const profileRoot = path.join(repoRoot, "extensions/codex/system-profile");
const guidanceRoot = path.join(profileRoot, "contributor-guidance");
const skillsRoot = path.join(profileRoot, "skills");
const checkOnly = process.argv.includes("--check");

const SKILL = `---
name: openclaw-contributor-guidance
description: Resolve immutable generation-owned OpenClaw contributor guidance for the exact repository subtree being changed.
---

# OpenClaw Contributor Guidance

Use this capability before editing a subtree governed by a scoped \`AGENTS.md\`.

1. Read \`index.json\` from this directory.
2. Match the target repository-relative path to the deepest applicable scope.
3. Read only the corresponding immutable file under \`tree/\`.
4. Treat editable worktree copies as successor-release source, not current execution authority.
5. Include the applicable guidance ref in any child mission that owns files in that scope.

Do not load every scoped guide, infer a scope from filename similarity, or treat this index as an agent persona or workflow registry.
`;

const guidanceSourcePaths = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "--",
    "AGENTS.md",
    ":(glob)**/AGENTS.md",
    ":(exclude)extensions/codex/system-profile/contributor-guidance/**",
    ":(exclude)**/fixtures/**",
  ],
  { cwd: repoRoot },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .toSorted((left, right) => left.localeCompare(right));

const expectedFiles = new Map();
const entries = [];

for (const sourcePath of guidanceSourcePaths) {
  const content = await fs.readFile(path.join(repoRoot, sourcePath));
  expectedFiles.set(path.posix.join("tree", sourcePath), content);
  entries.push({
    scope: path.posix.dirname(sourcePath) === "." ? "" : path.posix.dirname(sourcePath),
    sourcePath,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.byteLength,
  });
}

expectedFiles.set("SKILL.md", Buffer.from(SKILL));
expectedFiles.set(
  "index.json",
  Buffer.from(
    `${JSON.stringify(
      {
        schema: "openclaw.codex-contributor-guidance.v1",
        entries,
      },
      null,
      2,
    )}\n`,
  ),
);

const expectedSkills = new Map();
const skillSourcePaths = execFileSync("git", ["ls-files", "-z", "--", ".agents/skills"], {
  cwd: repoRoot,
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .toSorted((left, right) => left.localeCompare(right));
for (const sourcePath of skillSourcePaths) {
  const relativePath = path.posix.relative(".agents/skills", sourcePath);
  expectedSkills.set(relativePath, await fs.readFile(path.join(repoRoot, sourcePath)));
}

if (checkOnly) {
  await checkFiles(guidanceRoot, expectedFiles, "contributor guidance");
  await checkFiles(skillsRoot, expectedSkills, "upstream skills");
  process.stdout.write(
    `Codex generation assets are current (${entries.length} scoped guides, ${skillSourcePaths.length} upstream skill files).\n`,
  );
  process.exit(0);
}

await writeFiles(guidanceRoot, expectedFiles);
await writeFiles(skillsRoot, expectedSkills);
process.stdout.write(
  `Generated Codex generation assets (${entries.length} scoped guides, ${skillSourcePaths.length} upstream skill files).\n`,
);

async function checkFiles(root, expectedFilesByPath, label) {
  const actualPaths = await listFiles(root);
  const expectedPaths = [...expectedFilesByPath.keys()].toSorted((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(
      `Codex ${label} inventory is stale; run extensions/codex/scripts/sync-generation-assets.mjs`,
    );
  }
  for (const [relativePath, expected] of expectedFilesByPath) {
    const actual = await fs.readFile(path.join(root, relativePath));
    if (!actual.equals(expected)) {
      throw new Error(
        `Codex ${label} is stale at ${relativePath}; run extensions/codex/scripts/sync-generation-assets.mjs`,
      );
    }
  }
}

async function writeFiles(root, files) {
  await fs.rm(root, { recursive: true, force: true });
  for (const [relativePath, content] of files) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
}

async function listFiles(root, relative = "") {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const children = await Promise.all(
    directoryEntries.map(async (entry) => {
      const child = path.posix.join(relative, entry.name);
      return entry.isDirectory() ? await listFiles(root, child) : [child];
    }),
  );
  return children.flat().toSorted((left, right) => left.localeCompare(right));
}
