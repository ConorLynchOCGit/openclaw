import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../test-helpers/temp-dir.js";
import {
  listOpenClawResourceRoots,
  listOpenClawResources,
  resolveOpenClawResource,
  resolveOpenClawResourceRegistryOptions,
} from "./openclaw-resource-registry.js";

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
      "## Critical Issues",
      "",
      "- No current findings.",
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "projects/ops/generated_current/memory_ops_health_report_current.md"),
    [
      "# Memory Ops Health Report - Current Alias",
      "",
      "- source_generated_at_utc: 2026-04-24T17:00:00Z",
      "",
    ].join("\n"),
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

describe("openclaw resource registry", () => {
  it("derives default registry roots from the source-runtime manifest", async () => {
    const options = await resolveOpenClawResourceRegistryOptions();

    expect(options.liveRepoRoot).toBe("/root/services/openclaw-roles/live");
    expect(options.workspaceRoot).toBe("/root/.openclaw/workspace");
    expect(options.runtimeLiveRepoRoot).toBe(options.liveRepoRoot);
    expect(options.runtimeWorkspaceRoot).toBe(options.workspaceRoot);

    const roots = listOpenClawResourceRoots(options);
    expect(roots.find((rootEntry) => rootEntry.id === "live_repo")?.runtimePath).toBe(
      "/root/services/openclaw-roles/live",
    );
    expect(roots.find((rootEntry) => rootEntry.id === "operator_workspace")?.runtimePath).toBe(
      "/root/.openclaw/workspace",
    );
  });

  it("lists high-value cross-root operator artifacts with stable ids and provenance", async () => {
    await withTempDir({ prefix: "openclaw-resource-registry-" }, async (root) => {
      const { liveRepoRoot, workspaceRoot } = await seedResourceFixtures(root);

      const roots = listOpenClawResourceRoots({ liveRepoRoot, workspaceRoot });
      expect(roots.map((rootEntry) => rootEntry.id)).toEqual([
        "live_repo",
        "operator_workspace",
        "generated_current",
        "memory_ops",
        "archive_reports",
      ]);

      const resources = await listOpenClawResources({ liveRepoRoot, workspaceRoot });
      const memoryOps = resources.find((resource) => resource.id === "memory_ops.latest_report");
      const alias = resources.find(
        (resource) => resource.id === "ops.generated_current.memory_ops_report_current",
      );
      const cronHealth = resources.find(
        (resource) => resource.id === "ops.cron_health.latest_rollup",
      );

      expect(memoryOps?.freshness.sourceGeneratedAtUtc).toBe("2026-04-24T17:00:00Z");
      expect(memoryOps?.provenance.standaloneHostCronLane).toBe("retired");
      expect(memoryOps?.readScopeHint).toBe("live_repo");
      expect(alias?.canonicalResourceId).toBe("memory_ops.latest_report");
      expect(alias?.readScopeHint).toBe("operator_workspace");
      expect(cronHealth?.hostPath).toContain("archives/cron_health_rollups/2026-04-24.md");
    });
  });

  it("resolves the memory ops report deterministically from operator-facing alias text", async () => {
    await withTempDir({ prefix: "openclaw-resource-registry-" }, async (root) => {
      const { liveRepoRoot, workspaceRoot } = await seedResourceFixtures(root);

      const result = await resolveOpenClawResource("report referenced by daily operator brief", {
        liveRepoRoot,
        workspaceRoot,
      });

      expect(result.matched).toBe(true);
      expect(result.matchedBy).toBe("alias");
      expect(result.resource?.id).toBe("memory_ops.latest_report");
      expect(result.pathResolution?.canonicalOwner).toBe("memory_ops");
      expect(result.resource?.provenance.producerType).toBe("repo_owned_report_artifact");
      expect(result.resource?.provenance.standaloneHostCronLane).toBe("retired");
    });
  });
});
