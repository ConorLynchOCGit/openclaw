import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type ts from "typescript";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  CodeIntelligenceBackendHealth,
  CodeIntelligenceBackendState,
  CodeIntelligenceDiagnostic,
  CodeIntelligenceImportEdge,
  CodeIntelligenceLocation,
  CodeIntelligenceQuery,
  CodeIntelligenceRelatedTest,
  CodeIntelligenceRuntimeToolId,
  CodeIntelligenceSemanticMode,
  CodeIntelligenceSymbol,
  CodeIntelligenceSymbolKind,
  CodeIntelligenceWorkspaceSnapshot,
} from "./types.ts";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".artifacts",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "tmp",
]);
const MAX_FILE_BYTES = 400_000;
const DEFAULT_LIMIT = 40;

type TypeScriptModule = typeof import("typescript");

let loadedTypeScriptModule: Promise<TypeScriptModule> | null = null;

function loadTypeScriptModule(): Promise<TypeScriptModule> {
  loadedTypeScriptModule ??= import("typescript");
  return loadedTypeScriptModule;
}

function requireTypeScriptModule(module: TypeScriptModule | null): TypeScriptModule {
  if (!module) {
    throw new Error("TypeScript semantic backend was used before the TypeScript module loaded.");
  }
  return module;
}

export type CodeIntelligenceBackendToolResult = {
  handled: boolean;
  status: "succeeded" | "needs_review";
  summary: string;
  reasonCodes: string[];
  symbols?: CodeIntelligenceSymbol[];
  locations?: CodeIntelligenceLocation[];
  diagnostics?: CodeIntelligenceDiagnostic[];
  importGraph?: CodeIntelligenceImportEdge[];
  relatedTests?: CodeIntelligenceRelatedTest[];
  codeActions?: Array<{ title: string; kind: string; targetRef: string; summary: string }>;
  metadata?: Record<string, JsonValue>;
  semanticMode: CodeIntelligenceSemanticMode;
  backendId: string;
  backendHealth: CodeIntelligenceBackendHealth;
  workspaceSnapshot: CodeIntelligenceWorkspaceSnapshot;
  semanticConfidence: "high" | "medium" | "low";
  fallbackUsed: boolean;
  fallbackReasonCodes: string[];
  diagnosticVersionRef: string | null;
  projectConfigRefs: string[];
  limitations: string[];
  staleRefBlockers: string[];
  backendLatencyMs: number;
};

type TypeScriptSemanticToolOutput = Pick<
  CodeIntelligenceBackendToolResult,
  | "status"
  | "summary"
  | "reasonCodes"
  | "symbols"
  | "locations"
  | "diagnostics"
  | "importGraph"
  | "relatedTests"
  | "codeActions"
  | "metadata"
>;

export type CodeIntelligenceBackend = {
  backendId: string;
  semanticMode: CodeIntelligenceSemanticMode;
  supportedExtensions: string[];
  supportedLanguages: string[];
  toolCoverage: CodeIntelligenceRuntimeToolId[];
  startupRequirements: string[];
  staleRefPolicy: string;
  knownLimitations: string[];
  health(): Promise<CodeIntelligenceBackendHealth>;
  workspaceSnapshot(): Promise<CodeIntelligenceWorkspaceSnapshot>;
  runTool(
    toolId: CodeIntelligenceRuntimeToolId,
    query: CodeIntelligenceQuery,
  ): Promise<CodeIntelligenceBackendToolResult>;
};

export class CodeIntelligenceBackendRegistry {
  private readonly backends = new Map<string, CodeIntelligenceBackend>();

  register(backend: CodeIntelligenceBackend): void {
    this.backends.set(backend.backendId, backend);
  }

  list(): CodeIntelligenceBackend[] {
    return [...this.backends.values()];
  }

  select(input: {
    preferredSemanticMode?: CodeIntelligenceSemanticMode | null;
    toolId: CodeIntelligenceRuntimeToolId;
  }): CodeIntelligenceBackend {
    const preferred = input.preferredSemanticMode;
    const orderedModes: CodeIntelligenceSemanticMode[] =
      preferred === "structural"
        ? ["structural"]
        : preferred === "lsp_semantic"
          ? ["lsp_semantic", "typescript_semantic", "structural"]
          : ["typescript_semantic", "lsp_semantic", "structural"];
    for (const mode of orderedModes) {
      const backend = this.list().find(
        (candidate) =>
          candidate.semanticMode === mode && candidate.toolCoverage.includes(input.toolId),
      );
      if (backend) {
        return backend;
      }
    }
    const fallback = this.list().find((candidate) => candidate.toolCoverage.includes(input.toolId));
    if (!fallback) {
      throw new Error(`No code intelligence backend covers ${input.toolId}.`);
    }
    return fallback;
  }
}

