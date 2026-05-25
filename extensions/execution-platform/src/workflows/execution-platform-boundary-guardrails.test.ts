import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyExecutionPlatformBoundaryPath,
  evaluateExecutionPlatformBoundaryGuardrails,
  executionPlatformModuleOwnershipMap,
  extractExecutionPlatformImportSpecifiers,
  resolveExecutionPlatformImportPath,
} from "./execution-platform-boundary-guardrails.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");

function source(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Execution Platform boundary guardrails", () => {
  it("classifies production, replay, proof, diagnostic, test, and legacy surfaces", () => {
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      ),
    ).toMatchObject({
      category: "production_runtime",
      liveCapable: true,
      mayBeImportedByProduction: true,
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
      ),
    ).toMatchObject({
      category: "production_runtime",
      reasonCodes: expect.arrayContaining(["classified_production_boundary_replay_service"]),
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
      ),
    ).toMatchObject({
      category: "production_runtime",
      reasonCodes: expect.arrayContaining(["classified_production_boundary_replay_service"]),
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
      ),
    ).toMatchObject({
      category: "replay_harness",
      diagnosticOnly: true,
      mayBeImportedByProduction: false,
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      ),
    ).toMatchObject({
      category: "replay_harness",
      diagnosticOnly: true,
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "scripts/execution-platform-run-node-resource-materialization-proof.mjs",
      ),
    ).toMatchObject({
      category: "proof_script",
      diagnosticOnly: true,
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "scripts/execution-platform-record-pre-proof-modularization-queue.mjs",
      ),
    ).toMatchObject({
      category: "diagnostic_script",
      diagnosticOnly: true,
    });
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
      ),
    ).toMatchObject({
      category: "deprecated_legacy",
      mayBeImportedByProduction: false,
    });
  });

  it("extracts and resolves relative imports without executing modules", () => {
    const imports = extractExecutionPlatformImportSpecifiers(`
      import { x } from "../codex-bridge/context-scout-boundary-replay.ts";
      import type { Y } from "./runtime-work-graph.ts";
      export { z } from "./workflow-definition.ts";
      const lazy = () => import("./scheduler-runtime-tools.ts");
    `);

    expect(imports).toEqual([
      "../codex-bridge/context-scout-boundary-replay.ts",
      "./runtime-work-graph.ts",
      "./scheduler-runtime-tools.ts",
      "./workflow-definition.ts",
    ]);
    expect(
      resolveExecutionPlatformImportPath(
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        "../codex-bridge/context-scout-boundary-replay.ts",
      ),
    ).toBe("extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts");
  });

  it("blocks production imports of replay, proof, diagnostic, test, and legacy surfaces", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        source: 'import { replay } from "../codex-bridge/context-scout-boundary-replay.ts";',
      },
      {
        path: "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
        source: "export const replay = true;",
      },
    ]);

    expect(result).toMatchObject({
      status: "blocked",
      hardBlockCount: 1,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    });
    expect(result.findings[0]).toMatchObject({
      severity: "hard_block",
      reasonCode: "production_imports_replay_harness",
    });
  });

  it("allows proof and replay surfaces to import production runtime services but keeps them diagnostic-only", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
        source:
          'import { buildBoundaryReplayCheckpoint } from "../extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts";',
      },
      {
        path: "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
        source: "export const runtime = true;",
      },
    ]);

    expect(result.status).toBe("passed");
    expect(result.allowedDiagnosticOnlyCount).toBe(1);
    expect(result.reasonCodes).toEqual(["execution_platform_boundary_guardrail_audit_passed"]);
  });

  it("flags replay harnesses that reintroduce default context_synthesis topology glue", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
        source: 'const node = { nodeKind: "context_synthesis" };',
      },
    ]);

    expect(result).toMatchObject({
      status: "blocked",
      hardBlockCount: 1,
    });
    expect(result.reasonCodes).toContain("replay_literal_context_synthesis_node_detected");
  });

  it("records a module ownership map for later extraction passes", () => {
    const map = executionPlatformModuleOwnershipMap();

    expect(map.map((entry) => entry.category)).toEqual(
      expect.arrayContaining([
        "production_runtime",
        "workflow_plugin",
        "coding_adapter",
        "replay_harness",
        "deprecated_legacy",
      ]),
    );
    expect(map.find((entry) => entry.category === "replay_harness")).toMatchObject({
      mayBeImportedByProduction: false,
      prohibitedResponsibilities: expect.arrayContaining(["production success path"]),
    });
  });

  it("characterizes current production modules without proof/replay script imports", () => {
    const files = [
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "extensions/execution-platform/src/workflows/generic-runtime-spine.ts",
      "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts",
      "extensions/execution-platform/src/workflows/generic-orchestration-runtime-execution.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
      "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ].map((filePath) => ({ path: filePath, source: source(filePath) }));

    const result = evaluateExecutionPlatformBoundaryGuardrails(files);

    expect(result.status).toBe("passed");
    expect(result.hardBlockCount).toBe(0);
    expect(result.classifiedCounts.production_runtime).toBeGreaterThanOrEqual(3);
    expect(result.classifiedCounts.work_queue_readback).toBe(1);
  });

  it("allows the guardrail definition module to name blocked proof surfaces without self-failing", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
        source: source(
          "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
        ),
      },
    ]);

    expect(result.status).toBe("passed");
    expect(result.hardBlockCount).toBe(0);
  });

  it("still blocks production runtime code that references the Product/Spec replay script", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        source: 'const unsafe = "scripts/execution-platform-run-product-spec-boundary-replay.mjs";',
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain("production_imports_product_spec_replay_script");
  });

  it("keeps hard blocks visible before allowed diagnostic findings in bounded audit output", () => {
    const diagnosticFiles = Array.from({ length: 130 }, (_, index) => ({
      path: `scripts/execution-platform-diagnostic-${index}.mjs`,
      source:
        'import { runtime } from "../extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts";',
    }));
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      ...diagnosticFiles,
      {
        path: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
        source: 'const unsafe = "scripts/execution-platform-run-product-spec-boundary-replay.mjs";',
      },
    ]);

    expect(result.status).toBe("blocked");
    expect(result.findings[0]).toMatchObject({
      severity: "hard_block",
      reasonCode: "production_imports_product_spec_replay_script",
    });
    expect(result.reasonCodes[0]).toBe("production_imports_product_spec_replay_script");
  });
});
