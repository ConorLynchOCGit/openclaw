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
  it("classifies production, proof, diagnostic, test, and legacy surfaces", () => {
    expect(
      classifyExecutionPlatformBoundaryPath(
        "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
      ),
    ).toMatchObject({
      category: "production_runtime",
      liveCapable: true,
      mayBeImportedByProduction: true,
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
      import type { Y } from "./runtime-work-graph.ts";
      export { z } from "./workflow-definition.ts";
      const lazy = () => import("./scheduler-runtime-tools.ts");
    `);

    expect(imports).toEqual([
      "./runtime-work-graph.ts",
      "./scheduler-runtime-tools.ts",
      "./workflow-definition.ts",
    ]);
    expect(
      resolveExecutionPlatformImportPath(
        "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
        "./workflow-definition.ts",
      ),
    ).toBe("extensions/execution-platform/src/workflows/workflow-definition.ts");
  });

  it("blocks production imports of proof, diagnostic, test, and legacy surfaces", () => {
    const result = evaluateExecutionPlatformBoundaryGuardrails([
      {
        path: "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
        source: 'import { queued } from "../codex-bridge/agent-team-queued-runner.ts";',
      },
      {
        path: "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
        source: "export const queued = true;",
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
      reasonCode: "production_imports_deprecated_legacy",
    });
  });

  it("records a module ownership map for later extraction passes", () => {
    const map = executionPlatformModuleOwnershipMap();

    expect(map.map((entry) => entry.category)).toEqual(
      expect.arrayContaining([
        "production_runtime",
        "workflow_plugin",
        "coding_adapter",
        "deprecated_legacy",
      ]),
    );
    expect(map.find((entry) => entry.category === "deprecated_legacy")).toMatchObject({
      mayBeImportedByProduction: false,
      prohibitedResponsibilities: expect.arrayContaining(["production success"]),
    });
  });

  it("characterizes current production modules without proof or legacy imports", () => {
    const files = [
      "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
      "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
      "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ].map((filePath) => ({ path: filePath, source: source(filePath) }));

    const result = evaluateExecutionPlatformBoundaryGuardrails(files);

    expect(result.status).toBe("passed");
    expect(result.hardBlockCount).toBe(0);
    expect(result.classifiedCounts.production_runtime).toBeGreaterThanOrEqual(1);
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
});