export class TypeScriptSemanticBackend implements CodeIntelligenceBackend {
  readonly backendId = "typescript_language_service";
  readonly semanticMode = "typescript_semantic" as const;
  readonly supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  readonly supportedLanguages = ["typescript", "typescriptreact", "javascript", "javascriptreact"];
  readonly toolCoverage = [
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
  ] as CodeIntelligenceRuntimeToolId[];
  readonly startupRequirements = ["typescript package available", "bounded TS/JS workspace files"];
  readonly staleRefPolicy =
    "Semantic refs are stale when workspace fingerprint, project config hash, target file hash, or diagnostic version changes.";
  readonly knownLimitations = [
    "External JSON-RPC LSP process is not configured; TypeScript language-service APIs provide TS/JS semantic mode.",
  ];

  private service: ts.LanguageService | null = null;
  private tsModule: TypeScriptModule | null = null;
  private files: Map<string, { version: number; content: string; fileHash: string }> | null = null;
  private rootFiles: string[] = [];
  private cachedSnapshot: CodeIntelligenceWorkspaceSnapshot | null = null;
  private startupLatencyMs: number | null = null;
  private lastSuccessfulRequestRef: string | null = null;
  private lastFailureClass: string | null = null;

  constructor(
    private readonly options: {
      rootDir: string;
      maxFiles: number;
    },
  ) {}

  async health(): Promise<CodeIntelligenceBackendHealth> {
    const snapshot = await this.workspaceSnapshot();
    return backendHealth({
      backendId: this.backendId,
      semanticMode: this.semanticMode,
      state: this.service ? "ready" : "configured",
      workspaceRootRef: snapshot.workspaceRootRef,
      startupLatencyMs: this.startupLatencyMs,
      lastSuccessfulRequestRef: this.lastSuccessfulRequestRef,
      lastFailureClass: this.lastFailureClass,
      limitations: this.knownLimitations,
    });
  }

  async workspaceSnapshot(): Promise<CodeIntelligenceWorkspaceSnapshot> {
    await this.ensureService();
    if (this.cachedSnapshot) {
      return this.cachedSnapshot;
    }
    const files = this.files ?? new Map();
    const fileHash = hashString(
      JSON.stringify([...files.entries()].map(([filePath, record]) => [filePath, record.fileHash])),
    );
    const projectConfigRefs = await discoverProjectConfigRefs(this.options.rootDir);
    const projectConfigHash = hashString(JSON.stringify(projectConfigRefs));
    const workspaceFingerprint = hashString(
      JSON.stringify({
        rootDir: this.options.rootDir,
        fileHash,
        projectConfigHash,
      }),
    );
    this.cachedSnapshot = {
      artifactKind: "code_intelligence_workspace_snapshot",
      workspaceSnapshotRef: `code-intelligence-workspace://${workspaceFingerprint}`,
      workspaceRootRef: `repo-root://${hashString(this.options.rootDir)}`,
      workspaceFingerprint,
      projectConfigRefs,
      projectConfigHash,
      fileCount: files.size,
      fileHash,
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };
    return this.cachedSnapshot;
  }

  async runTool(
    toolId: CodeIntelligenceRuntimeToolId,
    query: CodeIntelligenceQuery,
  ): Promise<CodeIntelligenceBackendToolResult> {
    const started = Date.now();
    const snapshot = await this.workspaceSnapshot();
    const health = await this.health();
    const normalized = normalizeQuery(query);
    try {
      const result = await this.runSemanticTool(toolId, normalized);
      this.lastSuccessfulRequestRef = `code-intelligence-request://${toolId}/${hashString(
        JSON.stringify({ normalized, snapshot: snapshot.workspaceSnapshotRef }),
      )}`;
      return {
        ...result,
        handled: true,
        semanticMode: this.semanticMode,
        backendId: this.backendId,
        backendHealth: await this.health(),
        workspaceSnapshot: snapshot,
        semanticConfidence: result.status === "succeeded" ? "high" : "medium",
        fallbackUsed: false,
        fallbackReasonCodes: [],
        diagnosticVersionRef: `code-intelligence-diagnostics://${snapshot.workspaceFingerprint}`,
        projectConfigRefs: snapshot.projectConfigRefs,
        limitations: this.knownLimitations,
        staleRefBlockers: [],
        backendLatencyMs: Date.now() - started,
      };
    } catch (error) {
      this.lastFailureClass = error instanceof Error ? error.name : "typescript_semantic_error";
      return {
        handled: false,
        status: "needs_review",
        summary: `TypeScript semantic backend failed: ${bounded(String(error instanceof Error ? error.message : error), 500)}`,
        reasonCodes: ["code_intelligence_typescript_backend_failed"],
        semanticMode: this.semanticMode,
        backendId: this.backendId,
        backendHealth: health,
        workspaceSnapshot: snapshot,
        semanticConfidence: "low",
        fallbackUsed: true,
        fallbackReasonCodes: ["code_intelligence_typescript_backend_failed"],
        diagnosticVersionRef: `code-intelligence-diagnostics://${snapshot.workspaceFingerprint}`,
        projectConfigRefs: snapshot.projectConfigRefs,
        limitations: [
          ...this.knownLimitations,
          "TypeScript semantic backend failed for this request.",
        ],
        staleRefBlockers: [],
        backendLatencyMs: Date.now() - started,
      };
    }
  }

