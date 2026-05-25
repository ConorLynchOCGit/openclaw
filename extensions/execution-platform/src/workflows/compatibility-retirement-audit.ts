import {
  classifyExecutionPlatformBoundaryPath,
  evaluateExecutionPlatformBoundaryGuardrails,
  extractExecutionPlatformImportSpecifiers,
  normalizeExecutionPlatformPath,
  resolveExecutionPlatformImportPath,
  type ExecutionPlatformBoundaryCategory,
  type ExecutionPlatformBoundaryFile,
} from "./execution-platform-boundary-guardrails.ts";

export const COMPATIBILITY_RETIREMENT_AUDIT_VERSION =
  "execution-platform.compatibility-retirement-audit.v1";

export type CompatibilityRetirementSurfaceId =
  | "generic_workflow_queued_runner"
  | "legacy_agent_team_runner_public_api"
  | "coding_team_live_pilot"
  | "context_scout_pilot"
  | "diagnostic_boundary_replay_public_api"
  | "low_level_patch_json_worker_adapter"
  | "legacy_semantic_intent_fallback"
  | "runtime_tool_adoption_compat_map";

export type CompatibilityRetirementSurfaceRule = {
  surfaceId: CompatibilityRetirementSurfaceId;
  modulePathFragments: string[];
  exportedSymbols: string[];
  publicApiExportAllowed: boolean;
  productionImportAllowed: boolean;
  diagnosticOnlyAllowed: boolean;
  allowedProductionImporters: string[];
  reasonCodes: string[];
};

export type CompatibilityRetirementFindingSeverity =
  | "hard_block"
  | "warning"
  | "allowed_diagnostic_only";

export type CompatibilityRetirementFinding = {
  severity: CompatibilityRetirementFindingSeverity;
  surfaceId: CompatibilityRetirementSurfaceId;
  path: string;
  importedPath?: string | null;
  exportedSymbol?: string | null;
  exportedModule?: string | null;
  reasonCode: string;
  summary: string;
};

