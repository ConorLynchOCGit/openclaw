import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isRepoCanonicalRelativePath,
  resolveRepoCanonicalReadPath,
  toBundledSkillPromptPath,
} from "./repo-canonical-paths.js";

describe("repo canonical path resolution", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await import("node:fs/promises").then(({ rm }) =>
          rm(dir, { recursive: true, force: true }),
        );
      }
    }
  });

  it("classifies repo-canonical relative paths", () => {
    expect(isRepoCanonicalRelativePath("docs/projects/model-memory/index.md")).toBe(true);
    expect(isRepoCanonicalRelativePath("skills/model-memory-deep-ingest/SKILL.md")).toBe(true);
    expect(isRepoCanonicalRelativePath("checkpoints/model-memory/run.json")).toBe(false);
  });

  it("prefers the product_live import for repo-canonical reads", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "repo-canonical-workspace-"));
    tempDirs.push(workspaceRoot);
    const importRoot = path.join(workspaceRoot, "imports", "product_live", "content");
    const target = path.join(importRoot, "docs", "projects", "model-memory", "index.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "# model-memory\n", "utf8");

    const resolved = resolveRepoCanonicalReadPath({
      workspaceRoot,
      inputPath: "docs/projects/model-memory/index.md",
    });

    expect(resolved).toMatchObject({
      absolutePath: target,
      logicalPath: "docs/projects/model-memory/index.md",
      resolutionSource: "workspace-import",
    });
  });

  it("maps baked /app repo paths back onto the product_live import", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "repo-canonical-app-"));
    tempDirs.push(workspaceRoot);
    const importRoot = path.join(workspaceRoot, "imports", "product_live", "content");
    const target = path.join(importRoot, "skills", "model-memory-deep-ingest", "SKILL.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "# skill\n", "utf8");

    const resolved = resolveRepoCanonicalReadPath({
      workspaceRoot,
      inputPath: "/app/skills/model-memory-deep-ingest/SKILL.md",
    });

    expect(resolved).toMatchObject({
      absolutePath: target,
      logicalPath: "skills/model-memory-deep-ingest/SKILL.md",
      resolutionSource: "absolute-app",
    });
  });

  it("normalizes bundled skill prompt paths to repo-canonical locations", () => {
    expect(
      toBundledSkillPromptPath("/app/skills/model-memory-deep-ingest/SKILL.md", "openclaw-bundled"),
    ).toBe("skills/model-memory-deep-ingest/SKILL.md");
    expect(toBundledSkillPromptPath("/tmp/custom/SKILL.md", "openclaw-workspace")).toBe(
      "/tmp/custom/SKILL.md",
    );
  });
});