  private async runSemanticTool(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    await this.ensureService();
    switch (toolId) {
      case "code.search_symbols":
      case "code.get_workspace_symbols":
        return this.searchSymbols(toolId, query);
      case "code.get_definition":
        return this.getDefinition(query);
      case "code.get_references":
        return this.getReferences(query);
      case "code.get_hover":
        return this.getHover(query);
      case "code.get_diagnostics":
        return this.getDiagnostics(query);
      case "code.get_document_symbols":
        return this.getDocumentSymbols(query);
      case "code.get_call_hierarchy":
        return this.getReferences(query);
      case "code.get_implementation":
        return this.getImplementation(query);
      case "code.plan_rename":
        return this.planRename(query);
      case "code.get_code_actions":
        return this.getCodeActions(query);
      case "code.find_related_tests":
        return this.findRelatedTests(query);
      case "code.resolve_import_graph":
        return this.resolveImportGraph(query);
      case "code.find_impact_radius":
        return this.findImpactRadius(query);
      case "code.summarize_file_structure":
        return this.summarizeFileStructure(query);
      case "code.backend_status":
        return {
          status: "succeeded",
          summary: "TypeScript semantic backend status is handled by CodeIntelligenceService.",
          reasonCodes: ["code_intelligence_backend_status_service_owned"],
        };
    }
    toolId satisfies never;
    throw new Error("unsupported_code_intelligence_tool");
  }

