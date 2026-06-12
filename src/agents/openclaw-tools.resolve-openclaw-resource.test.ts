import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { persistManagedToolOutputSync } from "../config/sessions/managed-output.js";
import {
  buildSessionWorkingContextRef,
  updateSessionWorkingContext,
} from "../config/sessions/working-context.js";
import { withTempDir } from "../test-helpers/temp-dir.js";
import { createOpenClawResourceReadTool } from "./tools/openclaw-resource-read-tool.js";
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

describe("openclaw_resource_read tool", () => {
  it("hydrates bounded windows from native managed-output refs", async () => {
    await withTempDir({ prefix: "openclaw-resource-read-tool-" }, async (root) => {
      const text = Array.from(
        { length: 1_000 },
        (_unused, index) => `managed output line ${index + 1}`,
      ).join("\n");
      const persisted = persistManagedToolOutputSync({
        stateRoot: root,
        sessionKey: "agent:execution-coding:session:readback",
        toolCallId: "call-managed-readback",
        toolName: "exec",
        text,
        outputKind: "tool_result",
        reason: "test",
        now: Date.UTC(2026, 5, 8),
      });
      const tool = createOpenClawResourceReadTool({ stateRoot: root });

      const result = await tool.execute("resource-read-managed-output", {
        ref: persisted?.ref,
        limitLines: 3,
      });
      const textResult = result.content.find((entry) => entry.type === "text")?.text ?? "";
      const parsed = result.details as {
        status?: string;
        resourceKind?: string;
        byteCount?: number;
        truncated?: boolean;
        reasonCodes?: string[];
        body?: {
          text?: string;
          offsetLines?: number;
          returnedLines?: number;
          totalLines?: number;
          nextOffsetLines?: number;
          nextOffsetBytes?: number;
        };
      };

      expect(parsed).toMatchObject({
        status: "hydrated",
        resourceKind: "openclaw.managed_tool_output",
        truncated: true,
        reasonCodes: ["openclaw_resource_read_hydrated_managed_tool_output"],
      });
      expect(parsed.body?.text).toBe(
        "managed output line 1\nmanaged output line 2\nmanaged output line 3",
      );
      expect(parsed.body?.offsetLines).toBe(1);
      expect(parsed.body?.returnedLines).toBe(3);
      expect(parsed.body?.totalLines).toBe(1_000);
      expect(parsed.body?.nextOffsetLines).toBe(4);
      expect(textResult).toContain("<path>");
      expect(textResult).toContain("<type>file</type>");
      expect(textResult).toContain("<content>");
      expect(textResult).toContain("1: managed output line 1");
      expect(textResult).toContain("managed output line 2");
      expect(textResult).toContain("(Showing lines 1-3 of 1000. Use offset=4 to continue.)");

      const byteResult = await tool.execute("resource-read-managed-output-bytes", {
        ref: persisted?.ref,
        offsetBytes: 0,
        maxBytes: 1_500,
      });
      const byteTextResult = byteResult.content.find((entry) => entry.type === "text")?.text ?? "";
      const byteParsed = byteResult.details as {
        byteCount?: number;
        body?: { text?: string; nextOffsetBytes?: number };
      };
      expect(byteParsed.byteCount).toBe(1_500);
      expect(byteParsed.body?.text).toBe(text.slice(0, 1_500));
      expect(byteParsed.body?.nextOffsetBytes).toBe(1_500);
      expect(byteTextResult).toContain("[truncated: nextOffsetBytes=1500]");
    });
  });

  it("searches native managed-output refs without exposing state files", async () => {
    await withTempDir({ prefix: "openclaw-resource-read-tool-grep-" }, async (root) => {
      const text = [
        "alpha start",
        "function buildWorkQueueExecutionReadModel() {",
        "  return frontierDelta;",
        "}",
        "literal a.b marker",
        "function buildOtherReadModel() {",
        "  return null;",
        "}",
      ].join("\n");
      const persisted = persistManagedToolOutputSync({
        stateRoot: root,
        sessionKey: "agent:execution-coding:session:readback",
        toolCallId: "call-managed-search",
        toolName: "source_context_batch",
        text,
        outputKind: "source_context_batch",
        reason: "test",
        now: Date.UTC(2026, 5, 8),
      });
      const tool = createOpenClawResourceReadTool({ stateRoot: root });

      const result = await tool.execute("resource-search-managed-output", {
        ref: persisted?.ref,
        query: "build.*ReadModel",
        contextLines: 1,
      });
      const textResult = result.content.find((entry) => entry.type === "text")?.text ?? "";
      const parsed = result.details as {
        status?: string;
        resourceKind?: string;
        reasonCodes?: string[];
        body?: {
          text?: string;
          matchCount?: number;
          matches?: Array<{ line?: number; before?: string[]; after?: string[] }>;
          totalLines?: number;
        };
      };

      expect(parsed).toMatchObject({
        status: "ok",
        resourceKind: "openclaw.managed_tool_output_search",
        reasonCodes: ["openclaw_resource_read_searched_managed_tool_output"],
      });
      expect(parsed.body?.matchCount).toBe(2);
      expect(parsed.body?.totalLines).toBe(8);
      expect(parsed.body?.matches?.[0]).toMatchObject({
        line: 2,
        before: ["1: alpha start"],
        after: ["3:   return frontierDelta;"],
      });
      expect(textResult).toContain("Found 2 matches");
      expect(textResult).toContain("Line 2: function buildWorkQueueExecutionReadModel()");
      expect(textResult).toContain(persisted?.outputPath ?? "");

      const literalResult = await tool.execute("resource-search-managed-output-literal", {
        ref: persisted?.ref,
        query: "a.b",
        regex: false,
      });
      const literalParsed = literalResult.details as {
        body?: { matchCount?: number; text?: string };
      };
      expect(literalParsed.body?.matchCount).toBe(1);
      expect(literalParsed.body?.text).toContain("Line 5: literal a.b marker");

      const invalidResult = await tool.execute("resource-search-managed-output-invalid", {
        ref: persisted?.ref,
        query: "buildWorkQueueExecutionReadModel(",
      });
      const invalidText = invalidResult.content.find((entry) => entry.type === "text")?.text ?? "";
      const invalidParsed = invalidResult.details as {
        status?: string;
        body?: { regexError?: string | null; matchCount?: number };
      };
      expect(invalidParsed.status).toBe("invalid_regex");
      expect(invalidParsed.body?.regexError).toBeTruthy();
      expect(invalidParsed.body?.matchCount).toBe(0);
      expect(invalidText).toContain("Retry the same query with regex:false");
    });
  });

  it("hydrates authorized native working-context refs", async () => {
    await withTempDir({ prefix: "openclaw-resource-read-working-context-" }, async (root) => {
      const storePath = path.join(root, "sessions.json");
      const sessionKey = "agent:execution-coding:node:nrun_resource_read_context";
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: { sessionId: "sess-resource-read-context", updatedAt: 1 },
        }),
        "utf8",
      );
      await updateSessionWorkingContext({
        storePath,
        sessionKey,
        entry: {
          kind: "context_window",
          text: [
            "Bounded source windows:",
            "```ts",
            "export const genericResourceReadContext = true;",
            "```",
            "file_graph: src/a.ts -> src/b.ts evidence=src/a.ts:1",
          ].join("\n"),
        },
      });
      const tool = createOpenClawResourceReadTool({
        sessionKey,
        sessionStorePath: storePath,
      });

      const result = await tool.execute("resource-read-working-context", {
        ref: buildSessionWorkingContextRef(sessionKey),
        maxBytes: 4_000,
      });
      const textResult = result.content.find((entry) => entry.type === "text")?.text ?? "";
      const parsed = result.details as {
        status?: string;
        resourceKind?: string;
        reasonCodes?: string[];
        body?: { text?: string; activeEntryRefs?: string[] };
      };

      expect(parsed).toMatchObject({
        status: "hydrated",
        resourceKind: "openclaw.session_working_context",
        reasonCodes: ["openclaw_resource_read_hydrated_session_working_context"],
      });
      expect(parsed.body?.text).toContain("genericResourceReadContext");
      expect(parsed.body?.activeEntryRefs).toHaveLength(1);
      expect(textResult).toContain("<openclaw_native_working_context>");
      expect(textResult).toContain("genericResourceReadContext");
    });
  });
});
