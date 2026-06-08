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
  materializeSourceRuntimeBeforeBootstrapIfNeeded,
  resolveBootstrapContextForRun,
  resolveBootstrapFilesForRun,
  resolveContextInjectionMode,
  resolveSourceBackedAgentBootstrapFilePaths,
  SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS,
} from "./bootstrap-files.js";
import type {
  SourceRuntimeMaterializationResult,
  SourceRuntimeUnificationManifest,
} from "./source-runtime-unification.js";
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

function createSourceRuntimeBootstrapManifest(params: {
  projectRoot: string;
  runtimeHome: string;
  runtimeAgentDir: string;
  runtimeAgentAliasDir?: string;
}): SourceRuntimeUnificationManifest {
  return {
    version: 1,
    status: "test",
    canonical: {
      projectRoot: params.projectRoot,
      runtimeHome: params.runtimeHome,
    },
    runtimeAliases: [],
    executionAgentMaterializations: [
      {
        id: "execution-coding",
        kind: "agent",
        sourcePath: path.join(params.projectRoot, "docs", "agents", "execution-coding", "runtime"),
        runtimePath: params.runtimeAgentDir,
        runtimeAliasPath: params.runtimeAgentAliasDir,
        projectRoot: params.projectRoot,
      },
    ],
    executionSkillMaterializations: [],
  };
}

function createMaterializationResult(params: {
  manifest: SourceRuntimeUnificationManifest;
  status: SourceRuntimeMaterializationResult["status"];
  runtimeAgentDir: string;
  validationIssues?: string[];
}): SourceRuntimeMaterializationResult {
  const validationIssues = params.validationIssues ?? [];
  return {
    status: params.status,
    recordPath: path.join(params.manifest.canonical.runtimeHome, "source-runtime", "records.json"),
    recordFile: {
      artifactKind: "openclaw.source_runtime.materialization_records",
      schemaVersion: "openclaw.source-runtime.materialization-records.v1",
      generatedAt: "2026-06-07T00:00:00.000Z",
      manifestRef: "docs/system/registries/source-runtime-unification.yaml",
      sourceCommit: null,
      canonical: params.manifest.canonical,
      runtimeAliases: [],
      records: [],
      validationIssues,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    },
    materializedFiles: [
      {
        sourcePath: path.join(
          params.manifest.canonical.projectRoot,
          "docs",
          "agents",
          "execution-coding",
          "runtime",
          "IDENTITY.md",
        ),
        runtimePath: path.join(params.runtimeAgentDir, "IDENTITY.md"),
        runtimeAliasPath: null,
        afterHash: "hash",
      },
    ],
    validationIssues,
    reasonCodes: [
      "source_runtime_materialization_executed",
      params.status === "aligned"
        ? "source_runtime_materialization_aligned"
        : "source_runtime_materialization_residual_drift_blocked",
    ],
  };
}