  private async ensureService(): Promise<void> {
    if (this.service && this.files) {
      return;
    }
    const started = Date.now();
    const ts = await this.ensureTypeScript();
    const filePaths = await listCodeFiles(this.options.rootDir, this.options.maxFiles);
    const files = new Map<string, { version: number; content: string; fileHash: string }>();
    await Promise.all(
      filePaths.map(async (filePath) => {
        const absolute = path.join(this.options.rootDir, filePath);
        const stat = await lstat(absolute).catch(() => null);
        if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) {
          return;
        }
        const content = await readFile(absolute, "utf8").catch(() => null);
        if (content === null) {
          return;
        }
        files.set(filePath, { version: 1, content, fileHash: hashString(content) });
      }),
    );
    this.files = files;
    this.rootFiles = [...files.keys()];
    const compilerOptions = await readCompilerOptions(this.options.rootDir, ts);
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => compilerOptions,
      getScriptFileNames: () => this.rootFiles,
      getScriptVersion: (fileName) =>
        files.get(relativePath(this.options.rootDir, fileName))?.version.toString() ?? "0",
      getScriptSnapshot: (fileName) => {
        const rel = relativePath(this.options.rootDir, fileName);
        const content = files.get(rel)?.content;
        if (content !== undefined) {
          return ts.ScriptSnapshot.fromString(content);
        }
        if (!existsSync(fileName)) {
          return undefined;
        }
        const disk = ts.sys.readFile(fileName);
        return disk === undefined ? undefined : ts.ScriptSnapshot.fromString(disk);
      },
      getCurrentDirectory: () => this.options.rootDir,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => ts.sys.fileExists(fileName),
      readFile: (fileName, encoding) => ts.sys.readFile(fileName, encoding),
      readDirectory: (rootDir, extensions, excludes, includes, depth) =>
        ts.sys.readDirectory(rootDir, extensions, excludes, includes, depth),
      directoryExists: (directoryName) => ts.sys.directoryExists(directoryName),
      getDirectories: (pathValue) => ts.sys.getDirectories(pathValue),
    };
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    this.startupLatencyMs = Date.now() - started;
  }

  private async ensureTypeScript(): Promise<TypeScriptModule> {
    if (!this.tsModule) {
      this.tsModule = await loadTypeScriptModule();
    }
    return this.tsModule;
  }

  private async searchSymbols(
    _toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const needle = (query.symbolName || query.query).toLowerCase();
    const symbols = this.rootFiles
      .flatMap((filePath) => this.documentSymbolsForFile(filePath))
      .filter((symbol) => !needle || symbol.name.toLowerCase().includes(needle))
      .slice(0, query.limit);
    return {
      status: symbols.length ? "succeeded" : "needs_review",
      summary: symbols.length
        ? `Found ${symbols.length} TypeScript semantic symbol(s).`
        : "No TypeScript semantic symbols found.",
      symbols,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        symbols.length
          ? "code_intelligence_semantic_symbols_found"
          : "code_intelligence_semantic_symbols_missing",
      ],
      metadata: { backendOperation: "workspace_symbols" },
    };
  }

  private async getDefinition(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const position = this.findPosition(query);
    const definitions = position
      ? (this.service?.getDefinitionAtPosition(position.filePath, position.offset) ?? [])
      : [];
    const symbols = definitions.map((definition) =>
      this.symbolFromTextSpan(
        definition.fileName,
        definition.textSpan,
        definition.name,
        symbolKind(definition.kind),
      ),
    );
    return {
      status: symbols.length ? "succeeded" : "needs_review",
      summary: symbols.length
        ? `Resolved ${symbols.length} TypeScript semantic definition(s).`
        : `No TypeScript semantic definition found for ${query.symbolName || query.query}.`,
      symbols: symbols.slice(0, query.limit),
      locations: symbols.slice(0, query.limit),
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        symbols.length
          ? "code_intelligence_semantic_definition_found"
          : "code_intelligence_semantic_definition_missing",
      ],
    };
  }

  private async getReferences(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const position = this.findPosition(query);
    const references = position
      ? (this.service?.findReferences(position.filePath, position.offset) ?? [])
      : [];
    const locations = references
      .flatMap((group) => group.references)
      .map((ref) => this.locationFromTextSpan(ref.fileName, ref.textSpan))
      .slice(0, query.limit);
    return {
      status: locations.length ? "succeeded" : "needs_review",
      summary: locations.length
        ? `Found ${locations.length} TypeScript semantic reference(s).`
        : `No TypeScript semantic references found for ${query.symbolName || query.query}.`,
      locations,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        locations.length
          ? "code_intelligence_semantic_references_found"
          : "code_intelligence_semantic_references_missing",
      ],
    };
  }

  private async getHover(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const ts = requireTypeScriptModule(this.tsModule);
    const position = this.findPosition(query);
    const info = position
      ? this.service?.getQuickInfoAtPosition(position.filePath, position.offset)
      : null;
    const location = position
      ? this.locationFromTextSpan(position.filePath, { start: position.offset, length: 1 })
      : null;
    const summary = info
      ? ts.displayPartsToString(info.displayParts ?? [])
      : `No TypeScript semantic hover found for ${query.symbolName || query.query}.`;
    return {
      status: info && location ? "succeeded" : "needs_review",
      summary: bounded(summary, 1_200),
      locations: location ? [location] : [],
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        info
          ? "code_intelligence_semantic_hover_found"
          : "code_intelligence_semantic_hover_missing",
      ],
      metadata: { hoverSummary: bounded(summary, 500) },
    };
  }

  private async getDiagnostics(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const filePaths = query.filePaths.length
      ? query.filePaths
      : query.filePath
        ? [query.filePath]
        : this.rootFiles;
    const diagnostics = filePaths
      .flatMap((filePath) => [
        ...(this.service?.getSyntacticDiagnostics(filePath) ?? []),
        ...(this.service?.getSemanticDiagnostics(filePath) ?? []),
      ])
      .map((diagnostic) => this.diagnosticFromTs(diagnostic))
      .filter((diagnostic): diagnostic is CodeIntelligenceDiagnostic => Boolean(diagnostic))
      .slice(0, query.limit);
    return {
      status: "succeeded" as const,
      summary: diagnostics.length
        ? `Found ${diagnostics.length} TypeScript semantic/syntactic diagnostic(s).`
        : "No TypeScript semantic diagnostics found.",
      diagnostics,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        diagnostics.length
          ? "code_intelligence_semantic_diagnostics_found"
          : "code_intelligence_no_semantic_diagnostics",
      ],
    };
  }

  private async getDocumentSymbols(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const filePaths = query.filePaths.length
      ? query.filePaths
      : query.filePath
        ? [query.filePath]
        : this.rootFiles;
    const symbols = filePaths
      .flatMap((filePath) => this.documentSymbolsForFile(filePath))
      .slice(0, query.limit);
    return {
      status: symbols.length ? "succeeded" : "needs_review",
      summary: symbols.length
        ? `Summarized ${symbols.length} TypeScript semantic document symbol(s).`
        : "No TypeScript semantic document symbols found.",
      symbols,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        symbols.length
          ? "code_intelligence_semantic_document_symbols_found"
          : "code_intelligence_semantic_document_symbols_missing",
      ],
    };
  }

  private async getImplementation(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const position = this.findPosition(query);
    const implementations = position
      ? (this.service?.getImplementationAtPosition(position.filePath, position.offset) ?? [])
      : [];
    const locations = implementations
      .map((implementation) =>
        this.locationFromTextSpan(implementation.fileName, implementation.textSpan),
      )
      .slice(0, query.limit);
    return {
      status: locations.length ? "succeeded" : "needs_review",
      summary: locations.length
        ? `Found ${locations.length} TypeScript semantic implementation candidate(s).`
        : `No TypeScript semantic implementation found for ${query.symbolName || query.query}.`,
      locations,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        locations.length
          ? "code_intelligence_semantic_implementation_found"
          : "code_intelligence_semantic_implementation_missing",
      ],
    };
  }

  private async planRename(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const position = this.findPosition(query);
    const locations = position
      ? (
          this.service?.findRenameLocations(
            position.filePath,
            position.offset,
            false,
            false,
            true,
          ) ?? []
        ).map((location) => this.locationFromTextSpan(location.fileName, location.textSpan))
      : [];
    return {
      status: locations.length ? "succeeded" : "needs_review",
      summary: locations.length
        ? `Rename plan touches ${locations.length} TypeScript semantic location(s).`
        : `No TypeScript semantic rename locations found for ${query.symbolName || query.query}.`,
      locations: locations.slice(0, query.limit),
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        locations.length
          ? "code_intelligence_semantic_rename_locations_found"
          : "code_intelligence_semantic_rename_locations_missing",
        "code_intelligence_rename_plan_read_only",
      ],
      metadata: { newName: query.newName, editApplied: false },
    };
  }

  private async getCodeActions(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const filePath = query.filePath || query.filePaths[0] || this.rootFiles[0] || "";
    const diagnostics = await this.getDiagnostics({
      ...query,
      filePath,
      filePaths: filePath ? [filePath] : [],
    });
    const codeActions = (diagnostics.diagnostics ?? []).map((diagnostic) => ({
      title: `Review ${diagnostic.diagnosticCode} in ${diagnostic.filePath}:${diagnostic.line}`,
      kind: "quickfix.review",
      targetRef: diagnostic.fileRef,
      summary: diagnostic.message,
    }));
    return {
      ...diagnostics,
      summary: codeActions.length
        ? `Produced ${codeActions.length} TypeScript semantic code action candidate(s).`
        : "No TypeScript semantic code actions needed.",
      codeActions,
      reasonCodes: [
        ...diagnostics.reasonCodes,
        "code_intelligence_semantic_code_actions_review_only",
      ],
    };
  }

  private async findRelatedTests(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const targetBase = basenameWithoutExtension(
      query.targetFilePath || query.filePath || query.query,
    );
    const tests = this.rootFiles
      .filter((filePath) => isTestFile(filePath))
      .map((filePath): CodeIntelligenceRelatedTest | null => {
        const content = this.files?.get(filePath)?.content ?? "";
        const baseMatch = filePath.toLowerCase().includes(targetBase.toLowerCase());
        const importMatch = content.includes(targetBase) || content.includes(query.filePath || "");
        if (!baseMatch && !importMatch) {
          return null;
        }
        return {
          testFilePath: filePath,
          reason: baseMatch
            ? "semantic target basename matches test filename"
            : "test references semantic target",
          confidence: baseMatch && importMatch ? "high" : baseMatch ? "medium" : "low",
          fileRef: fileRef(filePath, this.files?.get(filePath)?.fileHash ?? hashString(filePath)),
        };
      })
      .filter((test): test is CodeIntelligenceRelatedTest => Boolean(test))
      .slice(0, query.limit);
    return {
      status: tests.length ? "succeeded" : "needs_review",
      summary: tests.length
        ? `Found ${tests.length} TypeScript semantic related test candidate(s).`
        : "No TypeScript semantic related tests found.",
      relatedTests: tests,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        tests.length
          ? "code_intelligence_semantic_related_tests_found"
          : "code_intelligence_semantic_related_tests_missing",
      ],
    };
  }

  private async resolveImportGraph(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const filePaths = query.filePaths.length
      ? query.filePaths
      : query.filePath
        ? [query.filePath]
        : this.rootFiles;
    const importGraph = filePaths
      .flatMap((filePath) =>
        parseImports({
          rootDir: this.options.rootDir,
          filePath,
          fileHash: this.files?.get(filePath)?.fileHash ?? hashString(filePath),
          lines: (this.files?.get(filePath)?.content ?? "").split(/\r?\n/u),
        }),
      )
      .slice(0, query.limit);
    return {
      status: "succeeded" as const,
      summary: importGraph.length
        ? `Resolved ${importGraph.length} TypeScript semantic import edge(s).`
        : "No TypeScript semantic import edges found.",
      importGraph,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        importGraph.length
          ? "code_intelligence_semantic_import_graph_found"
          : "code_intelligence_semantic_import_graph_empty",
      ],
    };
  }

  private async findImpactRadius(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const references = await this.getReferences({
      ...query,
      query:
        query.targetSymbol ||
        query.symbolName ||
        basenameWithoutExtension(query.targetFilePath || query.filePath),
    });
    const relatedTests = await this.findRelatedTests(query);
    return {
      ...references,
      summary: `Semantic impact radius has ${(references.locations ?? []).length} reference(s) and ${(relatedTests.relatedTests ?? []).length} related test candidate(s).`,
      relatedTests: relatedTests.relatedTests,
      reasonCodes: [...references.reasonCodes, "code_intelligence_semantic_impact_radius"],
    };
  }

  private async summarizeFileStructure(
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<TypeScriptSemanticToolOutput> {
    const symbols = (await this.getDocumentSymbols(query)).symbols ?? [];
    const imports = (await this.resolveImportGraph(query)).importGraph ?? [];
    return {
      status: symbols.length || imports.length ? "succeeded" : "needs_review",
      summary: `Summarized ${symbols.length} TypeScript semantic symbol(s) and ${imports.length} import edge(s).`,
      symbols,
      importGraph: imports,
      reasonCodes: [
        "code_intelligence_typescript_semantic_used",
        "code_intelligence_semantic_file_structure_summarized",
      ],
    };
  }

  private findPosition(
    query: NormalizedCodeIntelligenceQuery,
  ): { filePath: string; offset: number } | null {
    const needle = query.symbolName || query.targetSymbol || query.query;
    const candidateFiles = query.filePaths.length
      ? query.filePaths
      : query.filePath
        ? [query.filePath]
        : this.rootFiles;
    for (const filePath of candidateFiles) {
      const content = this.files?.get(filePath)?.content;
      if (!content) {
        continue;
      }
      const offset = needle ? content.indexOf(needle) : 0;
      if (offset >= 0) {
        return { filePath, offset };
      }
    }
    if (needle) {
      for (const filePath of this.rootFiles) {
        const content = this.files?.get(filePath)?.content;
        const offset = content?.indexOf(needle) ?? -1;
        if (offset >= 0) {
          return { filePath, offset };
        }
      }
    }
    return null;
  }

  private documentSymbolsForFile(filePath: string): CodeIntelligenceSymbol[] {
    const navigation = this.service?.getNavigationTree(filePath);
    if (!navigation) {
      return [];
    }
    const out: CodeIntelligenceSymbol[] = [];
    const visit = (item: ts.NavigationTree, containerName: string | null): void => {
      for (const span of item.spans ?? []) {
        out.push(
          this.symbolFromTextSpan(filePath, span, item.text, symbolKind(item.kind), containerName),
        );
      }
      for (const child of item.childItems ?? []) {
        visit(child, item.text);
      }
    };
    visit(navigation, null);
    return out.filter((symbol) => symbol.name !== "<global>").slice(0, DEFAULT_LIMIT);
  }

  private symbolFromTextSpan(
    fileName: string,
    span: ts.TextSpan,
    name: string,
    kind: CodeIntelligenceSymbolKind,
    containerName: string | null = null,
  ): CodeIntelligenceSymbol {
    const location = this.locationFromTextSpan(fileName, span);
    return { ...location, name, kind, containerName };
  }

  private locationFromTextSpan(fileName: string, span: ts.TextSpan): CodeIntelligenceLocation {
    const rel = relativePath(this.options.rootDir, fileName);
    const sourceFile =
      this.service?.getProgram()?.getSourceFile(rel) ??
      this.service?.getProgram()?.getSourceFile(fileName);
    const record = this.files?.get(rel);
    const content = record?.content ?? "";
    const { line, character } = sourceFile
      ? sourceFile.getLineAndCharacterOfPosition(span.start)
      : offsetToLineCharacter(content, span.start);
    const lineText = content.split(/\r?\n/u)[line] ?? "";
    return {
      filePath: rel,
      line: line + 1,
      column: character + 1,
      lineText: trimLine(lineText),
      fileRef: fileRef(rel, record?.fileHash ?? hashString(content || rel)),
      fileHash: record?.fileHash ?? hashString(content || rel),
    };
  }

  private diagnosticFromTs(diagnostic: ts.Diagnostic): CodeIntelligenceDiagnostic | null {
    const ts = requireTypeScriptModule(this.tsModule);
    if (!diagnostic.file) {
      return null;
    }
    const rel = relativePath(this.options.rootDir, diagnostic.file.fileName);
    const start = diagnostic.start ?? 0;
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(start);
    const record = this.files?.get(rel);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    return {
      filePath: rel,
      line: line + 1,
      column: character + 1,
      lineText: trimLine(record?.content.split(/\r?\n/u)[line] ?? ""),
      fileRef: fileRef(rel, record?.fileHash ?? hashString(rel)),
      fileHash: record?.fileHash ?? hashString(rel),
      severity:
        diagnostic.category === ts.DiagnosticCategory.Error
          ? "error"
          : diagnostic.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : "info",
      message: bounded(message, 700),
      diagnosticCode: `ts${diagnostic.code}`,
    };
  }
}

