import { describe, expect, it } from "vitest";
import {
  assembleBootstrapCompatibilityContent,
  type BootstrapCanonicalSources,
} from "./bootstrap-canonicalization.js";

const canonicalSources: BootstrapCanonicalSources = {
  activeProjects: [
    {
      title: "Workspace Topology",
      workspacePath: "docs/projects/workspace-topology",
      startupPath: "docs/projects/workspace-topology/STARTUP.md",
      currentSlicePath: "docs/projects/workspace-topology/CURRENT_SLICE.md",
      statusPath: "docs/projects/workspace-topology/STATUS.md",
    },
    {
      title: "Model Memory",
      workspacePath: "docs/projects/model-memory",
      startupPath: "docs/projects/model-memory/STARTUP.md",
      currentSlicePath: "docs/projects/model-memory/CURRENT_SLICE.md",
      statusPath: "docs/projects/model-memory/STATUS.md",
    },
    {
      title: "Deployment Topology",
      workspacePath: "docs/projects/deployment-topology",
      startupPath: "docs/projects/deployment-topology/STARTUP.md",
      currentSlicePath: "docs/projects/deployment-topology/CURRENT_SLICE.md",
      statusPath: "docs/projects/deployment-topology/STATUS.md",
    },
  ],
  queuedProjects: [
    {
      title: "Agent Foundation",
      workspacePath: "docs/projects/agent-foundation",
      startupPath: "docs/projects/agent-foundation/STARTUP.md",
      currentSlicePath: "docs/projects/agent-foundation/CURRENT_SLICE.md",
      statusPath: "docs/projects/agent-foundation/STATUS.md",
    },
  ],
  agentRules: [
    "AGENTS.md must remain a runtime-facing operational document rather than a shallow pointer page",
    "durable sources and runtime compatibility files must be mapped explicitly",
  ],
  memoryRules: [
    "runtime-facing `MEMORY.md` remains a memory artifact, not a pointer file",
    "DB-backed `model-memory` projections remain part of the architecture",
  ],
  memoryLayers: [
    "durable human-owned memory-bearing sources",
    "DB-backed `model-memory` generative projection",
    "daily memory files as episodic and ingestion layer",
  ],
};

describe("assembleBootstrapCompatibilityContent", () => {
  it("preserves rich AGENTS sections while adding the canonical durable block", () => {
    const content = assembleBootstrapCompatibilityContent({
      fileName: "AGENTS.md",
      filePath: "AGENTS.md",
      existingContent: [
        "# AGENTS.md",
        "",
        "## Session Startup",
        "- read startup context",
        "",
        "## Red Lines",
        "- do not exfiltrate data",
      ].join("\n"),
      registryEntry: {
        id: "agents_md",
        runtimePath: "AGENTS.md",
        structuralMode: "rich_operational_document",
        currentOwnership: "runtime_primary_transitional",
        targetOwnership: "canonical_derived_compatibility_artifact",
        projectionMode: "assembled_document_with_stable_sections",
        seedMode: "bootstrap_materialized",
        seedTiming: "startup",
        canonicalSourceClass: ["docs_system", "docs_agents", "docs_projects"],
      },
      canonicalSources,
    });

    expect(content).toContain("## Session Startup");
    expect(content).toContain("## Red Lines");
    expect(content).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
    expect(content).toContain("Active durable project workspace: Workspace Topology");
    expect(content).toContain("current slice docs/projects/workspace-topology/CURRENT_SLICE.md");
  });

  it("keeps MEMORY.md human-owned by stripping generated overlays and recall scaffolding", () => {
    const content = assembleBootstrapCompatibilityContent({
      fileName: "MEMORY.md",
      filePath: "MEMORY.md",
      existingContent: [
        "<!-- BEGIN GENERATED: model-memory -->",
        "# MEMORY.md",
        "",
        "## Standing Context",
        "- deployment region: region-001",
        "<!-- END GENERATED: model-memory -->",
        "",
        "<!-- BEGIN GENERATED: openclaw-canonical -->",
        "## Workspace Recall Index",
        "- Read first: docs/system/roadmap.md",
        "<!-- END GENERATED: openclaw-canonical -->",
        "",
        "# MEMORY.md",
        "",
        "## Human Notes",
        "- keep this around",
      ].join("\n"),
      registryEntry: {
        id: "memory_md",
        runtimePath: "MEMORY.md",
        structuralMode: "runtime_memory_artifact",
        currentOwnership: "human_curated_durable_memory",
        targetOwnership: "human_curated_runtime_source",
        projectionMode: "direct_curated_runtime_input",
        seedMode: "eager_seed_without_generated_overlay",
        seedTiming: "workspace_sync_and_pre_bootstrap_cleanup",
        canonicalSourceClass: ["docs_projects", "docs_agents"],
      },
      canonicalSources,
      projectionText: [
        "# MEMORY.md",
        "",
        "## Standing Context",
        "- deployment region: region-001",
      ].join("\n"),
      projectionVersion: {
        id: "projection-memory-v1",
        targetId: "memory-md",
        contentHash: "hash-001",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash-001.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 12,
        builtAt: new Date(0),
      },
    });

    expect(content).toBe(
      ["# MEMORY.md", "", "## Human Notes", "- keep this around", ""].join("\n"),
    );
  });

  it("keeps USER.md human-owned while pointing to the user projection artifact", () => {
    const content = assembleBootstrapCompatibilityContent({
      fileName: "USER.md",
      filePath: "USER.md",
      existingContent: [
        "# USER.md",
        "",
        "## Human Profile",
        "- keep this around",
        "",
        "<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:user-profile -->",
        "- old generated user preference",
        "<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:user-profile -->",
        "",
        "<!-- BEGIN GENERATED: model-memory -->",
        "- generated user preference",
        "<!-- END GENERATED: model-memory -->",
      ].join("\n"),
      registryEntry: {
        id: "user_md",
        runtimePath: "USER.md",
        structuralMode: "human_profile",
        currentOwnership: "human_curated_user_profile",
        targetOwnership: "human_curated_runtime_source",
        projectionMode: "artifact_only",
        seedMode: "bootstrap_materialized",
        seedTiming: "startup",
        canonicalSourceClass: ["docs_projects"],
      },
      canonicalSources,
      projectionText: "# USER.md\n\n## Preferences\n- generated user preference",
      projectionVersion: {
        id: "projection-user-v1",
        targetId: "user-md",
        contentHash: "hash-002",
        canonicalArtifactPath: ".openclaw/model-memory/projections/user-md-hash-002.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 12,
        builtAt: new Date(0),
      },
    });

    expect(content).toContain("## Human Profile");
    expect(content).toContain("- keep this around");
    expect(content).not.toContain("<!-- BEGIN GENERATED: model-memory -->");
    expect(content).not.toContain("OPENCLAW:MEMORY-PROJECTION");
    expect(content).not.toContain("- generated user preference");
    expect(content).toContain("<!-- BEGIN GENERATED: openclaw-canonical -->");
    expect(content).toContain(
      "Current generated user projection artifact: .openclaw/model-memory/projections/user-md-hash-002.md",
    );
  });
});
