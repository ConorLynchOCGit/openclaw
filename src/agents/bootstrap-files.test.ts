import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  clearInternalHooks,
  registerInternalHook,
  type AgentBootstrapHookContext,
} from "../hooks/internal-hooks.js";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import { clearAllBootstrapSnapshots, getOrLoadBootstrapFiles } from "./bootstrap-cache.js";
import {
  FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
  hasCompletedBootstrapTurn,
  resolveBootstrapContextForRun,
  resolveBootstrapFilesForRun,
  resolveContextInjectionMode,
} from "./bootstrap-files.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

function registerExtraBootstrapFileHook() {
  registerInternalHook("agent:bootstrap", (event) => {
    const context = event.context as AgentBootstrapHookContext;
    context.bootstrapFiles = [
      ...context.bootstrapFiles,
      {
        name: "EXTRA.md",
        path: path.join(context.workspaceDir, "EXTRA.md"),
        content: "extra",
        missing: false,
      } as unknown as WorkspaceBootstrapFile,
    ];
  });
}

function registerMalformedBootstrapFileHook() {
  registerInternalHook("agent:bootstrap", (event) => {
    const context = event.context as AgentBootstrapHookContext;
    context.bootstrapFiles = [
      ...context.bootstrapFiles,
      {
        name: "EXTRA.md",
        filePath: path.join(context.workspaceDir, "BROKEN.md"),
        content: "broken",
        missing: false,
      } as unknown as WorkspaceBootstrapFile,
      {
        name: "EXTRA.md",
        path: 123,
        content: "broken",
        missing: false,
      } as unknown as WorkspaceBootstrapFile,
      {
        name: "EXTRA.md",
        path: "   ",
        content: "broken",
        missing: false,
      } as unknown as WorkspaceBootstrapFile,
    ];
  });
}

const liveModelMemoryConfig = {
  plugins: {
    slots: {
      memory: "none",
    },
    entries: {
      "model-memory": {
        enabled: true,
        config: {
          database: {
            url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
          },
          live: {
            enabled: true,
            includeRetrievalPacks: true,
          },
        },
      },
    },
  },
  agents: {
    defaults: {
      memorySearch: {
        enabled: false,
      },
    },
  },
} as OpenClawConfig;

describe("resolveBootstrapFilesForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => {
    clearInternalHooks();
    clearAllBootstrapSnapshots();
  });

  it("applies bootstrap hook overrides", async () => {
    registerExtraBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      "# AGENTS.md\n\n## Session Startup\n- use startup context\n",
      "utf8",
    );
    const files = await resolveBootstrapFilesForRun({ workspaceDir });

    expect(files.some((file) => file.path === path.join(workspaceDir, "EXTRA.md"))).toBe(true);
  });

  it("drops malformed hook files with missing/invalid paths", async () => {
    registerMalformedBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const warnings: string[] = [];
    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      warn: (message) => warnings.push(message),
    });

    expect(
      files.every((file) => typeof file.path === "string" && file.path.trim().length > 0),
    ).toBe(true);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('missing or invalid "path" field');
  });

  it("materializes canonical bootstrap sections into the workspace before runtime loading", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const agentsPath = path.join(workspaceDir, "AGENTS.md");
    await fs.writeFile(
      agentsPath,
      "# AGENTS.md\n\n## Session Startup\n- use startup context\n\n## Red Lines\n- do not exfiltrate data\n",
      "utf8",
    );

    const files = await resolveBootstrapFilesForRun({ workspaceDir });
    const agents = files.find((file) => file.name === "AGENTS.md");
    const diskContent = await fs.readFile(agentsPath, "utf8");

    expect(agents?.content).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
    expect(agents?.content).toContain("## Session Startup");
    expect(diskContent).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
  });

  it("overlays fresh canonicalized MEMORY.md over stale session bootstrap snapshots", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    await fs.writeFile(
      memoryPath,
      [
        "<!-- BEGIN GENERATED: model-memory -->",
        "# MEMORY.md",
        "",
        "## Standing Context",
        "- generated",
        "<!-- END GENERATED: model-memory -->",
        "",
        "<!-- BEGIN GENERATED: openclaw-canonical -->",
        "## Workspace Recall Index",
        "- generated",
        "<!-- END GENERATED: openclaw-canonical -->",
        "",
        "# MEMORY.md",
        "",
        "## Long-Term Context",
        "- durable note",
      ].join("\n"),
      "utf8",
    );

    const stale = await getOrLoadBootstrapFiles({
      workspaceDir,
      sessionKey: "session-1",
    });
    expect(stale.find((file) => file.name === "MEMORY.md")?.content).toContain(
      "## Workspace Recall Index",
    );

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      sessionKey: "session-1",
    });
    const memory = files.find((file) => file.name === "MEMORY.md");
    const diskContent = await fs.readFile(memoryPath, "utf8");

    expect(memory?.content).toBe(
      ["# MEMORY.md", "", "## Long-Term Context", "- durable note", ""].join("\n"),
    );
    expect(memory?.content).not.toContain("## Workspace Recall Index");
    expect(diskContent).toBe(
      ["# MEMORY.md", "", "## Long-Term Context", "- durable note", ""].join("\n"),
    );
  });

  it("does not mutate root USER.md or MEMORY.md while resolving ordinary-turn context", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const userPath = path.join(workspaceDir, "USER.md");
    const memoryPath = path.join(workspaceDir, "MEMORY.md");
    const userContent = [
      "# USER.md",
      "",
      "Human-owned user context.",
      "",
      "<!-- BEGIN GENERATED: model-memory -->",
      "stale generated user projection",
      "<!-- END GENERATED: model-memory -->",
      "",
    ].join("\n");
    const memoryContent = [
      "# MEMORY.md",
      "",
      "Human-owned memory context.",
      "",
      "<!-- BEGIN GENERATED: openclaw-canonical -->",
      "stale generated memory pointer",
      "<!-- END GENERATED: openclaw-canonical -->",
      "",
    ].join("\n");
    await fs.writeFile(userPath, userContent, "utf8");
    await fs.writeFile(memoryPath, memoryContent, "utf8");

    const result = await resolveBootstrapContextForRun({
      workspaceDir,
      currentTurnText: "ordinary assistant turn",
    });
    const userFile = result.bootstrapFiles.find((file) => file.name === "USER.md");
    const memoryFile = result.bootstrapFiles.find((file) => file.name === "MEMORY.md");

    expect(await fs.readFile(userPath, "utf8")).toBe(userContent);
    expect(await fs.readFile(memoryPath, "utf8")).toBe(memoryContent);
    expect(userFile?.content).not.toContain("stale generated user projection");
    expect(memoryFile?.content).not.toContain("stale generated memory pointer");
  });
});

