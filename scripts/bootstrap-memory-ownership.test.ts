import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleBootstrapCompatibilityContent,
  type BootstrapCanonicalSources,
} from "../src/agents/bootstrap-canonicalization.ts";
import { overlayBootstrapFilesByName } from "../src/agents/bootstrap-files.ts";
import { normalizeBootstrapFileContentForInjection } from "../src/agents/pi-embedded-helpers/bootstrap.ts";

const canonicalSources: BootstrapCanonicalSources = {
  activeProjects: [
    {
      title: "Model Memory",
      workspacePath: "docs/projects/model-memory",
      startupPath: "docs/projects/model-memory/STARTUP.md",
      currentSlicePath: "docs/projects/model-memory/CURRENT_SLICE.md",
      statusPath: "docs/projects/model-memory/STATUS.md",
    },
  ],
  queuedProjects: [],
  agentRules: [],
  memoryRules: ["runtime-facing `MEMORY.md` remains a curated durable memory surface"],
  memoryLayers: [
    "durable human-owned memory-bearing sources",
    "DB-backed `model-memory` generative projection",
    "daily memory files as episodic and ingestion layer",
  ],
};

void test("MEMORY.md assembly strips generated runtime scaffolding and keeps curated memory", () => {
  const content = assembleBootstrapCompatibilityContent({
    fileName: "MEMORY.md",
    filePath: "MEMORY.md",
    existingContent: [
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
    projectionText: "# MEMORY.md\n\n## Standing Context\n- generated",
  });

  assert.equal(content, "# MEMORY.md\n\n## Long-Term Context\n- durable note\n");
  assert.equal(
    normalizeBootstrapFileContentForInjection({
      name: "MEMORY.md",
      content,
    }),
    "# MEMORY.md\n\n## Long-Term Context\n- durable note",
  );
});

void test("canonicalized bootstrap files override stale cached files by name while preserving order", () => {
  const merged = overlayBootstrapFilesByName(
    [
      {
        name: "AGENTS.md",
        path: "/tmp/AGENTS.md",
        content: "agents-old",
        missing: false,
      },
      {
        name: "MEMORY.md",
        path: "/tmp/MEMORY.md",
        content: "memory-old",
        missing: false,
      },
    ],
    [
      {
        name: "MEMORY.md",
        path: "/tmp/MEMORY.md",
        content: "memory-new",
        missing: false,
      },
      {
        name: "USER.md",
        path: "/tmp/USER.md",
        content: "user-new",
        missing: false,
      },
    ],
  );

  assert.deepEqual(
    merged.map((file) => [file.name, file.content]),
    [
      ["AGENTS.md", "agents-old"],
      ["MEMORY.md", "memory-new"],
      ["USER.md", "user-new"],
    ],
  );
});
