import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCompatibilityRetirementAudit } from "./compatibility-retirement-audit.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("compatibility retirement audit", () => {
  it("blocks retired proof, fallback, and low-level worker surfaces from public runtime barrels", () => {
    const result = evaluateCompatibilityRetirementAudit([
      {
        path: "extensions/execution-platform/src/codex-bridge/index.ts",
        source: `
          export * from "./context-scout-boundary-replay.ts";
          export { KimiFileImplementationAdapter } from "./kimi-file-implementation-adapter.ts";
        `,
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "diagnostic_boundary_replay_public_api_public_runtime_export_blocked",
        "low_level_patch_json_worker_adapter_public_runtime_export_blocked",
      ]),
    );
  });

  it("blocks all imports of deleted compatibility surfaces", () => {
    const result = evaluateCompatibilityRetirementAudit([
      {
        path: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        source: 'import { WorkflowQueuedRunner } from "../codex-bridge/workflow-queued-runner.ts";',
      },
      {
        path: "scripts/execution-platform-run-generic-workflow-runner-retirement-proof.mjs",
        source:
          'import { WorkflowQueuedRunner } from "../extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts";',
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain(
      "generic_workflow_queued_runner_production_import_blocked",
    );
    expect(result.reasonCodes).toContain(
      "generic_workflow_queued_runner_diagnostic_import_blocked",
    );
  });

  it("requires legacy semantic intent fallback to stay test-gated and disabled by default", () => {
    const result = evaluateCompatibilityRetirementAudit([
      {
        path: "extensions/execution-platform/src/intent-routing/model-assisted-intent-router.ts",
        source:
          "export const enabled = process.env.OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK === '1';",
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain("legacy_semantic_fallback_not_test_only");
  });

  it("requires runtime-tool compatibility maps to be registry-derived", () => {
    const result = evaluateCompatibilityRetirementAudit([
      {
        path: "extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.ts",
        source: "export const RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP = [];",
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain("runtime_tool_adoption_compat_map_not_registry_derived");
  });

  it("passes the current selected production retirement inventory", () => {
    const files = [
      "extensions/execution-platform/src/codex-bridge/index.ts",
      "extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts",
      "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
      "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
      "extensions/execution-platform/src/model-tasks/fallback.ts",
      "extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.ts",
      "extensions/execution-platform/src/workers/worker-closeout-capsule.ts",
    ].map((filePath) => ({ path: filePath, source: source(filePath) }));

    const result = evaluateCompatibilityRetirementAudit(files);

    expect(result.status).toBe("passed");
    expect(result.hardBlockCount).toBe(0);
    expect(result.rawPromptStored).toBe(false);
    expect(result.rawResponseStored).toBe(false);
    expect(result.rawProviderLogStored).toBe(false);
    expect(result.rawDbRowsStored).toBe(false);
  });
});