describe("resolveBootstrapContextForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => {
    clearInternalHooks();
    clearAllBootstrapSnapshots();
  });

  it("returns context files for hook-adjusted bootstrap files", async () => {
    registerExtraBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const extra = result.contextFiles.find(
      (file) => file.path === path.join(workspaceDir, "EXTRA.md"),
    );

    expect(extra?.content).toBe("extra");
  });

  it("does not inject model-memory overlay context into ordinary bootstrap unless explicitly opted in", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(
      path.join(workspaceDir, "AGENTS.md"),
      "# AGENTS.md\n\n- repo rules\n",
      "utf8",
    );

    const result = await resolveBootstrapContextForRun({
      workspaceDir,
      config: liveModelMemoryConfig,
      sessionKey: "agent:execution-coding:node:nrun-test",
      sessionId: "nrun-test",
      agentId: "execution-coding",
      currentTurnText: "Execute the worker node.",
    });

    expect(
      result.contextFiles.some(
        (file) =>
          file.path.includes(".openclaw/model-memory/") ||
          file.path.includes("retrieval-pack") ||
          file.path.includes("projection"),
      ),
    ).toBe(false);
    expect(result.contextFiles.some((file) => file.path.endsWith("AGENTS.md"))).toBe(true);
  });

  it("uses heartbeat-only bootstrap files in lightweight heartbeat mode", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "check inbox", "utf8");
    await fs.writeFile(path.join(workspaceDir, "SOUL.md"), "persona", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      contextMode: "lightweight",
      runKind: "heartbeat",
    });

    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => file.name === "HEARTBEAT.md")).toBe(true);
  });

  it("keeps bootstrap context empty in lightweight cron mode", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "check inbox", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      contextMode: "lightweight",
      runKind: "cron",
    });

    expect(files).toEqual([]);
  });

  it("drops HEARTBEAT.md for non-heartbeat runs when the heartbeat prompt section is disabled", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "check inbox", "utf8");
    await fs.writeFile(path.join(workspaceDir, "AGENTS.md"), "repo rules", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      config: {
        agents: {
          defaults: {
            heartbeat: {
              includeSystemPromptSection: false,
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "HEARTBEAT.md")).toBe(false);
    expect(files.some((file) => file.name === "AGENTS.md")).toBe(true);
  });

  it("drops HEARTBEAT.md for non-heartbeat runs when the heartbeat cadence is disabled", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "check inbox", "utf8");
    await fs.writeFile(path.join(workspaceDir, "AGENTS.md"), "repo rules", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      config: {
        agents: {
          defaults: {
            heartbeat: {
              every: "0m",
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "HEARTBEAT.md")).toBe(false);
    expect(files.some((file) => file.name === "AGENTS.md")).toBe(true);
  });

  it("keeps HEARTBEAT.md for actual heartbeat runs even when the prompt section is disabled", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "check inbox", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      runKind: "heartbeat",
      config: {
        agents: {
          defaults: {
            heartbeat: {
              includeSystemPromptSection: false,
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "HEARTBEAT.md")).toBe(true);
  });
});

describe("hasCompletedBootstrapTurn", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(await fs.realpath("/tmp"), "openclaw-bootstrap-turn-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false when session file does not exist", async () => {
    expect(await hasCompletedBootstrapTurn(path.join(tmpDir, "missing.jsonl"))).toBe(false);
  });

  it("returns false for empty session files", async () => {
    const sessionFile = path.join(tmpDir, "empty.jsonl");
    await fs.writeFile(sessionFile, "", "utf8");
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(false);
  });

  it("returns false for header-only session files", async () => {
    const sessionFile = path.join(tmpDir, "header-only.jsonl");
    await fs.writeFile(sessionFile, `${JSON.stringify({ type: "session", id: "s1" })}\n`, "utf8");
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(false);
  });

  it("returns false when no assistant turn has been flushed yet", async () => {
    const sessionFile = path.join(tmpDir, "user-only.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({ type: "session", id: "s1" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(false);
  });

  it("returns false for assistant turns without a recorded full bootstrap marker", async () => {
    const sessionFile = path.join(tmpDir, "assistant-no-marker.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({ type: "session", id: "s1" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
        JSON.stringify({ type: "message", message: { role: "assistant", content: "hi" } }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(false);
  });

  it("returns true when a full bootstrap completion marker exists", async () => {
    const sessionFile = path.join(tmpDir, "full-bootstrap.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({ type: "message", message: { role: "assistant", content: "hi" } }),
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 1 },
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(true);
  });

  it("returns false when compaction happened after the last assistant turn", async () => {
    const sessionFile = path.join(tmpDir, "post-compaction.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 1 },
        }),
        JSON.stringify({ type: "compaction", summary: "trimmed" }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(false);
  });

  it("returns true when a later full bootstrap marker happens after compaction", async () => {
    const sessionFile = path.join(tmpDir, "assistant-after-compaction.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 1 },
        }),
        JSON.stringify({ type: "compaction", summary: "trimmed" }),
        JSON.stringify({ type: "message", message: { role: "user", content: "new ask" } }),
        JSON.stringify({ type: "message", message: { role: "assistant", content: "new reply" } }),
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 2 },
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(true);
  });

  it("ignores malformed JSON lines", async () => {
    const sessionFile = path.join(tmpDir, "malformed.jsonl");
    await fs.writeFile(
      sessionFile,
      [
        "{broken",
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 1 },
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(true);
  });

  it("finds a recent full bootstrap marker even when the scan starts mid-file", async () => {
    const sessionFile = path.join(tmpDir, "large-prefix.jsonl");
    const hugePrefix = "x".repeat(300 * 1024);
    await fs.writeFile(
      sessionFile,
      [
        JSON.stringify({ type: "message", message: { role: "user", content: hugePrefix } }),
        JSON.stringify({
          type: "custom",
          customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE,
          data: { timestamp: 1 },
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    expect(await hasCompletedBootstrapTurn(sessionFile)).toBe(true);
  });

  it("returns false for symbolic links", async () => {
    const realFile = path.join(tmpDir, "real.jsonl");
    const linkFile = path.join(tmpDir, "link.jsonl");
    await fs.writeFile(
      realFile,
      `${JSON.stringify({ type: "custom", customType: FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE, data: { timestamp: 1 } })}\n`,
      "utf8",
    );
    await fs.symlink(realFile, linkFile);
    expect(await hasCompletedBootstrapTurn(linkFile)).toBe(false);
  });
});

describe("resolveContextInjectionMode", () => {
  it("defaults to always when config is missing", () => {
    expect(resolveContextInjectionMode(undefined)).toBe("always");
  });

  it("defaults to always when the setting is omitted", () => {
    expect(resolveContextInjectionMode({ agents: { defaults: {} } } as never)).toBe("always");
  });

  it("returns the configured continuation-skip mode", () => {
    expect(
      resolveContextInjectionMode({
        agents: { defaults: { contextInjection: "continuation-skip" } },
      } as never),
    ).toBe("continuation-skip");
  });
});
