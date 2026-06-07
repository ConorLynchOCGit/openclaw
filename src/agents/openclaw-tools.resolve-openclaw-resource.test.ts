import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { createResolveOpenClawResourceTool } from "./tools/resolve-openclaw-resource-tool.js";

async function seedResourceFixtures(root: string) {
  const liveRepoRoot = path.join(root, "live");
  const workspaceRoot = path.join(root, "workspace");
  await fs.mkdir(path.join(liveRepoRoot, ".openclaw-memory-ops/reports"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "projects/ops/generated_current"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "archives/cron_health_rollups"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "archives/cron_session_hygiene"), { recursive: true });

  await fs.writeFile(
    path.join(liveRepoRoot, ".openclaw-memory-ops/reports/latest.md"),
    [
      "# Memory Ops Health Report",
      "",
      "- generated_at_utc: 2026-04-24T17:00:00Z",
      "- source: fixture-safe-observe-only",
      "- mode: observe/report-only",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "projects/ops/generated_current/memory_ops_health_report_current.md"),
    "# Memory Ops Health Report - Current Alias\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(
      workspaceRoot,
      "projects/ops/generated_current/daily_operator_review_context_current.md",
    ),
    "# Daily Operator Review Context\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "archives/cron_health_rollups/2026-04-24.md"),
    "# Cron Health\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "archives/cron_session_hygiene/2026-04-24.md"),
    "# Cron Session Hygiene\n",
    "utf8",
  );

  return { liveRepoRoot, workspaceRoot };
}

describe("resolve_openclaw_resource tool", () => {
  it("lists registered cross-root resources", async () => {
    await withTempDir({ prefix: "openclaw-resource-tool-" }, async (root) => {
      const { liveRepoRoot, workspaceRoot } = await seedResourceFixtures(root);
      const tool = createResolveOpenClawResourceTool({
        workspaceDir: workspaceRoot,
        liveRepoRoot,
      });

      const result = await tool.execute("resolve-resource-list", {
        action: "list",
      });

      const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.action).toBe("list");
      expect(
        parsed.resources.some((entry: { id: string }) => entry.id === "memory_ops.latest_report"),
      ).toBe(true);
      expect(
        parsed.roots.find((entry: { id: string }) => entry.id === "live_repo").runtimePath,
      ).toBe(liveRepoRoot);
      expect(
        parsed.roots.find((entry: { id: string }) => entry.id === "operator_workspace").runtimePath,
      ).toBe(workspaceRoot);
    });
  });

  it("resolves the memory ops report and preserves retired-cron provenance", async () => {
    await withTempDir({ prefix: "openclaw-resource-tool-" }, async (root) => {
      const { liveRepoRoot, workspaceRoot } = await seedResourceFixtures(root);
      const tool = createResolveOpenClawResourceTool({
        workspaceDir: workspaceRoot,
        liveRepoRoot,
      });

      const result = await tool.execute("resolve-resource", {
        query: "what cron runs the memory ops report",
      });

      const text = result?.content?.find((entry) => entry.type === "text")?.text ?? "";
      const parsed = JSON.parse(text);
      expect(parsed.matched).toBe(true);
      expect(parsed.resource.id).toBe("memory_ops.latest_report");
      expect(parsed.pathResolution.canonicalOwner).toBe("memory_ops");
      expect(parsed.resource.provenance.standaloneHostCronLane).toBe("retired");
    });
  });
});