export type CompatibilityRetirementAuditResult = {
  artifactKind: "execution_platform.compatibility_retirement_audit";
  auditVersion: typeof COMPATIBILITY_RETIREMENT_AUDIT_VERSION;
  status: "passed" | "needs_review" | "blocked";
  fileCount: number;
  retiredSurfaceCount: number;
  hardBlockCount: number;
  warningCount: number;
  allowedDiagnosticOnlyCount: number;
  findings: CompatibilityRetirementFinding[];
  boundaryGuardrailStatus: "passed" | "needs_review" | "blocked";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

const PUBLIC_RUNTIME_BARREL_PATHS = new Set([
  "extensions/execution-platform/src/index.ts",
  "extensions/execution-platform/src/codex-bridge/index.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/workers/index.ts",
]);

const PRODUCTION_CATEGORIES = new Set<ExecutionPlatformBoundaryCategory>([
  "production_runtime",
  "workflow_plugin",
  "coding_adapter",
  "worker_adapter",
  "work_queue_readback",
  "runtime_tool_kernel",
  "model_task_contract",
]);

const DIAGNOSTIC_CATEGORIES = new Set<ExecutionPlatformBoundaryCategory>([
  "replay_harness",
  "proof_script",
  "diagnostic_script",
  "test_fixture",
  "deprecated_legacy",
]);

export const COMPATIBILITY_RETIREMENT_SURFACE_RULES: CompatibilityRetirementSurfaceRule[] = [
  {
    surfaceId: "generic_workflow_queued_runner",
    modulePathFragments: ["/codex-bridge/workflow-queued-runner"],
    exportedSymbols: ["WorkflowQueuedRunner"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: false,
    allowedProductionImporters: [],
    reasonCodes: ["generic_workflow_runner_deleted"],
  },
  {
    surfaceId: "legacy_agent_team_runner_public_api",
    modulePathFragments: ["/codex-bridge/agent-team-queued-runner"],
    exportedSymbols: ["AgentTeamQueuedRunner"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [
      "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts",
      "extensions/execution-platform/src/codex-bridge/coding-team-implementation-bridge.ts",
      "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.ts",
    ],
    reasonCodes: ["agent_team_runner_public_symbol_retired"],
  },
  {
    surfaceId: "coding_team_live_pilot",
    modulePathFragments: ["/codex-bridge/coding-team-live-pilot"],
    exportedSymbols: ["runCodingTeamLivePilot"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["coding_team_live_pilot_diagnostic_only"],
  },
  {
    surfaceId: "context_scout_pilot",
    modulePathFragments: ["/codex-bridge/context-scout-pilot"],
    exportedSymbols: ["createContextScoutArtifact", "recordContextScoutArtifact"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["context_scout_pilot_diagnostic_only"],
  },
  {
    surfaceId: "diagnostic_boundary_replay_public_api",
    modulePathFragments: [
      "/codex-bridge/commitment-packet-review-boundary-replay",
      "/codex-bridge/context-scout-boundary-replay",
      "/codex-bridge/parallel-context-scout-boundary-replay",
    ],
    exportedSymbols: [
      "runCommitmentPacketReviewBoundaryReplay",
      "runContextScoutBoundaryReplay",
      "runParallelContextScoutBoundaryReplay",
    ],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["boundary_replay_public_runtime_export_retired"],
  },
  {
    surfaceId: "low_level_patch_json_worker_adapter",
    modulePathFragments: [
      "/codex-bridge/kimi-file-implementation-adapter",
      "/codex-bridge/kimi-microtask-implementation-executor",
    ],
    exportedSymbols: ["KimiFileImplementationAdapter", "KimiMicrotaskImplementationExecutor"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["low_level_patch_json_worker_adapter_not_public_runtime"],
  },
  {
    surfaceId: "legacy_semantic_intent_fallback",
    modulePathFragments: ["/intent-routing/model-assisted-intent-router"],
    exportedSymbols: ["HeuristicIntentRouterProvider"],
    publicApiExportAllowed: false,
    productionImportAllowed: false,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["legacy_semantic_intent_fallback_test_only"],
  },
  {
    surfaceId: "runtime_tool_adoption_compat_map",
    modulePathFragments: ["/runtime-tool-call/runtime-tool-adoption-boundary"],
    exportedSymbols: ["RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP"],
    publicApiExportAllowed: true,
    productionImportAllowed: true,
    diagnosticOnlyAllowed: true,
    allowedProductionImporters: [],
    reasonCodes: ["runtime_tool_adoption_boundary_map_must_be_registry_derived"],
  },
];

export function evaluateCompatibilityRetirementAudit(
  files: ExecutionPlatformBoundaryFile[],
): CompatibilityRetirementAuditResult {
  const normalizedFiles = files.map((file) => ({
    path: normalizeExecutionPlatformPath(file.path),
    source: file.source ?? "",
  }));
  const findings: CompatibilityRetirementFinding[] = [];

  for (const file of normalizedFiles) {
    const classification = classifyExecutionPlatformBoundaryPath(file.path);
    const source = file.source;
    for (const specifier of extractExecutionPlatformImportSpecifiers(source)) {
      const importedPath = resolveExecutionPlatformImportPath(file.path, specifier);
      if (!importedPath) {
        continue;
      }
      const rule = ruleForPath(importedPath);
      if (!rule) {
        continue;
      }
      if (
        PRODUCTION_CATEGORIES.has(classification.category) &&
        !rule.productionImportAllowed &&
        !rule.allowedProductionImporters.includes(file.path)
      ) {
        findings.push({
          severity: "hard_block",
          surfaceId: rule.surfaceId,
          path: file.path,
          importedPath,
          reasonCode: `${rule.surfaceId}_production_import_blocked`,
          summary:
            "Production-capable code imports a retired compatibility, proof, fallback, or low-level adapter surface.",
        });
      } else if (DIAGNOSTIC_CATEGORIES.has(classification.category)) {
        if (rule.diagnosticOnlyAllowed) {
          findings.push({
            severity: "allowed_diagnostic_only",
            surfaceId: rule.surfaceId,
            path: file.path,
            importedPath,
            reasonCode: `${rule.surfaceId}_diagnostic_import_allowed`,
            summary:
              "Diagnostic/test-only code may import the retired surface for proof or migration evidence.",
          });
        } else {
          findings.push({
            severity: "hard_block",
            surfaceId: rule.surfaceId,
            path: file.path,
            importedPath,
            reasonCode: `${rule.surfaceId}_diagnostic_import_blocked`,
            summary:
              "Diagnostic/test code imports a deleted compatibility surface instead of testing the current production runtime.",
          });
        }
      }
    }

    if (PUBLIC_RUNTIME_BARREL_PATHS.has(file.path)) {
      for (const rule of COMPATIBILITY_RETIREMENT_SURFACE_RULES) {
        if (rule.publicApiExportAllowed) {
          continue;
        }
        for (const exportedModule of exportedRetiredModules(source, rule)) {
          findings.push({
            severity: "hard_block",
            surfaceId: rule.surfaceId,
            path: file.path,
            exportedModule,
            reasonCode: `${rule.surfaceId}_public_runtime_export_blocked`,
            summary:
              "Public runtime barrel exports a retired compatibility, proof, fallback, or low-level adapter surface.",
          });
        }
        for (const exportedSymbol of rule.exportedSymbols) {
          if (exportsNamedSymbol(source, exportedSymbol)) {
            findings.push({
              severity: "hard_block",
              surfaceId: rule.surfaceId,
              path: file.path,
              exportedSymbol,
              reasonCode: `${rule.surfaceId}_public_symbol_export_blocked`,
              summary: "Public runtime barrel exports a retired runtime symbol.",
            });
          }
        }
      }
    }

    if (file.path.endsWith("/intent-routing/model-assisted-intent-router.ts")) {
      findings.push(...evaluateLegacySemanticFallbackGate(file.path, source));
    }

    if (file.path.endsWith("/runtime-tool-call/runtime-tool-adoption-boundary.ts")) {
      findings.push(...evaluateRegistryDerivedCompatibilityMap(file.path, source));
    }
  }

  const boundaryGuardrails = evaluateExecutionPlatformBoundaryGuardrails(files);
  for (const finding of boundaryGuardrails.findings) {
    if (finding.severity === "hard_block") {
      findings.push({
        severity: "hard_block",
        surfaceId: "diagnostic_boundary_replay_public_api",
        path: finding.path,
        importedPath: finding.importedPath ?? null,
        reasonCode: `boundary_guardrail:${finding.reasonCode}`,
        summary: finding.summary,
      });
    }
  }

  const hardBlockCount = findings.filter((finding) => finding.severity === "hard_block").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const allowedDiagnosticOnlyCount = findings.filter(
    (finding) => finding.severity === "allowed_diagnostic_only",
  ).length;
  const status = hardBlockCount > 0 ? "blocked" : warningCount > 0 ? "needs_review" : "passed";
  const orderedFindings = [...findings].toSorted((left, right) => {
    const severityDelta = severityOrder(left.severity) - severityOrder(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return `${left.path}:${left.reasonCode}:${left.importedPath ?? left.exportedModule ?? left.exportedSymbol ?? ""}`.localeCompare(
      `${right.path}:${right.reasonCode}:${right.importedPath ?? right.exportedModule ?? right.exportedSymbol ?? ""}`,
    );
  });

  return {
    artifactKind: "execution_platform.compatibility_retirement_audit",
    auditVersion: COMPATIBILITY_RETIREMENT_AUDIT_VERSION,
    status,
    fileCount: files.length,
    retiredSurfaceCount: COMPATIBILITY_RETIREMENT_SURFACE_RULES.length,
    hardBlockCount,
    warningCount,
    allowedDiagnosticOnlyCount,
    findings: orderedFindings.slice(0, 160),
    boundaryGuardrailStatus: boundaryGuardrails.status,
    reasonCodes:
      status === "passed"
        ? ["compatibility_retirement_audit_passed"]
        : orderedFindings.map((finding) => finding.reasonCode).slice(0, 160),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

function ruleForPath(path: string): CompatibilityRetirementSurfaceRule | null {
  const normalized = `/${normalizeExecutionPlatformPath(path)}`;
  return (
    COMPATIBILITY_RETIREMENT_SURFACE_RULES.find((rule) =>
      rule.modulePathFragments.some((fragment) => normalized.includes(fragment)),
    ) ?? null
  );
}

function exportedRetiredModules(
  source: string,
  rule: CompatibilityRetirementSurfaceRule,
): string[] {
  const modules = new Set<string>();
  const exportFromPattern = /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(exportFromPattern)) {
    const specifier = match[1] ?? "";
    const comparable = `/${specifier.replace(/^\.\//, "")}`;
    if (
      rule.modulePathFragments.some((fragment) =>
        comparable.includes(fragment.split("/").at(-1) ?? fragment),
      )
    ) {
      modules.add(specifier);
    }
  }
  return [...modules].toSorted();
}

function exportsNamedSymbol(source: string, symbol: string): boolean {
  const namedExportPattern = new RegExp(
    String.raw`\bexport\s+(?:type\s+)?\{[^}]*\b${escapeRegExp(symbol)}\b[^}]*\}`,
    "u",
  );
  const declarationExportPattern = new RegExp(
    String.raw`\bexport\s+(?:class|function|const|let|var|type|interface)\s+${escapeRegExp(symbol)}\b`,
    "u",
  );
  return namedExportPattern.test(source) || declarationExportPattern.test(source);
}

function evaluateLegacySemanticFallbackGate(
  path: string,
  source: string,
): CompatibilityRetirementFinding[] {
  const findings: CompatibilityRetirementFinding[] = [];
  const requiresTestRuntime =
    source.includes('env.NODE_ENV === "test"') &&
    source.includes('env.VITEST === "true"') &&
    source.includes("OPENCLAW_TEST_MINIMAL_GATEWAY") &&
    source.includes("legacy_semantic_intent_fallback_disabled");
  if (!requiresTestRuntime) {
    findings.push({
      severity: "hard_block",
      surfaceId: "legacy_semantic_intent_fallback",
      path,
      reasonCode: "legacy_semantic_fallback_not_test_only",
      summary:
        "Legacy semantic intent fallback must be test/minimal-gateway gated and disabled by default.",
    });
  }
  return findings;
}

function evaluateRegistryDerivedCompatibilityMap(
  path: string,
  source: string,
): CompatibilityRetirementFinding[] {
  if (
    source.includes("buildRuntimeToolAdoptionBoundaryMapFromRegistry") &&
    source.includes("runtime_tool_adoption_boundary_registry_derived_compat_export") &&
    source.includes("export const RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP")
  ) {
    return [];
  }
  return [
    {
      severity: "hard_block",
      surfaceId: "runtime_tool_adoption_compat_map",
      path,
      reasonCode: "runtime_tool_adoption_compat_map_not_registry_derived",
      summary: "Compatibility readback map must derive from the canonical runtime tool registry.",
    },
  ];
}

function severityOrder(severity: CompatibilityRetirementFindingSeverity): number {
  if (severity === "hard_block") {
    return 0;
  }
  if (severity === "warning") {
    return 1;
  }
  return 2;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