export class StructuralParserBackend implements CodeIntelligenceBackend {
  readonly backendId = "structural_parser";
  readonly semanticMode = "structural" as const;
  readonly supportedExtensions = [...CODE_EXTENSIONS];
  readonly supportedLanguages = ["typescript", "javascript"];
  readonly toolCoverage = [
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
  ] as CodeIntelligenceRuntimeToolId[];
  readonly startupRequirements = ["bounded source file reads"];
  readonly staleRefPolicy =
    "Structural refs are stale when file hash or workspace fingerprint changes.";
  readonly knownLimitations = ["Structural parser is degraded mode and is not semantic parity."];

  constructor(private readonly options: { rootDir: string; maxFiles: number }) {}

  async health(): Promise<CodeIntelligenceBackendHealth> {
    const snapshot = await this.workspaceSnapshot();
    return backendHealth({
      backendId: this.backendId,
      semanticMode: this.semanticMode,
      state: "degraded_structural",
      workspaceRootRef: snapshot.workspaceRootRef,
      startupLatencyMs: null,
      lastSuccessfulRequestRef: null,
      lastFailureClass: null,
      limitations: this.knownLimitations,
    });
  }

  async workspaceSnapshot(): Promise<CodeIntelligenceWorkspaceSnapshot> {
    const files = await listCodeFiles(this.options.rootDir, this.options.maxFiles);
    const projectConfigRefs = await discoverProjectConfigRefs(this.options.rootDir);
    const fileHash = hashString(JSON.stringify(files));
    const projectConfigHash = hashString(JSON.stringify(projectConfigRefs));
    const workspaceFingerprint = hashString(JSON.stringify({ files, projectConfigHash }));
    return {
      artifactKind: "code_intelligence_workspace_snapshot",
      workspaceSnapshotRef: `code-intelligence-workspace://${workspaceFingerprint}`,
      workspaceRootRef: `repo-root://${hashString(this.options.rootDir)}`,
      workspaceFingerprint,
      projectConfigRefs,
      projectConfigHash,
      fileCount: files.length,
      fileHash,
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };
  }

