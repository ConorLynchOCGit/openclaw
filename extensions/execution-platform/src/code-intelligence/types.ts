import type { JsonValue } from "../runtime-job-repository.ts";

export const CODE_INTELLIGENCE_RUNTIME_TOOL_IDS = [
  "code.search_symbols",
  "code.get_definition",
  "code.get_references",
  "code.get_hover",
  "code.get_diagnostics",
  "code.get_document_symbols",
  "code.get_workspace_symbols",
  "code.get_call_hierarchy",
  "code.get_implementation",
  "code.plan_rename",
  "code.get_code_actions",
  "code.find_related_tests",
  "code.resolve_import_graph",
  "code.find_impact_radius",
  "code.summarize_file_structure",
  "code.backend_status",
] as const;

export type CodeIntelligenceRuntimeToolId = (typeof CODE_INTELLIGENCE_RUNTIME_TOOL_IDS)[number];

export type CodeIntelligenceSemanticMode = "lsp_semantic" | "typescript_semantic" | "structural";

export type CodeIntelligenceStatus = "succeeded" | "needs_review";

export type CodeIntelligenceBackendState =
  | "not_configured"
  | "configured"
  | "warming"
  | "ready"
  | "degraded_structural"
  | "failed"
  | "stale";

export type CodeIntelligenceBackendHealth = {
  artifactKind: "code_intelligence_backend_health";
  backendId: string;
  semanticMode: CodeIntelligenceSemanticMode;
  state: CodeIntelligenceBackendState;
  backendHealthRef: string;
  workspaceRootRef: string;
  languageIds: string[];
  startupLatencyMs: number | null;
  warmupState: CodeIntelligenceBackendState;
  lastSuccessfulRequestRef: string | null;
  lastFailureClass: string | null;
  staleReason: string | null;
  restartCount: number;
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type CodeIntelligenceWorkspaceSnapshot = {
  artifactKind: "code_intelligence_workspace_snapshot";
  workspaceSnapshotRef: string;
  workspaceRootRef: string;
  workspaceFingerprint: string;
  projectConfigRefs: string[];
  projectConfigHash: string;
  fileCount: number;
  fileHash: string;
  rawFileContentStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type CodeIntelligenceCacheKey = {
  repoIdentity: string;
  workspaceFingerprint: string;
  projectConfigHash: string;
  filePath: string | null;
  fileHash: string | null;
  backendId: string;
  toolId: CodeIntelligenceRuntimeToolId;
  semanticMode: CodeIntelligenceSemanticMode;
  requestHash: string;
};

export type CodeIntelligenceSymbolKind =
  | "class"
  | "function"
  | "method"
  | "interface"
  | "type"
  | "const"
  | "let"
  | "var"
  | "enum"
  | "import"
  | "export"
  | "unknown";

export type CodeIntelligenceLocation = {
  filePath: string;
  line: number;
  column: number;
  lineText: string;
  fileRef: string;
  fileHash: string;
};

export type CodeIntelligenceSymbol = CodeIntelligenceLocation & {
  name: string;
  kind: CodeIntelligenceSymbolKind;
  containerName: string | null;
};

export type CodeIntelligenceDiagnostic = CodeIntelligenceLocation & {
  severity: "error" | "warning" | "info";
  message: string;
  diagnosticCode: string;
};

export type CodeIntelligenceImportEdge = {
  fromFilePath: string;
  toSpecifier: string;
  resolvedFilePath: string | null;
  importKind: "static" | "dynamic" | "export";
};

export type CodeIntelligenceRelatedTest = {
  testFilePath: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  fileRef: string;
};

export type CodeIntelligenceResult = {
  artifactKind: "code_intelligence_result";
  toolId: CodeIntelligenceRuntimeToolId;
  status: CodeIntelligenceStatus;
  semanticMode: CodeIntelligenceSemanticMode;
  backendId: string;
  backendHealthRef: string;
  workspaceSnapshotRef: string;
  semanticConfidence: "high" | "medium" | "low";
  fallbackUsed: boolean;
  fallbackReasonCodes: string[];
  diagnosticVersionRef: string | null;
  projectConfigRefs: string[];
  limitations: string[];
  backendLatencyMs: number | null;
  resultCounts: {
    symbols: number;
    locations: number;
    diagnostics: number;
    importEdges: number;
    relatedTests: number;
    codeActions: number;
  };
  summary: string;
  outputRef: string;
  outputHash: string;
  reasonCodes: string[];
  queriedFileRefs: string[];
  symbolRefs: string[];
  diagnosticRefs: string[];
  relatedTestRefs: string[];
  impactRefs: string[];
  staleRefBlockers: string[];
  symbols: CodeIntelligenceSymbol[];
  locations: CodeIntelligenceLocation[];
  diagnostics: CodeIntelligenceDiagnostic[];
  importGraph: CodeIntelligenceImportEdge[];
  relatedTests: CodeIntelligenceRelatedTest[];
  codeActions: Array<{ title: string; kind: string; targetRef: string; summary: string }>;
  metadata: Record<string, JsonValue>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
};

export type CodeIntelligenceQuery = {
  query?: string | null;
  symbolName?: string | null;
  filePath?: string | null;
  filePaths?: string[] | null;
  targetFilePath?: string | null;
  targetSymbol?: string | null;
  newName?: string | null;
  limit?: number | null;
};
