import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(repoRoot, "ops/reviews/daily_memory_continuity_finalizer.sh");
const tempRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "openclaw-daily-finalizer-"));
  tempRoots.push(workspace);
  await mkdir(path.join(workspace, "memory"), { recursive: true });
  return workspace;
}

async function runFinalizer(workspace: string, dateId: string): Promise<void> {
  await execFileAsync("bash", [scriptPath, dateId], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OPENCLAW_WORKSPACE_DIR: workspace,
    },
  });
}

async function writeWorkspaceFile(
  workspace: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const absolutePath = path.join(workspace, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("daily memory continuity finalizer", () => {
  it("creates a missing canonical note from exact same-day durable evidence", async () => {
    const workspace = await createWorkspace();
    await writeWorkspaceFile(
      workspace,
      "memory/2026-04-27-stability.md",
      [
        "# Session: 2026-04-27 20:00:00 UTC",
        "",
        "- **Session Key**: agent:main:main",
        "- **Session ID**: daily-finalizer-session",
        "- **Source**: ui",
        "",
        "## Conversation Summary",
        "",
        "user: private raw transcript text should not be copied",
      ].join("\n"),
    );
    await writeWorkspaceFile(
      workspace,
      "archives/daily_operator_reviews/2026-04-27.md",
      [
        "# Daily Operator Review — 2026-04-27",
        "",
        "## Stack Status",
        "- Same-day durable operator evidence exists.",
      ].join("\n"),
    );

    await runFinalizer(workspace, "2026-04-27");

    const note = await readFile(path.join(workspace, "memory/2026-04-27.md"), "utf8");
    expect(note).toContain("openclaw:daily-continuity-finalizer:2026-04-27");
    expect(note).toContain("archives/daily_operator_reviews/2026-04-27.md");
    expect(note).toContain("memory/2026-04-27-stability.md");
    expect(note).not.toContain("private raw transcript text should not be copied");

    const report = await readFile(
      path.join(workspace, "archives/daily_memory_continuity/2026-04-27.md"),
      "utf8",
    );
    expect(report).toContain("created_from_exact_same_day_evidence");
  });

  it("skips when only stale fallback evidence exists", async () => {
    const workspace = await createWorkspace();
    await writeWorkspaceFile(
      workspace,
      "archives/memory_performance_reports/2026-04-15.md",
      "# Memory Performance Report — 2026-04-15\n",
    );

    await runFinalizer(workspace, "2026-04-27");

    await expect(readFile(path.join(workspace, "memory/2026-04-27.md"), "utf8")).rejects.toThrow();
    const report = await readFile(
      path.join(workspace, "archives/daily_memory_continuity/2026-04-27.md"),
      "utf8",
    );
    expect(report).toContain("skipped_no_exact_same_day_evidence");
  });

  it("preserves existing canonical notes and dedupes finalizer output", async () => {
    const workspace = await createWorkspace();
    await writeWorkspaceFile(workspace, "memory/2026-04-28.md", "# 2026-04-28\n\nHuman note.\n");
    await writeWorkspaceFile(
      workspace,
      "archives/daily_memory_evidence/2026-04-28.md",
      "# Daily Memory Evidence — 2026-04-28\n",
    );

    await runFinalizer(workspace, "2026-04-28");
    await runFinalizer(workspace, "2026-04-28");

    const note = await readFile(path.join(workspace, "memory/2026-04-28.md"), "utf8");
    expect(note).toBe("# 2026-04-28\n\nHuman note.\n");
    const report = await readFile(
      path.join(workspace, "archives/daily_memory_continuity/2026-04-28.md"),
      "utf8",
    );
    expect(report).toContain("canonical_exists_preserved");
  });
});