  async runTool(
    toolId: CodeIntelligenceRuntimeToolId,
    _query: CodeIntelligenceQuery,
  ): Promise<CodeIntelligenceBackendToolResult> {
    const snapshot = await this.workspaceSnapshot();
    return {
      handled: false,
      status: "needs_review",
      summary: `${toolId} should be served by the existing structural parser service path.`,
      reasonCodes: ["code_intelligence_structural_backend_delegated"],
      semanticMode: this.semanticMode,
      backendId: this.backendId,
      backendHealth: await this.health(),
      workspaceSnapshot: snapshot,
      semanticConfidence: "low",
      fallbackUsed: true,
      fallbackReasonCodes: ["code_intelligence_structural_fallback_used"],
      diagnosticVersionRef: null,
      projectConfigRefs: snapshot.projectConfigRefs,
      limitations: this.knownLimitations,
      staleRefBlockers: [],
      backendLatencyMs: 0,
    };
  }
}

export function createDefaultCodeIntelligenceBackendRegistry(input: {
  rootDir: string;
  maxFiles: number;
  semanticMode?: CodeIntelligenceSemanticMode | null;
}): CodeIntelligenceBackendRegistry {
  const registry = new CodeIntelligenceBackendRegistry();
  if (input.semanticMode !== "structural") {
    registry.register(new TypeScriptSemanticBackend(input));
  }
  registry.register(new StructuralParserBackend(input));
  return registry;
}

