import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectionBootstrapContextFiles } from "../src/agents/model-memory.live-runtime.ts";

void test("projection bootstrap context injects current bootstrap artifacts by canonical artifact path", () => {
  const contextFiles = buildProjectionBootstrapContextFiles({
    projectionVersions: [
      {
        id: "projection-memory-old",
        targetId: "memory-md",
        contentHash: "hash-old",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash-old.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 10,
        builtAt: new Date(0),
      },
      {
        id: "projection-memory-new",
        targetId: "memory-md",
        contentHash: "hash-new",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash-new.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 12,
        builtAt: new Date(1_000),
      },
      {
        id: "projection-user",
        targetId: "user-md",
        contentHash: "hash-user",
        canonicalArtifactPath: ".openclaw/model-memory/projections/user-md-hash-user.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 8,
        builtAt: new Date(2_000),
      },
    ],
    projectionOutputs: {
      "memory-md": "# MEMORY.md\n\n## Standing Context\n- stable rule",
      "user-md": "# USER.md\n\n- preference",
    },
  });

  assert.deepEqual(contextFiles, [
    {
      path: ".openclaw/model-memory/projections/memory-md-hash-new.md",
      content: "# MEMORY.md\n\n## Standing Context\n- stable rule",
    },
    {
      path: ".openclaw/model-memory/projections/user-md-hash-user.md",
      content: "# USER.md\n\n- preference",
    },
  ]);
});

void test("projection bootstrap context skips empty outputs and non-bootstrap targets", () => {
  const contextFiles = buildProjectionBootstrapContextFiles({
    projectionVersions: [
      {
        id: "projection-memory",
        targetId: "memory-md",
        contentHash: "hash-memory",
        canonicalArtifactPath: ".openclaw/model-memory/projections/memory-md-hash-memory.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 0,
        builtAt: new Date(0),
      },
      {
        id: "projection-agents",
        targetId: "agents-md",
        contentHash: "hash-agents",
        canonicalArtifactPath: ".openclaw/model-memory/projections/agents-md-hash-agents.md",
        sourceObjectIds: [],
        sourceSlotKeys: [],
        sourceSetKeys: [],
        tokenEstimate: 6,
        builtAt: new Date(0),
      },
    ],
    projectionOutputs: {
      "memory-md": "   ",
      "agents-md": "# AGENTS.md\n\n- generated",
    },
  });

  assert.deepEqual(contextFiles, []);
});
