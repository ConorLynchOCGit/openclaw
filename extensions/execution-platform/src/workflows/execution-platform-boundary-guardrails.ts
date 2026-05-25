export const EXECUTION_PLATFORM_BOUNDARY_GUARDRAIL_VERSION =
  "execution-platform.boundary-guardrails.v1";

export type ExecutionPlatformBoundaryCategory =
  | "production_runtime"
  | "workflow_plugin"
  | "coding_adapter"
  | "worker_adapter"
  | "work_queue_readback"
  | "runtime_tool_kernel"
  | "model_task_contract"
  | "replay_harness"
  | "proof_script"
  | "diagnostic_script"
  | "test_fixture"
  | "deprecated_legacy";

export type ExecutionPlatformBoundaryClassification = {
  artifactKind: "execution_platform.boundary_classification";
  guardrailVersion: typeof EXECUTION_PLATFORM_BOUNDARY_GUARDRAIL_VERSION;
  path: string;
  category: ExecutionPlatformBoundaryCategory;
  liveCapable: boolean;
  mayImportProduction: boolean;
  mayBeImportedByProduction: boolean;
  diagnosticOnly: boolean;
  testOnly: boolean;
  reasonCodes: string[];
};

export type ExecutionPlatformBoundaryFile = {
  path: string;
  source?: string;
};

export type ExecutionPlatformBoundaryFindingSeverity =
  | "hard_block"
  | "warning"
  | "allowed_diagnostic_only"
  | "allowed_test_only"
  | "allowed_production_runtime";

export type ExecutionPlatformBoundaryFinding = {
  severity: ExecutionPlatformBoundaryFindingSeverity;
  path: string;
  importedPath?: string;
  pattern?: string;
  reasonCode: string;
  summary: string;
};