function backendHealth(input: {
  backendId: string;
  semanticMode: CodeIntelligenceSemanticMode;
  state: CodeIntelligenceBackendState;
  workspaceRootRef: string;
  startupLatencyMs: number | null;
  lastSuccessfulRequestRef: string | null;
  lastFailureClass: string | null;
  limitations: string[];
}): CodeIntelligenceBackendHealth {
  const hash = hashString(JSON.stringify(input));
  return {
    artifactKind: "code_intelligence_backend_health",
    backendId: input.backendId,
    semanticMode: input.semanticMode,
    state: input.state,
    backendHealthRef: `code-intelligence-backend-health://${input.backendId}/${hash}`,
    workspaceRootRef: input.workspaceRootRef,
    languageIds: ["typescript", "javascript"],
    startupLatencyMs: input.startupLatencyMs,
    warmupState: input.state,
    lastSuccessfulRequestRef: input.lastSuccessfulRequestRef,
    lastFailureClass: input.lastFailureClass,
    staleReason: null,
    restartCount: 0,
    limitations: input.limitations,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

async function listCodeFiles(rootDir: string, maxFiles: number): Promise<string[]> {
  const results: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    if (results.length >= maxFiles) {
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await visit(absolutePath);
        }
        continue;
      }
      if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(relativePath(rootDir, absolutePath));
      }
    }
  };
  await visit(rootDir);
  return results.toSorted();
}

