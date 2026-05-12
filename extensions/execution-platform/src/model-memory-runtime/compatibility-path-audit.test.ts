import { describe, expect, it } from "vitest";
import {
  buildModelMemoryCompatibilityPathAudit,
  enforceNoProductionModelMemoryBypass,
  type ModelMemoryCompatibilityPathFinding,
} from "./compatibility-path-audit.ts";

const safeFinding: ModelMemoryCompatibilityPathFinding = {
  pathRef: "repo://src/agents/model-memory/live-runtime/runtime-deps.ts",
  symbolRef: "createRuntimeMiddlewareBackedJsonExecutor",
  classification: "runtime_middleware_wrapped",
  requiredAction: "keep",
  boundedRationale: "Production executor is wrapped by runtime middleware evidence.",
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  workQueueLifecycleMutated: false,
};

describe("model memory compatibility path audit", () => {
  it("passes wrapped or documented compatibility paths", () => {
    const audit = buildModelMemoryCompatibilityPathAudit([
      safeFinding,
      {
        ...safeFinding,
        pathRef: "repo://scripts/proof-only.mjs",
        classification: "script_only_proof",
        requiredAction: "document",
      },
    ]);

    expect(audit.status).toBe("passed");
    expect(audit.deterministicJudgmentPerformed).toBe(false);
    expect(() => enforceNoProductionModelMemoryBypass(audit)).not.toThrow();
  });

  it("fails forbidden production bypasses", () => {
    const audit = buildModelMemoryCompatibilityPathAudit([
      safeFinding,
      {
        ...safeFinding,
        pathRef: "repo://src/production-bypass.ts",
        classification: "forbidden_bypass",
        requiredAction: "wrap",
      },
    ]);

    expect(audit.status).toBe("failed");
    expect(() => enforceNoProductionModelMemoryBypass(audit)).toThrow(
      "model_memory_forbidden_runtime_bypass_detected",
    );
  });
});