export type ExecutionPlatformBoundaryAuditResult = {
  artifactKind: "execution_platform.boundary_guardrail_audit";
  guardrailVersion: typeof EXECUTION_PLATFORM_BOUNDARY_GUARDRAIL_VERSION;
  status: "passed" | "needs_review" | "blocked";
  fileCount: number;
  classifiedCounts: Record<ExecutionPlatformBoundaryCategory, number>;
  hardBlockCount: number;
  warningCount: number;
  allowedDiagnosticOnlyCount: number;
  allowedTestOnlyCount: number;
  findings: ExecutionPlatformBoundaryFinding[];
  ownershipMap: ExecutionPlatformModuleOwnershipEntry[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

const FINDING_SEVERITY_ORDER: Record<ExecutionPlatformBoundaryFindingSeverity, number> = {
  hard_block: 0,
  warning: 1,
  allowed_production_runtime: 2,
  allowed_diagnostic_only: 3,
  allowed_test_only: 4,
};

export type ExecutionPlatformModuleOwnershipEntry = {
  category: ExecutionPlatformBoundaryCategory;
  owner: string;
  mayBeImportedByProduction: boolean;
  mayImportProduction: boolean;
  liveCapable: boolean;
  allowedResponsibilities: string[];
  prohibitedResponsibilities: string[];
};

const CATEGORY_DEFAULTS: Record<
  ExecutionPlatformBoundaryCategory,
  Omit<
    ExecutionPlatformBoundaryClassification,
    "artifactKind" | "guardrailVersion" | "path" | "category" | "reasonCodes"
  >
> = {
  production_runtime: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  workflow_plugin: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  coding_adapter: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  worker_adapter: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  work_queue_readback: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  runtime_tool_kernel: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  model_task_contract: {
    liveCapable: true,
    mayImportProduction: true,
    mayBeImportedByProduction: true,
    diagnosticOnly: false,
    testOnly: false,
  },
  replay_harness: {
    liveCapable: false,
    mayImportProduction: true,
    mayBeImportedByProduction: false,
    diagnosticOnly: true,
    testOnly: false,
  },
  proof_script: {
    liveCapable: false,
    mayImportProduction: true,
    mayBeImportedByProduction: false,
    diagnosticOnly: true,
    testOnly: false,
  },
  diagnostic_script: {
    liveCapable: false,
    mayImportProduction: true,
    mayBeImportedByProduction: false,
    diagnosticOnly: true,
    testOnly: false,
  },
  test_fixture: {
    liveCapable: false,
    mayImportProduction: true,
    mayBeImportedByProduction: false,
    diagnosticOnly: false,
    testOnly: true,
  },
  deprecated_legacy: {
    liveCapable: false,
    mayImportProduction: true,
    mayBeImportedByProduction: false,
    diagnosticOnly: true,
    testOnly: false,
  },
};

const OWNERSHIP_MAP: ExecutionPlatformModuleOwnershipEntry[] = [
  {
    category: "production_runtime",
    owner: "generic_runtime_spine",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: [
      "runtime job lifecycle integration",
      "workflow graph lifecycle",
      "readiness transitions",
      "runtime-owned refs, storage, authority, and bounds",
    ],
    prohibitedResponsibilities: [
      "proof topology construction",
      "diagnostic-only Mission Ledger paths",
      "Product/Spec-specific semantic routing",
    ],
  },
  {
    category: "workflow_plugin",
    owner: "workflow_definition_registry",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: [
      "workflow definitions",
      "capability subsets",
      "evidence profiles",
      "domain resource compiler registration",
    ],
    prohibitedResponsibilities: ["generic graph lifecycle", "proof harness execution"],
  },
  {
    category: "coding_adapter",
    owner: "agent_team_coding_plugin",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: [
      "coding executor registration",
      "code intelligence use",
      "file-edit worker integration",
      "coding evidence mapping",
    ],
    prohibitedResponsibilities: ["generic workflow success", "proof topology construction"],
  },
  {
    category: "worker_adapter",
    owner: "runtime_worker_adapter_layer",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: ["tool/worker invocation", "bounded adapter results"],
    prohibitedResponsibilities: ["workflow brain", "Mission Ledger success synthesis"],
  },
  {
    category: "work_queue_readback",
    owner: "work_queue_projection",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: ["projection", "readback", "control state display"],
    prohibitedResponsibilities: ["execution lifecycle truth", "raw payload storage"],
  },
  {
    category: "runtime_tool_kernel",
    owner: "runtime_tool_kernel",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: ["typed tool invocation", "trace capture", "timeout/cancel"],
    prohibitedResponsibilities: ["semantic sufficiency judgment"],
  },
  {
    category: "model_task_contract",
    owner: "model_task_runtime",
    mayBeImportedByProduction: true,
    mayImportProduction: true,
    liveCapable: true,
    allowedResponsibilities: ["model call contracts", "provider diagnostics", "schema repair"],
    prohibitedResponsibilities: ["runtime-owned id invention by model"],
  },
  {
    category: "replay_harness",
    owner: "diagnostic_replay",
    mayBeImportedByProduction: false,
    mayImportProduction: true,
    liveCapable: false,
    allowedResponsibilities: ["checkpoint replay", "diagnostic evidence"],
    prohibitedResponsibilities: ["production import target", "production success path"],
  },
  {
    category: "proof_script",
    owner: "proof_harness",
    mayBeImportedByProduction: false,
    mayImportProduction: true,
    liveCapable: false,
    allowedResponsibilities: ["black-box proof observation", "bounded proof artifacts"],
    prohibitedResponsibilities: ["private runner execution path", "production lifecycle mutation"],
  },
  {
    category: "diagnostic_script",
    owner: "diagnostics",
    mayBeImportedByProduction: false,
    mayImportProduction: true,
    liveCapable: false,
    allowedResponsibilities: ["diagnostic queue evidence", "bounded audit artifacts"],
    prohibitedResponsibilities: ["production runtime topology"],
  },
  {
    category: "test_fixture",
    owner: "test_suite",
    mayBeImportedByProduction: false,
    mayImportProduction: true,
    liveCapable: false,
    allowedResponsibilities: ["unit/integration fixtures", "source guards"],
    prohibitedResponsibilities: ["production imports"],
  },
  {
    category: "deprecated_legacy",
    owner: "retirement_queue",
    mayBeImportedByProduction: false,
    mayImportProduction: true,
    liveCapable: false,
    allowedResponsibilities: ["diagnostic-only migration compatibility"],
    prohibitedResponsibilities: ["production success", "public runtime export"],
  },
];

const PRODUCTION_CATEGORIES = new Set<ExecutionPlatformBoundaryCategory>([
  "production_runtime",
  "workflow_plugin",
  "coding_adapter",
  "worker_adapter",
  "work_queue_readback",
  "runtime_tool_kernel",
  "model_task_contract",
]);

const PROHIBITED_PRODUCTION_IMPORT_CATEGORIES = new Set<ExecutionPlatformBoundaryCategory>([
  "replay_harness",
  "proof_script",
  "diagnostic_script",
  "test_fixture",
  "deprecated_legacy",
]);

const PROOF_TOPOLOGY_PATTERNS = [
  {
    pattern: "runtimeOwnedReplaySynthesisBarrier",
    reasonCode: "replay_default_context_synthesis_barrier_detected",
  },
  {
    pattern: 'nodeKind: "context_synthesis"',
    reasonCode: "replay_literal_context_synthesis_node_detected",
  },
  {
    pattern: "proof_harness_production_success",
    reasonCode: "proof_harness_success_path_detected",
  },
];

const BOUNDARY_GUARDRAIL_DEFINITION_PATHS = new Set([
  "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
]);

export function normalizeExecutionPlatformPath(inputPath: string): string {
  return inputPath.replaceAll("\\", "/").replace(/^\.?\//, "");
}

export function classifyExecutionPlatformBoundaryPath(
  inputPath: string,
): ExecutionPlatformBoundaryClassification {
  const path = normalizeExecutionPlatformPath(inputPath);
  const reasonCodes: string[] = [];
  const category = classifyCategory(path, reasonCodes);
  return {
    artifactKind: "execution_platform.boundary_classification",
    guardrailVersion: EXECUTION_PLATFORM_BOUNDARY_GUARDRAIL_VERSION,
    path,
    category,
    ...CATEGORY_DEFAULTS[category],
    reasonCodes,
  };
}

export function executionPlatformModuleOwnershipMap(): ExecutionPlatformModuleOwnershipEntry[] {
  return OWNERSHIP_MAP.map((entry) => ({
    ...entry,
    allowedResponsibilities: [...entry.allowedResponsibilities],
    prohibitedResponsibilities: [...entry.prohibitedResponsibilities],
  }));
}

export function extractExecutionPlatformImportSpecifiers(source: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        imports.add(match[1]);
      }
    }
  }
  return [...imports].toSorted();
}