describe("materializeSourceRuntimeBeforeBootstrapIfNeeded", () => {
  it("materializes source-runtime docs and skills before a materialized execution agent bootstraps", async () => {
    const root = await fs.mkdtemp(path.join(await fs.realpath("/tmp"), "openclaw-bootstrap-src-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const runtimeAgentDir = path.join(runtimeHome, "agents", "execution-coding", "agent");
    const manifest = createSourceRuntimeBootstrapManifest({
      projectRoot,
      runtimeHome,
      runtimeAgentDir,
    });
    const materializedManifests: SourceRuntimeUnificationManifest[] = [];

    const result = await materializeSourceRuntimeBeforeBootstrapIfNeeded({
      config: {
        agents: {
          list: [{ id: "execution-coding", agentDir: runtimeAgentDir }],
        },
      } as OpenClawConfig,
      sessionKey: "agent:execution-coding:node:nrun-test",
      agentId: "execution-coding",
      deps: {
        loadManifest: async () => manifest,
        materializeFiles: async ({ manifest: loadedManifest }) => {
          materializedManifests.push(loadedManifest);
          return createMaterializationResult({
            manifest: loadedManifest,
            status: "aligned",
            runtimeAgentDir,
          });
        },
      },
    });

    expect(materializedManifests).toEqual([manifest]);
    expect(result).toMatchObject({
      status: "aligned",
      agentId: "execution-coding",
      agentDir: path.resolve(runtimeAgentDir),
      materializedFileCount: 1,
    });
  });

  it("skips materialization for configured agents outside the source-runtime manifest", async () => {
    const root = await fs.mkdtemp(path.join(await fs.realpath("/tmp"), "openclaw-bootstrap-src-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const runtimeAgentDir = path.join(runtimeHome, "agents", "execution-coding", "agent");
    const unrelatedAgentDir = path.join(runtimeHome, "agents", "main", "agent");
    const manifest = createSourceRuntimeBootstrapManifest({
      projectRoot,
      runtimeHome,
      runtimeAgentDir,
    });
    let materializeCalled = false;

    const result = await materializeSourceRuntimeBeforeBootstrapIfNeeded({
      config: {
        agents: {
          list: [{ id: "main", agentDir: unrelatedAgentDir }],
        },
      } as OpenClawConfig,
      sessionKey: "agent:main:main",
      agentId: "main",
      deps: {
        loadManifest: async () => manifest,
        materializeFiles: async ({ manifest: loadedManifest }) => {
          materializeCalled = true;
          return createMaterializationResult({
            manifest: loadedManifest,
            status: "aligned",
            runtimeAgentDir,
          });
        },
      },
    });

    expect(materializeCalled).toBe(false);
    expect(result).toMatchObject({
      status: "skipped",
      reasonCode: "source_runtime_bootstrap_agent_not_materialized",
      agentId: "main",
      agentDir: path.resolve(unrelatedAgentDir),
    });
  });

  it("blocks bootstrap when source-runtime materialization leaves residual drift", async () => {
    const root = await fs.mkdtemp(path.join(await fs.realpath("/tmp"), "openclaw-bootstrap-src-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const runtimeAgentDir = path.join(runtimeHome, "agents", "execution-coding", "agent");
    const manifest = createSourceRuntimeBootstrapManifest({
      projectRoot,
      runtimeHome,
      runtimeAgentDir,
    });
    const warnings: string[] = [];

    await expect(
      materializeSourceRuntimeBeforeBootstrapIfNeeded({
        config: {
          agents: {
            list: [{ id: "execution-coding", agentDir: runtimeAgentDir }],
          },
        } as OpenClawConfig,
        sessionKey: "agent:execution-coding:node:nrun-test",
        agentId: "execution-coding",
        warn: (message) => warnings.push(message),
        deps: {
          loadManifest: async () => manifest,
          materializeFiles: async ({ manifest: loadedManifest }) =>
            createMaterializationResult({
              manifest: loadedManifest,
              status: "blocked",
              runtimeAgentDir,
              validationIssues: [
                `runtime_source_materialization_drifted:${path.join(
                  runtimeAgentDir,
                  "IDENTITY.md",
                )}`,
              ],
            }),
        },
      }),
    ).rejects.toThrow(/source-runtime materialization blocked bootstrap/);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("source-runtime materialization blocked bootstrap");
    expect(warnings[0]).toContain("runtime_source_materialization_drifted");
  });
});

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
      agentId: "unregistered-workspace-agent",
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

  it("loads source-backed agent docs instead of mutable workspace bootstrap files", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const staleAgentsPath = path.join(workspaceDir, "AGENTS.md");
    await fs.writeFile(staleAgentsPath, "# stale workspace agent rules\n", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      config: {
        agents: {
          list: [{ id: "execution-coding", agentDir: path.join(workspaceDir, "agent") }],
        },
      } as OpenClawConfig,
      sessionKey: "agent:execution-coding:node:nrun-test",
      agentId: "execution-coding",
    });

    const agents = files.find((file) => file.name === "AGENTS.md");
    expect(agents?.path).toBe(
      path.join(process.cwd(), "docs", "agents", "execution-coding", "runtime", "AGENTS.md"),
    );
    expect(agents?.content).not.toContain("stale workspace agent rules");
    expect(await fs.readFile(staleAgentsPath, "utf8")).toBe("# stale workspace agent rules\n");
    expect(files.some((file) => file.name === "SOUL.md")).toBe(false);
    expect(files.some((file) => file.name === "USER.md")).toBe(false);
  });

  it("does not apply mutable workspace bootstrap hooks to source-backed agent docs", async () => {
    registerExtraBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      sessionKey: "agent:execution-coding:node:nrun-test",
      agentId: "execution-coding",
    });

    expect(files.some((file) => file.path === path.join(workspaceDir, "EXTRA.md"))).toBe(false);
    expect(files.some((file) => file.name === "AGENTS.md")).toBe(true);
  });

  it("resolves node-agent admission paths from source-backed docs, not Runtime Home", async () => {
    const paths = await resolveSourceBackedAgentBootstrapFilePaths({
      agentId: "execution-coding",
      sessionKey: "agent:execution-coding:node:nrun-test",
      fileNames: SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS,
    });

    expect(paths).toEqual(
      SOURCE_BACKED_AGENT_REQUIRED_BOOTSTRAP_DOCS.map((docName) =>
        path.join(process.cwd(), "docs", "agents", "execution-coding", "runtime", docName),
      ),
    );
    expect(paths?.every((filePath) => !filePath.includes(".openclaw/runtime"))).toBe(true);
  });

  it("resolves ordinary registered agents from source-backed agent packs", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const agentsPath = path.join(workspaceDir, "AGENTS.md");
    await fs.writeFile(agentsPath, "# ordinary workspace rules\n", "utf8");

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      config: {
        agents: {
          list: [{ id: "main", agentDir: path.join(workspaceDir, "agent") }],
        },
      } as OpenClawConfig,
      sessionKey: "agent:main:main",
      agentId: "main",
    });

    expect(files.find((file) => file.name === "AGENTS.md")?.path).toBe(
      path.join(process.cwd(), "docs", "agents", "main", "runtime", "AGENTS.md"),
    );
    expect(files.find((file) => file.name === "AGENTS.md")?.content).not.toContain(
      "ordinary workspace rules",
    );
  });

  it("fails closed when an execution-agent registry entry lacks a runtime source path", async () => {
    await expect(
      resolveSourceBackedAgentBootstrapFilePaths({
        agentId: "execution-coding",
        sessionKey: "agent:execution-coding:node:nrun-test",
        deps: {
          loadAgentRegistryEntries: async () => [
            {
              id: "execution-coding",
              classification: "execution_platform_agent",
              projectRoot: process.cwd(),
            },
          ],
        },
      }),
    ).rejects.toThrow(/source-backed agent runtime source missing/);
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
