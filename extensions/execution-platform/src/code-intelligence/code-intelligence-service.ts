import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  CodeIntelligenceBackendRegistry,
  createDefaultCodeIntelligenceBackendRegistry,
  type CodeIntelligenceBackendToolResult,
} from "./code-intelligence-backends.ts";
import type {
  CodeIntelligenceBackendHealth,
  CodeIntelligenceDiagnostic,
  CodeIntelligenceImportEdge,
  CodeIntelligenceLocation,
  CodeIntelligenceQuery,
  CodeIntelligenceRelatedTest,
  CodeIntelligenceResult,
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
const DEFAULT_MAX_FILES = 1_200;
const DEFAULT_LIMIT = 40;

type ParsedFile = {
  filePath: string;
  absolutePath: string;
  fileHash: string;
  content: string;
  lines: string[];
  symbols: CodeIntelligenceSymbol[];
  imports: CodeIntelligenceImportEdge[];
};

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

export type CodeIntelligenceServiceOptions = {
  rootDir: string;
  maxFiles?: number;
  semanticMode?: CodeIntelligenceSemanticMode;
  backendRegistry?: CodeIntelligenceBackendRegistry;
};

export class CodeIntelligenceService {
  private readonly rootDir: string;
  private readonly maxFiles: number;
  private readonly preferredSemanticMode: CodeIntelligenceSemanticMode;
  private readonly backendRegistry: CodeIntelligenceBackendRegistry;
  private fileCache: ParsedFile[] | null = null;
  private lastBackendHealth: CodeIntelligenceBackendHealth | null = null;
  private lastWorkspaceSnapshot: CodeIntelligenceWorkspaceSnapshot | null = null;
  private lastBackendResult: CodeIntelligenceBackendToolResult | null = null;

  constructor(options: CodeIntelligenceServiceOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
    this.preferredSemanticMode = options.semanticMode ?? "typescript_semantic";
    this.backendRegistry =
      options.backendRegistry ??
      createDefaultCodeIntelligenceBackendRegistry({
        rootDir: this.rootDir,
        maxFiles: this.maxFiles,
        semanticMode: this.preferredSemanticMode,
      });
  }

  async runTool(
    toolId: CodeIntelligenceRuntimeToolId,
    query: CodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const normalized = normalizeQuery(query);
    if (toolId === "code.backend_status") {
      return this.backendStatus(toolId);
    }
    if (this.preferredSemanticMode !== "structural") {
      const backend = this.backendRegistry.select({
        preferredSemanticMode: this.preferredSemanticMode,
        toolId,
      });
      const backendResult = await backend.runTool(toolId, query);
      if (backendResult.handled) {
        this.lastBackendHealth = backendResult.backendHealth;
        this.lastWorkspaceSnapshot = backendResult.workspaceSnapshot;
        this.lastBackendResult = backendResult;
        return this.result(toolId, backendResult);
      }
      this.lastBackendHealth = backendResult.backendHealth;
      this.lastWorkspaceSnapshot = backendResult.workspaceSnapshot;
      this.lastBackendResult = backendResult;
    } else {
      const backend = this.backendRegistry.select({ preferredSemanticMode: "structural", toolId });
      this.lastBackendHealth = await backend.health();
      this.lastWorkspaceSnapshot = await backend.workspaceSnapshot();
      this.lastBackendResult = null;
    }
    switch (toolId) {
      case "code.search_symbols":
        return this.searchSymbols(toolId, normalized);
      case "code.get_definition":
        return this.getDefinition(toolId, normalized);
      case "code.get_references":
        return this.getReferences(toolId, normalized);
      case "code.get_hover":
        return this.getHover(toolId, normalized);
      case "code.get_diagnostics":
        return this.getDiagnostics(toolId, normalized);
      case "code.get_document_symbols":
        return this.getDocumentSymbols(toolId, normalized);
      case "code.get_workspace_symbols":
        return this.searchSymbols(toolId, normalized);
      case "code.get_call_hierarchy":
        return this.getCallHierarchy(toolId, normalized);
      case "code.get_implementation":
        return this.getImplementation(toolId, normalized);
      case "code.plan_rename":
        return this.planRename(toolId, normalized);
      case "code.get_code_actions":
        return this.getCodeActions(toolId, normalized);
      case "code.find_related_tests":
        return this.findRelatedTests(toolId, normalized);
      case "code.resolve_import_graph":
        return this.resolveImportGraph(toolId, normalized);
      case "code.find_impact_radius":
        return this.findImpactRadius(toolId, normalized);
      case "code.summarize_file_structure":
        return this.summarizeFileStructure(toolId, normalized);
    }
    toolId satisfies never;
    throw new Error("unsupported_code_intelligence_tool");
  }

  private async searchSymbols(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const needle = (query.symbolName || query.query).toLowerCase();
    const files = await this.parsedFiles();
    const symbols = files
      .flatMap((file) => file.symbols)
      .filter((symbol) => !needle || symbol.name.toLowerCase().includes(needle))
      .slice(0, query.limit);
    return this.result(toolId, {
      summary: symbols.length
        ? `Found ${symbols.length} matching code symbols.`
        : "No matching code symbols found.",
      symbols,
      reasonCodes: [
        this.semanticModeReasonCode(),
        symbols.length ? "code_intelligence_symbols_found" : "code_intelligence_no_symbol_match",
      ],
      status: symbols.length ? "succeeded" : "needs_review",
    });
  }

  private async getDefinition(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const symbolName = query.symbolName || query.query;
    const files = await this.parsedFiles(query.filePath ? [query.filePath] : []);
    const symbols = files
      .flatMap((file) => file.symbols)
      .filter((symbol) => symbol.name === symbolName || symbol.name.includes(symbolName))
      .slice(0, query.limit);
    return this.result(toolId, {
      summary: symbols.length
        ? `Resolved ${symbols.length} structural definition candidate(s) for ${symbolName}.`
        : `No definition candidate found for ${symbolName}.`,
      symbols,
      locations: symbols,
      reasonCodes: [
        this.semanticModeReasonCode(),
        symbols.length
          ? "code_intelligence_definition_candidate_found"
          : "code_intelligence_definition_missing",
      ],
      status: symbols.length ? "succeeded" : "needs_review",
    });
  }

  private async getReferences(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const needle = query.symbolName || query.query || basenameWithoutExtension(query.filePath);
    const files = await this.parsedFiles();
    const locations = files
      .flatMap((file) =>
        file.lines.flatMap((lineText, index) =>
          lineContainsToken(lineText, needle)
            ? [
                {
                  filePath: file.filePath,
                  line: index + 1,
                  column: Math.max(1, lineText.indexOf(needle) + 1),
                  lineText: trimLine(lineText),
                  fileRef: fileRef(file.filePath, file.fileHash),
                  fileHash: file.fileHash,
                },
              ]
            : [],
        ),
      )
      .slice(0, query.limit);
    return this.result(toolId, {
      summary: locations.length
        ? `Found ${locations.length} structural reference candidate(s) for ${needle}.`
        : `No structural references found for ${needle}.`,
      locations,
      reasonCodes: [
        this.semanticModeReasonCode(),
        locations.length
          ? "code_intelligence_references_found"
          : "code_intelligence_references_missing",
      ],
      status: locations.length ? "succeeded" : "needs_review",
    });
  }

  private async getHover(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const definition = await this.getDefinition(toolId, query);
    const symbol = definition.symbols.at(0);
    return {
      ...definition,
      summary: symbol
        ? `${symbol.kind} ${symbol.name} defined in ${symbol.filePath}:${symbol.line}.`
        : definition.summary,
      metadata: {
        ...definition.metadata,
        hoverSummary: symbol ? `${symbol.kind} ${symbol.name}` : null,
      },
    };
  }

  private async getDiagnostics(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const files = await this.parsedFiles(
      query.filePaths.length ? query.filePaths : query.filePath ? [query.filePath] : [],
    );
    const diagnostics = files.flatMap((file) => structuralDiagnostics(file)).slice(0, query.limit);
    return this.result(toolId, {
      summary: diagnostics.length
        ? `Found ${diagnostics.length} structural diagnostic(s).`
        : "No structural diagnostics found.",
      diagnostics,
      reasonCodes: [
        this.semanticModeReasonCode(),
        diagnostics.length
          ? "code_intelligence_structural_diagnostics_found"
          : "code_intelligence_no_structural_diagnostics",
      ],
      status: "succeeded",
    });
  }

  private async getDocumentSymbols(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const files = await this.parsedFiles(
      query.filePaths.length ? query.filePaths : query.filePath ? [query.filePath] : [],
    );
    const symbols = files.flatMap((file) => file.symbols).slice(0, query.limit);
    return this.result(toolId, {
      summary: symbols.length
        ? `Summarized ${symbols.length} symbol(s) from ${files.length} file(s).`
        : "No document symbols found.",
      symbols,
      reasonCodes: [
        this.semanticModeReasonCode(),
        symbols.length
          ? "code_intelligence_document_symbols_found"
          : "code_intelligence_document_symbols_missing",
      ],
      status: symbols.length ? "succeeded" : "needs_review",
    });
  }

  private async getCallHierarchy(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const refs = await this.getReferences(toolId, query);
    return {
      ...refs,
      summary: refs.locations.length
        ? `Structural call/reference hierarchy has ${refs.locations.length} candidate edge(s).`
        : refs.summary,
      reasonCodes: [...refs.reasonCodes, "code_intelligence_call_hierarchy_structural"],
    };
  }

  private async getImplementation(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const needle = query.symbolName || query.query;
    const files = await this.parsedFiles();
    const symbols = files
      .flatMap((file) => file.symbols)
      .filter(
        (symbol) =>
          symbol.name.includes(needle) || symbol.lineText.includes(`implements ${needle}`),
      )
      .slice(0, query.limit);
    return this.result(toolId, {
      summary: symbols.length
        ? `Found ${symbols.length} structural implementation candidate(s).`
        : `No structural implementation candidates found for ${needle}.`,
      symbols,
      locations: symbols,
      reasonCodes: [
        this.semanticModeReasonCode(),
        symbols.length
          ? "code_intelligence_implementation_candidate_found"
          : "code_intelligence_implementation_missing",
      ],
      status: symbols.length ? "succeeded" : "needs_review",
    });
  }

  private async planRename(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const refs = await this.getReferences(toolId, query);
    return {
      ...refs,
      summary: `Rename plan for ${query.symbolName || query.query} to ${query.newName || "new_name"} touches ${refs.locations.length} bounded candidate location(s).`,
      reasonCodes: [...refs.reasonCodes, "code_intelligence_rename_plan_read_only"],
      metadata: {
        ...refs.metadata,
        newName: query.newName,
        editApplied: false,
      },
    };
  }

  private async getCodeActions(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const diagnostics = await this.getDiagnostics(toolId, query);
    const codeActions = diagnostics.diagnostics.map((diagnostic) => ({
      title: `Review ${diagnostic.diagnosticCode} in ${diagnostic.filePath}:${diagnostic.line}`,
      kind: "quickfix.review",
      targetRef: diagnostic.fileRef,
      summary: diagnostic.message,
    }));
    return {
      ...diagnostics,
      summary: codeActions.length
        ? `Produced ${codeActions.length} bounded structural code action(s).`
        : "No structural code actions needed.",
      codeActions,
      reasonCodes: [...diagnostics.reasonCodes, "code_intelligence_code_actions_structural"],
    };
  }

  private async findRelatedTests(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const files = await this.parsedFiles();
    const targetBase = basenameWithoutExtension(
      query.targetFilePath || query.filePath || query.query,
    );
    const relatedTests = files
      .filter((file) => isTestFile(file.filePath))
      .map((file): CodeIntelligenceRelatedTest | null => {
        const baseMatch = file.filePath.toLowerCase().includes(targetBase.toLowerCase());
        const importMatch =
          file.content.includes(targetBase) || file.content.includes(query.filePath || "");
        if (!baseMatch && !importMatch) {
          return null;
        }
        return {
          testFilePath: file.filePath,
          reason: baseMatch
            ? "test filename matches target basename"
            : "test references target path or symbol",
          confidence: baseMatch && importMatch ? "high" : baseMatch ? "medium" : "low",
          fileRef: fileRef(file.filePath, file.fileHash),
        };
      })
      .filter((test): test is CodeIntelligenceRelatedTest => Boolean(test))
      .slice(0, query.limit);
    return this.result(toolId, {
      summary: relatedTests.length
        ? `Found ${relatedTests.length} related test candidate(s).`
        : "No related tests found structurally.",
      relatedTests,
      reasonCodes: [
        this.semanticModeReasonCode(),
        relatedTests.length
          ? "code_intelligence_related_tests_found"
          : "code_intelligence_related_tests_missing",
      ],
      status: relatedTests.length ? "succeeded" : "needs_review",
    });
  }

  private async resolveImportGraph(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const files = await this.parsedFiles(
      query.filePaths.length ? query.filePaths : query.filePath ? [query.filePath] : [],
    );
    const importGraph = files.flatMap((file) => file.imports).slice(0, query.limit);
    return this.result(toolId, {
      summary: importGraph.length
        ? `Resolved ${importGraph.length} structural import edge(s).`
        : "No local import edges found.",
      importGraph,
      reasonCodes: [
        this.semanticModeReasonCode(),
        importGraph.length
          ? "code_intelligence_import_graph_found"
          : "code_intelligence_import_graph_empty",
      ],
      status: "succeeded",
    });
  }

  private async findImpactRadius(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const refs = await this.getReferences(toolId, {
      ...query,
      query:
        query.targetSymbol ||
        query.symbolName ||
        basenameWithoutExtension(query.targetFilePath || query.filePath),
    });
    const relatedTests = await this.findRelatedTests("code.find_related_tests", query);
    return {
      ...refs,
      summary: `Impact radius has ${refs.locations.length} reference candidate(s) and ${relatedTests.relatedTests.length} related test candidate(s).`,
      relatedTests: relatedTests.relatedTests,
      reasonCodes: [...refs.reasonCodes, "code_intelligence_impact_radius_structural"],
    };
  }

  private async summarizeFileStructure(
    toolId: CodeIntelligenceRuntimeToolId,
    query: NormalizedCodeIntelligenceQuery,
  ): Promise<CodeIntelligenceResult> {
    const files = await this.parsedFiles(
      query.filePaths.length ? query.filePaths : query.filePath ? [query.filePath] : [],
    );
    const symbols = files.flatMap((file) => file.symbols).slice(0, query.limit);
    const importGraph = files.flatMap((file) => file.imports).slice(0, query.limit);
    return this.result(toolId, {
      summary: `Summarized ${files.length} file(s), ${symbols.length} symbol(s), and ${importGraph.length} import edge(s).`,
      symbols,
      importGraph,
      reasonCodes: [this.semanticModeReasonCode(), "code_intelligence_file_structure_summarized"],
      status: files.length ? "succeeded" : "needs_review",
    });
  }

  private async backendStatus(
    toolId: CodeIntelligenceRuntimeToolId,
  ): Promise<CodeIntelligenceResult> {
    const backend = this.backendRegistry.select({
      preferredSemanticMode: this.preferredSemanticMode,
      toolId: "code.search_symbols",
    });
    const health = await backend.health();
    const snapshot = await backend.workspaceSnapshot();
    this.lastBackendHealth = health;
    this.lastWorkspaceSnapshot = snapshot;
    this.lastBackendResult = {
      handled: true,
      status: health.state === "failed" || health.state === "stale" ? "needs_review" : "succeeded",
      summary: `Code intelligence backend ${health.backendId} is ${health.state} in ${health.semanticMode} mode.`,
      reasonCodes: [
        health.semanticMode === "structural"
          ? "code_intelligence_structural_mode_used"
          : `code_intelligence_${health.semanticMode}_used`,
        `code_intelligence_backend_state:${health.state}`,
      ],
      semanticMode: health.semanticMode,
      backendId: health.backendId,
      backendHealth: health,
      workspaceSnapshot: snapshot,
      semanticConfidence: health.semanticMode === "structural" ? "low" : "high",
      fallbackUsed: health.semanticMode === "structural",
      fallbackReasonCodes:
        health.semanticMode === "structural" ? ["code_intelligence_structural_fallback_used"] : [],
      diagnosticVersionRef: `code-intelligence-diagnostics://${snapshot.workspaceFingerprint}`,
      projectConfigRefs: snapshot.projectConfigRefs,
      limitations: health.limitations,
      staleRefBlockers: [],
      backendLatencyMs: health.startupLatencyMs ?? 0,
    };
    return this.result(toolId, this.lastBackendResult);
  }

  private async parsedFiles(requestedFilePaths: string[] = []): Promise<ParsedFile[]> {
    if (requestedFilePaths.length > 0) {
      const files = await Promise.all(
        requestedFilePaths.map((filePath) => this.parseFile(filePath)),
      );
      return files.filter((file): file is ParsedFile => Boolean(file));
    }
    if (this.fileCache) {
      return this.fileCache;
    }
    const filePaths = await this.listCodeFiles();
    const parsed = await Promise.all(
      filePaths.slice(0, this.maxFiles).map((filePath) => this.parseFile(filePath)),
    );
    this.fileCache = parsed.filter((file): file is ParsedFile => Boolean(file));
    return this.fileCache;
  }

  private async listCodeFiles(): Promise<string[]> {
    const results: string[] = [];
    const visit = async (dir: string): Promise<void> => {
      if (results.length >= this.maxFiles) {
        return;
      }
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (results.length >= this.maxFiles) {
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
          results.push(relativePath(this.rootDir, absolutePath));
        }
      }
    };
    await visit(this.rootDir);
    return results.toSorted();
  }

  private async parseFile(inputPath: string): Promise<ParsedFile | null> {
    const absolutePath = this.resolvePath(inputPath);
    if (!absolutePath) {
      return null;
    }
    const stat = await lstat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) {
      return null;
    }
    const content = await readFile(absolutePath, "utf8").catch(() => null);
    if (content === null) {
      return null;
    }
    const rel = relativePath(this.rootDir, absolutePath);
    const fileHashValue = hashString(content);
    const lines = content.split(/\r?\n/u);
    return {
      filePath: rel,
      absolutePath,
      fileHash: fileHashValue,
      content,
      lines,
      symbols: parseSymbols({ filePath: rel, fileHash: fileHashValue, lines }),
      imports: parseImports({
        rootDir: this.rootDir,
        filePath: rel,
        fileHash: fileHashValue,
        lines,
      }),
    };
  }

  private resolvePath(inputPath: string): string | null {
    const clean = inputPath.replace(/^file:\/\//u, "").replace(/^\.\//u, "");
    const absolutePath = path.resolve(this.rootDir, clean);
    return absolutePath.startsWith(this.rootDir) ? absolutePath : null;
  }

  private result(
    toolId: CodeIntelligenceRuntimeToolId,
    input: {
      summary: string;
      status: "succeeded" | "needs_review";
      reasonCodes: string[];
      semanticMode?: CodeIntelligenceSemanticMode;
      backendId?: string;
      backendHealth?: CodeIntelligenceBackendHealth;
      workspaceSnapshot?: CodeIntelligenceWorkspaceSnapshot;
      semanticConfidence?: "high" | "medium" | "low";
      fallbackUsed?: boolean;
      fallbackReasonCodes?: string[];
      diagnosticVersionRef?: string | null;
      projectConfigRefs?: string[];
      limitations?: string[];
      staleRefBlockers?: string[];
      backendLatencyMs?: number | null;
      symbols?: CodeIntelligenceSymbol[];
      locations?: CodeIntelligenceLocation[];
      diagnostics?: CodeIntelligenceDiagnostic[];
      importGraph?: CodeIntelligenceImportEdge[];
      relatedTests?: CodeIntelligenceRelatedTest[];
      codeActions?: Array<{ title: string; kind: string; targetRef: string; summary: string }>;
      metadata?: Record<string, JsonValue>;
    },
  ): CodeIntelligenceResult {
    const semanticMode = input.semanticMode ?? "structural";
    const backendId =
      input.backendId ??
      (semanticMode === "structural" ? "structural_parser" : "typescript_language_service");
    const workspaceSnapshot = input.workspaceSnapshot ?? this.lastWorkspaceSnapshot;
    const backendHealth = input.backendHealth ?? this.lastBackendHealth;
    const fallbackUsed = input.fallbackUsed ?? semanticMode === "structural";
    const fallbackReasonCodes =
      input.fallbackReasonCodes ??
      (fallbackUsed ? ["code_intelligence_structural_fallback_used"] : []);
    const symbols = (input.symbols ?? []).slice(0, DEFAULT_LIMIT);
    const locations = (input.locations ?? []).slice(0, DEFAULT_LIMIT);
    const diagnostics = (input.diagnostics ?? []).slice(0, DEFAULT_LIMIT);
    const importGraph = (input.importGraph ?? []).slice(0, DEFAULT_LIMIT);
    const relatedTests = (input.relatedTests ?? []).slice(0, DEFAULT_LIMIT);
    const codeActions = (input.codeActions ?? []).slice(0, DEFAULT_LIMIT);
    const queriedFileRefs = [
      ...new Set([
        ...symbols.map((symbol) => symbol.fileRef),
        ...locations.map((location) => location.fileRef),
        ...diagnostics.map((diagnostic) => diagnostic.fileRef),
        ...relatedTests.map((test) => test.fileRef),
      ]),
    ].slice(0, DEFAULT_LIMIT);
    const symbolRefs = symbols.map((symbol) => symbolRef(symbol)).slice(0, DEFAULT_LIMIT);
    const diagnosticRefs = diagnostics
      .map((diagnostic) => diagnosticRef(diagnostic))
      .slice(0, DEFAULT_LIMIT);
    const relatedTestRefs = relatedTests.map((test) => test.fileRef).slice(0, DEFAULT_LIMIT);
    const impactRefs = [
      ...new Set([...locations.map((location) => location.fileRef), ...relatedTestRefs]),
    ].slice(0, DEFAULT_LIMIT);
    const outputHash = hashString(
      JSON.stringify({
        toolId,
        semanticMode,
        backendId,
        summary: input.summary,
        symbolRefs,
        diagnosticRefs,
        relatedTestRefs,
        impactRefs,
      }),
    );
    return {
      artifactKind: "code_intelligence_result",
      toolId,
      status: input.status,
      semanticMode,
      backendId,
      backendHealthRef:
        backendHealth?.backendHealthRef ??
        `code-intelligence-backend-health://${backendId}/${hashString(backendId).slice(0, 16)}`,
      workspaceSnapshotRef:
        workspaceSnapshot?.workspaceSnapshotRef ??
        `code-intelligence-workspace://${hashString(this.rootDir).slice(0, 16)}`,
      semanticConfidence:
        input.semanticConfidence ?? (semanticMode === "structural" ? "low" : "medium"),
      fallbackUsed,
      fallbackReasonCodes: [...new Set(fallbackReasonCodes)].slice(0, 20),
      diagnosticVersionRef:
        input.diagnosticVersionRef ??
        (workspaceSnapshot
          ? `code-intelligence-diagnostics://${workspaceSnapshot.workspaceFingerprint}`
          : null),
      projectConfigRefs: [
        ...new Set(input.projectConfigRefs ?? workspaceSnapshot?.projectConfigRefs ?? []),
      ].slice(0, 20),
      limitations: [
        ...new Set(
          input.limitations ??
            (semanticMode === "structural"
              ? ["Structural parser is degraded mode and is not semantic parity."]
              : []),
        ),
      ].slice(0, 20),
      backendLatencyMs: input.backendLatencyMs ?? null,
      resultCounts: {
        symbols: symbols.length,
        locations: locations.length,
        diagnostics: diagnostics.length,
        importEdges: importGraph.length,
        relatedTests: relatedTests.length,
        codeActions: codeActions.length,
      },
      summary: input.summary.slice(0, 1_200),
      outputRef: `code-intelligence://${toolId}/${outputHash}`,
      outputHash,
      reasonCodes: [...new Set(input.reasonCodes)].slice(0, 20),
      queriedFileRefs,
      symbolRefs,
      diagnosticRefs,
      relatedTestRefs,
      impactRefs,
      staleRefBlockers: [...new Set(input.staleRefBlockers ?? [])].slice(0, 20),
      symbols,
      locations,
      diagnostics,
      importGraph,
      relatedTests,
      codeActions,
      metadata: {
        ...input.metadata,
        semanticMode,
        backendId,
        backendHealthRef:
          backendHealth?.backendHealthRef ??
          `code-intelligence-backend-health://${backendId}/${hashString(backendId).slice(0, 16)}`,
        backendState:
          backendHealth?.state ?? (semanticMode === "structural" ? "degraded_structural" : null),
        backendWarmupState: backendHealth?.warmupState ?? null,
        workspaceSnapshotRef:
          workspaceSnapshot?.workspaceSnapshotRef ??
          `code-intelligence-workspace://${hashString(this.rootDir).slice(0, 16)}`,
        semanticConfidence:
          input.semanticConfidence ?? (semanticMode === "structural" ? "low" : "medium"),
        fallbackUsed,
        fallbackReasonCodes: [...new Set(fallbackReasonCodes)].slice(0, 20),
        diagnosticVersionRef:
          input.diagnosticVersionRef ??
          (workspaceSnapshot
            ? `code-intelligence-diagnostics://${workspaceSnapshot.workspaceFingerprint}`
            : null),
        projectConfigRefs: [
          ...new Set(input.projectConfigRefs ?? workspaceSnapshot?.projectConfigRefs ?? []),
        ].slice(0, 20),
        staleRefBlockers: [...new Set(input.staleRefBlockers ?? [])].slice(0, 20),
        limitations: [
          ...new Set(
            input.limitations ??
              (semanticMode === "structural"
                ? ["Structural parser is degraded mode and is not semantic parity."]
                : []),
          ),
        ].slice(0, 20),
        backendLatencyMs: input.backendLatencyMs ?? null,
        resultCounts: {
          symbols: symbols.length,
          locations: locations.length,
          diagnostics: diagnostics.length,
          importEdges: importGraph.length,
          relatedTests: relatedTests.length,
          codeActions: codeActions.length,
        },
        structuralModeDisclosure:
          semanticMode === "structural"
            ? "LSP/TypeScript semantic server not attached; result is bounded structural analysis."
            : null,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };
  }

  private semanticModeReasonCode(): string {
    return "code_intelligence_structural_mode_used";
  }
}

export function createCodeIntelligenceService(
  options: CodeIntelligenceServiceOptions,
): CodeIntelligenceService {
  return new CodeIntelligenceService(options);
}

function normalizeQuery(query: CodeIntelligenceQuery): NormalizedCodeIntelligenceQuery {
  const limit = Math.max(1, Math.min(200, query.limit ?? DEFAULT_LIMIT));
  const filePaths = Array.isArray(query.filePaths)
    ? query.filePaths.filter((filePath): filePath is string => typeof filePath === "string")
    : [];
  return {
    query: query.query ?? "",
    symbolName: query.symbolName ?? "",
    filePath: query.filePath ?? "",
    filePaths,
    targetFilePath: query.targetFilePath ?? "",
    targetSymbol: query.targetSymbol ?? "",
    newName: query.newName ?? "",
    limit,
  };
}

function parseSymbols(input: {
  filePath: string;
  fileHash: string;
  lines: string[];
}): CodeIntelligenceSymbol[] {
  const symbols: CodeIntelligenceSymbol[] = [];
  const push = (
    lineText: string,
    lineIndex: number,
    name: string,
    kind: CodeIntelligenceSymbolKind,
  ): void => {
    symbols.push({
      filePath: input.filePath,
      line: lineIndex + 1,
      column: Math.max(1, lineText.indexOf(name) + 1),
      lineText: trimLine(lineText),
      fileRef: fileRef(input.filePath, input.fileHash),
      fileHash: input.fileHash,
      name,
      kind,
      containerName: null,
    });
  };
  input.lines.forEach((lineText, index) => {
    const trimmed = lineText.trim();
    const matchers: Array<[RegExp, CodeIntelligenceSymbolKind]> = [
      [/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/u, "class"],
      [/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/u, "interface"],
      [/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/u, "type"],
      [/^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/u, "enum"],
      [/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/u, "function"],
      [/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/u, "const"],
      [
        /^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/u,
        "method",
      ],
    ];
    for (const [regex, kind] of matchers) {
      const match = trimmed.match(regex);
      if (match?.[1]) {
        push(lineText, index, match[1], kind);
        return;
      }
    }
    const exported = trimmed.match(/^export\s+\{\s*([^}]+)\s*\}/u);
    if (exported?.[1]) {
      for (const name of exported[1].split(",").map((item) =>
        item
          .trim()
          .split(/\s+as\s+/u)
          .at(0)
          ?.trim(),
      )) {
        if (name) {
          push(lineText, index, name, "export");
        }
      }
    }
  });
  return symbols;
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

function structuralDiagnostics(file: ParsedFile): CodeIntelligenceDiagnostic[] {
  const diagnostics: CodeIntelligenceDiagnostic[] = [];
  const checks: Array<[string, string, string]> = [
    ["(", ")", "unbalanced_parentheses"],
    ["{", "}", "unbalanced_braces"],
    ["[", "]", "unbalanced_brackets"],
  ];
  for (const [open, close, code] of checks) {
    const delta = countChar(file.content, open) - countChar(file.content, close);
    if (delta !== 0) {
      diagnostics.push({
        filePath: file.filePath,
        line: 1,
        column: 1,
        lineText: "file structural balance check",
        fileRef: fileRef(file.filePath, file.fileHash),
        fileHash: file.fileHash,
        severity: "warning",
        message: `Structural parser found ${Math.abs(delta)} unmatched ${delta > 0 ? open : close} character(s).`,
        diagnosticCode: code,
      });
    }
  }
  return diagnostics;
}

function resolveLocalImport(
  rootDir: string,
  fromFilePath: string,
  specifier: string,
): string | null {
  const fromDir = path.dirname(path.join(rootDir, fromFilePath));
  const base = path.resolve(fromDir, specifier);
  const candidates = [
    base,
    ...[...CODE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...CODE_EXTENSIONS].map((extension) => path.join(base, `index${extension}`)),
  ];
  const match = candidates.find(
    (candidate) => candidate.startsWith(rootDir) && existsSync(candidate),
  );
  return match ? relativePath(rootDir, match) : null;
}

function lineContainsToken(lineText: string, token: string): boolean {
  if (!token) {
    return false;
  }
  return new RegExp(`\\b${escapeRegex(token)}\\b`, "u").test(lineText);
}

function isTestFile(filePath: string): boolean {
  return /(?:__tests__|\.test\.|\.spec\.)/u.test(filePath);
}

function basenameWithoutExtension(filePath: string): string {
  return path.basename(filePath || "", path.extname(filePath || ""));
}

function fileRef(filePath: string, fileHashValue: string): string {
  return `repo-file://${filePath}#${fileHashValue.slice(0, 16)}`;
}

function symbolRef(symbol: CodeIntelligenceSymbol): string {
  return `code-symbol://${symbol.filePath}:${symbol.line}:${symbol.name}`;
}

function diagnosticRef(diagnostic: CodeIntelligenceDiagnostic): string {
  return `code-diagnostic://${diagnostic.filePath}:${diagnostic.line}:${diagnostic.diagnosticCode}`;
}

function relativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).replaceAll(path.sep, "/");
}

function trimLine(lineText: string): string {
  return lineText.trim().slice(0, 240);
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