export function resolveExecutionPlatformImportPath(
  fromPath: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const fromParts = normalizeExecutionPlatformPath(fromPath).split("/");
  fromParts.pop();
  const parts = [...fromParts, ...specifier.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  const joined = resolved.join("/");
  return /\.[cm]?[jt]sx?$/.test(joined) ? joined : `${joined}.ts`;
}

export function evaluateExecutionPlatformBoundaryGuardrails(
  files: ExecutionPlatformBoundaryFile[],
): ExecutionPlatformBoundaryAuditResult {
  const classifications = new Map(
    files.map((file) => [
      normalizeExecutionPlatformPath(file.path),
      classifyExecutionPlatformBoundaryPath(file.path),
    ]),
  );
  const findings: ExecutionPlatformBoundaryFinding[] = [];

  for (const file of files) {
    const path = normalizeExecutionPlatformPath(file.path);
    const classification = classifications.get(path) ?? classifyExecutionPlatformBoundaryPath(path);
    const source = file.source ?? "";

    if (source) {
      for (const specifier of extractExecutionPlatformImportSpecifiers(source)) {
        const importedPath = resolveExecutionPlatformImportPath(path, specifier);
        if (!importedPath) {
          continue;
        }
        const importedClassification =
          classifications.get(importedPath) ?? classifyExecutionPlatformBoundaryPath(importedPath);
        if (
          PRODUCTION_CATEGORIES.has(classification.category) &&
          PROHIBITED_PRODUCTION_IMPORT_CATEGORIES.has(importedClassification.category)
        ) {
          findings.push({
            severity: "hard_block",
            path,
            importedPath,
            reasonCode: `production_imports_${importedClassification.category}`,
            summary:
              "Production-capable runtime code imports a proof, replay, diagnostic, test, or legacy module.",
          });
        } else if (classification.category === "test_fixture") {
          findings.push({
            severity: "allowed_test_only",
            path,
            importedPath,
            reasonCode: "test_fixture_import_allowed",
            summary: "Test fixture import is outside production reachability.",
          });
        } else if (
          ["replay_harness", "proof_script", "diagnostic_script"].includes(classification.category)
        ) {
          findings.push({
            severity: "allowed_diagnostic_only",
            path,
            importedPath,
            reasonCode: `${classification.category}_may_import_runtime`,
            summary:
              "Diagnostic/proof surface may import production runtime services but cannot be imported by production.",
          });
        }
      }
    }

    if (classification.category === "replay_harness") {
      for (const pattern of PROOF_TOPOLOGY_PATTERNS) {
        if (source.includes(pattern.pattern)) {
          findings.push({
            severity: "hard_block",
            path,
            pattern: pattern.pattern,
            reasonCode: pattern.reasonCode,
            summary:
              "Replay harness contains default production topology glue instead of consuming runtime topology.",
          });
        }
      }
    }

    if (
      classification.category === "production_runtime" &&
      !BOUNDARY_GUARDRAIL_DEFINITION_PATHS.has(path) &&
      source.includes("execution-platform-run-product-spec-boundary-replay")
    ) {
      findings.push({
        severity: "hard_block",
        path,
        pattern: "execution-platform-run-product-spec-boundary-replay",
        reasonCode: "production_imports_product_spec_replay_script",
        summary: "Production runtime references Product/Spec proof replay script.",
      });
    }
  }

  const classifiedCounts = emptyClassifiedCounts();
  for (const classification of classifications.values()) {
    classifiedCounts[classification.category] += 1;
  }
  const hardBlockCount = findings.filter((finding) => finding.severity === "hard_block").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const allowedDiagnosticOnlyCount = findings.filter(
    (finding) => finding.severity === "allowed_diagnostic_only",
  ).length;
  const allowedTestOnlyCount = findings.filter(
    (finding) => finding.severity === "allowed_test_only",
  ).length;
  const status = hardBlockCount > 0 ? "blocked" : warningCount > 0 ? "needs_review" : "passed";
  const orderedFindings = [...findings].toSorted((left, right) => {
    const severityDelta =
      FINDING_SEVERITY_ORDER[left.severity] - FINDING_SEVERITY_ORDER[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return `${left.path}:${left.reasonCode}:${left.importedPath ?? left.pattern ?? ""}`.localeCompare(
      `${right.path}:${right.reasonCode}:${right.importedPath ?? right.pattern ?? ""}`,
    );
  });

  return {
    artifactKind: "execution_platform.boundary_guardrail_audit",
    guardrailVersion: EXECUTION_PLATFORM_BOUNDARY_GUARDRAIL_VERSION,
    status,
    fileCount: files.length,
    classifiedCounts,
    hardBlockCount,
    warningCount,
    allowedDiagnosticOnlyCount,
    allowedTestOnlyCount,
    findings: orderedFindings.slice(0, 120),
    ownershipMap: executionPlatformModuleOwnershipMap(),
    reasonCodes:
      status === "passed"
        ? ["execution_platform_boundary_guardrail_audit_passed"]
        : orderedFindings.map((finding) => finding.reasonCode).slice(0, 120),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function classifyCategory(path: string, reasonCodes: string[]): ExecutionPlatformBoundaryCategory {
  if (path.endsWith(".test.ts") || path.includes("/__fixtures__/") || path.includes("/fixtures/")) {
    reasonCodes.push("classified_test_fixture");
    return "test_fixture";
  }
  if (path.startsWith("scripts/")) {
    if (path.includes("record-")) {
      reasonCodes.push("classified_diagnostic_script");
      return "diagnostic_script";
    }
    if (path.includes("boundary-replay")) {
      reasonCodes.push("classified_replay_script");
      return "replay_harness";
    }
    if (path.includes("-proof") || path.includes("run-product-spec-checkpointed-test")) {
      reasonCodes.push("classified_proof_script");
      return "proof_script";
    }
    reasonCodes.push("classified_diagnostic_script");
    return "diagnostic_script";
  }
  if (
    path.includes("/workflows/boundary-replay-checkpoints") ||
    path.includes("/workflows/boundary-replay-registry")
  ) {
    reasonCodes.push("classified_production_boundary_replay_service");
    return "production_runtime";
  }
  if (path.includes("/work-queue/")) {
    reasonCodes.push("classified_work_queue_readback");
    return "work_queue_readback";
  }
  if (path.includes("/boundary-replay") || path.includes("boundary-replay.")) {
    reasonCodes.push("classified_replay_harness_module");
    return "replay_harness";
  }
  if (
    path.includes("/workflow-queued-runner") ||
    path.includes("/agent-team-queued-runner") ||
    path.includes("/coding-team-live-pilot") ||
    path.includes("/context-scout-pilot")
  ) {
    reasonCodes.push("classified_deprecated_legacy_runtime_surface");
    return "deprecated_legacy";
  }
  if (path.includes("/runtime-tool-call/")) {
    reasonCodes.push("classified_runtime_tool_kernel");
    return "runtime_tool_kernel";
  }
  if (path.includes("/model-tasks/") || path.includes("/model-decision-contracts/")) {
    reasonCodes.push("classified_model_task_contract");
    return "model_task_contract";
  }
  if (path.includes("/workers/")) {
    reasonCodes.push("classified_worker_adapter");
    return "worker_adapter";
  }
  if (
    path.includes("/codex-bridge/non-codex") ||
    path.includes("/codex-bridge/kimi") ||
    path.includes("/codex-bridge/file-edit") ||
    path.includes("/codex-bridge/model-agnostic") ||
    path.includes("/codex-bridge/context-scout-node-executor")
  ) {
    reasonCodes.push("classified_coding_adapter");
    return "coding_adapter";
  }
  if (path.includes("/workflows/") && (path.includes("plugin") || path.includes("definition"))) {
    reasonCodes.push("classified_workflow_plugin");
    return "workflow_plugin";
  }
  reasonCodes.push("classified_production_runtime_default");
  return "production_runtime";
}

function emptyClassifiedCounts(): Record<ExecutionPlatformBoundaryCategory, number> {
  return {
    production_runtime: 0,
    workflow_plugin: 0,
    coding_adapter: 0,
    worker_adapter: 0,
    work_queue_readback: 0,
    runtime_tool_kernel: 0,
    model_task_contract: 0,
    replay_harness: 0,
    proof_script: 0,
    diagnostic_script: 0,
    test_fixture: 0,
    deprecated_legacy: 0,
  };
}
