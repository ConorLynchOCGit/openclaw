import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditSourceRuntimeMaterializationDrift,
  buildSourceRuntimeDirtyWorktreeReconciliation,
  buildSourceRuntimeMaterializationRecords,
  evaluateSourceRuntimeForkTransitionReadiness,
  isSourceRuntimeMaterializedAgentStart,
  loadSourceRuntimeUnificationManifest,
  materializeSourceRuntimeFiles,
  parseGitRemoteVerbose,
  resolveSourceRuntimeDirtyWorktreeReconciliationPath,
  resolveSourceRuntimeForkTransitionReadinessPath,
  resolveSourceRuntimeMaterializationRecordPath,
  summarizeSourceRuntimeDirtyWorktree,
  validateExecutionAgentSourceRuntimeConfig,
  validateSourceRuntimeMaterializationRecords,
  writeSourceRuntimeDirtyWorktreeReconciliation,
  writeSourceRuntimeForkTransitionReadiness,
  writeSourceRuntimeMaterializationRecords,
  type SourceRuntimeUnificationManifest,
} from "./source-runtime-unification.js";

describe("source/runtime unification manifest", () => {
  it("summarizes dirty worktree entries into bounded fork-transition categories", () => {
    const summary = summarizeSourceRuntimeDirtyWorktree(
      [
        " M src/agents/source-runtime-unification.ts",
        "M  docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
        " D extensions/execution-platform/src/workflows/context-broker.ts",
        " M scripts/execution-platform-read-runtime-job-telemetry.mjs",
        " M src/agents/openclaw-tools.ts",
        " M extensions/model-memory/src/model-execution.ts",
        " M docs/system/registries/index.md",
        "?? .agents/registry.yaml",
        "?? skills/execution-node-workflow/SKILL.md",
        " M docs/agents/registry.yaml",
        "M  AGENTS.md",
        " M package.json",
      ].join("\n"),
      3,
    );

    expect(summary).toMatchObject({
      total: 12,
      statusCounts: {
        M: 9,
        D: 1,
        "??": 2,
      },
      categoryCounts: {
        source_runtime_unification: 2,
        execution_platform_runtime: 1,
        execution_platform_docs: 1,
        execution_platform_scripts: 1,
        openclaw_agent_runtime: 1,
        model_memory_runtime: 1,
        system_registry: 1,
        agent_docs_registry: 1,
        machine_agent_registry: 1,
        root_agent_surface: 1,
        repo_other: 1,
      },
      stagedEntryCount: 2,
      unstagedEntryCount: 10,
      deletedEntryCount: 1,
      untrackedEntryCount: 2,
      sampleLimit: 3,
    });
    expect(summary.sampleEntries).toEqual([
      {
        status: " M",
        path: "src/agents/source-runtime-unification.ts",
        category: "source_runtime_unification",
      },
      {
        status: "M ",
        path: "docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
        category: "execution_platform_docs",
      },
      {
        status: " D",
        path: "extensions/execution-platform/src/workflows/context-broker.ts",
        category: "execution_platform_runtime",
      },
    ]);
  });

  it("builds a dirty-worktree reconciliation inventory with deterministic actions", () => {
    const reconciliation = buildSourceRuntimeDirtyWorktreeReconciliation({
      statusOutput: [
        " M src/agents/source-runtime-unification.ts",
        "M  docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
        " D extensions/execution-platform/src/workflows/context-broker.ts",
        " M scripts/execution-platform-read-runtime-job-telemetry.mjs",
        " M src/agents/openclaw-tools.ts",
        " M extensions/model-memory/src/model-execution.ts",
        " M docs/system/registries/index.md",
        "?? .agents/registry.yaml",
        "?? skills/execution-node-workflow/SKILL.md",
        " M docs/agents/registry.yaml",
        "M  AGENTS.md",
        " M package.json",
      ].join("\n"),
      head: "head",
      branch: "branch",
      generatedAt: "2026-06-07T00:00:00.000Z",
      readinessRef: "/runtime/fork-transition-readiness.json",
    });

    expect(reconciliation).toMatchObject({
      artifactKind: "openclaw.source_runtime.dirty_worktree_reconciliation",
      schemaVersion: "openclaw.source-runtime.dirty-worktree-reconciliation.v1",
      generatedAt: "2026-06-07T00:00:00.000Z",
      manifestRef: "docs/system/registries/source-runtime-unification.yaml",
      readinessRef: "/runtime/fork-transition-readiness.json",
      head: "head",
      branch: "branch",
      summary: {
        total: 12,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    });
    expect(reconciliation.entries).toEqual([
      expect.objectContaining({
        path: "src/agents/source-runtime-unification.ts",
        category: "source_runtime_unification",
        migrationAction: "include_in_phase0_fork_transition",
      }),
      expect.objectContaining({
        path: "docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md",
        category: "execution_platform_docs",
        migrationAction: "preserve_active_goal_work_before_switch",
      }),
      expect.objectContaining({
        path: "extensions/execution-platform/src/workflows/context-broker.ts",
        category: "execution_platform_runtime",
        migrationAction: "preserve_active_goal_work_before_switch",
      }),
      expect.objectContaining({
        path: "scripts/execution-platform-read-runtime-job-telemetry.mjs",
        category: "execution_platform_scripts",
        migrationAction: "preserve_active_goal_work_before_switch",
      }),
      expect.objectContaining({
        path: "src/agents/openclaw-tools.ts",
        category: "openclaw_agent_runtime",
        migrationAction: "preserve_openclaw_runtime_work_before_switch",
      }),
      expect.objectContaining({
        path: "extensions/model-memory/src/model-execution.ts",
        category: "model_memory_runtime",
        migrationAction: "preserve_adjacent_runtime_work_before_switch",
      }),
      expect.objectContaining({
        path: "docs/system/registries/index.md",
        category: "system_registry",
        migrationAction: "preserve_system_registry_before_switch",
      }),
      expect.objectContaining({
        path: ".agents/registry.yaml",
        category: "machine_agent_registry",
        migrationAction: "preserve_agent_surface_before_switch",
      }),
      expect.objectContaining({
        path: "skills/execution-node-workflow/SKILL.md",
        category: "source_runtime_unification",
        migrationAction: "include_in_phase0_fork_transition",
      }),
      expect.objectContaining({
        path: "docs/agents/registry.yaml",
        category: "agent_docs_registry",
        migrationAction: "preserve_agent_surface_before_switch",
      }),
      expect.objectContaining({
        path: "AGENTS.md",
        category: "root_agent_surface",
        migrationAction: "preserve_agent_surface_before_switch",
      }),
      expect.objectContaining({
        path: "package.json",
        category: "repo_other",
        migrationAction: "classify_before_switch",
      }),
    ]);
  });

  it("parses git remote output and keeps fork migration pending while dirty", () => {
    const remotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (push)",
        "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (push)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
        "upstream\tDISABLED (push)",
      ].join("\n"),
    );

    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes,
        dirtyEntryCount: 481,
        head: "head",
        branch: "phase2",
        preservationArtifactPath:
          ".artifacts/execution-platform/source-runtime-unification/snapshot",
        preservationArtifactPresent: true,
      }),
    ).toMatchObject({
      status: "pending_dirty_worktree_reconciliation",
      dirtyEntryCount: 481,
      dirtyWorktreeSummary: {
        total: 481,
      },
      unclassifiedDirtyEntryCount: 481,
      originUrl: "git@github.com:ConorLynchOCGit/openclaw-platform.git",
      forkUrl: "git@github.com:ConorLynchOCGit/openclaw.git",
      upstreamUrl: "https://github.com/openclaw/openclaw.git",
      preservationArtifactPresent: true,
      reasonCodes: expect.arrayContaining([
        "source_runtime_origin_not_fork",
        "source_runtime_fork_remote_present",
        "source_runtime_upstream_remote_present",
        "source_runtime_preservation_artifact_present",
      ]),
    });
  });

  it("allows a non-destructive origin switch when dirty work is classified and preservation checksums verify", () => {
    const remotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
        "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
      ].join("\n"),
    );
    const dirtyWorktreeSummary = summarizeSourceRuntimeDirtyWorktree(
      [
        " M src/agents/source-runtime-unification.ts",
        " M scripts/execution-platform-read-runtime-job-telemetry.mjs",
        " M src/agents/openclaw-tools.ts",
      ].join("\n"),
    );

    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes,
        dirtyEntryCount: 3,
        dirtyWorktreeSummary,
        preservationArtifactPath:
          ".artifacts/execution-platform/source-runtime-unification/snapshot",
        preservationArtifactPresent: true,
        preservationChecksumVerified: true,
        preservationChecksumEntryCount: 8,
        runtimePreservationArtifactPath:
          "/root/.openclaw/source-runtime/preservation-snapshots/snapshot",
        runtimePreservationArtifactPresent: true,
        runtimePreservationChecksumVerified: true,
        runtimePreservationChecksumEntryCount: 8,
      }),
    ).toMatchObject({
      status: "ready_to_switch_origin_with_preserved_dirty_worktree",
      dirtyEntryCount: 3,
      unclassifiedDirtyEntryCount: 0,
      preservationChecksumVerified: true,
      runtimePreservationChecksumVerified: true,
      reasonCodes: expect.arrayContaining([
        "source_runtime_dirty_worktree_fully_classified",
        "source_runtime_preservation_checksum_verified",
        "source_runtime_runtime_preservation_checksum_verified",
      ]),
    });
  });

  it("reports migrated with preserved dirty worktree after origin points at the fork", () => {
    const remotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
      ].join("\n"),
    );
    const dirtyWorktreeSummary = summarizeSourceRuntimeDirtyWorktree(
      [
        " M src/agents/source-runtime-unification.ts",
        " M scripts/execution-platform-read-runtime-job-telemetry.mjs",
      ].join("\n"),
    );

    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes,
        dirtyEntryCount: 2,
        dirtyWorktreeSummary,
        preservationArtifactPresent: true,
        preservationChecksumVerified: true,
        preservationChecksumEntryCount: 8,
        runtimePreservationArtifactPresent: true,
        runtimePreservationChecksumVerified: true,
        runtimePreservationChecksumEntryCount: 8,
      }),
    ).toMatchObject({
      status: "migrated_with_preserved_dirty_worktree",
      dirtyEntryCount: 2,
      unclassifiedDirtyEntryCount: 0,
      forkUrl: null,
      reasonCodes: expect.arrayContaining([
        "source_runtime_fork_remote_not_required_origin_canonical",
      ]),
    });
  });

  it("keeps dirty fork transition pending when any dirty entry is still unclassified", () => {
    const remotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
        "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
      ].join("\n"),
    );
    const dirtyWorktreeSummary = summarizeSourceRuntimeDirtyWorktree(
      [" M src/agents/source-runtime-unification.ts", " M package.json"].join("\n"),
    );

    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes,
        dirtyEntryCount: 2,
        dirtyWorktreeSummary,
        preservationArtifactPresent: true,
        preservationChecksumVerified: true,
        runtimePreservationArtifactPresent: true,
        runtimePreservationChecksumVerified: true,
      }),
    ).toMatchObject({
      status: "pending_dirty_worktree_reconciliation",
      dirtyEntryCount: 2,
      unclassifiedDirtyEntryCount: 1,
      reasonCodes: expect.arrayContaining([
        "source_runtime_dirty_worktree_has_unclassified_entries",
      ]),
    });
  });

  it("reports clean fork transition states without changing remotes", () => {
    const forkRemotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
        "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (push)",
        "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
      ].join("\n"),
    );
    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes: forkRemotes,
        dirtyEntryCount: 0,
        preservationArtifactPresent: true,
      }).status,
    ).toBe("ready_to_switch_origin");

    const migratedRemotes = parseGitRemoteVerbose(
      [
        "origin\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
        "origin\tgit@github.com:ConorLynchOCGit/openclaw.git (push)",
        "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
      ].join("\n"),
    );
    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes: migratedRemotes,
        dirtyEntryCount: 0,
        preservationArtifactPresent: true,
      }).status,
    ).toBe("migrated");

    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes: migratedRemotes.filter((remote) => remote.name !== "upstream"),
        dirtyEntryCount: 0,
      }).status,
    ).toBe("upstream_remote_missing");
    expect(
      evaluateSourceRuntimeForkTransitionReadiness({
        remotes: parseGitRemoteVerbose(
          [
            "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
            "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
          ].join("\n"),
        ),
        dirtyEntryCount: 0,
      }).status,
    ).toBe("fork_remote_missing");
  });

  it("writes a bounded fork-transition readiness record into Runtime Home", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-runtime-fork-readiness-"));
    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot: path.join(root, "repo"),
        runtimeHome: path.join(root, "runtime"),
      },
      runtimeAliases: [],
      executionAgentMaterializations: [],
      executionSkillMaterializations: [],
    };
    const readiness = evaluateSourceRuntimeForkTransitionReadiness({
      remotes: parseGitRemoteVerbose(
        [
          "origin\tgit@github.com:ConorLynchOCGit/openclaw-platform.git (fetch)",
          "openclaw-fork\tgit@github.com:ConorLynchOCGit/openclaw.git (fetch)",
          "upstream\thttps://github.com/openclaw/openclaw.git (fetch)",
        ].join("\n"),
      ),
      dirtyEntryCount: 3,
      head: "head",
      branch: "branch",
      preservationArtifactPath: ".artifacts/snapshot",
      preservationArtifactPresent: true,
    });

    const written = await writeSourceRuntimeForkTransitionReadiness({
      manifest,
      readiness,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(written.recordPath).toBe(resolveSourceRuntimeForkTransitionReadinessPath(manifest));
    expect(written.recordFile).toMatchObject({
      artifactKind: "openclaw.source_runtime.fork_transition_readiness",
      schemaVersion: "openclaw.source-runtime.fork-transition-readiness.v1",
      readiness: {
        status: "pending_dirty_worktree_reconciliation",
        dirtyEntryCount: 3,
        preservationArtifactPresent: true,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    });
    const raw = JSON.parse(await fs.readFile(written.recordPath, "utf8")) as {
      readiness?: { status?: string };
    };
    expect(raw.readiness?.status).toBe("pending_dirty_worktree_reconciliation");
  });

  it("writes a bounded dirty-worktree reconciliation record into Runtime Home", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-runtime-dirty-reconciliation-"));
    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot: path.join(root, "repo"),
        runtimeHome: path.join(root, "runtime"),
      },
      runtimeAliases: [],
      executionAgentMaterializations: [],
      executionSkillMaterializations: [],
    };
    const reconciliation = buildSourceRuntimeDirtyWorktreeReconciliation({
      statusOutput: [" M src/agents/source-runtime-unification.ts", "?? package.json"].join("\n"),
      head: "head",
      branch: "branch",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    const written = await writeSourceRuntimeDirtyWorktreeReconciliation({
      manifest,
      reconciliation,
    });

    expect(written.recordPath).toBe(resolveSourceRuntimeDirtyWorktreeReconciliationPath(manifest));
    expect(written.recordFile).toMatchObject({
      artifactKind: "openclaw.source_runtime.dirty_worktree_reconciliation",
      schemaVersion: "openclaw.source-runtime.dirty-worktree-reconciliation.v1",
      summary: {
        total: 2,
      },
      entries: [
        expect.objectContaining({
          path: "src/agents/source-runtime-unification.ts",
          migrationAction: "include_in_phase0_fork_transition",
        }),
        expect.objectContaining({
          path: "package.json",
          migrationAction: "classify_before_switch",
        }),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    });
    const raw = JSON.parse(await fs.readFile(written.recordPath, "utf8")) as {
      entries?: Array<{ path?: string }>;
    };
    expect(raw.entries).toContainEqual(
      expect.objectContaining({
        path: "src/agents/source-runtime-unification.ts",
      }),
    );
  });

  it("loads the Phase 0 manifest from repo source", async () => {
    const manifest = await loadSourceRuntimeUnificationManifest();

    expect(manifest.status).toBe(
      "phase0_repo_local_runtime_unification_complete_worker_agent_refactor_unblocked",
    );
    expect(manifest.canonical).toEqual({
      projectRoot: "/root/services/openclaw-roles/live",
      executionPlatformDocsRoot:
        "/root/services/openclaw-roles/live/docs/projects/execution-platform",
      runtimeHome: "/root/services/openclaw-roles/live/.openclaw/runtime",
      configPath: "/root/services/openclaw-roles/live/.openclaw/runtime/openclaw.json",
      sourceRuntimeRecordPath:
        "/root/services/openclaw-roles/live/.openclaw/runtime/source-runtime/materialization-records.json",
      forkTransitionReadinessPath:
        "/root/services/openclaw-roles/live/.openclaw/runtime/source-runtime/fork-transition-readiness.json",
      dirtyWorktreeReconciliationPath:
        "/root/services/openclaw-roles/live/.openclaw/runtime/source-runtime/dirty-worktree-reconciliation.json",
    });
    expect(manifest.runtimeAliases).toContainEqual({
      aliasPath: "/home/node/.openclaw",
      canonicalPath: "/root/services/openclaw-roles/live/.openclaw/runtime",
      label: "container-runtime-home-alias",
      status: "compatibility_alias_only",
    });
    expect(manifest.runtimeAliases).toContainEqual({
      aliasPath: "/root/.openclaw",
      canonicalPath: "/root/services/openclaw-roles/live/.openclaw/runtime",
      label: "host-runtime-home-alias",
      status: "compatibility_alias_only",
    });
    expect(manifest.githubTopology).toEqual(
      expect.objectContaining({
        current: expect.objectContaining({
          origin: expect.objectContaining({
            nameWithOwner: "ConorLynchOCGit/openclaw",
            isFork: true,
            parent: "openclaw/openclaw",
          }),
          platformLegacy: expect.objectContaining({
            remoteName: "platform-legacy",
            nameWithOwner: "ConorLynchOCGit/openclaw-platform",
            push: "DISABLED",
          }),
          upstream: expect.objectContaining({
            remoteName: "upstream",
            nameWithOwner: "openclaw/openclaw",
            push: "DISABLED",
          }),
        }),
        target: expect.objectContaining({
          origin: "writable_fork_remote",
          upstream: "original_openclaw_read_only_remote",
        }),
      }),
    );
  });

  it("expands repo-owned execution agent docs and skills into materialization records", async () => {
    const records = await buildSourceRuntimeMaterializationRecords({
      sourceCommit: "test-commit",
    });

    expect(records.length).toBeGreaterThanOrEqual(18);
    expect(records).toContainEqual(
      expect.objectContaining({
        runtimePath:
          "/root/services/openclaw-roles/live/.openclaw/runtime/agents/execution-coding/agent/IDENTITY.md",
        sourcePath:
          "/root/services/openclaw-roles/live/docs/agents/execution-coding/runtime/IDENTITY.md",
        sourceCommit: "test-commit",
        mode: "materialized",
        reconciled: true,
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        runtimePath:
          "/root/services/openclaw-roles/live/.openclaw/runtime/workspace/skills/execution-node-workflow/SKILL.md",
        sourcePath: "/root/services/openclaw-roles/live/skills/execution-node-workflow/SKILL.md",
        sourceCommit: "test-commit",
        mode: "materialized",
        reconciled: true,
      }),
    );
    expect(
      records.every((record) =>
        record.runtimePath.startsWith("/root/services/openclaw-roles/live/.openclaw/runtime/"),
      ),
    ).toBe(true);
    expect(
      records.every((record) =>
        record.sourcePath?.startsWith("/root/services/openclaw-roles/live/"),
      ),
    ).toBe(true);
  });

  it("validates all generated materialization records", async () => {
    await expect(validateSourceRuntimeMaterializationRecords()).resolves.toEqual([]);
  });

  it("writes a runtime-home source record file and detects source/runtime drift", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-runtime-records-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const sourceAgentDir = path.join(projectRoot, "docs", "agents", "execution-coding", "runtime");
    const runtimeAgentDir = path.join(runtimeHome, "agents", "execution-coding", "agent");
    await fs.mkdir(sourceAgentDir, { recursive: true });
    await fs.mkdir(runtimeAgentDir, { recursive: true });
    await fs.writeFile(path.join(sourceAgentDir, "IDENTITY.md"), "# execution-coding\n", "utf8");
    await fs.writeFile(path.join(runtimeAgentDir, "IDENTITY.md"), "# execution-coding\n", "utf8");

    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot,
        runtimeHome,
      },
      runtimeAliases: [],
      executionAgentMaterializations: [
        {
          id: "execution-coding",
          kind: "agent",
          sourcePath: sourceAgentDir,
          runtimePath: runtimeAgentDir,
          projectRoot,
        },
      ],
      executionSkillMaterializations: [],
    };

    expect(await auditSourceRuntimeMaterializationDrift({ manifest })).toEqual([]);

    const written = await writeSourceRuntimeMaterializationRecords({
      manifest,
      sourceCommit: "test-commit",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(written.recordPath).toBe(resolveSourceRuntimeMaterializationRecordPath(manifest));
    expect(written.recordFile).toMatchObject({
      artifactKind: "openclaw.source_runtime.materialization_records",
      schemaVersion: "openclaw.source-runtime.materialization-records.v1",
      sourceCommit: "test-commit",
      validationIssues: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawTranscriptStored: false,
      hiddenReasoningStored: false,
    });
    const raw = JSON.parse(await fs.readFile(written.recordPath, "utf8")) as {
      records?: Array<{ runtimePath?: string; sourcePath?: string }>;
    };
    expect(raw.records).toContainEqual(
      expect.objectContaining({
        runtimePath: path.join(runtimeAgentDir, "IDENTITY.md"),
        sourcePath: path.join(sourceAgentDir, "IDENTITY.md"),
      }),
    );

    await fs.writeFile(path.join(runtimeAgentDir, "IDENTITY.md"), "# drifted\n", "utf8");
    expect(await auditSourceRuntimeMaterializationDrift({ manifest })).toEqual([
      `runtime_source_materialization_drifted:${path.join(runtimeAgentDir, "IDENTITY.md")}`,
    ]);
  });

  it("detects stale active runtime skill copies as source/runtime drift", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-runtime-skill-drift-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const sourceSkillPath = path.join(projectRoot, "skills", "execution-node-workflow", "SKILL.md");
    const runtimeSkillPath = path.join(
      runtimeHome,
      "workspace",
      "skills",
      "execution-node-workflow",
      "SKILL.md",
    );
    const runtimeAliasSkillPath = path.join(
      root,
      "runtime-alias",
      "workspace",
      "skills",
      "execution-node-workflow",
      "SKILL.md",
    );
    await fs.mkdir(path.dirname(sourceSkillPath), { recursive: true });
    await fs.mkdir(path.dirname(runtimeSkillPath), { recursive: true });
    await fs.mkdir(path.dirname(runtimeAliasSkillPath), { recursive: true });
    await fs.writeFile(
      sourceSkillPath,
      "# Execution Node Workflow\n\nUse task delegation.\n",
      "utf8",
    );
    await fs.writeFile(
      runtimeSkillPath,
      "# Execution Node Workflow\n\nUse task delegation.\n",
      "utf8",
    );
    await fs.writeFile(
      runtimeAliasSkillPath,
      "# Execution Node Workflow\n\nUse task delegation.\n",
      "utf8",
    );

    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot,
        runtimeHome,
      },
      runtimeAliases: [],
      executionAgentMaterializations: [],
      executionSkillMaterializations: [
        {
          id: "execution-node-workflow",
          kind: "skill",
          sourcePath: sourceSkillPath,
          runtimePath: runtimeSkillPath,
          runtimeAliasPath: runtimeAliasSkillPath,
          projectRoot,
        },
      ],
    };

    const records = await buildSourceRuntimeMaterializationRecords({
      manifest,
      sourceCommit: "test-commit",
    });
    expect(records).toContainEqual(
      expect.objectContaining({
        runtimePath: runtimeSkillPath,
        sourcePath: sourceSkillPath,
        sourceCommit: "test-commit",
        mode: "materialized",
        reconciled: true,
      }),
    );
    expect(await auditSourceRuntimeMaterializationDrift({ manifest })).toEqual([]);

    await fs.writeFile(runtimeSkillPath, "# stale runtime copy\n", "utf8");
    expect(await auditSourceRuntimeMaterializationDrift({ manifest })).toEqual([
      `runtime_source_materialization_drifted:${runtimeSkillPath}`,
    ]);

    await fs.writeFile(
      runtimeSkillPath,
      "# Execution Node Workflow\n\nUse task delegation.\n",
      "utf8",
    );
    await fs.writeFile(runtimeAliasSkillPath, "# stale runtime alias copy\n", "utf8");
    expect(await auditSourceRuntimeMaterializationDrift({ manifest })).toEqual([
      `runtime_source_materialization_alias_drifted:${runtimeAliasSkillPath}`,
    ]);
  });

  it("links repo-owned execution docs and skills into runtime home and alias paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "source-runtime-materialize-"));
    const projectRoot = path.join(root, "repo");
    const runtimeHome = path.join(root, "runtime");
    const runtimeAliasHome = path.join(root, "runtime-alias");
    const sourceAgentDir = path.join(
      projectRoot,
      "docs",
      "agents",
      "execution-context-scout",
      "runtime",
    );
    const runtimeAgentDir = path.join(runtimeHome, "agents", "execution-context-scout", "agent");
    const runtimeAliasAgentDir = path.join(
      runtimeAliasHome,
      "agents",
      "execution-context-scout",
      "agent",
    );
    const sourceSkillPath = path.join(projectRoot, "skills", "execution-context-scout", "SKILL.md");
    const runtimeSkillPath = path.join(
      runtimeHome,
      "workspace",
      "skills",
      "execution-context-scout",
      "SKILL.md",
    );
    const runtimeAliasSkillPath = path.join(
      runtimeAliasHome,
      "workspace",
      "skills",
      "execution-context-scout",
      "SKILL.md",
    );
    await fs.mkdir(sourceAgentDir, { recursive: true });
    await fs.mkdir(path.dirname(sourceSkillPath), { recursive: true });
    await fs.mkdir(runtimeAgentDir, { recursive: true });
    await fs.mkdir(runtimeAliasAgentDir, { recursive: true });
    await fs.mkdir(path.dirname(runtimeSkillPath), { recursive: true });
    await fs.mkdir(path.dirname(runtimeAliasSkillPath), { recursive: true });
    await fs.writeFile(path.join(sourceAgentDir, "AGENTS.md"), "# current agent docs\n", "utf8");
    await fs.writeFile(sourceSkillPath, "# current context scout skill\n", "utf8");
    await fs.writeFile(path.join(runtimeAgentDir, "AGENTS.md"), "# stale runtime docs\n", "utf8");
    await fs.writeFile(
      path.join(runtimeAliasAgentDir, "AGENTS.md"),
      "# stale alias docs\n",
      "utf8",
    );
    await fs.writeFile(runtimeSkillPath, "# stale runtime skill\n", "utf8");
    await fs.writeFile(runtimeAliasSkillPath, "# stale alias skill\n", "utf8");

    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot,
        runtimeHome,
        sourceRuntimeRecordPath: path.join(runtimeHome, "source-runtime", "records.json"),
      },
      runtimeAliases: [{ aliasPath: runtimeAliasHome, canonicalPath: runtimeHome }],
      executionAgentMaterializations: [
        {
          id: "execution-context-scout",
          kind: "agent",
          sourcePath: sourceAgentDir,
          runtimePath: runtimeAgentDir,
          runtimeAliasPath: runtimeAliasAgentDir,
          projectRoot,
        },
      ],
      executionSkillMaterializations: [
        {
          id: "execution-context-scout",
          kind: "skill",
          sourcePath: sourceSkillPath,
          runtimePath: runtimeSkillPath,
          runtimeAliasPath: runtimeAliasSkillPath,
          projectRoot,
        },
      ],
    };

    const result = await materializeSourceRuntimeFiles({
      manifest,
      sourceCommit: "test-commit",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.status).toBe("aligned");
    expect(result.validationIssues).toEqual([]);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["source_runtime_materialization_aligned"]),
    );
    expect(result.materializedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: path.join(sourceAgentDir, "AGENTS.md"),
          runtimePath: path.join(runtimeAgentDir, "AGENTS.md"),
          runtimeAliasPath: path.join(runtimeAliasAgentDir, "AGENTS.md"),
        }),
        expect.objectContaining({
          sourcePath: sourceSkillPath,
          runtimePath: runtimeSkillPath,
          runtimeAliasPath: runtimeAliasSkillPath,
        }),
      ]),
    );
    await expect(fs.readFile(path.join(runtimeAgentDir, "AGENTS.md"), "utf8")).resolves.toBe(
      "# current agent docs\n",
    );
    await expect(
      fs.lstat(path.join(runtimeAgentDir, "AGENTS.md")).then((stats) => stats.isSymbolicLink()),
    ).resolves.toBe(true);
    await expect(
      fs
        .readlink(path.join(runtimeAgentDir, "AGENTS.md"))
        .then((target) => path.resolve(runtimeAgentDir, target)),
    ).resolves.toBe(path.resolve(path.join(sourceAgentDir, "AGENTS.md")));
    await expect(fs.readFile(path.join(runtimeAliasAgentDir, "AGENTS.md"), "utf8")).resolves.toBe(
      "# current agent docs\n",
    );
    await expect(
      fs
        .lstat(path.join(runtimeAliasAgentDir, "AGENTS.md"))
        .then((stats) => stats.isSymbolicLink()),
    ).resolves.toBe(true);
    await expect(
      fs
        .readlink(path.join(runtimeAliasAgentDir, "AGENTS.md"))
        .then((target) => path.resolve(runtimeAliasAgentDir, target)),
    ).resolves.toBe(path.resolve(path.join(sourceAgentDir, "AGENTS.md")));
    await expect(fs.readFile(runtimeSkillPath, "utf8")).resolves.toBe(
      "# current context scout skill\n",
    );
    await expect(fs.lstat(runtimeSkillPath).then((stats) => stats.isSymbolicLink())).resolves.toBe(
      true,
    );
    await expect(
      fs
        .readlink(runtimeSkillPath)
        .then((target) => path.resolve(path.dirname(runtimeSkillPath), target)),
    ).resolves.toBe(path.resolve(sourceSkillPath));
    await expect(fs.readFile(runtimeAliasSkillPath, "utf8")).resolves.toBe(
      "# current context scout skill\n",
    );
    await expect(
      fs.lstat(runtimeAliasSkillPath).then((stats) => stats.isSymbolicLink()),
    ).resolves.toBe(true);
    await expect(
      fs
        .readlink(runtimeAliasSkillPath)
        .then((target) => path.resolve(path.dirname(runtimeAliasSkillPath), target)),
    ).resolves.toBe(path.resolve(sourceSkillPath));
    await expect(auditSourceRuntimeMaterializationDrift({ manifest })).resolves.toEqual([]);
    expect(result.recordPath).toBe(path.join(runtimeHome, "source-runtime", "records.json"));
    expect(result.recordFile.validationIssues).toEqual([]);
  });

  it("identifies source-materialized agent starts by configured runtime path or alias", () => {
    const manifest: SourceRuntimeUnificationManifest = {
      version: 1,
      status: "test",
      canonical: {
        projectRoot: "/repo",
        runtimeHome: "/runtime",
      },
      runtimeAliases: [{ aliasPath: "/alias", canonicalPath: "/runtime" }],
      executionAgentMaterializations: [
        {
          id: "execution-coding",
          kind: "agent",
          sourcePath: "/repo/docs/agents/execution-coding/runtime",
          runtimePath: "/runtime/agents/execution-coding/agent",
          runtimeAliasPath: "/alias/agents/execution-coding/agent",
          projectRoot: "/repo",
        },
      ],
      executionSkillMaterializations: [],
    };

    expect(
      isSourceRuntimeMaterializedAgentStart({
        manifest,
        agentId: "execution-coding",
        agentDir: "/runtime/agents/execution-coding/agent",
      }),
    ).toBe(true);
    expect(
      isSourceRuntimeMaterializedAgentStart({
        manifest,
        agentId: "execution-coding",
        agentDir: "/alias/agents/execution-coding/agent",
      }),
    ).toBe(true);
    expect(
      isSourceRuntimeMaterializedAgentStart({
        manifest,
        agentId: "execution-coding",
        agentDir: "/tmp/openclaw-agent",
      }),
    ).toBe(false);
    expect(
      isSourceRuntimeMaterializedAgentStart({
        manifest,
        agentId: "execution-context-scout",
        agentDir: "/runtime/agents/execution-coding/agent",
      }),
    ).toBe(false);
  });

  it("validates execution-agent config against canonical projectRoot semantics", async () => {
    const manifest = await loadSourceRuntimeUnificationManifest();
    const runtimeHome = manifest.canonical.runtimeHome;
    const config = {
      agents: {
        list: [
          {
            id: "execution-coding",
            workspace: `${runtimeHome}/workspace`,
            agentDir: `${runtimeHome}/agents/execution-coding/agent`,
            projectRoot: "/root/services/openclaw-roles/live",
          },
          {
            id: "execution-context-scout",
            workspace: `${runtimeHome}/workspace`,
            agentDir: `${runtimeHome}/agents/execution-context-scout/agent`,
            projectRoot: "/root/services/openclaw-roles/live",
          },
          {
            id: "execution-validation-scout",
            workspace: `${runtimeHome}/workspace`,
            agentDir: `${runtimeHome}/agents/execution-validation-scout/agent`,
            projectRoot: "/root/services/openclaw-roles/live",
          },
        ],
      },
    };

    expect(validateExecutionAgentSourceRuntimeConfig({ config, manifest })).toEqual([]);
  });

  it("rejects execution-agent config that falls back to runtime workspace as source root", async () => {
    const manifest = await loadSourceRuntimeUnificationManifest();
    const config = {
      agents: {
        list: [
          {
            id: "execution-coding",
            workspace: "/home/node/.openclaw/workspace",
          },
          {
            id: "execution-context-scout",
            workspace: "/home/node/.openclaw/workspace",
            agentDir: "/home/node/.openclaw/agents/execution-context-scout/agent",
            projectRoot: "/home/node/.openclaw/workspace",
          },
          {
            id: "execution-validation-scout",
            workspace: "/home/node/.openclaw/workspace",
            agentDir: "/tmp/execution-validation-scout",
            projectRoot: "/root/.openclaw/workspace",
          },
        ],
      },
    };

    expect(validateExecutionAgentSourceRuntimeConfig({ config, manifest })).toEqual([
      "execution_agent_project_root_missing:execution-coding",
      "execution_agent_project_root_mismatch:execution-context-scout",
      "execution_agent_project_root_points_at_runtime_home:execution-context-scout",
      "execution_agent_workspace_uses_runtime_alias:execution-context-scout",
      "execution_agent_agent_dir_mismatch:execution-context-scout",
      "execution_agent_agent_dir_uses_runtime_alias:execution-context-scout",
      "execution_agent_project_root_mismatch:execution-validation-scout",
      "execution_agent_project_root_points_at_runtime_home:execution-validation-scout",
      "execution_agent_workspace_uses_runtime_alias:execution-validation-scout",
      "execution_agent_agent_dir_mismatch:execution-validation-scout",
    ]);
  });
});
