import { MODEL_MEMORY_RUNTIME_WIRING_VERSION } from "./types.ts";

export type ModelMemoryCompatibilityPathClassification =
  | "production_primary"
  | "runtime_middleware_wrapped"
  | "test_only"
  | "script_only_proof"
  | "compatibility_only"
  | "forbidden_bypass";

export type ModelMemoryCompatibilityPathFinding = {
  pathRef: string;
  symbolRef: string;
  classification: ModelMemoryCompatibilityPathClassification;
  requiredAction: "keep" | "wrap" | "disable" | "remove" | "document";
  boundedRationale: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type ModelMemoryCompatibilityPathAudit = {
  artifactKind: "model_memory_compatibility_path_audit";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  status: "passed" | "failed";
  findings: ModelMemoryCompatibilityPathFinding[];
  forbiddenBypassCount: number;
  compatibilityOnlyCount: number;
  reasonCodes: string[];
  deterministicJudgmentPerformed: false;
  deterministicRole: "callsite_classification_and_safety_enforcement_only";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export function buildModelMemoryCompatibilityPathAudit(
  findings: ModelMemoryCompatibilityPathFinding[],
): ModelMemoryCompatibilityPathAudit {
  const forbiddenBypassCount = findings.filter(
    (finding) => finding.classification === "forbidden_bypass",
  ).length;
  const compatibilityOnlyCount = findings.filter(
    (finding) => finding.classification === "compatibility_only",
  ).length;
  return {
    artifactKind: "model_memory_compatibility_path_audit",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    status: forbiddenBypassCount === 0 ? "passed" : "failed",
    findings,
    forbiddenBypassCount,
    compatibilityOnlyCount,
    reasonCodes:
      forbiddenBypassCount === 0
        ? ["no_forbidden_model_memory_runtime_bypasses_detected"]
        : ["forbidden_model_memory_runtime_bypass_detected"],
    deterministicJudgmentPerformed: false,
    deterministicRole: "callsite_classification_and_safety_enforcement_only",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function enforceNoProductionModelMemoryBypass(
  audit: ModelMemoryCompatibilityPathAudit,
): void {
  if (audit.forbiddenBypassCount > 0) {
    throw new Error("model_memory_forbidden_runtime_bypass_detected");
  }
}