async function discoverProjectConfigRefs(rootDir: string): Promise<string[]> {
  const refs: string[] = [];
  for (const name of ["tsconfig.json", "jsconfig.json", "package.json"]) {
    const absolute = path.join(rootDir, name);
    if (!existsSync(absolute)) {
      continue;
    }
    const content = await readFile(absolute, "utf8").catch(() => null);
    refs.push(`repo-config://${name}#${hashString(content ?? name)}`);
  }
  return refs;
}

async function readCompilerOptions(
  rootDir: string,
  ts: TypeScriptModule,
): Promise<ts.CompilerOptions> {
  const tsconfig = path.join(rootDir, "tsconfig.json");
  if (!existsSync(tsconfig)) {
    return {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
    };
  }
  const configFile = ts.readConfigFile(tsconfig, (fileName) => ts.sys.readFile(fileName));
  if (configFile.error) {
    return { allowJs: true, skipLibCheck: true, noEmit: true };
  }
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir).options;
}

type NormalizedCodeIntelligenceQuery = {
  query: string;
  symbolName: string;
  filePath: string;
  filePaths: string[];
  targetFilePath: string;
  targetSymbol: string;
  newName: string;
  limit: number;
};

function normalizeQuery(query: CodeIntelligenceQuery): NormalizedCodeIntelligenceQuery {
  const limit = Math.max(1, Math.min(200, query.limit ?? DEFAULT_LIMIT));
  return {
    query: query.query ?? "",
    symbolName: query.symbolName ?? "",
    filePath: query.filePath ?? "",
    filePaths: Array.isArray(query.filePaths)
      ? query.filePaths.filter((filePath): filePath is string => typeof filePath === "string")
      : [],
    targetFilePath: query.targetFilePath ?? "",
    targetSymbol: query.targetSymbol ?? "",
    newName: query.newName ?? "",
    limit,
  };
}

function symbolKind(kind: string): CodeIntelligenceSymbolKind {
  const normalized = kind.toLowerCase();
  if (normalized.includes("class")) {
    return "class";
  }
  if (normalized.includes("interface")) {
    return "interface";
  }
  if (normalized.includes("type")) {
    return "type";
  }
  if (normalized.includes("enum")) {
    return "enum";
  }
  if (normalized.includes("method")) {
    return "method";
  }
  if (normalized.includes("function")) {
    return "function";
  }
  if (normalized.includes("const")) {
    return "const";
  }
  return "unknown";
}

function offsetToLineCharacter(
  content: string,
  offset: number,
): { line: number; character: number } {
  const before = content.slice(0, offset);
  const lines = before.split(/\r?\n/u);
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 };
}

function parseImports(input: {
  rootDir: string;
  filePath: string;
  fileHash: string;
  lines: string[];
}): CodeIntelligenceImportEdge[] {
  return input.lines.flatMap((lineText) => {
    const trimmed = lineText.trim();
    const match =
      trimmed.match(/^import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/u) ??
      trimmed.match(/^export\s+.+?\s+from\s+["']([^"']+)["']/u) ??
      trimmed.match(/^const\s+.+?=\s+require\(["']([^"']+)["']\)/u) ??
      trimmed.match(/^import\(["']([^"']+)["']\)/u);
    if (!match?.[1]) {
      return [];
    }
    const specifier = match[1];
    return [
      {
        fromFilePath: input.filePath,
        toSpecifier: specifier,
        resolvedFilePath: specifier.startsWith(".")
          ? resolveLocalImport(input.rootDir, input.filePath, specifier)
          : null,
        importKind: trimmed.startsWith("export")
          ? "export"
          : trimmed.startsWith("import(")
            ? "dynamic"
            : "static",
      },
    ];
  });
}

function resolveLocalImport(
  rootDir: string,
  fromFilePath: string,
  specifier: string,
): string | null {
  const base = path.resolve(rootDir, path.dirname(fromFilePath), specifier);
  for (const extension of CODE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return relativePath(rootDir, candidate);
    }
  }
  for (const extension of CODE_EXTENSIONS) {
    const candidate = path.join(base, `index${extension}`);
    if (existsSync(candidate)) {
      return relativePath(rootDir, candidate);
    }
  }
  return null;
}

function isTestFile(filePath: string): boolean {
  return (
    /(?:^|[./_-])(?:test|spec)s?(?:[./_-]|$)/iu.test(filePath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/iu.test(filePath)
  );
}

function basenameWithoutExtension(filePath: string): string {
  return path.basename(filePath).replace(/\.[^.]+$/u, "");
}

function fileRef(filePath: string, fileHash: string): string {
  return `repo-file://${filePath}#${fileHash.slice(0, 16)}`;
}

function relativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, path.resolve(rootDir, absolutePath)).replaceAll("\\", "/");
}

function trimLine(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 300);
}

function bounded(value: string, max: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
