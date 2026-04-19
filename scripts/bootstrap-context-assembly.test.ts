import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResolvedBootstrapContextFiles,
  type WorkspaceBootstrapFile,
} from "../src/agents/bootstrap-files.ts";

void test("buildResolvedBootstrapContextFiles keeps curated workspace files first and appends model-memory projection artifacts", () => {
  const bootstrapFiles: WorkspaceBootstrapFile[] = [
    {
      name: "AGENTS.md",
      path: "/tmp/workspace/AGENTS.md",
      content: "# AGENTS.md\n\n- repo rules\n",
      exists: true,
      source: "workspace",
    },
    {
      name: "MEMORY.md",
      path: "/tmp/workspace/MEMORY.md",
      content: "# MEMORY.md\n\n## Long-Term Context\n- curated durable memory\n",
      exists: true,
      source: "workspace",
    },
  ];

  const contextFiles = buildResolvedBootstrapContextFiles({
    bootstrapFiles,
    modelMemoryOverlay: {
      contextFiles: [
        {
          path: ".openclaw/model-memory/projections/memory-md-hash-restored.md",
          content: "# MEMORY.md\n\n## Standing Context\n- restored bootstrap semantics",
        },
      ],
    },
  });

  assert.deepEqual(
    contextFiles.map((file) => file.path),
    [
      "/tmp/workspace/AGENTS.md",
      "/tmp/workspace/MEMORY.md",
      ".openclaw/model-memory/projections/memory-md-hash-restored.md",
    ],
  );
  assert.match(contextFiles[1]?.content ?? "", /## Long-Term Context/u);
  assert.doesNotMatch(contextFiles[1]?.content ?? "", /## Standing Context/u);
  assert.equal(
    contextFiles[2]?.content,
    "# MEMORY.md\n\n## Standing Context\n- restored bootstrap semantics",
  );
});
